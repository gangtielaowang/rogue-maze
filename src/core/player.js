/**
 * 玩家模块
 *
 * 职责：
 * - 网格坐标管理
 * - 移动与碰撞检测
 * - 视野记录（已探索 / 已看见）
 *
 * 纯逻辑，不依赖任何 Web API。
 */

import { CELL } from '../maze/types.js';

export class Player {
    /**
     * @param {Object} config
     * @param {number} config.startX - 起始网格 X
     * @param {number} config.startY - 起始网格 Y
     * @param {number} config.gridWidth - 地图总列数
     * @param {number} config.gridHeight - 地图总行数
     * @param {number[][]} config.grid - 地图网格数据
     * @param {number} [config.exitX] - 出口 X
     * @param {number} [config.exitY] - 出口 Y
     */
    constructor(config) {
        this.x = config.startX;
        this.y = config.startY;
        this.gridWidth = config.gridWidth;
        this.gridHeight = config.gridHeight;
        this.grid = config.grid;
        this.exitX = config.exitX ?? -1;
        this.exitY = config.exitY ?? -1;

        // 视野记录
        this.exploredCells = new Set();
        this.seenCells = new Set();
        this.seenCellsTime = {};

        // 标记起点已探索
        this.markExplored(this.x, this.y);
    }

    /**
     * 获取指定位置的单元格类型
     * @returns {number|null} cell type 或 null（超出边界）
     */
    getCell(gx, gy) {
        if (gx < 0 || gx >= this.gridWidth || gy < 0 || gy >= this.gridHeight) return null;
        return this.grid[gy][gx];
    }

    /**
     * 尝试移动玩家
     * @param {number} dx - 行偏移（-1 / 0 / 1）
     * @param {number} dy - 列偏移（-1 / 0 / 1）
     * @returns {{ moved: boolean, victory?: boolean }}
     */
    move(dx, dy) {
        const newX = this.x + dx;
        const newY = this.y + dy;

        // 边界检查
        if (newX < 0 || newX >= this.gridWidth || newY < 0 || newY >= this.gridHeight) {
            return { moved: false };
        }

        const cell = this.grid[newY][newX];

        // 不可通行
        if (cell === CELL.WALL || cell === CELL.HIDDEN_WALL) {
            return { moved: false };
        }

        // 执行移动
        this.x = newX;
        this.y = newY;
        this.markExplored(this.x, this.y);

        // 到达出口
        if (newX === this.exitX && newY === this.exitY) {
            return { moved: true, victory: true };
        }

        return { moved: true };
    }

    // ────────── 视野记录 ──────────

    /**
     * 标记某格为已探索（永久记录）
     */
    markExplored(gx, gy) {
        this.exploredCells.add(`${gy},${gx}`);
    }

    /**
     * 标记某格为已看见（当前视野内）
     * @param {number} time - 可见时间戳，由调用方传入
     */
    markSeen(gx, gy, time) {
        const key = `${gy},${gx}`;
        if (!this.seenCells.has(key)) {
            this.seenCellsTime[key] = time;
        }
        this.seenCells.add(key);
    }

    /**
     * 是否已探索
     */
    isExplored(gx, gy) {
        return this.exploredCells.has(`${gy},${gx}`);
    }

    /**
     * 是否在视野内
     */
    isSeen(gx, gy) {
        return this.seenCells.has(`${gy},${gx}`);
    }

    /**
     * 获取当前网格坐标
     * @returns {{ x: number, y: number }}
     */
    getPosition() {
        return { x: this.x, y: this.y };
    }

    /**
     * 切换地图（跨关卡时更新网格引用）
     */
    setGrid(grid, width, height, startX, startY, exitX, exitY) {
        this.grid = grid;
        this.gridWidth = width;
        this.gridHeight = height;
        this.x = startX;
        this.y = startY;
        this.exitX = exitX;
        this.exitY = exitY;
        this.exploredCells = new Set();
        this.seenCells = new Set();
        this.seenCellsTime = {};
        this.markExplored(this.x, this.y);
    }
}
