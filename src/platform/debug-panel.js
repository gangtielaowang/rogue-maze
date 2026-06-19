/**
 * 调试面板 + BGM 音乐播放器
 * 侧滑菜单，包含显示控制、迷雾参数、音乐播放等
 *
 * BGM 部分直接桥接到游戏 WebAudioPlayer 实例，
 * 用于调试循环点、体验音乐与游戏的适配程度。
 */

// ─── BGM 曲目列表（含默认循环点，可在面板中调整） ───
const BGM_TRACKS = [
    { file: 'rogue-maze_mainbgm_v0.3_01.mp3',        loopStart: 12.646, loopEnd: 126.3 },
    { file: 'rogue-maze_mainbgm_cc_v0.1_01.mp3',     loopStart: 28.774, loopEnd: 239.969 },
    { file: 'rogue-maze_mainbgm_v0.12_01.mp3',       loopStart: 80.866, loopEnd: 261.875 },
    { file: 'rogue-maze_mainbgm_v0.12_02.mp3',       loopStart: 38.107, loopEnd: 163.693 },
    { file: 'rogue-maze_mainbgm_v0.15_01.mp3',       loopStart: 0, loopEnd: 0 },
    { file: 'rogue-maze_mainbgm_v0.15_02.mp3',       loopStart: 0, loopEnd: 0 },
    { file: 'rogue-maze_mainbgm_boss_v0.16_01.mp3',  loopStart: 0, loopEnd: 0 },
    { file: 'rogue-maze_mainbgm_v0.17_01.mp3',       loopStart: 0, loopEnd: 0 },
    { file: 'rogue-maze_mainbgm_v0.17_02.mp3',       loopStart: 0, loopEnd: 0 },
    { file: 'rogue-maze_mainbgm_boss_v0.18_01.mp3',  loopStart: 0, loopEnd: 0 },
    { file: 'rogue-maze_mainbgm_boss_v0.19_01.mp3',  loopStart: 0, loopEnd: 0 },
    { file: 'rogue-maze_mainbgm_boss_v0.19_02.mp3',  loopStart: 0, loopEnd: 0 },
];

const BGM_BASE_PATH = 'assets/bgm/main/';

// ─── 全局调试状态 ───
// 注入到 window 供游戏循环读取
window.__fogEnabled = true;
window.__chestPassable = false;
window.__showCollisionBox = false;
window.__showHiddenRooms = false;
window.__fogOpts = {
    dissolveMs: 500,
    frameScale: 2.8,
    circleRatio: 1.28,
    cellMult: 0.7,
    normalInner: 2,
    normalOuter: 4.5,
    boostInner: 4,
    boostOuter: 7,
    flickerAmp: 1,     // 闪烁幅度 0~2（1=默认，0=关）
    flickerSpeed: 1,   // 闪烁频率 0~3（1=默认，0=静止）
};

// ════════════════════════════════════════
//  调试面板 UI
// ════════════════════════════════════════

let panelInstance = null; // 单例

/**
 * 创建调试面板
 * @param {Object} [refs] - 外部引用
 * @param {Object} [refs.fogRenderer] - FogRenderer 实例
 * @param {Object} [refs.audioPlayer] - WebAudioPlayer 实例（BGM 调试用）
 */
export function createDebugPanel(refs = {}) {
    if (panelInstance) return panelInstance;

    const audioPlayer = refs.audioPlayer || null;
    console.log('[DebugPanel] audioPlayer:', audioPlayer?.constructor?.name, typeof audioPlayer?.getBGMProgress);
    const fogRenderer = refs.fogRenderer || null;

    // BGM 内部状态（由面板管理）
    let bgmState = {
        currentIndex: -1,      // 当前选中的曲目索引
        loopStart: 0,          // 当前循环起点（秒）
        loopEnd: 0,            // 当前循环止点（秒）
        isOpen: false,         // BGM 面板是否打开
        progressTimer: null,   // 进度轮询定时器
    };

    // ── 注入 CSS ──
    injectStyles();

    // ── 创建面板 HTML ──
    const panel = createPanelDOM();
    document.body.appendChild(panel);

    // ── 创建入口按钮 ──
    const toggleBtn = createToggleButton();
    document.body.appendChild(toggleBtn);

    // ── 创建 BGM 面板 ──
    const bgmPanel = createBGMPanelDOM();
    document.body.appendChild(bgmPanel);

    // ── 绑定事件 ──
    bindEvents(panel, bgmPanel, toggleBtn, audioPlayer, fogRenderer, bgmState);

    panelInstance = {
        panel,
        bgmPanel,
        toggleBtn,
        bgmState,
        audioPlayer,
        updateSlidersFromFogRenderer() {
            updateSliderDisplays();
        },
    };
    return panelInstance;
}

