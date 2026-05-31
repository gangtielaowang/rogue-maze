// DS01 迷宫生成算法 - 完整实现 v2
// 五阶段: 主路骨架 → 区域类型 → 门匹配 → 各屏迷宫 → 回路注入 → 特殊元素

window.CELL_TYPE = { 
    WALL: 0, 
    PATH: 1, 
    CHEST: 2, 
    EXIT: 3,
    RUIN: 4,           // 残垣断壁：视觉像墙壁但可通过
    HIGH_COST: 5,      // 高消耗格：通过时时间消耗加倍
    MONUMENT: 6        // 独石碑：纯视觉地标，不可通过
};
window.SCREEN_COLS = 10;
window.SCREEN_ROWS = 10;
window.GRID_COLS = 10;
window.GRID_ROWS = 10;

const AREA = { DENSE: 'A', SPARSE: 'B', SNAKE: 'C', OPEN: 'D', HIDDEN: 'E' };

class Random {
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

// ============ 阶段1: 主路骨架生成 ============
class SkeletonGenerator {
    constructor(rng, screenRows, screenCols) {
        this.rng = rng;
        this.SR = screenRows;
        this.SC = screenCols;
        this.adjacency = {};
        this.startScreen = null;
        this.exitScreen = null;
        this.mainPathScreens = new Set();
    }

    generate() {
        const edges = [];
        for (let y = 0; y < this.SR; y++) {
            for (let x = 0; x < this.SC; x++) {
                if (x < this.SC - 1) edges.push({ a: `${x},${y}`, b: `${x+1},${y}`, dir: 'h' });
                if (y < this.SR - 1) edges.push({ a: `${x},${y}`, b: `${x},${y+1}`, dir: 'v' });
            }
        }

        const shuffled = this.rng.shuffle(edges);
        const parent = {};
        const rank = {};

        const find = (k) => {
            if (parent[k] !== k) parent[k] = find(parent[k]);
            return parent[k];
        };
        const union = (a, b) => {
            const ra = find(a), rb = find(b);
            if (ra === rb) return false;
            if (rank[ra] < rank[rb]) parent[ra] = rb;
            else if (rank[ra] > rank[rb]) parent[rb] = ra;
            else { parent[rb] = ra; rank[ra]++; }
            return true;
        };

        for (let y = 0; y < this.SR; y++)
            for (let x = 0; x < this.SC; x++) {
                const k = `${x},${y}`;
                parent[k] = k;
                rank[k] = 0;
                this.adjacency[k] = [];
            }

        for (const e of shuffled) {
            if (union(e.a, e.b)) {
                this.adjacency[e.a].push(e.b);
                this.adjacency[e.b].push(e.a);
            }
        }

        this.startScreen = {
            x: this.rng.nextInt(1, this.SC - 2),
            y: this.rng.nextInt(1, this.SR - 2)
        };

        const distances = this.bfsDistances(this.startScreen);
        const farScreens = [];
        for (const [key, dist] of Object.entries(distances)) {
            if (dist >= 4) farScreens.push(key);
        }
        const exitKey = farScreens[this.rng.nextInt(0, farScreens.length - 1)];
        const [ex, ey] = exitKey.split(',').map(Number);
        this.exitScreen = { x: ex, y: ey };

        this.mainPathScreens = this.findPath(this.startScreen, this.exitScreen);

        return {
            adjacency: this.adjacency,
            startScreen: this.startScreen,
            exitScreen: this.exitScreen,
            mainPathScreens: this.mainPathScreens
        };
    }

    bfsDistances(from) {
        const dist = {};
        const queue = [`${from.x},${from.y}`];
        dist[queue[0]] = 0;
        for (let i = 0; i < queue.length; i++) {
            const cur = queue[i];
            for (const nb of this.adjacency[cur]) {
                if (dist[nb] === undefined) {
                    dist[nb] = dist[cur] + 1;
                    queue.push(nb);
                }
            }
        }
        return dist;
    }

    findPath(from, to) {
        const target = `${to.x},${to.y}`;
        const start = `${from.x},${from.y}`;
        const parent = {};
        const queue = [start];
        parent[start] = null;
        for (let i = 0; i < queue.length; i++) {
            const cur = queue[i];
            if (cur === target) break;
            for (const nb of this.adjacency[cur]) {
                if (parent[nb] === undefined) {
                    parent[nb] = cur;
                    queue.push(nb);
                }
            }
        }
        const path = new Set();
        let cur = target;
        while (cur) {
            path.add(cur);
            cur = parent[cur];
        }
        return path;
    }
}

// ============ 阶段2: 区域类型分配 ============
class AreaAllocator {
    constructor(rng, skeleton, screenRows, screenCols) {
        this.rng = rng;
        this.skeleton = skeleton;
        this.SR = screenRows;
        this.SC = screenCols;
        this.areaTypes = [];
    }

    allocate() {
        for (let y = 0; y < this.SR; y++) {
            this.areaTypes[y] = new Array(this.SC).fill(null);
        }

        const pathSet = this.skeleton.mainPathScreens;
        const orderedPath = this.orderPath(pathSet);
        const startKey = `${this.skeleton.startScreen.x},${this.skeleton.startScreen.y}`;
        const exitKey = `${this.skeleton.exitScreen.x},${this.skeleton.exitScreen.y}`;

        let snakeCount = 0;
        for (let i = 0; i < orderedPath.length; i++) {
            const key = orderedPath[i];
            if (key === startKey || key === exitKey) continue;
            if (snakeCount === 0 || (i > 0 && this.rng.next() < 0.4)) {
                const [x, y] = key.split(',').map(Number);
                this.areaTypes[y][x] = AREA.SNAKE;
                snakeCount++;
                if (snakeCount >= 4) break;
            }
        }

        for (let y = 0; y < this.SR; y++) {
            for (let x = 0; x < this.SC; x++) {
                if (this.areaTypes[y][x] !== null) continue;
                const key = `${x},${y}`;

                if (!this.skeleton.mainPathScreens.has(key) &&
                    key !== startKey &&
                    !this.isAdjacentTo(key, startKey) &&
                    this.rng.next() < 0.05) {
                    this.areaTypes[y][x] = AREA.HIDDEN;
                    continue;
                }

                if (this.rng.next() < 0.10) {
                    this.areaTypes[y][x] = AREA.OPEN;
                    continue;
                }

                const r = this.rng.next();
                if (r < 0.54) this.areaTypes[y][x] = AREA.DENSE;
                else this.areaTypes[y][x] = AREA.SPARSE;
            }
        }

        const [ex, ey] = exitKey.split(',').map(Number);
        if (this.areaTypes[ey][ex] === AREA.SNAKE || this.areaTypes[ey][ex] === AREA.HIDDEN) {
            this.areaTypes[ey][ex] = this.rng.next() < 0.5 ? AREA.DENSE : AREA.OPEN;
        }

        const [sx, sy] = startKey.split(',').map(Number);
        if (this.areaTypes[sy][sx] === AREA.HIDDEN) {
            this.areaTypes[sy][sx] = AREA.SPARSE;
        }

        this.ensureMinSnakeOnPath(orderedPath, startKey, exitKey);

        return this.areaTypes;
    }

