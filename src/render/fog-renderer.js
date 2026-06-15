/**
 * 迷雾渲染模块
 *
 * 迷雾分层渲染：
 * - 已探索缓冲区：半透明迷雾 rgba(10,12,20,0.48)，仅显示墙体/地面
 * - 渐消中：迷雾帧在 0.5s 内从 90% 渐隐到 0
 * - 未探索区：纯黑格子覆盖
 *   - 边缘第1圈（edgeDist1）：黑色透明 + 迷雾帧 90% 叠加
 *   - 边缘第2圈（edgeDist2）：纯黑底色 + 迷雾帧 60% 叠加
 *   - 边缘第3圈（edgeDist3）：纯黑底色 + 迷雾帧 25% 叠加
 *   - 远离可见区：纯黑底色，无迷雾帧
 * - 视野区域（~3格圆形）：由 destination-out 挖除，完全透明
 *
 * 使用离屏 canvas + destination-out 合成实现视野镂空。
 */

const DEFAULT_OPTIONS = {
    circleRatio: 1.28,
    frameScale: 2.8,
    cellMult: 0.7,
    normalInner: 2,
    normalOuter: 4.5,
    boostInner: 4,
    boostOuter: 7,
    dissolveMs: 500,
    fogFrames: [],
    flickerAmp: 1,
    flickerSpeed: 1,
};

const RENDER_BUFFER = 2;

export class FogRenderer {
    /**
     * @param {CanvasRenderingContext2D} ctx - 主 canvas 的 2D 上下文
     * @param {Object} [options]
     */
    constructor(ctx, options = {}) {
        this.ctx = ctx;
        this.opts = { ...DEFAULT_OPTIONS, ...options };
        this._fogCanvas = null;
        this._fogCtx = null;
        this._frameIndex = 0;
    }

    /** 外部设置迷雾帧数组 */
    setFogFrames(frames) {
        this.opts.fogFrames = frames || [];
    }

    /** 更新迷雾帧动画（由主循环每帧调用） */
    updateAnimation(dt) {
        const frames = this.opts.fogFrames;
        if (!frames || frames.length === 0) return;
        this._frameTimer = (this._frameTimer || 0) + dt * 1000;
        const frameTime = (1000 / 6) * 1.75;
        this._frameIndex = Math.floor((this._frameTimer / frameTime) % frames.length);
    }

    /**
     * 将圆形范围内未见的格子标记为已见（同 mist.html updateSeenCells）
     */
    _updateSeenCells(pixelX, pixelY, radius, seenCells, seenCellsTime, totalCols, totalRows, cellSize, now) {
        const cellsRadius = Math.ceil(radius / cellSize) + 1;
        const centerGX = Math.round(pixelX / cellSize);
        const centerGY = Math.round(pixelY / cellSize);
        const minGX = Math.max(0, centerGX - cellsRadius);
        const maxGX = Math.min(totalCols - 1, centerGX + cellsRadius);
        const minGY = Math.max(0, centerGY - cellsRadius);
        const maxGY = Math.min(totalRows - 1, centerGY + cellsRadius);
        const radiusSq = (radius / cellSize) * (radius / cellSize) * 1.3;

        for (let gy = minGY; gy <= maxGY; gy++) {
            for (let gx = minGX; gx <= maxGX; gx++) {
                const dcx = gx + 0.5 - centerGX;
                const dcy = gy + 0.5 - centerGY;
                if (dcx * dcx + dcy * dcy <= radiusSq) {
                    const key = `${gy},${gx}`;
                    if (!seenCells.has(key)) {
                        seenCellsTime[key] = now;
                    }
                    seenCells.add(key);
                }
            }
        }
    }

