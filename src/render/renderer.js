/**
 * 主渲染器
 *
 * 协调各渲染模块，形成完整渲染管线：
 *   Camera → TileRenderer → FogRenderer → SpriteRenderer → HudRenderer
 *
 * 渲染流程（与 mist.html 旧 render() 一致）：
 *   Pass 1:  地板层（地板/废墟/石碑/高代价/通路）
 *   Pass 2a: 墙体层（不含覆盖玩家的格）
 *   Pass 3:  图标层（宝箱/出口/石碑）
 *   绘制玩家
 *   Pass 2b: 墙体覆盖层（伪3D深度）
 *   绘制迷雾
 *   绘制小地图
 */

import { Camera } from './camera.js';
import { TileRenderer } from './tile-renderer.js';
import { FogRenderer } from './fog-renderer.js';
import { SpriteRenderer } from './sprite-renderer.js';
import { HudRenderer } from './hud-renderer.js';

const CELL = {
    WALL: 0, FLOOR: 1, CHEST: 2, EXIT: 3, RUIN: 4,
    HIGH_COST: 5, MONUMENT: 6,
    HIDDEN_WALL: 11, HIDDEN_FLOOR: 12, HIDDEN_PASSAGE: 13,
};

const RENDER_BUFFER = 2;

export class Renderer {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {Object} assets
     * @param {Object} assets.tiles - 瓦片图片对象（同旧 tiles 结构）
     * @param {HTMLImageElement[]} [assets.fogFrames] - 迷雾帧
     * @param {Object} [options]
     * @param {number} [options.viewCols=21]
     * @param {number} [options.viewRows=21]
     * @param {number} [options.cellWidth=40]
     * @param {number} [options.cellHeight=40]
     */
    constructor(canvas, assets, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        const { tiles, fogFrames } = assets;
        const viewCols = options.viewCols || 21;
        const viewRows = options.viewRows || 21;
        const cellWidth = options.cellWidth || 40;
        const cellHeight = options.cellHeight || 40;

        // ── 子渲染器 ──
        this.camera = new Camera({ viewCols, viewRows, cellWidth, cellHeight });
        this.tileRenderer = new TileRenderer(this.ctx, tiles, { cellWidth, cellHeight });
        this.fogRenderer = new FogRenderer(this.ctx);
        this.spriteRenderer = new SpriteRenderer(this.ctx);
        this.hudRenderer = null; // 延迟初始化（需 minimap canvas）

        // 设置迷雾帧
        if (fogFrames) {
            this.fogRenderer.setFogFrames(fogFrames);
        }

        // ── 渲染状态 ──
        this.gridOffsetX = 0;
        this.gridOffsetY = 0;
        this.totalCols = 0;
        this.totalRows = 0;

        // 设备像素比
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);

        // 标记：覆盖玩家的墙格（Pass 2b）
        this._overCells = [];