    orderPath(pathSet) {
        const startKey = `${this.skeleton.startScreen.x},${this.skeleton.startScreen.y}`;
        const exitKey = `${this.skeleton.exitScreen.x},${this.skeleton.exitScreen.y}`;
        const visited = new Set();
        const result = [];
        const queue = [startKey];
        visited.add(startKey);

        while (queue.length > 0) {
            const cur = queue.shift();
            if (pathSet.has(cur)) result.push(cur);
            if (cur === exitKey) break;
            for (const nb of this.skeleton.adjacency[cur]) {
                if (!visited.has(nb)) {
                    visited.add(nb);
                    queue.push(nb);
                }
            }
        }
        return result;
    }

    isAdjacentTo(key, targetKey) {
        return this.skeleton.adjacency[key] && this.skeleton.adjacency[key].includes(targetKey);
    }

    ensureMinSnakeOnPath(orderedPath, startKey, exitKey) {
        let snakeOnPath = 0;
        for (const key of orderedPath) {
            if (key === startKey || key === exitKey) continue;
            const [x, y] = key.split(',').map(Number);
            if (this.areaTypes[y][x] === AREA.SNAKE) snakeOnPath++;
        }
        if (snakeOnPath < 2) {
            for (const key of orderedPath) {
                if (key === startKey || key === exitKey) continue;
                const [x, y] = key.split(',').map(Number);
                if (this.areaTypes[y][x] !== AREA.SNAKE && this.areaTypes[y][x] !== AREA.HIDDEN) {
                    this.areaTypes[y][x] = AREA.SNAKE;
                    snakeOnPath++;
                    if (snakeOnPath >= 2) break;
                }
            }
        }
    }
}

// ============ 阶段2.5: 门匹配 - 确保相邻屏的门位置一致 ============
class GateMatcher {
    constructor(rng, skeleton, screenCols, screenRows, gridCols, gridRows) {
        this.rng = rng;
        this.skeleton = skeleton;
        this.SC = screenCols;
        this.SR = screenRows;
        this.GC = gridCols;
        this.GR = gridRows;
        this.gates = {};
    }

    match() {
        for (let sy = 0; sy < this.SR; sy++) {
            for (let sx = 0; sx < this.SC; sx++) {
                const key = `${sx},${sy}`;
                this.gates[key] = { left: [], right: [], up: [], down: [] };
            }
        }

        for (let sy = 0; sy < this.SR; sy++) {
            for (let sx = 0; sx < this.SC - 1; sx++) {
                this.matchHorizontal(sx, sy);
            }
        }

        for (let sy = 0; sy < this.SR - 1; sy++) {
            for (let sx = 0; sx < this.SC; sx++) {
                this.matchVertical(sx, sy);
            }
        }

        return this.gates;
    }

    matchHorizontal(sx, sy) {
        const keyA = `${sx},${sy}`;
        const keyB = `${sx + 1},${sy}`;
        const isConnected = this.skeleton.adjacency[keyA] &&
            this.skeleton.adjacency[keyA].includes(keyB);

        if (!isConnected) return;

        const isMainPath = this.skeleton.mainPathScreens.has(keyA) &&
            this.skeleton.mainPathScreens.has(keyB);
        const numGates = isMainPath ? 2 + this.rng.nextInt(0, 1) : 1 + (this.rng.next() < 0.4 ? 1 : 0);

        let selectedRows;
        if (isMainPath && numGates >= 2) {
            const start = this.rng.nextInt(1, this.GR - numGates - 1);
            selectedRows = [];
            for (let i = 0; i < numGates; i++) selectedRows.push(start + i);
        } else {
            const available = [];
            for (let y = 1; y < this.GR - 1; y++) available.push(y);
            selectedRows = this.rng.shuffle(available).slice(0, numGates);
        }

        for (const row of selectedRows) {
            this.gates[keyA].right.push(row);
            this.gates[keyB].left.push(row);
        }
    }

    matchVertical(sx, sy) {
        const keyA = `${sx},${sy}`;
        const keyB = `${sx},${sy + 1}`;
        const isConnected = this.skeleton.adjacency[keyA] &&
            this.skeleton.adjacency[keyA].includes(keyB);

        if (!isConnected) return;

        const isMainPath = this.skeleton.mainPathScreens.has(keyA) &&
            this.skeleton.mainPathScreens.has(keyB);
        const numGates = isMainPath ? 2 + this.rng.nextInt(0, 1) : 1 + (this.rng.next() < 0.4 ? 1 : 0);

        let selectedCols;
        if (isMainPath && numGates >= 2) {
            const start = this.rng.nextInt(1, this.GC - numGates - 1);
            selectedCols = [];
            for (let i = 0; i < numGates; i++) selectedCols.push(start + i);
        } else {
            const available = [];
            for (let x = 1; x < this.GC - 1; x++) available.push(x);
            selectedCols = this.rng.shuffle(available).slice(0, numGates);
        }

        for (const col of selectedCols) {
            this.gates[keyA].down.push(col);
            this.gates[keyB].up.push(col);
        }
    }
}

// ============ 阶段3: 各屏迷宫生成（DFS 递归回溯 + 四参数控制） ============
// 参数1: 墙壁移除概率（控制密度）
// 参数2: 分支深度限制（控制死胡同数量）
// 参数3: 方向权重（控制弯曲度）
// 参数4: 死胡同移除概率
class ScreenMazeGenerator {
    constructor(rng, screenX, screenY, areaType, gates, gridCols, gridRows) {
        this.rng = rng;
        this.sx = screenX;
        this.sy = screenY;
        this.areaType = areaType;
        this.gates = gates;
        this.GC = gridCols;
        this.GR = gridRows;
        this.grid = [];
    }

