const CELL_TYPE_V5 = {
    WALL: 0,
    FLOOR: 1,
    CHEST: 2,
    EXIT: 3,
    RUIN: 4,
    HIGH_COST: 5,
    MONUMENT: 6,
    ROOM_FLOOR: 7,
    ROOM_WALL: 8,
    DOOR: 9,
    SPECIAL_WALL: 10
};

const ROOM_TYPE_V5 = {
    START: 'start',
    END: 'end',
    HALL: 'hall',
    CHAMBER: 'chamber',
    VAULT: 'vault',
    CROSSING: 'crossing',
    DEADEND: 'deadend',
    HIDDEN: 'hidden'
};

const DEFAULT_CONFIG = {
    mapSize: 100,
    xMin: 14,
    xMax: 20,
    totalRoomCount: 25,
    roomMinGap: 2,
    blockMergeMax: 2,
    startEndMinBlockDist: 3,
    branchProb: 0.4,
    branchExtendMin: 1,
    branchExtendMax: 2,
    kNeighbors: 5,
    extraProbActive: 0.4,
    extraProbBranch: 0.25,
    extraProbEdge: 0.15,
    extraEdgeMaxRatio: 0.25,
    corridorWidthMain: 2,
    corridorWidthOther: 1,
    branchCorridorMin: 2,
    branchCorridorMax: 8,
    minPathLen: 80,
    maxPathLen: 250,
    deadEndRatioMin: 0.25,
    deadEndRatioMax: 0.45
};

class RandomV5 {
    constructor(seed) {
        this.seed = seed;
    }
    next() {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
    nextInt(min, max) {
        return min + Math.floor(this.next() * (max - min + 1));
    }
    shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
    pick(arr) {
        return arr[this.nextInt(0, arr.length - 1)];
    }
}

class RoomV5 {
    constructor(id, gridRow, gridCol, width, height) {
        this.id = id;
        this.gridRow = gridRow;
        this.gridCol = gridCol;
        this.width = width;
        this.height = height;
        this.type = null;
        this.blocks = [];
        this.connections = [];
        this.doors = [];
        this.interiorWalls = [];
        this.landmark = null;
        this.chestPos = [];
    }

    get centerRow() { return this.gridRow + Math.floor(this.height / 2); }
    get centerCol() { return this.gridCol + Math.floor(this.width / 2); }

    getBounds() {
        return {
            top: this.gridRow,
            bottom: this.gridRow + this.height - 1,
            left: this.gridCol,
            right: this.gridCol + this.width - 1
        };
    }

    getInteriorBounds() {
        return {
            top: this.gridRow + 1,
            bottom: this.gridRow + this.height - 2,
            left: this.gridCol + 1,
            right: this.gridCol + this.width - 2
        };
    }

    overlaps(other, gap = 0) {
        if (!other) return false;
        const a = this.getBounds();
        const b = other.getBounds();
        return !(a.right + gap < b.left || b.right + gap < a.left ||
                 a.bottom + gap < b.top || b.bottom + gap < a.top);
    }

    containsRowCol(row, col) {
        const b = this.getBounds();
        return row >= b.top && row <= b.bottom && col >= b.left && col <= b.right;
    }
}

class MazeGeneratorV5 {
    constructor(seed, config = {}) {
        this.rng = new RandomV5(seed || Math.floor(Math.random() * 1000000));
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.mapSize = this.config.mapSize;
        this.totalRoomCount = this.config.totalRoomCount;

        this._resolveDifficulty();

        this.blocks = [];
        this.blockCount = 0;
        this.x = 0;
        this.usedSize = 0;
        this.remaining = 0;

        this.rooms = [];
        this.startRoom = null;
        this.endRoom = null;
        this.startBlock = null;
        this.endBlock = null;

        this.mainPathBlocks = [];
        this.altPathBlocks = [];
        this.branchBlocks = [];
        this.mergedPairs = [];

        this.corridors = [];
        this.globalGrid = [];
    }

    _resolveDifficulty() {
        const tc = this.config.totalRoomCount;
        if (tc <= 20) {
            this._smallRatio = 0.30; this._mediumRatio = 0.35;
            this._largeRatio = 0.20; this._megaRatio = 0.15;
            this.xMin = 17; this.xMax = 20;
            this._branchProb = 0.25;
        } else if (tc <= 30) {
            this._smallRatio = 0.40; this._mediumRatio = 0.35;
            this._largeRatio = 0.15; this._megaRatio = 0.10;
            this.xMin = this.config.xMin; this.xMax = this.config.xMax;
            this._branchProb = this.config.branchProb;
        } else if (tc <= 45) {
            this._smallRatio = 0.50; this._mediumRatio = 0.30;
            this._largeRatio = 0.12; this._megaRatio = 0.08;
            this.xMin = 14; this.xMax = 17;
            this._branchProb = 0.55;
        } else {
            this._smallRatio = 0.60; this._mediumRatio = 0.28;
            this._largeRatio = 0.08; this._megaRatio = 0.04;
            this.xMin = 14; this.xMax = 15;
            this._branchProb = 0.70;
        }
    }

    _maxLargeRoomSize() { return Math.min(13, this.x - 4); }
    _maxMegaRoomSize() { return Math.min(16, 2 * this.x - 4); }

    generate() {
        console.log('=== MazeGeneratorV5 ===');
        this._stage1_blocks();
        this._stage2_blockPaths();
        this._stage3_mergeBlocks();
        this._stage4_placeRooms();
        this._stage5_assignTypes();
        this._stage6_roomInteriors();
        this._stage7_corridors();
        this._stage8_fillSpace();
        this._stage9_placeItems();
        this._stage10_validate();
        this._convertCellTypes();
        this._ensureWallThickness();
        console.log('=== V5 完成 ===');
        return {
            globalGrid: this.globalGrid,
            grid: this.globalGrid,
            rooms: this.rooms,
            startPosition: { x: this.startRoom.centerCol, y: this.startRoom.centerRow },
            exitPosition: { x: this.endRoom.centerCol, y: this.endRoom.centerRow },
            corridors: this.corridors,
            blockCount: this.blockCount,
            x: this.x,
            getMap: () => this.globalGrid,
            getStartPosition: () => ({ x: this.startRoom.centerCol, y: this.startRoom.centerRow }),
            getExitPosition: () => ({ x: this.endRoom.centerCol, y: this.endRoom.centerRow }),
            getChestPositions: () => {
                const positions = [];
                for (const room of this.rooms) {
                    if (room && room.chestPos) {
                        for (const pos of room.chestPos) positions.push({ x: pos.col, y: pos.row });
                    }
                }
                return positions;
            }
        };
    }