// ════════════════════════════════════════
//  CSS 注入
// ════════════════════════════════════════

function injectStyles() {
    if (document.getElementById('debug-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'debug-panel-styles';
    style.textContent = `
        /* ── 面板容器 ── */
        #debug-panel {
            position: fixed;
            top: 10px;
            right: -400px;
            width: 380px;
            max-height: 85vh;
            background: rgba(16, 16, 20, 0.96);
            border: 1px solid rgba(255, 157, 58, 0.25);
            border-radius: 10px 0 0 10px;
            box-shadow: -4px 0 20px rgba(0,0,0,0.6);
            z-index: 200;
            transition: right 0.3s ease;
            overflow-y: auto;
            font-family: monospace;
            font-size: 12px;
            color: #ccc;
        }
        #debug-panel.active { right: 0; }

        #debug-panel::-webkit-scrollbar { width: 4px; }
        #debug-panel::-webkit-scrollbar-thumb { background: rgba(255,157,58,0.3); border-radius: 2px; }

        .dbg-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 16px;
            border-bottom: 1px solid rgba(255,157,58,0.15);
            background: rgba(255,157,58,0.06);
            position: sticky;
            top: 0;
            z-index: 1;
        }
        .dbg-header span { color: #ff9d3a; font-weight: bold; font-size: 14px; letter-spacing: 1px; }
        .dbg-close {
            width: 26px; height: 26px;
            background: rgba(255,80,80,0.25);
            border: none; border-radius: 50%;
            color: #fff; font-size: 16px;
            cursor: pointer; line-height: 26px; text-align: center;
            transition: background 0.2s;
        }
        .dbg-close:hover { background: rgba(255,80,80,0.5); }

        .dbg-content { padding: 10px 16px 16px; }

        .dbg-section { margin-bottom: 14px; }
        .dbg-section h3 {
            color: #ddd;
            font-size: 11px;
            margin-bottom: 8px;
            padding-bottom: 4px;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            letter-spacing: 0.5px;
        }

        .dbg-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 7px;
            min-height: 28px;
        }
        .dbg-row label {
            width: 110px;
            color: #aaa;
            font-size: 11px;
            flex-shrink: 0;
        }
        .dbg-row input[type="range"] {
            flex: 1;
            height: 4px;
            cursor: pointer;
            accent-color: #ff9d3a;
            min-width: 0;
        }
        .dbg-row .val {
            width: 40px;
            color: #ff9d3a;
            font-size: 11px;
            text-align: right;
            flex-shrink: 0;
        }

        /* ── 开关按钮 ── */
        .dbg-toggle {
            padding: 4px 14px;
            border: 1px solid rgba(200,200,220,0.2);
            border-radius: 4px;
            background: rgba(60,60,70,0.5);
            color: rgba(200,200,220,0.5);
            font-family: monospace;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s;
            min-width: 48px;
            text-align: center;
        }
        .dbg-toggle.on {
            background: rgba(255,157,58,0.15);
            border-color: rgba(255,157,58,0.5);
            color: #ff9d3a;
        }

        /* ── 入口按钮 ── */
        #debug-toggle-btn {
            position: fixed;
            top: 10px;
            right: 10px;
            width: 36px; height: 36px;
            background: rgba(255,157,58,0.15);
            border: 1px solid rgba(255,157,58,0.3);
            border-radius: 8px;
            color: #ff9d3a;
            font-size: 18px;
            cursor: pointer;
            z-index: 199;
            transition: all 0.2s;
            line-height: 36px;
            text-align: center;
            font-family: monospace;
        }
        #debug-toggle-btn:hover { background: rgba(255,157,58,0.25); }
        #debug-toggle-btn.active { right: 390px; }

        /* ── BGM 面板 ── */
        #bgm-panel {
            position: fixed;
            top: 10px;
            right: -420px;
            width: 400px;
            max-height: 85vh;
            background: rgba(16, 18, 22, 0.97);
            border: 1px solid rgba(100,200,255,0.25);
            border-radius: 10px 0 0 10px;
            box-shadow: -4px 0 20px rgba(0,0,0,0.6);
            z-index: 201;
            transition: right 0.3s ease;
            overflow-y: auto;
            font-family: monospace;
            color: #ccc;
        }
        #bgm-panel.active { right: 0; }

        .bgm-header {
            display: flex; justify-content: space-between; align-items: center;
            padding: 14px 16px;
            border-bottom: 1px solid rgba(100,200,255,0.15);
            background: rgba(100,200,255,0.06);
            position: sticky; top: 0; z-index: 1;
        }
        .bgm-header span { color: #64c8ff; font-weight: bold; font-size: 14px; }
        .bgm-close {
            width: 26px; height: 26px;
            background: rgba(255,80,80,0.25);
            border: none; border-radius: 50%;
            color: #fff; font-size: 16px;
            cursor: pointer; line-height: 26px; text-align: center;
        }

        .bgm-body { padding: 10px 16px 14px; }
        .bgm-section { margin-bottom: 12px; }
        .bgm-section h3 { color: #999; font-size: 11px; margin-bottom: 6px; }

        .bgm-track-list {
            display: flex;
            flex-direction: column;
            gap: 3px;
            max-height: 200px;
            overflow-y: auto;
        }
        .bgm-track-item {
            padding: 6px 10px;
            border-radius: 4px;
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.05);
            color: #888;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s;
        }
        .bgm-track-item:hover {
            background: rgba(100,200,255,0.08);
            color: #aaa;
        }
        .bgm-track-item.active {
            background: rgba(100,200,255,0.12);
            border-color: rgba(100,200,255,0.3);
            color: #64c8ff;
        }

        /* ── 进度条 ── */
        .bgm-progress-wrap {
            position: relative;
            width: 100%;
            height: 32px;
            background: rgba(255,255,255,0.06);
            border-radius: 4px;
            cursor: pointer;
            margin-top: 4px;
            overflow: hidden;
        }
        .bgm-progress-fill {
            position: absolute;
            left: 0;
            top: 0;
            height: 100%;
            width: 0%;
            background: rgba(100,200,255,0.15);
            pointer-events: none;
            transition: width 0.1s linear;
        }
        .bgm-progress-marker {
            position: absolute;
            top: 0;
            width: 2px;
            height: 100%;
            pointer-events: none;
        }
        .bgm-progress-marker.loop-start { background: #4caf50; }
        .bgm-progress-marker.loop-end   { background: #f44336; }
        .bgm-progress-pos {
            position: absolute;
            top: 0;
            width: 3px;
            height: 100%;
            background: #64c8ff;
            pointer-events: none;
            transition: left 0.1s linear;
        }
        .bgm-progress-label {
            position: absolute;
            bottom: 2px;
            font-size: 9px;
            color: rgba(255,255,255,0.5);
            transform: translateX(-50%);
            pointer-events: none;
            white-space: nowrap;
        }
        .bgm-progress-time {
            position: absolute;
            top: 2px;
            right: 4px;
            font-size: 10px;
            color: rgba(255,255,255,0.4);
            pointer-events: none;
        }

        /* ── 播放控制按钮行 ── */
        .bgm-controls-row {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-top: 8px;
            flex-wrap: wrap;
        }
        .bgm-btn {
            padding: 5px 12px;
            border: 1px solid rgba(100,200,255,0.25);
            border-radius: 5px;
            background: rgba(100,200,255,0.08);
            color: #64c8ff;
            font-family: monospace;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s;
            white-space: nowrap;
        }
        .bgm-btn:hover { background: rgba(100,200,255,0.18); }
        .bgm-btn.jump10 { border-color: rgba(255,200,60,0.3); color: #ffc83c; background: rgba(255,200,60,0.08); }
        .bgm-btn.jump10:hover { background: rgba(255,200,60,0.18); }

        .bgm-now-playing {
            margin-left: auto;
            font-size: 10px;
            color: #666;
            font-style: italic;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 140px;
        }

        /* ── 循环点输入 ── */
        .bgm-loop-row {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-top: 6px;
        }
        .bgm-loop-row label {
            color: #888;
            font-size: 10px;
            width: 48px;
            flex-shrink: 0;
        }
        .bgm-loop-row input[type="number"] {
            width: 64px;
            padding: 2px 4px;
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 3px;
            color: #ccc;
            font-family: monospace;
            font-size: 11px;
            text-align: center;
        }
        .bgm-loop-row input[type="number"]:focus {
            outline: none;
            border-color: #64c8ff;
        }
        .bgm-loop-row .loop-apply {
            padding: 2px 8px;
            border: 1px solid rgba(100,200,255,0.2);
            border-radius: 3px;
            background: rgba(100,200,255,0.06);
            color: #64c8ff;
            font-family: monospace;
            font-size: 10px;
            cursor: pointer;
        }
        .bgm-loop-row .loop-apply:hover { background: rgba(100,200,255,0.15); }
        .bgm-loop-row .loop-sep { color: #444; font-size: 10px; }

        /* ── 音量 ── */
        .bgm-volume-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 6px;
        }
        .bgm-volume-row label { color: #888; font-size: 10px; width: 36px; }
        .bgm-volume-row input[type="range"] {
            flex: 1; height: 4px;
            accent-color: #64c8ff;
            cursor: pointer;
        }
        .bgm-volume-row .val { color: #64c8ff; font-size: 10px; width: 28px; text-align: right; }
    `;
    document.head.appendChild(style);
}

// ════════════════════════════════════════
//  DOM 创建
// ════════════════════════════════════════

function createToggleButton() {
    const btn = document.createElement('button');
    btn.id = 'debug-toggle-btn';
    btn.textContent = '⚙';
    return btn;
}

function createPanelDOM() {
    const panel = document.createElement('div');
    panel.id = 'debug-panel';

    panel.innerHTML = `
        <div class="dbg-header">
            <span>⚙ 调试面板</span>
            <button class="dbg-close" id="dbg-close">×</button>
        </div>
        <div class="dbg-content">
            <!-- 显示控制 -->
            <div class="dbg-section">
                <h3>显示控制</h3>
                <div class="dbg-row">
                    <label>迷雾开关</label>
                    <button class="dbg-toggle on" id="dbg-tog-fog">开</button>
                </div>
                <div class="dbg-row">
                    <label>隐藏房间高亮</label>
                    <button class="dbg-toggle" id="dbg-tog-hidden">开</button>
                </div>
                <div class="dbg-row">
                    <label>碰撞盒显示</label>
                    <button class="dbg-toggle" id="dbg-tog-collision">开</button>
                </div>
                <div class="dbg-row">
                    <label>宝箱可通行</label>
                    <button class="dbg-toggle" id="dbg-tog-chestpass">开</button>
                </div>
                <div class="dbg-row">
                    <label>音乐播放器</label>
                    <button class="dbg-toggle" id="dbg-tog-bgm">打开</button>
                </div>
                <div class="dbg-row">
                    <label>Boss 房间</label>
                    <button class="dbg-toggle" id="dbg-tp-boss">瞬移</button>
                </div>
            </div>

            <!-- 迷雾参数 -->
            <div class="dbg-section" id="dbg-fog-section">
                <h3>迷雾参数</h3>
                <div class="dbg-row">
                    <label>消散时长 (ms)</label>
                    <input type="range" id="dbg-fog-dissolve" min="100" max="2000" step="50" value="500">
                    <span class="val" id="dbg-fog-dissolve-val">500</span>
                </div>
                <div class="dbg-row">
                    <label>帧动画缩放</label>
                    <input type="range" id="dbg-fog-framescal" min="1" max="5" step="0.1" value="2.8">
                    <span class="val" id="dbg-fog-framescal-val">2.8</span>
                </div>
                <div class="dbg-row">
                    <label>迷雾圆形大小</label>
                    <input type="range" id="dbg-fog-circleratio" min="0.5" max="3" step="0.05" value="1.28">
                    <span class="val" id="dbg-fog-circleratio-val">1.28</span>
                </div>
                <div class="dbg-row">
                    <label>视野整体倍率</label>
                    <input type="range" id="dbg-fog-cellmult" min="0.3" max="1.5" step="0.05" value="0.7">
                    <span class="val" id="dbg-fog-cellmult-val">0.7</span>
                </div>
                <div class="dbg-row">
                    <label>常规视野内圈</label>
                    <input type="range" id="dbg-fog-norminner" min="1" max="6" step="0.5" value="2">
                    <span class="val" id="dbg-fog-norminner-val">2</span>
                </div>
                <div class="dbg-row">
                    <label>常规视野外圈</label>
                    <input type="range" id="dbg-fog-normouter" min="2" max="10" step="0.5" value="4.5">
                    <span class="val" id="dbg-fog-normouter-val">4.5</span>
                </div>
                <div class="dbg-row">
                    <label>共鸣视野内圈</label>
                    <input type="range" id="dbg-fog-boostinner" min="2" max="10" step="0.5" value="4">
                    <span class="val" id="dbg-fog-boostinner-val">4</span>
                </div>
                <div class="dbg-row">
                    <label>共鸣视野外圈</label>
                    <input type="range" id="dbg-fog-boostouter" min="3" max="15" step="0.5" value="7">
                    <span class="val" id="dbg-fog-boostouter-val">7</span>
                </div>
                <div class="dbg-row">
                    <label>视野闪烁幅度</label>
                    <input type="range" id="dbg-fog-flickamp" min="0" max="2" step="0.05" value="1">
                    <span class="val" id="dbg-fog-flickamp-val">1.00</span>
                </div>
                <div class="dbg-row">
                    <label>视野闪烁频率</label>
                    <input type="range" id="dbg-fog-flickspeed" min="0" max="3" step="0.05" value="1">
                    <span class="val" id="dbg-fog-flickspeed-val">1.00</span>
                </div>
            </div>
        </div>
    `;
    return panel;
}

function createBGMPanelDOM() {
    const panel = document.createElement('div');
    panel.id = 'bgm-panel';

    let trackHTML = '';
    BGM_TRACKS.forEach((t, i) => {
        trackHTML += `<div class="bgm-track-item" data-index="${i}">${t.file}</div>`;
    });

    panel.innerHTML = `
        <div class="bgm-header">
            <span>♫ BGM 调试器</span>
            <button class="bgm-close" id="bgm-close">×</button>
        </div>
        <div class="bgm-body">
            <div class="bgm-section">
                <h3>曲目列表</h3>
                <div class="bgm-track-list">${trackHTML}</div>
            </div>
            <div class="bgm-section">
                <h3>播放进度</h3>
                <div class="bgm-progress-wrap" id="bgm-progress-bar">
                    <div class="bgm-progress-fill" id="bgm-progress-fill"></div>
                    <div class="bgm-progress-pos" id="bgm-progress-pos" style="left:0%"></div>
                    <div class="bgm-progress-marker loop-start" id="bgm-marker-start" style="left:0%"></div>
                    <div class="bgm-progress-marker loop-end" id="bgm-marker-end" style="left:100%"></div>
                    <div class="bgm-progress-time" id="bgm-progress-time">0:00 / 0:00</div>
                </div>
            </div>
            <div class="bgm-section">
                <h3>循环点</h3>
                <div class="bgm-loop-row">
                    <label>循环起点</label>
                    <input type="number" id="bgm-loop-start" value="0" step="0.1" min="0">
                    <span class="loop-sep">~</span>
                    <label>循环止点</label>
                    <input type="number" id="bgm-loop-end" value="0" step="0.1" min="0">
                    <button class="loop-apply" id="bgm-loop-apply">应用</button>
                </div>
            </div>
            <div class="bgm-section">
                <h3>播放控制</h3>
                <div class="bgm-controls-row">
                    <button class="bgm-btn" id="bgm-play-btn">▶ 播放</button>
                    <button class="bgm-btn jump10" id="bgm-jump10">⏪ 循环止点前 10s</button>
                    <span class="bgm-now-playing" id="bgm-now-playing">未选择曲目</span>
                </div>
                <div class="bgm-volume-row">
                    <label>音量</label>
                    <input type="range" id="bgm-volume" min="0" max="1" step="0.05" value="0.5">
                    <span class="val" id="bgm-volume-val">0.5</span>
                </div>
            </div>
        </div>
    `;
    return panel;
}

// ════════════════════════════════════════
//  BGM 进度轮询
// ════════════════════════════════════════

function startProgressPoll(audioPlayer, bgmState) {
    stopProgressPoll(bgmState);
    bgmState.progressTimer = setInterval(() => {
        updateProgressDisplay(audioPlayer);
    }, 100); // 每 100ms 刷新
}

function stopProgressPoll(bgmState) {
    if (bgmState.progressTimer) {
        clearInterval(bgmState.progressTimer);
        bgmState.progressTimer = null;
    }
}

function updateProgressDisplay(audioPlayer) {
    if (!audioPlayer) {
        console.warn('[DebugPanel] audioPlayer 为空');
        return;
    }
    if (typeof audioPlayer.getBGMProgress !== 'function') {
        console.warn('[DebugPanel] audioPlayer 类型异常:', audioPlayer.constructor?.name, Object.prototype.toString.call(audioPlayer));
        return;
    }
    const prog = audioPlayer.getBGMProgress();
    const posEl = document.getElementById('bgm-progress-pos');
    const fillEl = document.getElementById('bgm-progress-fill');
    const timeEl = document.getElementById('bgm-progress-time');
    const markerStart = document.getElementById('bgm-marker-start');
    const markerEnd = document.getElementById('bgm-marker-end');
    const loopStartInput = document.getElementById('bgm-loop-start');
    const loopEndInput = document.getElementById('bgm-loop-end');

    const duration = prog.duration || 1;
    const pct = Math.min((prog.currentTime / duration) * 100, 100);
    const loopStartPct = (prog.loopStart / duration) * 100;
    const loopEndPct = (prog.loopEnd > 0 ? prog.loopEnd : duration) / duration * 100;

    if (posEl) posEl.style.left = pct + '%';
    if (fillEl) fillEl.style.width = pct + '%';
    if (markerStart) markerStart.style.left = loopStartPct + '%';
    if (markerEnd) markerEnd.style.left = loopEndPct + '%';

    if (timeEl) {
        timeEl.textContent = formatTime(prog.currentTime) + ' / ' + formatTime(duration);
    }

    // 将进度时间同步到循环点输入框
    if (loopStartInput && !loopStartInput.dataset.userEdited) {
        loopStartInput.value = prog.loopStart.toFixed(1);
    }
    if (loopEndInput && !loopEndInput.dataset.userEdited) {
        loopEndInput.value = prog.loopEnd.toFixed(1);
    }
}

function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return m + ':' + String(s).padStart(2, '0');
}

// ════════════════════════════════════════
//  事件绑定
// ════════════════════════════════════════

function bindEvents(panel, bgmPanel, toggleBtn, audioPlayer, fogRenderer, bgmState) {
    // ── 入口按钮 ──
    toggleBtn.addEventListener('click', () => {
        const isOpen = panel.classList.toggle('active');
        toggleBtn.classList.toggle('active', isOpen);
        if (isOpen) {
            bgmPanel.classList.remove('active');
            bgmState.isOpen = false;
        }
        updateAllToggleButtons();
    });

    // ── 关闭按钮 ──
    document.getElementById('dbg-close').addEventListener('click', () => {
        panel.classList.remove('active');
        toggleBtn.classList.remove('active');
    });

    // ── 迷雾开关 ──
    const fogBtn = document.getElementById('dbg-tog-fog');
    fogBtn.addEventListener('click', () => {
        window.__fogEnabled = !window.__fogEnabled;
        updateToggleBtn(fogBtn, window.__fogEnabled);
    });

    // ── 隐藏房间高亮 ──
    const hiddenBtn = document.getElementById('dbg-tog-hidden');
    hiddenBtn.addEventListener('click', () => {
        window.__showHiddenRooms = !window.__showHiddenRooms;
        updateToggleBtn(hiddenBtn, window.__showHiddenRooms);
    });

    // ── 碰撞盒显示 ──
    const collisionBtn = document.getElementById('dbg-tog-collision');
    collisionBtn.addEventListener('click', () => {
        window.__showCollisionBox = !window.__showCollisionBox;
        updateToggleBtn(collisionBtn, window.__showCollisionBox);
    });

    // ── 宝箱可通行 ──
    const chestPassBtn = document.getElementById('dbg-tog-chestpass');
    chestPassBtn.addEventListener('click', () => {
        window.__chestPassable = !window.__chestPassable;
        updateToggleBtn(chestPassBtn, window.__chestPassable);
    });

    // ── 瞬移到 Boss 房间 ──
    const tpBossBtn = document.getElementById('dbg-tp-boss');
    if (tpBossBtn) {
        tpBossBtn.addEventListener('click', () => {
            if (typeof window.__teleportToBoss === 'function') {
                window.__teleportToBoss();
                // 关闭调试面板以便看到效果
                panel.classList.remove('active');
                toggleBtn.classList.remove('active');
            }
        });
    }

    // ── BGM 切换按钮（在调试面板中打开 BGM 面板） ──
    const bgmToggleBtn = document.getElementById('dbg-tog-bgm');
    bgmToggleBtn.addEventListener('click', () => {
        bgmState.isOpen = !bgmState.isOpen;
        bgmPanel.classList.toggle('active', bgmState.isOpen);
        bgmToggleBtn.textContent = bgmState.isOpen ? '关闭' : '打开';
        if (bgmState.isOpen) {
            panel.classList.remove('active');
            toggleBtn.classList.remove('active');
            startProgressPoll(audioPlayer, bgmState);
            updateProgressDisplay(audioPlayer);
            updateBGMUI(audioPlayer, bgmState);
        } else {
            stopProgressPoll(bgmState);
        }
    });

    // ── BGM 关闭按钮 ──
    document.getElementById('bgm-close').addEventListener('click', () => {
        bgmState.isOpen = false;
        bgmPanel.classList.remove('active');
        bgmToggleBtn.textContent = '打开';
        stopProgressPoll(bgmState);
    });

    // ── BGM 曲目列表 ──
    const trackItems = bgmPanel.querySelectorAll('.bgm-track-item');
    trackItems.forEach(item => {
        item.addEventListener('click', () => {
            const idx = parseInt(item.dataset.index);
            playTrack(idx, audioPlayer, bgmState, trackItems);
        });
    });

    // ── 播放/暂停按钮 ──
    document.getElementById('bgm-play-btn').addEventListener('click', () => {
        if (!audioPlayer) return;
        const prog = audioPlayer.getBGMProgress();
        if (prog.isPlaying) {
            audioPlayer.pauseBGM();
        } else {
            if (bgmState.currentIndex >= 0) {
                audioPlayer.resumeBGM();
            } else {
                // 没选曲目 → 播第一个
                playTrack(0, audioPlayer, bgmState, trackItems);
            }
        }
        updateBGMUI(audioPlayer, bgmState);
    });

    // ── 跳到循环止点前 10 秒 ──
    document.getElementById('bgm-jump10').addEventListener('click', () => {
        if (!audioPlayer) return;
        audioPlayer.jumpToLoopEndMinus10();
        updateProgressDisplay(audioPlayer);
    });

    // ── 循环点应用按钮 ──
    document.getElementById('bgm-loop-apply').addEventListener('click', () => {
        applyLoopPoints(audioPlayer, bgmState);
    });

    // ── 循环点输入框键盘支持（Enter 应用） ──
    document.getElementById('bgm-loop-start').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applyLoopPoints(audioPlayer, bgmState);
    });
    document.getElementById('bgm-loop-end').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applyLoopPoints(audioPlayer, bgmState);
    });

    // ── 标记用户是否手动编辑过循环点输入框 ──
    document.getElementById('bgm-loop-start').addEventListener('input', function () {
        this.dataset.userEdited = 'true';
    });
    document.getElementById('bgm-loop-end').addEventListener('input', function () {
        this.dataset.userEdited = 'true';
    });

    // ── BGM 音量 ──
    const volSlider = document.getElementById('bgm-volume');
    const volVal = document.getElementById('bgm-volume-val');
    volSlider.addEventListener('input', () => {
        const v = parseFloat(volSlider.value);
        if (audioPlayer) audioPlayer.setBGMVolume(v);
        volVal.textContent = v.toFixed(2);
    });

    // ── 进度条点击跳转 ──
    const progressBar = document.getElementById('bgm-progress-bar');
    progressBar.addEventListener('click', (e) => {
        if (!audioPlayer) return;
        const rect = progressBar.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        const prog = audioPlayer.getBGMProgress();
        const target = pct * prog.duration;
        audioPlayer.seekBGM(target);
    });

    // ── 迷雾参数滑条 ──
    const fogSliderMap = {
        'dbg-fog-dissolve': 'dissolveMs',
        'dbg-fog-framescal': 'frameScale',
        'dbg-fog-circleratio': 'circleRatio',
        'dbg-fog-cellmult': 'cellMult',
        'dbg-fog-norminner': 'normalInner',
        'dbg-fog-normouter': 'normalOuter',
        'dbg-fog-boostinner': 'boostInner',
        'dbg-fog-boostouter': 'boostOuter',
        'dbg-fog-flickamp': 'flickerAmp',
        'dbg-fog-flickspeed': 'flickerSpeed',
    };

    Object.entries(fogSliderMap).forEach(([elId, key]) => {
        const slider = document.getElementById(elId);
        const valSpan = document.getElementById(elId + '-val');
        if (!slider || !valSpan) return;

        // 初始值
        valSpan.textContent = slider.value;

        slider.addEventListener('input', () => {
            const v = parseFloat(slider.value);
            const step = parseFloat(slider.step);
            const displayVal = step < 1 ? v.toFixed(2) : v;
            valSpan.textContent = displayVal;
            window.__fogOpts[key] = v;
        });
    });
}

