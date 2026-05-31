const CELL_TYPE_V3 = {
    WALL: 0,
    PATH: 1,
    CHEST: 2,
    EXIT: 3,
    RUIN: 4,
    HIGH_COST: 5,
    MONUMENT: 6
};

const REGION_TYPE_V3 = {
    START: 'start',
    END: 'end',
    MAIN: 'main',
    BRANCH: 'branch',
    JUNCTION: 'junction',
    CLOSED: 'closed'
};

class RandomV3 {
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
}

class Region {
    constructor(row, col) {
        this.row = row;
        this.col = col;
        this.type = null;
        this.connections = { top: false, bottom: false, left: false, right: false };
        this.entrances = [];
        this.exits = [];
        this.isClosed = false;
    }
    getId() {
        return `${this.row},${this.col}`;
    }
}

class MazeGeneratorV3 {
    constructor(seed, config = {}) {
        this.rng = new RandomV3(seed || Math.floor(Math.random() * 1000000));
        this.regions = [];
        this.startRegion = null;
        this.endRegion = null;
        this.mainPath = [];
        this.globalGrid = [];
        
        this.GC = window.GRID_COLS || 10;
        this.GR = window.GRID_ROWS || 10;
        this.SC = window.SCREEN_COLS || 10;
        this.SR = window.SCREEN_ROWS || 10;
        this.totalCols = this.SC * this.GC;
        this.totalRows = this.SR * this.GR;

        this.config = {
            branchProbability: config.branchProbability ?? 0.4,
            minBranchLength: config.minBranchLength ?? 1,
            maxBranchLength: config.maxBranchLength ?? 3,
            minAlternativePaths: config.minAlternativePaths ?? 1,
            maxAlternativePaths: config.maxAlternativePaths ?? 2,
            closedRegionRatio: config.closedRegionRatio ?? 0.2,
            minBoundaryOpenings: config.minBoundaryOpenings ?? 1,
            maxBoundaryOpenings: config.maxBoundaryOpenings ?? 2,
            startExtraWalls: config.startExtraWalls ?? 3,
            mainStraightWeight: config.mainStraightWeight ?? 5,
            branchStraightWeight: config.branchStraightWeight ?? 1,
            junctionExtraWalls: config.junctionExtraWalls ?? 4,
            closedDeadEndCount: config.closedDeadEndCount ?? 4,
            mainDeadEndCount: config.mainDeadEndCount ?? 1,
            ...config
        };
    }

    generate() {
        console.log('=== MazeGeneratorV3 迷宫生成开始 ===');

        console.log('阶段一：初始化区域矩阵');
        this.initializeRegions();
        this.selectStartEnd();

        console.log('阶段二：生成区域级通路');
        this.generateMainPath();
        this.generateBranches();
        this.generateAlternativePaths();
        this.generateClosedRegions();
        this.validateRegionConnectivity();

        console.log('阶段三：分配区域类型');
        this.assignRegionTypes();

        console.log('阶段四：细化区域内地形');
        this.initializeGlobalGrid();
        this.placeBoundaryOpenings();
        this.generateInternalMazes();
        this.alignBoundaries();
        this.validateFullConnectivity();

        console.log('阶段五：放置宝箱');
        this.placeChests();

        console.log('=== MazeGeneratorV3 生成完成 ===');
        return {
            globalGrid: this.globalGrid,
            startPosition: { x: this.startRegion.col * this.GC + Math.floor(this.GC / 2), y: this.startRegion.row * this.GR + Math.floor(this.GR / 2) },
            exitPosition: { x: this.endRegion.col * this.GC + Math.floor(this.GC / 2), y: this.endRegion.row * this.GR + Math.floor(this.GR / 2) },
            chestPositions: this.getChestPositions()
        };
    }

    initializeRegions() {
        for (let row = 0; row < this.SR; row++) {
            this.regions[row] = [];
            for (let col = 0; col < this.SC; col++) {
                this.regions[row][col] = new Region(row, col);
                if (row === 0) this.regions[row][col].connections.top = false;
                if (row === this.SR - 1) this.regions[row][col].connections.bottom = false;
                if (col === 0) this.regions[row][col].connections.left = false;
                if (col === this.SC - 1) this.regions[row][col].connections.right = false;
            }
        }
    }

