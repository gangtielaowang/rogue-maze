// 改进的迷宫生成算法 - 基于文档设计

window.CELL_TYPE = {
    WALL: 0,
    PATH: 1,
    CHEST: 2,
    EXIT: 3
};

window.SCREEN_COLS = 10;
window.SCREEN_ROWS = 10;
window.GRID_COLS = 9;
window.GRID_ROWS = 16;

// 伪随机数生成器
class Random {
    constructor(seed) {
        this.seed = seed;
    }

    next() {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
}

// 区域类型
const AREA_TYPE = {
    A: 'dense_intersection',
    B: 'sparse_intersection',
    C: 'snake_path',
    D: 'open_space',
    E: 'dangerous'
};

// 全局迷宫生成器
class GlobalMazeGenerator {
    constructor(seed) {
        this.seed = seed;
        this.rng = new Random(seed);
        this.SCREEN_COLS = window.SCREEN_COLS;
        this.SCREEN_ROWS = window.SCREEN_ROWS;
        this.GRID_COLS = window.GRID_COLS;
        this.GRID_ROWS = window.GRID_ROWS;
        this.totalCols = this.SCREEN_COLS * this.GRID_COLS;
        this.totalRows = this.SCREEN_ROWS * this.GRID_ROWS;
        this.globalGrid = [];
        this.areaTypes = [];
    }

    generate() {
        this.initGrid();
        this.generateMainRoadSkeleton();
        this.assignAreaTypes();
        this.generateScreenMazes();
        this.injectLoops();
        this.distributeSpecialElements();
        return this.globalGrid;
    }

    initGrid() {
        for (let y = 0; y < this.totalRows; y++) {
            this.globalGrid[y] = [];
            for (let x = 0; x < this.totalCols; x++) {
                this.globalGrid[y][x] = this.CELL_TYPE.WALL;
            }
        }
    }

    generateMainRoadSkeleton() {
        // 用Prim算法生成10x10的主网格迷宫
        const mainGrid = [];
        for (let y = 0; y < this.SCREEN_ROWS; y++) {
            mainGrid[y] = [];
            for (let x = 0; x < this.SCREEN_COLS; x++) {
                mainGrid[y][x] = { visited: false, walls: { top: true, right: true, bottom: true, left: true } };
            }
        }

        // Prim算法
        const startX = Math.floor(this.rng.next() * this.SCREEN_COLS);
        const startY = Math.floor(this.rng.next() * this.SCREEN_ROWS);
        const walls = [];
        mainGrid[startY][startX].visited = true;

        this.addWalls(startX, startY, walls, mainGrid);

        while (walls.length > 0) {
            const idx = Math.floor(this.rng.next() * walls.length);
            const wall = walls.splice(idx, 1)[0];
            
            const nx = wall.x + wall.dx;
            const ny = wall.y + wall.dy;
            
            if (nx >= 0 && nx < this.SCREEN_COLS && ny >= 0 && ny < this.SCREEN_ROWS) {
                if (!mainGrid[ny][nx].visited) {
                    mainGrid[ny][nx].visited = true;
                    
                    if (wall.dx === 1) {
                        mainGrid[wall.y][wall.x].walls.right = false;
                        mainGrid[ny][nx].walls.left = false;
                    } else if (wall.dx === -1) {
                        mainGrid[wall.y][wall.x].walls.left = false;
                        mainGrid[ny][nx].walls.right = false;
                    } else if (wall.dy === 1) {
                        mainGrid[wall.y][wall.x].walls.bottom = false;
                        mainGrid[ny][nx].walls.top = false;
                    } else if (wall.dy === -1) {
                        mainGrid[wall.y][wall.x].walls.top = false;
                        mainGrid[ny][nx].walls.bottom = false;
                    }
                    
                    this.addWalls(nx, ny, walls, mainGrid);
                }
            }
        }

        this.recordMainRoadEdges(mainGrid);
        this.determineMainRoadInScreens(mainGrid);
    }

