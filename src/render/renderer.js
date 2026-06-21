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
                stealthActive, meatPositions, stoneTarget, bossPatrol, noiseLevel,
                playerCredits, damageFlashTimer, gameOverActive } = state;
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

        // ── 怪物感知范围 + 怪物本体（绝对屏幕坐标） ──
        if (monsters && monsters.length > 0) {
            this._drawMonsters(monsters, cellW, cellH, camIntX, camIntY, camFracX, camFracY, grid);
        }

        // ── 准备玩家屏幕坐标 ──
        const playerScreenX = this.gridOffsetX + (playerPixelX / cellW - camIntX) * cellW - camFracX * cellW;
        const playerScreenY = this.gridOffsetY + (playerPixelY / cellH - camIntY) * cellH - camFracY * cellH;
        this.spriteRenderer.direction = playerDirection;
        this.spriteRenderer.isMoving = playerIsMoving;

        // ── Y 轴深度排序：Boss 与玩家 ──
        // 伪3D俯视角中 Y 更大的物体更靠近镜头（屏幕下方），应后绘制
        const bossCloser = bossPatrol && bossPatrol.pixelY > playerPixelY;

        // 隐身时玩家半透明
        const drawPlayer = () => {
            if (stealthActive) {
                ctx.save();
                ctx.globalAlpha = 0.35;
            }
            this.spriteRenderer.draw(playerScreenX, playerScreenY, cellW);
            if (stealthActive) ctx.restore();
        };

        if (bossCloser) {
            // Boss 更近 → 先画玩家（在后方），再画 Boss（在前方）
            drawPlayer();
            this._drawBossPatrol(bossPatrol, cellW, cellH, camIntX, camIntY, camFracX, camFracY);
        } else {
            // 玩家更近（或没有 Boss）→ 先画 Boss（在后方），再画玩家（在前方）
            if (bossPatrol) {
                this._drawBossPatrol(bossPatrol, cellW, cellH, camIntX, camIntY, camFracX, camFracY);
            }
            drawPlayer();
        }

        // ── 玩家脚步声范围（调试开关，默认开） ──
        if (typeof window !== 'undefined' && window.__showPlayerHearingRange) {
            const nl = noiseLevel ?? 1;
            const effectiveGrids = Math.round(5 * nl); // 默认听觉 5 格 × 噪音倍率
            const hearingRadius = effectiveGrids * cellW;
            const dim = stealthActive ? 0.4 : 1;

            // 墙体遮挡后的脚步声范围
            const occPts = this._getOccludedSectorPoints(
                playerScreenX, playerScreenY, hearingRadius,
                0, Math.PI * 2, 5, grid,
                this.gridOffsetX, this.gridOffsetY, cellW, cellH,
                camIntX, camIntY, camFracX, camFracY
            );

            ctx.save();
            // 填充（多边形）
            ctx.beginPath();
            ctx.moveTo(occPts[0].x, occPts[0].y);
            for (let i = 1; i < occPts.length; i++) {
                ctx.lineTo(occPts[i].x, occPts[i].y);
            }
            ctx.closePath();
            ctx.fillStyle = `rgba(255, 200, 100, ${0.05 * dim})`;
            ctx.fill();

            // 描边（只画外圈边界，不画回到中心的线）
            ctx.beginPath();
            ctx.moveTo(occPts[1].x, occPts[1].y);
            for (let i = 2; i < occPts.length; i++) {
                ctx.lineTo(occPts[i].x, occPts[i].y);
            }
            ctx.strokeStyle = `rgba(255, 200, 100, ${0.25 * dim})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 6]);
            ctx.stroke();
            ctx.setLineDash([]);

            // 标签（找实际最上和最下边界点）
            let topPt = occPts[1], bottomPt = occPts[1];
            for (let i = 2; i < occPts.length; i++) {
                if (occPts[i].y < topPt.y) topPt = occPts[i];
                if (occPts[i].y > bottomPt.y) bottomPt = occPts[i];
            }
            ctx.fillStyle = `rgba(255, 200, 100, ${0.45 * dim})`;
            ctx.font = '11px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const label = nl < 1 ? `脚步声 ${effectiveGrids} 格 (静步)` : `脚步声 ${effectiveGrids} 格`;
            ctx.fillText(label, topPt.x, topPt.y - 2);
            ctx.fillStyle = `rgba(255, 200, 100, ${0.25 * dim})`;
            ctx.font = '9px monospace';
            ctx.textBaseline = 'top';
            // 底部标签
            ctx.fillText('圈内怪物若面朝你即可听见', bottomPt.x, bottomPt.y + 4);
            ctx.restore();
        }

        // ── 调试碰撞盒 ──
        if (typeof window !== 'undefined' && window.__showCollisionBox) {
            // 玩家碰撞盒
            this._drawCollisionBox(playerPixelX, playerPixelY, cellW, cellH);

            // 玩家 Sprite 边框 + 地面原点
            this._drawSpriteBounds({ pixelX: playerPixelX, pixelY: playerPixelY }, cellW, cellH, camIntX, camIntY, camFracX, camFracY, 'player');

            // Boss 碰撞盒
            if (bossPatrol) {
                this._drawBossCollisionBox(bossPatrol, cellW, cellH, camIntX, camIntY, camFracX, camFracY);
            }

            // Boss Sprite 边框 + 地面原点
            if (bossPatrol) {
                this._drawSpriteBounds(bossPatrol, cellW, cellH, camIntX, camIntY, camFracX, camFracY, 'boss');
            }

            // 墙体/宝箱碰撞盒（需在网格坐标系中绘制）
            ctx.save();
            const gtx = Math.round(this.gridOffsetX - camFracX * cellW);
            const gty = Math.round(this.gridOffsetY - camFracY * cellH);
            ctx.translate(gtx, gty);
            ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            for (const vc of visibleCells) {
                if (isWallCell(vc.cell) || vc.cell === CELL.CHEST) {
                    ctx.strokeRect(vc.cellX + 1, vc.cellY + 1, cellW - 2, cellH - 2);
                }
            }
            ctx.setLineDash([]);
            ctx.restore();
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

        // ── 伤害闪红效果 ──
        if (damageFlashTimer > 0) {
            ctx.save();
            const intensity = Math.min(1, damageFlashTimer / 300);
            ctx.fillStyle = `rgba(255, 0, 0, ${0.2 * intensity})`;
            ctx.fillRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
            ctx.restore();
        }

        // ── 血量显示（爱心） ──
        if (!gameOverActive && playerCredits !== undefined) {
            ctx.save();
            ctx.font = '18px serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            const hearts = '❤️'.repeat(Math.max(0, playerCredits));
            const emptyHearts = '🖤'.repeat(Math.max(0, 3 - playerCredits));
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(8, 8, 100, 30);
            ctx.fillStyle = '#fff';
            ctx.fillText(hearts + emptyHearts, 14, 12);
            ctx.restore();
        }

        // ── 游戏结束画面 ──
        if (gameOverActive) {
            ctx.save();
            // 半透黑背景
            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
            ctx.fillRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
            // 标题
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 48px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('游戏失败', (this.canvas.width / this.dpr) / 2, (this.canvas.height / this.dpr) / 2 - 20);
            // 提示文字
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '16px monospace';
            ctx.fillText('按 R 重新开始', (this.canvas.width / this.dpr) / 2, (this.canvas.height / this.dpr) / 2 + 30);
            ctx.restore();
        }
    }

    // ─────── 调试：碰撞盒 ───────

    _drawCollisionBox(px, py, cellW, cellH) {
        const ctx = this.ctx;
        // 与 checkCollision 完全一致的碰撞盒尺寸
        const halfW = cellW * 0.315; // 12.6px
        const bottomH = cellH * 0.2; // 8px

        // 像素坐标 → 屏幕坐标
        const vp = this.camera.getViewport();
        const sx = this.gridOffsetX + (px / cellW - vp.camIntX) * cellW - vp.camFracX * cellW;
        const sy = this.gridOffsetY + (py / cellH - vp.camIntY) * cellH - vp.camFracY * cellH;

        // 碰撞盒：底部在 sy，向上延伸 bottomH
        const left = sx - halfW;
        const right = sx + halfW;
        const top = sy - bottomH;
        const bottom = sy;

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(left, top, right - left, bottom - top);
        ctx.fillStyle = 'rgba(255, 255, 0, 0.1)';
        ctx.fillRect(left, top, right - left, bottom - top);

        // 脚部中心点（碰撞盒底部中点）
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
    _drawMonsters(monsters, cellW, cellH, camIntX, camIntY, camFracX, camFracY, grid) {
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
            {
                // 听觉：墙体遮挡
                const hearingRadiusPx = 5 * cellW;
                const halfHearing = (120 / 2) * Math.PI / 180;
                const hearingOcc = this._getOccludedSectorPoints(
                    centerX, centerY, hearingRadiusPx,
                    facingRad - halfHearing, facingRad + halfHearing, 5, grid,
                    this.gridOffsetX, this.gridOffsetY, cellW, cellH,
                    camIntX, camIntY, camFracX, camFracY
                );
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(hearingOcc[0].x, hearingOcc[0].y);
                for (let i = 1; i < hearingOcc.length; i++) {
                    ctx.lineTo(hearingOcc[i].x, hearingOcc[i].y);
                }
                ctx.closePath();
                ctx.fillStyle = m.detection?.hearing
                    ? 'rgba(255, 255, 180, 0.12)' : 'rgba(255, 255, 180, 0.05)';
                ctx.fill();
                ctx.restore();
            }
            // 警觉、察觉（视觉，不受墙体遮挡）
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

            // ── ALERTED 状态：头顶闪烁"!"标记 ──
            if (m.state === 'alerted') {
                ctx.save();
                const pulse = 1 + Math.sin(performance.now() / 80) * 0.15;
                ctx.font = `bold ${Math.round(cellW * 0.5 * pulse)}px monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillStyle = '#ff3300';
                ctx.shadowColor = '#ff3300';
                ctx.shadowBlur = 8;
                ctx.fillText('❗', sx + cellW / 2, sy - 2);
                ctx.restore();
            }

            // ── 碰撞盒 + 怪物信息（调试用） ──
            if (typeof window !== 'undefined' && window.__showCollisionBox) {
                ctx.save();
                // ── 碰撞区域圆 ──
                const mRadius = cellW * 0.35;
                ctx.strokeStyle = 'rgba(255, 200, 0, 0.6)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(centerX, centerY, mRadius, 0, Math.PI * 2);
                ctx.stroke();
                // ── 怪物格边界 ──
                ctx.strokeStyle = 'rgba(255, 200, 0, 0.25)';
                ctx.lineWidth = 1;
                ctx.setLineDash([2, 2]);
                ctx.strokeRect(sx, sy, cellW, cellH);
                ctx.setLineDash([]);
                // ── 朝向线 ──
                ctx.strokeStyle = 'rgba(255, 200, 0, 0.15)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(centerX + Math.cos(facingRad) * cellW * 0.6, centerY + Math.sin(facingRad) * cellW * 0.6);
                ctx.stroke();

                // ── 信息面板（半透背景 + 多行文字） ──
                const infoLines = [
                    `[${m.type}] ${m.state}`,
                    `g:${m.gridX},${m.gridY}  p:${m.pixelX.toFixed(1)},${m.pixelY.toFixed(1)}`,
                    `检测: ${m.detection?.hearing ? '👂' : '_'}${m.detection?.alert ? '⚠️' : '_'}${m.detection?.detect ? '🔴' : '_'}`,
                ];
                const fontSize = 9;
                ctx.font = `${fontSize}px monospace`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                const lineH = fontSize + 2;
                const panelW = Math.round(cellW * 2.2);
                const panelH = infoLines.length * lineH + 4;
                const panelX = sx + cellW + 2;
                const panelY = sy;
                // 背景
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.fillRect(panelX, panelY, panelW, panelH);
                // 文字
                ctx.fillStyle = 'rgba(255,255,220,0.8)';
                infoLines.forEach((line, i) => {
                    ctx.fillText(line, panelX + 2, panelY + 2 + i * lineH);
                });
                ctx.restore();
            }
        }
    }

    /**
     * 绘制 Boss 碰撞盒（调试用）
     * 严格按素材定义：锚点 (256,256) 相对左上角，碰撞盒以锚点为中心 x±96, y±24
     */
    /**
     * 绘制 Sprite 边框和地面原点（调试用）
     * entity 支持两种格式：
     *   - 玩家：{ pixelX, pixelY }（无 frames）
     *   - Boss：{ pixelX, pixelY, frames: { walk, idle, turnBack } }
     */
    _drawSpriteBounds(entity, cellW, cellH, camIntX, camIntY, camFracX, camFracY, type) {
        const ctx = this.ctx;
        const screenX = this.gridOffsetX + (entity.pixelX / cellW - camIntX) * cellW - camFracX * cellW;
        const screenY = this.gridOffsetY + (entity.pixelY / cellH - camIntY) * cellH - camFracY * cellH;

        let bx, by, bw, bh; // sprite bounds

        if (type === 'player') {
            const bbox = this.spriteRenderer.getCurrentBBox(screenX, screenY, cellW);
            bx = bbox.x; by = bbox.y; bw = bbox.w; bh = bbox.h;
        } else {
            // Boss: 从 entity.frames 取第一帧计算尺寸
            const frames = entity.frames;
            if (!frames || !frames.walk || !frames.walk.length) return;
            const frame = frames.walk[0];
            const playerPixelH = 42 * (cellW / 40) * 1.2;
            const targetH = Math.round(playerPixelH * 4);
            const sc = targetH / frame.naturalHeight;
            const dw = Math.round(frame.naturalWidth * sc);
            const dh = targetH;
            bx = Math.round(screenX - dw / 2);
            // Boss 锚点 (256,256) 对齐 screenY → 图片顶部 by = screenY - 256*sc
            by = Math.round(screenY - 256 * sc);
            bw = dw;
            bh = dh;
        }

        // Sprite 边框（淡青色虚线）
        ctx.save();
        ctx.strokeStyle = type === 'player' ? 'rgba(0, 255, 255, 0.7)' : 'rgba(0, 200, 255, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.setLineDash([]);

        // 地面原点（大圆点）
        ctx.fillStyle = type === 'player' ? '#00ff88' : '#ff8800';
        ctx.beginPath();
        ctx.arc(screenX, screenY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 从地面原点向 Sprite 顶部画一条垂直线（标记 "脚底→头顶" 距离）
        ctx.strokeStyle = type === 'player' ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 136, 0, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenX, by);
        ctx.stroke();
        ctx.setLineDash([]);

        // 标签
        ctx.fillStyle = type === 'player' ? '#00ff88' : '#ff8800';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(type === 'player' ? 'PLAYER·原点' : 'BOSS·原点', screenX + 8, screenY - 2);
        ctx.restore();
    }

    _drawBossCollisionBox(boss, cellW, cellH, camIntX, camIntY, camFracX, camFracY) {
        const ctx = this.ctx;

        // Boss 屏幕坐标（图片底部中心）
        const sx = Math.round(this.gridOffsetX + (boss.pixelX / cellW - camIntX) * cellW - camFracX * cellW);
        const sy = Math.round(this.gridOffsetY + (boss.pixelY / cellH - camIntY) * cellH - camFracY * cellH);

        // 使用 boss 存储的原始素材碰撞数据 + 缩放系数
        const sc = boss.collisionScale;
        const c = boss.collision;

        // 锚点屏幕坐标：sy 直接对应素材锚点 (256,256)
        const anchorX = sx;
        const anchorY = sy;

        // 碰撞盒以锚点为中心（缩放后尺寸）
        const halfW = c.halfW * sc;
        const halfH = c.halfH * sc;
        const left = anchorX - halfW;
        const top = anchorY - halfH;
        const w = halfW * 2;
        const h = halfH * 2;

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 0, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(left, top, w, h);
        // 锚点标记
        ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
        ctx.beginPath();
        ctx.arc(anchorX, anchorY, 3, 0, Math.PI * 2);
        ctx.fill();
        // 标注文字
        ctx.fillStyle = 'rgba(255, 0, 255, 0.7)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('BOSS', left + w / 2, top - 4);
        ctx.restore();
    }

    /**
     * 绘制 Boss 巡逻（使用新版 512×320 素材）
     * 用像素坐标绘制（与玩家一致），支持 3 种动画状态 + 水平翻转
     */
    _drawBossPatrol(boss, cellW, cellH, camIntX, camIntY, camFracX, camFracY) {
        const ctx = this.ctx;
        const frames = boss.frames;

        // 选取当前帧
        let frame;
        let flip = false;

        if (boss.state === 'walking') {
            frame = frames.walk[Math.min(boss.frameIdx, frames.walk.length - 1)];
            flip = !boss.facingRight;
        } else if (boss.state === 'idle') {
            frame = frames.idle[Math.min(boss.frameIdx, frames.idle.length - 1)];
            flip = !boss.facingRight;
        } else { // turning
            // turnBack 动画：右→左播放正向，左→右播放反向
            const total = frames.turnBack.length;
            const normIdx = Math.min(boss.frameIdx, total - 1);
            const turnIdx = boss.facingRight ? normIdx : (total - 1 - normIdx);
            frame = frames.turnBack[turnIdx];
            flip = false; // 动画本身已处理方向
        }

        if (!frame || !frame.complete || frame.naturalWidth === 0) {
            // 加载失败回退：橙色问号
            const sx = Math.round(this.gridOffsetX + (boss.gx - camIntX) * cellW - camFracX * cellW);
            const sy = Math.round(this.gridOffsetY + (boss.gy - camIntY) * cellH - camFracY * cellH);
            ctx.fillStyle = 'rgba(255, 100, 0, 0.3)';
            ctx.fillRect(sx + 2, sy + 2, cellW - 4, cellH - 4);
            ctx.fillStyle = '#ff8800';
            ctx.font = `${Math.round(cellW * 0.3)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', sx + cellW / 2, sy + cellH / 2);
            return;
        }

        // 屏幕坐标（与玩家像素坐标一致）
        const screenX = this.gridOffsetX + (boss.pixelX / cellW - camIntX) * cellW - camFracX * cellW;
        const screenY = this.gridOffsetY + (boss.pixelY / cellH - camIntY) * cellH - camFracY * cellH;

        // 缩放：以玩家身高为基准（42 × 1.2 = 50.4px），Boss ≈ 4×
        const playerPixelH = 42 * (cellW / 40) * 1.2;
        const targetH = Math.round(playerPixelH * 4);
        const scale = targetH / frame.naturalHeight; // 512×320 → ~202px
        const dw = Math.round(frame.naturalWidth * scale);
        const dh = targetH;

        const dx = Math.round(screenX - dw / 2);
        // 锚点 (256,256) 对齐 screenY → 图片顶部 dy = screenY - 256*scale
        const dy = Math.round(screenY - 256 * scale);

        // 辉光效果
        ctx.save();
        ctx.shadowColor = 'rgba(255, 100, 0, 0.3)';
        ctx.shadowBlur = 12;

        if (flip) {
            ctx.save();
            ctx.translate(dx + dw, dy);
            ctx.scale(-1, 1);
            ctx.drawImage(frame, 0, 0, dw, dh);
            ctx.restore();
        } else {
            ctx.drawImage(frame, dx, dy, dw, dh);
        }

        ctx.restore();
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
     * 射线投射：计算被墙体遮挡的扇形/圆形边界点（屏幕像素坐标）
     * @param {number} cx - 屏幕像素中心 X
     * @param {number} cy - 屏幕像素中心 Y
     * @param {number} radiusPixels - 最大半径（像素）
     * @param {number} startAngle - 起始弧度
     * @param {number} endAngle - 结束弧度
     * @param {number} stepDeg - 角度步长（度）
     * @param {number[][]} grid
     * @returns {{x:number,y:number}[]} 边界点数组（含中心点，适合 moveTo/lineTo/closePath）
     */
    _getOccludedSectorPoints(cx, cy, radiusPixels, startAngle, endAngle, stepDeg, grid,
                              gridOffsetX, gridOffsetY, cellW, cellH,
                              camIntX, camIntY, camFracX, camFracY) {
        // 屏幕中心 → 世界网格坐标
        const centerGX = (cx - gridOffsetX) / cellW + camIntX + camFracX;
        const centerGY = (cy - gridOffsetY) / cellH + camIntY + camFracY;
        const stepRad = stepDeg * Math.PI / 180;
        const numSteps = Math.max(1, Math.ceil((endAngle - startAngle) / stepRad));
        const points = [{ x: cx, y: cy }];
        const totalRows = grid.length;
        const totalCols = grid[0].length;

        for (let i = 0; i <= numSteps; i++) {
            const ang = startAngle + i * stepRad;
            const dirX = Math.cos(ang);
            const dirY = Math.sin(ang);

            // 沿射线行走，步长=1 格
            let maxDistPixels = radiusPixels;
            let endGX = centerGX + dirX * radiusPixels / cellW;
            let endGY = centerGY + dirY * radiusPixels / cellH;
            for (let d = cellW; d < maxDistPixels; d += cellW) {
                const gx = Math.floor(centerGX + dirX * d / cellW);
                const gy = Math.floor(centerGY + dirY * d / cellW);
                if (gx < 0 || gx >= totalCols || gy < 0 || gy >= totalRows) break;
                const cell = grid[gy][gx];
                if (cell === CELL.WALL || cell === CELL.HIDDEN_WALL) {
                    // 碰到墙：把端点设到墙前一格
                    const prevD = d - cellW;
                    endGX = centerGX + dirX * prevD / cellW;
                    endGY = centerGY + dirY * prevD / cellW;
                    break;
                }
            }

            // 世界坐标 → 屏幕像素
            const sx = gridOffsetX + (endGX - camIntX) * cellW - camFracX * cellW;
            const sy = gridOffsetY + (endGY - camIntY) * cellH - camFracY * cellH;
            points.push({ x: sx, y: sy });
        }

        return points;
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