    selectStartEnd() {
        let startRow, startCol;
        do {
            startRow = this.rng.nextInt(0, this.SR - 1);
            startCol = this.rng.nextInt(0, this.SC - 1);
        } while (startRow >= 4 && startRow <= 5 && startCol >= 4 && startCol <= 5);
        this.startRegion = this.regions[startRow][startCol];

        let endRow, endCol;
        do {
            endRow = this.rng.nextInt(1, this.SR - 2);
            endCol = this.rng.nextInt(1, this.SC - 2);
        } while (Math.abs(endRow - startRow) + Math.abs(endCol - startCol) < 2);
        this.endRegion = this.regions[endRow][endCol];
    }

    generateMainPath() {
        let currentRow = this.startRegion.row;
        let currentCol = this.startRegion.col;
        this.mainPath = [{ row: currentRow, col: currentCol }];

        while (currentRow !== this.endRegion.row || currentCol !== this.endRegion.col) {
            const neighbors = [];
            const weights = [];

            if (currentRow > 0 && !this.regions[currentRow-1][currentCol].connections.bottom) {
                neighbors.push({ row: currentRow-1, col: currentCol });
                weights.push(this.calculateWeight(currentRow-1, currentCol, currentRow, currentCol));
            }
            if (currentRow < this.SR-1 && !this.regions[currentRow+1][currentCol].connections.top) {
                neighbors.push({ row: currentRow+1, col: currentCol });
                weights.push(this.calculateWeight(currentRow+1, currentCol, currentRow, currentCol));
            }
            if (currentCol > 0 && !this.regions[currentRow][currentCol-1].connections.right) {
                neighbors.push({ row: currentRow, col: currentCol-1 });
                weights.push(this.calculateWeight(currentRow, currentCol-1, currentRow, currentCol));
            }
            if (currentCol < this.SC-1 && !this.regions[currentRow][currentCol+1].connections.left) {
                neighbors.push({ row: currentRow, col: currentCol+1 });
                weights.push(this.calculateWeight(currentRow, currentCol+1, currentRow, currentCol));
            }

            if (neighbors.length === 0) break;

            const totalWeight = weights.reduce((a, b) => a + b, 0);
            let rand = this.rng.next() * totalWeight;
            let selected = 0;
            for (let i = 0; i < weights.length; i++) {
                rand -= weights[i];
                if (rand <= 0) {
                    selected = i;
                    break;
                }
            }

            const next = neighbors[selected];
            this.connectRegions(currentRow, currentCol, next.row, next.col);
            currentRow = next.row;
            currentCol = next.col;
            this.mainPath.push({ row: currentRow, col: currentCol });
        }
    }

    calculateWeight(row, col, prevRow, prevCol) {
        const distToEnd = Math.abs(row - this.endRegion.row) + Math.abs(col - this.endRegion.col);
        const prevDist = Math.abs(prevRow - this.endRegion.row) + Math.abs(prevCol - this.endRegion.col);
        
        let weight = 1;
        if (distToEnd < prevDist) weight *= 3;
        const sameDir = (row === prevRow || col === prevCol);
        if (sameDir) weight *= 2;
        return weight;
    }

    connectRegions(row1, col1, row2, col2) {
        if (row2 < row1) {
            this.regions[row1][col1].connections.top = true;
            this.regions[row2][col2].connections.bottom = true;
        } else if (row2 > row1) {
            this.regions[row1][col1].connections.bottom = true;
            this.regions[row2][col2].connections.top = true;
        } else if (col2 < col1) {
            this.regions[row1][col1].connections.left = true;
            this.regions[row2][col2].connections.right = true;
        } else if (col2 > col1) {
            this.regions[row1][col1].connections.right = true;
            this.regions[row2][col2].connections.left = true;
        }
    }