    _stage1_blocks() {
        this.x = this.rng.nextInt(this.xMin, this.xMax);
        this.blockCount = Math.floor(this.mapSize / this.x);
        this.usedSize = this.blockCount * this.x;
        this.remaining = this.mapSize - this.usedSize;

        this.blocks = [];
        for (let r = 0; r < this.blockCount; r++) {
            this.blocks[r] = [];
            for (let c = 0; c < this.blockCount; c++) {
                this.blocks[r][c] = {
                    id: `block_${r}_${c}`,
                    row: r, col: c,
                    gridRow: r * this.x,
                    gridCol: c * this.x,
                    size: this.x,
                    isMerged: false,
                    mergedWith: null,
                    rooms: [],
                    isActive: false,
                    isOnMainPath: false,
                    isOnAltPath: false,
                    isBranch: false
                };
            }
        }
        console.log(`阶段一: x=${this.x}, blocks=${this.blockCount}x${this.blockCount}, used=${this.usedSize}, edge=${this.remaining}`);
    }

    _stage2_blockPaths() {
        const bc = this.blockCount;
        let sr, sc;
        do {
            sr = this.rng.nextInt(0, bc - 1);
            sc = this.rng.nextInt(0, bc - 1);
        } while (bc % 2 === 1 && sr === Math.floor(bc / 2) && sc === Math.floor(bc / 2));

        let er, ec;
        do {
            er = this.rng.nextInt(1, bc - 2);
            ec = this.rng.nextInt(1, bc - 2);
        } while (Math.abs(er - sr) + Math.abs(ec - sc) < this.config.startEndMinBlockDist);

        this.startBlock = this.blocks[sr][sc];
        this.endBlock = this.blocks[er][ec];
        this.startBlock.isActive = this.endBlock.isActive = true;
        this.startBlock.isOnMainPath = this.endBlock.isOnMainPath = true;

        this._generateMainPath(sr, sc, er, ec);
        this._generateAltPaths();
        this._generateBranchBlocks();

        const activeCount = this._getActiveBlocks().length;
        console.log(`阶段二: start=(${sr},${sc}), end=(${er},${ec}), active=${activeCount}`);
    }

    _generateMainPath(sr, sc, er, ec) {
        const path = [{ row: sr, col: sc }];
        let cr = sr, cc = sc;
        const visited = new Set([`${sr},${sc}`]);

        while (cr !== er || cc !== ec) {
            const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            const weighted = [];
            for (const [dr, dc] of dirs) {
                const nr = cr + dr, nc = cc + dc;
                if (nr < 0 || nr >= this.blockCount || nc < 0 || nc >= this.blockCount) continue;
                if (visited.has(`${nr},${nc}`)) continue;
                const dist = Math.abs(nr - er) + Math.abs(nc - ec);
                const curDist = Math.abs(cr - er) + Math.abs(cc - ec);
                let weight = 1;
                if (dist < curDist) weight *= 3;
                for (let w = 0; w < weight; w++) weighted.push({ row: nr, col: nc });
            }
            if (weighted.length === 0) break;
            const next = this.rng.pick(weighted);
            cr = next.row; cc = next.col;
            path.push({ row: cr, col: cc });
            visited.add(`${cr},${cc}`);
        }

        this.mainPathBlocks = path;
        for (const p of path) {
            const b = this.blocks[p.row][p.col];
            b.isActive = true;
            b.isOnMainPath = true;
        }
    }

    _generateAltPaths() {
        const mp = this.mainPathBlocks;
        if (mp.length < 4) return;
        const start = this.rng.nextInt(1, Math.floor(mp.length / 2));
        const end = this.rng.nextInt(Math.floor(mp.length / 2) + 1, mp.length - 2);
        if (end - start < 3) return;

        const altStart = mp[start], altEnd = mp[end];
        let cr = altStart.row, cc = altStart.col;
        const visited = new Set();
        for (const p of mp) visited.add(`${p.row},${p.col}`);
        const altPath = [];

        while (cr !== altEnd.row || cc !== altEnd.col) {
            const dirs = this.rng.shuffle([[-1, 0], [1, 0], [0, -1], [0, 1]]);
            let moved = false;
            for (const [dr, dc] of dirs) {
                const nr = cr + dr, nc = cc + dc;
                if (nr < 0 || nr >= this.blockCount || nc < 0 || nc >= this.blockCount) continue;
                if (visited.has(`${nr},${nc}`) && !(nr === altEnd.row && nc === altEnd.col)) continue;
                const dist = Math.abs(nr - altEnd.row) + Math.abs(nc - altEnd.col);
                if (dist < Math.abs(cr - altEnd.row) + Math.abs(cc - altEnd.col) || this.rng.next() < 0.3) {
                    cr = nr; cc = nc;
                    altPath.push({ row: cr, col: cc });
                    visited.add(`${cr},${cc}`);
                    moved = true;
                    break;
                }
            }
            if (!moved) break;
        }

        this.altPathBlocks = altPath;
        for (const p of altPath) {
            const b = this.blocks[p.row][p.col];
            if (!b.isOnMainPath) {
                b.isActive = true;
                b.isOnAltPath = true;
            }
        }
    }

    _generateBranchBlocks() {
        const existing = new Set();
        for (const b of this._getActiveBlocks()) {
            existing.add(`${b.row},${b.col}`);
        }

        for (let pass = 0; pass < 3; pass++) {
            const currentActive = this._getActiveBlocks();
            for (const b of currentActive) {
                if (this.rng.next() >= this._branchProb) continue;
                const dirs = this.rng.shuffle([[-1, 0], [1, 0], [0, -1], [0, 1]]);
                const extend = this.rng.nextInt(1, 3);
                let cr = b.row, cc = b.col;

                for (const [dr, dc] of dirs) {
                    const nr = cr + dr, nc = cc + dc;
                    if (nr < 0 || nr >= this.blockCount || nc < 0 || nc >= this.blockCount) continue;
                    if (existing.has(`${nr},${nc}`)) continue;

                    cr = nr; cc = nc;
                    const block = this.blocks[cr][cc];
                    block.isActive = true;
                    block.isBranch = true;
                    this.branchBlocks.push({ row: cr, col: cc });
                    existing.add(`${cr},${cc}`);

                    for (let i = 1; i < extend; i++) {
                        const subdirs = this.rng.shuffle([[-1, 0], [1, 0], [0, -1], [0, 1]]);
                        let extended = false;
                        for (const [sdr, sdc] of subdirs) {
                            const nnr = cr + sdr, nnc = cc + sdc;
                            if (nnr < 0 || nnr >= this.blockCount || nnc < 0 || nnc >= this.blockCount) continue;
                            if (existing.has(`${nnr},${nnc}`)) continue;
                            cr = nnr; cc = nnc;
                            const nb = this.blocks[cr][cc];
                            nb.isActive = true;
                            nb.isBranch = true;
                            this.branchBlocks.push({ row: cr, col: cc });
                            existing.add(`${cr},${cc}`);
                            extended = true;
                            break;
                        }
                        if (!extended) break;
                    }
                    break;
                }
            }
        }
    }

    _getActiveBlocks() {
        const active = [];
        for (let r = 0; r < this.blockCount; r++) {
            for (let c = 0; c < this.blockCount; c++) {
                if (this.blocks[r][c].isActive) active.push(this.blocks[r][c]);
            }
        }
        return active;
    }