    addWalls(x, y, walls, grid) {
        const directions = [
            { dx: 0, dy: -1 },
            { dx: 1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 }
        ];

        for (const dir of directions) {
            walls.push({ x, y, dx: dir.dx, dy: dir.dy });
        }
    }

    recordMainRoadEdges(mainGrid) {
        for (let y = 0; y < this.SCREEN_ROWS; y++) {
            for (let x = 0; x < this.SCREEN_COLS; x++) {
                const cell = mainGrid[y][x];
                const baseX = x * this.GRID_COLS;
                const baseY = y * this.GRID_ROWS;

                if (!cell.walls.right && x < this.SCREEN_COLS - 1) {
                    const passageY = baseY + Math.floor(this.GRID_ROWS / 2);
                    this.globalGrid[passageY][baseX + this.GRID_COLS - 1] = this.CELL_TYPE.PATH;
                    this.globalGrid[passageY][(x + 1) * this.GRID_COLS] = this.CELL_TYPE.PATH;
                }

                if (!cell.walls.bottom && y < this.SCREEN_ROWS - 1) {
                    const passageX = baseX + Math.floor(this.GRID_COLS / 2);
                    this.globalGrid[baseY + this.GRID_ROWS - 1][passageX] = this.CELL_TYPE.PATH;
                    this.globalGrid[(y + 1) * this.GRID_ROWS][passageX] = this.CELL_TYPE.PATH;
                }
            }
        }
    }

    determineMainRoadInScreens(mainGrid) {
        for (let y = 0; y < this.SCREEN_ROWS; y++) {
            for (let x = 0; x < this.SCREEN_COLS; x++) {
                const baseX = x * this.GRID_COLS;
                const baseY = y * this.GRID_ROWS;
                const cell = mainGrid[y][x];

                const midX = baseX + Math.floor(this.GRID_COLS / 2);
                const midY = baseY + Math.floor(this.GRID_ROWS / 2);
                this.globalGrid[midY][midX] = this.CELL_TYPE.PATH;

                if (!cell.walls.top) {
                    for (let py = baseY; py <= midY; py++) {
                        this.globalGrid[py][midX] = this.CELL_TYPE.PATH;
                    }
                }
                if (!cell.walls.right) {
                    for (let px = midX; px < baseX + this.GRID_COLS; px++) {
                        this.globalGrid[midY][px] = this.CELL_TYPE.PATH;
                    }
                }
                if (!cell.walls.bottom) {
                    for (let py = midY; py < baseY + this.GRID_ROWS; py++) {
                        this.globalGrid[py][midX] = this.CELL_TYPE.PATH;
                    }
                }
                if (!cell.walls.left) {
                    for (let px = baseX; px <= midX; px++) {
                        this.globalGrid[midY][px] = this.CELL_TYPE.PATH;
                    }
                }
            }
        }
    }

    assignAreaTypes() {
        for (let y = 0; y < this.SCREEN_ROWS; y++) {
            this.areaTypes[y] = [];
            for (let x = 0; x < this.SCREEN_COLS; x++) {
                this.areaTypes[y][x] = this.randomAreaType();
            }
        }

        this.ensureConnectivityAndDiversity();
    }

    randomAreaType() {
        const r = this.rng.next();
        if (r < 0.35) return AREA_TYPE.A;
        if (r < 0.65) return AREA_TYPE.B;
        if (r < 0.85) return AREA_TYPE.D;
        if (r < 0.9) return AREA_TYPE.E;
        return AREA_TYPE.C;
    }

