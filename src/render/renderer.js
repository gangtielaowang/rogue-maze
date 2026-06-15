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

        // 怪物 tiles（索引对应 tileIndex 映射）
        this.monsterTiles = assets.monsters || [];

        // ── 渲染状态 ──
        this.gridOffsetX = 0;
        this.gridOffsetY = 0;
        this.totalCols = 0;
        this.totalRows = 0;

        // 设备像素比（不设上限，保证 Retina 设备清晰度）
        this.dpr = window.devicePixelRatio || 1;

        // 关闭抗锯齿（像素风格游戏需要清晰边缘）
        this.ctx.imageSmoothingEnabled = false;

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
        minimapCtx.imageSmoothingEnabled = false;
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
        // ⚠️ 注意：设置 canvas.width/height 会重置上下文状态（包括 imageSmoothingEnabled）
        this.canvas.width = screenWidth * this.dpr;
        this.canvas.height = screenHeight * this.dpr;
        this.canvas.style.width = screenWidth + 'px';
        this.canvas.style.height = screenHeight + 'px';
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.ctx.imageSmoothingEnabled = false; // 必须在 canvas resize 之后重新设置
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
     * @param {Object} [state.chestStates] - 宝箱状态字典
     * @param {Object} [state.targetMarker] - 点击寻路目标 { gx, gy }
     * @param {Object} [state.fogOpts] - 迷雾参数覆盖（调试面板）
     * @param {number} [state.now] - performance.now()
     */
    render(state) {
        const { grid, playerPixelX, playerPixelY, playerGX, playerGY,
                playerDirection, playerIsMoving, seenCells, seenCellsTime,
                boosterActive, fogEnabled, chestStates, fogOpts, monsters,
                stealthActive, meatPositions, stoneTarget, bossPreviews } = state;
        const now = state.now || performance.now();

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
        const visionDist = boosterActive ? 5.5 : 3.2; // 完全可见区域半径（格数）
        for (const vc of visibleCells) {
            const { cell, cellX, cellY, gx, gy } = vc;
            // 跳过探索缓冲区中的图标
            const dist = Math.sqrt((gx - playerGX) ** 2 + (gy - playerGY) ** 2);
            if (dist > visionDist) continue;
            if (cell === CELL.CHEST) {
                const cs = chestStates ? chestStates[`${gy},${gx}`] : null;
                this.tileRenderer.drawChest(cellX, cellY, cs, now);
            } else if (cell === CELL.EXIT) {
                this.tileRenderer.drawExit(cellX, cellY);
            } else if (cell === CELL.MONUMENT) {
                this.tileRenderer.drawMonument(cellX, cellY);
            }
        }

        // ── 目标标记 ──
        const target = state.targetMarker;
        if (target) {
            for (const vc of visibleCells) {
                if (vc.gx === target.gx && vc.gy === target.gy) {
                    this.tileRenderer.drawTargetMarker(vc.cellX, vc.cellY);
                    break;
                }
            }
        }

        // ── 肉陷阱占位绘制 ──
        if (meatPositions) {
            for (const mp of meatPositions) {
                for (const vc of visibleCells) {
                    if (vc.gx === mp.x && vc.gy === mp.y) {
                        ctx.fillStyle = '#c0392b';
                        ctx.beginPath();
                        ctx.arc(vc.cellX + cellW / 2, vc.cellY + cellH / 2, cellW * 0.25, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.fillStyle = '#e74c3c';
                        ctx.beginPath();
                        ctx.arc(vc.cellX + cellW / 2 - 3, vc.cellY + cellH / 2 - 3, cellW * 0.1, 0, Math.PI * 2);
                        ctx.fill();
                        break;
                    }
                }
            }
        }

        // ── 投石目标占位 ──
        if (stoneTarget) {
            for (const vc of visibleCells) {
                if (vc.gx === stoneTarget.x && vc.gy === stoneTarget.y) {
                    ctx.save();
                    ctx.strokeStyle = '#ff6b35';
                    ctx.lineWidth = 2;
                    const cx = vc.cellX + cellW / 2;
                    const cy = vc.cellY + cellH / 2;
                    const r = cellW * 0.35;
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.stroke();
                    // X 标记
                    ctx.beginPath();
                    ctx.moveTo(cx - r * 0.5, cy - r * 0.5);
                    ctx.lineTo(cx + r * 0.5, cy + r * 0.5);
                    ctx.moveTo(cx + r * 0.5, cy - r * 0.5);
                    ctx.lineTo(cx - r * 0.5, cy + r * 0.5);
                    ctx.stroke();
                    ctx.restore();
                    break;
                }
            }
        }

        ctx.restore();

        // ── 怪物感知范围 + 怪物本体（绝对屏幕坐标，与玩家同级） ──
        if (monsters && monsters.length > 0) {
            this._drawMonsters(monsters, cellW, cellH, camIntX, camIntY, camFracX, camFracY);
        }

        // ── Boss 预览（占位素材质检） ──
        if (bossPreviews && bossPreviews.length > 0) {
            this._drawBossPreviews(bossPreviews, cellW, cellH, camIntX, camIntY, camFracX, camFracY);
        }

        // ── 绘制玩家 ──
        const playerScreenX = this.gridOffsetX + (playerPixelX / cellW - camIntX) * cellW - camFracX * cellW;
        const playerScreenY = this.gridOffsetY + (playerPixelY / cellH - camIntY) * cellH - camFracY * cellH;
        this.spriteRenderer.direction = playerDirection;
        this.spriteRenderer.isMoving = playerIsMoving;
        // 隐身时半透明
        if (stealthActive) {
            ctx.save();
            ctx.globalAlpha = 0.35;
        }
        this.spriteRenderer.draw(playerScreenX, playerScreenY, cellW);
        if (stealthActive) {
            ctx.restore();
        }

        // ── 调试碰撞盒 ──
        if (typeof window !== 'undefined' && window.__showCollisionBox) {
            this._drawCollisionBox(playerPixelX, playerPixelY, cellW, cellH);
        }

        // ── 隐藏房间高亮（调试） ──
        if (typeof window !== 'undefined' && window.__showHiddenRooms) {
            this._drawHiddenRoomHighlight(cellW, cellH);
        }

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
                fogOpts: fogOpts || (typeof window !== 'undefined' ? window.__fogOpts : undefined),
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

        // ── 威胁检测指示器 ──
        if (monsters && monsters.length > 0) {
            this._drawThreatIndicator(monsters, ctx, screenWidth, screenHeight);
        }
    }

    // ─────── 调试：碰撞盒 ───────

    _drawCollisionBox(px, py, cellW, cellH) {
        const ctx = this.ctx;
        const footRatio = 0.5;
        const cw = cellW * 0.4;
        const ch = cellH * 0.3;
        const hw = cw / 2;
        const hh = ch / 2;

        // 网格坐标 → 屏幕坐标
        const vp = this.camera.getViewport();
        const sx = this.gridOffsetX + (px / cellW - vp.camIntX) * cellW - vp.camFracX * cellW;
        const sy = this.gridOffsetY + (py / cellH - vp.camIntY) * cellH - vp.camFracY * cellH;

        const topFrac = 1 - footRatio * 2 + 0.3;
        const bottomFrac = footRatio * 2 - 0.3;
        const top = sy - hh * topFrac;
        const bottom = sy + hh * bottomFrac;
        const left = sx - hw;
        const right = sx + hw;

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(left, top, right - left, bottom - top);
        ctx.fillStyle = 'rgba(255, 255, 0, 0.1)';
        ctx.fillRect(left, top, right - left, bottom - top);

        // 脚部中心点
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // ─────── 怪物渲染 ───────

    /** tileIndex → monsterTiles 数组下标 */
    _monsterTileIndex(tileIndex) {
        const map = { 109: 0, 111: 1, 120: 2, 121: 3 };
        return map[tileIndex] ?? 0;
    }

    /** DIR → 弧度（3π/2=上, 0=右, π/2=下, π=左） */
    _facingToRad(facing) {
        return facing * Math.PI / 2 - Math.PI / 2;
    }

    /**
     * 绘制一批怪物（感知范围 + tile）
     * 使用绝对屏幕坐标（调用前已 ctx.restore）
     */
    _drawMonsters(monsters, cellW, cellH, camIntX, camIntY, camFracX, camFracY) {
        const ctx = this.ctx;
        const viewW = Math.ceil(this.canvas.width / this.dpr / cellW) + 2;
        const viewH = Math.ceil(this.canvas.height / this.dpr / cellH) + 2;

        for (const m of monsters) {
            // 视口裁剪
            const gx = m.gridX;
            const gy = m.gridY;
            if (gx < camIntX - 2 || gx >= camIntX + viewW + 2) continue;
            if (gy < camIntY - 2 || gy >= camIntY + viewH + 2) continue;

            // 平滑位置（pixelX/Y 是连续格坐标，直接用于渲染）
            const interpX = m.pixelX;
            const interpY = m.pixelY;

            // 屏幕坐标（绝对坐标，无上下文偏移）
            const sx = Math.round(this.gridOffsetX + (interpX - camIntX) * cellW - camFracX * cellW);
            const sy = Math.round(this.gridOffsetY + (interpY - camIntY) * cellH - camFracY * cellH);
            const centerX = sx + cellW / 2;
            const centerY = sy + cellH / 2;

            // 平滑朝向弧度（若提供则使用，否则 fallback）
            const facingRad = m.renderFacingRad != null
                ? m.renderFacingRad
                : this._facingToRad(m.facing);

            // ── 感知范围 ──
            this._drawSectorRad(ctx, centerX, centerY,
                7 * cellW, facingRad, 120,
                m.detection?.hearing ? 'rgba(255, 255, 180, 0.12)' : 'rgba(255, 255, 180, 0.05)');
            this._drawSectorRad(ctx, centerX, centerY,
                4 * cellW, facingRad, 120,
                m.detection?.alert ? 'rgba(255, 180, 60, 0.18)' : 'rgba(255, 180, 60, 0.07)');
            this._drawSectorRad(ctx, centerX, centerY,
                2 * cellW, facingRad, 90,
                m.detection?.detect ? 'rgba(255, 80, 80, 0.3)' : 'rgba(255, 80, 80, 0.1)');

            // ── 怪物 tile ──
            const img = this.monsterTiles[this._monsterTileIndex(m.tileIndex)];
            if (img && img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, sx, sy, cellW, cellH);
            } else {
                ctx.fillStyle = '#ff4444';
                ctx.fillRect(sx + 2, sy + 2, cellW - 4, cellH - 4);
                ctx.fillStyle = '#fff';
                ctx.font = `${cellW * 0.4}px monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('!', sx + cellW / 2, sy + cellH / 2);
            }

            // ── 状态文字（调试用） ──
            if (typeof window !== 'undefined' && window.__showCollisionBox) {
                ctx.save();
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.font = '10px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(m.state, sx + cellW / 2, sy - 4);
                ctx.restore();
            }
        }
    }

    /**
     * 绘制 Boss 预览（用于素材质检）
     * 在屏幕坐标中绘制，位置由网格坐标指定
     */
    _drawBossPreviews(bossPreviews, cellW, cellH, camIntX, camIntY, camFracX, camFracY) {
        const ctx = this.ctx;
        for (const bp of bossPreviews) {
            const sx = Math.round(this.gridOffsetX + (bp.gx - camIntX) * cellW - camFracX * cellW);
            const sy = Math.round(this.gridOffsetY + (bp.gy - camIntY) * cellH - camFracY * cellH);

            const frame = bp.anim[Math.floor(bp.frameIdx) % bp.anim.length];
            if (frame && frame.complete && frame.naturalWidth > 0) {
                // 以玩家身高为基准（42px char × 1.2 playerScale = 50.4px），Boss ≈ 4× = 202px
                const playerPixelH = 42 * (cellW / 40) * 1.2;
                const targetH = Math.round(playerPixelH * 4);
                const scale = targetH / frame.naturalHeight;
                const dw = Math.round(frame.naturalWidth * scale);
                const dh = targetH;
                const dx = Math.round(sx + (cellW - dw) / 2);
                const dy = Math.round(sy + cellH - dh);
                ctx.shadowColor = 'rgba(255, 100, 0, 0.3)';
                ctx.shadowBlur = 12;
                ctx.drawImage(frame, dx, dy, dw, dh);
                ctx.shadowBlur = 0;
            } else {
                // 加载失败时回退：橙色框
                ctx.fillStyle = 'rgba(255, 100, 0, 0.3)';
                ctx.fillRect(sx + 2, sy + 2, cellW - 4, cellH - 4);
                ctx.fillStyle = '#ff8800';
                ctx.font = `${Math.round(cellW * 0.3)}px monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('?', sx + cellW / 2, sy + cellH / 2);
            }

            // 标签
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.font = '9px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(bp.label, sx + cellW / 2, sy - 2);
        }
    }

    /**
     * 用弧度直接绘制扇形，支持平滑朝向动画
     */
    _drawSectorRad(ctx, cx, cy, radius, facingRad, fovAngle, color) {
        const halfFov = (fovAngle / 2) * Math.PI / 180;
        const startA = facingRad - halfFov;
        const endA = facingRad + halfFov;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, Math.max(radius, 1), startA, endA);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
    }

    /**
     * 绘制威胁检测指示器
     */
    _drawThreatIndicator(monsters, ctx, screenW, screenH) {
        let maxLevel = 0; // 0=none, 1=hearing, 2=alert, 3=detect
        for (const m of monsters) {
            if (!m.detection) continue;
            if (m.detection.detect) { maxLevel = 3; break; }
            if (m.detection.alert && maxLevel < 2) maxLevel = 2;
            if (m.detection.hearing && maxLevel < 1) maxLevel = 1;
        }
        if (maxLevel === 0) return;

        const colors = {
            1: { bar: 'rgba(255,255,100,0.5)', text: '#ffcc00', label: '⚠ 有动静' },
            2: { bar: 'rgba(255,150,0,0.6)', text: '#ff8800', label: '⚠ 警戒中' },
            3: { bar: 'rgba(255,0,0,0.7)', text: '#ff3333', label: '⚠ 被察觉！' },
        };
        const c = colors[maxLevel];

        // 右侧彩色条
        ctx.fillStyle = c.bar;
        ctx.fillRect(screenW - 6, 0, 6, screenH);

        // 右上角文字
        ctx.save();
        ctx.fillStyle = c.text;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(c.label, screenW - 12, 8);
        ctx.restore();
    }

    // ─────── 调试：隐藏房间高亮 ───────

    _drawHiddenRoomHighlight(cellW, cellH) {
        // 仅在有 hiddenRooms 数据时绘制
        const grid = this._debugGrid;
        if (!grid || !window.__mazeData || !window.__mazeData.hiddenRooms) return;

        const ctx = this.ctx;
        const vp = this.camera.getViewport();

        for (const room of window.__mazeData.hiddenRooms) {
            for (let dy = 0; dy < room.height; dy++) {
                for (let dx = 0; dx < room.width; dx++) {
                    const gx = room.gridCol + dx;
                    const gy = room.gridRow + dy;
                    const sx = this.gridOffsetX + (gx - vp.camIntX) * cellW - vp.camFracX * cellW;
                    const sy = this.gridOffsetY + (gy - vp.camIntY) * cellH - vp.camFracY * cellH;
                    ctx.save();
                    ctx.fillStyle = 'rgba(255, 50, 255, 0.25)';
                    ctx.fillRect(sx, sy, cellW, cellH);
                    ctx.strokeStyle = 'rgba(255, 0, 255, 0.5)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(sx, sy, cellW, cellH);
                    ctx.restore();
                }
            }
        }
    }
}