    generate() {
        this.initGrid();

        switch (this.areaType) {
            case AREA.OPEN: return this.genOpen();
            case AREA.SNAKE: return this.genSnake();
            case AREA.HIDDEN: return this.genHidden();
            default: return this.genStandard();
        }
    }

    initGrid() {
        for (let y = 0; y < this.GR; y++) {
            this.grid[y] = new Array(this.GC).fill(window.CELL_TYPE.WALL);
        }
    }

    placeGates() {
        for (const y of this.gates.left) {
            if (y >= 0 && y < this.GR) this.grid[y][0] = window.CELL_TYPE.PATH;
        }
        for (const y of this.gates.right) {
            if (y >= 0 && y < this.GR) this.grid[y][this.GC - 1] = window.CELL_TYPE.PATH;
        }
        for (const x of this.gates.up) {
            if (x >= 0 && x < this.GC) this.grid[0][x] = window.CELL_TYPE.PATH;
        }
        for (const x of this.gates.down) {
            if (x >= 0 && x < this.GC) this.grid[this.GR - 1][x] = window.CELL_TYPE.PATH;
        }
    }

    collectAllGates() {
        const all = [];
        for (const y of this.gates.left) all.push({ x: 0, y });
        for (const y of this.gates.right) all.push({ x: this.GC - 1, y });
        for (const x of this.gates.up) all.push({ x, y: 0 });
        for (const x of this.gates.down) all.push({ x, y: this.GR - 1 });
        return all;
    }

    isGate(x, y) {
        if (x === 0 && this.gates.left.includes(y)) return true;
        if (x === this.GC - 1 && this.gates.right.includes(y)) return true;
        if (y === 0 && this.gates.up.includes(x)) return true;
        if (y === this.GR - 1 && this.gates.down.includes(x)) return true;
        return false;
    }

    carveLine(x1, y1, x2, y2) {
        let cx = x1, cy = y1;
        while (cx !== x2 || cy !== y2) {
            if (Math.abs(cx - x2) >= Math.abs(cy - y2)) {
                cx += Math.sign(x2 - cx);
            } else {
                cy += Math.sign(y2 - cy);
            }
            if (cx >= 0 && cx < this.GC && cy >= 0 && cy < this.GR) {
                this.grid[cy][cx] = window.CELL_TYPE.PATH;
            }
        }
    }

    connectGatesToInterior() {
        const allGates = this.collectAllGates();
        for (const gate of allGates) {
            let bestNode = null;
            let bestDist = Infinity;
            for (let y = 1; y < this.GR - 1; y += 2) {
                for (let x = 1; x < this.GC - 1; x += 2) {
                    const dist = Math.abs(x - gate.x) + Math.abs(y - gate.y);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestNode = { x, y };
                    }
                }
            }
            if (bestNode) {
                this.carveLine(gate.x, gate.y, bestNode.x, bestNode.y);
            }
        }
    }

    getConfig() {
        switch (this.areaType) {
            case AREA.DENSE:
                return {
                    wallRemovalPct: 0.40 + this.rng.next() * 0.15,
                    deadEndRemovalPct: 0.70 + this.rng.next() * 0.20,
                    sameWeight: 1,
                    diffWeight: 1,
                    maxBranchDepth: Infinity
                };
            case AREA.SPARSE:
                return {
                    wallRemovalPct: 0.08 + this.rng.next() * 0.10,
                    deadEndRemovalPct: 0.10 + this.rng.next() * 0.20,
                    sameWeight: 3,
                    diffWeight: 1,
                    maxBranchDepth: 3 + this.rng.nextInt(0, 3)
                };
            default:
                return {
                    wallRemovalPct: 0.15,
                    deadEndRemovalPct: 0.30,
                    sameWeight: 2,
                    diffWeight: 1,
                    maxBranchDepth: 6
                };
        }
    }

    genStandard() {
        this.placeGates();
        this.connectGatesToInterior();

        const config = this.getConfig();
        this.runDFS(config);

        if (config.wallRemovalPct > 0) {
            this.removeWalls(config.wallRemovalPct);
        }
        if (config.deadEndRemovalPct > 0) {
            this.removeDeadEnds(config.deadEndRemovalPct);
        }

        return this.grid;
    }

    runDFS(config) {
        const visited = new Set();

        const nodes = [];
        for (let y = 1; y < this.GR - 1; y += 2) {
            for (let x = 1; x < this.GC - 1; x += 2) {
                nodes.push({ x, y });
            }
        }

        const startNodes = nodes.filter(n => this.grid[n.y][n.x] === window.CELL_TYPE.PATH);

        if (startNodes.length === 0) {
            const start = nodes[this.rng.nextInt(0, nodes.length - 1)];
            this.grid[start.y][start.x] = window.CELL_TYPE.PATH;
            startNodes.push(start);
        }

        for (const node of startNodes) {
            if (!visited.has(`${node.x},${node.y}`)) {
                this.dfsCarve(node.x, node.y, visited, config);
            }
        }

        for (const node of nodes) {
            if (!visited.has(`${node.x},${node.y}`)) {
                this.grid[node.y][node.x] = window.CELL_TYPE.PATH;
                this.dfsCarve(node.x, node.y, visited, config);
            }
        }
    }

    dfsCarve(startX, startY, visited, config) {
        const stack = [{ x: startX, y: startY, depth: 0, dir: null }];
        visited.add(`${startX},${startY}`);

        while (stack.length > 0) {
            const cur = stack[stack.length - 1];
            const neighbors = this.getUnvisitedDFSNeighbors(cur.x, cur.y, visited);

            const atDepthLimit = config.maxBranchDepth < Infinity && cur.depth >= config.maxBranchDepth;

            if (neighbors.length === 0 || atDepthLimit) {
                stack.pop();
                continue;
            }

            const weighted = this.buildWeightedNeighbors(neighbors, cur.x, cur.y, cur.dir, config);
            const chosen = weighted[this.rng.nextInt(0, weighted.length - 1)];

            const wallX = (cur.x + chosen.x) / 2;
            const wallY = (cur.y + chosen.y) / 2;
            this.grid[wallY][wallX] = window.CELL_TYPE.PATH;
            this.grid[chosen.y][chosen.x] = window.CELL_TYPE.PATH;

            let newDir = null;
            if (chosen.x > cur.x) newDir = 'right';
            else if (chosen.x < cur.x) newDir = 'left';
            else if (chosen.y > cur.y) newDir = 'down';
            else newDir = 'up';

            visited.add(`${chosen.x},${chosen.y}`);
            stack.push({ x: chosen.x, y: chosen.y, depth: cur.depth + 1, dir: newDir });
        }
    }