    generateBranches() {
        for (const pos of this.mainPath) {
            if (this.rng.next() < this.config.branchProbability) {
                let dirs = [];
                const r = this.regions[pos.row][pos.col];
                if (!r.connections.top && pos.row > 0) dirs.push({ row: pos.row-1, col: pos.col });
                if (!r.connections.bottom && pos.row < this.SR-1) dirs.push({ row: pos.row+1, col: pos.col });
                if (!r.connections.left && pos.col > 0) dirs.push({ row: pos.row, col: pos.col-1 });
                if (!r.connections.right && pos.col < this.SC-1) dirs.push({ row: pos.row, col: pos.col+1 });

                if (dirs.length > 0) {
                    const chosen = dirs[this.rng.nextInt(0, dirs.length-1)];
                    let currentRow = pos.row;
                    let currentCol = pos.col;
                    let length = this.rng.nextInt(this.config.minBranchLength, this.config.maxBranchLength);

                    for (let i = 0; i < length; i++) {
                        this.connectRegions(currentRow, currentCol, chosen.row, chosen.col);
                        currentRow = chosen.row;
                        currentCol = chosen.col;

                        if (this.rng.next() < 0.3) break;

                        const nextDirs = [];
                        if (currentRow > 0 && !this.regions[currentRow-1][currentCol].connections.bottom) nextDirs.push({ row: currentRow-1, col: currentCol });
                        if (currentRow < this.SR-1 && !this.regions[currentRow+1][currentCol].connections.top) nextDirs.push({ row: currentRow+1, col: currentCol });
                        if (currentCol > 0 && !this.regions[currentRow][currentCol-1].connections.right) nextDirs.push({ row: currentRow, col: currentCol-1 });
                        if (currentCol < this.SC-1 && !this.regions[currentRow][currentCol+1].connections.left) nextDirs.push({ row: currentRow, col: currentCol+1 });

                        if (nextDirs.length === 0) break;
                        const weights = nextDirs.map(d => (d.row === currentRow || d.col === currentCol) ? 3 : 1);
                        const totalWeight = weights.reduce((a, b) => a + b, 0);
                        let rand = this.rng.next() * totalWeight;
                        let sel = 0;
                        for (let j = 0; j < weights.length; j++) {
                            rand -= weights[j];
                            if (rand <= 0) { sel = j; break; }
                        }
                        chosen.row = nextDirs[sel].row;
                        chosen.col = nextDirs[sel].col;
                    }
                }
            }
        }
    }

    generateAlternativePaths() {
        const loopCount = this.rng.nextInt(this.config.minAlternativePaths, this.config.maxAlternativePaths);
        for (let i = 0; i < loopCount; i++) {
            if (this.mainPath.length < 4) continue;
            
            const startIdx = this.rng.nextInt(1, Math.floor(this.mainPath.length / 2));
            let endIdx = this.rng.nextInt(Math.floor(this.mainPath.length / 2) + 1, this.mainPath.length - 1);
            if (Math.abs(endIdx - startIdx) < 2) continue;

            const startPos = this.mainPath[startIdx];
            const endPos = this.mainPath[endIdx];

            let currentRow = startPos.row;
            let currentCol = startPos.col;
            const visited = new Set();
            visited.add(`${currentRow},${currentCol}`);

            while (currentRow !== endPos.row || currentCol !== endPos.col) {
                const neighbors = [];
                if (currentRow > 0 && !visited.has(`${currentRow-1},${currentCol}`)) neighbors.push({ row: currentRow-1, col: currentCol });
                if (currentRow < this.SR-1 && !visited.has(`${currentRow+1},${currentCol}`)) neighbors.push({ row: currentRow+1, col: currentCol });
                if (currentCol > 0 && !visited.has(`${currentRow},${currentCol-1}`)) neighbors.push({ row: currentRow, col: currentCol-1 });
                if (currentCol < this.SC-1 && !visited.has(`${currentRow},${currentCol+1}`)) neighbors.push({ row: currentRow, col: currentCol+1 });

                if (neighbors.length === 0) break;

                const dists = neighbors.map(n => Math.abs(n.row - endPos.row) + Math.abs(n.col - endPos.col));
                const minDist = Math.min(...dists);
                const goodNeighbors = neighbors.filter((n, idx) => dists[idx] === minDist);
                const next = goodNeighbors[this.rng.nextInt(0, goodNeighbors.length-1)];

                this.connectRegions(currentRow, currentCol, next.row, next.col);
                visited.add(`${next.row},${next.col}`);
                currentRow = next.row;
                currentCol = next.col;
            }
        }
    }

