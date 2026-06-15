/**
 * 核心游戏模块桥接器
 *
 * 将 src/core/ 中的新模块（Game + Player + Fog + Inventory）
 * 包装为与 mist.html 旧 GameMapFree 兼容的 API。
 *
 * 使用方式：
 *   const bridge = new GameCoreBridge(mazeConfig);
 *   bridge.getCell(gx, gy);
 *   bridge.movePlayer(dx, dy);
 *   // ...等旧 GameMapFree 的接口
 */

import { Game, STATE } from '../core/game.js';
import { Inventory } from '../core/inventory.js';
import { CELL } from '../maze/types.js';

export class GameCoreBridge {
    /**
     * @param {Object} mazeConfig - 迷宫配置
     */
    constructor(mazeConfig = {}) {
        this.mazeConfig = mazeConfig;

        /** @type {Game} */
        this.game = null;
        /** @type {Inventory} */
        this.inventory = null;

        // ---- 旧 GameMapFree 兼容属性 ----
        this.playerGlobalX = 0;
        this.playerGlobalY = 0;
        this.exitGlobalX = 0;
        this.exitGlobalY = 0;
        this.globalGrid = [];
        this.seed = mazeConfig.seed ?? Math.floor(Math.random() * 1000000);
        this.exploredCells = new Set();
        this.seenCells = new Set();
        this.seenCellsTime = {};
        this.chestConditional = {};
        this.chestStates = {}; // 同步 Game 的宝箱状态
        this.hiddenRooms = [];

        // 自动生成世界（与旧 GameMapFree 行为一致）
        this.generateWorld();
    }

    /**
     * 生成世界（替换旧 generateWorld）
     */
    generateWorld() {
        // 初始化核心游戏（传入视野半径，与 fog-renderer 保持一致）
        this.game = new Game({
            mazeConfig: {
                ...this.mazeConfig,
                seed: this.seed,
            },
            viewInnerR: 2,
            viewOuterR: 4,
        });

        // 初始化背包
        this.inventory = new Inventory();
        this.inventory.initRun();

        // 回响数据
        this.echoCount = this.inventory.echoCount;
        this.echoCapacity = this.inventory.echoCapacity;
        /** 最后一次开箱掉落信息（供HUD显示） */
        this.lastChestDrop = null;

        // 同步兼容属性
        this._syncFromGame();
        this._syncHiddenRooms();

        // 设置全局变量（兼容 mist.html 旧代码）
        if (typeof window !== 'undefined' && this.globalGrid) {
            window.TOTAL_ROWS = this.globalGrid.length;
            window.TOTAL_COLS = this.globalGrid[0] ? this.globalGrid[0].length : window.TOTAL_ROWS;
        }

        // 注意：条件宝箱数据已在 Game._markConditionalChests() 中生成，
        // 并通过 _syncFromGame() 同步到 this.chestConditional，
        // 此处无需再次调用 markConditionalChests()。

        console.log(`[Bridge] 迷宫生成完毕: ${this.globalGrid.length}×${this.globalGrid[0].length}, 隐藏房间: ${this.hiddenRooms.length} 个`);
    }

    /** 从 Game 模块同步数据到兼容属性 */
    _syncFromGame() {
        const snap = this.game.getSnapshot();
        this.globalGrid = snap.grid;
        this.playerGlobalX = snap.player.x;
        this.playerGlobalY = snap.player.y;
        this.exitGlobalX = snap.exit.x;
        this.exitGlobalY = snap.exit.y;

        // 同步视野记录
        this.exploredCells = snap.explored;
        this.seenCells = snap.seen;
        this.seenCellsTime = snap.seenCellsTime || {};

        // 同步条件宝箱
        this.chestConditional = snap.chestConditional || {};

        // 同步宝箱状态
        this.chestStates = snap.chestStates || {};
    }

    /** 同步条件宝箱 */
    _syncChestConditional() {
        if (this.inventory) {
            this.chestConditional = this.inventory.chestConditional;
        }
    }

