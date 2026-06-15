/**
 * 怪物模块
 *
 * 纯逻辑，不依赖任何平台 API。
 *
 * 职责：
 *   1. Monster 类（状态机 + 位置/朝向/属性）
 *   2. 感知系统（扇形范围检测 + 三种探测模式）
 *   3. Manager（生成、更新所有怪物）
 */

import { CELL } from '../maze/types.js';

// ─────── 常量 ───────

/** 怪物朝向（0=上, 1=右, 2=下, 3=左） */
export const DIR = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 };

/** 怪物状态机 */
export const MONSTER_STATE = {
    PATROL: 'patrol',               // 巡逻中，放松状态
    INVESTIGATE: 'investigate',     // 听到声音，前往调查
    TRACK: 'track',                 // 警觉，快速追踪玩家
    ATTACK: 'attack',               // 察觉，直接攻击！(当前仅标识，攻击表现待实现)
    STUNNED: 'stunned',             // 被美食吸引，暂时停留
};

/** 默认感知范围配置（各怪物类型可覆写） */
const DEFAULT_PERCEPTION = {
    hearing: { angle: 120, range: 7 },   // 听觉
    alert:   { angle: 120, range: 4 },   // 警觉
    detect:  { angle: 90,  range: 2 },   // 察觉
};

/** tile 索引 → 怪物类型映射 */
const TILE_TO_TYPE = {
    109: 'patrol',     // 独眼光头人 → 基础巡逻兵
    111: 'elite',      // 邪恶魔法师 → 精英
    120: 'fast',       // 小蝙蝠 → 快速
    121: 'ghost',      // 白色幽灵 → 穿墙
};

// ─────── 扇形检测工具 ───────

/**
 * 检查目标是否在怪物的扇形感知范围内
 *
 * @param {number} mx       - 怪物网格 X
 * @param {number} my       - 怪物网格 Y
 * @param {number} facing   - 怪物朝向 (DIR.*)
 * @param {number} tx       - 目标网格 X
 * @param {number} ty       - 目标网格 Y
 * @param {number} fovAngle - 扇形角度（度）
 * @param {number} maxRange - 最大检测距离（格）
 * @returns {boolean}
 */
function isInSector(mx, my, facing, tx, ty, fovAngle, maxRange) {
    const dx = tx - mx;
    const dy = ty - my;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxRange) return false;

    // 将 facing 转换为弧度（面向方向）
    const facingRad = facing * Math.PI / 2 - Math.PI / 2; // 0→-π/2(上), 1→0(右), 2→π/2(下), 3→π(左)
    // 计算目标方向角度
    let targetRad = Math.atan2(dy, dx);

    // 计算夹角（处理环绕）
    let diff = targetRad - facingRad;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    return Math.abs(diff) <= (fovAngle / 2) * Math.PI / 180;
}

// ─────── Monster 类 ───────