    generateClosedRegions() {
        const closedProb0 = this.config.closedRegionRatio * 2;
        const closedProb1 = this.config.closedRegionRatio;

        for (let row = 0; row < this.SR; row++) {
            for (let col = 0; col < this.SC; col++) {
                const r = this.regions[row][col];
                const connCount = [r.connections.top, r.connections.bottom, r.connections.left, r.connections.right].filter(Boolean).length;

                if (connCount === 0) {
                    if (this.rng.next() < closedProb0) {
                        r.isClosed = true;
                    } else {
                        const dirs = [];
                        if (row > 0) dirs.push({ row: row-1, col: col });
                        if (row < this.SR-1) dirs.push({ row: row+1, col: col });
                        if (col > 0) dirs.push({ row: row, col: col-1 });
                        if (col < this.SC-1) dirs.push({ row: row, col: col+1 });
                        if (dirs.length > 0) {
                            const chosen = dirs[this.rng.nextInt(0, dirs.length-1)];
                            this.connectRegions(row, col, chosen.row, chosen.col);
                        }
                    }
                } else if (connCount === 1) {
                    if (this.rng.next() < closedProb1) {
                        r.isClosed = true;
                    }
                }
            }
        }

        for (let row = 0; row < this.SR; row++) {
            for (let col = 0; col < this.SC; col++) {
                const r = this.regions[row][col];
                if (r.isClosed) {
                    const connCount = [r.connections.top, r.connections.bottom, r.connections.left, r.connections.right].filter(Boolean).length;
                    if (connCount === 0) {
                        const dirs = [];
                        if (row > 0) dirs.push({ row: row-1, col: col });
                        if (row < this.SR-1) dirs.push({ row: row+1, col: col });
                        if (col > 0) dirs.push({ row: row, col: col-1 });
                        if (col < this.SC-1) dirs.push({ row: row, col: col+1 });
                        if (dirs.length > 0) {
                            const chosen = dirs[this.rng.nextInt(0, dirs.length-1)];
                            this.connectRegions(row, col, chosen.row, chosen.col);
                        }
                    }
                }
            }
        }
    }

    validateRegionConnectivity() {
        const visited = new Set();
        const queue = [{ row: this.startRegion.row, col: this.startRegion.col }];
        visited.add(`${this.startRegion.row},${this.startRegion.col}`);

        while (queue.length > 0) {
            const { row, col } = queue.shift();
            const r = this.regions[row][col];
            if (r.connections.top && !visited.has(`${row-1},${col}`)) {
                visited.add(`${row-1},${col}`);
                queue.push({ row: row-1, col: col });
            }
            if (r.connections.bottom && !visited.has(`${row+1},${col}`)) {
                visited.add(`${row+1},${col}`);
                queue.push({ row: row+1, col: col });
            }
            if (r.connections.left && !visited.has(`${row},${col-1}`)) {
                visited.add(`${row},${col-1}`);
                queue.push({ row: row, col: col-1 });
            }
            if (r.connections.right && !visited.has(`${row},${col+1}`)) {
                visited.add(`${row},${col+1}`);
                queue.push({ row: row, col: col+1 });
            }
        }

        if (!visited.has(`${this.endRegion.row},${this.endRegion.col}`)) {
            this.generateAlternativePaths();
        }
    }

    assignRegionTypes() {
        for (let row = 0; row < this.SR; row++) {
            for (let col = 0; col < this.SC; col++) {
                const r = this.regions[row][col];
                const isMainPath = this.mainPath.some(p => p.row === row && p.col === col);
                const connCount = [r.connections.top, r.connections.bottom, r.connections.left, r.connections.right].filter(Boolean).length;

                if (r === this.startRegion) {
                    r.type = REGION_TYPE_V3.START;
                } else if (r === this.endRegion) {
                    r.type = REGION_TYPE_V3.END;
                } else if (isMainPath) {
                    r.type = REGION_TYPE_V3.MAIN;
                } else if (r.isClosed && connCount <= 1) {
                    r.type = REGION_TYPE_V3.CLOSED;
                } else if (connCount >= 3) {
                    r.type = REGION_TYPE_V3.JUNCTION;
                } else {
                    r.type = REGION_TYPE_V3.BRANCH;
                }
            }
        }
    }

    initializeGlobalGrid() {
        for (let y = 0; y < this.totalRows; y++) {
            this.globalGrid[y] = new Array(this.totalCols).fill(CELL_TYPE_V3.WALL);
        }
    }