// ════════════════════════════════════════
//  BGM 操作函数
// ════════════════════════════════════════

/** 播放指定索引的曲目 */
function playTrack(idx, audioPlayer, bgmState, trackItems) {
    if (!audioPlayer) return;

    const track = BGM_TRACKS[idx];
    if (!track) return;

    // 更新输入框为当前曲目的默认循环点
    const loopStartInput = document.getElementById('bgm-loop-start');
    const loopEndInput = document.getElementById('bgm-loop-end');
    if (loopStartInput) {
        loopStartInput.value = track.loopStart.toFixed(3);
        loopStartInput.dataset.userEdited = '';
    }
    if (loopEndInput) {
        loopEndInput.value = track.loopEnd.toFixed(3);
        loopEndInput.dataset.userEdited = '';
    }

    const loopStart = track.loopStart;
    const loopEnd = track.loopEnd;

    bgmState.currentIndex = idx;
    bgmState.loopStart = loopStart;
    bgmState.loopEnd = loopEnd;

    const url = BGM_BASE_PATH + track.file;
    audioPlayer.loadAndPlayBGM(url, loopStart, loopEnd);

    // 应用音量
    const volSlider = document.getElementById('bgm-volume');
    if (volSlider) {
        audioPlayer.setBGMVolume(parseFloat(volSlider.value));
    }

    // 更新曲目高亮
    trackItems.forEach(t => t.classList.remove('active'));
    trackItems[idx].classList.add('active');

    updateBGMUI(audioPlayer, bgmState);
}

