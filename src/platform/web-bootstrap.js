/**
 * Web 平台启动器
 *
 * 新版 Web 入口：加载所有模块、提供 Web 平台实现、启动游戏。
 * 使用 ES Module，通过 <script type="module"> 加载。
 */

import { Renderer } from '../render/renderer.js';
import { VirtualJoystick } from './joystick.js';
import { initWebAudio } from './web-audio.js';
import { createDebugPanel } from './debug-panel.js';
import { getStorage, saveJSON, loadJSON } from '../core/storage.js';
import { platform } from './wechat-platform.js';

// ─────── 资源路径 ───────

const ASSETS = {
    tiles: 'assets/textures/tilesets/dungeon/kenney_tinyDungeon/Tiles',
    fog: 'assets/spirits/effects-black_fog_frames/',
    character: 'assets/spirits/character-elu_frames/',
};

// ─────── Tile 加载 ───────

/**
 * 加载瓦片图片
 */
function loadTiles() {
    const ld = (n) => {
        const img = platform.createImage();
        img.src = `${ASSETS.tiles}/tile_${String(n).padStart(4, '0')}.png`;
        return img;
    };

    return {
        wall_top: {
            center:        [ld(0),  ld(12), ld(24)],
            inner_tl:       ld(27),
            inner_tr:       ld(25),
            inner_bl:       ld(3),
            inner_br:       ld(1),
            outer_tl:       ld(4),
            outer_tr:       ld(5),
            edge_h:        [ld(2),  ld(26)],
            side_l:         ld(15),
            side_r:         ld(13),
            side_to_front_l: ld(16),
            side_to_front_r: ld(17),
            to_pillar:      ld(6),
        },
        wall_front: {
            center:         ld(40),
            center_damaged: ld(14),
            center_window:  ld(28),
            center_flag:    ld(29),
            edge_l:         ld(57),
            edge_r:         ld(59),
            single:         ld(58),
            pillar:         ld(18),
        },
        floor: {
            plain: [ld(48), ld(49), ld(42)],
            shadow_n: ld(50),
            shadow_n_stone: ld(51),
            shadow_inner: ld(52),
            shadow_outer: ld(53),
        },
        target_marker: ld(60),
        door: {
            open_1w:   ld(9),
            open_2w_l: ld(10),
            open_2w_r: ld(11),
            full_1w:   ld(21),
            full_2w_l: ld(22),
            full_2w_r: ld(23),
            half_1w:   ld(33),
            half_2w_l: ld(34),
            half_2w_r: ld(35),
            closed_1w: ld(45),
            closed_2w_l: ld(46),
            closed_2w_r: ld(47),
        },
        chest: {
            closed:  ld(89),
            opening: ld(90),
            opened:  ld(91),
        },
        monsters: [
            ld(109),  // 独眼光头人
            ld(111),  // 邪恶魔法师
            ld(120),  // 小蝙蝠
            ld(121),  // 白色幽灵
        ],
    };
}

/**
 * 加载迷雾帧
 */
function loadFogFrames() {
    const frames = [];
    for (let i = 0; i <= 7; i++) {
        const img = platform.createImage();
        img.src = ASSETS.fog + `frame_00${i}.png`;
        frames.push(img);
    }
    return frames;
}

/**
 * 等待所有图片加载完成
 * 委托给平台抽象层
 */
function waitImages(images) {
    return platform.waitImages(images);
}

/**
 * 加载 Boss 巡逻帧（新版 512×320 素材）
 */
function loadBossFrames() {
    const basePath = 'assets/spirits/monster-bigBoss_frames/';
    const ci = () => platform.createImage();
    const p2 = (n) => String(n).padStart(2, '0');
    const frames = { idle: [], walk: [], turnBack: [] };
    for (let i = 0; i <= 22; i++) { const img = ci(); img.src = basePath + `monster-bigBoss_idle_${p2(i)}.png`; frames.idle.push(img); }
    for (let i = 0; i <= 23; i++) { const img = ci(); img.src = basePath + `monster-bigBoss_walk_${p2(i)}.png`; frames.walk.push(img); }
    for (let i = 0; i <= 33; i++) { const img = ci(); img.src = basePath + `monster-bigBoss_turnBack_${p2(i)}.png`; frames.turnBack.push(img); }
    return frames;
}

// ─────── Canvas 创建 ───────

function createGameCanvas(container) {
    const canvas = platform.createCanvas();
    canvas.id = 'game-canvas';
    canvas.style.display = 'block';
    container.appendChild(canvas);
    return canvas;
}

function createMinimapCanvas(container) {
    const wrap = container.querySelector('#minimap-wrap');
    if (!wrap) return null;
    const canvas = platform.createCanvas(72, 72);
    canvas.id = 'minimap';
    wrap.insertBefore(canvas, wrap.firstChild);
    return canvas;
}

// ─────── 输入处理 ───────

/**
 * 创建键盘输入管理器
 */
function createInputManager() {
    const keys = {};

    window.addEventListener('keydown', (e) => {
        keys[e.key] = true;
    });
    window.addEventListener('keyup', (e) => {
        keys[e.key] = false;
    });

    function getDirection() {
        let dx = 0, dy = 0;
        if (keys['ArrowUp'] || keys['w'] || keys['W']) dy -= 1;
        if (keys['ArrowDown'] || keys['s'] || keys['S']) dy += 1;
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) dx -= 1;
        if (keys['ArrowRight'] || keys['d'] || keys['D']) dx += 1;
        const mag = Math.sqrt(dx * dx + dy * dy);
        if (mag > 0) { dx /= mag; dy /= mag; }
        return { dx, dy, active: mag > 0 };
    }

    /** 检测闪现键（Shift，仅触发一次） */
    let dashKeyPressed = false;
    function consumeDashKey() {
        const pressed = !!keys['Shift'];
        if (pressed && !dashKeyPressed) {
            dashKeyPressed = true;
            return true;
        }
        if (!pressed) dashKeyPressed = false;
        return false;
    }

    /** 检测 Booster 键（Q） */
    function isBoosterKey() {
        return !!keys['q'] || !!keys['Q'];
    }

    /** 检测交互按键（E 或 空格，仅触发一次） */
    let interactPressed = false;
    function consumeInteractKey() {
        const pressed = keys['e'] || keys['E'] || keys[' '];
        if (pressed && !interactPressed) {
            interactPressed = true;
            return true;
        }
        if (!pressed) {
            interactPressed = false;
        }
        return false;
    }

    /** 道具快捷键（1=隐身, 2=投石, 3=放肉，仅触发一次） */
    let itemKeyPressed = [false, false, false];
    function consumeItemKey(index) {
        const keyMap = { 0: '1', 1: '2', 2: '3' };
        const pressed = keys[keyMap[index]];
        if (pressed && !itemKeyPressed[index]) {
            itemKeyPressed[index] = true;
            return true;
        }
        if (!pressed) itemKeyPressed[index] = false;
        return false;
    }

    /** 静步模式（按住 Ctrl） */
    function isQuietMode() {
        return !!keys['Control'];
    }

    return { keys, getDirection, consumeDashKey, isBoosterKey, consumeInteractKey, consumeItemKey, isQuietMode };
}

