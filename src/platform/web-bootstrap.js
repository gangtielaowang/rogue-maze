/**
 * Web 平台启动器
 *
 * 新版 Web 入口：加载所有模块、提供 Web 平台实现、启动游戏。
 * 使用 ES Module，通过 <script type="module"> 加载。
 */

import { Renderer } from '../render/renderer.js';
import { VirtualJoystick } from './joystick.js';
import { initWebAudio } from './web-audio.js';
import { getStorage, saveJSON, loadJSON } from '../core/storage.js';

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
        const img = new Image();
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
    };
}

/**
 * 加载迷雾帧
 */
function loadFogFrames() {
    const frames = [];
    for (let i = 0; i <= 7; i++) {
        const img = new Image();
        img.src = ASSETS.fog + `frame_00${i}.png`;
        frames.push(img);
    }
    return frames;
}

/**
 * 等待所有图片加载完成
 */
function waitImages(images) {
    const all = images.flat(Infinity).filter((v) => v instanceof Image);
    return Promise.all(all.map((img) =>
        new Promise((resolve) => {
            if (img.complete && img.naturalWidth > 0) {
                resolve();
            } else {
                img.onload = resolve;
                img.onerror = resolve;
            }
        })
    ));
}

// ─────── Canvas 创建 ───────

function createGameCanvas(container) {
    const canvas = document.createElement('canvas');
    canvas.id = 'game-canvas';
    canvas.style.display = 'block';
    canvas.style.margin = '0 auto';
    canvas.style.background = '#000';
    container.appendChild(canvas);
    return canvas;
}

function createMinimapCanvas(container) {
    const canvas = document.createElement('canvas');
    canvas.id = 'minimap';
    canvas.width = 100;
    canvas.height = 100;
    canvas.style.position = 'absolute';
    canvas.style.bottom = '10px';
    canvas.style.right = '10px';
    canvas.style.zIndex = '10';
    canvas.style.border = '1px solid #333';
    canvas.style.borderRadius = '4px';
    container.appendChild(canvas);
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

    /** 检测冲刺键（Shift） */
    function isSprintKey() {
        return !!keys['Shift'];
    }

    return { keys, getDirection, isSprintKey };
}

// ─────── HUD ───────

/**
 * 创建 HUD 覆盖层
 */