    _getBlockByRowCol(row, col) {
        return this.blocks[row]?.[col] || null;
    }

    _stage3_mergeBlocks() {
        const totalRooms = this.totalRoomCount;
        const megaCount = Math.max(1, Math.floor(totalRooms * this._megaRatio));

        const candidates = [];
        const used = new Set();
        for (let r = 0; r < this.blockCount; r++) {
            for (let c = 0; c < this.blockCount; c++) {
                const b = this.blocks[r][c];
                if (!b.isActive || b.isMerged) continue;
                if (b === this.startBlock || b === this.endBlock) continue;

                for (const [dr, dc] of [[0, 1], [1, 0]]) {
                    const nr = r + dr, nc = c + dc;
                    if (nr >= this.blockCount || nc >= this.blockCount) continue;
                    const nb = this.blocks[nr][nc];
                    if (!nb.isActive || nb.isMerged) continue;
                    if (nb === this.startBlock || nb === this.endBlock) continue;
                    const key = `${Math.min(r, nr)},${Math.min(c, nc)}-${Math.max(r, nr)},${Math.max(c, nc)}`;
                    if (used.has(key)) continue;
                    used.add(key);
                    if (2 * this.x >= this._maxMegaRoomSize() + 4) {
                        candidates.push({ a: b, b: nb });
                    }
                }
            }
        }

        const selected = this.rng.shuffle(candidates).slice(0, megaCount);
        this.mergedPairs = [];

        for (const pair of selected) {
            pair.a.isMerged = true;
            pair.b.isMerged = true;
            pair.a.mergedWith = pair.b.id;
            pair.b.mergedWith = pair.a.id;
            this.mergedPairs.push(pair);
        }
        console.log(`阶段三: merged=${this.mergedPairs.length}/${megaCount} target, candidates=${candidates.length}`);
    }

    _stage4_placeRooms() {
        this.rooms = [];
        const totalRooms = this.totalRoomCount;

        const megaRoomCount = Math.max(0, Math.min(this.mergedPairs.length, Math.floor(totalRooms * this._megaRatio)));
        const largeRoomCount = Math.floor(totalRooms * this._largeRatio);
        const mediumRoomCount = Math.floor(totalRooms * this._mediumRatio);
        const smallRoomCount = totalRooms - megaRoomCount - largeRoomCount - mediumRoomCount;

        this._placeMegaRooms(megaRoomCount);
        this._placeStartEndRooms();
        this._placeLargeRooms(largeRoomCount);
        this._placeMediumRooms(mediumRoomCount);
        this._placeSmallRooms(smallRoomCount);
        this._fillEmptyActiveBlocks();
        this.rooms = this.rooms.filter(r => r !== null);

        console.log(`阶段四: rooms=${this.rooms.length}, mega=${megaRoomCount}, large=${largeRoomCount}, medium=${mediumRoomCount}, small=${smallRoomCount}`);
    }

    _placeMegaRooms(count) {
        for (let i = 0; i < count && i < this.mergedPairs.length; i++) {
            const pair = this.mergedPairs[i];
            const maxSize = this._maxMegaRoomSize();
            const minSize = 14;
            const width = this.rng.nextInt(minSize, maxSize);
            const height = this.rng.nextInt(minSize, maxSize);

            const minR = Math.min(pair.a.gridRow, pair.b.gridRow);
            const maxR = Math.max(pair.a.gridRow + pair.a.size, pair.b.gridRow + pair.b.size) - 1;
            const minC = Math.min(pair.a.gridCol, pair.b.gridCol);
            const maxC = Math.max(pair.a.gridCol + pair.a.size, pair.b.gridCol + pair.b.size) - 1;

            for (let attempt = 0; attempt < 20; attempt++) {
                const gr = this.rng.nextInt(minR + 1, maxR - height);
                const gc = this.rng.nextInt(minC + 1, maxC - width);
                if (gr < minR + 1 || gc < minC + 1) continue;
                const room = new RoomV5(`room_mega_${i}`, gr, gc, width, height);
                room.blocks = [pair.a.id, pair.b.id];

                if (this._roomValid(room)) {
                    this.rooms.push(room);
                    pair.a.rooms.push(room.id);
                    pair.b.rooms.push(room.id);
                    break;
                }
            }
        }
    }

    _placeStartEndRooms() {
        const startSize = 6;
        const sb = this.startBlock;
        for (let attempt = 0; attempt < 30; attempt++) {
            const maxGr = sb.gridRow + sb.size - startSize - 1;
            const maxGc = sb.gridCol + sb.size - startSize - 1;
            if (maxGr <= sb.gridRow + 1 || maxGc <= sb.gridCol + 1) continue;
            const gr = this.rng.nextInt(sb.gridRow + 1, maxGr);
            const gc = this.rng.nextInt(sb.gridCol + 1, maxGc);
            const room = new RoomV5('start_room', gr, gc, startSize, startSize);
            room.type = ROOM_TYPE_V5.START;
            room.blocks = [sb.id];
            if (this._roomValid(room)) {
                this.startRoom = room;
                this.rooms.unshift(room);
                sb.rooms.push(room.id);
                break;
            }
        }

        const endSize = 7;
        const eb = this.endBlock;
        for (let attempt = 0; attempt < 30; attempt++) {
            const maxGr = eb.gridRow + eb.size - endSize - 1;
            const maxGc = eb.gridCol + eb.size - endSize - 1;
            if (maxGr <= eb.gridRow + 1 || maxGc <= eb.gridCol + 1) continue;
            const gr = this.rng.nextInt(eb.gridRow + 1, maxGr);
            const gc = this.rng.nextInt(eb.gridCol + 1, maxGc);
            const room = new RoomV5('end_room', gr, gc, endSize, endSize);
            room.type = ROOM_TYPE_V5.END;
            room.blocks = [eb.id];
            if (this._roomValid(room)) {
                this.endRoom = room;
                this.rooms.push(room);
                eb.rooms.push(room.id);
                break;
            }
        }
    }

    _placeLargeRooms(count) {
        const maxSize = this._maxLargeRoomSize();
        const minSize = 11;
        if (maxSize < minSize) return;
        const activeBlocks = this.rng.shuffle(this._getActiveBlocks().filter(b => !b.isMerged));

        for (let i = 0; i < count; i++) {
            let placed = false;
            for (const block of activeBlocks) {
                if (block === this.startBlock || block === this.endBlock) continue;
                if (block.size < maxSize + 4) continue;

                for (let attempt = 0; attempt < 8; attempt++) {
                    const w = this.rng.nextInt(minSize, maxSize);
                    const h = this.rng.nextInt(minSize, maxSize);
                    const maxGr = block.gridRow + block.size - h - 1;
                    const maxGc = block.gridCol + block.size - w - 1;
                    if (maxGr <= block.gridRow + 1 || maxGc <= block.gridCol + 1) continue;
                    const gr = this.rng.nextInt(block.gridRow + 1, maxGr);
                    const gc = this.rng.nextInt(block.gridCol + 1, maxGc);
                    const room = new RoomV5(`room_large_${i}`, gr, gc, w, h);
                    room.blocks = [block.id];
                    if (this._roomValid(room)) {
                        this.rooms.push(room);
                        block.rooms.push(room.id);
                        placed = true;
                        break;
                    }
                }
                if (placed) break;
            }
            if (!placed) {
                const fallback = this._tryPlaceScaledRoom(`room_large_fb_${i}`, 10, 7, activeBlocks);
                if (fallback) this.rooms.push(fallback);
            }
        }
    }

