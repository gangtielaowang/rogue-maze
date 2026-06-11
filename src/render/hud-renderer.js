/**
 * HUD 渲染模块
 *
 * 提供小地图渲染和 UI 更新功能。
 * 小地图支持普通模式（100×100）和大地图弹窗模式（400×400）。
 *
 * 依赖 Canvas 2D API。
 */
import { COLORS } from './tile-renderer.js';

const CELL = { WALL: 0, FLOOR: 1, CHEST: 2, EXIT: 3, HIDDEN_FLOOR: 12 };

export class HudRenderer {
    /**
     * @param {CanvasRenderingContext2D} ctx - 主画布上下文
     * @param {CanvasRenderingContext2D} minimapCtx - 小地图画布上下文
     * @param {Object} [options]
     * @param {number} [options.minimapWidth=100]
     * @param {number} [options.minimapHeight=100]
     */
    constructor(ctx, minimapCtx, options = {}) {
        this.ctx = ctx;
        this.minimapCtx = minimapCtx;
        this.minimapWidth = options.minimapWidth || 100;
        this.minimapHeight = options.minimapHeight || 100;
    }

    /**
     * 渲染小地图
     * @param {Object} params
     * @param {number[][]} params.grid - 地图网格
     * @param {number} params.totalCols
     * @param {number} params.totalRows
     * @param {Set<string>} params.seenCells - 已看集合 ("gy,gx")
     * @param {boolean} params.fogEnabled
     * @param {number} params.playerGX - 玩家网格 X
     * @param {number} params.playerGY - 玩家网格 Y
     * @param {Object} [params.hiddenRooms] - 隐藏房间数据（调试高亮）
     */
    renderMinimap(params) {
        const { grid, totalCols, totalRows, seenCells, fogEnabled, playerGX, playerGY } = params;
        const minimapCtx = this.minimapCtx;
        const mw = this.minimapWidth;
        const mh = this.minimapHeight;
        const cellW = mw / totalCols;
        const cellH = mh / totalRows;

        minimapCtx.fillStyle = '#0a0a0a';
        minimapCtx.fillRect(0, 0, mw, mh);

        for (let gy = 0; gy < totalRows; gy++) {
            for (let gx = 0; gx < totalCols; gx++) {
                const key = `${gy},${gx}`;
                if (fogEnabled && !seenCells.has(key)) continue;

                const cell = grid[gy][gx];
                const x = gx * cellW;
                const y = gy * cellH;

                switch (cell) {
                    case CELL.WALL:
                        minimapCtx.fillStyle = '#2a2a2a';
                        break;
                    case CELL.FLOOR:
                    case CELL.CHEST:
                        minimapCtx.fillStyle = '#1a1a1a';
                        break;
                    case CELL.EXIT:
                        minimapCtx.fillStyle = '#22c55e';
                        break;
                    default:
                        if (cell >= 10) {
                            minimapCtx.fillStyle = '#3a2a1a';
                        } else {
                            minimapCtx.fillStyle = '#1a1a1a';
                        }
                }

                minimapCtx.fillRect(x, y, Math.ceil(cellW) + 0.5, Math.ceil(cellH) + 0.5);
            }
        }

        // 绘制玩家位置
        minimapCtx.fillStyle = '#ff6b35';
        minimapCtx.beginPath();
        minimapCtx.arc(playerGX * cellW + cellW / 2, playerGY * cellH + cellH / 2, Math.min(cellW, cellH) * 0.4, 0, Math.PI * 2);
        minimapCtx.fill();
    }
}