export class Monster {
    /**
     * @param {Object} config
     * @param {string} config.id      - 唯一标识
     * @param {number} config.tileIndex - 使用的 tile 编号（109/111/120/121）
     * @param {number} config.gridX   - 网格 X
     * @param {number} config.gridY   - 网格 Y
     * @param {number} [config.facing=DIR.DOWN] - 初始朝向
     * @param {number[][]} config.grid - 地图网格引用
     * @param {number} config.gridCols - 地图列数
     * @param {number} config.gridRows - 地图行数
     * @param {Object} [config.perception]  - 感知范围覆写
     * @param {Array<{x:number, y:number}>} [config.patrolPath] - 巡逻路径，为空则随机游荡
     * @param {number} [config.moveInterval=800] - 移动间隔（毫秒）
     */
    constructor(config) {
        this.id = config.id;
        this.tileIndex = config.tileIndex;
        this.type = TILE_TO_TYPE[config.tileIndex] || 'patrol';
        this.gridX = config.gridX;
        this.gridY = config.gridY;
        this.facing = config.facing ?? DIR.DOWN;
        this.grid = config.grid;
        this.gridCols = config.gridCols;
        this.gridRows = config.gridRows;

        // 感知范围
        const per = { ...DEFAULT_PERCEPTION, ...config.perception };
        this.hearingRange  = per.hearing?.range  ?? DEFAULT_PERCEPTION.hearing.range;
        this.hearingAngle  = per.hearing?.angle  ?? DEFAULT_PERCEPTION.hearing.angle;
        this.alertRange    = per.alert?.range    ?? DEFAULT_PERCEPTION.alert.range;
        this.alertAngle    = per.alert?.angle    ?? DEFAULT_PERCEPTION.alert.angle;
        this.detectRange   = per.detect?.range   ?? DEFAULT_PERCEPTION.detect.range;
        this.detectAngle   = per.detect?.angle   ?? DEFAULT_PERCEPTION.detect.angle;

        // 连续像素移动属性（pixelX/Y 为连续格坐标，0=格左边缘，gridX=3 → pixelX=3.0）
        this.pixelX = config.gridX;
        this.pixelY = config.gridY;
        this.moveInterval = config.moveInterval ?? 800; // 毫秒（决定速度）
        this.moveSpeed = 1000 / this.moveInterval;     // 格/秒

        // 路径寻路（A* 路径点列表）
        this._path = [];            // [{x,y}, ...]
        this._pathIndex = 0;        // 当前路径点索引
        this._pathTimer = 0;        // 路径重计算计时器
        this._pathRecalcInterval = 800; // 每 N ms 重新寻路
        this._isStuck = false;      // 是否卡住（触发重寻路）

        // 巡逻
        this.patrolPath = config.patrolPath || [];
        this._patrolIndex = 0;
        this._randomTarget = null;  // 随机游走目标 {x, y}

        // 状态机
        this.state = MONSTER_STATE.PATROL;
        this._stateTimer = 0;            // 当前状态已持续 ms
        this._investigateTarget = null;  // { x, y } 调查目标点

        // 特殊标记（已废弃 — 所有怪物均不可穿墙）
        this.ghostPassWall = false;

        // 平滑朝向插值（弧度，用于渲染层）
        this._renderFacingRad = this.facing * Math.PI / 2 - Math.PI / 2;

        // 感知结果缓存（用于外部渲染等）
        this.lastDetection = {
            hearing: false,
            alert: false,
            detect: false,
        };
    }

    /**
     * 每帧更新
     * @param {number} dt - 帧间隔 ms
     * @param {number} playerGX - 玩家网格 X
     * @param {number} playerGY - 玩家网格 Y
     * @param {number} noiseSource - 噪音源 { x, y } 或 null
     * @param {boolean} [stealthActive=false] - 玩家是否隐身
     * @param {number} [noiseLevel=1] - 玩家噪音倍率（0=无声, 1=正常, 1.5=奔跑）
     * @param {Array<{x:number,y:number}>} [meatPositions] - 肉陷阱位置列表
     */
    update(dt, playerGX, playerGY, noiseSource, stealthActive = false, noiseLevel = 1, meatPositions) {
        this._stateTimer += dt;

        // 0. 连续像素位置更新（每帧向目标移动）
        this._updatePosition(dt);
        // 逻辑坐标从像素位置派生（pixelX=3.5=格左边缘偏移0.5 → floor=3）
        this.gridX = Math.floor(this.pixelX);
        this.gridY = Math.floor(this.pixelY);

        // 0.5 平滑朝向插值（朝向离散 facing 的连续弧度，用于渲染）
        {
            const targetRad = this.facing * Math.PI / 2 - Math.PI / 2;
            let diff = targetRad - this._renderFacingRad;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            // 250ms 完成转向（追踪状态 150ms 更快响应）
            const turnSpeed = this.state === MONSTER_STATE.TRACK || this.state === MONSTER_STATE.ATTACK ? 150 : 250;
            this._renderFacingRad += diff * Math.min(1, dt / turnSpeed);
            if (Math.abs(diff) < 0.01) this._renderFacingRad = targetRad;
        }

        // 0.8 肉陷阱检测
        if (meatPositions && this.state !== MONSTER_STATE.STUNNED) {
            for (const mp of meatPositions) {
                if (mp.x === this.gridX && mp.y === this.gridY) {
                    this._transitionTo(MONSTER_STATE.STUNNED);
                    break;
                }
            }
        }

        // 1. 感知检测
        this._detectPlayer(playerGX, playerGY, noiseSource, stealthActive, noiseLevel);

        // 2. 状态转移
        this._updateState(dt, playerGX, playerGY);

        // 3. 移动决策与路径管理
        this._updateMovement(dt, playerGX, playerGY);
    }