    getUnvisitedDFSNeighbors(x, y, visited) {
        const neighbors = [];
        const dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]];
        for (const [dx, dy] of dirs) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 1 && nx < this.GC - 1 && ny >= 1 && ny < this.GR - 1 &&
                !visited.has(`${nx},${ny}`)) {
                neighbors.push({ x: nx, y: ny });
            }
        }
        return neighbors;
    }

    buildWeightedNeighbors(neighbors, cx, cy, prevDir, config) {
        if (!prevDir || config.sameWeight === config.diffWeight) {
            return neighbors;
        }
        const weighted = [];
        for (const n of neighbors) {
            let nDir = null;
            if (n.x > cx) nDir = 'right';
            else if (n.x < cx) nDir = 'left';
            else if (n.y > cy) nDir = 'down';
            else nDir = 'up';
            const repeat = (nDir === prevDir) ? config.sameWeight : config.diffWeight;
            for (let i = 0; i < repeat; i++) {
                weighted.push(n);
            }
        }
        return weighted;
    }

    removeWalls(pct) {
        if (pct <= 0) return;

        const candidates = [];
        for (let y = 1; y < this.GR - 1; y++) {
            for (let x = 1; x < this.GC - 1; x++) {
                if (this.grid[y][x] !== window.CELL_TYPE.WALL) continue;
                if (this.isGate(x, y)) continue;

                let adjPaths = 0;
                for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                    if (this.grid[y + dy][x + dx] !== window.CELL_TYPE.WALL) {
                        adjPaths++;
                    }
                }
                if (adjPaths >= 1) {
                    candidates.push({ x, y, adjPaths });
                }
            }
        }

        if (candidates.length === 0) return;

        candidates.sort((a, b) => b.adjPaths - a.adjPaths);

        const targetCount = Math.floor(candidates.length * pct);
        const shuffled = this.rng.shuffle(candidates);

        let removed = 0;
        for (const c of shuffled) {
            if (removed >= targetCount) break;
            this.grid[c.y][c.x] = window.CELL_TYPE.PATH;
            removed++;
        }
    }

    removeDeadEnds(pct) {
        if (pct <= 0) return;

        for (let pass = 0; pass < 5; pass++) {
            const deadEnds = this.findDeadEnds();
            if (deadEnds.length === 0) break;

            const targetCount = Math.floor(deadEnds.length * pct);
            if (targetCount === 0) break;

            const shuffled = this.rng.shuffle(deadEnds);
            let removed = 0;

            for (const de of shuffled) {
                if (removed >= targetCount) break;

                const loopWalls = [];
                const extendWalls = [];

                for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                    const nx = de.x + dx, ny = de.y + dy;
                    if (nx <= 0 || nx >= this.GC - 1 || ny <= 0 || ny >= this.GR - 1) continue;
                    if (this.grid[ny][nx] !== window.CELL_TYPE.WALL) continue;
                    if (this.isGate(nx, ny)) continue;

                    const bx = nx + dx, by = ny + dy;
                    if (bx >= 0 && bx < this.GC && by >= 0 && by < this.GR &&
                        this.grid[by][bx] !== window.CELL_TYPE.WALL &&
                        !(bx === de.x && by === de.y)) {
                        loopWalls.push({ x: nx, y: ny });
                    } else {
                        extendWalls.push({ x: nx, y: ny });
                    }
                }

                const chosenWalls = loopWalls.length > 0 ? loopWalls : extendWalls;
                if (chosenWalls.length > 0) {
                    const w = chosenWalls[this.rng.nextInt(0, chosenWalls.length - 1)];
                    this.grid[w.y][w.x] = window.CELL_TYPE.PATH;
                    removed++;
                }
            }

            if (removed === 0) break;
        }
    }

    findDeadEnds() {
        const deadEnds = [];
        for (let y = 1; y < this.GR - 1; y++) {
            for (let x = 1; x < this.GC - 1; x++) {
                if (this.grid[y][x] !== window.CELL_TYPE.PATH) continue;
                if (this.isGate(x, y)) continue;

                let pathNeighbors = 0;
                for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                    if (this.grid[y + dy][x + dx] !== window.CELL_TYPE.WALL) {
                        pathNeighbors++;
                    }
                }
                if (pathNeighbors === 1) {
                    deadEnds.push({ x, y });
                }
            }
        }
        return deadEnds;
    }

    genSnake() {
        this.placeGates();
        this.connectGatesToInterior();

        this.runDFS({
            wallRemovalPct: 0,
            deadEndRemovalPct: 0,
            sameWeight: 5,
            diffWeight: 1,
            maxBranchDepth: Infinity
        });

        const allGates = this.collectAllGates();
        const essential = this.findEssentialPaths(allGates);

        for (let y = 0; y < this.GR; y++) {
            for (let x = 0; x < this.GC; x++) {
                if (this.grid[y][x] === window.CELL_TYPE.PATH && !essential.has(`${x},${y}`)) {
                    this.grid[y][x] = window.CELL_TYPE.WALL;
                }
            }
        }

        return this.grid;
    }

    findEssentialPaths(gates) {
        if (gates.length === 0) return new Set();

        const essential = new Set();
        const connected = new Set();

        const start = gates[0];
        essential.add(`${start.x},${start.y}`);
        connected.add(`${start.x},${start.y}`);

        for (let i = 1; i < gates.length; i++) {
            const target = gates[i];
            if (connected.has(`${target.x},${target.y}`)) continue;

            const path = this.bfsShortestPath(connected, target);
            for (const cell of path) {
                essential.add(`${cell.x},${cell.y}`);
                connected.add(`${cell.x},${cell.y}`);
            }
        }

        return essential;
    }

    bfsShortestPath(fromSet, target) {
        const parent = {};
        const queue = [];

        for (const key of fromSet) {
            const [x, y] = key.split(',').map(Number);
            const startKey = `${x},${y}`;
            parent[startKey] = null;
            queue.push({ x, y, key: startKey });
        }

        const targetKey = `${target.x},${target.y}`;

        for (let i = 0; i < queue.length; i++) {
            const { x, y, key } = queue[i];

            if (key === targetKey) {
                const path = [];
                let cur = key;
                while (cur && !fromSet.has(cur)) {
                    const [cx, cy] = cur.split(',').map(Number);
                    path.unshift({ x: cx, y: cy });
                    cur = parent[cur];
                }
                return path;
            }

            for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                const nx = x + dx, ny = y + dy;
                const nkey = `${nx},${ny}`;
                if (nx >= 0 && nx < this.GC && ny >= 0 && ny < this.GR &&
                    this.grid[ny][nx] === window.CELL_TYPE.PATH &&
                    parent[nkey] === undefined) {
                    parent[nkey] = key;
                    queue.push({ x: nx, y: ny, key: nkey });
                }
            }
        }

        return [];
    }

    genOpen() {
        for (let y = 0; y < this.GR; y++)
            for (let x = 0; x < this.GC; x++)
                this.grid[y][x] = window.CELL_TYPE.PATH;

        this.placeGates();

        const totalCells = this.GR * this.GC;
        const targetObstacleCells = Math.floor(totalCells * (0.08 + this.rng.next() * 0.07));
        let placedCells = 0;

        for (let attempt = 0; attempt < 300 && placedCells < targetObstacleCells; attempt++) {
            const ox = this.rng.nextInt(1, this.GC - 3);
            const oy = this.rng.nextInt(1, this.GR - 3);
            const size = this.rng.next() < 0.5 ? 1 : 2;

            if (this.canPlaceObstacle(ox, oy, size)) {
                for (let dy = 0; dy < size; dy++)
                    for (let dx = 0; dx < size; dx++)
                        this.grid[oy + dy][ox + dx] = window.CELL_TYPE.WALL;
                placedCells += size * size;
            }
        }

        return this.grid;
    }

    canPlaceObstacle(ox, oy, size) {
        for (let dy = 0; dy < size; dy++)
            for (let dx = 0; dx < size; dx++) {
                const x = ox + dx, y = oy + dy;
                if (x >= this.GC - 1 || y >= this.GR - 1) return false;
                if (this.grid[y][x] !== window.CELL_TYPE.PATH) return false;
                if (this.isGate(x, y)) return false;
            }

        const backup = [];
        for (let dy = 0; dy < size; dy++)
            for (let dx = 0; dx < size; dx++) {
                backup.push({ x: ox + dx, y: oy + dy, v: this.grid[oy + dy][ox + dx] });
                this.grid[oy + dy][ox + dx] = window.CELL_TYPE.WALL;
            }

        const connected = this.checkConnectivity();
        for (const b of backup) this.grid[b.y][b.x] = b.v;
        return connected;
    }

    checkConnectivity() {
        let startX = -1, startY = -1;
        for (let y = 0; y < this.GR && startX < 0; y++)
            for (let x = 0; x < this.GC && startX < 0; x++)
                if (this.grid[y][x] === window.CELL_TYPE.PATH) { startX = x; startY = y; }

        if (startX < 0) return false;

        const visited = new Set();
        const queue = [{ x: startX, y: startY }];
        visited.add(`${startX},${startY}`);

        while (queue.length > 0) {
            const { x, y } = queue.shift();
            for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < this.GC && ny >= 0 && ny < this.GR &&
                    this.grid[ny][nx] === window.CELL_TYPE.PATH &&
                    !visited.has(`${nx},${ny}`)) {
                    visited.add(`${nx},${ny}`);
                    queue.push({ x: nx, y: ny });
                }
            }
        }

        for (let y = 0; y < this.GR; y++)
            for (let x = 0; x < this.GC; x++)
                if (this.grid[y][x] === window.CELL_TYPE.PATH && !visited.has(`${x},${y}`))
                    return false;
        return true;
    }

    genHidden() {
        this.placeGates();
        this.connectGatesToInterior();

        const config = {
            wallRemovalPct: 0.20 + this.rng.next() * 0.15,
            deadEndRemovalPct: 0.40 + this.rng.next() * 0.20,
            sameWeight: 1,
            diffWeight: 1,
            maxBranchDepth: Infinity
        };

        this.runDFS(config);

        if (config.wallRemovalPct > 0) {
            this.removeWalls(config.wallRemovalPct);
        }
        if (config.deadEndRemovalPct > 0) {
            this.removeDeadEnds(config.deadEndRemovalPct);
        }

        return this.grid;
    }
}

