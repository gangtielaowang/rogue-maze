const CELL_TYPE_V4 = {
    WALL: 0,
    PATH: 1,
    CHEST: 2,
    EXIT: 3,
    RUIN: 4,
    HIGH_COST: 5,
    MONUMENT: 6
};

const ROOM_TYPE_V4 = {
    START: 'start',
    END: 'end',
    HALL: 'hall',
    CHAMBER: 'chamber',
    VAULT: 'vault',
    CROSSING: 'crossing',
    DEADEND: 'deadend',
    HIDDEN: 'hidden'
};

const ROOM_CONFIG = {
    MIN_SIZE: 4,
    MAX_SIZE: 8,
    MIN_GAP: 2,
    ACTIVE_ROOMS_MIN: 2,
    ACTIVE_ROOMS_MAX: 4,
    EDGE_ROOMS_MIN: 0,
    EDGE_ROOMS_MAX: 2,
    START_SIZE: 6,
    END_SIZE: 7,
    TOTAL_ROOMS_MIN: 25,
    TOTAL_ROOMS_MAX: 40,
    CORRIDOR_WIDTH_MAIN: 2,
    CORRIDOR_WIDTH_OTHER: 1,
    K_NEIGHBORS: 5,
    EXTRA_PROB_ACTIVE: 0.4,
    EXTRA_PROB_BRANCH: 0.25,
    EXTRA_PROB_EDGE: 0.1,
    BRANCH_CORRIDOR_MIN: 2,
    BRANCH_CORRIDOR_MAX: 6
};

class RandomV4 {
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
    nextGaussian(mean = 0, std = 1) {
        const u1 = this.next();
        const u2 = this.next();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + z * std;
    }
}

class Room {
    constructor(id, centerX, centerY, width, height) {
        this.id = id;
        this.centerX = Math.round(centerX);
        this.centerY = Math.round(centerY);
        this.width = width;
        this.height = height;
        this.type = null;
        this.connections = [];
        this.blockRow = 0;
        this.blockCol = 0;
        this.entrances = [];
        this.hidden = false;
        this.pillar = null;
        this.landmark = null;
        this.chestPos = [];
    }

    getBounds() {
        return {
            left: this.centerX - Math.floor(this.width / 2),
            right: this.centerX + Math.floor(this.width / 2),
            top: this.centerY - Math.floor(this.height / 2),
            bottom: this.centerY + Math.floor(this.height / 2)
        };
    }

    getInteriorBounds() {
        const b = this.getBounds();
        return {
            left: b.left + 1,
            right: b.right - 1,
            top: b.top + 1,
            bottom: b.bottom - 1
        };
    }

    overlaps(other, gap = ROOM_CONFIG.MIN_GAP) {
        const a = this.getBounds();
        const b = other.getBounds();
        const gapX = Math.floor(gap / 2);
        const gapY = Math.floor(gap / 2);
        return !(a.right + gapX < b.left || b.right + gapX < a.left ||
                 a.bottom + gapY < b.top || b.bottom + gapY < a.top);
    }

    contains(x, y) {
        const b = this.getBounds();
        return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
    }

    isOnBoundary(x, y) {
        const b = this.getBounds();
        return (x === b.left || x === b.right || y === b.top || y === b.bottom) &&
               x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
    }
}

class MazeGeneratorV4 {
    constructor(seed, config = {}) {
        this.rng = new RandomV4(seed || Math.floor(Math.random() * 1000000));
        const blockCount = config.blockCount || 3;
        const defaultMaxCorridor = Math.max(20, Math.ceil(100 / blockCount));

        this.config = {
            mapSize: config.mapSize || 100,
            blockCount: blockCount,
            roomMinSize: config.roomMinSize || ROOM_CONFIG.MIN_SIZE,
            roomMaxSize: config.roomMaxSize || ROOM_CONFIG.MAX_SIZE,
            roomGap: config.roomGap || ROOM_CONFIG.MIN_GAP,
            roomMinCount: config.roomMinCount || ROOM_CONFIG.TOTAL_ROOMS_MIN,
            roomMaxCount: config.roomMaxCount || ROOM_CONFIG.TOTAL_ROOMS_MAX,
            corridorWidthMain: config.corridorWidthMain || ROOM_CONFIG.CORRIDOR_WIDTH_MAIN,
            corridorWidthOther: config.corridorWidthOther || ROOM_CONFIG.CORRIDOR_WIDTH_OTHER,
            maxCorridorLength: config.maxCorridorLength || defaultMaxCorridor,
            ...config
        };
        this.totalSize = this.config.mapSize;
        this.blockSize = Math.floor(this.totalSize / this.config.blockCount);
        this.rooms = [];
        this.corridors = [];
        this.blocks = [];
        this.globalGrid = [];
        this.startRoom = null;
        this.endRoom = null;
        this.activeBlocks = new Set();
        this.edgeBlocks = new Set();
        this.blockPaths = [];
    }