    /**
     * 重置为巡逻状态
     */
    resetToPatrol() {
        this.state = MONSTER_STATE.PATROL;
        this._stateTimer = 0;
        this._investigateTarget = null;
    }

    // ─────── 感知 ───────

    _detectPlayer(playerGX, playerGY, noiseSource, stealthActive = false, noiseLevel = 1) {
        const px = playerGX;
        const py = playerGY;

        // 计算与玩家的距离和扇形检测
        let inDetect = isInSector(this.gridX, this.gridY, this.facing, px, py, this.detectAngle, this.detectRange);
        let inAlert  = isInSector(this.gridX, this.gridY, this.facing, px, py, this.alertAngle, this.alertRange);
        // 听觉范围受玩家噪音倍率影响
        const effectiveHearingRange = this.hearingRange * noiseLevel;
        const inHearing = isInSector(this.gridX, this.gridY, this.facing, px, py, this.hearingAngle, effectiveHearingRange);

        // 隐身处检查：屏蔽视觉检测（警觉+察觉），但听觉仍有效
        if (stealthActive) {
            inDetect = false;
            inAlert = false;
        }

        this.lastDetection = {
            hearing: inHearing,
            alert: inAlert,
            detect: inDetect,
        };

        // 噪音源：如果有石块等噪音且玩家不在感知范围内，仍可能触发调查
        if (noiseSource && !inDetect && !inAlert) {
            const noiseDist = Math.sqrt(
                (noiseSource.x - this.gridX) ** 2 + (noiseSource.y - this.gridY) ** 2
            );
            if (noiseDist <= this.hearingRange) {
                // 听到声音 → 前往调查
                if (this.state === MONSTER_STATE.PATROL) {
                    this.state = MONSTER_STATE.INVESTIGATE;
                    this._investigateTarget = { x: noiseSource.x, y: noiseSource.y };
                    this._stateTimer = 0;
                }
            }
        }

        return this.lastDetection;
    }

    // ─────── 状态机 ───────

    _updateState(dt, playerGX, playerGY) {
        const { detect, alert, hearing } = this.lastDetection;

        switch (this.state) {
            case MONSTER_STATE.PATROL:
                if (detect) {
                    this._transitionTo(MONSTER_STATE.ATTACK);
                } else if (alert) {
                    this._transitionTo(MONSTER_STATE.TRACK);
                } else if (hearing) {
                    // 听到声音 → 往大致方向调查（带随机偏移，非精确玩家位置）
                    const offsetX = Math.floor(Math.random() * 7) - 3; // -3 ~ +3
                    const offsetY = Math.floor(Math.random() * 7) - 3;
                    this._transitionTo(MONSTER_STATE.INVESTIGATE, {
                        x: Math.max(1, Math.min(this.gridCols - 2, playerGX + offsetX)),
                        y: Math.max(1, Math.min(this.gridRows - 2, playerGY + offsetY))
                    });
                }
                break;

            case MONSTER_STATE.INVESTIGATE:
                if (detect) {
                    this._transitionTo(MONSTER_STATE.ATTACK);
                } else if (alert) {
                    this._transitionTo(MONSTER_STATE.TRACK);
                } else if (this._stateTimer > 5000) {
                    // 调查超时 → 回到巡逻
                    this._transitionTo(MONSTER_STATE.PATROL);
                }
                break;

            case MONSTER_STATE.TRACK:
                if (detect) {
                    this._transitionTo(MONSTER_STATE.ATTACK);
                } else if (!alert && !hearing && this._stateTimer > 3000) {
                    // 丢失目标 3 秒 → 回到调查（最后已知位置）
                    this._transitionTo(MONSTER_STATE.INVESTIGATE, { x: playerGX, y: playerGY });
                }
                break;

            case MONSTER_STATE.ATTACK:
                if (!detect && !alert) {
                    this._transitionTo(MONSTER_STATE.TRACK);
                }
                break;

            case MONSTER_STATE.STUNNED:
                if (this._stateTimer > 4000) {
                    this._transitionTo(MONSTER_STATE.PATROL);
                }
                break;
        }
    }