    /**
     * 视野镂空 — 火把式忽闪效果
     *
     * - ~35px 羽化边缘，从全透明平滑过渡到迷雾
     * - 呼吸缩放 90%~120%，周期随机变化，营造火把照明般的忽闪感
     */
    _drawVisionCutout(ctx, cx, cy, innerR, outerR, time, opts) {
        // ── 火把式呼吸：振幅 90%~120%，频率随时间随机变化 ──
        const flickerAmp = (opts && opts.flickerAmp !== undefined) ? opts.flickerAmp : 1;
        const flickerSpeed = (opts && opts.flickerSpeed !== undefined) ? opts.flickerSpeed : 1;

        const slowPhase = time * (0.6 + Math.sin(time * 0.08) * 0.3) * flickerSpeed;
        const fastPhase1 = time * (2.0 + Math.sin(time * 0.12) * 1.0) * flickerSpeed;
        const fastPhase2 = time * (3.5 + Math.sin(time * 0.2) * 1.5) * flickerSpeed;

        const breathe = 1.05
            + Math.sin(slowPhase) * 0.10 * flickerAmp    // ±0.10 → 慢速主呼吸
            + Math.sin(fastPhase1) * 0.04 * flickerAmp   // ±0.04 → 中速闪烁
            + Math.sin(fastPhase2) * 0.03 * flickerAmp;  // ±0.03 → 快速抖动
        // 范围 ≈ [0.88, 1.22]

        // ── 羽化参数 ──
        const innerClearR = innerR * 0.85 * breathe;  // 完全清除半径（带呼吸）
        const featherR = innerClearR + 35;             // 35px 羽化过渡
        const maxExtent = featherR * 1.8;              // fillRect 覆盖范围

        // ── 主挖除层 + 羽化 ──
        const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, featherR);
        const clearFrac = innerClearR / featherR;

        g1.addColorStop(0, 'rgba(0,0,0,1)');
        g1.addColorStop(clearFrac, 'rgba(0,0,0,1)');

        // 羽化区内插 5 个色标，平滑过渡
        const fStep = (1 - clearFrac) / 5;
        g1.addColorStop(clearFrac + fStep * 1, 'rgba(0,0,0,0.75)');
        g1.addColorStop(clearFrac + fStep * 2, 'rgba(0,0,0,0.45)');
        g1.addColorStop(clearFrac + fStep * 3, 'rgba(0,0,0,0.20)');
        g1.addColorStop(clearFrac + fStep * 4, 'rgba(0,0,0,0.06)');
        g1.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = g1;
        ctx.fillRect(cx - maxExtent, cy - maxExtent, maxExtent * 2, maxExtent * 2);

        // ── 柔和外围辉光（减淡，配合羽化） ──
        const glowR = featherR * 1.12;
        const g2 = ctx.createRadialGradient(cx, cy, featherR * 0.85, cx, cy, glowR);
        g2.addColorStop(0, 'rgba(8, 10, 28, 0.10)');
        g2.addColorStop(0.5, 'rgba(6, 8, 24, 0.04)');
        g2.addColorStop(1, 'rgba(4, 6, 20, 0)');
        ctx.fillStyle = g2;
        ctx.fillRect(cx - maxExtent, cy - maxExtent, maxExtent * 2, maxExtent * 2);

