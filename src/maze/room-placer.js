/**
 * 房间数据结构和摆放逻辑
 * 
 * 在网格上随机摆放房间，确保互不重叠且满足墙体厚度约束
 */

import { CELL, ROOM_TYPE, TRIGGER_TYPE } from './types.js';
import { DEFAULT_CONFIG } from './config.js';

/**
 * 房间类
 */
export class Room {
    constructor(id, gridRow, gridCol, width, height) {
        this.id = id;
        this.gridRow = gridRow;         // 房间左上角行（含墙体边框）
        this.gridCol = gridCol;         // 房间左上角列（含墙体边框）
        this.width = width;             // 房间总宽度（含墙体边框）
        this.height = height;           // 房间总高度（含墙体边框）
        this.type = ROOM_TYPE.NORMAL;   // 房间类型
        this.doors = [];                // 门位置 [{row, col, direction}]
        this.chests = [];               // 宝箱位置 [{row, col}]
        this.interiorWalls = [];        // 室内装饰墙 [{row, col}]
        this.landmark = null;           // 地标位置 {row, col}
        this.hiddenTrigger = null;      // 隐藏触发条件
        this.monsters = [];             // 怪物（预留）
    }

    /** 获取房间边界（含墙体） */
    get bounds() {
        return {
            top: this.gridRow,
            bottom: this.gridRow + this.height - 1,
            left: this.gridCol,
            right: this.gridCol + this.width - 1,
        };
    }

    /** 获取房间内部区域边界（不含墙体边框） */
    get interior() {
        const b = this.bounds;
        return {
            top: b.top + 1,
            bottom: b.bottom - 1,
            left: b.left + 1,
            right: b.right - 1,
        };
    }

    /** 房间中心行 */
    get centerRow() {
        return this.gridRow + Math.floor(this.height / 2);
    }

    /** 房间中心列 */
    get centerCol() {
        return this.gridCol + Math.floor(this.width / 2);
    }

    /** 内部宽度 */
    get interiorWidth() {
        return this.width - 2;
    }

    /** 内部高度 */
    get interiorHeight() {
        return this.height - 2;
    }

    /** 判断坐标是否在房间内 */
    contains(row, col) {
        const b = this.bounds;
        return row >= b.top && row <= b.bottom && col >= b.left && col <= b.right;
    }

    /** 判断是否与另一个房间重叠（含间距） */
    overlaps(other, gap = 0) {
        if (!other) return false;
        const a = this.bounds;
        const b = other.bounds;
        return !(
            a.right + gap < b.left ||
            b.right + gap < a.left ||
            a.bottom + gap < b.top ||
            b.bottom + gap < a.top
        );
    }
}

/**
 * 简易伪随机数生成器（种子可重复）
 */
export class Random {
    constructor(seed) {
        this.seed = seed || Date.now();
    }

    /** 返回 [0, 1) 浮点数 */
    next() {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }

    /** 返回 [min, max] 整数 */
    nextInt(min, max) {
        return min + Math.floor(this.next() * (max - min + 1));
    }

    /** 从数组中随机选一个 */
    pick(arr) {
        return arr[this.nextInt(0, arr.length - 1)];
    }

    /** 洗牌 */
    shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = this.nextInt(0, i);
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
}

/**
 * 房间摆放器
 * 在 N×N 网格上摆放房间
 */