    _transitionTo(newState, investigateTarget) {
        this.state = newState;
        this._stateTimer = 0;
        if (investigateTarget) {
            this._investigateTarget = investigateTarget;
        }
    }

    // ─────── 移动 ───────

    /**
     * 每帧连续像素位置更新
     * 沿 _path 向 _currentTarget 移动
     */
    _updatePosition(dt) {
        if (!this._currentTarget || this.state === MONSTER_STATE.STUNNED) return;

        const tx = this._currentTarget.x + 0.5; // 目标格中心 X
        const ty = this._currentTarget.y + 0.5; // 目标格中心 Y
        const dx = tx - this.pixelX;
        const dy = ty - this.pixelY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const step = this.moveSpeed * (dt / 1000); // 本帧移动距离（格）

        if (dist <= step) {
            // 到达当前目标格中心
            this.pixelX = tx;
            this.pixelY = ty;
            this._currentTarget = null;
            // 若有路径，取下一个路径点
            if (this._path.length > 0) {
                this._advancePath();
            }
        } else {
            // 向目标移动（含碰撞检测）
            const nx = dx / dist;
            const ny = dy / dist;
            this._tryMove(nx, ny, step);
        }
    }

    /**
     * 尝试沿方向 (nx, ny) 移动 step 距离
     * 支持沿墙滑动（分别尝试 X/Y）
     */
    _tryMove(dx, dy, step) {
        const newPX = this.pixelX + dx * step;
        const newPY = this.pixelY + dy * step;
        const newGX = Math.floor(newPX);
        const newGY = Math.floor(newPY);

        // 同时移动 X+Y
        if (this._canMoveTo(newGX, newGY)) {
            this.pixelX = newPX;
            this.pixelY = newPY;
            // 更新 facing 为移动方向
            this.facing = this._vectorToDir(dx, dy);
            return;
        }

        // 尝试仅水平移动
        const horizGX = Math.floor(newPX);
        if (horizGX !== this.gridX && this._canMoveTo(horizGX, this.gridY)) {
            this.pixelX = newPX;
            this.facing = dx > 0 ? DIR.RIGHT : (dx < 0 ? DIR.LEFT : this.facing);
            return;
        }

        // 尝试仅垂直移动
        const vertGY = Math.floor(newPY);
        if (vertGY !== this.gridY && this._canMoveTo(this.gridX, vertGY)) {
            this.pixelY = newPY;
            this.facing = dy > 0 ? DIR.DOWN : (dy < 0 ? DIR.UP : this.facing);
            return;
        }

        // 完全卡住
        this._isStuck = true;
    }

    /** 方向向量 → 最近的 DIR */
    _vectorToDir(dx, dy) {
        if (Math.abs(dx) > Math.abs(dy)) {
            return dx > 0 ? DIR.RIGHT : DIR.LEFT;
        } else {
            return dy > 0 ? DIR.DOWN : DIR.UP;
        }
    }

    /** 取路径中的下一个目标 */
    _advancePath() {
        this._pathIndex++;
        if (this._pathIndex < this._path.length) {
            this._currentTarget = this._path[this._pathIndex];
        } else {
            this._path = [];
            this._pathIndex = 0;
            this._currentTarget = null;
        }
    }