    /** 同步隐藏房间 */
    _syncHiddenRooms() {
        if (this.game) {
            this.hiddenRooms = this.game.hiddenRooms;
        }
    }

    // ────────── 旧 API 兼容方法 ──────────

    /**
     * 获取单元格类型
     * @returns {number|null}
     */
    getCell(gx, gy) {
        return this.game ? this.game.getCell(gx, gy) : null;
    }

    /**
     * 移动玩家（兼容旧 movePlayer）
     * @returns {{ moved: boolean, victory?: boolean }}
     */
    movePlayer(dx, dy) {
        if (!this.game) return { moved: false };

        const result = this.game.movePlayer(dx, dy);
        if (result.moved) {
            // 更新兼容属性
            this.playerGlobalX = this.game.player.x;
            this.playerGlobalY = this.game.player.y;
            this.exploredCells = this.game.player.exploredCells;
            this.seenCells = this.game.player.seenCells;
        }
        if (result.victory) {
            this.exitGlobalX = this.game.player.exitX;
            this.exitGlobalY = this.game.player.exitY;
        }
        return result;
    }

    /**
     * 标记已探索（兼容旧 markExplored）
     */
    markExplored(gy, gx) {
        if (this.game && this.game.player) {
            this.game.player.markExplored(gx, gy);
        }
        this.exploredCells.add(`${gy},${gx}`);
    }

    /**
     * 标记已看见（兼容旧 markSeen）
     */
    markSeen(gy, gx) {
        const now = performance?.now() ?? Date.now();
        if (this.game && this.game.player) {
            this.game.player.markSeen(gx, gy, now);
        }
        const key = `${gy},${gx}`;
        if (!this.seenCells.has(key)) {
            this.seenCellsTime[key] = now;
        }
        this.seenCells.add(key);
    }

    /**
     * 标记条件宝箱
     */
    markConditionalChests() {
        if (this.inventory) {
            this.inventory.markConditionalChests(this.globalGrid);
            this.chestConditional = this.inventory.chestConditional;
        }
    }

    /**
     * 检查是否为条件宝箱
     */
    isConditionalChest(gy, gx) {
        return !!this.chestConditional[`${gy},${gx}`];
    }

    /**
     * 清除宝箱
     */
    clearChest(py, px) {
        if (this.inventory) {
            this.inventory.clearChest(this.globalGrid, py, px);
            this.chestConditional = this.inventory.chestConditional;
        } else {
            this.globalGrid[py][px] = CELL.FLOOR;
        }
    }

    /**
     * 尝试打开宝箱
     * 锁定宝箱消耗 60 回响；普通宝箱免费。
     * 打开后掉落随机物品。
     * @returns {{ opened: boolean, drop: Object|null, message: string }}
     */
    openChest(gy, gx, timestamp) {
        if (!this.game) return { opened: false, drop: null, message: '游戏未初始化' };
        if (!this.inventory) return { opened: false, drop: null, message: '背包未初始化' };

        const cs = this.game.chestStates[`${gy},${gx}`];
        if (!cs || cs.state !== 'closed') return { opened: false, drop: null, message: '宝箱已打开' };

        // 锁定宝箱需要消耗回响
        if (cs.type === 'locked') {
            const cost = 60;
            if (this.inventory.echoCount < cost) {
                return { opened: false, drop: null, message: `回响不足 (需要 ${cost})` };
            }
            this.inventory.spendEcho(cost);
        }

        // 执行打开
        const result = this.game.openChest(gy, gx, timestamp);
        if (!result.opened) return { opened: false, drop: null, message: '打开失败' };

        // 掉落物品
        const drop = this.inventory.getRandomDrop();
        let dropMessage = '宝箱是空的';
        if (drop) {
            if (drop.category === 'consumable') {
                // 消耗品直接给回响
                this.inventory.addEcho(drop.id === 'capsule_echo_small' ? 50 : 120);
                dropMessage = `获得 ${drop.icon} ${drop.name}`;
            } else {
                // 持续性物品加入背包
                const added = this.inventory.addCapsule(drop.id);
                if (added) {
                    dropMessage = `获得 ${drop.icon} ${drop.name}`;
                } else {
                    dropMessage = '背包已满，物品丢失';
                }
            }
        }

        // 更新桥接层数据
        this.lastChestDrop = { ...drop, message: dropMessage };
        this.echoCount = this.inventory.echoCount;
        this.echoCapacity = this.inventory.echoCapacity;
        this._syncFromGame();

        return { opened: true, drop, message: dropMessage };
    }

