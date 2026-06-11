/**
 * 迷宫主生成器
 * 
 * 协调各模块完成迷宫生成：
 * 1. RoomPlacer → 摆放房间
 * 2. CorridorBuilder → 连接通道
 * 3. 最终验证
 */

import { CELL } from './types.js';
import { DEFAULT_CONFIG } from './config.js';
import { RoomPlacer } from './room-placer.js';
import { CorridorBuilder } from './corridor.js';

export class MazeGenerator {
    /**
     * @param {Object} config - 配置参数，覆盖 DEFAULT_CONFIG
     */
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.grid = null;
        this.rooms = [];
        this.edges = [];
        this.startRoom = null;
        this.endRoom = null;
    }

    /**
     * 执行迷宫生成
     * @returns {Object} 生成结果
     */
    generate() {
        const mapSize = this.config.mapSize;

        // 初始化全墙网格
        this.grid = [];
        for (let r = 0; r < mapSize; r++) {
            this.grid[r] = new Array(mapSize).fill(CELL.WALL);
        }

        // 阶段1: 摆放房间
        const placer = new RoomPlacer(this.config);
        this.rooms = placer.place();
        this.startRoom = placer.getStartRoom();
        this.endRoom = placer.getEndRoom();

        // 阶段2: 连接通道
        const corridorBuilder = new CorridorBuilder(this.config);
        this.edges = corridorBuilder.build(this.grid, this.rooms);

        // 阶段3: 放置出口
        this._placeExit();

        // 阶段4: 验证
        const validation = this._validate();

        return {
            grid: this.grid,
            rooms: this.rooms,
            edges: this.edges,
            startRoom: this.startRoom,
            endRoom: this.endRoom,
            startPosition: {
                row: this.startRoom.centerRow,
                col: this.startRoom.centerCol,
            },
            exitPosition: {
                row: this.endRoom.centerRow,
                col: this.endRoom.centerCol,
            },
            validation,
        };
    }

    /** 在终点房间放置出口 */
    _placeExit() {
        if (!this.endRoom) return;
        const ib = this.endRoom.interior;
        this.grid[this.endRoom.centerRow][this.endRoom.centerCol] = CELL.EXIT;
    }

    /** 验证迷宫 */
    _validate() {
        const mapSize = this.config.mapSize;

        // BFS 从起点出发，检查所有房间是否可达
        const visited = new Set();
        const queue = [{ row: this.startRoom.centerRow, col: this.startRoom.centerCol }];
        visited.add(`${this.startRoom.centerRow},${this.startRoom.centerCol}`);

        while (queue.length > 0) {
            const cur = queue.shift();
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const nr = cur.row + dr;
                const nc = cur.col + dc;
                if (nr < 0 || nr >= mapSize || nc < 0 || nc >= mapSize) continue;
                const k = `${nr},${nc}`;
                if (visited.has(k)) continue;
                const cell = this.grid[nr][nc];
                if (cell === CELL.FLOOR || cell === CELL.EXIT || cell === CELL.CHEST) {
                    visited.add(k);
                    queue.push({ row: nr, col: nc });
                }
            }
        }

        // 检查终点可达
        const exitKey = `${this.endRoom.centerRow},${this.endRoom.centerCol}`;
        const exitReachable = visited.has(exitKey);

        // 检查每个房间至少有一个内部格可达
        const roomReachable = {};
        for (const room of this.rooms) {
            const ib = room.interior;
            let reachable = false;
            for (let r = ib.top; r <= ib.bottom && !reachable; r++) {
                for (let c = ib.left; c <= ib.right && !reachable; c++) {
                    if (visited.has(`${r},${c}`)) reachable = true;
                }
            }
            roomReachable[room.id] = reachable;
        }

        // 统计
        const unreachableRooms = Object.values(roomReachable).filter(v => !v).length;

        return {
            exitReachable,
            visitedCount: visited.size,
            totalRooms: this.rooms.length,
            unreachableRooms,
            passed: exitReachable && unreachableRooms === 0,
        };
    }

    /** 获取迷宫网格的副本（避免外部修改） */
    getGrid() {
        return this.grid.map(row => [...row]);
    }
}

/**
 * 便捷方法：一次调用完成迷宫生成
 * @param {Object} config - 配置参数
 * @returns {Object} 生成结果
 */
export function generateMaze(config = {}) {
    const generator = new MazeGenerator(config);
    return generator.generate();
}