    ensureConnectivityAndDiversity() {
        let startScreenX, startScreenY;
        do {
            startScreenX = Math.floor(this.rng.next() * this.SCREEN_COLS);
            startScreenY = Math.floor(this.rng.next() * this.SCREEN_ROWS);
        } while (this.areaTypes[startScreenY][startScreenX] === AREA_TYPE.E);

        let exitScreenX, exitScreenY;
        do {
            exitScreenX = Math.floor(this.rng.next() * this.SCREEN_COLS);
            exitScreenY = Math.floor(this.rng.next() * this.SCREEN_ROWS);
        } while (
            Math.abs(startScreenX - exitScreenX) + Math.abs(startScreenY - exitScreenY) < 5 ||
            this.areaTypes[exitScreenY][exitScreenX] === AREA_TYPE.E
        );

        this.areaTypes[startScreenY][startScreenX] = AREA_TYPE.A;
        this.areaTypes[exitScreenY][exitScreenX] = AREA_TYPE.A;
    }

    generateScreenMazes() {
        for (let y = 0; y < this.SCREEN_ROWS; y++) {
            for (let x = 0; x < this.SCREEN_COLS; x++) {
                this.generateSingleScreenMaze(x, y, this.areaTypes[y][x]);
            }
        }
    }

    generateSingleScreenMaze(screenX, screenY, areaType) {
        const baseX = screenX * this.GRID_COLS;
        const baseY = screenY * this.GRID_ROWS;

        const entryPoints = this.findEntryPoints(baseX, baseY);
        if (entryPoints.length === 0) {
            const midX = baseX + Math.floor(this.GRID_COLS / 2);
            const midY = baseY + Math.floor(this.GRID_ROWS / 2);
            entryPoints.push({ x: midX, y: midY });
            this.globalGrid[midY][midX] = this.CELL_TYPE.PATH;
        }

        switch (areaType) {
            case AREA_TYPE.A:
                this.generateTypeA(baseX, baseY, entryPoints);
                break;
            case AREA_TYPE.B:
                this.generateTypeB(baseX, baseY, entryPoints);
                break;
            case AREA_TYPE.C:
                this.generateTypeC(baseX, baseY, entryPoints);
                break;
            case AREA_TYPE.D:
                this.generateTypeD(baseX, baseY, entryPoints);
                break;
            case AREA_TYPE.E:
                this.generateTypeE(baseX, baseY, entryPoints);
                break;
        }
    }

    findEntryPoints(baseX, baseY) {
        const points = [];
        for (let py = 0; py < this.GRID_ROWS; py++) {
            for (let px = 0; px < this.GRID_COLS; px++) {
                const gx = baseX + px;
                const gy = baseY + py;
                if (this.globalGrid[gy][gx] === this.CELL_TYPE.PATH) {
                    points.push({ x: gx, y: gy });
                }
            }
        }
        return points;
    }

    generateTypeA(baseX, baseY, entryPoints) {
        this.carveMazeDFS(baseX, baseY, entryPoints, 0.3, 8, 12, 1, 1);
    }

    generateTypeB(baseX, baseY, entryPoints) {
        this.carveMazeDFS(baseX, baseY, entryPoints, 0.1, 2, 5, 3, 1);
    }

    generateTypeC(baseX, baseY, entryPoints) {
        this.carveSnakePath(baseX, baseY, entryPoints);
    }

    generateTypeD(baseX, baseY, entryPoints) {
        this.carveOpenSpace(baseX, baseY, entryPoints);
    }

    generateTypeE(baseX, baseY, entryPoints) {
        this.carveDangerous(baseX, baseY, entryPoints);
    }

