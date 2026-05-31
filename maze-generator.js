// 迷宫生成算法 - 全局连通版本

// 直接赋值给 window 对象，避免重复声明问题
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

// 屏幕类
class Screen {
    constructor(screenX, screenY) {
        this.screenX = screenX;
        this.screenY = screenY;
        this.grid = [];
        this.explored = false;
        const GRID_COLS = window.GRID_COLS;
        const GRID_ROWS = window.GRID_ROWS;
        const CELL_TYPE = window.CELL_TYPE;

        for (let y = 0; y < GRID_ROWS; y++) {
            this.grid[y] = [];
            for (let x = 0; x < GRID_COLS; x++) {
                this.grid[y][x] = CELL_TYPE.WALL;
            }
        }
    }

    placeExit(x, y) {
        this.grid[y][x] = window.CELL_TYPE.EXIT;
    }

    placeChest(x, y) {
        this.grid[y][x] = window.CELL_TYPE.CHEST;
    }
}

// 全局迷宫生成器
class GlobalMazeGenerator {
    constructor(seed) {
        this.seed = seed;
        this.rng = new Random(seed);
        this.SCREEN_COLS = window.SCREEN_COLS;
        this.SCREEN_ROWS = window.SCREEN_ROWS;
        this.GRID_COLS = window.GRID_COLS;
        this.GRID_ROWS = window.GRID_ROWS;
        this.CELL_TYPE = window.CELL_TYPE;
        this.totalCols = this.SCREEN_COLS * this.GRID_COLS;
        this.totalRows = this.SCREEN_ROWS * this.GRID_ROWS;
        this.globalGrid = [];
    }

    generate() {
        this.initGrid();
        
        // 生成全局迷宫
        this.generateGlobalMaze();
        
        // 添加一些安全的障碍物
        this.addSafeObstacles();
        
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

    generateGlobalMaze() {
        // 从随机位置开始生成全局迷宫
        const startX = 1 + Math.floor(this.rng.next() * (this.totalCols - 2));
        const startY = 1 + Math.floor(this.rng.next() * (this.totalRows - 2));
        
        // 确保起点是奇数（迷宫生成算法的惯例）
        const sx = startX % 2 === 1 ? startX : startX + 1;
        const sy = startY % 2 === 1 ? startY : startY + 1;
        
        this.carveMazeFromPoint(sx, sy);
    }

    carveMazeFromPoint(startX, startY) {
        const stack = [{ x: startX, y: startY }];
        this.globalGrid[startY][startX] = this.CELL_TYPE.PATH;

        const directions = [
            { dx: 0, dy: -2 },
            { dx: 0, dy: 2 },
            { dx: -2, dy: 0 },
            { dx: 2, dy: 0 }
        ];

        while (stack.length > 0) {
            const current = stack[stack.length - 1];
            const neighbors = [];

            const shuffledDirs = [...directions].sort(() => this.rng.next() - 0.5);

            for (const dir of shuffledDirs) {
                const nx = current.x + dir.dx;
                const ny = current.y + dir.dy;

                // 只在全局边界内雕刻
                if (nx >= 0 && nx < this.totalCols && 
                    ny >= 0 && ny < this.totalRows) {
                    if (this.globalGrid[ny][nx] === this.CELL_TYPE.WALL) {
                        neighbors.push({ dir, nx, ny });
                    }
                }
            }

            if (neighbors.length > 0) {
                const next = neighbors[0];
                const midX = current.x + next.dir.dx / 2;
                const midY = current.y + next.dir.dy / 2;
                this.globalGrid[midY][midX] = this.CELL_TYPE.PATH;
                this.globalGrid[next.ny][next.nx] = this.CELL_TYPE.PATH;
                stack.push({ x: next.nx, y: next.ny });
            } else {
                stack.pop();
            }
        }
    }

    addSafeObstacles() {
        for (let screenY = 0; screenY < this.SCREEN_ROWS; screenY++) {
            for (let screenX = 0; screenX < this.SCREEN_COLS; screenX++) {
                const baseX = screenX * this.GRID_COLS;
                const baseY = screenY * this.GRID_ROWS;
                
                const obstacleCount = 1 + Math.floor(this.rng.next() * 2);
                
                for (let i = 0; i < obstacleCount; i++) {
                    const x = baseX + 3 + Math.floor(this.rng.next() * (this.GRID_COLS - 6));
                    const y = baseY + 3 + Math.floor(this.rng.next() * (this.GRID_ROWS - 6));
                    
                    if (this.canAddSafeObstacle(x, y)) {
                        this.globalGrid[y][x] = this.CELL_TYPE.WALL;
                    }
                }
            }
        }
    }

    canAddSafeObstacle(x, y) {
        if (this.globalGrid[y][x] !== this.CELL_TYPE.PATH) {
            return false;
        }
        
        let pathNeighbors = 0;
        const neighbors = [
            { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
            { dx: -1, dy: 0 }, { dx: 1, dy: 0 }
        ];
        
        for (const dir of neighbors) {
            const nx = x + dir.dx;
            const ny = y + dir.dy;
            if (nx >= 0 && nx < this.totalCols && ny >= 0 && ny < this.totalRows) {
                if (this.globalGrid[ny][nx] === this.CELL_TYPE.PATH) {
                    pathNeighbors++;
                }
            }
        }
        
        return pathNeighbors >= 3;
    }
}

if (typeof window !== 'undefined') {
    window.Screen = Screen;
    window.Random = Random;
    window.GlobalMazeGenerator = GlobalMazeGenerator;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CELL_TYPE: window.CELL_TYPE,
        SCREEN_COLS: window.SCREEN_COLS,
        SCREEN_ROWS: window.SCREEN_ROWS,
        GRID_COLS: window.GRID_COLS,
        GRID_ROWS: window.GRID_ROWS,
        Screen,
        Random,
        GlobalMazeGenerator
    };
}