    _placeMediumRooms(count) {
        const activeBlocks = this.rng.shuffle(this._getActiveBlocks().filter(b => !b.isMerged));

        for (let i = 0; i < count; i++) {
            const room = this._tryPlaceScaledRoom(`room_medium_${i}`, 8, 5, activeBlocks);
            if (room) this.rooms.push(room);
        }
    }

    _placeSmallRooms(count) {
        const allBlocks = this.rng.shuffle(
            this.blocks.flat().filter(b => !b.isMerged)
        );

        for (let i = 0; i < count; i++) {
            const room = this._tryPlaceScaledRoom(`room_small_${i}`, 5, 4, allBlocks);
            if (room) this.rooms.push(room);
        }
    }

    _tryPlaceScaledRoom(id, maxDim, minDim, blocks) {
        for (let size = maxDim; size >= minDim; size--) {
            for (const block of blocks) {
                if (block.size < size + 4) continue;
                const attempts = size >= 6 ? 10 : 20;
                for (let a = 0; a < attempts; a++) {
                    const w = this.rng.nextInt(Math.max(4, size - 2), Math.min(size + 2, block.size - 2));
                    const h = this.rng.nextInt(Math.max(4, size - 2), Math.min(size + 2, block.size - 2));
                    const maxGr = block.gridRow + block.size - h - 1;
                    const maxGc = block.gridCol + block.size - w - 1;
                    if (maxGr <= block.gridRow + 1 || maxGc <= block.gridCol + 1) continue;
                    const gr = this.rng.nextInt(block.gridRow + 1, maxGr);
                    const gc = this.rng.nextInt(block.gridCol + 1, maxGc);
                    const room = new RoomV5(id, gr, gc, w, h);
                    room.blocks = [block.id];
                    if (this._roomValid(room)) {
                        block.rooms.push(room.id);
                        return room;
                    }
                }
            }
        }
        return null;
    }

    _roomValid(room) {
        const gap = this.totalRoomCount > 35 ? this.config.roomMinGap : this.config.roomMinGap + 1;
        for (const existing of this.rooms) {
            if (!existing) continue;
            if (room.overlaps(existing, gap)) return false;
        }
        return true;
    }

    _fillEmptyActiveBlocks() {
        if (this.rooms.length >= this.totalRoomCount) return;
        const emptyBlocks = this._getActiveBlocks().filter(b => b.rooms.length === 0);
        for (const block of emptyBlocks) {
            if (this.rooms.length >= this.totalRoomCount) break;
            const room = this._tryPlaceScaledRoom(
                `room_fill_${block.row}_${block.col}`, 5, 4, [block]
            );
            if (room) {
                this.rooms.push(room);
                block.rooms.push(room.id);
            }
        }
    }

    _stage5_assignTypes() {
        const mainSet = new Set(this.mainPathBlocks.map(b => `${b.row},${b.col}`));
        const altSet = new Set(this.altPathBlocks.map(b => `${b.row},${b.col}`));
        const branchSet = new Set(this.branchBlocks.map(b => `${b.row},${b.col}`));

        for (const room of this.rooms) {
            if (!room) continue;
            if (room.type === ROOM_TYPE_V5.START || room.type === ROOM_TYPE_V5.END) continue;

            const blockRows = room.blocks.map(id => {
                const parts = id.split('_');
                return { row: parseInt(parts[1]), col: parseInt(parts[2]) };
            });

            const isMain = blockRows.some(b => mainSet.has(`${b.row},${b.col}`));
            const isAlt = blockRows.some(b => altSet.has(`${b.row},${b.col}`));
            const isBranch = blockRows.some(b => branchSet.has(`${b.row},${b.col}`));
            const isMerged = room.blocks.length > 1;
            const isIntersection = blockRows.some(b =>
                (mainSet.has(`${b.row},${b.col}`) || altSet.has(`${b.row},${b.col}`)) &&
                (altSet.has(`${b.row},${b.col}`) || branchSet.has(`${b.row},${b.col}`))
            );

            if (isMerged) {
                room.type = this.rng.next() < 0.7 ? ROOM_TYPE_V5.HALL : ROOM_TYPE_V5.CROSSING;
            } else if (isIntersection) {
                room.type = this.rng.next() < 0.6 ? ROOM_TYPE_V5.CROSSING : ROOM_TYPE_V5.HALL;
            } else if (isMain || isAlt) {
                room.type = this.rng.next() < 0.5 ? ROOM_TYPE_V5.HALL : ROOM_TYPE_V5.CHAMBER;
            } else if (isBranch) {
                const block = this._getBlockByRowCol(blockRows[0]?.row, blockRows[0]?.col);
                if (block && block.rooms.length <= 1) {
                    room.type = this.rng.next() < 0.7 ? ROOM_TYPE_V5.DEADEND : ROOM_TYPE_V5.VAULT;
                } else {
                    room.type = this.rng.next() < 0.7 ? ROOM_TYPE_V5.CHAMBER : ROOM_TYPE_V5.VAULT;
                }
            } else {
                room.type = this.rng.next() < 0.5 ? ROOM_TYPE_V5.VAULT : ROOM_TYPE_V5.HIDDEN;
            }
        }

        const typeCounts = {};
        for (const r of this.rooms) {
            if (!r) continue;
            typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
        }
        console.log(`阶段五: types=${JSON.stringify(typeCounts)}`);
    }

    _stage6_roomInteriors() {
        for (const room of this.rooms) {
            if (!room) continue;
            const ib = room.getInteriorBounds();
            if (ib.right < ib.left || ib.bottom < ib.top) continue;

            switch (room.type) {
                case ROOM_TYPE_V5.HALL:
                    this._interiorHall(room, ib);
                    break;
                case ROOM_TYPE_V5.VAULT:
                    this._interiorVault(room, ib);
                    break;
                case ROOM_TYPE_V5.CROSSING:
                    this._interiorCrossing(room, ib);
                    break;
                case ROOM_TYPE_V5.CHAMBER:
                    if (room.width >= 7 && room.height >= 7 && this.rng.next() < 0.4) {
                        room.landmark = { row: room.centerRow, col: room.centerCol };
                    }
                    break;
            }
        }
    }

