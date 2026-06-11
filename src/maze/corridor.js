/**
 * 通道连接模块
 * 
 * 负责房间之间的连通：
 * 1. 构建房间之间的图（KNN + MST + 额外边）
 * 2. A* 寻路生成通道
 * 3. 通道拓宽
 */

import { CELL, ROOM_TYPE } from './types.js';
import { DEFAULT_CONFIG } from './config.js';
import { Random } from './room-placer.js';

/**
 * 走廊/通道连接器
 */
export class CorridorBuilder {
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.rng = new Random(this.config.seed);
        this.grid = null;
        this.mapSize = this.config.mapSize;
        this.edges = [];
    }

    /**
     * 构建房间之间的所有通道
     * @param {number[][]} grid - 地图网格（会直接修改）
     * @param {import('./room-placer.js').Room[]} rooms - 房间列表
     */
    build(grid, rooms) {
        this.grid = grid;
        this.rooms = rooms;

        // 1. 先在房间内部挖空（所有房间）
        this._carveRooms();

        // 2. 在房间边界上放置门
        this._placeDoors();

        // 分离隐藏房间和非隐藏房间
        const normalRooms = rooms.filter(r => r.type !== ROOM_TYPE.HIDDEN);
        const hiddenRooms = rooms.filter(r => r.type === ROOM_TYPE.HIDDEN);

        // 3. 构建非隐藏房间的连通图
        this.edges = [];
        if (normalRooms.length >= 2) {
            const knnEdges = this._buildKNNEdges();
            // 排除涉及隐藏房间的边
            const filteredEdges = knnEdges.filter(e => {
                const rA = this.rooms[e.from];
                const rB = this.rooms[e.to];
                return rA.type !== ROOM_TYPE.HIDDEN && rB.type !== ROOM_TYPE.HIDDEN;
            });
            // 4. MST 确保非隐藏房间连通
            const mst = this._primMST(filteredEdges, normalRooms.length);
            // 5. 额外边创造环路
            const extra = this._addExtraEdges(filteredEdges, mst);
            this.edges = [...mst, ...extra];
        }

        // 6. 隐藏房间作为叶子节点挂在最近的非隐藏房间上
        this._connectHiddenRooms(hiddenRooms, normalRooms);

        // 7. 为每条边生成通道
        for (const edge of this.edges) {
            this._carveCorridor(edge);
        }

        // 8. 生成分支死胡同
        this._carveBranches();

        // 9. 确保墙体厚度 >= 2×3：拆墙（清理孤立薄墙）
        this._ensureWallThickness();

        // 10. 砖块式拼接修复：检测墙体之间的角连接（只有1格接触），补砖块确保≥3格接触
        const protectedCells = this._collectProtectedCells();
        this._fixBrickConnections(protectedCells);

        return this.edges;
    }

    /**
     * 连接隐藏房间（作为叶子节点）
     * 每个隐藏房间只连到最近的非隐藏房间，不参与 MST
     */
    _connectHiddenRooms(hiddenRooms, normalRooms) {
        if (hiddenRooms.length === 0 || normalRooms.length === 0) return;

        for (const hiddenRoom of hiddenRooms) {
            let minDist = Infinity;
            let nearestRoom = null;

            for (const normRoom of normalRooms) {
                const dr = hiddenRoom.centerRow - normRoom.centerRow;
                const dc = hiddenRoom.centerCol - normRoom.centerCol;
                const dist = dr * dr + dc * dc;
                if (dist < minDist) {
                    minDist = dist;
                    nearestRoom = normRoom;
                }
            }

            if (nearestRoom) {
                const fromIdx = this.rooms.indexOf(nearestRoom);
                const toIdx = this.rooms.indexOf(hiddenRoom);
                this.edges.push({
                    from: fromIdx,
                    to: toIdx,
                    dist: Math.sqrt(minDist),
                    hiddenLeaf: true,  // 标记为隐藏房间分支
                });
            }
        }
    }

    /** 在网格中挖出房间内部空间 */
    _carveRooms() {
        for (const room of this.rooms) {
            const b = room.bounds;
            // 房间内部全部挖空
            for (let r = b.top; r <= b.bottom; r++) {
                for (let c = b.left; c <= b.right; c++) {
                    this.grid[r][c] = CELL.FLOOR;
                }
            }
            // 房间边界恢复为 WALL（形成墙体）
            for (let c = b.left; c <= b.right; c++) {
                this.grid[b.top][c] = CELL.WALL;
                this.grid[b.bottom][c] = CELL.WALL;
            }
            for (let r = b.top; r <= b.bottom; r++) {
                this.grid[r][b.left] = CELL.WALL;
                this.grid[r][b.right] = CELL.WALL;
            }
        }
    }

    /** 在房间边界上放置门 */
    _placeDoors() {
        for (const room of this.rooms) {
            const ib = room.interior;
            room.doors = [];

            // 四个方向各放一个门候选
            const candidates = [];

            // 上边
            if (ib.left <= ib.right) {
                const c = Math.floor((ib.left + ib.right) / 2);
                candidates.push({ row: room.bounds.top, col: c, dir: 'top' });
            }
            // 下边
            if (ib.left <= ib.right) {
                const c = Math.floor((ib.left + ib.right) / 2);
                candidates.push({ row: room.bounds.bottom, col: c, dir: 'bottom' });
            }
            // 左边
            if (ib.top <= ib.bottom) {
                const r = Math.floor((ib.top + ib.bottom) / 2);
                candidates.push({ row: r, col: room.bounds.left, dir: 'left' });
            }
            // 右边
            if (ib.top <= ib.bottom) {
                const r = Math.floor((ib.top + ib.bottom) / 2);
                candidates.push({ row: r, col: room.bounds.right, dir: 'right' });
            }

            // 默认所有候选都是门
            // 后续在连接时再实际打通
            room.doors = candidates;
        }
    }

    /** 构建全连接图（所有房间两两之间建边，保证 MST 一定能连通） */
    _buildKNNEdges() {
        const edges = [];

        for (let i = 0; i < this.rooms.length; i++) {
            for (let j = i + 1; j < this.rooms.length; j++) {
                const dr = this.rooms[i].centerRow - this.rooms[j].centerRow;
                const dc = this.rooms[i].centerCol - this.rooms[j].centerCol;
                edges.push({
                    from: i,
                    to: j,
                    dist: Math.sqrt(dr * dr + dc * dc),
                });
            }
        }

        return edges;
    }

    /** Prim 算法生成最小生成树 */
    _primMST(edges, roomCount) {
        if (edges.length === 0 || roomCount <= 1) return [];

        const mst = [];
        // 从第一条边的起点开始（避免 room[0] 是隐藏房间导致 MST 连不上）
        const connected = new Set([edges[0].from]);
        const sorted = [...edges].sort((a, b) => a.dist - b.dist);

        while (connected.size < roomCount) {
            let best = null;
            for (const e of sorted) {
                const fConn = connected.has(e.from);
                const tConn = connected.has(e.to);
                if (fConn !== tConn) {
                    best = e;
                    break;
                }
            }
            if (!best) break;
            mst.push(best);
            connected.add(best.from);
            connected.add(best.to);
        }

        return mst;
    }

    /** 添加额外边创造环路 */
    _addExtraEdges(allEdges, mst) {
        const mstSet = new Set(
            mst.map(e => `${Math.min(e.from, e.to)}-${Math.max(e.from, e.to)}`)
        );
        const maxExtra = Math.floor(this.rooms.length * this.config.extraEdgeRatio);
        const extra = [];

        for (const e of this.rng.shuffle(allEdges)) {
            if (extra.length >= maxExtra) break;
            const key = `${Math.min(e.from, e.to)}-${Math.max(e.from, e.to)}`;
            if (mstSet.has(key)) continue;
            if (this.rng.next() < 0.5) {
                extra.push(e);
                mstSet.add(key);
            }
        }

        return extra;
    }

    /** 为一条边生成通道 */
    _carveCorridor(edge) {
        const roomA = this.rooms[edge.from];
        const roomB = this.rooms[edge.to];

        // 选择出口方向
        const dirA = this._chooseDoorDirection(roomA, roomB);
        const dirB = this._chooseDoorDirection(roomB, roomA);

        // 门的位置
        const doorA = roomA.doors.find(d => d.dir === dirA) || roomA.doors[0];
        const doorB = roomB.doors.find(d => d.dir === dirB) || roomB.doors[0];

        if (!doorA || !doorB) return;

        // 门外的起点/终点（在房间外一格）
        const start = this._doorExterior(roomA, doorA);
        const end = this._doorExterior(roomB, doorB);

        if (!start || !end) return;

        // 打通门
        this.grid[doorA.row][doorA.col] = CELL.FLOOR;
        this.grid[doorB.row][doorB.col] = CELL.FLOOR;

        // A* 寻路
        const path = this._astar(start.row, start.col, end.row, end.col);
        if (!path || path.length === 0) {
            console.warn(`A* 寻路失败: ${roomA.id} -> ${roomB.id}`);
            return;
        }

        // 判断是否是主干道
        const isMain = this._isMainPath(edge);

        // 挖通道
        const width = isMain ? this.config.corridorWidthMain : this.config.corridorWidthBranch;
        for (const cell of path) {
            for (let w = 0; w < width; w++) {
                const r = cell.row;
                const c = cell.col + w;
                if (r >= 0 && r < this.mapSize && c >= 0 && c < this.mapSize) {
                    if (this.grid[r][c] === CELL.WALL) {
                        this.grid[r][c] = CELL.FLOOR;
                    }
                }
            }
        }

        // 记录通道路径
        edge.path = path;
        edge.width = width;
    }

    /** 判断边的两个房间中是否有一个是起点或终点 */
    _isMainPath(edge) {
        const roomA = this.rooms[edge.from];
        const roomB = this.rooms[edge.to];
        return roomA.type === ROOM_TYPE.START || roomA.type === ROOM_TYPE.END ||
               roomB.type === ROOM_TYPE.START || roomB.type === ROOM_TYPE.END;
    }

    /** 选择从 roomA 到 roomB 的出口方向 */
    _chooseDoorDirection(roomA, roomB) {
        // 隐藏房间入口强制在底部墙（素材限制：立面 tile 朝下）
        if (roomA.type === ROOM_TYPE.HIDDEN) return 'bottom';

        const dr = roomB.centerRow - roomA.centerRow;
        const dc = roomB.centerCol - roomA.centerCol;

        if (Math.abs(dr) >= Math.abs(dc)) {
            return dr < 0 ? 'top' : 'bottom';
        } else {
            return dc < 0 ? 'left' : 'right';
        }
    }

    /** 计算门在房间外的相邻格 */
    _doorExterior(room, door) {
        const b = room.bounds;
        switch (door.dir) {
            case 'top': return { row: b.top - 1, col: door.col };
            case 'bottom': return { row: b.bottom + 1, col: door.col };
            case 'left': return { row: door.row, col: b.left - 1 };
            case 'right': return { row: door.row, col: b.right + 1 };
        }
        return null;
    }

    /**
     * A* 寻路
     * 在墙体中寻找路径，避开房间内部
     */
    _astar(startR, startC, endR, endC) {
        startR = Math.max(0, Math.min(this.mapSize - 1, startR));
        startC = Math.max(0, Math.min(this.mapSize - 1, startC));
        endR = Math.max(0, Math.min(this.mapSize - 1, endR));
        endC = Math.max(0, Math.min(this.mapSize - 1, endC));

        const key = (r, c) => `${r},${c}`;
        const h = (r, c) => Math.abs(r - endR) + Math.abs(c - endC);

        const open = new Map();
        const closed = new Set();
        const gScore = {};
        const parent = {};

        const sk = key(startR, startC);
        gScore[sk] = 0;
        open.set(sk, h(startR, startC));

        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

        let iter = 0;
        while (open.size > 0 && iter < 10000) {
            iter++;

            // 找 f 最小的节点
            let minKey = null;
            let minF = Infinity;
            for (const [k, f] of open) {
                if (f < minF) {
                    minF = f;
                    minKey = k;
                }
            }

            if (!minKey) break;
            const [cr, cc] = minKey.split(',').map(Number);
            open.delete(minKey);

            // 到达终点
            if (cr === endR && cc === endC) {
                const path = [];
                let kk = minKey;
                while (kk !== sk) {
                    const [pr, pc] = kk.split(',').map(Number);
                    path.unshift({ row: pr, col: pc });
                    kk = parent[kk];
                }
                return path;
            }

            closed.add(minKey);

            // 扩展邻居
            const shuffled = this.rng.shuffle(dirs);
            for (const [dr, dc] of shuffled) {
                const nr = cr + dr;
                const nc = cc + dc;

                if (nr < 0 || nr >= this.mapSize || nc < 0 || nc >= this.mapSize) continue;

                const nk = key(nr, nc);
                if (closed.has(nk)) continue;

                const cell = this.grid[nr][nc];

                // 只能走 WALL 或 FLOOR（门已经打通了）
                // 不能走房间内部（但可以穿过已经打通的通道）
                const isRoom = this._isInsideAnyRoom(nr, nc);
                if (isRoom && !(nr === endR && nc === endC) && !(nr === startR && nc === startC)) {
                    continue;
                }

                // 墙加一点成本，路径倾向于走墙中间
                const cost = (cell === CELL.WALL) ? 1 : 1.5;
                const ng = (gScore[minKey] || 0) + cost;

                if (gScore[nk] === undefined || ng < gScore[nk]) {
                    gScore[nk] = ng;
                    parent[nk] = minKey;
                    open.set(nk, ng + h(nr, nc));
                }
            }
        }

        return null; // 无路径
    }

    /** 检查坐标是否在任何房间内部（不含墙体边框） */
    _isInsideAnyRoom(row, col) {
        for (const room of this.rooms) {
            const ib = room.interior;
            if (row >= ib.top && row <= ib.bottom && col >= ib.left && col <= ib.right) {
                return true;
            }
        }
        return false;
    }

    /** 生成分支死胡同通道（1格宽） */
    _carveBranches() {
        const count = this.config.branchCorridorCount;
        for (let i = 0; i < count; i++) {
            // 从现有通道的末端延伸
            const floorCells = [];
            for (let r = 1; r < this.mapSize - 1; r++) {
                for (let c = 1; c < this.mapSize - 1; c++) {
                    if (this.grid[r][c] === CELL.FLOOR) {
                        let wallNeighbors = 0;
                        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                            if (this.grid[r + dr]?.[c + dc] === CELL.WALL) wallNeighbors++;
                        }
                        if (wallNeighbors >= 2) floorCells.push({ row: r, col: c });
                    }
                }
            }

            if (floorCells.length === 0) continue;

            const start = this.rng.pick(floorCells);
            const dir = this.rng.pick([[-1, 0], [1, 0], [0, -1], [0, 1]]);
            const len = this.rng.nextInt(2, 6);

            for (let j = 1; j <= len; j++) {
                const nr = start.row + dir[0] * j;
                const nc = start.col + dir[1] * j;
                if (nr < 1 || nr >= this.mapSize - 1 || nc < 1 || nc >= this.mapSize - 1) break;
                if (this.grid[nr][nc] !== CELL.WALL) break;
                this.grid[nr][nc] = CELL.FLOOR;
            }
        }
    }

    /** 确保墙体厚度 >= 2×3 */
    _ensureWallThickness() {
        const H_MIN = this.config.wallThicknessH; // 2
        const V_MIN = this.config.wallThicknessV; // 3

        const isWall = (r, c) => {
            return r >= 0 && r < this.mapSize && c >= 0 && c < this.mapSize &&
                   this.grid[r][c] === CELL.WALL;
        };

        let changed = true;
        let passes = 0;
        while (changed && passes < 20) {
            changed = false;
            passes++;

            for (let r = 1; r < this.mapSize - 1; r++) {
                for (let c = 1; c < this.mapSize - 1; c++) {
                    if (this.grid[r][c] !== CELL.WALL) continue;

                    // 测量水平厚度
                    let hLeft = 0, hRight = 0;
                    while (isWall(r, c - hLeft - 1)) hLeft++;
                    while (isWall(r, c + hRight + 1)) hRight++;
                    const thicknessH = 1 + hLeft + hRight;

                    // 测量垂直厚度
                    let vUp = 0, vDown = 0;
                    while (isWall(r - vUp - 1, c)) vUp++;
                    while (isWall(r + vDown + 1, c)) vDown++;
                    const thicknessV = 1 + vUp + vDown;

                    // 如果某方向厚度不足，将此格转为 FLOOR
                    if (thicknessH < H_MIN || thicknessV < V_MIN) {
                        this.grid[r][c] = CELL.FLOOR;
                        changed = true;
                    }
                }
            }
        }
    }

    /**
     * 收集受保护的格子（通道网络 + 门），这些格子不能被砖块修复堵上
     * @returns {Set<string>} "r,c" 格式的格子集合
     */
    _collectProtectedCells() {
        const protectedSet = new Set();

        // 找到起始房间中心作为 BFS 起点
        const startRoom = this.rooms.find(r => r.type === ROOM_TYPE.START);
        if (!startRoom) return protectedSet;

        const startR = startRoom.centerRow;
        const startC = startRoom.centerCol;

        // BFS 遍历所有可走到的 FLOOR 格子（通道网络）
        const visited = new Set();
        const queue = [{ r: startR, c: startC }];
        visited.add(`${startR},${startC}`);

        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

        while (queue.length > 0) {
            const { r, c } = queue.shift();
            const key = `${r},${c}`;
            protectedSet.add(key);

            for (const [dr, dc] of dirs) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr < 0 || nr >= this.mapSize || nc < 0 || nc >= this.mapSize) continue;

                const nk = `${nr},${nc}`;
                if (visited.has(nk)) continue;

                const cell = this.grid[nr][nc];
                // 可通行的格子：FLOOR, CHEST, EXIT
                if (cell === CELL.FLOOR || cell === CELL.CHEST || cell === CELL.EXIT) {
                    visited.add(nk);
                    queue.push({ r: nr, c: nc });
                }
            }
        }

        // 也把房间内部边界上的门保护起来
        for (const room of this.rooms) {
            for (const door of room.doors) {
                protectedSet.add(`${door.row},${door.col}`);
            }
        }

        return protectedSet;
    }

    /**
     * 砖块式拼接修复
     *
     * 根据用户的砖块方案，修复墙体拼接处的单格/双格接触问题。
     * 规则：
     *   1. 左右拼接（垂直界面）：两段墙体在 3 格高的界面必须有 ≥3 格接触
     *   2. 对角角连接：对角线相邻的墙体必须补上缺失的砖块
     *
     * @param {Set<string>} protectedCells - 受保护格子（不会被补墙）
     * @returns {number} 补了多少格
     */
    _fixBrickConnections(protectedCells) {
        if (!protectedCells || protectedCells.size === 0) return 0;

        const isFloor = (r, c) =>
            r >= 0 && r < this.mapSize && c >= 0 && c < this.mapSize &&
            this.grid[r][c] === CELL.FLOOR;

        const isWall = (r, c) =>
            r >= 0 && r < this.mapSize && c >= 0 && c < this.mapSize &&
            this.grid[r][c] === CELL.WALL;

        // 收集需要补墙的格子（先收集再统一修改，避免边扫边改干扰判断）
        const toAdd = new Set();

        // ───── 检测 1: 垂直界面 2/3 格接触（左右拼接缺中间/边缘一格） ─────
        // 扫描每列中每 3 个连续行。如果恰好 2 个是 WALL、1 个是 FLOOR，
        // 且该 FLOOR 格不在保护集内，则补为 WALL。
        //
        // 这解决了 "左右侧2格接触" 的薄墙问题。
        for (let c = 0; c < this.mapSize; c++) {
            for (let r = 0; r < this.mapSize - 2; r++) {
                const cells = [
                    { row: r, col: c },
                    { row: r + 1, col: c },
                    { row: r + 2, col: c },
                ];

                // 统计 WALL 和 FLOOR
                const wallCells = cells.filter(({ row, col }) => isWall(row, col));
                const floorCells = cells.filter(({ row, col }) => isFloor(row, col));

                if (wallCells.length === 2 && floorCells.length === 1) {
                    // 2 个 WALL、1 个 FLOOR → 垂直界面接触不完全
                    const { row, col } = floorCells[0];
                    const key = `${row},${col}`;
                    if (!protectedCells.has(key)) {
                        toAdd.add(key);
                    }
                }
            }
        }

        // ───── 检测 2: 对角线角连接（只有拐角1格接触） ─────
        // 模式：
        //   W .       . W
        //   . W  或   W .
        // 两段墙体通过对角线相邻，中间缺了 2 格，补上 1 格形成 2×2 连接
        for (let r = 0; r < this.mapSize - 1; r++) {
            for (let c = 0; c < this.mapSize - 1; c++) {
                // 检查↘对角线
                if (isWall(r, c) && isWall(r + 1, c + 1)) {
                    const aKey = `${r},${c + 1}`;
                    const bKey = `${r + 1},${c}`;
                    const aIsFloor = isFloor(r, c + 1);
                    const bIsFloor = isFloor(r + 1, c);

                    if (aIsFloor && bIsFloor) {
                        const aScore = this._countWallNeighbors(r, c + 1);
                        const bScore = this._countWallNeighbors(r + 1, c);

                        if (aScore >= bScore && !protectedCells.has(aKey)) {
                            toAdd.add(aKey);
                        } else if (!protectedCells.has(bKey)) {
                            toAdd.add(bKey);
                        }
                    }
                }

                // 检查↗对角线
                if (isWall(r, c + 1) && isWall(r + 1, c)) {
                    const aKey = `${r},${c}`;
                    const bKey = `${r + 1},${c + 1}`;
                    const aIsFloor = isFloor(r, c);
                    const bIsFloor = isFloor(r + 1, c + 1);

                    if (aIsFloor && bIsFloor) {
                        const aScore = this._countWallNeighbors(r, c);
                        const bScore = this._countWallNeighbors(r + 1, c + 1);

                        if (aScore >= bScore && !protectedCells.has(aKey)) {
                            toAdd.add(aKey);
                        } else if (!protectedCells.has(bKey)) {
                            toAdd.add(bKey);
                        }
                    }
                }
            }
        }

        // ───── 执行补墙 ─────
        let totalAdded = 0;
        for (const key of toAdd) {
            const [r, c] = key.split(',').map(Number);
            if (this.grid[r][c] === CELL.FLOOR) {
                this.grid[r][c] = CELL.WALL;
                totalAdded++;
            }
        }

        if (totalAdded > 0) {
            console.log(`[Corridor] 砖块连接修复: 补了 ${totalAdded} 格墙砖`);
        }

        return totalAdded;
    }

    /**
     * 统计格子周围 4 个正交方向上有多少个 WALL 邻居
     */
    _countWallNeighbors(r, c) {
        let count = 0;
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [dr, dc] of dirs) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < this.mapSize && nc >= 0 && nc < this.mapSize &&
                this.grid[nr][nc] === CELL.WALL) {
                count++;
            }
        }
        return count;
    }
}