// ─────── HUD ───────

/**
 * 初始化 HUD（UI 元素已在 HTML 中定义）
 * 返回 consumeInteractClick 函数
 */
function createHUD() {
    let interactClicked = false;

    return {
        consumeInteractClick() {
            if (interactClicked) {
                interactClicked = false;
                return true;
            }
            return false;
        },
        setInteractFlag() {
            interactClicked = true;
        },
    };
}

function updateHUD(playerGX, playerGY, dashCooldown, boosterActive, echoCount, echoCapacity, bridge, isQuiet, isStoneAiming) {
    const el = document.getElementById('hud-coords');
    if (el) {
        el.textContent = `X: ${playerGX}  Y: ${playerGY}`;
    }
    const echoEl = document.getElementById('hud-echo');
    if (echoEl) {
        echoEl.textContent = `♫ Echo: ${echoCount}/${echoCapacity}${boosterActive ? ' +🔍' : ''}`;
    }
    const dashBtn = document.getElementById('btn-dash');
    if (dashBtn) {
        if (dashCooldown > 0) {
            dashBtn.textContent = `⚡ ${dashCooldown.toFixed(1)}s`;
            dashBtn.classList.add('active');
        } else {
            dashBtn.textContent = '⚡ Dash';
            dashBtn.classList.remove('active');
        }
    }
    const boosterBtn = document.getElementById('btn-booster');
    if (boosterBtn) {
        boosterBtn.classList.toggle('active', boosterActive);
    }
    const stoneBtn = document.getElementById('btn-stone');
    if (stoneBtn) {
        stoneBtn.classList.toggle('active', isStoneAiming);
    }

    // ── 道具数量 ──
    const itemsEl = document.getElementById('hud-items');
    if (itemsEl && bridge) {
        const stealthCount = bridge.getItemCount('capsule_stealth');
        const stoneCount = bridge.getItemCount('capsule_stone');
        const meatCount = bridge.getItemCount('capsule_meat');
        itemsEl.textContent = `🎒 🌫️${stealthCount} 🪨${stoneCount} 🥩${meatCount}`;
    }

    // ── 状态指示 ──
    const statusEl = document.getElementById('hud-status');
    if (statusEl) {
        const parts = [];
        if (bridge && bridge.isStealthActive()) parts.push('🌫️隐身');
        if (isQuiet) parts.push('👣静步');
        if (isStoneAiming) parts.push('🎯点击格子投石');
        statusEl.textContent = parts.join('  ');
        statusEl.style.display = parts.length > 0 ? 'block' : 'none';
    }
}

/** 显示开箱掉落消息（2秒后自动消失） */
let dropMsgTimeout = null;
function showDropMessage(msg) {
    const el = document.getElementById('hud-drop-msg');
    if (!el) return;
    if (dropMsgTimeout) clearTimeout(dropMsgTimeout);
    el.textContent = msg;
    el.style.opacity = '1';
    dropMsgTimeout = setTimeout(() => {
        el.style.opacity = '0';
    }, 2500);
}

// ─────── 控制区按钮 ───────

/**
 * 在控制区右侧创建操作按钮
 */
function createControlButtons(container, hud) {
    container.innerHTML = '';

    // ── Open（开宝箱） ──
    const openBtn = document.createElement('button');
    openBtn.className = 'ctrl-btn open';
    openBtn.textContent = '🪄 Open';
    openBtn.addEventListener('click', () => hud.setInteractFlag());
    openBtn.addEventListener('touchstart', (e) => { e.preventDefault(); hud.setInteractFlag(); });
    container.appendChild(openBtn);

    // ── 闪现 Dash ──
    const dashBtn = document.createElement('button');
    dashBtn.id = 'btn-dash';
    dashBtn.className = 'ctrl-btn dash';
    dashBtn.textContent = '⚡ Dash';
    dashBtn.addEventListener('click', () => { window.__dashPressed = true; });
    dashBtn.addEventListener('touchstart', (e) => { e.preventDefault(); window.__dashPressed = true; });
    container.appendChild(dashBtn);

    // ── 视野强化 ──
    window.__boosterPressed = false;
    const boosterBtn = document.createElement('button');
    boosterBtn.id = 'btn-booster';
    boosterBtn.className = 'ctrl-btn booster';
    boosterBtn.textContent = '🔍 视野';
    boosterBtn.addEventListener('touchstart', (e) => { e.preventDefault(); window.__boosterPressed = true; });
    boosterBtn.addEventListener('touchend', (e) => { e.preventDefault(); window.__boosterPressed = false; });
    boosterBtn.addEventListener('mousedown', () => { window.__boosterPressed = true; });
    boosterBtn.addEventListener('mouseup', () => { window.__boosterPressed = false; });
    boosterBtn.addEventListener('mouseleave', () => { window.__boosterPressed = false; });
    container.appendChild(boosterBtn);

    // ── 潜行道具按钮行 ──
    const itemRow = document.createElement('div');
    itemRow.style.cssText = 'display:flex; gap:3px; margin-top:2px;';

    const stealthBtn = document.createElement('button');
    stealthBtn.id = 'btn-stealth';
    stealthBtn.className = 'ctrl-btn item';
    stealthBtn.textContent = '🌫️';
    stealthBtn.addEventListener('click', () => { window.__stealthPressed = true; });
    stealthBtn.addEventListener('touchstart', (e) => { e.preventDefault(); window.__stealthPressed = true; });
    itemRow.appendChild(stealthBtn);

    const stoneBtn = document.createElement('button');
    stoneBtn.id = 'btn-stone';
    stoneBtn.className = 'ctrl-btn item';
    stoneBtn.textContent = '🪨';
    stoneBtn.addEventListener('click', () => { window.__stonePressed = true; });
    stoneBtn.addEventListener('touchstart', (e) => { e.preventDefault(); window.__stonePressed = true; });
    itemRow.appendChild(stoneBtn);

    const meatBtn = document.createElement('button');
    meatBtn.id = 'btn-meat';
    meatBtn.className = 'ctrl-btn item';
    meatBtn.textContent = '🥩';
    meatBtn.addEventListener('click', () => { window.__meatPressed = true; });
    meatBtn.addEventListener('touchstart', (e) => { e.preventDefault(); window.__meatPressed = true; });
    itemRow.appendChild(meatBtn);

    const quietBtn = document.createElement('button');
    quietBtn.id = 'btn-quiet';
    quietBtn.className = 'ctrl-btn';
    quietBtn.textContent = '👣 静步';
    quietBtn.addEventListener('touchstart', (e) => { e.preventDefault(); window.__quietPressed = true; });
    quietBtn.addEventListener('touchend', (e) => { e.preventDefault(); window.__quietPressed = false; });
    quietBtn.addEventListener('mousedown', () => { window.__quietPressed = true; });
    quietBtn.addEventListener('mouseup', () => { window.__quietPressed = false; });
    quietBtn.addEventListener('mouseleave', () => { window.__quietPressed = false; });
    itemRow.appendChild(quietBtn);

    container.appendChild(itemRow);
}