    _interiorHall(room, ib) {
        const pillarCount = this.rng.nextInt(0, 3);
        const placed = new Set();
        for (let i = 0; i < pillarCount * 3 && placed.size < pillarCount; i++) {
            const pr = this.rng.nextInt(ib.top + 1, ib.bottom - 1);
            const pc = this.rng.nextInt(ib.left + 1, ib.right - 1);
            if (placed.has(`${pr},${pc}`)) continue;
            let tooClose = false;
            for (const key of placed) {
                const [ar, ac] = key.split(',').map(Number);
                if (Math.abs(pr - ar) < 2 && Math.abs(pc - ac) < 2) { tooClose = true; break; }
            }
            if (!tooClose) {
                room.interiorWalls.push({ row: pr, col: pc });
                placed.add(`${pr},${pc}`);
            }
        }
    }

    _interiorVault(room, ib) {
        const halfWallCount = this.rng.nextInt(1, 2);
        for (let i = 0; i < halfWallCount; i++) {
            const length = this.rng.nextInt(2, 3);
            const horizontal = this.rng.next() < 0.5;
            if (horizontal) {
                const r = this.rng.nextInt(ib.top + 1, ib.bottom - 1);
                const c = this.rng.nextInt(ib.left, ib.right - length);
                for (let j = 0; j < length; j++) room.interiorWalls.push({ row: r, col: c + j });
            } else {
                const r = this.rng.nextInt(ib.top, ib.bottom - length);
                const c = this.rng.nextInt(ib.left + 1, ib.right - 1);
                for (let j = 0; j < length; j++) room.interiorWalls.push({ row: r + j, col: c });
            }
        }
    }

    _interiorCrossing(room, ib) {
        const lr = room.centerRow, lc = room.centerCol;
        room.landmark = { row: lr, col: lc };
        for (const [dr, dc] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
            const rr = lr + dr, cc = lc + dc;
            if (rr >= ib.top && rr <= ib.bottom && cc >= ib.left && cc <= ib.right) {
                room.interiorWalls.push({ row: rr, col: cc });
            }
        }
    }

    _stage7_corridors() {
        this.corridors = [];
        const edges = this._buildKNNEdges();
        const mst = this._primMST(edges);
        const extraEdges = this._addExtraEdges(edges, mst);
        const allEdges = [...mst, ...extraEdges];
        this._processSpecialRoomConnections(allEdges);
        this._validateMultiPath(allEdges);
        this._generateDoors(allEdges);
        this._generateCorridorPaths(allEdges);
        console.log(`阶段七: edges=${allEdges.length}, mst=${mst.length}, extra=${extraEdges.length}`);
    }

    _buildKNNEdges() {
        const edges = [];
        const k = Math.min(this.config.kNeighbors, this.rooms.length - 1);
        for (let i = 0; i < this.rooms.length; i++) {
            const dists = [];
            for (let j = 0; j < this.rooms.length; j++) {
                if (i === j) continue;
                const a = this.rooms[i], b = this.rooms[j];
                const dr = a.centerRow - b.centerRow;
                const dc = a.centerCol - b.centerCol;
                dists.push({ j, dist: Math.sqrt(dr * dr + dc * dc) });
            }
            dists.sort((a, b) => a.dist - b.dist);
            for (let n = 0; n < Math.min(k, dists.length); n++) {
                const j = dists[n].j;
                if (i < j) edges.push({ from: i, to: j, dist: dists[n].dist });
            }
        }
        return edges;
    }

    _primMST(edges) {
        if (this.rooms.length <= 1) return [];
        const mst = [];
        const connected = new Set([0]);
        const sorted = [...edges].sort((a, b) => a.dist - b.dist);

        while (connected.size < this.rooms.length) {
            let best = null;
            for (const e of sorted) {
                const fConn = connected.has(e.from);
                const tConn = connected.has(e.to);
                if (fConn !== tConn) { best = e; break; }
            }
            if (!best) break;
            mst.push(best);
            connected.add(best.from);
            connected.add(best.to);
        }
        return mst;
    }

    _addExtraEdges(edges, mst) {
        const mstSet = new Set(mst.map(e => `${Math.min(e.from, e.to)}-${Math.max(e.from, e.to)}`));
        const maxExtra = Math.floor(this.rooms.length * this.config.extraEdgeMaxRatio);
        const extra = [];

        for (const e of this.rng.shuffle(edges)) {
            if (extra.length >= maxExtra) break;
            const key = `${Math.min(e.from, e.to)}-${Math.max(e.from, e.to)}`;
            if (mstSet.has(key)) continue;

            const ra = this.rooms[e.from], rb = this.rooms[e.to];
            let prob = this.config.extraProbEdge;
            const aActive = ra.blocks.some(bid => {
                const p = bid.split('_'); const b = this._getBlockByRowCol(parseInt(p[1]), parseInt(p[2]));
                return b && b.isActive;
            });
            const bActive = rb.blocks.some(bid => {
                const p = bid.split('_'); const b = this._getBlockByRowCol(parseInt(p[1]), parseInt(p[2]));
                return b && b.isActive;
            });
            if (aActive && bActive) prob = this.config.extraProbActive;
            else if (aActive || bActive) prob = this.config.extraProbBranch;

            if (this.rng.next() < prob) {
                extra.push(e);
                mstSet.add(key);
            }
        }
        return extra;
    }

    _processSpecialRoomConnections(allEdges) {
        const roomConns = new Map();
        for (const r of this.rooms) roomConns.set(r.id, []);
        for (const e of allEdges) {
            roomConns.get(this.rooms[e.from].id).push(e.to);
            roomConns.get(this.rooms[e.to].id).push(e.from);
        }

        const adjSet = new Set();
        for (const e of allEdges) {
            adjSet.add(`${Math.min(e.from, e.to)}-${Math.max(e.from, e.to)}`);
        }

        for (let i = 0; i < this.rooms.length; i++) {
            const room = this.rooms[i];
            const conns = roomConns.get(room.id) || [];
            if (room.type !== ROOM_TYPE_V5.CROSSING) continue;

            if (conns.length >= 3) continue;
            const need = 3 - conns.length;
            const candidates = [];
            for (let j = 0; j < this.rooms.length; j++) {
                if (j === i || conns.includes(j)) continue;
                const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
                if (adjSet.has(key)) continue;
                const dr = this.rooms[i].centerRow - this.rooms[j].centerRow;
                const dc = this.rooms[i].centerCol - this.rooms[j].centerCol;
                candidates.push({ j, dist: Math.sqrt(dr * dr + dc * dc) });
            }
            candidates.sort((a, b) => a.dist - b.dist);
            for (let n = 0; n < Math.min(need, candidates.length); n++) {
                const key = `${Math.min(i, candidates[n].j)}-${Math.max(i, candidates[n].j)}`;
                adjSet.add(key);
                allEdges.push({ from: i, to: candidates[n].j, dist: candidates[n].dist });
            }
        }
    }

