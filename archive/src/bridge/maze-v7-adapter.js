/**
 * 迷宫生成器 v7 适配器
 * 
 * 将 ES Module 形式的新迷宫生成器打包为传统 `<script>` 可加载的格式，
 * 暴露 MazeGeneratorV7 类，兼容 V6 API 以便无缝替换 mist.html 中的旧生成器。
 * 
 * 生成: 2026-06-10
 */
(function () {
    'use strict';

    // ===== types.js (内联) =====
    var CELL = {
        WALL: 0,
        FLOOR: 1,
        CHEST: 2,
        EXIT: 3,
        HIDDEN_WALL: 11,
        HIDDEN_FLOOR: 12,
        HIDDEN_PASSAGE: 13,
    };
    var ROOM_TYPE = {
        START: 'start',
        END: 'end',
        NORMAL: 'normal',
        HIDDEN: 'hidden',
    };
    var TRIGGER_TYPE = {
        KEY: 'key',
        BOMB: 'bomb',
        PROXIMITY: 'proximity',
        CLUE: 'clue',
    };

    // ===== config.js (内联) =====
    var DEFAULT_CONFIG = {
        mapSize: 80,
        roomCount: 15,
        roomMinWidth: 6,
        roomMaxWidth: 14,
        roomMinHeight: 6,
        roomMaxHeight: 12,
        roomMinGap: 3,
        wallThicknessH: 2,
        wallThicknessV: 3,
        wallBuffer: 2,
        corridorWidthMain: 2,
        corridorWidthBranch: 1,
        extraEdgeRatio: 0.25,
        branchCorridorCount: 8,
        hiddenRoomCount: { min: 3, max: 5 },
        startEndMinDist: 6,
        seed: Date.now(),
    };

    // ===== Room 类 (内联) =====
    var Room = (function () {
        function Room(id, gridRow, gridCol, width, height) {
            this.id = id;
            this.gridRow = gridRow;
            this.gridCol = gridCol;
            this.width = width;
            this.height = height;
            this.type = ROOM_TYPE.NORMAL;
            this.doors = [];
            this.chests = [];
            this.interiorWalls = [];
            this.landmark = null;
            this.hiddenTrigger = null;
            this.monsters = [];
        }
        Object.defineProperty(Room.prototype, 'bounds', {
            get: function () {
                return {
                    top: this.gridRow,
                    bottom: this.gridRow + this.height - 1,
                    left: this.gridCol,
                    right: this.gridCol + this.width - 1,
                };
            },
        });
        Object.defineProperty(Room.prototype, 'interior', {
            get: function () {
                var b = this.bounds;
                return {
                    top: b.top + 1,
                    bottom: b.bottom - 1,
                    left: b.left + 1,
                    right: b.right - 1,
                };
            },
        });
        Object.defineProperty(Room.prototype, 'centerRow', {
            get: function () { return this.gridRow + Math.floor(this.height / 2); },
        });
        Object.defineProperty(Room.prototype, 'centerCol', {
            get: function () { return this.gridCol + Math.floor(this.width / 2); },
        });
        Object.defineProperty(Room.prototype, 'interiorWidth', {
            get: function () { return this.width - 2; },
        });
        Object.defineProperty(Room.prototype, 'interiorHeight', {
            get: function () { return this.height - 2; },
        });
        Room.prototype.contains = function (row, col) {
            var b = this.bounds;
            return row >= b.top && row <= b.bottom && col >= b.left && col <= b.right;
        };
        Room.prototype.overlaps = function (other, gap) {
            if (gap === void 0) { gap = 0; }
            if (!other) return false;
            var a = this.bounds;
            var b = other.bounds;
            return !(
                a.right + gap < b.left ||
                b.right + gap < a.left ||
                a.bottom + gap < b.top ||
                b.bottom + gap < a.top
            );
        };
        return Room;
    })();

    // ===== Random 类 (内联) =====
    var Random = (function () {
        function Random(seed) {
            this.seed = seed || Date.now();
        }
        Random.prototype.next = function () {
            this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
            return this.seed / 0x7fffffff;
        };
        Random.prototype.nextInt = function (min, max) {
            return min + Math.floor(this.next() * (max - min + 1));
        };
        Random.prototype.pick = function (arr) {
            return arr[this.nextInt(0, arr.length - 1)];
        };
        Random.prototype.shuffle = function (arr) {
            var a = arr.slice();
            for (var i = a.length - 1; i > 0; i--) {
                var j = this.nextInt(0, i);
                var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
            }
            return a;
        };
        return Random;
    })();

    // ===== RoomPlacer 类 (内联) =====
    var RoomPlacer = (function () {
        function RoomPlacer(config) {
            this.config = extend({}, DEFAULT_CONFIG, config);
            this.rng = new Random(this.config.seed);
            this.rooms = [];
        }
        RoomPlacer.prototype.place = function () {
            this.rooms = [];
            this._placeStartEnd();
            this._placeNormalRooms();
            this._assignHiddenRooms();
            return this.rooms;
        };
        RoomPlacer.prototype._placeStartEnd = function () {
            var size = 8;
            var map = this.config.mapSize;
            var gap = this.config.roomMinGap;
            for (var a = 0; a < 50; a++) {
                var row = this.rng.nextInt(1, Math.floor(map / 3));
                var col = this.rng.nextInt(1, Math.floor(map / 3));
                var room = new Room('start', row, col, size, size);
                room.type = ROOM_TYPE.START;
                if (!this._overlapsAny(room, gap)) {
                    this.rooms.push(room);
                    this.startRoom = room;
                    break;
                }
            }
            for (var a = 0; a < 50; a++) {
                var row = this.rng.nextInt(Math.floor(map * 2 / 3), map - size - 1);
                var col = this.rng.nextInt(Math.floor(map * 2 / 3), map - size - 1);
                var room = new Room('end', row, col, size, size);
                room.type = ROOM_TYPE.END;
                if (!this._overlapsAny(room, gap)) {
                    this.rooms.push(room);
                    this.endRoom = room;
                    break;
                }
            }
            if (!this.startRoom) {
                var room = new Room('start', 1, 1, size, size);
                room.type = ROOM_TYPE.START;
                this.rooms.unshift(room);
                this.startRoom = room;
            }
            if (!this.endRoom) {
                var room = new Room('end', map - size - 1, map - size - 1, size, size);
                room.type = ROOM_TYPE.END;
                this.rooms.push(room);
                this.endRoom = room;
            }
        };
        RoomPlacer.prototype._placeNormalRooms = function () {
            var cfg = this.config;
            var total = cfg.roomCount - this.rooms.length;
            for (var i = 0; i < total; i++) {
                var placed = false;
                for (var a = 0; a < 80; a++) {
                    var w = this.rng.nextInt(cfg.roomMinWidth, cfg.roomMaxWidth);
                    var h = this.rng.nextInt(cfg.roomMinHeight, cfg.roomMaxHeight);
                    var row = this.rng.nextInt(2, cfg.mapSize - h - 2);
                    var col = this.rng.nextInt(2, cfg.mapSize - w - 2);
                    var room = new Room('room_' + i, row, col, w, h);
                    if (!this._overlapsAny(room, cfg.roomMinGap)) {
                        this.rooms.push(room);
                        placed = true;
                        break;
                    }
                }
                if (!placed) { /* skip */ }
            }
        };
        RoomPlacer.prototype._assignHiddenRooms = function () {
            var cfg = this.config;
            var target = this.rng.nextInt(cfg.hiddenRoomCount.min, cfg.hiddenRoomCount.max);
            var candidates = this.rooms
                .filter(function (r) { return r.type === ROOM_TYPE.NORMAL; })
                .sort(function (a, b) { return a.gridRow - b.gridRow; });
            var half = Math.ceil(candidates.length / 2);
            var topHalf = candidates.slice(0, half);
            var bottomHalf = candidates.slice(half);
            var shuffled = this.rng.shuffle(topHalf).concat(this.rng.shuffle(bottomHalf));
            var count = Math.min(target, shuffled.length);
            for (var i = 0; i < count; i++) {
                var room = shuffled[i];
                room.type = ROOM_TYPE.HIDDEN;
                var triggerTypes = [TRIGGER_TYPE.KEY, TRIGGER_TYPE.BOMB, TRIGGER_TYPE.PROXIMITY, TRIGGER_TYPE.CLUE];
                room.hiddenTrigger = { type: this.rng.pick(triggerTypes), params: {}, revealed: false };
            }
        };
        RoomPlacer.prototype._overlapsAny = function (room, gap) {
            for (var i = 0; i < this.rooms.length; i++) {
                if (room.overlaps(this.rooms[i], gap)) return true;
            }
            return false;
        };
        RoomPlacer.prototype.getRooms = function () { return this.rooms; };
        RoomPlacer.prototype.getStartRoom = function () { return this.startRoom; };
        RoomPlacer.prototype.getEndRoom = function () { return this.endRoom; };
        return RoomPlacer;
    })();

    // ===== CorridorBuilder 类 (内联) =====
    var CorridorBuilder = (function () {
        function CorridorBuilder(config) {
            this.config = extend({}, DEFAULT_CONFIG, config);
            this.rng = new Random(this.config.seed);
            this.grid = null;
            this.mapSize = this.config.mapSize;
            this.edges = [];
        }
        CorridorBuilder.prototype.build = function (grid, rooms) {
            this.grid = grid;
            this.rooms = rooms;
            this._carveRooms();
            this._placeDoors();
            var normalRooms = rooms.filter(function (r) { return r.type !== ROOM_TYPE.HIDDEN; });
            var hiddenRooms = rooms.filter(function (r) { return r.type === ROOM_TYPE.HIDDEN; });
            this.edges = [];
            if (normalRooms.length >= 2) {
                var allEdges_1 = this._buildAllEdges();
                var filtered = allEdges_1.filter(function (e) {
                    var rA = rooms[e.from], rB = rooms[e.to];
                    return rA.type !== ROOM_TYPE.HIDDEN && rB.type !== ROOM_TYPE.HIDDEN;
                });
                var mst = this._primMST(filtered, normalRooms.length);
                var extra = this._addExtraEdges(filtered, mst);
                this.edges = mst.concat(extra);
            }
            this._connectHiddenRooms(hiddenRooms, normalRooms);
            for (var i = 0; i < this.edges.length; i++) {
                this._carveCorridor(this.edges[i]);
            }
            this._carveBranches();

            this._ensureWallThickness();

            return this.edges;
        };
        CorridorBuilder.prototype._connectHiddenRooms = function (hiddenRooms, normalRooms) {
            if (hiddenRooms.length === 0 || normalRooms.length === 0) return;
            for (var h = 0; h < hiddenRooms.length; h++) {
                var hr = hiddenRooms[h];
                var minDist = Infinity;
                var nearest = null;
                for (var n = 0; n < normalRooms.length; n++) {
                    var nr_1 = normalRooms[n];
                    var dr = hr.centerRow - nr_1.centerRow;
                    var dc = hr.centerCol - nr_1.centerCol;
                    var d = dr * dr + dc * dc;
                    if (d < minDist) { minDist = d; nearest = nr_1; }
                }
                if (nearest) {
                    this.edges.push({
                        from: this.rooms.indexOf(nearest),
                        to: this.rooms.indexOf(hr),
                        dist: Math.sqrt(minDist),
                        hiddenLeaf: true,
                    });
                }
            }
        };
        CorridorBuilder.prototype._carveRooms = function () {
            for (var i = 0; i < this.rooms.length; i++) {
                var room = this.rooms[i];
                var b = room.bounds;
                for (var r = b.top; r <= b.bottom; r++) {
                    for (var c = b.left; c <= b.right; c++) {
                        this.grid[r][c] = CELL.FLOOR;
                    }
                }
                for (var c = b.left; c <= b.right; c++) {
                    this.grid[b.top][c] = CELL.WALL;
                    this.grid[b.bottom][c] = CELL.WALL;
                }
                for (var r = b.top; r <= b.bottom; r++) {
                    this.grid[r][b.left] = CELL.WALL;
                    this.grid[r][b.right] = CELL.WALL;
                }
            }
        };
        CorridorBuilder.prototype._placeDoors = function () {
            for (var i = 0; i < this.rooms.length; i++) {
                var room = this.rooms[i];
                var ib = room.interior;
                room.doors = [];
                if (ib.left <= ib.right) {
                    var c = Math.floor((ib.left + ib.right) / 2);
                    room.doors.push({ row: room.bounds.top, col: c, dir: 'top' });
                }
                if (ib.left <= ib.right) {
                    var c = Math.floor((ib.left + ib.right) / 2);
                    room.doors.push({ row: room.bounds.bottom, col: c, dir: 'bottom' });
                }
                if (ib.top <= ib.bottom) {
                    var r = Math.floor((ib.top + ib.bottom) / 2);
                    room.doors.push({ row: r, col: room.bounds.left, dir: 'left' });
                }
                if (ib.top <= ib.bottom) {
                    var r = Math.floor((ib.top + ib.bottom) / 2);
                    room.doors.push({ row: r, col: room.bounds.right, dir: 'right' });
                }
            }
        };
        CorridorBuilder.prototype._buildAllEdges = function () {
            var edges = [];
            for (var i = 0; i < this.rooms.length; i++) {
                for (var j = i + 1; j < this.rooms.length; j++) {
                    var dr = this.rooms[i].centerRow - this.rooms[j].centerRow;
                    var dc = this.rooms[i].centerCol - this.rooms[j].centerCol;
                    edges.push({ from: i, to: j, dist: Math.sqrt(dr * dr + dc * dc) });
                }
            }
            return edges;
        };
        CorridorBuilder.prototype._primMST = function (edges, roomCount) {
            if (edges.length === 0 || roomCount <= 1) return [];
            var mst = [];
            var connected = new Set([edges[0].from]);
            var sorted = edges.slice().sort(function (a, b) { return a.dist - b.dist; });
            while (connected.size < roomCount) {
                var best = null;
                for (var i = 0; i < sorted.length; i++) {
                    var e = sorted[i];
                    var fConn = connected.has(e.from);
                    var tConn = connected.has(e.to);
                    if (fConn !== tConn) { best = e; break; }
                }
                if (!best) break;
                mst.push(best);
                connected.add(best.from);
                connected.add(best.to);
            }
            return mst;
        };
        CorridorBuilder.prototype._addExtraEdges = function (allEdges, mst) {
            var mstSet = new Set(mst.map(function (e) {
                return Math.min(e.from, e.to) + '-' + Math.max(e.from, e.to);
            }));
            var maxExtra = Math.floor(this.rooms.length * this.config.extraEdgeRatio);
            var extra = [];
            var shuffled = this.rng.shuffle(allEdges);
            for (var i = 0; i < shuffled.length; i++) {
                if (extra.length >= maxExtra) break;
                var e = shuffled[i];
                var key = Math.min(e.from, e.to) + '-' + Math.max(e.from, e.to);
                if (!mstSet.has(key) && this.rng.next() < 0.5) {
                    extra.push(e);
                    mstSet.add(key);
                }
            }
            return extra;
        };
        CorridorBuilder.prototype._carveCorridor = function (edge) {
            var roomA = this.rooms[edge.from];
            var roomB = this.rooms[edge.to];
            var dirA = this._chooseDoorDirection(roomA, roomB);
            var dirB = this._chooseDoorDirection(roomB, roomA);
            var doorA = roomA.doors.filter(function (d) { return d.dir === dirA; })[0] || roomA.doors[0];
            var doorB = roomB.doors.filter(function (d) { return d.dir === dirB; })[0] || roomB.doors[0];
            if (!doorA || !doorB) return;
            var start = this._doorExterior(roomA, doorA);
            var end = this._doorExterior(roomB, doorB);
            if (!start || !end) {
                console.log('[MazeV7] 跳过边', edge.from, '->', edge.to, ': 无效的door exterior');
                return;
            }
            this.grid[doorA.row][doorA.col] = CELL.FLOOR;
            this.grid[doorB.row][doorB.col] = CELL.FLOOR;
            var path = this._astar(start.row, start.col, end.row, end.col);
            if (!path || path.length === 0) {
                console.log('[MazeV7] A* 失败: 房间', edge.from, roomA.type, '('+roomA.gridRow+','+roomA.gridCol+')', '->', edge.to, roomB.type, '('+roomB.gridRow+','+roomB.gridCol+')', 'start:', start, 'end:', end);
                return;
            }
            console.log('[MazeV7] A* 成功:', edge.from, '->', edge.to, '路径长度:', path.length, '宽度:', width);
            var isMain = roomA.type === ROOM_TYPE.START || roomA.type === ROOM_TYPE.END ||
                         roomB.type === ROOM_TYPE.START || roomB.type === ROOM_TYPE.END;
            var width = isMain ? this.config.corridorWidthMain : this.config.corridorWidthBranch;
            for (var p = 0; p < path.length; p++) {
                for (var w = 0; w < width; w++) {
                    var r = path[p].row;
                    var c = path[p].col + w;
                    if (r >= 0 && r < this.mapSize && c >= 0 && c < this.mapSize) {
                        if (this.grid[r][c] === CELL.WALL) this.grid[r][c] = CELL.FLOOR;
                    }
                }
            }
            edge.path = path;
            edge.width = width;
        };
        CorridorBuilder.prototype._chooseDoorDirection = function (roomA, roomB) {
            if (roomA.type === ROOM_TYPE.HIDDEN) return 'bottom';
            var dr = roomB.centerRow - roomA.centerRow;
            var dc = roomB.centerCol - roomA.centerCol;
            if (Math.abs(dr) >= Math.abs(dc)) {
                return dr < 0 ? 'top' : 'bottom';
            } else {
                return dc < 0 ? 'left' : 'right';
            }
        };
        CorridorBuilder.prototype._doorExterior = function (room, door) {
            var b = room.bounds;
            switch (door.dir) {
                case 'top': return { row: b.top - 1, col: door.col };
                case 'bottom': return { row: b.bottom + 1, col: door.col };
                case 'left': return { row: door.row, col: b.left - 1 };
                case 'right': return { row: door.row, col: b.right + 1 };
            }
            return null;
        };
        CorridorBuilder.prototype._astar = function (startR, startC, endR, endC) {
            startR = Math.max(0, Math.min(this.mapSize - 1, startR));
            startC = Math.max(0, Math.min(this.mapSize - 1, startC));
            endR = Math.max(0, Math.min(this.mapSize - 1, endR));
            endC = Math.max(0, Math.min(this.mapSize - 1, endC));
            var key = function (r, c) { return r + ',' + c; };
            var h = function (r, c) { return Math.abs(r - endR) + Math.abs(c - endC); };
            var open = new Map();
            var closed = new Set();
            var gScore = {};
            var parent = {};
            var sk = key(startR, startC);
            gScore[sk] = 0;
            open.set(sk, h(startR, startC));
            var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            var iter = 0;
            while (open.size > 0 && iter < 10000) {
                iter++;
                var minKey = null;
                var minF = Infinity;
                // 使用 forEach 遍历 Map
                var entries = [];
                open.forEach(function(v, k) { entries.push([k, v]); });
                for (var _ei = 0; _ei < entries.length; _ei++) {
                    var _entry = entries[_ei];
                    if (_entry[1] < minF) { minF = _entry[1]; minKey = _entry[0]; }
                }
                if (!minKey) break;
                var _c = minKey.split(',').map(Number), cr = _c[0], cc = _c[1];
                open.delete(minKey);
                if (cr === endR && cc === endC) {
                    var path = [];
                    var kk = minKey;
                    while (kk !== sk) {
                        var _d = kk.split(',').map(Number), pr = _d[0], pc = _d[1];
                        path.unshift({ row: pr, col: pc });
                        kk = parent[kk];
                    }
                    return path;
                }
                closed.add(minKey);
                var shuffled = this.rng.shuffle(dirs);
                for (var d = 0; d < shuffled.length; d++) {
                    var _e = shuffled[d], dr = _e[0], dc = _e[1];
                    var nr = cr + dr, nc = cc + dc;
                    if (nr < 0 || nr >= this.mapSize || nc < 0 || nc >= this.mapSize) continue;
                    var nk = key(nr, nc);
                    if (closed.has(nk)) continue;
                    var cell = this.grid[nr][nc];
                    if (this._isInsideAnyRoom(nr, nc) && !(nr === endR && nc === endC) && !(nr === startR && nc === startC)) continue;
                    var cost = cell === CELL.WALL ? 1 : 1.5;
                    var ng = (gScore[minKey] || 0) + cost;
                    if (gScore[nk] === undefined || ng < gScore[nk]) {
                        gScore[nk] = ng;
                        parent[nk] = minKey;
                        open.set(nk, ng + h(nr, nc));
                    }
                }
            }
            return null;
        };
        CorridorBuilder.prototype._isInsideAnyRoom = function (row, col) {
            for (var i = 0; i < this.rooms.length; i++) {
                var ib = this.rooms[i].interior;
                if (row >= ib.top && row <= ib.bottom && col >= ib.left && col <= ib.right) return true;
            }
            return false;
        };
        CorridorBuilder.prototype._carveBranches = function () {
            var count = this.config.branchCorridorCount;
            for (var i = 0; i < count; i++) {
                var floorCells = [];
                for (var r = 1; r < this.mapSize - 1; r++) {
                    for (var c = 1; c < this.mapSize - 1; c++) {
                        if (this.grid[r][c] === CELL.FLOOR) {
                            var wallNeighbors = 0;
                            for (var d = 0; d < [[-1, 0], [1, 0], [0, -1], [0, 1]].length; d++) {
                                var _a = [[-1, 0], [1, 0], [0, -1], [0, 1]][d], dr = _a[0], dc = _a[1];
                                if (this.grid[r + dr] && this.grid[r + dr][c + dc] === CELL.WALL) wallNeighbors++;
                            }
                            if (wallNeighbors >= 2) floorCells.push({ row: r, col: c });
                        }
                    }
                }
                if (floorCells.length === 0) continue;
                var start = this.rng.pick(floorCells);
                var dir = this.rng.pick([[-1, 0], [1, 0], [0, -1], [0, 1]]);
                var len = this.rng.nextInt(2, 6);
                for (var j = 1; j <= len; j++) {
                    var nr = start.row + dir[0] * j;
                    var nc = start.col + dir[1] * j;
                    if (nr < 1 || nr >= this.mapSize - 1 || nc < 1 || nc >= this.mapSize - 1) break;
                    if (this.grid[nr][nc] !== CELL.WALL) break;
                    this.grid[nr][nc] = CELL.FLOOR;
                }
            }
        };
        CorridorBuilder.prototype._ensureWallThickness = function () {
            var H_MIN = this.config.wallThicknessH;
            var V_MIN = this.config.wallThicknessV;
            var isWall = function (r, c) {
                return r >= 0 && r < this.mapSize && c >= 0 && c < this.mapSize &&
                       this.grid[r][c] === CELL.WALL;
            }.bind(this);
            var changed = true;
            var passes = 0;
            while (changed && passes < 20) {
                changed = false;
                passes++;
                for (var r = 1; r < this.mapSize - 1; r++) {
                    for (var c = 1; c < this.mapSize - 1; c++) {
                        if (this.grid[r][c] !== CELL.WALL) continue;
                        var hLeft = 0, hRight = 0;
                        while (isWall(r, c - hLeft - 1)) hLeft++;
                        while (isWall(r, c + hRight + 1)) hRight++;
                        var vUp = 0, vDown = 0;
                        while (isWall(r - vUp - 1, c)) vUp++;
                        while (isWall(r + vDown + 1, c)) vDown++;
                        if ((1 + hLeft + hRight) < H_MIN || (1 + vUp + vDown) < V_MIN) {
                            this.grid[r][c] = CELL.FLOOR;
                            changed = true;
                        }
                    }
                }
            }
        };
        return CorridorBuilder;
    })();

    // ===== 工具函数 =====
    function extend(target) {
        for (var i = 1; i < arguments.length; i++) {
            var src = arguments[i];
            if (src && typeof src === 'object') {
                var keys = Object.keys(src);
                for (var j = 0; j < keys.length; j++) {
                    target[keys[j]] = src[keys[j]];
                }
            }
        }
        return target;
    }

    // ===== MazeGenerator 类 =====
    var MazeGenerator = (function () {
        function MazeGenerator(config) {
            this.config = extend({}, DEFAULT_CONFIG, config);
            this.grid = null;
            this.rooms = [];
            this.edges = [];
            this.startRoom = null;
            this.endRoom = null;
        }
        MazeGenerator.prototype.generate = function () {
            var mapSize = this.config.mapSize;
            this.grid = [];
            for (var r = 0; r < mapSize; r++) {
                this.grid[r] = new Array(mapSize).fill(CELL.WALL);
            }
            var placer = new RoomPlacer(this.config);
            this.rooms = placer.place();
            this.startRoom = placer.getStartRoom();
            this.endRoom = placer.getEndRoom();
            var cb = new CorridorBuilder(this.config);
            this.edges = cb.build(this.grid, this.rooms);
            // 放置出口
            if (this.endRoom) {
                this.grid[this.endRoom.centerRow][this.endRoom.centerCol] = CELL.EXIT;
            }
            // 验证
            var validation = this._validate();
            return {
                grid: this.grid,
                rooms: this.rooms,
                edges: this.edges,
                startRoom: this.startRoom,
                endRoom: this.endRoom,
                startPosition: { row: this.startRoom.centerRow, col: this.startRoom.centerCol },
                exitPosition: { row: this.endRoom.centerRow, col: this.endRoom.centerCol },
                validation: validation,
            };
        };
        MazeGenerator.prototype._validate = function () {
            var mapSize = this.config.mapSize;
            var visited = new Set();
            var queue = [{ row: this.startRoom.centerRow, col: this.startRoom.centerCol }];
            visited.add(this.startRoom.centerRow + ',' + this.startRoom.centerCol);
            while (queue.length > 0) {
                var cur = queue.shift();
                var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
                for (var i = 0; i < dirs.length; i++) {
                    var nr = cur.row + dirs[i][0], nc = cur.col + dirs[i][1];
                    if (nr < 0 || nr >= mapSize || nc < 0 || nc >= mapSize) continue;
                    var k = nr + ',' + nc;
                    if (visited.has(k)) continue;
                    var cell = this.grid[nr][nc];
                    if (cell === CELL.FLOOR || cell === CELL.EXIT || cell === CELL.CHEST) {
                        visited.add(k);
                        queue.push({ row: nr, col: nc });
                    }
                }
            }
            var exitKey = this.endRoom.centerRow + ',' + this.endRoom.centerCol;
            var exitReachable = visited.has(exitKey);
            var unreachableRooms = 0;
            for (var i = 0; i < this.rooms.length; i++) {
                var ib = this.rooms[i].interior;
                var reachable = false;
                for (var r = ib.top; r <= ib.bottom && !reachable; r++) {
                    for (var c = ib.left; c <= ib.right && !reachable; c++) {
                        if (visited.has(r + ',' + c)) reachable = true;
                    }
                }
                if (!reachable) unreachableRooms++;
            }
            return { exitReachable: exitReachable, visitedCount: visited.size, totalRooms: this.rooms.length, unreachableRooms: unreachableRooms, passed: exitReachable && unreachableRooms === 0 };
        };
        MazeGenerator.prototype.getGrid = function () {
            return this.grid.map(function (row) { return row.slice(); });
        };
        return MazeGenerator;
    })();

    function generateMaze(config) {
        var g = new MazeGenerator(config);
        return g.generate();
    }

    // ===== V7 包装器 — 兼容 V6 API =====
    window.MazeGeneratorV7 = function (seed, mazeConfig) {
        this.seed = seed;
        this.mazeConfig = mazeConfig || {};
    };
    window.MazeGeneratorV7.prototype.generate = function () {
        var config = extend({}, this.mazeConfig, { seed: this.seed });
        // 从旧配置映射
        if (config.gridSize) {
            config.mapSize = config.gridSize;
        }
        if (config.totalRooms) {
            config.roomCount = config.totalRooms;
        }

        console.log('[MazeV7Adapter] 生成迷宫, config:', JSON.stringify(config));
        var result = generateMaze(config);
        var rooms = result.rooms;
        var grid = result.grid;

        // 统计网格类型
        var stats = {};
        for (var r = 0; r < grid.length; r++) {
            for (var c = 0; c < grid[r].length; c++) {
                var v = grid[r][c];
                stats[v] = (stats[v] || 0) + 1;
            }
        }
        console.log('[MazeV7Adapter] 网格尺寸:', grid.length, 'x', grid[0] ? grid[0].length : '?', '统计:', JSON.stringify(stats), '房间:', rooms.length, '边:', result.edges ? result.edges.length : 0);
        console.log('[MazeV7Adapter] 起点:', result.startPosition, '终点:', result.exitPosition);
        console.log('[MazeV7Adapter] 隐藏房间:', rooms.filter(function(r){return r.type===ROOM_TYPE.HIDDEN;}).length);
        console.log('[MazeV7Adapter] 验证:', JSON.stringify(result.validation));

        // 映射到 V6 格式
        return {
            globalGrid: grid,
            hiddenRooms: rooms.filter(function (r) { return r.type === ROOM_TYPE.HIDDEN; }),
            startPosition: { x: result.startPosition.col, y: result.startPosition.row },
            exitPosition: { x: result.exitPosition.col, y: result.exitPosition.row },
        };
    };

    // 同步 CELL 常量到 window (兼容 mist.html 中 CELL_TYPE 的使用)
    if (typeof window.CELL_TYPE === 'undefined') {
        window.CELL_TYPE = {};
    }
    window.CELL_TYPE.WALL = CELL.WALL;
    window.CELL_TYPE.FLOOR = CELL.FLOOR;
    window.CELL_TYPE.CHEST = CELL.CHEST;
    window.CELL_TYPE.EXIT = CELL.EXIT;
    window.CELL_TYPE.HIDDEN_WALL = CELL.HIDDEN_WALL;
    window.CELL_TYPE.HIDDEN_FLOOR = CELL.HIDDEN_FLOOR;
    window.CELL_TYPE.HIDDEN_PASSAGE = CELL.HIDDEN_PASSAGE;

    // 同步 GRID/SCREEN 常量（兼容旧配置）
    if (typeof window.GRID_COLS === 'undefined') window.GRID_COLS = 10;
    if (typeof window.GRID_ROWS === 'undefined') window.GRID_ROWS = 10;
    if (typeof window.SCREEN_COLS === 'undefined') window.SCREEN_COLS = 10;
    if (typeof window.SCREEN_ROWS === 'undefined') window.SCREEN_ROWS = 10;

    console.log('[MazeV7Adapter] 迷宫生成器 v7 适配器已加载');
})();