// ============ 阶段4: 回路注入 ============
class LoopInjector {
    constructor(rng, globalGrid, areaTypes, gridCols, gridRows, screenCols, screenRows) {
        this.rng = rng;
        this.globalGrid = globalGrid;
        this.areaTypes = areaTypes;
        this.GC = gridCols;
        this.GR = gridRows;
        this.SC = screenCols;
        this.SR = screenRows;
        this.totalCols = this.SC * this.GC;
        this.totalRows = this.SR * this.GR;
    }

    inject() {
        const loopConfigs = {
            [AREA.DENSE]:  { maxLoops: 5 + this.rng.nextInt(0, 3), prob: 0.5 + this.rng.next() * 0.3 },
            [AREA.SPARSE]: { maxLoops: 2 + this.rng.nextInt(0, 2), prob: 0.2 + this.rng.next() * 0.2 },
            [AREA.SNAKE]:  { maxLoops: this.rng.nextInt(0, 1), prob: this.rng.next() * 0.03 },
            [AREA.OPEN]:   { maxLoops: 0, prob: 0 },
            [AREA.HIDDEN]: { maxLoops: 0, prob: 0 }
        };

        for (let sy = 0; sy < this.SR; sy++) {
            for (let sx = 0; sx < this.SC; sx++) {
                const areaType = this.areaTypes[sy][sx];
                const cfg = loopConfigs[areaType];
                if (!cfg || cfg.maxLoops === 0) continue;

                const baseX = sx * this.GC;
                const baseY = sy * this.GR;

                const candidates = this.findLoopCandidates(baseX, baseY);
                const shuffled = this.rng.shuffle(candidates);

                let injected = 0;
                for (const c of shuffled) {
                    if (injected >= cfg.maxLoops) break;
                    if (this.rng.next() > cfg.prob) continue;

                    this.globalGrid[c.y][c.x] = window.CELL_TYPE.PATH;
                    injected++;
                }
            }
        }
    }