    _validateMultiPath(allEdges) {
        const adj = new Map();
        for (const r of this.rooms) adj.set(r.id, []);
        for (const e of allEdges) {
            adj.get(this.rooms[e.from].id).push(this.rooms[e.to].id);
            adj.get(this.rooms[e.to].id).push(this.rooms[e.from].id);
        }

        const visited = new Set([this.startRoom.id]);
        const queue = [this.startRoom.id];
        while (queue.length > 0) {
            const cur = queue.shift();
            for (const next of (adj.get(cur) || [])) {
                if (!visited.has(next)) { visited.add(next); queue.push(next); }
            }
        }
        if (!visited.has(this.endRoom.id)) {
            const dr = this.startRoom.centerRow - this.endRoom.centerRow;
            const dc = this.startRoom.centerCol - this.endRoom.centerCol;
            const si = this.rooms.indexOf(this.startRoom);
            const ei = this.rooms.indexOf(this.endRoom);
            allEdges.push({ from: si, to: ei, dist: Math.sqrt(dr * dr + dc * dc) });
        }
    }

    _generateDoors(allEdges) {
        for (const room of this.rooms) room.doors = [];

        for (const e of allEdges) {
            const roomA = this.rooms[e.from], roomB = this.rooms[e.to];
            this._placeDoorBetween(roomA, roomB);
            this._placeDoorBetween(roomB, roomA);
        }
    }

    _placeDoorBetween(roomA, roomB) {
        const ib = roomA.getInteriorBounds();
        const bnd = roomA.getBounds();
        const dirR = roomB.centerRow - roomA.centerRow;
        const dirC = roomB.centerCol - roomA.centerCol;

        const faces = [];
        if (dirR < 0) faces.push({ wall: 'top', fixed: bnd.top, range: [ib.left, ib.right] });
        if (dirR > 0) faces.push({ wall: 'bottom', fixed: bnd.bottom, range: [ib.left, ib.right] });
        if (dirC < 0) faces.push({ wall: 'left', fixed: bnd.left, range: [ib.top, ib.bottom], rowRange: true });
        if (dirC > 0) faces.push({ wall: 'right', fixed: bnd.right, range: [ib.top, ib.bottom], rowRange: true });
        if (faces.length === 0) {
            faces.push({ wall: 'bottom', fixed: bnd.bottom, range: [ib.left, ib.right] });
        }

        const face = this.rng.pick(faces);
        const rng = face.range;

        if (face.rowRange) {
            const pos = this.rng.nextInt(rng[0], rng[1]);
            const existing = roomA.doors.find(d => d.row === pos && d.col === face.fixed);
            if (!existing) {
                roomA.doors.push({ row: pos, col: face.fixed, direction: face.wall });
            }
        } else {
            const pos = this.rng.nextInt(rng[0], rng[1]);
            const existing = roomA.doors.find(d => d.col === pos && d.row === face.fixed);
            if (!existing) {
                roomA.doors.push({ row: face.fixed, col: pos, direction: face.wall });
            }
        }
    }

    _generateCorridorPaths(allEdges) {
        this._initGrid();

        for (const room of this.rooms) {
            const b = room.getBounds();
            for (let r = b.top; r <= b.bottom; r++) {
                for (let c = b.left; c <= b.right; c++) {
                    if (r >= 0 && r < this.mapSize && c >= 0 && c < this.mapSize) {
                        const isBorder = r === b.top || r === b.bottom || c === b.left || c === b.right;
                        this.globalGrid[r][c] = isBorder ? CELL_TYPE_V5.ROOM_WALL : CELL_TYPE_V5.ROOM_FLOOR;
                    }
                }
            }
            for (const iw of room.interiorWalls) {
                if (iw.row >= 0 && iw.row < this.mapSize && iw.col >= 0 && iw.col < this.mapSize) {
                    this.globalGrid[iw.row][iw.col] = CELL_TYPE_V5.WALL;
                }
            }
            if (room.landmark) {
                this.globalGrid[room.landmark.row][room.landmark.col] = CELL_TYPE_V5.MONUMENT;
            }
            for (const door of room.doors) {
                this.globalGrid[door.row][door.col] = CELL_TYPE_V5.DOOR;
            }
        }

        for (const e of allEdges) {
            const roomA = this.rooms[e.from], roomB = this.rooms[e.to];
            const aDoors = roomA.doors.length > 0 ? roomA.doors : [{ row: roomA.centerRow, col: roomA.centerCol }];
            const bDoors = roomB.doors.length > 0 ? roomB.doors : [{ row: roomB.centerRow, col: roomB.centerCol }];
            const startDoor = this.rng.pick(aDoors);
            const endDoor = this.rng.pick(bDoors);

            let startR = startDoor.row, startC = startDoor.col;
            let endR = endDoor.row, endC = endDoor.col;
            const ba = roomA.getBounds(), bb = roomB.getBounds();

            if (startR === ba.top) startR--; else if (startR === ba.bottom) startR++;
            if (startC === ba.left) startC--; else if (startC === ba.right) startC++;
            if (endR === bb.top) endR--; else if (endR === bb.bottom) endR++;
            if (endC === bb.left) endC--; else if (endC === bb.right) endC++;

            const path = this._astar(startR, startC, endR, endC);
            const width = this._isOnMainPath(e) ? this.config.corridorWidthMain : this.config.corridorWidthOther;

            for (const cell of path) {
                for (let dw = 0; dw < width; dw++) {
                    const rr = cell.row, cc = cell.col + dw;
                    if (rr >= 0 && rr < this.mapSize && cc >= 0 && cc < this.mapSize) {
                        if (this.globalGrid[rr][cc] === CELL_TYPE_V5.WALL) {
                            this.globalGrid[rr][cc] = CELL_TYPE_V5.FLOOR;
                        }
                    }
                }
            }
            this.corridors.push({ from: roomA.id, to: roomB.id, path, width });
        }

        for (const room of this.rooms) {
            for (const door of room.doors) {
                if (this.globalGrid[door.row]?.[door.col] === CELL_TYPE_V5.DOOR) {
                    this.globalGrid[door.row][door.col] = CELL_TYPE_V5.FLOOR;
                }
            }
        }
    }

    _isOnMainPath(edge) {
        const ra = this.rooms[edge.from], rb = this.rooms[edge.to];
        const checkBlock = (room) => {
            if (!room || !room.blocks) return false;
            for (const bid of room.blocks) {
                const parts = bid.split('_');
                if (parts.length < 3) continue;
                const b = this._getBlockByRowCol(parseInt(parts[1]), parseInt(parts[2]));
                if (b && b.isOnMainPath) return true;
            }
            return false;
        };
        return checkBlock(ra) || checkBlock(rb);
    }