        // 配置
        this.fogEnabled = true;
    }

    /**
     * 初始化 HUD（小地图画布）
     * @param {HTMLCanvasElement} minimapCanvas
     */
    initHud(minimapCanvas) {
        const minimapCtx = minimapCanvas.getContext('2d');
        this.hudRenderer = new HudRenderer(this.ctx, minimapCtx);
    }

    /**
     * 设置网格尺寸 & 画布尺寸
     */
    setDimensions(totalCols, totalRows, screenWidth, screenHeight) {
        this.totalCols = totalCols;
        this.totalRows = totalRows;
        this.camera.setGridSize(totalCols, totalRows);
        this.camera.cellWidth = this.tileRenderer.cellWidth;
        this.camera.cellHeight = this.tileRenderer.cellHeight;

        // 网格偏移（居中）
        const gridPixelW = totalCols * this.tileRenderer.cellWidth;
        const gridPixelH = totalRows * this.tileRenderer.cellHeight;
        this.gridOffsetX = Math.max(0, (screenWidth - gridPixelW) / 2);
        this.gridOffsetY = Math.max(0, (screenHeight - gridPixelH) / 2);

        // 更新画布尺寸（DPR）
        this.canvas.width = screenWidth * this.dpr;
        this.canvas.height = screenHeight * this.dpr;
        this.canvas.style.width = screenWidth + 'px';
        this.canvas.style.height = screenHeight + 'px';
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    // ─────── 更新 ───────

    /**
     * 每帧更新（摄像机 + 迷雾动画）
     */
    update(playerPixelX, playerPixelY, dt) {
        this.camera.update(playerPixelX, playerPixelY, dt);
        this.fogRenderer.updateAnimation(dt);
    }

    // ─────── 主渲染 ───────

    /**
     * 渲染一帧
     * @param {Object} state - 游戏状态
     * @param {number[][]} state.grid
     * @param {number} state.playerPixelX
     * @param {number} state.playerPixelY
     * @param {number} state.playerGX - 玩家网格 X
     * @param {number} state.playerGY - 玩家网格 Y
     * @param {string} state.playerDirection - 'up'|'down'|'left'|'right'
     * @param {boolean} state.playerIsMoving
     * @param {Set<string>} state.seenCells
     * @param {Object} state.seenCellsTime
     * @param {boolean} state.boosterActive - 共鸣视野强化
     * @param {boolean} [state.fogEnabled=true]
     * @param {number} [state.now] - performance.now()
     */
    render(state) {
        const { grid, playerPixelX, playerPixelY, playerGX, playerGY,
                playerDirection, playerIsMoving, seenCells, seenCellsTime,
                boosterActive, fogEnabled } = state;

        const screenWidth = this.canvas.width / this.dpr;
        const screenHeight = this.canvas.height / this.dpr;
        const cellW = this.tileRenderer.cellWidth;
        const cellH = this.tileRenderer.cellHeight;
        const ctx = this.ctx;

        // ── 视口 ──
        const vp = this.camera.getViewport();
        const { camIntX, camIntY, camFracX, camFracY, extraCols, extraRows } = vp;

        const VIEW_COLS = Math.ceil(screenWidth / cellW) + 1;
        const VIEW_ROWS = Math.ceil(screenHeight / cellH) + 1;

        // ── 清屏 ──
        // ctx.fillStyle = '#080808';
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, screenWidth, screenHeight);

        // ── 收集可见格 ──
        const visibleCells = [];
        for (let vy = -RENDER_BUFFER; vy < VIEW_ROWS + extraRows + RENDER_BUFFER; vy++) {
            for (let vx = -RENDER_BUFFER; vx < VIEW_COLS + extraCols + RENDER_BUFFER; vx++) {
                const gx = camIntX + vx;
                const gy = camIntY + vy;
                if (gx < 0 || gx >= this.totalCols || gy < 0 || gy >= this.totalRows) continue;
                visibleCells.push({
                    gx, gy,
                    cellX: vx * cellW,
                    cellY: vy * cellH,
                    cell: grid[gy][gx],
                });
            }
        }

        const isWallCell = (cell) =>
            cell === CELL.WALL || cell === CELL.HIDDEN_WALL ||
            cell === CELL.HIDDEN_FLOOR || cell === CELL.HIDDEN_PASSAGE;

        // ── 网格变换 ──
        ctx.save();
        const tx = Math.round(this.gridOffsetX - camFracX * cellW);
        const ty = Math.round(this.gridOffsetY - camFracY * cellH);
        ctx.translate(tx, ty);

        // ── Pass 1: 地板层 ──
        for (const vc of visibleCells) {
            const { cell, cellX, cellY, gx, gy } = vc;

            if (isWallCell(cell)) {
                this.tileRenderer.drawFloorTile(cellX, cellY, cellW, cellH,
                    this.tileRenderer.selectFloorTile(gx, gy, grid, this.totalCols, this.totalRows));
                continue;
            }

            switch (cell) {
                case CELL.RUIN:
                    this.tileRenderer.drawRuin(cellX, cellY);
                    break;
                case CELL.MONUMENT:
                    this.tileRenderer.drawPath(cellX, cellY, gx, gy, grid, this.totalCols, this.totalRows);
                    break;
                case CELL.HIGH_COST:
                    this.tileRenderer.drawHighCostTile(cellX, cellY, gx, gy, grid, this.totalCols, this.totalRows);
                    break;
                default:
                    this.tileRenderer.drawPath(cellX, cellY, gx, gy, grid, this.totalCols, this.totalRows);
            }
        }

        // ── Pass 2a: 墙体层（不含覆盖玩家） ──
        for (const vc of visibleCells) {
            if (!isWallCell(vc.cell)) continue;
            if (this.tileRenderer.shouldRenderOverPlayer(vc.gx, vc.gy, grid, this.totalCols, this.totalRows)) continue;
            this.tileRenderer.drawWall(vc.cellX, vc.cellY, vc.gx, vc.gy, grid, this.totalCols, this.totalRows);
        }

        // ── Pass 3: 图标层（仅在完全可见区域内显示） ──
        // 视野外（探索缓冲区）的宝箱/出口/石碑等不显示
        const visionDist = 3.2; // 完全可见区域半径（格数），略大于视野cutout边界
        for (const vc of visibleCells) {
            const { cell, cellX, cellY, gx, gy } = vc;
            // 跳过探索缓冲区中的图标
            const dist = Math.sqrt((gx - playerGX) ** 2 + (gy - playerGY) ** 2);
            if (dist > visionDist) continue;
            if (cell === CELL.CHEST) {
                this.tileRenderer.drawChest(cellX, cellY, false);
            } else if (cell === CELL.EXIT) {
                this.tileRenderer.drawExit(cellX, cellY);
            } else if (cell === CELL.MONUMENT) {
                this.tileRenderer.drawMonument(cellX, cellY);
            }
        }

        ctx.restore();

        // ── 绘制玩家 ──
        const playerScreenX = this.gridOffsetX + (playerPixelX / cellW - camIntX) * cellW - camFracX * cellW;
        const playerScreenY = this.gridOffsetY + (playerPixelY / cellH - camIntY) * cellH - camFracY * cellH;
        this.spriteRenderer.direction = playerDirection;
        this.spriteRenderer.isMoving = playerIsMoving;
        this.spriteRenderer.draw(playerScreenX, playerScreenY, cellW);

        // ── Pass 2b: 墙体覆盖层（伪3D深度） ──
        ctx.save();
        const tx2 = Math.round(this.gridOffsetX - camFracX * cellW);
        const ty2 = Math.round(this.gridOffsetY - camFracY * cellH);
        ctx.translate(tx2, ty2);
        for (const vc of visibleCells) {
            if (!isWallCell(vc.cell)) continue;
            if (!this.tileRenderer.shouldRenderOverPlayer(vc.gx, vc.gy, grid, this.totalCols, this.totalRows)) continue;
            this.tileRenderer.drawWall(vc.cellX, vc.cellY, vc.gx, vc.gy, grid, this.totalCols, this.totalRows);
        }
        ctx.restore();

        // ── 迷雾 ──
        if (fogEnabled !== false) {
            const now = state.now || performance.now();
            this.fogRenderer.render({
                dpr: this.dpr,
                screenWidth,
                screenHeight,
                cellSize: cellW,
                playerAbsX: playerScreenX,
                playerAbsY: playerScreenY,
                playerPixelX,
                playerPixelY,
                boosterActive: boosterActive || false,
                renderCamX: this.camera.renderCamX,
                renderCamY: this.camera.renderCamY,
                seenCells,
                seenCellsTime: seenCellsTime || {},
                now,
                globalTime: now / 1000,
                totalCols: this.totalCols,
                totalRows: this.totalRows,
                gridOffsetX: this.gridOffsetX,
                gridOffsetY: this.gridOffsetY,
                viewCols: this.camera.viewCols,
                viewRows: this.camera.viewRows,
                fogEnabled,
            });
        }

        // ── 小地图 ──
        if (this.hudRenderer) {
            this.hudRenderer.renderMinimap({
                grid,
                totalCols: this.totalCols,
                totalRows: this.totalRows,
                seenCells,
                fogEnabled: fogEnabled !== false,
                playerGX: playerGX || 0,
                playerGY: playerGY || 0,
            });
        }
    }
}
