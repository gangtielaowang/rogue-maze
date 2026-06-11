/**
 * 瓦片渲染模块
 *
 * 封装 kenney_tinyDungeon 风格瓦片的选取算法和绘制逻辑。
 *   - isWall / selectWallTile / selectFloorTile — 瓦片类型选择
 *   - drawWall / drawFloorTile / drawChest / drawExit — 瓦片绘制
 *
 * 依赖 Canvas 2D API，不直接依赖 DOM（需要预加载的图片对象）。
 */

export const COLORS = {
    wall: '#2a2118',
    wallEdge: '#3d3024',
    wallShadow: '#1a1510',
    path: '#12100c',
    pathLight: '#1a1612',
    fog: '#080808',
    chest: '#c9a227',
    chestGlow: '#ffd700',
    exit: '#4ade80',
    exitGlow: '#22c55e',
    player: '#ff6b35',
    playerGlow: 'rgba(255, 107, 53, 0.4)',
};

// 单元格类型（与 src/maze/types.js 一致 + 隐藏类型扩展）
const CELL = {
    WALL: 0,
    FLOOR: 1,
    CHEST: 2,
    EXIT: 3,
    HIDDEN_WALL: 11,
    HIDDEN_FLOOR: 12,
    HIDDEN_PASSAGE: 13,
};