    generate() {
        console.log('=== MazeGeneratorV4 迷宫生成开始 ===');

        console.log('阶段一：划分概念区块，确定起点终点');
        this.initializeBlocks();
        this.selectStartEndBlocks();
        this.planBlockPaths();

        console.log('阶段二：生成房间位置和尺寸');
        this.placeRoomsInBlocks();
        this.placeStartEndRooms();
        this.validateRoomCount();

        console.log('阶段三：分配房间类型');
        this.assignRoomTypes();
        this.generateRoomFeatures();

        console.log('阶段四：生成房间之间的通道连接');
        this.buildRoomConnections();
        this.generateCorridors();

        console.log('阶段五：填充剩余空间');
        this.generateBranchCorridors();

        console.log('阶段六：放置宝箱');
        this.placeChests();

        console.log('阶段七：验证并修复');
        this.validateConnectivity();

        console.log('阶段八：写入地图数据');
        this.writeMapToGrid();

        console.log('=== MazeGeneratorV4 生成完成 ===');
        return {
            globalGrid: this.globalGrid,
            startPosition: { x: this.startRoom.centerX, y: this.startRoom.centerY },
            exitPosition: { x: this.endRoom.centerX, y: this.endRoom.centerY }
        };
    }

    initializeBlocks() {
        for (let row = 0; row < this.config.blockCount; row++) {
            this.blocks[row] = [];
            for (let col = 0; col < this.config.blockCount; col++) {
                this.blocks[row][col] = {
                    row, col,
                    isActive: false,
                    isOnMainPath: false,
                    isOnAltPath: false,
                    isBranch: false,
                    rooms: []
                };
            }
        }
    }

    selectStartEndBlocks() {
        let attempts = 0;
        do {
            const startRow = this.rng.nextInt(0, this.config.blockCount - 1);
            const startCol = this.rng.nextInt(0, this.config.blockCount - 1);
            this.startBlock = this.blocks[startRow][startCol];
            this.startBlock.isActive = true;
            this.startBlock.isOnMainPath = true;
            attempts++;
        } while (attempts < 100 && this.startBlock.row <= 1 && this.startBlock.col <= 1);

        const sr = this.startBlock.row;
        const sc = this.startBlock.col;
        const maxBC = this.config.blockCount;
        const neighbors = [];
        if (sr > 0) neighbors.push({ row: sr - 1, col: sc });
        if (sr < maxBC - 1) neighbors.push({ row: sr + 1, col: sc });
        if (sc > 0) neighbors.push({ row: sr, col: sc - 1 });
        if (sc < maxBC - 1) neighbors.push({ row: sr, col: sc + 1 });

        if (neighbors.length > 0) {
            const pick = this.rng.nextInt(0, neighbors.length - 1);
            this.endBlock = this.blocks[neighbors[pick].row][neighbors[pick].col];
            this.endBlock.isActive = true;
            this.endBlock.isOnMainPath = true;
        } else {
            this.endBlock = this.startBlock;
        }
    }

    planBlockPaths() {
        let currentRow = this.startBlock.row;
        let currentCol = this.startBlock.col;
        const mainPath = [{ row: currentRow, col: currentCol }];
        this.activeBlocks.add(`${currentRow},${currentCol}`);

        while (currentRow !== this.endBlock.row || currentCol !== this.endBlock.col) {
            const neighbors = [];
            if (currentRow > 0 && !this.activeBlocks.has(`${currentRow - 1},${currentCol}`)) {
                neighbors.push({ row: currentRow - 1, col: currentCol });
            }
            if (currentRow < this.config.blockCount - 1 && !this.activeBlocks.has(`${currentRow + 1},${currentCol}`)) {
                neighbors.push({ row: currentRow + 1, col: currentCol });
            }
            if (currentCol > 0 && !this.activeBlocks.has(`${currentRow},${currentCol - 1}`)) {
                neighbors.push({ row: currentRow, col: currentCol - 1 });
            }
            if (currentCol < this.config.blockCount - 1 && !this.activeBlocks.has(`${currentRow},${currentCol + 1}`)) {
                neighbors.push({ row: currentRow, col: currentCol + 1 });
            }

            if (neighbors.length === 0) break;

            let selected;
            const dists = neighbors.map(n => Math.abs(n.row - this.endBlock.row) + Math.abs(n.col - this.endBlock.col));
            const minDist = Math.min(...dists);
            const goodNeighbors = neighbors.filter((n, i) => dists[i] === minDist);
            selected = goodNeighbors[this.rng.nextInt(0, goodNeighbors.length - 1)];

            currentRow = selected.row;
            currentCol = selected.col;
            mainPath.push({ row: currentRow, col: currentCol });
            this.activeBlocks.add(`${currentRow},${currentCol}`);
            this.blocks[currentRow][currentCol].isActive = true;
            this.blocks[currentRow][currentCol].isOnMainPath = true;
        }

        this.mainPath = mainPath;
        this.blockPaths.push({ type: 'main', blocks: mainPath });

        const altPathStart = this.rng.nextInt(1, Math.floor(mainPath.length / 2));
        const altPathEnd = this.rng.nextInt(Math.floor(mainPath.length / 2) + 1, mainPath.length - 1);
        if (altPathEnd - altPathStart >= 2) {
            const altPath = mainPath.slice(altPathStart, altPathEnd + 1);
            for (const p of altPath) {
                this.blocks[p.row][p.col].isOnAltPath = true;
            }
            this.blockPaths.push({ type: 'alt', blocks: altPath });
        }

        for (const p of mainPath) {
            const block = this.blocks[p.row][p.col];
            const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            this.rng.shuffle(dirs);
            for (const [dr, dc] of dirs) {
                const nr = p.row + dr;
                const nc = p.col + dc;
                if (nr >= 0 && nr < this.config.blockCount && nc >= 0 && nc < this.config.blockCount) {
                    const neighborBlock = this.blocks[nr][nc];
                    if (!neighborBlock.isActive && this.rng.next() < 0.5) {
                        neighborBlock.isActive = true;
                        neighborBlock.isBranch = true;
                        this.activeBlocks.add(`${nr},${nc}`);
                        this.blockPaths.push({ type: 'branch', blocks: [{ row: nr, col: nc }] });
                        break;
                    }
                }
            }
        }

        for (let r = 0; r < this.config.blockCount; r++) {
            for (let c = 0; c < this.config.blockCount; c++) {
                if (!this.activeBlocks.has(`${r},${c}`)) {
                    this.edgeBlocks.add(`${r},${c}`);
                }
            }
        }
    }