    carveMazeDFS(baseX, baseY, entryPoints, pExtra, minWidth, maxWidth, deadEndSteps, adjacentSteps) {
        const visited = new Set();
        const stack = [...entryPoints];
        
        for (const ep of entryPoints) {
            visited.add(`${ep.x},${ep.y}`);
        }

        const directions = [
            { dx: 0, dy: -1 },
            { dx: 1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 }
        ];

        while (stack.length > 0) {
            const current = stack[stack.length - 1];
            const neighbors = [];

            const shuffledDirs = [...directions].sort(() => this.rng.next() - 0.5);
            
            for (const dir of shuffledDirs) {
                const nx = current.x + dir.dx;
                const ny = current.y + dir.dy;

                if (nx >= baseX && nx < baseX + this.GRID_COLS && ny >= baseY && ny < baseY + this.GRID_ROWS) {
                    const key = `${nx},${ny}`;
                    if (!visited.has(key) && this.globalGrid[ny][nx] === this.CELL_TYPE.WALL) {
                        let pathNeighbors = 0;
                        for (const d2 of directions) {
                            const nnx = nx + d2.dx;
                            const nny = ny + d2.dy;
                            if (visited.has(`${nnx},${nny}`)) {
                                pathNeighbors++;
                            }
                        }
                        
                        if (pathNeighbors === 1) {
                            neighbors.push({ x: nx, y: ny, dir });
                        }
                    }
                }
            }

            if (neighbors.length > 0) {
                const next = neighbors[0];
                const midX = current.x + next.dir.dx / 2;
                const midY = current.y + next.dir.dy / 2;
                
                if (Number.isInteger(midX) && Number.isInteger(midY)) {
                    this.globalGrid[midY][midX] = this.CELL_TYPE.PATH;
                }
                
                this.globalGrid[next.y][next.x] = this.CELL_TYPE.PATH;
                visited.add(`${next.x},${next.y}`);
                stack.push({ x: next.x, y: next.y });
            } else {
                stack.pop();
                
                if (this.rng.next() < pExtra) {
                    const dir = shuffledDirs[0];
                    const nx = current.x + dir.dx;
                    const ny = current.y + dir.dy;
                    if (nx >= baseX && nx < baseX + this.GRID_COLS && ny >= baseY && ny < baseY + this.GRID_ROWS) {
                        if (this.globalGrid[ny][nx] === this.CELL_TYPE.WALL) {
                            this.globalGrid[ny][nx] = this.CELL_TYPE.PATH;
                        }
                    }
                }
            }
        }
    }

    carveSnakePath(baseX, baseY, entryPoints) {
        if (entryPoints.length === 0) return;
        
        let current = entryPoints[0];
        const visited = new Set([`${current.x},${current.y}`]);
        
        const directions = [
            { dx: 0, dy: -1 },
            { dx: 1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 }
        ];

        let currentDir = directions[Math.floor(this.rng.next() * directions.length)];
        let stepsWithoutTurn = 0;
        const maxSteps = 3 + Math.floor(this.rng.next() * 3);

        for (let i = 0; i < 20; i++) {
            const nx = current.x + currentDir.dx;
            const ny = current.y + currentDir.dy;
            
            if (nx >= baseX && nx < baseX + this.GRID_COLS && ny >= baseY && ny < baseY + this.GRID_ROWS) {
                const key = `${nx},${ny}`;
                if (!visited.has(key)) {
                    this.globalGrid[ny][nx] = this.CELL_TYPE.PATH;
                    visited.add(key);
                    current = { x: nx, y: ny };
                    stepsWithoutTurn++;
                    
                    if (stepsWithoutTurn >= maxSteps || this.rng.next() < 0.4) {
                        currentDir = directions[Math.floor(this.rng.next() * directions.length)];
                        stepsWithoutTurn = 0;
                    }
                } else {
                    currentDir = directions[Math.floor(this.rng.next() * directions.length)];
                    stepsWithoutTurn = 0;
                }
            } else {
                currentDir = directions[Math.floor(this.rng.next() * directions.length)];
                stepsWithoutTurn = 0;
            }
        }
    }