/** 应用当前循环点并重新加载 */
function applyLoopPoints(audioPlayer, bgmState) {
    if (!audioPlayer || bgmState.currentIndex < 0) return;

    const loopStartInput = document.getElementById('bgm-loop-start');
    const loopEndInput = document.getElementById('bgm-loop-end');
    const loopStart = loopStartInput ? parseFloat(loopStartInput.value) || 0 : 0;
    const loopEnd = loopEndInput ? parseFloat(loopEndInput.value) || 0 : 0;

    bgmState.loopStart = loopStart;
    bgmState.loopEnd = loopEnd;

    const track = BGM_TRACKS[bgmState.currentIndex];
    const url = BGM_BASE_PATH + track.file;
    audioPlayer.loadAndPlayBGM(url, loopStart, loopEnd);

    // 重置 userEdited 标记
    if (loopStartInput) loopStartInput.dataset.userEdited = '';
    if (loopEndInput) loopEndInput.dataset.userEdited = '';
}

// ════════════════════════════════════════
//  UI 辅助函数
// ════════════════════════════════════════

function updateToggleBtn(btn, isOn) {
    btn.classList.toggle('on', isOn);
    btn.textContent = isOn ? '开' : '关';
}

function updateAllToggleButtons() {
    updateToggleBtn(document.getElementById('dbg-tog-fog'), window.__fogEnabled);
    updateToggleBtn(document.getElementById('dbg-tog-hidden'), window.__showHiddenRooms);
    updateToggleBtn(document.getElementById('dbg-tog-collision'), window.__showCollisionBox);
    updateToggleBtn(document.getElementById('dbg-tog-chestpass'), window.__chestPassable);
}

function updateBGMUI(audioPlayer, bgmState) {
    const playBtn = document.getElementById('bgm-play-btn');
    const nowPlaying = document.getElementById('bgm-now-playing');
    if (!playBtn || !nowPlaying) return;

    if (!audioPlayer) {
        playBtn.textContent = '▶ 播放';
        nowPlaying.textContent = '音频不可用';
        return;
    }

    const prog = audioPlayer.getBGMProgress();
    const isPlaying = prog.isPlaying;

    if (bgmState.currentIndex >= 0) {
        const track = BGM_TRACKS[bgmState.currentIndex];
        playBtn.textContent = isPlaying ? '⏸ 暂停' : '▶ 播放';
        nowPlaying.textContent = isPlaying
            ? track.file
            : '已暂停: ' + track.file;
    } else {
        playBtn.textContent = '▶ 播放';
        nowPlaying.textContent = '未选择曲目';
    }
}