export class TileRenderer {
    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} tiles - 瓦片图片对象（由外部加载）
     * @param {Object} [options]
     * @param {number} [options.cellWidth=40]
     * @param {number} [options.cellHeight=40]
     * @param {boolean} [options.gridLines=false]
     */
    constructor(ctx, tiles, options = {}) {
        this.ctx = ctx;
        this.tiles = tiles;
        this.cellWidth = options.cellWidth || 40;
        this.cellHeight = options.cellHeight || 40;
        this.gridLines = options.gridLines || false;
    }

    // ─────── 网格状态查询 ───────

    /**
     * 判断某格是否为墙（含隐藏类型）
     * @param {number} gx
     * @param {number} gy
     * @param {number[][]} grid
     * @param {number} totalCols
     * @param {number} totalRows
     * @returns {boolean}
     */
    isWall(gx, gy, grid, totalCols, totalRows) {
        if (gx < 0 || gx >= totalCols || gy < 0 || gy >= totalRows) return true;
        const cell = grid[gy][gx];
        return cell === CELL.WALL || cell === CELL.HIDDEN_WALL ||
               cell === CELL.HIDDEN_FLOOR || cell === CELL.HIDDEN_PASSAGE;
    }

    /**
     * 判断某格是否为立面行（自己=墙，下方≠墙）
     */
    isFrontRowCell(gx, gy, grid, totalCols, totalRows) {
        return this.isWall(gx, gy, grid, totalCols, totalRows) &&
               !this.isWall(gx, gy + 1, grid, totalCols, totalRows);
    }

    /**
     * 位置哈希（用于加权随机）
     */
    hashPos(gx, gy) {
        return ((gx * 374761393 + gy * 668265263) & 0x7fffffff);
    }

    /**
     * 基于位置哈希的加权随机选 tile
     */
    pickWeighted(arr, gx, gy) {
        const h = this.hashPos(gx, gy);
        const r = h % 20;
        if (r < 17) return arr[0];
        if (r < 18) return arr[1];
        if (r < 19 && arr.length > 2) return arr[2];
        return arr[Math.min(3 + (r % Math.max(arr.length - 3, 1)), arr.length - 1)];
    }

    // ─────── 瓦片选择算法 ───────

    /**
     * 选择墙顶瓦片类型
     * @returns {HTMLImageElement|undefined}
     */
    selectWallTile(gx, gy, grid, totalCols, totalRows) {
        const wt = this.tiles.wall_top;
        const isW = (cx, cy) => this.isWall(cx, cy, grid, totalCols, totalRows);

        // P1: 下方暴露 → 立面
        if (!isW(gx, gy + 1)) {
            return this.getFrontFaceTile(gx, gy, grid, totalCols, totalRows);
        }

        // P2: 正下方是立面 → 匹配立面类型
        if (this.isFrontRowCell(gx, gy + 1, grid, totalCols, totalRows)) {
            const belowType = this.getFrontFaceType(gx, gy + 1, grid, totalCols, totalRows);
            if (belowType === 'edge_l') return wt.side_to_front_l;
            if (belowType === 'edge_r') return wt.side_to_front_r;
            return wt.edge_h[0];
        }

        const gTop = !isW(gx, gy - 1);
        const gLft = !isW(gx - 1, gy);
        const gRgt = !isW(gx + 1, gy);

        // P3: 凸角
        if (gTop && gLft) return wt.outer_tl;
        if (gTop && gRgt) return wt.outer_tr;

        // P4: 凹角
        if (!gTop && !gLft && !isW(gx - 1, gy - 1)) return wt.inner_tl;
        if (!gTop && !gRgt && !isW(gx + 1, gy - 1)) return wt.inner_tr;
        if (!gTop && !gLft && !this.isFrontRowCell(gx - 1, gy, grid, totalCols, totalRows) &&
            (!isW(gx - 1, gy + 1) || !isW(gx - 1, gy + 2))) return wt.inner_bl;
        if (!gTop && !gRgt && !this.isFrontRowCell(gx + 1, gy, grid, totalCols, totalRows) &&
            (!isW(gx + 1, gy + 1) || !isW(gx + 1, gy + 2))) return wt.inner_br;

        // P5: 顶部边缘
        if (gTop) return wt.edge_h[1];

        // P6-7: 侧边
        if (gLft || this.isFrontRowCell(gx - 1, gy, grid, totalCols, totalRows)) return wt.side_l;
        if (gRgt || this.isFrontRowCell(gx + 1, gy, grid, totalCols, totalRows)) return wt.side_r;

        // P8: 默认中心
        return this.pickWeighted(wt.center, gx, gy);
    }

    /**
     * 获取立面瓦片
     */
    getFrontFaceTile(gx, gy, grid, totalCols, totalRows) {
        const wf = this.tiles.wall_front;
        const gLft = !this.isWall(gx - 1, gy, grid, totalCols, totalRows);
        const gRgt = !this.isWall(gx + 1, gy, grid, totalCols, totalRows);

        if (gLft && gRgt) return wf.single;
        if (gLft) return wf.edge_l;
        if (gRgt) return wf.edge_r;
        return wf.center;
    }

    /**
     * 获取立面类型字符串
     */
    getFrontFaceType(gx, gy, grid, totalCols, totalRows) {
        const gLft = !this.isWall(gx - 1, gy, grid, totalCols, totalRows);
        const gRgt = !this.isWall(gx + 1, gy, grid, totalCols, totalRows);
        if (gLft && gRgt) return 'single';
        if (gLft) return 'edge_l';
        if (gRgt) return 'edge_r';
        return 'center';
    }

    /**
     * 选择地板瓦片
     */
    selectFloorTile(gx, gy, grid, totalCols, totalRows) {
        const isW = (cx, cy) => this.isWall(cx, cy, grid, totalCols, totalRows);
        const wallAbove = isW(gx, gy - 1);
        const wallLeft = isW(gx - 1, gy);
        const fl = this.tiles.floor;

        if (wallAbove && wallLeft) {
            return { tile: fl.shadow_inner, rotation: 1 };
        }
        if (isW(gx - 1, gy - 1) && !wallAbove && !wallLeft) {
            return { tile: fl.shadow_outer, rotation: 0 };
        }
        if (wallAbove) {
            return { tile: this.pickWeighted([fl.shadow_n, fl.shadow_n_stone], gx, gy), rotation: 0 };
        }
        if (wallLeft) {
            if (!isW(gx - 1, gy - 1) && isW(gx - 2, gy)) {
                return { tile: fl.shadow_outer, rotation: 1 };
            }
            return { tile: this.pickWeighted([fl.shadow_n, fl.shadow_n_stone], gx, gy), rotation: 1 };
        }
        return { tile: this.pickWeighted(fl.plain, gx, gy), rotation: 0 };
    }

    /**
     * 判断墙格是否需要绘制在玩家之上（伪3D深度排序）
     */
    shouldRenderOverPlayer(gx, gy, grid, totalCols, totalRows) {
        if (!this.isWall(gx, gy, grid, totalCols, totalRows)) return false;
        const isW = (cx, cy) => this.isWall(cx, cy, grid, totalCols, totalRows);

        // 顶部盖
        if (!isW(gx, gy - 1)) return true;
        // 立面 → 不 cover
        if (!isW(gx, gy + 1)) return false;

        // 凹角
        if (isW(gx - 1, gy) && !isW(gx - 1, gy - 1)) return true;
        if (isW(gx + 1, gy) && !isW(gx + 1, gy - 1)) return true;

        // 下方墙是立面且边缘
        if (this.isFrontRowCell(gx, gy + 1, grid, totalCols, totalRows)) {
            const belowType = this.getFrontFaceType(gx, gy + 1, grid, totalCols, totalRows);
            if (belowType === 'edge_l' || belowType === 'edge_r') return true;
        }

        const gLft = !isW(gx - 1, gy);
        const gRgt = !isW(gx + 1, gy);

        // 凹角 inner_bl/inner_br
        if (!gLft && !this.isFrontRowCell(gx - 1, gy, grid, totalCols, totalRows) &&
            (!isW(gx - 1, gy + 1) || !isW(gx - 1, gy + 2))) return true;
        if (!gRgt && !this.isFrontRowCell(gx + 1, gy, grid, totalCols, totalRows) &&
            (!isW(gx + 1, gy + 1) || !isW(gx + 1, gy + 2))) return true;

        // 侧边
        if (gLft || this.isFrontRowCell(gx - 1, gy, grid, totalCols, totalRows)) return true;
        if (gRgt || this.isFrontRowCell(gx + 1, gy, grid, totalCols, totalRows)) return true;

        return false;
    }

    // ─────── 绘制方法 ───────

    /**
     * 绘制地板瓦片（支持旋转）
     */
    drawFloorTile(x, y, w, h, result) {
        const tile = result.tile;
        const rot = result.rotation;
        if (tile && tile.complete && tile.naturalWidth > 0) {
            if (rot !== 0) {
                this.ctx.save();
                this.ctx.translate(x + w / 2, y + h / 2);
                if (rot === 1 || rot === 3) {
                    this.ctx.rotate(rot === 1 ? -Math.PI / 2 : Math.PI / 2);
                    this.ctx.drawImage(tile, -h / 2, -w / 2, h, w);
                } else {
                    this.ctx.rotate(Math.PI);
                    this.ctx.drawImage(tile, -w / 2, -h / 2, w, h);
                }
                this.ctx.restore();
            } else {
                this.ctx.drawImage(tile, x, y, w, h);
            }
        } else {
            this.ctx.fillStyle = COLORS.path;
            this.ctx.fillRect(x, y, w, h);
        }
    }

    /**
     * 绘制墙壁瓦片
     */
    drawWall(x, y, gx, gy, grid, totalCols, totalRows) {
        const { ctx, cellWidth: w, cellHeight: h } = this;

        // HIDDEN_PASSAGE 立面 → 门
        if (grid[gy]?.[gx] === CELL.HIDDEN_PASSAGE) {
            const isDoorway = gy + 1 < totalRows &&
                (grid[gy + 1]?.[gx] === CELL.FLOOR || grid[gy + 1]?.[gx] === CELL.CHEST);
            if (isDoorway) {
                this.drawDoorTile(x, y, gx, gy, grid, totalCols, totalRows);
                return;
            }
        }

        const tile = this.selectWallTile(gx, gy, grid, totalCols, totalRows);
        if (tile && tile.complete && tile.naturalWidth > 0) {
            ctx.drawImage(tile, x, y, w, h);
        } else {
            // 回退：纯色
            ctx.fillStyle = COLORS.wall;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = COLORS.wallEdge;
            ctx.fillRect(x, y, w, 3);
            ctx.fillRect(x, y, 3, h);
            ctx.fillStyle = COLORS.wallShadow;
            ctx.fillRect(x + w - 3, y, 3, h);
            ctx.fillRect(x, y + h - 3, w, 3);
        }

        if (this.gridLines) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        }
    }

    /**
     * 绘制隐藏通道门
     */
    drawDoorTile(x, y, gx, gy, grid, totalCols, totalRows) {
        const { ctx, cellWidth: w, cellHeight: h } = this;

        // 计算 HIDDEN_PASSAGE 簇宽度
        let clusterLeft = gx;
        while (clusterLeft > 0 && grid[gy]?.[clusterLeft - 1] === CELL.HIDDEN_PASSAGE) clusterLeft--;
        let clusterRight = gx;
        while (clusterRight + 1 < totalCols && grid[gy]?.[clusterRight + 1] === CELL.HIDDEN_PASSAGE) clusterRight++;
        const clusterWidth = clusterRight - clusterLeft + 1;

        let tile;
        if (clusterWidth === 1) {
            tile = this.tiles.door?.open_1w;
        } else if (clusterWidth === 2) {
            tile = (gx === clusterLeft) ? this.tiles.door?.open_2w_l : this.tiles.door?.open_2w_r;
        } else {
            // >2格宽 → 退回到正常墙体
            const wallTile = this.selectWallTile(gx, gy, grid, totalCols, totalRows);
            if (wallTile && wallTile.complete && wallTile.naturalWidth > 0) {
                ctx.drawImage(wallTile, x, y, w, h);
            }
            return;
        }

        if (tile && tile.complete && tile.naturalWidth > 0) {
            ctx.drawImage(tile, x, y, w, h);
        } else {
            // 回退：棕色门
            ctx.fillStyle = '#5a3a1a';
            ctx.fillRect(x + w * 0.1, y, w * 0.8, h);
            ctx.fillStyle = '#8B6914';
            ctx.fillRect(x + w * 0.15, y + h * 0.1, w * 0.3, h * 0.7);
            ctx.fillRect(x + w * 0.55, y + h * 0.1, w * 0.3, h * 0.7);
            ctx.strokeStyle = '#3a2510';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + w * 0.1, y, w * 0.8, h);
        }

        if (this.gridLines) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        }
    }

    /**
     * 绘制路径/地板
     */
    drawPath(x, y, gx, gy, grid, totalCols, totalRows) {
        const { cellWidth: w, cellHeight: h } = this;
        this.drawFloorTile(x, y, w, h, this.selectFloorTile(gx, gy, grid, totalCols, totalRows));
        if (this.gridLines) {
            this.ctx.strokeStyle = 'rgba(60, 45, 30, 0.15)';
            this.ctx.lineWidth = 0.5;
            this.ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        }
    }

    /**
     * 绘制宝箱
     */
    drawChest(x, y, isConditional) {
        const { ctx, cellWidth: w, cellHeight: h } = this;
        const cx = x + w / 2;
        const cy = y + h / 2;
        const size = Math.min(w, h) * 0.35;

        const glowColor = isConditional ? 'rgba(180, 130, 255, 0.8)' : COLORS.chestGlow;
        const chestColor = isConditional ? '#9b7fd4' : COLORS.chest;

        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 15;
        ctx.fillStyle = chestColor;
        ctx.fillRect(cx - size, cy - size * 0.6, size * 2, size * 1.2);
        ctx.shadowBlur = 0;

        ctx.fillStyle = isConditional ? '#c4b5e8' : COLORS.chestGlow;
        ctx.fillRect(cx - 3, cy - size * 0.3, 6, size * 0.6);

        if (isConditional) {
            ctx.fillStyle = '#fff';
            ctx.font = `${size * 0.8}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('🔒', cx, cy - size * 0.9);
        }
    }

    /**
     * 绘制出口
     */
    drawExit(x, y) {
        const { ctx, cellWidth: w, cellHeight: h } = this;
        const cx = x + w / 2;
        const cy = y + h / 2;
        const size = Math.min(w, h) * 0.4;

        ctx.save();
        ctx.shadowColor = COLORS.exitGlow;
        ctx.shadowBlur = 20;

        ctx.fillStyle = COLORS.exit;
        ctx.beginPath();
        ctx.arc(cx, cy, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.4, cy);
        ctx.lineTo(cx + size * 0.4, cy);
        ctx.moveTo(cx, cy - size * 0.4);
        ctx.lineTo(cx, cy + size * 0.4);
        ctx.stroke();
    }

    /**
     * 绘制废墟
     */
    drawRuin(x, y) {
        const { ctx, cellWidth: w, cellHeight: h } = this;

        ctx.fillStyle = '#5a4a3a';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#4a3a2a';
        ctx.fillRect(x + 2, y + 2, w - 4, h - 4);

        ctx.fillStyle = '#6b5b4b';
        for (let i = 0; i < 3; i++) {
            const startX = x + w * (0.2 + i * 0.25);
            const startY = y + h * 0.3;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(startX + (Math.random() - 0.5) * w * 0.4, startY + h * 0.5);
            ctx.strokeStyle = '#7a6a5a';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.fillStyle = '#8b7b6b';
        ctx.fillRect(x + w * 0.35, y + h * 0.6, w * 0.3, h * 0.2);

        if (this.gridLines) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        }
    }

    /**
     * 绘制高成本格子（警示）
     */
    drawHighCostTile(x, y, gx, gy, grid, totalCols, totalRows) {
        const { ctx, cellWidth: w, cellHeight: h } = this;
        this.drawFloorTile(x, y, w, h, this.selectFloorTile(gx, gy, grid, totalCols, totalRows));

        const gradient = ctx.createRadialGradient(
            x + w / 2, y + h / 2, 0,
            x + w / 2, y + h / 2, Math.min(w, h) / 2
        );
        gradient.addColorStop(0, 'rgba(255, 180, 80, 0.3)');
        gradient.addColorStop(0.7, 'rgba(255, 120, 40, 0.2)');
        gradient.addColorStop(1, 'rgba(255, 80, 20, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, w, h);

        ctx.fillStyle = 'rgba(255, 150, 50, 0.6)';
        ctx.font = `${Math.min(w, h) * 0.35}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚠', x + w / 2, y + h / 2);

        if (this.gridLines) {
            ctx.strokeStyle = 'rgba(60, 45, 30, 0.15)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        }
    }

    /**
     * 绘制石碑
     */
    drawMonument(x, y) {
        const { ctx, cellWidth: w, cellHeight: h } = this;
        const cx = x + w / 2;
        const cy = y + h / 2;

        ctx.fillStyle = '#7a7a8a';
        const baseWidth = w * 0.4;
        const baseHeight = h * 0.5;
        ctx.fillRect(cx - baseWidth / 2, cy - baseHeight / 2, baseWidth, baseHeight);

        ctx.fillStyle = '#8a8a9a';
        const topWidth = w * 0.25;
        const topHeight = h * 0.3;
        ctx.fillRect(cx - topWidth / 2, cy - baseHeight / 2 - topHeight, topWidth, topHeight);

        ctx.fillStyle = '#9a9aaa';
        const peakWidth = w * 0.1;
        const peakHeight = h * 0.15;
        ctx.beginPath();
        ctx.moveTo(cx - peakWidth / 2, cy - baseHeight / 2 - topHeight);
        ctx.lineTo(cx, cy - baseHeight / 2 - topHeight - peakHeight);
        ctx.lineTo(cx + peakWidth / 2, cy - baseHeight / 2 - topHeight);
        ctx.fill();

        ctx.fillStyle = '#6a6a7a';
        ctx.fillRect(cx - baseWidth / 2 + 3, cy - baseHeight / 2 + 3, baseWidth - 6, baseHeight - 6);

        ctx.fillStyle = '#4a4a5a';
        ctx.font = `${Math.min(w, h) * 0.15}px serif`;
        ctx.textAlign = 'center';
        ctx.fillText('✧', cx, cy - baseHeight / 4);
    }
}