    _astar(startR, startC, endR, endC) {
        startR = Math.max(0, Math.min(this.mapSize - 1, startR));
        startC = Math.max(0, Math.min(this.mapSize - 1, startC));
        endR = Math.max(0, Math.min(this.mapSize - 1, endR));
        endC = Math.max(0, Math.min(this.mapSize - 1, endC));

        const open = new Map();
        const closed = new Set();
        const key = (r, c) => `${r},${c}`;
        const h = (r, c) => Math.abs(r - endR) + Math.abs(c - endC);
        open.set(key(startR, startC), { r: startR, c: startC, g: 0, f: h(startR, startC), parent: null });

        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        let iter = 0;

        while (open.size > 0 && iter < 5000) {
            iter++;
            let bestKey = null, bestF = Infinity;
            for (const [k, v] of open) { if (v.f < bestF) { bestF = v.f; bestKey = k; } }
            const cur = open.get(bestKey);
            open.delete(bestKey);

            if (cur.r === endR && cur.c === endC) {
                const path = [];
                let node = cur;
                while (node) { path.unshift({ row: node.r, col: node.c }); node = node.parent; }
                return path;
            }
            closed.add(bestKey);

            const shuffled = this.rng.shuffle(dirs);
            for (const [dr, dc] of shuffled) {
                const nr = cur.r + dr, nc = cur.c + dc;
                if (nr < 0 || nr >= this.mapSize || nc < 0 || nc >= this.mapSize) continue;
                const nk = key(nr, nc);
                if (closed.has(nk)) continue;

                const cell = this.globalGrid[nr]?.[nc];
                const blocked = cell === CELL_TYPE_V5.ROOM_WALL || cell === CELL_TYPE_V5.ROOM_FLOOR || cell === CELL_TYPE_V5.SPECIAL_WALL;
                if (blocked) {
                    if (!(nr === endR && nc === endC)) continue;
                }
                if (cell === undefined) continue;

                const ng = cur.g + 1 + (cell === CELL_TYPE_V5.WALL ? 2 : 0);
                const existing = open.get(nk);
                if (existing && existing.g <= ng) continue;
                open.set(nk, { r: nr, c: nc, g: ng, f: ng + h(nr, nc), parent: cur });
            }
        }

        const path = [];
        let cr = startR, cc = startC;
        path.push({ row: cr, col: cc });
        while (cr !== endR || cc !== endC) {
            const candidates = [];
            for (const [dr, dc] of dirs) {
                const nr = cr + dr, nc = cc + dc;
                if (nr < 0 || nr >= this.mapSize || nc < 0 || nc >= this.mapSize) continue;
                const cell = this.globalGrid[nr]?.[nc];
                if (cell === CELL_TYPE_V5.ROOM_FLOOR || cell === CELL_TYPE_V5.ROOM_WALL || cell === CELL_TYPE_V5.SPECIAL_WALL) continue;
                candidates.push({ r: nr, c: nc, dist: Math.abs(nr - endR) + Math.abs(nc - endC) });
            }
            if (candidates.length === 0) break;
            candidates.sort((a, b) => a.dist - b.dist);
            cr = candidates[0].r; cc = candidates[0].c;
            path.push({ row: cr, col: cc });
            if (path.length > 200) break;
        }
        return path;
    }

    _stage8_fillSpace() {
        const branchCount = this.rng.nextInt(5, 12);
        for (let i = 0; i < branchCount; i++) {
            const room = this.rng.pick(this.rooms);
            const door = room.doors.length > 0 ? this.rng.pick(room.doors) : { row: room.centerRow, col: room.centerCol };
            let r = door.row, c = door.col;
            const b = room.getBounds();

            if (r === b.top) r--; else if (r === b.bottom) r++;
            if (c === b.left) c--; else if (c === b.right) c++;

            const len = this.rng.nextInt(this.config.branchCorridorMin, this.config.branchCorridorMax);
            let dir = this.rng.pick([[-1, 0], [1, 0], [0, -1], [0, 1]]);

            const path = [];
            for (let j = 0; j < len; j++) {
                r += dir[0]; c += dir[1];
                if (r < 1 || r >= this.mapSize - 1 || c < 1 || c >= this.mapSize - 1) break;

                let blocked = false;
                for (const rm of this.rooms) {
                    if (rm.containsRowCol(r, c)) { blocked = true; break; }
                }
                if (blocked) break;
                path.push({ row: r, col: c });

                if (j % 3 === 0 && this.rng.next() < 0.3) {
                    dir = this.rng.pick([[-1, 0], [1, 0], [0, -1], [0, 1]]);
                }
            }

            for (const cell of path) {
                if (this.globalGrid[cell.row]?.[cell.col] === CELL_TYPE_V5.WALL) {
                    this.globalGrid[cell.row][cell.col] = CELL_TYPE_V5.FLOOR;
                }
            }
            if (path.length > 0) {
                this.corridors.push({ from: room.id, to: 'deadend', path, width: 1, isDeadEnd: true });
            }
        }

        const deadEndCount = this.rng.nextInt(3, 8);
        for (let i = 0; i < deadEndCount; i++) {
            const floorCells = [];
            for (let rr = 1; rr < this.mapSize - 1; rr++) {
                for (let cc = 1; cc < this.mapSize - 1; cc++) {
                    if (this.globalGrid[rr][cc] === CELL_TYPE_V5.FLOOR) {
                        let wallNeighbors = 0;
                        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                            if (this.globalGrid[rr + dr]?.[cc + dc] === CELL_TYPE_V5.WALL) wallNeighbors++;
                        }
                        if (wallNeighbors >= 2) floorCells.push({ row: rr, col: cc });
                    }
                }
            }
            if (floorCells.length > 0) {
                const start = this.rng.pick(floorCells);
                const dir = this.rng.pick([[-1, 0], [1, 0], [0, -1], [0, 1]]);
                const len = this.rng.nextInt(1, 4);
                for (let j = 1; j <= len; j++) {
                    const nr = start.row + dir[0] * j, nc = start.col + dir[1] * j;
                    if (nr < 1 || nr >= this.mapSize - 1 || nc < 1 || nc >= this.mapSize - 1) break;
                    if (this.globalGrid[nr]?.[nc] !== CELL_TYPE_V5.WALL) break;
                    this.globalGrid[nr][nc] = CELL_TYPE_V5.FLOOR;
                }
            }
        }
    }