    _updateMovement(dt, playerGX, playerGY) {
        // 被眩晕 → 不移动
        if (this.state === MONSTER_STATE.STUNNED) {
            // 清除路径/目标
            this._path = [];
            this._currentTarget = null;
            this._pathIndex = 0;
            return;
        }

        // 路径计时器
        this._pathTimer += dt;

        // 根据状态决定是否需要更新路径
        let needNewPath = false;
        let targetX = null;
        let targetY = null;

        switch (this.state) {
            case MONSTER_STATE.PATROL:
                if (this.patrolPath.length > 0) {
                    // 巡逻路径
                    const wp = this.patrolPath[this._patrolIndex];
                    targetX = wp.x;
                    targetY = wp.y;
                    // 到达巡逻点后切换到下一个
                    if (this.gridX === targetX && this.gridY === targetY) {
                        this._patrolIndex = (this._patrolIndex + 1) % this.patrolPath.length;
                        needNewPath = true;
                    } else if (this._path.length === 0 && !this._currentTarget) {
                        needNewPath = true;
                    } else if (this._isStuck || this._pathTimer >= this._pathRecalcInterval * 2) {
                        needNewPath = true;
                    }
                } else {
                    // 随机游走
                    if (!this._randomTarget ||
                        (Math.abs(this.gridX - this._randomTarget.x) + Math.abs(this.gridY - this._randomTarget.y) < 2) ||
                        this._isStuck ||
                        this._pathTimer >= this._pathRecalcInterval * 3) {
                        this._pickRandomPatrolTarget();
                        targetX = this._randomTarget.x;
                        targetY = this._randomTarget.y;
                        needNewPath = true;
                    } else {
                        targetX = this._randomTarget.x;
                        targetY = this._randomTarget.y;
                        if (this._path.length === 0 && !this._currentTarget) {
                            needNewPath = true;
                        }
                    }
                }
                // 巡逻时固定路径只定期重算
                break;

            case MONSTER_STATE.INVESTIGATE:
                if (this._investigateTarget) {
                    targetX = this._investigateTarget.x;
                    targetY = this._investigateTarget.y;
                    // 到达调查点 → 回到巡逻
                    if (this.gridX === targetX && this.gridY === targetY) {
                        this._transitionTo(MONSTER_STATE.PATROL);
                        this._path = [];
                        this._currentTarget = null;
                        return;
                    }
                    // 贪婪移动（非 A*），更像是"探索声音方向"
                    if (!this._currentTarget) {
                        this._moveToward(targetX, targetY);
                    }
                    // 卡住 → 随机走一步再试
                    if (this._isStuck) {
                        this._isStuck = false;
                        this._randomWalk();
                    }
                }
                break;

            case MONSTER_STATE.TRACK:
                targetX = playerGX;
                targetY = playerGY;
                // 快速重算跟踪路径（500ms）
                if (this._path.length === 0 && !this._currentTarget) {
                    needNewPath = true;
                } else if (this._pathTimer >= this._pathRecalcInterval * 0.6) {
                    needNewPath = true;
                }
                break;

            case MONSTER_STATE.ATTACK:
                targetX = playerGX;
                targetY = playerGY;
                // 攻击状态频繁重算（300ms）
                if (this._path.length === 0 && !this._currentTarget) {
                    needNewPath = true;
                } else if (this._pathTimer >= this._pathRecalcInterval * 0.4) {
                    needNewPath = true;
                }
                break;
        }

        // 已卡住 → 直接重算路径
        if (this._isStuck) {
            needNewPath = true;
            this._isStuck = false;
            this._pathTimer = this._pathRecalcInterval; // 强制立即重算
        }

        // 有目标且需要寻路 → 计算 A* 路径
        if (needNewPath && targetX !== null && targetY !== null) {
            this._path = this._computeAStar(this.gridX, this.gridY, targetX, targetY);
            this._pathIndex = 0;
            // 没有路径：尝试直接移动
            if (this._path.length === 0) {
                this._currentTarget = { x: targetX, y: targetY };
            } else {
                this._currentTarget = this._path[0];
            }
            this._pathTimer = 0;
        }

        // 如果没有目标也没有路径 → 结束移动
        if (!this._currentTarget && this._path.length === 0) {
            if (this.state === MONSTER_STATE.PATROL) {
                this._randomWalk();
            }
            return;
        }

        // 如果还没有当前目标但有路径 → 取第一个
        if (!this._currentTarget && this._path.length > 0) {
            this._currentTarget = this._path[0];
        }
    }

