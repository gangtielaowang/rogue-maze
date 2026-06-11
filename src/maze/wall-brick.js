/**
 * 砖块式墙体系统
 *
 * 核心思想：墙体由 2×3（水平×垂直）的标准砖块构成。
 * 更大的墙体 = 多个 2×3 砖块拼接或重叠组成。
 *
 * 本模块提供墙体厚度校验和自动加厚功能。
 * 与旧 _ensureWallThickness 的关键区别：
 *   - 旧方案：薄墙→拆成地板（连锁反应，越拆越多）
 *   - 新方案：薄墙→相邻地板补成墙（只加不减，无连锁反应）
 */

import { CELL } from './types.js';
import { DEFAULT_CONFIG } from './config.js';

/**
 * 检查 (r,c) 所在墙体是否满足最小厚度要求
 * @param {number[][]} grid
 * @param {number} r
 * @param {number} c
 * @param {number} mapSize
 * @param {number} hMin 最小水平厚度
 * @param {number} vMin 最小垂直厚度
 * @returns {boolean}
 */
export function isWallThickEnough(grid, r, c, mapSize, hMin = 2, vMin = 3) {
    if (grid[r] === undefined || grid[r][c] !== CELL.WALL) return true;

    const isWall = (rr, cc) =>
        rr >= 0 && rr < mapSize && cc >= 0 && cc < mapSize && grid[rr][cc] === CELL.WALL;

    // 水平厚度
    let hLeft = 0, hRight = 0;
    while (isWall(r, c - hLeft - 1)) hLeft++;
    while (isWall(r, c + hRight + 1)) hRight++;
    if (1 + hLeft + hRight < hMin) return false;

    // 垂直厚度
    let vUp = 0, vDown = 0;
    while (isWall(r - vUp - 1, c)) vUp++;
    while (isWall(r + vDown + 1, c)) vDown++;
    if (1 + vUp + vDown < vMin) return false;

    return true;
}

/**
 * 自动加厚墙体：在薄墙周围补墙砖，确保所有墙体 ≥ 2×3
 *
 * @param {number[][]} grid - 地图网格（会被修改）
 * @param {number} mapSize - 地图边长
 * @param {Set<string>} protectedCells - 受保护格子（房间/通道），不在此加墙，格式 "r,c"
 * @param {number} hMin - 最小水平厚度
 * @param {number} vMin - 最小垂直厚度
 * @returns {number} 补了多少格墙
 */
export function thickenWalls(grid, mapSize, protectedCells = null, hMin = 2, vMin = 3) {
    const isWall = (r, c) =>
        r >= 0 && r < mapSize && c >= 0 && c < mapSize && grid[r][c] === CELL.WALL;

    let changed = true;
    let passes = 0;
    let totalAdded = 0;
    const MAX_PASSES = 30;

    while (changed && passes < MAX_PASSES) {
        changed = false;
        passes++;

        // 收集这一轮要加的格子（先收集再统一修改，避免边扫边改干扰测量）
        const toAdd = [];

        for (let r = 0; r < mapSize; r++) {
            for (let c = 0; c < mapSize; c++) {
                if (grid[r][c] !== CELL.WALL) continue;

                // 测量水平厚度
                let hLeft = 0, hRight = 0;
                while (isWall(r, c - hLeft - 1)) hLeft++;
                while (isWall(r, c + hRight + 1)) hRight++;
                const hThick = 1 + hLeft + hRight;

                // 测量垂直厚度
                let vUp = 0, vDown = 0;
                while (isWall(r - vUp - 1, c)) vUp++;
                while (isWall(r + vDown + 1, c)) vDown++;
                const vThick = 1 + vUp + vDown;

                // 水平厚度不足 → 在较薄一侧补墙
                if (hThick < hMin) {
                    // 确定补墙方向（往薄的一侧补）
                    const dir = hLeft < hRight ? -1 : 1;
                    const pr = r;
                    const pc = c + (dir > 0 ? hRight + 1 : -(hLeft + 1));

                    if (pc >= 0 && pc < mapSize && grid[pr][pc] === CELL.FLOOR) {
                        const key = `${pr},${pc}`;
                        if (!protectedCells || !protectedCells.has(key)) {
                            toAdd.push([pr, pc]);
                        }
                    }
                }

                // 垂直厚度不足 → 在较薄一侧补墙
                if (vThick < vMin) {
                    const dir = vUp < vDown ? -1 : 1;
                    const pr = r + (dir > 0 ? vDown + 1 : -(vUp + 1));
                    const pc = c;

                    if (pr >= 0 && pr < mapSize && grid[pr][pc] === CELL.FLOOR) {
                        const key = `${pr},${pc}`;
                        if (!protectedCells || !protectedCells.has(key)) {
                            toAdd.push([pr, pc]);
                        }
                    }
                }
            }
        }

        // 统一执行加墙
        for (const [rr, cc] of toAdd) {
            if (grid[rr][cc] === CELL.FLOOR) {
                grid[rr][cc] = CELL.WALL;
                changed = true;
                totalAdded++;
            }
        }
    }

    return totalAdded;
}