    placeBoundaryOpenings() {
        for (let rRow = 0; rRow < this.SR; rRow++) {
            for (let rCol = 0; rCol < this.SC; rCol++) {
                const region = this.regions[rRow][rCol];
                const baseX = rCol * this.GC;
                const baseY = rRow * this.GR;

                if (region.connections.top) {
                    const numOpenings = this.rng.nextInt(1, 2);
                    const openings = [];
                    for (let i = 0; i < numOpenings; i++) {
                        const x = baseX + this.rng.nextInt(1, this.GC - 2);
                        if (!openings.includes(x)) {
                            openings.push(x);
                            this.globalGrid[baseY][x] = CELL_TYPE_V3.PATH;
                        }
                    }
                    region.entrances.push(...openings.map(x => ({ x, y: baseY })));
                }
                if (region.connections.bottom) {
                    const numOpenings = this.rng.nextInt(1, 2);
                    const openings = [];
                    for (let i = 0; i < numOpenings; i++) {
                        const x = baseX + this.rng.nextInt(1, this.GC - 2);
                        if (!openings.includes(x)) {
                            openings.push(x);
                            this.globalGrid[baseY + this.GR - 1][x] = CELL_TYPE_V3.PATH;
                        }
                    }
                    region.exits.push(...openings.map(x => ({ x, y: baseY + this.GR - 1 })));
                }
                if (region.connections.left) {
                    const numOpenings = this.rng.nextInt(1, 2);
                    const openings = [];
                    for (let i = 0; i < numOpenings; i++) {
                        const y = baseY + this.rng.nextInt(1, this.GR - 2);
                        if (!openings.includes(y)) {
                            openings.push(y);
                            this.globalGrid[y][baseX] = CELL_TYPE_V3.PATH;
                        }
                    }
                    region.entrances.push(...openings.map(y => ({ x: baseX, y })));
                }
                if (region.connections.right) {
                    const numOpenings = this.rng.nextInt(1, 2);
                    const openings = [];
                    for (let i = 0; i < numOpenings; i++) {
                        const y = baseY + this.rng.nextInt(1, this.GR - 2);
                        if (!openings.includes(y)) {
                            openings.push(y);
                            this.globalGrid[y][baseX + this.GC - 1] = CELL_TYPE_V3.PATH;
                        }
                    }
                    region.exits.push(...openings.map(y => ({ x: baseX + this.GC - 1, y })));
                }
            }
        }
    }

    generateInternalMazes() {
        for (let rRow = 0; rRow < this.SR; rRow++) {
            for (let rCol = 0; rCol < this.SC; rCol++) {
                const region = this.regions[rRow][rCol];
                const baseX = rCol * this.GC;
                const baseY = rRow * this.GR;

                const allOpenings = [...region.entrances, ...region.exits];
                if (allOpenings.length === 0) continue;

                const startPos = allOpenings[0];
                const targetPositions = allOpenings.slice(1);

                const visited = new Set();
                const stack = [{ x: startPos.x, y: startPos.y }];
                visited.add(`${startPos.x},${startPos.y}`);
                this.globalGrid[startPos.y][startPos.x] = CELL_TYPE_V3.PATH;

                const config = this.getRegionConfig(region.type);

                while (stack.length > 0) {
                    const current = stack[stack.length - 1];
                    const neighbors = this.getUnvisitedNeighbors(current.x, current.y, baseX, baseY, visited);

                    const targetReached = targetPositions.every(t => visited.has(`${t.x},${t.y}`));
                    if (neighbors.length === 0 || (targetReached && this.rng.next() < 0.7)) {
                        stack.pop();
                        continue;
                    }

                    const weighted = this.weightNeighbors(neighbors, current, config.sameDirectionWeight);
                    const chosen = weighted[this.rng.nextInt(0, weighted.length - 1)];

                    const wallX = (current.x + chosen.x) / 2;
                    const wallY = (current.y + chosen.y) / 2;
                    if (wallX === Math.floor(wallX) && wallY === Math.floor(wallY)) {
                        this.globalGrid[wallY][wallX] = CELL_TYPE_V3.PATH;
                    }
                    this.globalGrid[chosen.y][chosen.x] = CELL_TYPE_V3.PATH;
                    visited.add(`${chosen.x},${chosen.y}`);
                    stack.push(chosen);
                }

                this.applyRegionFeatures(region, baseX, baseY, config);
            }
        }
    }