    findLoopCandidates(baseX, baseY) {
        const candidates = [];
        for (let ly = 1; ly < this.GR - 1; ly++) {
            for (let lx = 1; lx < this.GC - 1; lx++) {
                const gx = baseX + lx, gy = baseY + ly;
                if (this.globalGrid[gy][gx] !== window.CELL_TYPE.WALL) continue;

                let adjPaths = 0;
                let hasOpposite = false;
                const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
                const pathDirs = [];

                for (const [dx, dy] of dirs) {
                    const nx = gx + dx, ny = gy + dy;
                    if (nx >= 0 && nx < this.totalCols && ny >= 0 && ny < this.totalRows &&
                        this.globalGrid[ny][nx] !== window.CELL_TYPE.WALL) {
                        adjPaths++;
                        pathDirs.push({ dx, dy });
                    }
                }

                if (adjPaths >= 2) {
                    for (let i = 0; i < pathDirs.length; i++) {
                        for (let j = i + 1; j < pathDirs.length; j++) {
                            if (pathDirs[i].dx === -pathDirs[j].dx && pathDirs[i].dy === -pathDirs[j].dy) {
                                hasOpposite = true;
                            }
                        }
                    }
                    candidates.push({ x: gx, y: gy, adjPaths, hasOpposite });
                }
            }
        }

        candidates.sort((a, b) => {
            if (a.hasOpposite !== b.hasOpposite) return b.hasOpposite ? 1 : -1;
            return b.adjPaths - a.adjPaths;
        });

        return candidates;
    }
}

// ============ 阶段5: 特殊元素放置 ============
class ElementPlacer {
    constructor(rng, globalGrid, areaTypes, skeleton, allGates, gridCols, gridRows, screenCols, screenRows) {
        this.rng = rng;
        this.globalGrid = globalGrid;
        this.areaTypes = areaTypes;
        this.skeleton = skeleton;
        this.allGates = allGates;
        this.GC = gridCols;
        this.GR = gridRows;
        this.SC = screenCols;
        this.SR = screenRows;
        this.totalCols = this.SC * this.GC;
        this.totalRows = this.SR * this.GR;
    }

    place() {
        const startScreen = this.skeleton.startScreen;
        const exitScreen = this.skeleton.exitScreen;

        const exitPos = this.findFarthestFromGates(exitScreen.x, exitScreen.y);
        this.globalGrid[exitPos.y][exitPos.x] = window.CELL_TYPE.EXIT;

        const startPos = this.findNearGate(startScreen.x, startScreen.y);
        if (startPos.x === exitPos.x && startPos.y === exitPos.y) {
            const alt = this.findNearGate(startScreen.x, startScreen.y);
            startPos.x = alt.x;
            startPos.y = alt.y;
        }

        const chestPositions = this.placeChests(startScreen, exitScreen);

        this.placeSpecialTerrain();

            return { startPosition: startPos, exitPosition: exitPos, chestPositions };
        }

        placeSpecialTerrain() {
            const ruinCount = Math.floor((this.SC * this.SR) / 6);
            const highCostCount = Math.floor((this.SC * this.SR) * 1.5);
            const monumentCount = Math.floor((this.SC * this.SR) / 2.5);

            this.placeRuins(ruinCount);
            this.placeHighCostTiles(highCostCount);
            this.placeMonuments(monumentCount);
        }

        placeRuins(count) {
            const candidates = [];
            for (let y = 1; y < this.totalRows - 1; y++) {
                for (let x = 1; x < this.totalCols - 1; x++) {
                    if (this.globalGrid[y][x] === window.CELL_TYPE.WALL) {
                        let adjPaths = 0;
                        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                            if (this.globalGrid[y + dy][x + dx] === window.CELL_TYPE.PATH) {
                                adjPaths++;
                            }
                        }
                        if (adjPaths >= 2) {
                            candidates.push({ x, y });
                        }
                    }
                }
            }