// ─────── A* 寻路 ───────

/**
 * A* 寻路算法（4方向）
 * @param {number[][]} grid - 网格数据
 * @param {number} startR - 起点行
 * @param {number} startC - 起点列
 * @param {number} endR - 终点行
 * @param {number} endC - 终点列
 * @param {number} totalRows
 * @param {number} totalCols
 * @param {function} isBlocked - 判断格子是否不可通行的函数
 * @returns {Array<{r:number,c:number}>|null} 路径（含起点和终点），无路径返回null
 */
function findPath(grid, startR, startC, endR, endC, totalRows, totalCols, isBlocked) {
    // 起点或终点不可达
    if (isBlocked(startR, startC) || isBlocked(endR, endC)) return null;
    if (startR === endR && startC === endC) return [{ r: startR, c: startC }];

    const key = (r, c) => `${r},${c}`;
    const h = (r, c) => Math.abs(r - endR) + Math.abs(c - endC); // 曼哈顿距离

    const openSet = new Set([key(startR, startC)]);
    const cameFrom = {};
    const gScore = { [key(startR, startC)]: 0 };
    const fScore = { [key(startR, startC)]: h(startR, startC) };

    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    while (openSet.size > 0) {
        // 找 fScore 最小的节点
        let current = null;
        let currentF = Infinity;
        for (const k of openSet) {
            const f = fScore[k] ?? Infinity;
            if (f < currentF) { currentF = f; current = k; }
        }
        if (!current) break;
        const [cr, cc] = current.split(',').map(Number);

        // 到达终点
        if (cr === endR && cc === endC) {
            const path = [];
            let u = current;
            while (u) {
                const [ur, uc] = u.split(',').map(Number);
                path.unshift({ r: ur, c: uc });
                u = cameFrom[u];
            }
            return path;
        }

        openSet.delete(current);
        for (const [dr, dc] of dirs) {
            const nr = cr + dr;
            const nc = cc + dc;
            if (nr < 0 || nr >= totalRows || nc < 0 || nc >= totalCols) continue;
            if (isBlocked(nr, nc)) continue;

            const nk = key(nr, nc);
            const tentativeG = gScore[current] + 1;
            if (tentativeG < (gScore[nk] ?? Infinity)) {
                cameFrom[nk] = current;
                gScore[nk] = tentativeG;
                fScore[nk] = tentativeG + h(nr, nc);
                openSet.add(nk);
            }
        }
    }

    return null; // 无路可达
}

// ─────── 游戏主循环 ───────

/**
 * 启动游戏
 */
