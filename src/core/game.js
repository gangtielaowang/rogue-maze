/**
 * 游戏主模块
 *
 * 职责：
 * - 地图生成与初始化
 * - 玩家状态管理
 * - 游戏状态机（playing / victory / paused）
 * - 迷雾可见性更新
 *
 * 纯逻辑，不依赖任何 Web API。
 * 渲染、音频、输入处理由调用方（render / platform 层）实现。
 */

import { CELL } from '../maze/types.js';
import { DEFAULT_CONFIG } from '../maze/config.js';
import { MazeGenerator } from '../maze/generator.js';
import { Player } from './player.js';
import { FOG_DEFAULTS, updateVisibility } from './fog.js';

/**
 * 游戏状态枚举
 */
export const STATE = {
    INIT: 'init',
    PLAYING: 'playing',
    VICTORY: 'victory',
    PAUSED: 'paused',
    GAMEOVER: 'gameover',
};

export class Game {
    /**
     * @param {Object} [options]
     * @param {Object} [options.mazeConfig] - 迷宫生成配置
     * @param {number} [options.viewInnerR] - 内圈视野半径
     * @param {number} [options.viewOuterR] - 外圈视野半径
     */
    constructor(options = {}) {
        this.state = STATE.INIT;
        this.mazeConfig = { ...DEFAULT_CONFIG, ...options.mazeConfig };
        this.viewInnerR = options.viewInnerR ?? FOG_DEFAULTS.viewRadiusInner;
        this.viewOuterR = options.viewOuterR ?? FOG_DEFAULTS.viewRadiusOuter;

        /** @type {import('./player.js').Player|null} */
        this.player = null;
        this.grid = null;
        this.rooms = [];
        this.hiddenRooms = [];
        this.chestConditional = {};

        this._initMaze();
    }

    /** 生成迷宫并初始化玩家 */
    _initMaze() {
        const generator = new MazeGenerator(this.mazeConfig);
        const result = generator.generate();
        const mazeData = result;

        this.grid = mazeData.grid;
        this.rooms = mazeData.rooms;
        this.hiddenRooms = mazeData.hiddenRooms || [];

        const mapSize = this.grid.length;

        // 宝箱条件概率
        this._markConditionalChests();

        // 创建玩家（注意：迷宫生成器返回 row/col，Player 用 x=col, y=row）
        this.player = new Player({
            startX: mazeData.startPosition.col,
            startY: mazeData.startPosition.row,
            gridWidth: mapSize,
            gridHeight: mapSize,
            grid: this.grid,
            exitX: mazeData.exitPosition.col,
            exitY: mazeData.exitPosition.row,
        });

        // 初始迷雾更新
        this._updateFog();

        this.state = STATE.PLAYING;
    }

    /** 标记条件宝箱（30%概率为"假宝箱"） */
    _markConditionalChests() {
        for (let gy = 0; gy < this.grid.length; gy++) {
            for (let gx = 0; gx < this.grid[0].length; gx++) {
                if (this.grid[gy][gx] === CELL.CHEST) {
                    if (Math.random() < 0.3) {
                        this.chestConditional[`${gy},${gx}`] = true;
                    }
                }
            }
        }
    }

    /** 更新迷雾 */
    _updateFog() {
        if (!this.player) return;
        updateVisibility(this.player, this.grid, this.viewInnerR, this.viewOuterR);
    }

    // ────────── 公开 API ──────────

    /**
     * 尝试移动玩家一步
     * @returns {{ moved: boolean, victory?: boolean }}
     */
    movePlayer(dx, dy) {
        if (this.state !== STATE.PLAYING) return { moved: false };
        if (!this.player) return { moved: false };

        const result = this.player.move(dx, dy);
        if (result.moved) {
            this._updateFog();
            if (result.victory) {
                this.state = STATE.VICTORY;
            }
        }
        return result;
    }

    /**
     * 获取指定位置的地块类型
     * @returns {number|null}
     */
    getCell(gx, gy) {
        if (!this.player || !this.grid) return null;
        return this.player.getCell(gx, gy);
    }

    /**
     * 暂停/恢复
     */
    togglePause() {
        if (this.state === STATE.PLAYING) {
            this.state = STATE.PAUSED;
        } else if (this.state === STATE.PAUSED) {
            this.state = STATE.PLAYING;
        }
    }

    /**
     * 获取游戏当前快照（供渲染层使用）
     * @returns {Object}
     */
    getSnapshot() {
        return {
            state: this.state,
            grid: this.grid,
            gridSize: this.grid ? this.grid.length : 0,
            player: this.player ? this.player.getPosition() : null,
            exit: this.player ? { x: this.player.exitX, y: this.player.exitY } : null,
            explored: this.player ? this.player.exploredCells : null,
            seen: this.player ? this.player.seenCells : null,
            seenCellsTime: this.player ? this.player.seenCellsTime : {},
            chestConditional: this.chestConditional,
            hiddenRooms: this.hiddenRooms,
            rooms: this.rooms,
        };
    }

    /**
     * 重新开始（用新迷宫）
     */
    restart() {
        this._initMaze();
    }
}