            const shuffled = this.rng.shuffle(candidates);
            for (let i = 0; i < Math.min(count, shuffled.length); i++) {
                const { x, y } = shuffled[i];
                this.globalGrid[y][x] = window.CELL_TYPE.RUIN;
            }
        }

        placeHighCostTiles(count) {
            const candidates = [];
            for (let y = 1; y < this.totalRows - 1; y++) {
                for (let x = 1; x < this.totalCols - 1; x++) {
                    if (this.globalGrid[y][x] === window.CELL_TYPE.PATH) {
                        const sx = Math.floor(x / this.GC);
                        const sy = Math.floor(y / this.GR);
                        if (this.areaTypes[sy][sx] === AREA.SNAKE) {
                            continue;
                        }
                        candidates.push({ x, y });
                    }
                }
            }

            const shuffled = this.rng.shuffle(candidates);
            for (let i = 0; i < Math.min(count, shuffled.length); i++) {
                const { x, y } = shuffled[i];
                this.globalGrid[y][x] = window.CELL_TYPE.HIGH_COST;
            }
        }

        placeMonuments(count) {
            const candidates = [];
            for (let sy = 0; sy < this.SR; sy++) {
                for (let sx = 0; sx < this.SC; sx++) {
                    const baseX = sx * this.GC;
                    const baseY = sy * this.GR;

                    let centerX = baseX + Math.floor(this.GC / 2);
                    let centerY = baseY + Math.floor(this.GR / 2);

                    if (this.globalGrid[centerY][centerX] === window.CELL_TYPE.PATH) {
                        candidates.push({ x: centerX, y: centerY });
                    }
                }
            }

            const shuffled = this.rng.shuffle(candidates);
            for (let i = 0; i < Math.min(count, shuffled.length); i++) {
                const { x, y } = shuffled[i];
                this.globalGrid[y][x] = window.CELL_TYPE.MONUMENT;
            }
        }

    getScreenGates(screenX, screenY) {
        const key = `${screenX},${screenY}`;
        const gateData = this.allGates[key];
        if (!gateData) return [];

        const baseX = screenX * this.GC;
        const baseY = screenY * this.GR;
        const gates = [];

        for (const y of gateData.left) gates.push({ x: baseX, y: baseY + y });
        for (const y of gateData.right) gates.push({ x: baseX + this.GC - 1, y: baseY + y });
        for (const x of gateData.up) gates.push({ x: baseX + x, y: baseY });
        for (const x of gateData.down) gates.push({ x: baseX + x, y: baseY + this.GR - 1 });

        return gates;
    }

    findFarthestFromGates(screenX, screenY) {
        const baseX = screenX * this.GC;
        const baseY = screenY * this.GR;
        const gates = this.getScreenGates(screenX, screenY);

        let bestPos = { x: baseX + Math.floor(this.GC / 2), y: baseY + Math.floor(this.GR / 2) };
        let bestDist = -1;

        for (let ly = 1; ly < this.GR - 1; ly++) {
            for (let lx = 1; lx < this.GC - 1; lx++) {
                const gx = baseX + lx, gy = baseY + ly;
                if (this.globalGrid[gy][gx] === window.CELL_TYPE.PATH) {
                    let minDist = Infinity;
                    for (const gate of gates) {
                        const d = Math.abs(gx - gate.x) + Math.abs(gy - gate.y);
                        if (d < minDist) minDist = d;
                    }
                    if (gates.length === 0 || minDist > bestDist) {
                        bestDist = gates.length === 0 ? 1 : minDist;
                        bestPos = { x: gx, y: gy };
                    }
                }
            }
        }
        return bestPos;
    }

    findNearGate(screenX, screenY) {
        const baseX = screenX * this.GC;
        const baseY = screenY * this.GR;
        const gates = this.getScreenGates(screenX, screenY);

        if (gates.length === 0) {
            return { x: baseX + Math.floor(this.GC / 2), y: baseY + Math.floor(this.GR / 2) };
        }

        const gate = gates[this.rng.nextInt(0, gates.length - 1)];
        const candidates = [];
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            for (let step = 1; step <= 3; step++) {
                const nx = gate.x + dx * step, ny = gate.y + dy * step;
                if (nx > baseX && nx < baseX + this.GC - 1 &&
                    ny > baseY && ny < baseY + this.GR - 1 &&
                    this.globalGrid[ny][nx] === window.CELL_TYPE.PATH) {
                    candidates.push({ x: nx, y: ny });
                }
            }
        }

        if (candidates.length > 0) {
            return candidates[this.rng.nextInt(0, candidates.length - 1)];
        }
        return { x: gate.x, y: gate.y };
    }

    placeChests(startScreen, exitScreen) {
        const chestPositions = [];
        const chestConfig = {
            [AREA.DENSE]: { min: 1, max: 3 },
            [AREA.SPARSE]: { min: 0, max: 2 },
            [AREA.SNAKE]: { min: 0, max: 1 },
            [AREA.OPEN]: { min: 2, max: 3 },
            [AREA.HIDDEN]: { min: 1, max: 2 }
        };

        for (let sy = 0; sy < this.SR; sy++) {
            for (let sx = 0; sx < this.SC; sx++) {
                if (sx === startScreen.x && sy === startScreen.y) continue;

                const areaType = this.areaTypes[sy][sx];
                const cfg = chestConfig[areaType];
                const count = this.rng.nextInt(cfg.min, cfg.max);

                const baseX = sx * this.GC;
                const baseY = sy * this.GR;
                const candidates = [];

                for (let ly = 1; ly < this.GR - 1; ly++) {
                    for (let lx = 1; lx < this.GC - 1; lx++) {
                        const gx = baseX + lx, gy = baseY + ly;
                        if (this.globalGrid[gy][gx] === window.CELL_TYPE.PATH) {
                            candidates.push({ x: gx, y: gy });
                        }
                    }
                }

                const shuffled = this.rng.shuffle(candidates);
                let placed = 0;
                for (const c of shuffled) {
                    if (placed >= count) break;
                    if (this.globalGrid[c.y][c.x] === window.CELL_TYPE.PATH) {
                        this.globalGrid[c.y][c.x] = window.CELL_TYPE.CHEST;
                        chestPositions.push(c);
                        placed++;
                    }
                }
            }
        }

        this.ensureChestDistribution(chestPositions);

        return chestPositions;
    }

    ensureChestDistribution(chestPositions) {
        const hasChest = new Set();
        for (const c of chestPositions) {
            const sx = Math.floor(c.x / this.GC);
            const sy = Math.floor(c.y / this.GR);
            hasChest.add(`${sx},${sy}`);
        }

        for (let sy = 0; sy < this.SR; sy++) {
            for (let sx = 0; sx < this.SC; sx++) {
                if (hasChest.has(`${sx},${sy}`)) continue;

                let allEmpty = true;
                for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                    const nx = sx + dx, ny = sy + dy;
                    if (nx >= 0 && nx < this.SC && ny >= 0 && ny < this.SR &&
                        hasChest.has(`${nx},${ny}`)) {
                        allEmpty = false;
                        break;
                    }
                }

                if (allEmpty) {
                    const baseX = sx * this.GC, baseY = sy * this.GR;
                    for (let ly = 1; ly < this.GR - 1; ly++) {
                        for (let lx = 1; lx < this.GC - 1; lx++) {
                            const gx = baseX + lx, gy = baseY + ly;
                            if (this.globalGrid[gy][gx] === window.CELL_TYPE.PATH) {
                                this.globalGrid[gy][gx] = window.CELL_TYPE.CHEST;
                                chestPositions.push({ x: gx, y: gy });
                                hasChest.add(`${sx},${sy}`);
                                allEmpty = false;
                                break;
                            }
                        }
                        if (!allEmpty) break;
                    }
                }
            }
        }
    }
}

// ============ 主生成器 ============
class DS01MazeGenerator {
    constructor(seed) {
        this.seed = seed;
        this.rng = new Random(seed);
        this.GC = window.GRID_COLS;
        this.GR = window.GRID_ROWS;
        this.SC = window.SCREEN_COLS;
        this.SR = window.SCREEN_ROWS;
        this.totalCols = this.SC * this.GC;
        this.totalRows = this.SR * this.GR;
    }