    /**
     * 检查是否胜利
     */
    hasWon() {
        return this.game && this.game.state === STATE.VICTORY;
    }

    /**
     * 更新怪物
     * @param {number} dt - 帧间隔 ms
     * @param {{x:number,y:number}|null} noiseSource - 噪音源
     * @param {boolean} [stealthActive=false] - 玩家是否隐身
     * @param {number} [noiseLevel=1] - 玩家噪音倍率
     */
    updateMonsters(dt, noiseSource, stealthActive = false, noiseLevel = 1) {
        if (this.game) {
            this.game.updateMonsters(dt, noiseSource, stealthActive, noiseLevel, this._meatPositions);
        }
    }

    /**
     * 获取怪物数据（用于渲染）
     */
    getMonsters() {
        return this.game?.monsterManager?.getMonsterStates() || [];
    }

    // ─────── 玩家应对手段 ───────

    /** 肉陷阱位置列表 */
    _meatPositions = [];

    /** 玩家隐身状态 */
    _stealthActive = false;

    /**
     * 开关隐身护盾
     * @returns {boolean} 操作是否成功（有隐身道具才会开启）
     */
    toggleStealth() {
        if (!this.inventory) return false;
        // 关闭隐身
        if (this._stealthActive) {
            this._stealthActive = false;
            return true;
        }
        // 开启隐身 → 消耗一个隐身道具
        const idx = this.inventory.capsules.findIndex(c => c.id === 'capsule_stealth');
        if (idx !== -1) {
            this.inventory.capsules.splice(idx, 1);
            this._stealthActive = true;
            return true;
        }
        return false;
    }

    /**
     * 隐身是否激活
     */
    isStealthActive() {
        return this._stealthActive;
    }

    /**
     * 投掷石头
     * @param {number} gx - 目标网格 X
     * @param {number} gy - 目标网格 Y
     * @returns {boolean} 是否成功投掷
     */
    useStone(gx, gy) {
        if (!this.inventory) return false;
        const idx = this.inventory.capsules.findIndex(c => c.id === 'capsule_stone');
        if (idx === -1) return false;
        this.inventory.capsules.splice(idx, 1);
        this._lastStoneTarget = { x: gx, y: gy };
        this._lastStoneTime = performance.now();
        return true;
    }

    /** 获取最近一次投石目标（供渲染层使用） */
    getLastStoneTarget() {
        const elapsed = performance.now() - (this._lastStoneTime || 0);
        if (elapsed < 2000) return this._lastStoneTarget;
        return null;
    }

    /**
     * 放置肉陷阱
     * @param {number} gx - 放置网格 X
     * @param {number} gy - 放置网格 Y
     * @returns {boolean} 是否成功放置
     */
    useMeat(gx, gy) {
        if (!this.inventory) return false;
        const idx = this.inventory.capsules.findIndex(c => c.id === 'capsule_meat');
        if (idx === -1) return false;
        this.inventory.capsules.splice(idx, 1);
        this._meatPositions.push({ x: gx, y: gy });
        return true;
    }

    /** 获取肉陷阱位置 */
    getMeatPositions() {
        return this._meatPositions;
    }

    /** 获取道具数量 */
    getItemCount(itemId) {
        if (!this.inventory) return 0;
        return this.inventory.capsules.filter(c => c.id === itemId).length;
    }

    /** 获取背包中所有道具 */
    getCapsules() {
        return this.inventory?.capsules || [];
    }

    /**
     * 重新开始
     */
    restart() {
        if (this.game) {
            this.game.restart();
            this._syncFromGame();
            this._syncChestConditional();
        }
    }
}