    _pickRandomPatrolTarget() {
        // 在周围 5~12 格范围内选一个可达的随机点
        const range = 5 + Math.floor(Math.random() * 8);
        let attempts = 0;
        while (attempts < 20) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 3 + Math.random() * (range - 3);
            const x = Math.round(this.gridX + Math.cos(angle) * dist);
            const y = Math.round(this.gridY + Math.sin(angle) * dist);
            if (x >= 1 && x < this.gridCols - 1 && y >= 1 && y < this.gridRows - 1) {
                if (this._canMoveTo(x, y)) {
                    this._randomTarget = { x, y };
                    return;
                }
            }
            attempts++;
        }
        // fallback：保持当前位置附近
        this._randomTarget = { x: this.gridX, y: this.gridY };
    }

    /** 向目标做一步贪心移动（无路径 fallback） */
    _moveToward(targetX, targetY) {
        const dx = Math.sign(targetX - this.gridX);
        const dy = Math.sign(targetY - this.gridY);

        const attempts = (Math.abs(dx) >= Math.abs(dy))
            ? [{ dx, dy: 0 }, { dx: 0, dy }, { dx: 0, dy: -dy }, { dx: -dx, dy: 0 }]
            : [{ dx: 0, dy }, { dx, dy: 0 }, { dx: -dx, dy: 0 }, { dx: 0, dy: -dy }];

        for (const { dx, dy } of attempts) {
            if (dx === 0 && dy === 0) continue;
            const nx = this.gridX + dx;
            const ny = this.gridY + dy;
            if (this._canMoveTo(nx, ny)) {
                // 设置连续移动目标
                this._currentTarget = { x: nx, y: ny };
                // 朝向
                if (dy < 0) this.facing = DIR.UP;
                else if (dy > 0) this.facing = DIR.DOWN;
                else if (dx < 0) this.facing = DIR.LEFT;
                else if (dx > 0) this.facing = DIR.RIGHT;
                return;
            }
        }
        this._isStuck = true;
    }

    /** 随机走一步（无路径时的 fallback） */
    _randomWalk() {
        const dirs = [
            { dx: 0, dy: -1, dir: DIR.UP },
            { dx: 1, dy: 0, dir: DIR.RIGHT },
            { dx: 0, dy: 1, dir: DIR.DOWN },
            { dx: -1, dy: 0, dir: DIR.LEFT },
        ];
        const forward = dirs[this.facing];
        const shuffled = [forward, ...dirs.filter((_, i) => i !== this.facing)];

        for (const { dx, dy, dir } of shuffled) {
            const nx = this.gridX + dx;
            const ny = this.gridY + dy;
            if (this._canMoveTo(nx, ny)) {
                this._currentTarget = { x: nx, y: ny };
                this.facing = dir;
                return;
            }
        }
    }

    /**
     * A* 寻路（4方向）
     * @returns {Array<{x:number, y:number}>} 路径点列表（不含起点，含终点）
     */
    _computeAStar(fromX, fromY, toX, toY) {
        // 目标不可达 → 返回空
        if (!this._canMoveTo(toX, toY) && !(toX === fromX && toY === fromY)) {
            return [];
        }

        const rows = this.gridRows;
        const cols = this.gridCols;
        const open = [];
        const closed = new Set();
        const key = (x, y) => `${x},${y}`;
        const h = (x, y) => Math.abs(x - toX) + Math.abs(y - toY);

        open.push({ x: fromX, y: fromY, g: 0, h: h(fromX, fromY), f: h(fromX, fromY), parent: null });

        const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        let iterations = 0;
        const MAX_ITER = 500;

        while (open.length > 0 && iterations < MAX_ITER) {
            iterations++;

            // 找 f 值最小的节点
            let best = 0;
            for (let i = 1; i < open.length; i++) {
                if (open[i].f < open[best].f) best = i;
            }
            const node = open.splice(best, 1)[0];

            if (node.x === toX && node.y === toY) {
                // 重建路径
                const path = [];
                let n = node;
                while (n.parent) {
                    path.unshift({ x: n.x, y: n.y });
                    n = n.parent;
                }
                return path;
            }

            closed.add(key(node.x, node.y));

            for (const [dx, dy] of dirs) {
                const nx = node.x + dx;
                const ny = node.y + dy;
                if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
                if (closed.has(key(nx, ny))) continue;
                if (!this._canMoveTo(nx, ny)) continue;

                const g = node.g + 1;
                const existing = open.find(n => n.x === nx && n.y === ny);
                if (existing) {
                    if (g < existing.g) {
                        existing.g = g;
                        existing.f = g + existing.h;
                        existing.parent = node;
                    }
                } else {
                    open.push({
                        x: nx, y: ny,
                        g, h: h(nx, ny), f: g + h(nx, ny),
                        parent: node,
                    });
                }
            }
        }

        return []; // 无路径
    }

    /** 判断目标格是否可通行 */
    _canMoveTo(gx, gy) {
        if (gx < 0 || gx >= this.gridCols || gy < 0 || gy >= this.gridRows) return false;
        const cell = this.grid[gy][gx];
        return cell !== CELL.WALL && cell !== CELL.HIDDEN_WALL
            && cell !== CELL.HIDDEN_FLOOR && cell !== CELL.HIDDEN_PASSAGE;
    }
}