export async function startGame(container) {
    // ── 初始化存储 ──
    getStorage(); // 触发 localStorage 后端自动初始化

    // ── 获取布局容器 ──
    const viewport = container.querySelector('#game-viewport');
    const controls = container.querySelector('#game-controls');
    const ctrlCenter = controls?.querySelector('.ctrl-center');
    const ctrlRight = controls?.querySelector('.ctrl-right');

    // ── 创建 Canvas（放入 viewport） ──
    const canvas = createGameCanvas(viewport || container);
    const minimapCanvas = createMinimapCanvas(controls || container);

    // ── 创建 HUD ──
    const hud = createHUD();
    const consumeInteractClick = hud.consumeInteractClick;

    // ── 加载资源 ──
    const tiles = loadTiles();
    const fogFrames = loadFogFrames();
    const bossAnims = loadBossFrames();

    // 收集所有图片并等待加载
    const tileImages = [
        ...Object.values(tiles.wall_top).flat(),
        ...Object.values(tiles.wall_front).flat(),
        ...Object.values(tiles.floor).flat(),
        tiles.target_marker,
        ...Object.values(tiles.door).flat(),
        ...Object.values(tiles.chest).flat(),
        ...tiles.monsters,
    ];
    const bossImages = [
        ...bossAnims.idle,
        ...bossAnims.walk,
        ...bossAnims.turnBack,
    ];
    await waitImages([tileImages, fogFrames, bossImages]);

    // ── 动态加载桥接层 ──
    const { GameCoreBridge } = await import('../bridge/game-core-bridge.js');

    // ── 初始化游戏 ──
    const bridge = new GameCoreBridge({});
    const grid = bridge.globalGrid;
    const totalRows = grid.length;
    const totalCols = grid[0].length;

    // ── 调试瞬移：跳到 Boss 房间 ──
    window.__bridge = bridge;
    // 函数定义移后，等所有变量就绪再赋值

    // ── 视口尺寸（固定） ──
    const CELL_SIZE = 40;
    const VIEW_COLS = 10;
    const VIEW_ROWS = 12;
    const screenWidth = VIEW_COLS * CELL_SIZE;   // 400
    const screenHeight = VIEW_ROWS * CELL_SIZE;  // 480

    // ── 像素级墙体碰撞数据（替代 grid 隐式格子碰撞） ──
    let wallRects = buildWallRects(grid, totalCols, totalRows);

    // ── 初始化渲染器 ──
    const renderer = new Renderer(canvas, { tiles, fogFrames, monsters: tiles.monsters }, {
        cellWidth: CELL_SIZE,
        cellHeight: CELL_SIZE,
        viewCols: VIEW_COLS,
        viewRows: VIEW_ROWS,
    });
    renderer.setDimensions(totalCols, totalRows, screenWidth, screenHeight);
    renderer.initHud(minimapCanvas);

    // 加载玩家动画
    renderer.spriteRenderer.loadAnimations({ basePath: ASSETS.character });

    // ── 音频 ──
    let audioInited = false;
    const audioPlayer = initWebAudio();

    // ── 初始化调试面板 ──
    createDebugPanel({ fogRenderer: renderer.fogRenderer, audioPlayer });

    // ── Boss 巡逻：在最大房间中创建巡逻 AI ──
    const bossRooms = bridge.game.rooms;
    let largestRoom = null;
    let maxArea = 0;
    for (const room of bossRooms) {
        const ib = room.interior;
        const area = (ib.right - ib.left + 1) * (ib.bottom - ib.top + 1);
        if (area > maxArea) { maxArea = area; largestRoom = room; }
    }
    let bossPatrol = null;
    if (largestRoom) {
        const ib = largestRoom.interior;
        const cx = Math.floor((ib.left + ib.right) / 2);
        const cy = Math.floor((ib.top + ib.bottom) / 2);
        window.__bossRoomPos = { gx: cx, gy: cy }; // 供调试瞬移用

        // 与渲染器 _drawBossPatrol 一致的缩放系数
        const bossPlayerPH = 42 * (CELL_SIZE / 40) * 1.2;
        const bossTargetH = Math.round(bossPlayerPH * 4);
        const bossScale = bossTargetH / 320;

        bossPatrol = {
            gx: cx, gy: cy,
            pixelX: cx * CELL_SIZE + CELL_SIZE / 2,
            pixelY: cy * CELL_SIZE + CELL_SIZE / 2,
            facingRight: true,
            state: 'walking',   // 'walking' | 'turning'
            stateTimer: 0,
            animTimer: 0,
            frameIdx: 0,
            animFps: { idle: 6, walk: 15, turnBack: 10 },
            frames: bossAnims,
            leftBound: ib.left,
            rightBound: ib.right,
            topBound: ib.top,
            bottomBound: ib.bottom,
            // 碰撞盒使用原始素材空间定义 + 缩放系数，
            // 实际使用时动态计算 collision.* × collisionScale
            collision: {
                anchorX: 256,  // 锚点相对素材左上角 X
                anchorY: 256,  // 锚点相对素材左上角 Y
                halfW: 96,     // 碰撞盒半宽（原始素材像素）
                halfH: 24,     // 碰撞盒半高（原始素材像素）
                imgW: 512,     // 素材原始宽度
                imgH: 320,     // 素材原始高度
            },
            collisionScale: bossScale, // 缩放系数（targetH / 320）
        };
    }

    // ── 玩家像素位置（平滑移动用） ──
    const startX = bridge.playerGlobalX;
    const startY = bridge.playerGlobalY;
    let playerPixelX = startX * CELL_SIZE + CELL_SIZE / 2;
    let playerPixelY = startY * CELL_SIZE + CELL_SIZE / 2;
    let playerDirection = 'down';
    let playerIsMoving = false;

    // ── 调试瞬移 ──
    window.__teleportToBoss = () => {
        const pos = window.__bossRoomPos;
        if (!pos || !bridge.game || !bridge.game.player) return;
        bridge.game.player.x = pos.gx;
        bridge.game.player.y = pos.gy;
        bridge.playerGlobalX = pos.gx;
        bridge.playerGlobalY = pos.gy;
        bridge.game.player.markExplored(pos.gx, pos.gy);
        // 同步玩家像素位置，使摄像机跟随
        playerPixelX = pos.gx * CELL_SIZE + CELL_SIZE / 2;
        playerPixelY = pos.gy * CELL_SIZE + CELL_SIZE / 2;
        renderer.camera.reset(playerPixelX, playerPixelY);
    };

    // ── 点击寻路状态 ──
    let autoPath = null;      // Array<{r:number, c:number}> | null
    let autoPathIdx = 0;
    let autoTarget = null;    // {gx, gy} | null — 目标标记位置

    const BASE_MOVE_SPEED = 4.5; // 格/秒
    const DASH_RANGE = 2;       // 闪现距离（格）
    const DASH_COOLDOWN = 3;    // 闪现冷却（秒）
    const DASH_DURATION = 0.2;  // 闪现动画时长（秒）

    // ── 闪现状态 ──
    let dashCooldown = 0;
    let dashProgress = 0;       // 0=未闪现, >0=动画进度(0→1)
    let dashStartPX = 0;
    let dashStartPY = 0;
    let dashEndPX = 0;
    let dashEndPY = 0;
    let dashDir = 'down';

    // ── 输入 ──
    const input = createInputManager();

    // ── 虚拟摇杆（放入控制区中央） ──
    const joystick = new VirtualJoystick({ size: 100 });
    joystick.mount(ctrlCenter || container, true);

    // ── 控制区按钮 ──
    if (ctrlRight) {
        createControlButtons(ctrlRight, hud);
    }

    // 在首次用户交互时立即初始化音频（点击/触摸/按键事件触发）
    function ensureAudio() {
        if (audioInited) return;
        audioInited = true;
        audioPlayer.init();  // 合成音效立即可用
        // 等外部音频文件加载完后随机播一首 BGM
        audioPlayer.externalReady().then(() => {
            const loadedKeys = Object.keys(audioPlayer._bgmBuffers);
            if (loadedKeys.length > 0) {
                const randomKey = loadedKeys[Math.floor(Math.random() * loadedKeys.length)];
                audioPlayer.playBGM(Number(randomKey));
            }
        });
        // 移除所有监听器，只触发一次
        document.removeEventListener('pointerdown', ensureAudio);
        document.removeEventListener('keydown', ensureAudio);
    }
    document.addEventListener('pointerdown', ensureAudio);
    document.addEventListener('keydown', ensureAudio);

    // ── 投石状态（瞄准模式） ──
    let isStoneAiming = false;

    /** 尝试向 (gx, gy) 投石 */
    function tryThrowStone(gx, gy) {
        if (gx < 0 || gx >= totalCols || gy < 0 || gy >= totalRows) return false;
        if (isWallCell(grid[gy][gx])) return false;
        const dist = Math.abs(gx - bridge.playerGlobalX) + Math.abs(gy - bridge.playerGlobalY);
        if (dist > 6) return false;
        if (!bridge.seenCells.has(`${gy},${gx}`)) return false;
        if (bridge.useStone(gx, gy)) {
            window.__noiseSource = { x: gx, y: gy };
            window.__noiseSourceTime = performance.now();
            isStoneAiming = false; // 投出后退出瞄准
            return true;
        }
        return false;
    }

    // ── Canvas 点击事件（寻路 or 瞄准投石） ──
    canvas.addEventListener('click', (e) => {
        if (bridge.hasWon()) return;

        // 计算点击的网格坐标
        const vp = renderer.camera.getViewport();
        const { camIntX, camIntY, camFracX, camFracY } = vp;
        const tx = Math.round(renderer.gridOffsetX - camFracX * CELL_SIZE);
        const ty = Math.round(renderer.gridOffsetY - camFracY * CELL_SIZE);
        const gx = camIntX + Math.floor((e.offsetX - tx) / CELL_SIZE);
        const gy = camIntY + Math.floor((e.offsetY - ty) / CELL_SIZE);

        if (gx < 0 || gx >= totalCols || gy < 0 || gy >= totalRows) return;

        // 瞄准模式 → 投石
        if (isStoneAiming) {
            tryThrowStone(gx, gy);
            return;
        }

        // 正常模式 → 点击寻路
        if (isWallCell(grid[gy][gx])) return;
        if (gy === bridge.playerGlobalY && gx === bridge.playerGlobalX) return;

        const path = findPath(
            grid,
            bridge.playerGlobalY, bridge.playerGlobalX,
            gy, gx,
            totalRows, totalCols,
            (r, c) => isWallCell(grid[r][c])
        );
        if (path && path.length > 1) {
            autoPath = path;
            autoPathIdx = 1;
            autoTarget = { gx, gy };
        }
    });

    // ── 迷雾开关 ──
    window.__fogEnabled = true;
    window.__boosterPressed = false;
    window.__chestPassable = false; // 宝箱是否可穿越
    window.__stealthPressed = false;
    window.__stonePressed = false;
    window.__meatPressed = false;
    window.__quietPressed = false;

    /** 判断某格是否为墙（含隐藏类型 + 可选宝箱） */
    function isWallCell(cell) {
        if (cell === 2 /* CELL.CHEST */ && !window.__chestPassable) return true;
        return cell === 0 || cell === 11 || cell === 12 || cell === 13;
    }

    /**
     * 构建像素空间墙体矩形列表
     * 将 grid 二维数组转换为 {x, y, w, h, type} 矩形数组，
     * 用于纯像素级碰撞检测，不再隐式依赖格子坐标。
     */
    function buildWallRects(grid, totalCols, totalRows) {
        const rects = [];
        for (let gy = 0; gy < totalRows; gy++) {
            for (let gx = 0; gx < totalCols; gx++) {
                const cell = grid[gy][gx];
                if (cell !== 0 && cell !== 11 && cell !== 12 && cell !== 13) {
                    if (cell === 2) {
                        // 宝箱作为 type='chest' 加入，运行时由 __chestPassable 控制
                        rects.push({ x: gx * CELL_SIZE, y: gy * CELL_SIZE, w: CELL_SIZE, h: CELL_SIZE, type: 'chest' });
                    }
                    continue;
                }
                const x = gx * CELL_SIZE;
                const y = gy * CELL_SIZE;
                // 上边缘墙体：仅底部 20% 区域可碰撞
                if (gy > 0 && !isWallCell(grid[gy - 1][gx]) &&
                    gy + 1 < totalRows && isWallCell(grid[gy + 1][gx])) {
                    const wallTop = CELL_SIZE * 0.8;
                    rects.push({ x, y: y + wallTop, w: CELL_SIZE, h: CELL_SIZE - wallTop, type: 'wall' });
                } else {
                    rects.push({ x, y, w: CELL_SIZE, h: CELL_SIZE, type: 'wall' });
                }
            }
        }
        return rects;
    }

    /**
     * 碰撞检测（纯像素级）
     *
     * 伪3D设计下，玩家 sprite 可视作从地面站立起来的角色，
     * 因此碰撞盒只需检测 sprite 底部中心窄带（约占 sprite 高度 20%）。
     * 所有碰撞数据均为像素空间，不再依赖格子坐标。
     */
    function checkCollision(targetX, targetY, wallRects, monsters, boss) {
        const halfW = CELL_SIZE * 0.315; // 12.6px
        const bottomH = CELL_SIZE * 0.2;
        const mapW = totalCols * CELL_SIZE;
        const mapH = totalRows * CELL_SIZE;
        const corners = [
            { x: targetX - halfW, y: targetY - bottomH },
            { x: targetX + halfW, y: targetY - bottomH },
            { x: targetX - halfW, y: targetY },
            { x: targetX + halfW, y: targetY },
        ];

        // 地图边界碰撞（出界即碰撞）
        for (const c of corners) {
            if (c.x < 0 || c.x >= mapW || c.y < 0 || c.y >= mapH) return false;
        }

        // 墙体矩形碰撞（遍历 wallRects，纯 AABB 四角检测）
        for (const c of corners) {
            for (const r of wallRects) {
                if (r.type === 'chest' && window.__chestPassable) continue;
                if (c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h) {
                    return false;
                }
            }
        }

        // 怪物碰撞检测（像素级圆形）
        if (monsters && monsters.length > 0) {
            for (const m of monsters) {
                // 怪物位置：连续格坐标 → 像素中心
                const mCenterX = m.pixelX * CELL_SIZE + CELL_SIZE / 2;
                const mCenterY = m.pixelY * CELL_SIZE + CELL_SIZE / 2;
                const mRadius = CELL_SIZE * 0.35;
                for (const c of corners) {
                    const dx = c.x - mCenterX;
                    const dy = c.y - mCenterY;
                    if (dx * dx + dy * dy < mRadius * mRadius) {
                        return false;
                    }
                }
            }
        }

        // Boss 碰撞检测（使用原始素材空间数据 × 缩放系数，纯 AABB）
        if (boss) {
            const playerLeft = targetX - halfW;
            const playerRight = targetX + halfW;
            const playerTop = targetY - bottomH;
            const playerBottom = targetY;
            const sc = boss.collisionScale;
            const c = boss.collision;
            // 锚点屏幕 Y = boss.pixelY（pixelY 直接代表锚点）
            const anchorY = boss.pixelY;
            const halfWScaled = c.halfW * sc;
            const halfHScaled = c.halfH * sc;
            const bossLeft = boss.pixelX - halfWScaled;
            const bossRight = boss.pixelX + halfWScaled;
            const bossTop = anchorY - halfHScaled;
            const bossBottom = anchorY + halfHScaled;
            if (playerLeft < bossRight && playerRight > bossLeft &&
                playerTop < bossBottom && playerBottom > bossTop) {
                return false;
            }
        }

        return true;
    }

    // ── 过滤 Boss 房间内的小怪物 ──
    function getMonstersExcludeBossRoom(rawMonsters) {
        if (!bossPatrol || !rawMonsters) return rawMonsters || [];
        return rawMonsters.filter(m =>
            m.gridX < bossPatrol.leftBound || m.gridX > bossPatrol.rightBound ||
            m.gridY < bossPatrol.topBound || m.gridY > bossPatrol.bottomBound
        );
    }

    // ── 当前帧玩家格子（用于检测跨格事件） ──
    let prevGX = bridge.playerGlobalX;
    let prevGY = bridge.playerGlobalY;

    // ── 脚步声距离累计 ──
    let footstepDistance = 0;
    const FOOTSTEP_THRESHOLD = CELL_SIZE * 0.55; // 每走约半格触发一次

    /**
     * 更新 Boss 巡逻状态机（纯像素级平滑移动）
     * 使用碰撞盒前缘做像素级碰撞检测（wallRects AABB）
     * 碰撞墙/玩家后直接转身，跳过 idle
     */
    function updateBossPatrol(boss, dt, wallRects, playerPixelX, playerPixelY) {
        boss.animTimer += dt;

        // ── 像素级平滑行走 ──
        if (boss.state === 'walking') {
            const walkSpeed = 1.5; // 格/秒
            const dir = boss.facingRight ? 1 : -1;
            const stepPx = walkSpeed * CELL_SIZE * dt;

            const newPixelX = boss.pixelX + dir * stepPx;
            const sc = boss.collisionScale;
            const c = boss.collision;

            // 碰撞盒缩放后尺寸
            const halfWScaled = c.halfW * sc;
            const halfHScaled = c.halfH * sc;
            const anchorY = boss.pixelY; // pixelY 直接代表锚点

            // 前缘：碰撞盒行进方向一侧的整个垂直边
            const leadingX = boss.facingRight
                ? newPixelX + halfWScaled   // 向右：碰撞盒右边缘
                : newPixelX - halfWScaled;  // 向左：碰撞盒左边缘
            const leadingTop = anchorY - halfHScaled;
            const leadingBottom = anchorY + halfHScaled;

            // 像素级墙体碰撞：前缘线段与 wallRects 的 AABB 检测
            const hitWall = wallRects.some(r => {
                if (r.type === 'chest' && window.__chestPassable) return false;
                return leadingX >= r.x && leadingX < r.x + r.w &&
                       leadingBottom > r.y && leadingTop < r.y + r.h;
            });

            // 像素级玩家碰撞：AABB 矩形重叠
            const playerHalfW = CELL_SIZE * 0.315;
            const playerBottomH = CELL_SIZE * 0.2;
            const hitPlayer =
                playerPixelX - playerHalfW < boss.pixelX + halfWScaled &&
                playerPixelX + playerHalfW > boss.pixelX - halfWScaled &&
                playerPixelY - playerBottomH < anchorY + halfHScaled &&
                playerPixelY > anchorY - halfHScaled;

            // 边界检测：Boss 中心不越出房间范围
            const hitBound = newPixelX < boss.leftBound * CELL_SIZE ||
                            newPixelX > (boss.rightBound + 1) * CELL_SIZE;

            if (hitWall || hitBound || hitPlayer) {
                // 碰到任何阻挡 → 保持当前像素位置，直接转身
                boss.state = 'turning';
                boss.animTimer = 0;
                boss.frameIdx = 0;
            } else {
                // 正常移动（纯像素，不绑定格子）
                boss.gx = Math.floor(newPixelX / CELL_SIZE);
                boss.pixelX = newPixelX;
            }

            // Walk 动画（24 帧循环）
            const fps = boss.animFps.walk;
            boss.frameIdx = Math.floor(boss.animTimer / (1 / fps)) % boss.frames.walk.length;

        // ── 转身（保持在碰撞时的像素位置，不绑定格子） ──
        } else if (boss.state === 'turning') {
            const fps = boss.animFps.turnBack;
            boss.frameIdx = Math.floor(boss.animTimer / (1 / fps));
            const total = boss.frames.turnBack.length;

            if (boss.frameIdx >= total) {
                boss.facingRight = !boss.facingRight;
                boss.state = 'walking';
                boss.animTimer = 0;
                boss.frameIdx = 0;
            }
        }
    }

    // ── 游戏循环 ──
    let prevTimestamp = 0;

    function gameLoop(timestamp) {
        if (!prevTimestamp) prevTimestamp = timestamp;
        const dt = Math.min((timestamp - prevTimestamp) / 1000, 0.1);
        prevTimestamp = timestamp;

        // ── 闪现冷却计时 ──
        if (dashCooldown > 0) dashCooldown = Math.max(0, dashCooldown - dt);

        // ── 合并输入（键盘 + 摇杆） ──
        const keyDir = input.getDirection();
        const joyDir = joystick.getDirection();

        let dx = keyDir.dx + joyDir.dx;
        let dy = keyDir.dy + joyDir.dy;
        const mag = Math.sqrt(dx * dx + dy * dy);
        if (mag > 1) { dx /= mag; dy /= mag; }

        const inputActive = keyDir.active || joyDir.active;

        // ── 直接输入时取消自动寻路 ──
        if (inputActive && autoPath) {
            autoPath = null;
            autoPathIdx = 0;
            autoTarget = null;
        }

        // ── 自动寻路（点击移动） ──
        let autoPathActive = false;
        if (autoPath && !inputActive && !bridge.hasWon()) {
            const wp = autoPath[autoPathIdx];
            if (wp) {
                const targetPixelX = wp.c * CELL_SIZE + CELL_SIZE / 2;
                const targetPixelY = wp.r * CELL_SIZE + CELL_SIZE / 2;
                const distX = targetPixelX - playerPixelX;
                const distY = targetPixelY - playerPixelY;
                const distMag = Math.sqrt(distX * distX + distY * distY);

                if (distMag < 4) {
                    // 到达当前 waypoint → 前进到下一个
                    autoPathIdx++;
                    if (autoPathIdx >= autoPath.length) {
                        // 路径走完 → snap 到目标格正中央
                        const dest = autoPath[autoPath.length - 1];
                        playerPixelX = dest.c * CELL_SIZE + CELL_SIZE / 2;
                        playerPixelY = dest.r * CELL_SIZE + CELL_SIZE / 2;
                        autoPath = null;
                        autoPathIdx = 0;
                        autoTarget = null;
                    }
                } else {
                    dx = distX / distMag;
                    dy = distY / distMag;
                    autoPathActive = true;
                }
            } else {
                autoPath = null;
                autoPathIdx = 0;
                autoTarget = null;
            }
        }

        // ── 静步模式 ──
        const isQuiet = (input.isQuietMode() || window.__quietPressed) && inputActive;

        // ── 移动速度 ──
        let moveSpeed = BASE_MOVE_SPEED;
        if (isQuiet) moveSpeed *= 0.5; // 静步时减速

        // ── Booster 视野强化 ──
        const boosterKeyActive = input.isBoosterKey();
        const boosterBtnActive = window.__boosterPressed;
        const boosterActive = (boosterKeyActive || boosterBtnActive) && bridge.echoCount > 0 && !bridge.hasWon();
        // 每秒消耗 8 回响
        if (boosterActive) {
            const cost = 8 * dt;
            if (bridge.echoCount >= cost) {
                bridge.inventory.spendEcho(cost);
                bridge.echoCount = bridge.inventory.echoCount;
            }
        }

        // ── 道具使用 ──
        // 隐身护盾 [1]
        if (input.consumeItemKey(0) || window.__stealthPressed) {
            window.__stealthPressed = false;
            bridge.toggleStealth();
        }
        // 投石 [2] — 切换瞄准模式（再次点击或点击格子投出）
        if (input.consumeItemKey(1) || window.__stonePressed) {
            window.__stonePressed = false;
            if (bridge.getItemCount('capsule_stone') > 0) {
                isStoneAiming = !isStoneAiming;
            }
        }
        // 放肉 [3] — 在玩家脚下放置
        if (input.consumeItemKey(2) || window.__meatPressed) {
            window.__meatPressed = false;
            bridge.useMeat(bridge.playerGlobalX, bridge.playerGlobalY);
        }

        // ── 闪现 Dash ──
        const dashKeyPressed = input.consumeDashKey();
        const dashBtnPressed = window.__dashPressed;
        window.__dashPressed = false;
        if ((dashKeyPressed || dashBtnPressed) && dashCooldown <= 0 && !bridge.hasWon() && !isQuiet) {
            // 确定闪现方向
            let ddx = 0, ddy = 0;
            if (inputActive || autoPathActive) {
                ddx = dx; ddy = dy;
            } else {
                switch (playerDirection) {
                    case 'up': ddy = -1; break;
                    case 'down': ddy = 1; break;
                    case 'left': ddx = -1; break;
                    case 'right': ddx = 1; break;
                }
            }
            if (ddx !== 0 || ddy !== 0) {
                const mag = Math.sqrt(ddx * ddx + ddy * ddy);
                const ndx = ddx / mag;
                const ndy = ddy / mag;
                let targetPX = playerPixelX;
                let targetPY = playerPixelY;
                const monsterStates = getMonstersExcludeBossRoom(bridge.getMonsters());
                for (let step = 0; step < DASH_RANGE; step++) {
                    const nextPX = targetPX + ndx * CELL_SIZE;
                    const nextPY = targetPY + ndy * CELL_SIZE;
                    if (checkCollision(nextPX, nextPY, wallRects, monsterStates, bossPatrol)) {
                        targetPX = nextPX;
                        targetPY = nextPY;
                    } else {
                        break; // 碰壁停止
                    }
                }
                if (targetPX !== playerPixelX || targetPY !== playerPixelY) {
                    dashStartPX = playerPixelX;
                    dashStartPY = playerPixelY;
                    dashEndPX = targetPX;
                    dashEndPY = targetPY;
                    dashProgress = 0.001;
                    dashCooldown = DASH_COOLDOWN;
                    dashDir = playerDirection;
                    // 播放闪现音效（随机 01/02，50%音量）
                    const flashIdx = Math.random() < 0.5 ? 'skill_flash_move_01' : 'skill_flash_move_02';
                    audioPlayer.playSFX(flashIdx, 0.5);
                    // 取消自动寻路
                    autoPath = null;
                    autoPathIdx = 0;
                    autoTarget = null;
                }
            }
        }

        // ── 噪音源时效（投石后持续 500ms） ──
        const noiseElapsed = performance.now() - (window.__noiseSourceTime || 0);
        const noiseSource = (noiseElapsed < 500) ? window.__noiseSource : null;

        // ── 噪音等级（静步=0.3, 正常=1） ──
        const noiseLevel = isQuiet ? 0.3 : 1;

        // ── 闪现动画更新 ──
        if (dashProgress > 0) {
            dashProgress = Math.min(1, dashProgress + dt / DASH_DURATION);
            const t = dashProgress;
            playerPixelX = dashStartPX + (dashEndPX - dashStartPX) * t;
            playerPixelY = dashStartPY + (dashEndPY - dashStartPY) * t;
            playerDirection = dashDir;
            playerIsMoving = true;
            if (dashProgress >= 1) {
                playerPixelX = dashEndPX;
                playerPixelY = dashEndPY;
                dashProgress = 0;
                playerIsMoving = false;
                // 同步格子位置
                const dgx = Math.floor((playerPixelX - CELL_SIZE / 2) / CELL_SIZE);
                const dgy = Math.floor((playerPixelY - CELL_SIZE / 2) / CELL_SIZE);
                if (dgx !== prevGX || dgy !== prevGY) {
                    const result = bridge.movePlayer(dgx - prevGX, dgy - prevGY);
                    prevGX = bridge.playerGlobalX;
                    prevGY = bridge.playerGlobalY;
                    if (result.victory) {
                        console.log('[Bootstrap] 🎉 到达出口！');
                        audioPlayer.playSFX('victory');
                    }
                }
            }
        }

        // ── 更新移动（输入或自动寻路，闪现中不可移动） ──
        if (dashProgress <= 0 && (inputActive || autoPathActive) && !bridge.hasWon()) {
            playerDirection = getDirectionFromVector(dx, dy);
            playerIsMoving = true;

            // 记录移动前位置（用于计算实际移动距离）
            const prevPosX = playerPixelX;
            const prevPosY = playerPixelY;

            const speedPx = moveSpeed * CELL_SIZE;
            const targetX = playerPixelX + dx * speedPx * dt;
            const targetY = playerPixelY + dy * speedPx * dt;
            const monsterStates = getMonstersExcludeBossRoom(bridge.getMonsters());

            if (checkCollision(targetX, targetY, wallRects, monsterStates, bossPatrol)) {
                playerPixelX = targetX;
                playerPixelY = targetY;
            } else {
                if (dx !== 0 && checkCollision(targetX, playerPixelY, wallRects, monsterStates, bossPatrol)) {
                    playerPixelX = targetX;
                } else if (dy !== 0 && checkCollision(playerPixelX, targetY, wallRects, monsterStates, bossPatrol)) {
                    playerPixelY = targetY;
                }
            }

            // 基于移动距离触发脚步音效
            const movedDist = Math.sqrt(
                (playerPixelX - prevPosX) ** 2 + (playerPixelY - prevPosY) ** 2
            );
            footstepDistance += movedDist;
            if (footstepDistance >= FOOTSTEP_THRESHOLD) {
                audioPlayer.playSFX('step');
                footstepDistance -= FOOTSTEP_THRESHOLD;
            }

            // 检测跨格（仅用于游戏逻辑，不触发音效）
            const curGX = Math.round((playerPixelX - CELL_SIZE / 2) / CELL_SIZE);
            const curGY = Math.round((playerPixelY - CELL_SIZE / 2) / CELL_SIZE);
            if (curGX !== prevGX || curGY !== prevGY) {
                const result = bridge.movePlayer(curGX - prevGX, curGY - prevGY);
                prevGX = bridge.playerGlobalX;
                prevGY = bridge.playerGlobalY;
                if (result.victory) {
                    console.log('[Bootstrap] 🎉 到达出口！');
                    audioPlayer.playSFX('victory');
                    autoPath = null;
                    autoPathIdx = 0;
                    autoTarget = null;
                }
            }
        } else if (dashProgress <= 0) {
            playerIsMoving = false;
        }

        // ── 宝箱交互 ──
        const interactKey = input.consumeInteractKey();
        const interactPressed = interactKey || consumeInteractClick();
        if (interactPressed && !bridge.hasWon()) {
            const pGX = bridge.playerGlobalX;
            const pGY = bridge.playerGlobalY;
            // 检测四方向相邻格子是否有宝箱
            const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
            for (const [dx, dy] of dirs) {
                const nx = pGX + dx;
                const ny = pGY + dy;
                if (nx < 0 || nx >= totalCols || ny < 0 || ny >= totalRows) continue;
                if (grid[ny][nx] === 2 /* CELL.CHEST */) {
                    const result = bridge.openChest(ny, nx, performance.now());
                    if (result.opened) {
                        console.log('[Bootstrap] 🎁', result.message);
                        showDropMessage('🎁 ' + result.message);
                        audioPlayer.playSFX('chest_open');
                        if (result.drop) {
                            setTimeout(() => audioPlayer.playSFX('item_get'), 350);
                        }
                    } else if (result.message) {
                        showDropMessage(result.message);
                        audioPlayer.playSFX('chest_locked');
                    }
                    break; // 一次只打开一个宝箱
                }
            }
        }

        // ── HUD 更新 ──
        updateHUD(bridge.playerGlobalX, bridge.playerGlobalY, dashCooldown, boosterActive, bridge.echoCount, bridge.echoCapacity, bridge, isQuiet, isStoneAiming);

        // ── 更新怪物AI（传入隐身/噪音等级/噪音源） ──
        const stealthActive = bridge.isStealthActive();
        bridge.updateMonsters(dt * 1000, noiseSource, stealthActive, noiseLevel);

        // ── Boss 巡逻更新 ──
        if (bossPatrol) {
            updateBossPatrol(bossPatrol, dt, wallRects, playerPixelX, playerPixelY);
        }

        // ── 更新渲染器 ──
        renderer.update(playerPixelX, playerPixelY, dt);
        renderer.spriteRenderer.quietMode = isQuiet;
        renderer.spriteRenderer.updateAnimation(dt, dashProgress > 0);
        renderer.fogRenderer.updateAnimation(dt);
        renderer.render({
            grid,
            playerPixelX,
            playerPixelY,
            playerGX: bridge.playerGlobalX,
            playerGY: bridge.playerGlobalY,
            playerDirection,
            playerIsMoving,
            seenCells: bridge.seenCells,
            seenCellsTime: bridge.seenCellsTime,
            boosterActive,
            fogEnabled: window.__fogEnabled,
            chestStates: bridge.chestStates,
            targetMarker: autoTarget,
            fogOpts: window.__fogOpts || undefined,
            monsters: getMonstersExcludeBossRoom(bridge.getMonsters()),
            stealthActive: bridge.isStealthActive(),
            meatPositions: bridge.getMeatPositions(),
            stoneTarget: bridge.getLastStoneTarget(),
            bossPatrol,
            now: performance.now(),
        });

        platform.requestAnimationFrame(gameLoop);
    }

    // ── 启动 ──
    renderer.camera.reset(playerPixelX, playerPixelY);
    platform.requestAnimationFrame(gameLoop);
}

function getDirectionFromVector(dx, dy) {
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle >= -45 && angle < 45) return 'right';
    if (angle >= 45 && angle < 135) return 'down';
    if (angle >= -135 && angle < -45) return 'up';
    return 'left';
}

// 自动启动
const container = document.getElementById('game-container') || document.body;
startGame(container).catch((err) => {
    console.error('[Bootstrap] 启动失败:', err);
});