        // ── 微光闪烁（与呼吸联动） ──
        const shimmer = (Math.sin(time * 1.3 + cx * 0.01) * 0.5 + 0.5) * 0.05;
        const shimmerR = featherR * 1.06;
        const g3 = ctx.createRadialGradient(cx, cy, featherR * 0.7, cx, cy, shimmerR);
        g3.addColorStop(0, `rgba(10, 14, 32, ${shimmer})`);
        g3.addColorStop(0.5, `rgba(8, 10, 28, ${shimmer * 0.4})`);
        g3.addColorStop(1, 'rgba(4, 6, 20, 0)');
        ctx.fillStyle = g3;
        ctx.fillRect(cx - maxExtent, cy - maxExtent, maxExtent * 2, maxExtent * 2);
    }

    /**
     * 主渲染入口
     */
    render(params) {
        if (!params.fogEnabled) return;

        // ── 运行时 fogOpts 覆盖（调试面板实时调节） ──
        const opts = params.fogOpts || this.opts;

        const dpr = params.dpr || window.devicePixelRatio || 1;
        const viewW = params.screenWidth;
        const viewH = params.screenHeight;
        const cellSize = params.cellSize;

        // 玩家屏幕位置（用于 cutout），与 fog 格子保持对齐
        const playerAbsX = Math.round(params.playerAbsX);
        const playerAbsY = Math.round(params.playerAbsY);

        // 视野半径
        const innerR = (params.boosterActive ? opts.boostInner : opts.normalInner)
            * cellSize * opts.cellMult;
        const outerR = (params.boosterActive ? opts.boostOuter : opts.normalOuter)
            * cellSize * opts.cellMult;

        // Step 1: 更新 seenCells
        this._updateSeenCells(
            params.playerPixelX, params.playerPixelY, outerR,
            params.seenCells, params.seenCellsTime,
            params.totalCols, params.totalRows, cellSize,
            params.now
        );

        const camIntX = Math.floor(params.renderCamX);
        const camIntY = Math.floor(params.renderCamY);
        const camFracX = params.renderCamX - camIntX;
        const camFracY = params.renderCamY - camIntY;
        const extraCols = camFracX > 0.001 ? 1 : 0;
        const extraRows = camFracY > 0.001 ? 1 : 0;
        const totalCols = params.totalCols;
        const totalRows = params.totalRows;
        const viewCols = params.viewCols || 10;
        const viewRows = params.viewRows || 12;

        // 离屏 fog canvas
        if (!this._fogCanvas || this._fogCanvas.width !== viewW * dpr) {
            this._fogCanvas = document.createElement('canvas');
            this._fogCanvas.width = viewW * dpr;
            this._fogCanvas.height = viewH * dpr;
            this._fogCanvas.style.width = viewW + 'px';
            this._fogCanvas.style.height = viewH + 'px';
            this._fogCtx = this._fogCanvas.getContext('2d');
            this._fogCtx.imageSmoothingEnabled = false;
            this._fogCtx.scale(dpr, dpr);
        }

        const fogCtx = this._fogCtx;
        // 完全清空（透明），不再填充底色
        fogCtx.clearRect(0, 0, viewW, viewH);

        // 迷雾帧
        const frames = this.opts.fogFrames;
        const hasFrame = frames && frames.length > 0
            && frames[0] && frames[0].complete && frames[0].naturalWidth > 0;
        const fogFrame = hasFrame ? frames[this._frameIndex || 0] : null;
        const circleR = cellSize * opts.circleRatio;
        const frameSize = Math.round(circleR * opts.frameScale);
        const dissolveMs = opts.dissolveMs;
        const now = params.now || performance.now();

        // ── Phase 1: 格子分类 ──
        const fullySeenSet = new Set();
        const dissolvingMap = new Map();

        for (let vy = -RENDER_BUFFER; vy < viewRows + extraRows + RENDER_BUFFER; vy++) {
            for (let vx = -RENDER_BUFFER; vx < viewCols + extraCols + RENDER_BUFFER; vx++) {
                const gx = camIntX + vx;
                const gy = camIntY + vy;
                if (gx < 0 || gx >= totalCols || gy < 0 || gy >= totalRows) continue;
                const key = `${gy},${gx}`;
                if (!params.seenCells.has(key)) continue;
                const seenTime = params.seenCellsTime[key];
                if (seenTime !== undefined) {
                    const elapsed = now - seenTime;
                    if (elapsed < dissolveMs) {
                        dissolvingMap.set(key, 1 - elapsed / dissolveMs);
                    } else {
                        fullySeenSet.add(key);
                    }
                } else {
                    fullySeenSet.add(key);
                }
            }
        }

        const effectiveSeenSet = new Set(fullySeenSet);
        for (const key of dissolvingMap.keys()) {
            effectiveSeenSet.add(key);
        }

        // ── Phase 2a: 边缘距离计算（出圈 1/2/3 格） ──
        const edgeDist1 = new Set();
        const edgeDist2 = new Set();
        const edgeDist3 = new Set();

        // edgeDist1：紧邻 effectiveSeenSet
        for (let vy = -RENDER_BUFFER; vy < viewRows + extraRows + RENDER_BUFFER; vy++) {
            for (let vx = -RENDER_BUFFER; vx < viewCols + extraCols + RENDER_BUFFER; vx++) {
                const gx = camIntX + vx;
                const gy = camIntY + vy;
                if (gx < 0 || gx >= totalCols || gy < 0 || gy >= totalRows) continue;
                const key = `${gy},${gx}`;
                if (effectiveSeenSet.has(key)) continue;
                let found = false;
                for (let dy = -1; dy <= 1 && !found; dy++) {
                    for (let dx = -1; dx <= 1 && !found; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const ngx = gx + dx, ngy = gy + dy;
                        if (ngx < 0 || ngx >= totalCols || ngy < 0 || ngy >= totalRows) continue;
                        if (effectiveSeenSet.has(`${ngy},${ngx}`)) found = true;
                    }
                }
                if (found) edgeDist1.add(key);
            }
        }

        // edgeDist2：紧邻 edgeDist1
        const edgeDist2Source = new Set([...effectiveSeenSet, ...edgeDist1]);
        for (let vy = -RENDER_BUFFER; vy < viewRows + extraRows + RENDER_BUFFER; vy++) {
            for (let vx = -RENDER_BUFFER; vx < viewCols + extraCols + RENDER_BUFFER; vx++) {
                const gx = camIntX + vx;
                const gy = camIntY + vy;
                if (gx < 0 || gx >= totalCols || gy < 0 || gy >= totalRows) continue;
                const key = `${gy},${gx}`;
                if (edgeDist2Source.has(key)) continue;
                let found = false;
                for (let dy = -1; dy <= 1 && !found; dy++) {
                    for (let dx = -1; dx <= 1 && !found; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const ngx = gx + dx, ngy = gy + dy;
                        if (ngx < 0 || ngx >= totalCols || ngy < 0 || ngy >= totalRows) continue;
                        if (edgeDist1.has(`${ngy},${ngx}`)) found = true;
                    }
                }
                if (found) edgeDist2.add(key);
            }
        }

        // edgeDist3：紧邻 edgeDist2
        const edgeDist3Source = new Set([...edgeDist2Source, ...edgeDist2]);
        for (let vy = -RENDER_BUFFER; vy < viewRows + extraRows + RENDER_BUFFER; vy++) {
            for (let vx = -RENDER_BUFFER; vx < viewCols + extraCols + RENDER_BUFFER; vx++) {
                const gx = camIntX + vx;
                const gy = camIntY + vy;
                if (gx < 0 || gx >= totalCols || gy < 0 || gy >= totalRows) continue;
                const key = `${gy},${gx}`;
                if (edgeDist3Source.has(key)) continue;
                let found = false;
                for (let dy = -1; dy <= 1 && !found; dy++) {
                    for (let dx = -1; dx <= 1 && !found; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const ngx = gx + dx, ngy = gy + dy;
                        if (ngx < 0 || ngx >= totalCols || ngy < 0 || ngy >= totalRows) continue;
                        if (edgeDist2.has(`${ngy},${ngx}`)) found = true;
                    }
                }
                if (found) edgeDist3.add(key);
            }
        }

        // ── Phase 2b: 已探索缓冲区外扩 2 格 ──
        // 计算距离 fullySeenSet 1~2 格的格子，提前铺上半透明迷雾，
        // 这样渐消中（dissolvingMap）的格子也有迷雾底衬，避免"空窗期"
        const fogBufferSet = new Set();

        // Buffer 第1圈：紧邻 fullySeenSet
        for (let vy = -RENDER_BUFFER; vy < viewRows + extraRows + RENDER_BUFFER; vy++) {
            for (let vx = -RENDER_BUFFER; vx < viewCols + extraCols + RENDER_BUFFER; vx++) {
                const gx = camIntX + vx, gy = camIntY + vy;
                if (gx < 0 || gx >= totalCols || gy < 0 || gy >= totalRows) continue;
                const key = `${gy},${gx}`;
                if (effectiveSeenSet.has(key)) continue;
                let found = false;
                for (let dy = -1; dy <= 1 && !found; dy++) {
                    for (let dx = -1; dx <= 1 && !found; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const ngx = gx + dx, ngy = gy + dy;
                        if (ngx < 0 || ngx >= totalCols || ngy < 0 || ngy >= totalRows) continue;
                        if (fullySeenSet.has(`${ngy},${ngx}`)) found = true;
                    }
                }
                if (found) fogBufferSet.add(key);
            }
        }

        // Buffer 第2圈：紧邻 fogBufferSet 第1圈
        const bufferRing2 = [];
        for (const key of fogBufferSet) {
            const [gy, gx] = key.split(',').map(Number);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const ngx = gx + dx, ngy = gy + dy;
                    if (ngx < 0 || ngx >= totalCols || ngy < 0 || ngy >= totalRows) continue;
                    const nkey = `${ngy},${ngx}`;
                    if (!effectiveSeenSet.has(nkey) && !fogBufferSet.has(nkey)) {
                        bufferRing2.push(nkey);
                    }
                }
            }
        }
        for (const key of bufferRing2) fogBufferSet.add(key);

        // ── Phase 3: 绘制迷雾层 ──
        // 方案：
        //   - 半透明迷雾底色：fullySeenSet（已探索）+ dissolvingMap（渐消中）+ fogBufferSet（外扩2格）
        //   - 渐消中：迷雾帧叠加在半透明迷雾上，0.5s 内 90%→0 渐隐
        //   - 未探索区黑格子 + 迷雾帧叠加层
        const offsetX = Math.round(params.gridOffsetX - camFracX * cellSize);
        const offsetY = Math.round(params.gridOffsetY - camFracY * cellSize);

        fogCtx.save();

        for (let vy = -RENDER_BUFFER; vy < viewRows + extraRows + RENDER_BUFFER; vy++) {
            for (let vx = -RENDER_BUFFER; vx < viewCols + extraCols + RENDER_BUFFER; vx++) {
                const gx = camIntX + vx;
                const gy = camIntY + vy;
                if (gx < 0 || gx >= totalCols || gy < 0 || gy >= totalRows) continue;
                const key = `${gy},${gx}`;

                const cx = offsetX + vx * cellSize + cellSize / 2;
                const cy = offsetY + vy * cellSize + cellSize / 2;

                // ── 1a. 半透明迷雾底色 ──
                // 覆盖 3 类格子：已探索 / 渐消中 / 外扩缓冲区
                const needsFogBg = fullySeenSet.has(key) || dissolvingMap.has(key) || fogBufferSet.has(key);
                if (needsFogBg) {
                    fogCtx.fillStyle = 'rgba(10,12,20,0.48)';
                    fogCtx.fillRect(offsetX + vx * cellSize, offsetY + vy * cellSize, cellSize, cellSize);
                }

                // ── 1b. 已探索区：半透明迷雾已绘制，跳过 ──
                if (fullySeenSet.has(key)) continue;

                // ── 2. 渐消中：迷雾帧叠加在半透明迷雾上 ──
                const dissolveAlpha = dissolvingMap.get(key);
                if (dissolveAlpha !== undefined) {
                    if (fogFrame) {
                        fogCtx.globalAlpha = 0.9 * dissolveAlpha;
                        fogCtx.drawImage(fogFrame, Math.round(cx - frameSize / 2), Math.round(cy - frameSize / 2), frameSize, frameSize);
                        fogCtx.globalAlpha = 1;
                    }
                    continue;
                }

                // ── 未探索区域 ──

                // Step A: 纯黑底色（edgeDist1 透明过渡）
                if (!edgeDist1.has(key)) {
                    fogCtx.fillStyle = 'rgba(0,0,0,1)';
                    fogCtx.fillRect(offsetX + vx * cellSize, offsetY + vy * cellSize, cellSize, cellSize);
                }

                // Step B: 迷雾帧叠加层（仅边缘 3 格）
                let frameAlpha = 0;
                if (edgeDist1.has(key)) {
                    frameAlpha = 0.9;   // 最靠近 → 最清晰
                } else if (edgeDist2.has(key)) {
                    frameAlpha = 0.6;   // 中间
                } else if (edgeDist3.has(key)) {
                    frameAlpha = 0.25;  // 最远 → 最淡
                }

                if (frameAlpha > 0 && fogFrame) {
                    fogCtx.globalAlpha = frameAlpha;
                    fogCtx.drawImage(fogFrame, Math.round(cx - frameSize / 2), Math.round(cy - frameSize / 2), frameSize, frameSize);
                    fogCtx.globalAlpha = 1;
                }
            }
        }

        fogCtx.restore();

        // ── Phase 4: 视野镂空（destination-out） ──
        fogCtx.save();
        fogCtx.globalCompositeOperation = 'destination-out';
        this._drawVisionCutout(fogCtx, playerAbsX, playerAbsY, innerR, outerR, params.globalTime, opts);
        fogCtx.restore();

        // ── 合成到主 canvas ──
        this.ctx.drawImage(this._fogCanvas, 0, 0, viewW, viewH);
    }
}