    getRegionConfig(type) {
        switch (type) {
            case REGION_TYPE_V3.START:
                return { extraWallsToRemove: 3, sameDirectionWeight: 2, deadEndCount: 0 };
            case REGION_TYPE_V3.END:
                return { extraWallsToRemove: 2, sameDirectionWeight: 3, deadEndCount: 0 };
            case REGION_TYPE_V3.MAIN:
                return { extraWallsToRemove: 1, sameDirectionWeight: 5, deadEndCount: 1 };
            case REGION_TYPE_V3.BRANCH:
                return { extraWallsToRemove: 0, sameDirectionWeight: 1, deadEndCount: 3 };
            case REGION_TYPE_V3.JUNCTION:
                return { extraWallsToRemove: 4, sameDirectionWeight: 2, deadEndCount: 2 };
            case REGION_TYPE_V3.CLOSED:
                return { extraWallsToRemove: 1, sameDirectionWeight: 1, deadEndCount: 4 };
            default:
                return { extraWallsToRemove: 1, sameDirectionWeight: 2, deadEndCount: 2 };
        }
    }

    getUnvisitedNeighbors(x, y, baseX, baseY, visited) {
        const neighbors = [];
        const dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]];
        for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= baseX + 1 && nx <= baseX + this.GC - 2 &&
                ny >= baseY + 1 && ny <= baseY + this.GR - 2 &&
                !visited.has(`${nx},${ny}`)) {
                neighbors.push({ x: nx, y: ny });
            }
        }
        return neighbors;
    }

    weightNeighbors(neighbors, current, sameWeight) {
        if (sameWeight <= 1) return neighbors;
        const weighted = [];
        for (const n of neighbors) {
            const sameDir = (n.x === current.x || n.y === current.y);
            const count = sameDir ? sameWeight : 1;
            for (let i = 0; i < count; i++) {
                weighted.push(n);
            }
        }
        return weighted;
    }

    applyRegionFeatures(region, baseX, baseY, config) {
        if (region.type === REGION_TYPE_V3.END) {
            let maxDist = -1;
            let endX = baseX + Math.floor(this.GC / 2);
            let endY = baseY + Math.floor(this.GR / 2);

            for (let y = baseY + 1; y < baseY + this.GR - 1; y++) {
                for (let x = baseX + 1; x < baseX + this.GC - 1; x++) {
                    if (this.globalGrid[y][x] === CELL_TYPE_V3.PATH) {
                        let minDist = Infinity;
                        for (const ent of region.entrances) {
                            const d = Math.abs(x - ent.x) + Math.abs(y - ent.y);
                            if (d < minDist) minDist = d;
                        }
                        if (minDist > maxDist) {
                            maxDist = minDist;
                            endX = x;
                            endY = y;
                        }
                    }
                }
            }
            this.globalGrid[endY][endX] = CELL_TYPE_V3.EXIT;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = endX + dx;
                    const ny = endY + dy;
                    if (nx >= baseX && nx < baseX + this.GC &&
                        ny >= baseY && ny < baseY + this.GR) {
                        this.globalGrid[ny][nx] = CELL_TYPE_V3.PATH;
                    }
                }
            }
            this.globalGrid[endY][endX] = CELL_TYPE_V3.EXIT;
        }

        for (let i = 0; i < config.extraWallsToRemove; i++) {
            const candidates = [];
            for (let y = baseY + 1; y < baseY + this.GR - 1; y++) {
                for (let x = baseX + 1; x < baseX + this.GC - 1; x++) {
                    if (this.globalGrid[y][x] === CELL_TYPE_V3.WALL) {
                        let adjPaths = 0;
                        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                            if (this.globalGrid[y + dy][x + dx] === CELL_TYPE_V3.PATH) {
                                adjPaths++;
                            }
                        }
                        if (adjPaths >= 2) {
                            candidates.push({ x, y });
                        }
                    }
                }
            }
            if (candidates.length > 0) {
                const chosen = candidates[this.rng.nextInt(0, candidates.length - 1)];
                this.globalGrid[chosen.y][chosen.x] = CELL_TYPE_V3.PATH;
            }
        }
    }

    alignBoundaries() {
        for (let rCol = 0; rCol < this.SC - 1; rCol++) {
            for (let rRow = 0; rRow < this.SR; rRow++) {
                const rightCol = rCol * this.GC + this.GC - 1;
                for (let y = rRow * this.GR; y < (rRow + 1) * this.GR; y++) {
                    const leftCell = this.globalGrid[y][rightCol];
                    const rightCell = this.globalGrid[y][rightCol + 1];
                    if (leftCell === CELL_TYPE_V3.PATH || rightCell === CELL_TYPE_V3.PATH) {
                        this.globalGrid[y][rightCol] = CELL_TYPE_V3.PATH;
                        this.globalGrid[y][rightCol + 1] = CELL_TYPE_V3.PATH;
                    }
                }
            }
        }

        for (let rRow = 0; rRow < this.SR - 1; rRow++) {
            for (let rCol = 0; rCol < this.SC; rCol++) {
                const bottomRow = rRow * this.GR + this.GR - 1;
                for (let x = rCol * this.GC; x < (rCol + 1) * this.GC; x++) {
                    const topCell = this.globalGrid[bottomRow][x];
                    const bottomCell = this.globalGrid[bottomRow + 1][x];
                    if (topCell === CELL_TYPE_V3.PATH || bottomCell === CELL_TYPE_V3.PATH) {
                        this.globalGrid[bottomRow][x] = CELL_TYPE_V3.PATH;
                        this.globalGrid[bottomRow + 1][x] = CELL_TYPE_V3.PATH;
                    }
                }
            }
        }
    }

    validateFullConnectivity() {
        const startX = this.startRegion.col * this.GC + Math.floor(this.GC / 2);
        const startY = this.startRegion.row * this.GR + Math.floor(this.GR / 2);

        const visited = new Set();
        const queue = [{ x: startX, y: startY }];
        visited.add(`${startX},${startY}`);

        while (queue.length > 0) {
            const { x, y } = queue.shift();
            for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < this.totalCols && ny >= 0 && ny < this.totalRows &&
                    this.globalGrid[ny][nx] !== CELL_TYPE_V3.WALL &&
                    !visited.has(`${nx},${ny}`)) {
                    visited.add(`${nx},${ny}`);
                    queue.push({ x: nx, y: ny });
                }
            }
        }

        let exitFound = false;
        for (let y = 0; y < this.totalRows; y++) {
            for (let x = 0; x < this.totalCols; x++) {
                if (this.globalGrid[y][x] === CELL_TYPE_V3.EXIT) {
                    exitFound = visited.has(`${x},${y}`);
                    if (!exitFound) {
                        this.forceConnect(startX, startY, x, y);
                    }
                }
            }
        }
    }

    forceConnect(startX, startY, endX, endY) {
        let cx = endX;
        let cy = endY;
        while (cx !== startX || cy !== startY) {
            if (cx < startX) cx++;
            else if (cx > startX) cx--;
            else if (cy < startY) cy++;
            else if (cy > startY) cy--;

            if (cx >= 0 && cx < this.totalCols && cy >= 0 && cy < this.totalRows) {
                this.globalGrid[cy][cx] = CELL_TYPE_V3.PATH;
            }
        }
    }

    placeChests() {
        for (let rRow = 0; rRow < this.SR; rRow++) {
            for (let rCol = 0; rCol < this.SC; rCol++) {
                const region = this.regions[rRow][rCol];
                const baseX = rCol * this.GC;
                const baseY = rRow * this.GR;

                let chestCount = 0;
                switch (region.type) {
                    case REGION_TYPE_V3.START: chestCount = 0; break;
                    case REGION_TYPE_V3.END: chestCount = 1; break;
                    case REGION_TYPE_V3.MAIN: chestCount = this.rng.nextInt(0, 1); break;
                    case REGION_TYPE_V3.BRANCH: chestCount = this.rng.nextInt(1, 2); break;
                    case REGION_TYPE_V3.JUNCTION: chestCount = this.rng.nextInt(1, 3); break;
                    case REGION_TYPE_V3.CLOSED: chestCount = this.rng.nextInt(2, 3); break;
                    default: chestCount = 1;
                }

                const candidates = [];
                for (let y = baseY + 1; y < baseY + this.GR - 1; y++) {
                    for (let x = baseX + 1; x < baseX + this.GC - 1; x++) {
                        if (this.globalGrid[y][x] === CELL_TYPE_V3.PATH) {
                            candidates.push({ x, y });
                        }
                    }
                }

                const shuffled = this.rng.shuffle(candidates);
                let placed = 0;
                for (const c of shuffled) {
                    if (placed >= chestCount) break;
                    this.globalGrid[c.y][c.x] = CELL_TYPE_V3.CHEST;
                    placed++;
                }
            }
        }
    }

    getChestPositions() {
        const positions = [];
        for (let y = 0; y < this.totalRows; y++) {
            for (let x = 0; x < this.totalCols; x++) {
                if (this.globalGrid[y][x] === CELL_TYPE_V3.CHEST) {
                    positions.push({ x, y });
                }
            }
        }
        return positions;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MazeGeneratorV3, CELL_TYPE_V3, REGION_TYPE_V3 };
}