function createHUD(container) {
    const hud = document.createElement('div');
    hud.id = 'hud-overlay';
    hud.style.cssText = `
        position: absolute;
        top: 0; left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 50;
        font-family: monospace;
        font-size: 12px;
        color: rgba(200, 200, 220, 0.8);
    `;
    container.appendChild(hud);

    // ── 坐标显示（左上） ──
    const coords = document.createElement('div');
    coords.id = 'hud-coords';
    coords.style.cssText = `
        position: absolute;
        top: 8px;
        left: 8px;
        background: rgba(0, 0, 0, 0.5);
        padding: 4px 8px;
        border-radius: 4px;
        line-height: 1.6;
    `;
    coords.textContent = 'X: 0  Y: 0  Sprint: OFF';
    hud.appendChild(coords);

    // ── 按钮容器（右上） ──
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        pointer-events: auto;
    `;

    function createBtn(label, onClick) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = `
            font-family: monospace;
            font-size: 11px;
            padding: 4px 8px;
            border: 1px solid rgba(200,200,220,0.3);
            border-radius: 4px;
            background: rgba(0,0,0,0.5);
            color: rgba(200,200,220,0.8);
            cursor: pointer;
        `;
        btn.addEventListener('click', onClick);
        btnContainer.appendChild(btn);
        return btn;
    }

    createBtn('Toggle Fog', () => {
        window.__fogEnabled = !window.__fogEnabled;
    });

    createBtn('Restart', () => {
        location.reload();
    });

    hud.appendChild(btnContainer);

    // ── 冲刺按钮（底部） ──
    const sprintBtn = document.createElement('button');
    sprintBtn.id = 'hud-sprint';
    sprintBtn.textContent = 'SPRINT';
    sprintBtn.style.cssText = `
        position: absolute;
        bottom: 160px;
        right: 20px;
        width: 70px;
        height: 44px;
        pointer-events: auto;
        font-family: monospace;
        font-size: 11px;
        font-weight: bold;
        letter-spacing: 1px;
        padding: 4px;
        border: 2px solid rgba(255, 200, 80, 0.4);
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.5);
        color: rgba(255, 200, 80, 0.7);
        cursor: pointer;
        touch-action: manipulation;
    `;
    sprintBtn.addEventListener('touchstart', (e) => { e.preventDefault(); window.__sprintPressed = true; });
    sprintBtn.addEventListener('touchend', (e) => { e.preventDefault(); window.__sprintPressed = false; });
    sprintBtn.addEventListener('mousedown', () => { window.__sprintPressed = true; });
    sprintBtn.addEventListener('mouseup', () => { window.__sprintPressed = false; });
    sprintBtn.addEventListener('mouseleave', () => { window.__sprintPressed = false; });
    hud.appendChild(sprintBtn);

    return hud;
}

function updateHUD(playerGX, playerGY, isSprinting) {
    const el = document.getElementById('hud-coords');
    if (el) {
        el.textContent = `X: ${playerGX}  Y: ${playerGY}  ${isSprinting ? 'Sprint: ON' : 'Sprint: OFF'}`;
    }
    const sprintBtn = document.getElementById('hud-sprint');
    if (sprintBtn) {
        sprintBtn.style.borderColor = isSprinting ? 'rgba(255, 200, 80, 0.9)' : 'rgba(255, 200, 80, 0.4)';
        sprintBtn.style.color = isSprinting ? 'rgba(255, 200, 80, 1)' : 'rgba(255, 200, 80, 0.7)';
        sprintBtn.style.background = isSprinting ? 'rgba(255, 200, 80, 0.15)' : 'rgba(0, 0, 0, 0.5)';
    }
}

// ─────── 游戏主循环 ───────

/**
 * 启动游戏
 */
export async function startGame(container) {
    // ── 初始化存储 ──
    getStorage(); // 触发 localStorage 后端自动初始化

    // ── 创建 Canvas ──
    const canvas = createGameCanvas(container);
    const minimapCanvas = createMinimapCanvas(container);

    // ── 创建 HUD ──
    createHUD(container);

    // ── 加载资源 ──
    const tiles = loadTiles();
    const fogFrames = loadFogFrames();

    // 收集所有图片并等待加载
    const tileImages = [
        ...Object.values(tiles.wall_top).flat(),
        ...Object.values(tiles.wall_front).flat(),
        ...Object.values(tiles.floor).flat(),
        tiles.target_marker,
        ...Object.values(tiles.door).flat(),
    ];
    await waitImages([tileImages, fogFrames]);

    // ── 动态加载桥接层 ──
    const { GameCoreBridge } = await import('../bridge/game-core-bridge.js');

    // ── 初始化游戏 ──
    const bridge = new GameCoreBridge({});
    const grid = bridge.globalGrid;
    const totalRows = grid.length;
    const totalCols = grid[0].length;

    // ── 视口尺寸（固定） ──
    const CELL_SIZE = 40;
    const VIEW_COLS = 10;
    const VIEW_ROWS = 12;
    const screenWidth = VIEW_COLS * CELL_SIZE;   // 400
    const screenHeight = VIEW_ROWS * CELL_SIZE;  // 480

    // ── 初始化渲染器 ──
    const renderer = new Renderer(canvas, { tiles, fogFrames }, {
        cellWidth: CELL_SIZE,
        cellHeight: CELL_SIZE,
        viewCols: VIEW_COLS,
        viewRows: VIEW_ROWS,
    });
    renderer.setDimensions(totalCols, totalRows, screenWidth, screenHeight);
    renderer.initHud(minimapCanvas);

    // 加载玩家动画
    renderer.spriteRenderer.loadAnimations({ basePath: ASSETS.character });

    // ── 玩家像素位置（平滑移动用） ──
    const startX = bridge.playerGlobalX;
    const startY = bridge.playerGlobalY;
    let playerPixelX = startX * CELL_SIZE + CELL_SIZE / 2;
    let playerPixelY = startY * CELL_SIZE + CELL_SIZE / 2;
    let playerDirection = 'down';
    let playerIsMoving = false;

    const BASE_MOVE_SPEED = 4.5; // 格/秒
    const SPRINT_MULTIPLIER = 2.0;

    // ── 输入 ──
    const input = createInputManager();

    // ── 虚拟摇杆 ──
    const joystick = new VirtualJoystick();
    joystick.mount(container);

    // ── 音频 ──
    let audioInited = false;
    const audioPlayer = initWebAudio();

    // ── 迷雾开关 ──
    window.__fogEnabled = true;
    window.__sprintPressed = false;

    /** 判断某格是否为墙（含隐藏类型） */
    function isWallCell(cell) {
        return cell === 0 || cell === 11 || cell === 12 || cell === 13;
    }

    /**
     * 碰撞检测
     *
     * 伪3D设计下，玩家 sprite 可视作从地面站立起来的角色，
     * 因此碰撞盒只需检测 sprite 底部中心窄带（约占 sprite 高度 20%）。
     */
    function checkCollision(targetX, targetY, grid, totalCols, totalRows) {
        const halfW = CELL_SIZE * 0.315; // 12.6px
        const bottomH = CELL_SIZE * 0.2;
        const corners = [
            { x: targetX - halfW, y: targetY - bottomH },
            { x: targetX + halfW, y: targetY - bottomH },
            { x: targetX - halfW, y: targetY },
            { x: targetX + halfW, y: targetY },
        ];
        for (const c of corners) {
            const gx = Math.floor(c.x / CELL_SIZE);
            const gy = Math.floor(c.y / CELL_SIZE);
            if (gx < 0 || gx >= totalCols || gy < 0 || gy >= totalRows) return false;
            if (!isWallCell(grid[gy][gx])) continue;

            // 上边缘墙体（tile_0004/05/26）：仅底部 20% 区域碰撞
            if (gy > 0 && !isWallCell(grid[gy - 1][gx]) &&
                gy + 1 < totalRows && isWallCell(grid[gy + 1][gx])) {
                const cellBottom = (gy + 1) * CELL_SIZE;
                const wallTop = cellBottom - CELL_SIZE * 0.2;
                if (c.y < wallTop) continue;
            }

            return false;
        }
        return true;
    }

    // ── 当前帧玩家格子（用于检测跨格事件） ──
    let prevGX = bridge.playerGlobalX;
    let prevGY = bridge.playerGlobalY;

    // ── 游戏循环 ──
    let prevTimestamp = 0;

    function gameLoop(timestamp) {
        if (!prevTimestamp) prevTimestamp = timestamp;
        const dt = Math.min((timestamp - prevTimestamp) / 1000, 0.1);
        prevTimestamp = timestamp;

        // ── 合并输入（键盘 + 摇杆） ──
        const keyDir = input.getDirection();
        const joyDir = joystick.getDirection();

        let dx = keyDir.dx + joyDir.dx;
        let dy = keyDir.dy + joyDir.dy;
        const mag = Math.sqrt(dx * dx + dy * dy);
        if (mag > 1) { dx /= mag; dy /= mag; }

        const inputActive = keyDir.active || joyDir.active;

        // ── 冲刺 ──
        const isSprinting = (input.isSprintKey() || window.__sprintPressed) && inputActive;
        const moveSpeed = BASE_MOVE_SPEED * (isSprinting ? SPRINT_MULTIPLIER : 1);

        // ── 更新移动 ──
        if (inputActive && !bridge.hasWon()) {
            playerDirection = getDirectionFromVector(dx, dy);
            playerIsMoving = true;

            const speedPx = moveSpeed * CELL_SIZE;
            const targetX = playerPixelX + dx * speedPx * dt;
            const targetY = playerPixelY + dy * speedPx * dt;

            if (checkCollision(targetX, targetY, grid, totalCols, totalRows)) {
                playerPixelX = targetX;
                playerPixelY = targetY;
            } else {
                if (dx !== 0 && checkCollision(targetX, playerPixelY, grid, totalCols, totalRows)) {
                    playerPixelX = targetX;
                } else if (dy !== 0 && checkCollision(playerPixelX, targetY, grid, totalCols, totalRows)) {
                    playerPixelY = targetY;
                }
            }

            // 检测跨格
            const curGX = Math.round((playerPixelX - CELL_SIZE / 2) / CELL_SIZE);
            const curGY = Math.round((playerPixelY - CELL_SIZE / 2) / CELL_SIZE);
            if (curGX !== prevGX || curGY !== prevGY) {
                const result = bridge.movePlayer(curGX - prevGX, curGY - prevGY);
                prevGX = bridge.playerGlobalX;
                prevGY = bridge.playerGlobalY;
                if (result.victory) {
                    console.log('[Bootstrap] 🎉 到达出口！');
                }
            }
        } else {
            playerIsMoving = false;
        }

        // ── HUD 更新 ──
        updateHUD(bridge.playerGlobalX, bridge.playerGlobalY, isSprinting);

        // ── 音频初始化（首次用户交互时） ──
        if (!audioInited && inputActive) {
            audioInited = true;
            audioPlayer.init().then(() => {
                audioPlayer.playBGM(0);
            });
        }

        // ── 更新渲染器 ──
        renderer.update(playerPixelX, playerPixelY, dt);
        renderer.spriteRenderer.updateAnimation(dt, false);
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
            boosterActive: false,
            fogEnabled: window.__fogEnabled,
            now: performance.now(),
        });

        requestAnimationFrame(gameLoop);
    }

    // ── 启动 ──
    renderer.camera.reset(playerPixelX, playerPixelY);
    requestAnimationFrame(gameLoop);
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