    generate() {
        console.log('=== DS01 v2 迷宫生成开始 ===');

        console.log('阶段1: 生成主路骨架...');
        const skeletonGen = new SkeletonGenerator(this.rng, this.SR, this.SC);
        const skeleton = skeletonGen.generate();

        console.log('阶段2: 分配区域类型...');
        const allocator = new AreaAllocator(this.rng, skeleton, this.SR, this.SC);
        const areaTypes = allocator.allocate();

        console.log('阶段2.5: 匹配边界门...');
        const gateMatcher = new GateMatcher(this.rng, skeleton, this.SC, this.SR, this.GC, this.GR);
        const allGates = gateMatcher.match();

        console.log('阶段3: 生成各屏迷宫...');
        const globalGrid = this.initGlobalGrid();
        for (let sy = 0; sy < this.SR; sy++) {
            for (let sx = 0; sx < this.SC; sx++) {
                const screenGates = allGates[`${sx},${sy}`];
                const gen = new ScreenMazeGenerator(
                    this.rng, sx, sy, areaTypes[sy][sx], screenGates, this.GC, this.GR
                );
                const screenGrid = gen.generate();

                const baseX = sx * this.GC;
                const baseY = sy * this.GR;
                for (let ly = 0; ly < this.GR; ly++) {
                    for (let lx = 0; lx < this.GC; lx++) {
                        globalGrid[baseY + ly][baseX + lx] = screenGrid[ly][lx];
                    }
                }
            }
        }

        console.log('阶段4: 注入回路...');
        const loopInjector = new LoopInjector(
            this.rng, globalGrid, areaTypes, this.GC, this.GR, this.SC, this.SR
        );
        loopInjector.inject();

        console.log('阶段5: 放置特殊元素...');
        const placer = new ElementPlacer(
            this.rng, globalGrid, areaTypes, skeleton, allGates,
            this.GC, this.GR, this.SC, this.SR
        );
        const elements = placer.place();

        console.log('验证可达性...');
        this.verifyReachability(globalGrid, elements.startPosition, elements.exitPosition);

        const screens = this.buildScreens(globalGrid, areaTypes);

        this.printStats(globalGrid, areaTypes);

        console.log('=== DS01 v2 迷宫生成完成 ===');

        return {
            globalGrid,
            screens,
            areaTypes,
            startPosition: elements.startPosition,
            exitPosition: elements.exitPosition,
            chestPositions: elements.chestPositions
        };
    }

    initGlobalGrid() {
        const grid = [];
        for (let y = 0; y < this.totalRows; y++) {
            grid[y] = new Array(this.totalCols).fill(window.CELL_TYPE.WALL);
        }
        return grid;
    }

    verifyReachability(grid, start, exit) {
        const visited = new Set();
        const queue = [{ x: start.x, y: start.y }];
        visited.add(`${start.x},${start.y}`);

        while (queue.length > 0) {
            const { x, y } = queue.shift();
            for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < this.totalCols && ny >= 0 && ny < this.totalRows &&
                    grid[ny][nx] !== window.CELL_TYPE.WALL &&
                    grid[ny][nx] !== window.CELL_TYPE.MONUMENT &&
                    !visited.has(`${nx},${ny}`)) {
                    visited.add(`${nx},${ny}`);
                    queue.push({ x: nx, y: ny });
                }
            }
        }

        const exitKey = `${exit.x},${exit.y}`;
        if (!visited.has(exitKey)) {
            console.error('出口不可达! 尝试修复...');
            this.forceConnect(grid, start, exit);
        }

        for (let y = 0; y < this.totalRows; y++) {
            for (let x = 0; x < this.totalCols; x++) {
                if (grid[y][x] === window.CELL_TYPE.CHEST && !visited.has(`${x},${y}`)) {
                    grid[y][x] = window.CELL_TYPE.PATH;
                }
            }
        }
    }

    forceConnect(grid, start, exit) {
        let cx = exit.x, cy = exit.y;
        const maxSteps = 500;
        for (let step = 0; step < maxSteps; step++) {
            if (cx === start.x && cy === start.y) break;

            const dx = Math.sign(start.x - cx);
            const dy = Math.sign(start.y - cy);

            if (dx !== 0) {
                const nx = cx + dx;
                if (nx >= 0 && nx < this.totalCols) {
                    grid[cy][nx] = window.CELL_TYPE.PATH;
                    cx = nx;
                    continue;
                }
            }
            if (dy !== 0) {
                const ny = cy + dy;
                if (ny >= 0 && ny < this.totalRows) {
                    grid[ny][cx] = window.CELL_TYPE.PATH;
                    cy = ny;
                }
            }
        }
    }

    printStats(grid, areaTypes) {
        const stats = {};
        for (let sy = 0; sy < this.SR; sy++) {
            for (let sx = 0; sx < this.SC; sx++) {
                const type = areaTypes[sy][sx];
                if (!stats[type]) stats[type] = { count: 0, totalCells: 0, pathCells: 0 };

                stats[type].count++;
                const baseX = sx * this.GC, baseY = sy * this.GR;
                for (let ly = 0; ly < this.GR; ly++) {
                    for (let lx = 0; lx < this.GC; lx++) {
                        stats[type].totalCells++;
                        if (grid[baseY + ly][baseX + lx] !== window.CELL_TYPE.WALL) {
                            stats[type].pathCells++;
                        }
                    }
                }
            }
        }

        console.log('=== 区域统计 ===');
        for (const [type, s] of Object.entries(stats)) {
            const pct = (s.pathCells / s.totalCells * 100).toFixed(1);
            console.log(`  类型${type}: ${s.count}屏, 通路密度 ${pct}%`);
        }
    }

    buildScreens(globalGrid, areaTypes) {
        const screens = [];
        for (let sy = 0; sy < this.SR; sy++) {
            screens[sy] = [];
            for (let sx = 0; sx < this.SC; sx++) {
                const screen = {
                    screenX: sx,
                    screenY: sy,
                    areaType: areaTypes[sy][sx],
                    grid: [],
                    explored: false
                };

                const baseX = sx * this.GC;
                const baseY = sy * this.GR;
                for (let ly = 0; ly < this.GR; ly++) {
                    screen.grid[ly] = [];
                    for (let lx = 0; lx < this.GC; lx++) {
                        screen.grid[ly][lx] = globalGrid[baseY + ly][baseX + lx];
                    }
                }

                screens[sy][sx] = screen;
            }
        }
        return screens;
    }
}

window.DS01MazeGenerator = DS01MazeGenerator;