    placeRoomsInBlocks() {
        for (let r = 0; r < this.config.blockCount; r++) {
            for (let c = 0; c < this.config.blockCount; c++) {
                const block = this.blocks[r][c];
                let roomCount;

                if (block.isOnMainPath || block.isOnAltPath) {
                    roomCount = this.rng.nextInt(ROOM_CONFIG.ACTIVE_ROOMS_MIN, ROOM_CONFIG.ACTIVE_ROOMS_MAX);
                } else if (block.isBranch) {
                    roomCount = this.rng.nextInt(1, 3);
                } else {
                    roomCount = this.rng.nextInt(ROOM_CONFIG.EDGE_ROOMS_MIN, ROOM_CONFIG.EDGE_ROOMS_MAX);
                }

                for (let i = 0; i < roomCount; i++) {
                    const room = this.tryPlaceRoomInBlock(block, i);
                    if (room) {
                        this.rooms.push(room);
                        block.rooms.push(room);
                    }
                }
            }
        }
    }

    tryPlaceRoomInBlock(block, index) {
        const blockX = block.col * this.blockSize;
        const blockY = block.row * this.blockSize;

        let width, height;
        if (block.isOnMainPath || block.isOnAltPath) {
            width = this.rng.nextInt(5, ROOM_CONFIG.MAX_SIZE);
            height = this.rng.nextInt(5, ROOM_CONFIG.MAX_SIZE);
        } else {
            width = this.rng.nextInt(ROOM_CONFIG.MIN_SIZE, ROOM_CONFIG.MAX_SIZE);
            height = this.rng.nextInt(ROOM_CONFIG.MIN_SIZE, ROOM_CONFIG.MAX_SIZE);
        }

        const margin = ROOM_CONFIG.MIN_GAP + Math.max(width, height);
        const minX = blockX + margin;
        const maxX = blockX + this.blockSize - margin;
        const minY = blockY + margin;
        const maxY = blockY + this.blockSize - margin;

        if (maxX <= minX || maxY <= minY) return null;

        for (let attempt = 0; attempt < 15; attempt++) {
            const centerX = this.rng.nextInt(minX, maxX);
            const centerY = this.rng.nextInt(minY, maxY);

            const room = new Room(
                `room_${this.rooms.length}`,
                centerX, centerY, width, height
            );
            room.blockRow = block.row;
            room.blockCol = block.col;

            let valid = true;
            for (const existing of this.rooms) {
                if (room.overlaps(existing, ROOM_CONFIG.MIN_GAP + 2)) {
                    valid = false;
                    break;
                }
            }

            if (valid) {
                return room;
            }

            if (attempt > 10) {
                width = Math.max(ROOM_CONFIG.MIN_SIZE, width - 1);
                height = Math.max(ROOM_CONFIG.MIN_SIZE, height - 1);
            }
        }

        return null;
    }