    carveOpenSpace(baseX, baseY, entryPoints) {
        for (let py = baseY + 1; py < baseY + this.GRID_ROWS - 1; py++) {
            for (let px = baseX + 1; px < baseX + this.GRID_COLS - 1; px++) {
                this.globalGrid[py][px] = this.CELL_TYPE.PATH;
            }
        }

        const obstacleCount = 3 + Math.floor(this.rng.next() * 3);
        for (let i = 0; i < obstacleCount; i++) {
            const ox = baseX + 2 + Math.floor(this.rng.next() * (this.GRID_COLS - 4));
            const oy = baseY + 2 + Math.floor(this.rng.next() * (this.GRID_ROWS - 4));
            
            let size = 1;
            if (this.rng.next() < 0.3) {
                size = 2;
            }
            
            for (let dy = 0; dy < size; dy++) {
                for (let dx = 0; dx < size; dx++) {
                    if (oy + dy < baseY + this.GRID_ROWS - 1 && ox + dx < baseX + this.GRID_COLS - 1) {
                        this.globalGrid[oy + dy][ox + dx] = this.CELL_TYPE.WALL;
                    }
                }
            }
        }

        for (const ep of entryPoints) {
            this.globalGrid[ep.y][ep.x] = this.CELL_TYPE.PATH;
        }
    }

    carveDangerous(baseX, baseY, entryPoints) {
        this.carveSnakePath(baseX, baseY, entryPoints);
        
        for (let i = 0; i < 2; i++) {
            const x = baseX + 1 + Math.floor(this.rng.next() * (this.GRID_COLS - 2));
            const y = baseY + 1 + Math.floor(this.rng.next() * (this.GRID_ROWS - 2));
            this.globalGrid[y][x] = this.CELL_TYPE.PATH;
        }
    }

    injectLoops() {
        for (let y = 0; y < this.SCREEN_ROWS; y++) {
            for (let x = 0; x < this.SCREEN_COLS; x++) {
                const baseX = x * this.GRID_COLS;
                const baseY = y * this.GRID_ROWS;
                
                let pLoop = 0.3;
                switch (this.areaTypes[y][x]) {
                    case AREA_TYPE.A:
                        pLoop = 0.4;
                        break;
                    case AREA_TYPE.B:
                        pLoop = 0.15;
                        break;
                    case AREA_TYPE.C:
                        pLoop = 0.03;
                        break;
                    case AREA_TYPE.E:
                        pLoop = 0;
                        break;
                }

                for (let py = baseY + 1; py < baseY + this.GRID_ROWS - 1; py++) {
                    for (let px = baseX + 1; px < baseX + this.GRID_COLS - 1; px++) {
                        if (this.globalGrid[py][px] === this.CELL_TYPE.WALL) {
                            let pathNeighbors = 0;
                            const directions = [
                                { dx: 0, dy: -1 },
                                { dx: 1, dy: 0 },
                                { dx: 0, dy: 1 },
                                { dx: -1, dy: 0 }
                            ];
                            
                            for (const dir of directions) {
                                if (this.globalGrid[py + dir.dy][px + dir.dx] === this.CELL_TYPE.PATH) {
                                    pathNeighbors++;
                                }
                            }
                            
                            if (pathNeighbors >= 2 && this.rng.next() < pLoop) {
                                this.globalGrid[py][px] = this.CELL_TYPE.PATH;
                            }
                        }
                    }
                }
            }
        }
    }