export class RoomPlacer {
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.rng = new Random(this.config.seed);
        this.rooms = [];
    }

    /** 执行摆放，返回 Room[] */
    place() {
        this.rooms = [];

        // 1. 先放起点和终点房间（尽可能远）
        this._placeStartEnd();

        // 2. 再放其他房间
        this._placeNormalRooms();

        // 3. 标记隐藏房间
        this._assignHiddenRooms();

        return this.rooms;
    }

    /** 放置起点和终点 */
    _placeStartEnd() {
        const size = 8; // 起点终点统一大小
        const map = this.config.mapSize;
        const gap = this.config.roomMinGap;

        // 起点在左下区域
        for (let attempt = 0; attempt < 50; attempt++) {
            const row = this.rng.nextInt(1, Math.floor(map / 3));
            const col = this.rng.nextInt(1, Math.floor(map / 3));
            const room = new Room('start', row, col, size, size);
            room.type = ROOM_TYPE.START;
            if (!this._overlapsAny(room, gap)) {
                this.rooms.push(room);
                this.startRoom = room;
                break;
            }
        }

        // 终点在右上区域
        for (let attempt = 0; attempt < 50; attempt++) {
            const row = this.rng.nextInt(Math.floor(map * 2 / 3), map - size - 1);
            const col = this.rng.nextInt(Math.floor(map * 2 / 3), map - size - 1);
            const room = new Room('end', row, col, size, size);
            room.type = ROOM_TYPE.END;
            if (!this._overlapsAny(room, gap)) {
                this.rooms.push(room);
                this.endRoom = room;
                break;
            }
        }

        // 保底：如果起点终点没放成功，强制放在角落
        if (!this.startRoom) {
            const room = new Room('start', 1, 1, size, size);
            room.type = ROOM_TYPE.START;
            this.rooms.unshift(room);
            this.startRoom = room;
        }
        if (!this.endRoom) {
            const room = new Room('end', map - size - 1, map - size - 1, size, size);
            room.type = ROOM_TYPE.END;
            this.rooms.push(room);
            this.endRoom = room;
        }
    }

    /** 放置普通房间 */
    _placeNormalRooms() {
        const cfg = this.config;
        const totalRooms = cfg.roomCount;
        const existing = this.rooms.length;
        const needRooms = totalRooms - existing;

        for (let i = 0; i < needRooms; i++) {
            let placed = false;
            for (let attempt = 0; attempt < 80; attempt++) {
                const w = this.rng.nextInt(cfg.roomMinWidth, cfg.roomMaxWidth);
                const h = this.rng.nextInt(cfg.roomMinHeight, cfg.roomMaxHeight);
                const row = this.rng.nextInt(2, cfg.mapSize - h - 2);
                const col = this.rng.nextInt(2, cfg.mapSize - w - 2);

                const room = new Room(`room_${i}`, row, col, w, h);
                if (!this._overlapsAny(room, cfg.roomMinGap)) {
                    this.rooms.push(room);
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                console.warn(`房间 ${i} 无法放置，跳过`);
            }
        }
    }

    /** 标记隐藏房间 */
    _assignHiddenRooms() {
        const cfg = this.config;
        const targetCount = this.rng.nextInt(cfg.hiddenRoomCount.min, cfg.hiddenRoomCount.max);

        // 从普通房间中选，但优先选上方（gridRow 较小）的房间，
        // 因为隐藏房间入口必须在底部墙，需要下方有空间走通道
        const candidates = this.rooms
            .filter(r => r.type === ROOM_TYPE.NORMAL)
            .sort((a, b) => a.gridRow - b.gridRow); // 上方的优先

        // 打乱前若干个候选（保留上方的倾向）
        const topHalf = candidates.slice(0, Math.ceil(candidates.length / 2));
        const bottomHalf = candidates.slice(Math.ceil(candidates.length / 2));
        const shuffled = [...this.rng.shuffle(topHalf), ...this.rng.shuffle(bottomHalf)];
        const count = Math.min(targetCount, shuffled.length);

        for (let i = 0; i < count; i++) {
            const room = shuffled[i];
            room.type = ROOM_TYPE.HIDDEN;

            // 随机分配触发类型
            const triggerTypes = [
                TRIGGER_TYPE.KEY,
                TRIGGER_TYPE.BOMB,
                TRIGGER_TYPE.PROXIMITY,
                TRIGGER_TYPE.CLUE,
            ];
            room.hiddenTrigger = {
                type: this.rng.pick(triggerTypes),
                params: {},
                revealed: false,
            };
        }
    }

    /** 检查是否与已有房间重叠 */
    _overlapsAny(room, gap) {
        for (const existing of this.rooms) {
            if (room.overlaps(existing, gap)) return true;
        }
        return false;
    }

    /** 获取所有房间 */
    getRooms() {
        return this.rooms;
    }

    /** 获取起点房间 */
    getStartRoom() {
        return this.startRoom;
    }

    /** 获取终点房间 */
    getEndRoom() {
        return this.endRoom;
    }
}