    placeStartEndRooms() {
        const startBlockX = this.startBlock.col * this.blockSize;
        const startBlockY = this.startBlock.row * this.blockSize;
        const startSize = ROOM_CONFIG.START_SIZE;
        const endSize = ROOM_CONFIG.END_SIZE;
        const maxDist = this.config.maxCorridorLength;

        const startCenterX = Math.round(startBlockX + this.blockSize / 2);
        const startCenterY = Math.round(startBlockY + this.blockSize / 2);

        for (let attempt = 0; attempt < 30; attempt++) {
            const cx = startCenterX + this.rng.nextInt(-5, 5);
            const cy = startCenterY + this.rng.nextInt(-5, 5);

            const room = new Room('start_room', cx, cy, startSize, startSize);
            room.type = ROOM_TYPE_V4.START;
            room.blockRow = this.startBlock.row;
            room.blockCol = this.startBlock.col;

            let valid = true;
            for (const existing of this.rooms) {
                if (room.overlaps(existing, ROOM_CONFIG.MIN_GAP + 2)) {
                    valid = false;
                    break;
                }
            }
            if (valid) {
                this.startRoom = room;
                this.rooms.unshift(room);
                this.startBlock.rooms.unshift(room);
                break;
            }
        }

        if (!this.startRoom) {
            for (const r of this.rooms) {
                if (r.blockRow === this.startBlock.row && r.blockCol === this.startBlock.col) {
                    this.startRoom = r;
                    break;
                }
            }
        }
        if (!this.startRoom) {
            this.startRoom = this.rooms[0];
        }

        for (let attempt = 0; attempt < 30; attempt++) {
            const angle = this.rng.next() * Math.PI * 2;
            const dist = this.rng.nextInt(Math.max(endSize, startSize) + 5, Math.max(10, maxDist - endSize));
            const cx = Math.round(this.startRoom.centerX + Math.cos(angle) * dist);
            const cy = Math.round(this.startRoom.centerY + Math.sin(angle) * dist);

            if (cx < endSize || cx >= this.totalSize - endSize || cy < endSize || cy >= this.totalSize - endSize) continue;

            const room = new Room('end_room', cx, cy, endSize, endSize);
            room.type = ROOM_TYPE_V4.END;
            room.blockRow = this.endBlock.row;
            room.blockCol = this.endBlock.col;

            let valid = true;
            for (const existing of this.rooms) {
                if (room.overlaps(existing, ROOM_CONFIG.MIN_GAP + 2)) {
                    valid = false;
                    break;
                }
            }
            if (valid && !room.overlaps(this.startRoom, ROOM_CONFIG.MIN_GAP + 2)) {
                this.endRoom = room;
                this.rooms.push(room);
                this.endBlock.rooms.push(room);
                break;
            }
        }

        if (!this.endRoom) {
            let bestRoom = null;
            let bestDist = Infinity;
            for (const r of this.rooms) {
                if (r.id === this.startRoom.id) continue;
                const dx = r.centerX - this.startRoom.centerX;
                const dy = r.centerY - this.startRoom.centerY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= maxDist && dist < bestDist) {
                    bestDist = dist;
                    bestRoom = r;
                }
            }
            if (!bestRoom) {
                bestDist = Infinity;
                for (const r of this.rooms) {
                    if (r.id === this.startRoom.id) continue;
                    const dx = r.centerX - this.startRoom.centerX;
                    const dy = r.centerY - this.startRoom.centerY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestRoom = r;
                    }
                }
            }
            if (bestRoom) {
                bestRoom.type = ROOM_TYPE_V4.END;
                this.endRoom = bestRoom;
            }
        }
    }

    validateRoomCount() {
        if (this.rooms.length < this.config.roomMinCount) {
            const needed = this.config.roomMinCount - this.rooms.length;
            console.log(`房间数量不足，补充 ${needed} 个房间`);
            this.addRoomsToFillGaps(needed);
        } else if (this.rooms.length > this.config.roomMaxCount) {
            console.log(`房间数量过多，移除多余房间`);
            while (this.rooms.length > this.config.roomMaxCount) {
                const edgeRooms = this.rooms.filter(r =>
                    r.type !== ROOM_TYPE_V4.START &&
                    r.type !== ROOM_TYPE_V4.END &&
                    !this.isOnActivePath(r)
                );
                if (edgeRooms.length > 0) {
                    const toRemove = edgeRooms[this.rng.nextInt(0, edgeRooms.length - 1)];
                    const idx = this.rooms.indexOf(toRemove);
                    if (idx >= 0) this.rooms.splice(idx, 1);
                } else {
                    break;
                }
            }
        }
        console.log(`最终房间数量: ${this.rooms.length}`);
    }

    addRoomsToFillGaps(needed) {
        const activeBlockList = [];
        for (let r = 0; r < this.config.blockCount; r++) {
            for (let c = 0; c < this.config.blockCount; c++) {
                if (this.activeBlocks.has(`${r},${c}`)) {
                    activeBlockList.push(this.blocks[r][c]);
                }
            }
        }

        this.rng.shuffle(activeBlockList);

        for (const block of activeBlockList) {
            if (needed <= 0) break;
            const blockX = block.col * this.blockSize;
            const blockY = block.row * this.blockSize;
            const margin = 6;
            const minX = blockX + margin;
            const maxX = blockX + this.blockSize - margin;
            const minY = blockY + margin;
            const maxY = blockY + this.blockSize - margin;

            for (let attempt = 0; attempt < 10 && needed > 0; attempt++) {
                const width = this.rng.nextInt(ROOM_CONFIG.MIN_SIZE, ROOM_CONFIG.MAX_SIZE);
                const height = this.rng.nextInt(ROOM_CONFIG.MIN_SIZE, ROOM_CONFIG.MAX_SIZE);
                const cx = this.rng.nextInt(minX, maxX);
                const cy = this.rng.nextInt(minY, maxY);

                const room = new Room(`room补充_${this.rooms.length}`, cx, cy, width, height);
                room.blockRow = block.row;
                room.blockCol = block.col;

                let valid = true;
                for (const existing of this.rooms) {
                    if (room.overlaps(existing, ROOM_CONFIG.MIN_GAP + 2)) {
                        valid = false;
                        break;
                    }
                }

                if (valid) {
                    this.rooms.push(room);
                    block.rooms.push(room);
                    needed--;
                }
            }
        }
    }

    isOnActivePath(room) {
        for (const pathInfo of this.blockPaths) {
            for (const p of pathInfo.blocks) {
                if (p.row === room.blockRow && p.col === room.blockCol) {
                    return true;
                }
            }
        }
        return false;
    }

    assignRoomTypes() {
        for (const room of this.rooms) {
            if (room === this.startRoom) {
                room.type = ROOM_TYPE_V4.START;
                continue;
            }
            if (room === this.endRoom) {
                room.type = ROOM_TYPE_V4.END;
                continue;
            }

            const block = this.blocks[room.blockRow][room.blockCol];
            const onMainPath = block.isOnMainPath || block.isOnAltPath;
            const onBranch = block.isBranch;
            const onEdge = this.edgeBlocks.has(`${room.blockRow},${room.blockCol}`);

            const junctionCount = this.countJunctionNeighbors(room);
            const isAtJunction = junctionCount >= 3;

            if (isAtJunction && onMainPath) {
                room.type = this.rng.next() < 0.7 ? ROOM_TYPE_V4.CROSSING : ROOM_TYPE_V4.HALL;
            } else if (onMainPath) {
                room.type = this.rng.next() < 0.6 ? ROOM_TYPE_V4.HALL : ROOM_TYPE_V4.CHAMBER;
            } else if (onBranch) {
                const isDeadEnd = this.isDeadEndRoom(room);
                if (isDeadEnd) {
                    room.type = this.rng.next() < 0.7 ? ROOM_TYPE_V4.DEADEND : ROOM_TYPE_V4.CHAMBER;
                } else {
                    room.type = this.rng.next() < 0.8 ? ROOM_TYPE_V4.CHAMBER : ROOM_TYPE_V4.HALL;
                }
            } else if (onEdge) {
                if (this.rng.next() < 0.6) {
                    room.type = ROOM_TYPE_V4.VAULT;
                    room.hidden = this.rng.next() < 0.4;
                } else {
                    room.type = ROOM_TYPE_V4.CHAMBER;
                }
            } else {
                room.type = ROOM_TYPE_V4.CHAMBER;
            }
        }
    }

    countJunctionNeighbors(room) {
        let count = 0;
        for (const other of this.rooms) {
            if (other === room) continue;
            const dx = Math.abs(other.centerX - room.centerX);
            const dy = Math.abs(other.centerY - room.centerY);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < this.blockSize * 1.5) {
                count++;
            }
        }
        return count;
    }

    isDeadEndRoom(room) {
        let minDist = Infinity;
        let secondMinDist = Infinity;
        for (const other of this.rooms) {
            if (other === room) continue;
            const dx = other.centerX - room.centerX;
            const dy = other.centerY - room.centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
                secondMinDist = minDist;
                minDist = dist;
            } else if (dist < secondMinDist) {
                secondMinDist = dist;
            }
        }
        return secondMinDist > this.blockSize * 1.8;
    }

    generateRoomFeatures() {
        for (const room of this.rooms) {
            if (room.type === ROOM_TYPE_V4.HALL && this.rng.next() < 0.5) {
                const pillarCount = this.rng.nextInt(1, 3);
                const interior = room.getInteriorBounds();
                if (interior.right - interior.left >= 4 && interior.bottom - interior.top >= 4) {
                    room.pillar = [];
                    for (let i = 0; i < pillarCount; i++) {
                        const px = this.rng.nextInt(interior.left + 1, interior.right - 1);
                        const py = this.rng.nextInt(interior.top + 1, interior.bottom - 1);
                        room.pillar.push({ x: px, y: py });
                    }
                }
            }

            if (room.type === ROOM_TYPE_V4.CROSSING) {
                room.landmark = {
                    x: room.centerX,
                    y: room.centerY
                };
            }
        }
    }

    buildRoomConnections() {
        const maxDist = this.config.maxCorridorLength;
        const edges = [];
        for (let i = 0; i < this.rooms.length; i++) {
            for (let j = i + 1; j < this.rooms.length; j++) {
                const a = this.rooms[i];
                const b = this.rooms[j];
                const dx = b.centerX - a.centerX;
                const dy = b.centerY - a.centerY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > maxDist * 1.5) continue;
                edges.push({ from: a, to: b, dist, weight: dist });
            }
        }
        edges.sort((a, b) => a.dist - b.dist);

        const connected = new Set();
        const mstEdges = [];
        connected.add(this.startRoom.id);
        connected.add(this.endRoom.id);

        while (mstEdges.length < this.rooms.length - 1) {
            let bestEdge = null;
            for (const edge of edges) {
                if (edge.dist > maxDist) break;
                const fromConnected = connected.has(edge.from.id);
                const toConnected = connected.has(edge.to.id);
                if (fromConnected !== toConnected) {
                    bestEdge = edge;
                    break;
                }
            }
            if (!bestEdge) break;

            mstEdges.push(bestEdge);
            connected.add(bestEdge.from.id);
            connected.add(bestEdge.to.id);
        }

        for (const edge of mstEdges) {
            edge.from.connections.push(edge.to.id);
            edge.to.connections.push(edge.from.id);
        }

        const criticalRoomIds = new Set();
        const mstAdj = new Map();
        for (const edge of mstEdges) {
            if (!mstAdj.has(edge.from.id)) mstAdj.set(edge.from.id, []);
            if (!mstAdj.has(edge.to.id)) mstAdj.set(edge.to.id, []);
            mstAdj.get(edge.from.id).push(edge.to.id);
            mstAdj.get(edge.to.id).push(edge.from.id);
        }

        const visited = new Set();
        const queue = [this.startRoom.id];
        visited.add(this.startRoom.id);
        const prev = new Map();
        prev.set(this.startRoom.id, null);

        while (queue.length > 0) {
            const current = queue.shift();
            if (current === this.endRoom.id) {
                let node = current;
                while (node !== null) {
                    criticalRoomIds.add(node);
                    node = prev.get(node);
                }
                break;
            }
            const neighbors = mstAdj.get(current) || [];
            for (const n of neighbors) {
                if (!visited.has(n)) {
                    visited.add(n);
                    prev.set(n, current);
                    queue.push(n);
                }
            }
        }

        const extraEdges = [];
        for (const edge of edges) {
            if (mstEdges.includes(edge)) continue;
            const fromBlock = this.blocks[edge.from.blockRow][edge.from.blockCol];
            let prob;
            if (fromBlock.isOnMainPath || fromBlock.isOnAltPath) {
                prob = ROOM_CONFIG.EXTRA_PROB_ACTIVE;
            } else if (fromBlock.isBranch) {
                prob = ROOM_CONFIG.EXTRA_PROB_BRANCH;
            } else {
                prob = ROOM_CONFIG.EXTRA_PROB_EDGE;
            }

            if (this.rng.next() < prob) {
                extraEdges.push(edge);
                edge.from.connections.push(edge.to.id);
                edge.to.connections.push(edge.from.id);
            }
            if (extraEdges.length >= this.rooms.length * 0.3) break;
        }

        for (const room of this.rooms) {
            if (criticalRoomIds.has(room.id)) continue;
            if (room.type === ROOM_TYPE_V4.VAULT || room.type === ROOM_TYPE_V4.HIDDEN) {
                while (room.connections.length > 1) {
                    const toRemove = room.connections[room.connections.length - 1];
                    const otherRoom = this.rooms.find(r => r.id === toRemove);
                    if (otherRoom) {
                        const idx = otherRoom.connections.indexOf(room.id);
                        if (idx >= 0) otherRoom.connections.splice(idx, 1);
                    }
                    room.connections.pop();
                }
            }
        }
    }

    generateCorridors() {
        this.corridors = [];
        const roomMap = new Map();
        for (const room of this.rooms) {
            roomMap.set(room.id, room);
        }

        const processedPairs = new Set();
        for (const room of this.rooms) {
            for (const connId of room.connections) {
                const pairKey = [room.id, connId].sort().join('-');
                if (processedPairs.has(pairKey)) continue;
                processedPairs.add(pairKey);

                const other = roomMap.get(connId);
                if (!other) continue;

                const corridor = this.generateSingleCorridor(room, other);
                if (corridor) {
                    this.corridors.push(corridor);
                }
            }
        }
    }

    generateSingleCorridor(roomA, roomB) {
        const entranceA = this.findEntranceOnWall(roomA, roomB);
        const entranceB = this.findEntranceOnWall(roomB, roomA);

        const path = this.astarPath(
            entranceA.x, entranceA.y,
            entranceB.x, entranceB.y
        );

        if (path.length === 0) return null;

        return {
            from: roomA.id,
            to: roomB.id,
            path: path,
            width: this.config.corridorWidthMain
        };
    }

    findEntranceOnWall(fromRoom, toRoom) {
        const bounds = fromRoom.getBounds();
        const dx = toRoom.centerX - fromRoom.centerX;
        const dy = toRoom.centerY - fromRoom.centerY;

        let entrance;
        if (Math.abs(dx) >= Math.abs(dy)) {
            if (dx > 0) {
                entrance = {
                    x: bounds.right + 1,
                    y: Math.round(fromRoom.centerY)
                };
            } else {
                entrance = {
                    x: bounds.left - 1,
                    y: Math.round(fromRoom.centerY)
                };
            }
        } else {
            if (dy > 0) {
                entrance = {
                    x: Math.round(fromRoom.centerX),
                    y: bounds.bottom + 1
                };
            } else {
                entrance = {
                    x: Math.round(fromRoom.centerX),
                    y: bounds.top - 1
                };
            }
        }

        return entrance;
    }

    astarPath(startX, startY, endX, endY, ignoreLimit = false) {
        const openSet = [];
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const key = (x, y) => `${x},${y}`;
        const heuristic = (x, y) => Math.abs(x - endX) + Math.abs(y - endY);

        openSet.push({ x: startX, y: startY });
        gScore.set(key(startX, startY), 0);
        fScore.set(key(startX, startY), heuristic(startX, startY));

        const maxSteps = ignoreLimit ? Infinity : this.config.maxCorridorLength;
        let steps = 0;

        while (openSet.length > 0) {
            steps++;
            if (steps > maxSteps) {
                return [];
            }

            openSet.sort((a, b) => {
                const fA = fScore.get(key(a.x, a.y)) || Infinity;
                const fB = fScore.get(key(b.x, b.y)) || Infinity;
                return fA - fB;
            });

            const current = openSet.shift();
            const currentKey = key(current.x, current.y);

            if (current.x === endX && current.y === endY) {
                const path = [];
                let node = current;
                while (node) {
                    path.unshift({ x: node.x, y: node.y });
                    node = cameFrom.get(key(node.x, node.y));
                }
                return path;
            }

            closedSet.add(currentKey);

            const neighbors = [
                { x: current.x + 1, y: current.y },
                { x: current.x - 1, y: current.y },
                { x: current.x, y: current.y + 1 },
                { x: current.x, y: current.y - 1 }
            ];

            for (const neighbor of neighbors) {
                const nKey = key(neighbor.x, neighbor.y);
                if (closedSet.has(nKey)) continue;
                if (neighbor.x < 0 || neighbor.x >= this.totalSize ||
                    neighbor.y < 0 || neighbor.y >= this.totalSize) continue;

                if (!ignoreLimit && this.isInRoom(neighbor.x, neighbor.y)) continue;

                const tentativeG = (gScore.get(currentKey) || 0) + 1;
                if (tentativeG < (gScore.get(nKey) || Infinity)) {
                    cameFrom.set(nKey, current);
                    gScore.set(nKey, tentativeG);
                    fScore.set(nKey, tentativeG + heuristic(neighbor.x, neighbor.y));

                    if (!openSet.find(n => n.x === neighbor.x && n.y === neighbor.y)) {
                        openSet.push(neighbor);
                    }
                }
            }
        }

        return [];
    }

    isInRoom(x, y) {
        for (const room of this.rooms) {
            if (room.contains(x, y)) return true;
        }
        return false;
    }

    generateBranchCorridors() {
        const branchCount = this.rng.nextInt(5, 15);
        for (let i = 0; i < branchCount; i++) {
            const corridor = this.rooms[this.rng.nextInt(0, this.rooms.length - 1)];
            const bounds = corridor.getBounds();
            const startX = this.rng.nextInt(bounds.left + 1, bounds.right - 1);
            const startY = this.rng.nextInt(bounds.top + 1, bounds.bottom - 1);

            const length = this.rng.nextInt(ROOM_CONFIG.BRANCH_CORRIDOR_MIN, ROOM_CONFIG.BRANCH_CORRIDOR_MAX);
            const dir = this.rng.shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]])[0];

            const path = [];
            let x = startX;
            let y = startY;
            for (let j = 0; j < length; j++) {
                x += dir[0];
                y += dir[1];
                if (x < 1 || x >= this.totalSize - 1 || y < 1 || y >= this.totalSize - 1) break;
                if (this.isInRoom(x, y)) break;
                path.push({ x, y });
            }

            if (path.length > 0) {
                this.corridors.push({
                    from: corridor.id,
                    to: 'deadend',
                    path: path,
                    width: this.config.corridorWidthOther,
                    isDeadEnd: true
                });
            }
        }
    }

    placeChests() {
        for (const room of this.rooms) {
            if (room.type === ROOM_TYPE_V4.START) continue;

            const interior = room.getInteriorBounds();
            const floorCells = [];

            for (let y = interior.top; y <= interior.bottom; y++) {
                for (let x = interior.left; x <= interior.right; x++) {
                    if (room.pillar) {
                        const isPillar = room.pillar.some(p => p.x === x && p.y === y);
                        if (isPillar) continue;
                    }
                    if (room.landmark && room.landmark.x === x && room.landmark.y === y) continue;
                    floorCells.push({ x, y });
                }
            }

            if (floorCells.length === 0) continue;

            let chestCount = 0;
            if (room.type === ROOM_TYPE_V4.END) chestCount = 1;
            else if (room.type === ROOM_TYPE_V4.VAULT) chestCount = this.rng.nextInt(2, 3);
            else if (room.type === ROOM_TYPE_V4.HALL) chestCount = this.rng.nextInt(0, 2);
            else if (room.type === ROOM_TYPE_V4.CHAMBER || room.type === ROOM_TYPE_V4.DEADEND) {
                chestCount = this.rng.nextInt(1, 2);
            } else if (room.type === ROOM_TYPE_V4.CROSSING) {
                chestCount = this.rng.next() < 0.3 ? 1 : 0;
            }

            for (let c = 0; c < chestCount && floorCells.length > 0; c++) {
                const idx = this.rng.nextInt(0, floorCells.length - 1);
                const cell = floorCells.splice(idx, 1)[0];
                room.chestPos = room.chestPos || [];
                room.chestPos.push(cell);
            }
        }
    }

    validateConnectivity() {
        const startId = this.startRoom.id;
        const endId = this.endRoom.id;

        const neighbors = new Map();
        for (const room of this.rooms) {
            neighbors.set(room.id, new Set());
        }

        for (const corridor of this.corridors) {
            if (!neighbors.has(corridor.from) || !neighbors.has(corridor.to)) continue;
            neighbors.get(corridor.from).add(corridor.to);
            neighbors.get(corridor.to).add(corridor.from);
        }

        const visited = new Set();
        const queue = [startId];
        visited.add(startId);

        while (queue.length > 0) {
            const current = queue.shift();
            for (const next of neighbors.get(current) || []) {
                if (!visited.has(next)) {
                    visited.add(next);
                    queue.push(next);
                }
            }
        }

        if (!visited.has(endId)) {
            console.warn('终点不可达，尝试修复...');
            this.fixConnectivity();
        }
    }

    fixConnectivity() {
        const path = this.astarPath(
            this.startRoom.centerX, this.startRoom.centerY,
            this.endRoom.centerX, this.endRoom.centerY,
            true
        );

        if (path.length > 0) {
            console.log('修复路径长度:', path.length);
            this.corridors.push({
                from: this.startRoom.id,
                to: this.endRoom.id,
                path: path,
                width: this.config.corridorWidthMain
            });
        }
    }

    writeMapToGrid() {
        for (let y = 0; y < this.totalSize; y++) {
            this.globalGrid[y] = new Array(this.totalSize).fill(CELL_TYPE_V4.WALL);
        }

        for (const room of this.rooms) {
            this.writeRoomToGrid(room);
        }

        for (const corridor of this.corridors) {
            this.writeCorridorToGrid(corridor);
        }

        const endX = Math.round(this.endRoom.centerX);
        const endY = Math.round(this.endRoom.centerY);
        this.globalGrid[endY][endX] = CELL_TYPE_V4.EXIT;

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = endX + dx;
                const ny = endY + dy;
                if (nx >= 0 && nx < this.totalSize && ny >= 0 && ny < this.totalSize) {
                    if (this.globalGrid[ny][nx] === CELL_TYPE_V4.WALL) {
                        this.globalGrid[ny][nx] = CELL_TYPE_V4.PATH;
                    }
                }
            }
        }

        for (const room of this.rooms) {
            if (room.chestPos && room.chestPos.length > 0) {
                for (const pos of room.chestPos) {
                    if (pos.x >= 0 && pos.x < this.totalSize &&
                        pos.y >= 0 && pos.y < this.totalSize) {
                        this.globalGrid[pos.y][pos.x] = CELL_TYPE_V4.CHEST;
                    }
                }
            }
        }
    }

    writeRoomToGrid(room) {
        const bounds = room.getBounds();
        const interior = room.getInteriorBounds();

        for (let y = bounds.top; y <= bounds.bottom; y++) {
            for (let x = bounds.left; x <= bounds.right; x++) {
                if (x < 0 || x >= this.totalSize || y < 0 || y >= this.totalSize) continue;

                const isEdge = (x === bounds.left || x === bounds.right ||
                               y === bounds.top || y === bounds.bottom);
                const isInterior = (x >= interior.left && x <= interior.right &&
                                   y >= interior.top && y <= interior.bottom);

                if (isEdge) {
                    this.globalGrid[y][x] = CELL_TYPE_V4.WALL;
                } else if (isInterior) {
                    let isPillar = false;
                    if (room.pillar) {
                        for (const p of room.pillar) {
                            if (p.x === x && p.y === y) {
                                isPillar = true;
                                break;
                            }
                        }
                    }

                    let isLandmark = false;
                    if (room.landmark) {
                        if (room.landmark.x === x && room.landmark.y === y) {
                            isLandmark = true;
                        }
                    }

                    if (isPillar || isLandmark) {
                        this.globalGrid[y][x] = CELL_TYPE_V4.WALL;
                    } else {
                        this.globalGrid[y][x] = CELL_TYPE_V4.PATH;
                    }
                }
            }
        }
    }

    writeCorridorToGrid(corridor) {
        const path = corridor.path;
        if (!path || path.length === 0) return;

        const width = corridor.width || this.config.corridorWidthOther;

        for (const point of path) {
            for (let dy = -Math.floor(width / 2); dy <= Math.floor(width / 2); dy++) {
                for (let dx = -Math.floor(width / 2); dx <= Math.floor(width / 2); dx++) {
                    const nx = point.x + dx;
                    const ny = point.y + dy;
                    if (nx >= 0 && nx < this.totalSize && ny >= 0 && ny < this.totalSize) {
                        let isRoomArea = false;
                        for (const room of this.rooms) {
                            if (room.contains(nx, ny)) {
                                isRoomArea = true;
                                break;
                            }
                        }
                        if (!isRoomArea) {
                            this.globalGrid[ny][nx] = CELL_TYPE_V4.PATH;
                        }
                    }
                }
            }
        }

        if (path.length > 0) {
            this.openDoorAtPoint(path[0]);
            this.openDoorAtPoint(path[path.length - 1]);
        }
    }

    openDoorAtPoint(point) {
        const neighbors = [
            { x: point.x + 1, y: point.y },
            { x: point.x - 1, y: point.y },
            { x: point.x, y: point.y + 1 },
            { x: point.x, y: point.y - 1 }
        ];

        for (const n of neighbors) {
            if (n.x >= 0 && n.x < this.totalSize && n.y >= 0 && n.y < this.totalSize) {
                if (this.globalGrid[n.y][n.x] === CELL_TYPE_V4.WALL) {
                    let isRoomBoundary = false;
                    for (const room of this.rooms) {
                        if (room.isOnBoundary(n.x, n.y)) {
                            isRoomBoundary = true;
                            break;
                        }
                    }
                    if (isRoomBoundary) {
                        this.globalGrid[n.y][n.x] = CELL_TYPE_V4.PATH;
                    }
                }
            }
        }
    }

    getChestPositions() {
        const positions = [];
        for (const room of this.rooms) {
            if (room.chestPos) {
                for (const pos of room.chestPos) {
                    positions.push({ x: pos.x, y: pos.y });
                }
            }
        }
        return positions;
    }
}

if (typeof window !== 'undefined') {
    window.MazeGeneratorV4 = MazeGeneratorV4;
    window.CELL_TYPE = CELL_TYPE_V4;
} else if (typeof global !== 'undefined') {
    global.MazeGeneratorV4 = MazeGeneratorV4;
    global.CELL_TYPE_V4 = CELL_TYPE_V4;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MazeGeneratorV4, CELL_TYPE_V4 };
}