    _stage9_placeItems() {
        for (const room of this.rooms) {
            if (room.type === ROOM_TYPE_V5.START) continue;

            const ib = room.getInteriorBounds();
            const floorCells = [];
            for (let r = ib.top; r <= ib.bottom; r++) {
                for (let c = ib.left; c <= ib.right; c++) {
                    const blocked = room.interiorWalls.some(w => w.row === r && w.col === c) ||
                                    (room.landmark && room.landmark.row === r && room.landmark.col === c);
                    if (!blocked) floorCells.push({ row: r, col: c });
                }
            }

            let chestCount = 0;
            switch (room.type) {
                case ROOM_TYPE_V5.END: chestCount = 1; break;
                case ROOM_TYPE_V5.VAULT: chestCount = this.rng.nextInt(2, 3); break;
                case ROOM_TYPE_V5.HALL: chestCount = this.rng.nextInt(1, 2); break;
                case ROOM_TYPE_V5.CHAMBER: chestCount = this.rng.nextInt(1, 2); break;
                case ROOM_TYPE_V5.CROSSING: chestCount = this.rng.nextInt(0, 1); break;
                case ROOM_TYPE_V5.DEADEND: chestCount = this.rng.nextInt(1, 2); break;
                case ROOM_TYPE_V5.HIDDEN: chestCount = this.rng.nextInt(1, 2); break;
            }

            for (let i = 0; i < chestCount && floorCells.length > 0; i++) {
                const idx = this.rng.nextInt(0, floorCells.length - 1);
                const cell = floorCells.splice(idx, 1)[0];
                room.chestPos.push(cell);
                this.globalGrid[cell.row][cell.col] = CELL_TYPE_V5.CHEST;
            }
        }

        const corridorChests = this.rng.nextInt(1, 3);
        for (let i = 0; i < corridorChests; i++) {
            const floorCells = [];
            for (let rr = 1; rr < this.mapSize - 1; rr++) {
                for (let cc = 1; cc < this.mapSize - 1; cc++) {
                    if (this.globalGrid[rr][cc] === CELL_TYPE_V5.FLOOR) floorCells.push({ row: rr, col: cc });
                }
            }
            if (floorCells.length > 0) {
                const cell = this.rng.pick(floorCells);
                this.globalGrid[cell.row][cell.col] = CELL_TYPE_V5.CHEST;
            }
        }

        if (this.endRoom) {
            this.globalGrid[this.endRoom.centerRow][this.endRoom.centerCol] = CELL_TYPE_V5.EXIT;
        }

        for (const room of this.rooms) {
            if (room.type === ROOM_TYPE_V5.HIDDEN) {
                const b = room.getBounds();
                for (let r = b.top; r <= b.bottom; r++) {
                    for (let c = b.left; c <= b.right; c++) {
                        if (r === b.top || r === b.bottom || c === b.left || c === b.right) {
                            const val = this.globalGrid[r]?.[c];
                            if (val === CELL_TYPE_V5.ROOM_WALL || val === CELL_TYPE_V5.DOOR) {
                                this.globalGrid[r][c] = CELL_TYPE_V5.SPECIAL_WALL;
                            }
                        }
                    }
                }
            }
        }
    }

    _convertCellTypes() {
        const convert = { 7: CELL_TYPE_V5.FLOOR, 8: CELL_TYPE_V5.WALL, 9: CELL_TYPE_V5.FLOOR, 10: CELL_TYPE_V5.WALL };
        for (let r = 0; r < this.mapSize; r++) {
            for (let c = 0; c < this.mapSize; c++) {
                const v = this.globalGrid[r][c];
                if (convert[v] !== undefined) this.globalGrid[r][c] = convert[v];
            }
        }
    }

    _stage10_validate() {
        const visited = new Set();
        const queue = [];
        const sr = this.startRoom.centerRow, sc = this.startRoom.centerCol;
        const startCell = this.globalGrid[sr]?.[sc];
        if (startCell !== undefined && startCell !== CELL_TYPE_V5.WALL && startCell !== CELL_TYPE_V5.SPECIAL_WALL) {
            queue.push({ row: sr, col: sc });
            visited.add(`${sr},${sc}`);
        }

        while (queue.length > 0) {
            const cur = queue.shift();
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const nr = cur.row + dr, nc = cur.col + dc;
                if (nr < 0 || nr >= this.mapSize || nc < 0 || nc >= this.mapSize) continue;
                const k = `${nr},${nc}`;
                if (visited.has(k)) continue;
                const cell = this.globalGrid[nr]?.[nc];
                if (cell === CELL_TYPE_V5.WALL || cell === CELL_TYPE_V5.SPECIAL_WALL) continue;
                visited.add(k);
                queue.push({ row: nr, col: nc });
            }
        }

        const er = this.endRoom.centerRow, ec = this.endRoom.centerCol;
        const endReachable = visited.has(`${er},${ec}`);

        let unreachableCount = 0;
        for (const room of this.rooms) {
            const ib = room.getInteriorBounds();
            let reachable = false;
            for (let r = ib.top; r <= ib.bottom && !reachable; r++) {
                for (let c = ib.left; c <= ib.right && !reachable; c++) {
                    if (visited.has(`${r},${c}`)) reachable = true;
                }
            }
            if (!reachable) unreachableCount++;
        }

        const deadEnds = this.rooms.filter(r => r.type === ROOM_TYPE_V5.DEADEND);
        const ratio = this.rooms.length > 0 ? deadEnds.length / this.rooms.length : 0;

        console.log(`阶段十: endReachable=${endReachable}, unreachable=${unreachableCount}, deadEndRatio=${(ratio*100).toFixed(0)}%`);
    }

    _ensureWallThickness() {
        const HORIZONTAL_MIN = 2;
        const VERTICAL_MIN = 3;
        const isWall = (r, c) => {
            return r >= 0 && r < this.mapSize && c >= 0 && c < this.mapSize &&
                   this.globalGrid[r][c] === CELL_TYPE_V5.WALL;
        };

        let changed = true;
        let passes = 0;
        const maxPasses = 20;

        while (changed && passes < maxPasses) {
            changed = false;
            passes++;

            for (let r = 1; r < this.mapSize - 1; r++) {
                for (let c = 1; c < this.mapSize - 1; c++) {
                    if (this.globalGrid[r][c] !== CELL_TYPE_V5.WALL) continue;

                    let hLeft = 0, hRight = 0;
                    while (isWall(r, c - hLeft - 1)) hLeft++;
                    while (isWall(r, c + hRight + 1)) hRight++;
                    const thicknessH = 1 + hLeft + hRight;

                    let vUp = 0, vDown = 0;
                    while (isWall(r - vUp - 1, c)) vUp++;
                    while (isWall(r + vDown + 1, c)) vDown++;
                    const thicknessV = 1 + vUp + vDown;

                    if (thicknessH < HORIZONTAL_MIN || thicknessV < VERTICAL_MIN) {
                        this.globalGrid[r][c] = CELL_TYPE_V5.FLOOR;
                        changed = true;
                    }
                }
            }
        }

        if (passes >= maxPasses) {
            console.warn('_ensureWallThickness: 达到最大迭代次数');
        }
    }

    _initGrid() {
        this.globalGrid = [];
        for (let r = 0; r < this.mapSize; r++) {
            this.globalGrid[r] = new Array(this.mapSize).fill(CELL_TYPE_V5.WALL);
        }
    }
}

if (typeof window !== 'undefined') {
    window.MazeGeneratorV5 = MazeGeneratorV5;
    window.CELL_TYPE_V5 = CELL_TYPE_V5;
} else if (typeof global !== 'undefined') {
    global.MazeGeneratorV5 = MazeGeneratorV5;
    global.CELL_TYPE_V5 = CELL_TYPE_V5;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MazeGeneratorV5, CELL_TYPE_V5 };
}