// ─────── MonsterManager ───────

/**
 * 怪物管理器
 *
 * 负责在 Game 中创建、更新、获取所有怪物。
 */
export class MonsterManager {
    constructor() {
        /** @type {Monster[]} */
        this.monsters = [];
    }

    /**
     * 为当前迷宫生成怪物
     * @param {number[][]} grid - 地图网格
     * @param {number} gridCols - 列数
     * @param {number} gridRows - 行数
     * @param {Array} rooms - 房间列表（用于放置怪物）
     */
    generateMonsters(grid, gridCols, gridRows, rooms) {
        this.monsters = [];

        // 收集所有可行走的地面格
        const floorCells = [];
        for (let gy = 0; gy < gridRows; gy++) {
            for (let gx = 0; gx < gridCols; gx++) {
                const cell = grid[gy][gx];
                if (cell === CELL.FLOOR || cell === CELL.CHEST ||
                    cell === CELL.EXIT || cell === CELL.RUIN ||
                    cell === CELL.MONUMENT) {
                    floorCells.push({ x: gx, y: gy });
                }
            }
        }

        if (floorCells.length === 0) return;

        // 排除玩家起点附近的格子（前 20 格）
        const excludeStart = 20;
        const usableCells = floorCells.slice(excludeStart);

        if (usableCells.length < 3) {
            // 地图太小，只放 1 个
            this._createMonster(usableCells[0] || floorCells[0], grid, gridCols, gridRows);
            return;
        }

        // 随机挑选几个格子放怪物（根据地图大小）
        const count = Math.max(2, Math.min(6, Math.floor(usableCells.length / 80)));
        const picked = [];
        const shuffled = [...usableCells].sort(() => Math.random() - 0.5);

        // 确保怪物之间有最小距离
        for (const cell of shuffled) {
            if (picked.length >= count) break;
            const tooClose = picked.some(p =>
                Math.abs(p.x - cell.x) + Math.abs(p.y - cell.y) < 10
            );
            if (!tooClose) {
                picked.push(cell);
            }
        }

        // 创建怪物
        const tileTypes = [109, 111, 120, 121];
        for (let i = 0; i < picked.length; i++) {
            const tileIdx = tileTypes[i % tileTypes.length];
            this._createMonster(picked[i], grid, gridCols, gridRows, tileIdx);
        }
    }

    _createMonster(pos, grid, gridCols, gridRows, tileIndex) {
        const tileIdx = tileIndex || [109, 111, 120, 121][Math.floor(Math.random() * 4)];
        const monster = new Monster({
            id: `monster_${this.monsters.length}`,
            tileIndex: tileIdx,
            gridX: pos.x,
            gridY: pos.y,
            facing: Math.floor(Math.random() * 4),
            grid,
            gridCols,
            gridRows,
            moveInterval: 600 + Math.random() * 400,
        });
        this.monsters.push(monster);
    }

    /**
     * 更新所有怪物
     * @param {number} dt
     * @param {number} playerGX
     * @param {number} playerGY
     * @param {{ x: number, y: number }|null} noiseSource
     * @param {boolean} [stealthActive=false] - 玩家是否隐身
     * @param {number} [noiseLevel=1] - 玩家噪音倍率
     * @param {Array<{x:number,y:number}>} [meatPositions] - 肉陷阱位置
     */
    updateAll(dt, playerGX, playerGY, noiseSource, stealthActive = false, noiseLevel = 1, meatPositions) {
        for (const m of this.monsters) {
            m.update(dt, playerGX, playerGY, noiseSource, stealthActive, noiseLevel, meatPositions);
        }
    }

    /**
     * 获取所有怪物状态（用于渲染和调试）
     * @returns {Array}
     */
    getMonsterStates() {
        return this.monsters.map(m => ({
            id: m.id,
            tileIndex: m.tileIndex,
            type: m.type,
            pixelX: m.pixelX,
            pixelY: m.pixelY,
            gridX: m.gridX,
            gridY: m.gridY,
            facing: m.facing,
            renderFacingRad: m._renderFacingRad,
            state: m.state,
            detection: m.lastDetection,
        }));
    }
}
