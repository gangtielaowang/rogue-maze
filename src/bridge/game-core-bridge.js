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
        this.hiddenRooms = [];

        // 自动生成世界（与旧 GameMapFree 行为一致）
        this.generateWorld();
    }

    /**
     * 生成世界（替换旧 generateWorld）
     */
    generateWorld() {
        // 初始化游戏
        this.game = new Game({
            mazeConfig: {
                ...this.mazeConfig,
                seed: this.seed,
            },
        });

        // 初始化背包
        this.inventory = new Inventory();
        this.inventory.initRun();

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
        // seenCellsTime 由 fog 更新时写入

        // 同步条件宝箱
        this.chestConditional = snap.chestConditional || {};
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
        if (this.game && this.game.player) {
            this.game.player.markSeen(gx, gy, performance?.now() ?? Date.now());
        }
        this.seenCells.add(`${gy},${gx}`);
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
     * 检查是否胜利
     */
    hasWon() {
        return this.game && this.game.state === STATE.VICTORY;
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
