/**
 * 迷雾模块
 *
 * 职责：
 * - 视野范围常量
 * - 玩家视野内的单元格可见性计算
 * - 已探索/已看见状态更新
 *
 * 纯逻辑，不依赖任何 Web API。
 *
 * 注意：当前采用圆形半径视野（无墙体遮挡的像素级雾）。
 * 未来可实现 raycasting 进行墙体遮挡的精确计算。
 */

import { CELL } from '../maze/types.js';

/**
 * 默认视野参数（格子数）
 */
export const FOG_DEFAULTS = {
    viewRadiusInner: 5,   // 清晰视野半径
    viewRadiusOuter: 8,   // 模糊视野半径
};

/**
 * 从玩家位置更新可见区域
 * 标记 Player 的 exploredCells 和 seenCells
 *
 * @param {import('./player.js').Player} player
 * @param {number[][]} grid - 地图网格
 * @param {number} innerR - 内圈半径（清晰可见）
 * @param {number} outerR - 外圈半径（模糊可见）
 */
export function updateVisibility(player, grid, innerR, outerR) {
    const { x, y } = player.getPosition();
    const now = performance?.now() ?? Date.now();

    for (let dy = -outerR; dy <= outerR; dy++) {
        for (let dx = -outerR; dx <= outerR; dx++) {
            const gx = x + dx;
            const gy = y + dy;

            // 边界检查
            if (gx < 0 || gx >= player.gridWidth || gy < 0 || gy >= player.gridHeight) continue;

            // 楼层深度检查（简单的圆形范围，无墙体遮挡）
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > outerR) continue;

            // 在内圈范围内 → 已探索 + 已看见
            if (dist <= innerR) {
                player.markExplored(gx, gy);
                player.markSeen(gx, gy, now);
            } else {
                // 外圈 → 仅已看见（已探索过的保持已探索）
                player.markSeen(gx, gy, now);
            }
        }
    }
}

/**
 * 获取指定位置周围的可见格子列表（逐格精确，内含墙体遮挡检测）
 * 当前实现：简单半径范围，无墙体遮挡。
 *
 * @param {number} cx - 中心 X
 * @param {number} cy - 中心 Y
 * @param {number} radius - 最大可见半径
 * @param {number[][]} grid - 地图网格
 * @param {number} gridWidth - 宽度
 * @param {number} gridHeight - 高度
 * @returns {Array<{x:number, y:number}>} 可见格子坐标列表
 */
export function getVisibleCells(cx, cy, radius, grid, gridWidth, gridHeight) {
    const cells = [];

    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            const gx = cx + dx;
            const gy = cy + dy;

            if (gx < 0 || gx >= gridWidth || gy < 0 || gy >= gridHeight) continue;

            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= radius) {
                cells.push({ x: gx, y: gy });
            }
        }
    }

    return cells;
}