    distributeSpecialElements() {
        const candidateScreens = [];
        for (let y = 0; y < this.SCREEN_ROWS; y++) {
            for (let x = 0; x < this.SCREEN_COLS; x++) {
                if (this.areaTypes[y][x] !== AREA_TYPE.E) {
                    candidateScreens.push({ x, y });
                }
            }
        }

        const startIdx = Math.floor(this.rng.next() * candidateScreens.length);
        const startScreen = candidateScreens.splice(startIdx, 1)[0];
        
        let exitScreen;
        let maxDist = 0;
        for (const screen of candidateScreens) {
            const dist = Math.abs(screen.x - startScreen.x) + Math.abs(screen.y - startScreen.y);
            if (dist > maxDist) {
                maxDist = dist;
                exitScreen = screen;
            }
        }

        const exitBaseX = exitScreen.x * this.GRID_COLS;
        const exitBaseY = exitScreen.y * this.GRID_ROWS;
        
        const exitPositions = [];
        for (let py = exitBaseY + 1; py < exitBaseY + this.GRID_ROWS - 1; py++) {
            for (let px = exitBaseX + 1; px < exitBaseX + this.GRID_COLS - 1; px++) {
                if (this.globalGrid[py][px] === this.CELL_TYPE.PATH) {
                    exitPositions.push({ x: px, y: py });
                }
            }
        }
        
        if (exitPositions.length > 0) {
            const exitPos = exitPositions[Math.floor(this.rng.next() * exitPositions.length)];
            this.globalGrid[exitPos.y][exitPos.x] = this.CELL_TYPE.EXIT;
        }

        this.distributeChests();
    }

    distributeChests() {
        const areaChestCounts = {
            [AREA_TYPE.A]: { min: 1, max: 3, p: 0.3 },
            [AREA_TYPE.B]: { min: 0, max: 2, p: 0.5 },
            [AREA_TYPE.C]: { min: 0, max: 1, p: 0.3 },
            [AREA_TYPE.D]: { min: 2, max: 3, p: 0.4 },
            [AREA_TYPE.E]: { min: 1, max: 2, p: 0.2 }
        };

        for (let y = 0; y < this.SCREEN_ROWS; y++) {
            for (let x = 0; x < this.SCREEN_COLS; x++) {
                const baseX = x * this.GRID_COLS;
                const baseY = y * this.GRID_ROWS;
                const type = this.areaTypes[y][x];
                const config = areaChestCounts[type];
                
                let chestCount = config.min + Math.floor(this.rng.next() * (config.max - config.min + 1));
                if (this.rng.next() > config.p) {
                    chestCount = Math.max(0, chestCount - 1);
                }
                
                const pathPositions = [];
                for (let py = baseY + 1; py < baseY + this.GRID_ROWS - 1; py++) {
                    for (let px = baseX + 1; px < baseX + this.GRID_COLS - 1; px++) {
                        if (this.globalGrid[py][px] === this.CELL_TYPE.PATH) {
                            const neighbors = [
                                { dx: 0, dy: -1 },
                                { dx: 1, dy: 0 },
                                { dx: 0, dy: 1 },
                                { dx: -1, dy: 0 }
                            ];
                            
                            let wallNeighbors = 0;
                            for (const dir of neighbors) {
                                if (this.globalGrid[py + dir.dy][px + dir.dx] === this.CELL_TYPE.WALL) {
                                    wallNeighbors++;
                                }
                            }
                            
                            if (wallNeighbors >= 3) {
                                pathPositions.unshift({ x: px, y: py });
                            } else {
                                pathPositions.push({ x: px, y: py });
                            }
                        }
                    }
                }
                
                for (let i = 0; i < chestCount && pathPositions.length > 0; i++) {
                    let posIdx;
                    if (this.rng.next() < 0.5) {
                        posIdx = 0;
                    } else {
                        posIdx = Math.floor(this.rng.next() * pathPositions.length);
                    }
                    
                    const pos = pathPositions.splice(posIdx, 1)[0];
                    this.globalGrid[pos.y][pos.x] = this.CELL_TYPE.CHEST;
                }
            }
        }
    }
}

if (typeof window !== 'undefined') {
    window.GlobalMazeGenerator = GlobalMazeGenerator;
    window.Random = Random;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CELL_TYPE: window.CELL_TYPE,
        SCREEN_COLS: window.SCREEN_COLS,
        SCREEN_ROWS: window.SCREEN_ROWS,
        GRID_COLS: window.GRID_COLS,
        GRID_ROWS: window.GRID_ROWS,
        GlobalMazeGenerator,
        Random
    };
}
