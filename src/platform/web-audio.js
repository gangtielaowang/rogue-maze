/**
 * Web 平台音频实现
 *
 * 基于 Web Audio API 实现 AudioPlayer 接口，
 * 注入到 core/audio-core.js 中使用。
 */

import { setAudioPlayer } from '../core/audio-core.js';

const BGM_DIR = 'assets/bgm/main';
const SFX_DIR = 'assets/sfx';

class WebAudioPlayer {
    constructor() {
        /** @type {AudioContext|null} */
        this._ctx = null;
        /** @type {GainNode|null} */
        this._bgmGain = null;
        /** @type {GainNode|null} */
        this._sfxGain = null;
        /** @type {AudioBufferSourceNode|null} */
        this._currentBGM = null;
        /** @type {string|null} */
        this._currentBGMUrl = null;
        /** @type {number} */
        this._bgmVolume = 0.5;
        /** @type {number} */
        this._sfxVolume = 0.7;

        /** 预加载的 BGM buffers */
        this._bgmBuffers = {};
        /** 预加载的 SFX buffers */
        this._sfxBuffers = {};
        /** 程序化合成的 SFX buffers */
        this._synthBuffers = {};
        /** 是否已初始化 */
        this._initialized = false;
        /** 外部音频文件加载完成时 resolve */
        this._externalLoadedPromise = null;
        this._resolveExternalLoaded = null;

        // ── BGM 调试/控制状态 ──
        this._bgmAudioBuffer = null;   // 当前解码后的 AudioBuffer（由 debug panel 加载）
        this._bgmDuration = 0;
        this._loopStart = 0;
        this._loopEnd = 0;
        this._currentBGMOffset = 0;    // source 开始时的 buffer 偏移
        this._currentBGMStartTime = 0; // source 开始时的 ctx.currentTime
        this._isPaused = false;
    }

    /**
     * 初始化 AudioContext（需在用户交互后调用）
     */
    async init() {
        if (this._initialized) return;
        try {
            this._ctx = new (window.AudioContext || window.webkitAudioContext)();
            this._bgmGain = this._ctx.createGain();
            this._bgmGain.gain.value = this._bgmVolume;
            this._bgmGain.connect(this._ctx.destination);

            this._sfxGain = this._ctx.createGain();
            this._sfxGain.gain.value = this._sfxVolume;
            this._sfxGain.connect(this._ctx.destination);

            // 生成合成音效（脚步/宝箱/回响等）— 同步完成，立即可用
            this._generateSynthSFX();
            this._initialized = true;
            console.log('[WebAudio] 合成音效就绪');

            // 异步加载外部音频文件（BGM + 闪现音效）
            this._externalLoadedPromise = new Promise((resolve) => {
                this._resolveExternalLoaded = resolve;
            });
            this._loadExternalFiles().then(() => {
                if (this._resolveExternalLoaded) {
                    this._resolveExternalLoaded();
                }
            });
        } catch (err) {
            console.warn('[WebAudio] 初始化失败（音频不可用）:', err);
        }
    }

    /** 返回一个 Promise，外部文件加载完成后 resolve */
    externalReady() {
        return this._externalLoadedPromise || Promise.resolve();
    }

    /** 异步加载外部音频文件，不阻塞 init() */
    async _loadExternalFiles() {
        const bgmFiles = [
            `${BGM_DIR}/rogue-maze_mainbgm_v0.3_01.mp3`,
            `${BGM_DIR}/rogue-maze_mainbgm_v0.12_01.mp3`,
            `${BGM_DIR}/rogue-maze_mainbgm_v0.12_02.mp3`,
            `${BGM_DIR}/rogue-maze_mainbgm_v0.15_01.mp3`,
            `${BGM_DIR}/rogue-maze_mainbgm_v0.15_02.mp3`,
            `${BGM_DIR}/rogue-maze_mainbgm_v0.17_01.mp3`,
            `${BGM_DIR}/rogue-maze_mainbgm_v0.17_02.mp3`,
            `${BGM_DIR}/rogue-maze_mainbgm_boss_v0.16_01.mp3`,
            `${BGM_DIR}/rogue-maze_mainbgm_boss_v0.18_01.mp3`,
            `${BGM_DIR}/rogue-maze_mainbgm_boss_v0.19_01.mp3`,
            `${BGM_DIR}/rogue-maze_mainbgm_boss_v0.19_02.mp3`,
            `${BGM_DIR}/rogue-maze_mainbgm_cc_v0.1_01.mp3`,
        ];

        const sfxFiles = [
            `${SFX_DIR}/skill_flash_move_01.wav`,
            `${SFX_DIR}/skill_flash_move_02.wav`,
        ];

        const allFiles = [
            ...bgmFiles.map((url, i) => ({ url, type: 'bgm', index: i })),
            ...sfxFiles.map((url) => ({ url, type: 'sfx' })),
        ];

        const results = await Promise.allSettled(allFiles.map(async (file) => {
            try {
                const resp = await fetch(file.url);
                const arrayBuffer = await resp.arrayBuffer();
                const audioBuffer = await this._ctx.decodeAudioData(arrayBuffer);
                if (file.type === 'bgm') {
                    this._bgmBuffers[file.index] = audioBuffer;
                } else {
                    const name = file.url.split('/').pop().replace(/\.\w+$/, '');
                    this._sfxBuffers[name] = audioBuffer;
                }
            } catch (err) {
                // 文件加载失败不影响游戏
            }
        }));

        const loadedCount = results.filter(r => r.status === 'fulfilled').length;
        console.log(`[WebAudio] 外部音频加载完成: ${loadedCount}/${allFiles.length}`);
    }

    /**
     * 程序化合成所有音效
     * 用 OscillatorNode + Noise 生成SFX，不依赖外部文件
     */
    _generateSynthSFX() {
        if (!this._ctx) return;
        const ctx = this._ctx;
        const sampleRate = ctx.sampleRate;

        /** 渲染振荡器到 AudioBuffer */
        const renderOsc = (type, freq, duration, volumeFn) => {
            const length = Math.ceil(sampleRate * duration);
            const buffer = ctx.createBuffer(1, length, sampleRate);
            const data = buffer.getChannelData(0);
            const omega = 2 * Math.PI * freq / sampleRate;
            for (let i = 0; i < length; i++) {
                const t = i / sampleRate;
                let sample;
                switch (type) {
                    case 'sine': sample = Math.sin(omega * i); break;
                    case 'square': sample = Math.sin(omega * i) > 0 ? 1 : -1; break;
                    case 'sawtooth': sample = 2 * ((freq * t) % 1) - 1; break;
                    case 'triangle': {
                        const phase = (freq * t) % 1;
                        sample = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
                        break;
                    }
                    default: sample = 0;
                }
                data[i] = sample * (volumeFn ? volumeFn(t / duration) : 1);
            }
            return buffer;
        };

        /** 渲染白噪音到 AudioBuffer */
        const renderNoise = (duration, volumeFn) => {
            const length = Math.ceil(sampleRate * duration);
            const buffer = ctx.createBuffer(1, length, sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * (volumeFn ? volumeFn(i / length) : 1);
            }
            return buffer;
        };

        /** 渲染频率扫描到 AudioBuffer */
        const renderSweep = (type, freqStart, freqEnd, duration, volumeFn) => {
            const length = Math.ceil(sampleRate * duration);
            const buffer = ctx.createBuffer(1, length, sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < length; i++) {
                const t = i / sampleRate;
                const progress = i / length;
                const freq = freqStart + (freqEnd - freqStart) * progress;
                const phase = 2 * Math.PI * freq * t;
                let sample;
                switch (type) {
                    case 'sine': sample = Math.sin(phase); break;
                    case 'square': sample = Math.sin(phase) > 0 ? 1 : -1; break;
                    default: sample = Math.sin(phase);
                }
                data[i] = sample * (volumeFn ? volumeFn(progress) : 1);
            }
            return buffer;
        };

        // ── 脚步音效 (sfx_step) ──
        // 80ms 低频撞击声 + 轻微噪声纹理
        this._synthBuffers['step'] = (() => {
            const duration = 0.08;
            const length = Math.ceil(sampleRate * duration);
            const buf = ctx.createBuffer(1, length, sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < length; i++) {
                const t = i / sampleRate;
                const p = i / length;
                // 80Hz 低频撞击
                const thud = Math.sin(2 * Math.PI * 80 * t) * (1 - p) * 0.25;
                // 轻微噪声纹理
                const noise = (Math.random() * 2 - 1) * (1 - p) * 0.08;
                d[i] = thud + noise;
            }
            // 重低通滤波
            for (let i = 3; i < d.length; i++) {
                d[i] = (d[i] + d[i - 1] + d[i - 2] + d[i - 3]) * 0.25;
            }
            return buf;
        })();

        // ── 宝箱打开 (sfx_chest_open) ──
        // 300ms 上升音调 + 亮音
        this._synthBuffers['chest_open'] = (() => {
            const buf = ctx.createBuffer(1, Math.ceil(sampleRate * 0.35), sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < d.length; i++) {
                const p = i / d.length;
                const freq = 220 + 600 * p;
                const phase = 2 * Math.PI * freq * (i / sampleRate);
                const env = Math.sin(Math.PI * p); // 缓入缓出
                d[i] = (Math.sin(phase) + Math.sin(phase * 1.5) * 0.3) * env * 0.6;
            }
            return buf;
        })();

        // ── 宝箱锁定/拒绝 (sfx_chest_locked) ──
        // 150ms 低沉嗡嗡声
        this._synthBuffers['chest_locked'] = (() => {
            const buf = ctx.createBuffer(1, Math.ceil(sampleRate * 0.2), sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < d.length; i++) {
                const p = i / d.length;
                const freq = 80 + 40 * Math.sin(2 * Math.PI * 8 * p);
                const phase = 2 * Math.PI * freq * (i / sampleRate);
                const noise = (Math.random() * 2 - 1) * 0.3;
                d[i] = (Math.sin(phase) + noise) * (1 - p) * 0.5;
            }
            return buf;
        })();

        // ── 回响拾取 (sfx_echo_pickup) ──
        // 200ms 两音和弦
        this._synthBuffers['echo_pickup'] = (() => {
            return renderOsc('sine', 880, 0.15, (p) => 1 - p * 0.7);
        })();

        // ── 胜利 (sfx_victory) ──
        // 600ms 琶音 C-E-G-C
        this._synthBuffers['victory'] = (() => {
            const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
            const noteLen = 0.15;
            const totalLen = noteLen * notes.length;
            const buf = ctx.createBuffer(1, Math.ceil(sampleRate * totalLen), sampleRate);
            const d = buf.getChannelData(0);
            for (let n = 0; n < notes.length; n++) {
                const freq = notes[n];
                const offset = Math.floor(n * noteLen * sampleRate);
                const nSamples = Math.ceil(noteLen * sampleRate);
                for (let i = 0; i < nSamples; i++) {
                    const idx = offset + i;
                    if (idx >= d.length) break;
                    const p = i / nSamples;
                    const env = Math.sin(Math.PI * p);
                    d[idx] = Math.sin(2 * Math.PI * freq * (i / sampleRate)) * env * 0.5;
                }
            }
            return buf;
        })();

        // ── 强化激活 (sfx_booster) ──
        // 300ms 上升扫描
        this._synthBuffers['booster'] = (() => {
            return renderSweep('sine', 300, 1200, 0.3, (p) => 1 - p * 0.5);
        })();

        // ── 物品获得 (sfx_item_get) ──
        // 100ms 短促亮音
        this._synthBuffers['item_get'] = (() => {
            return renderOsc('sine', 1200, 0.12, (p) => 1 - p);
        })();
    }

    // ─────── AudioPlayer 接口实现 ───────

    playBGM(trackIndex = 0) {
        if (!this._ctx || !this._bgmGain) return;
        const buffer = this._bgmBuffers[trackIndex];
        if (!buffer) return;

        // 停止当前 BGM
        this.stopBGM();

        const source = this._ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(this._bgmGain);
        source.start(0);

        this._currentBGM = source;
        this._currentBGMUrl = trackIndex;
    }

    stopBGM() {
        try {
            this._currentBGM?.stop();
        } catch { /* already stopped */ }
        this._currentBGM = null;
        this._currentBGMUrl = null;
    }

    // ─────── BGM 调试控制（debug panel 使用） ───────

    /**
     * 加载任意 BGM 曲目并播放（覆盖当前 BGM）
     * @param {string} url 曲目文件路径
     * @param {number} [loopStart=0] 循环起点（秒）
     * @param {number} [loopEnd=0] 循环止点（秒，0 表示播放到结尾）
     */
    loadAndPlayBGM(url, loopStart = 0, loopEnd = 0) {
        if (!this._ctx) return;
        // 停止当前 source（保留 _bgmAudioBuffer 以备后续 seek）
        try { this._currentBGM?.stop(); } catch {}
        this._currentBGM = null;
        this._currentBGMUrl = 'debug';

        fetch(url)
            .then(r => r.arrayBuffer())
            .then(buf => this._ctx.decodeAudioData(buf))
            .then(audioBuffer => {
                this._bgmAudioBuffer = audioBuffer;
                this._bgmDuration = audioBuffer.duration;
                this._loopStart = loopStart;
                this._loopEnd = loopEnd > 0 ? loopEnd : audioBuffer.duration;
                this._isPaused = false;
                this._startSource(0);
            })
            .catch(() => {
                this._currentBGMUrl = null;
            });
    }

    /** 内部：用 buffer 新建 source 从 offset 开始播放 */
    _startSource(offset) {
        if (!this._ctx || !this._bgmAudioBuffer || !this._bgmGain) return;
        // 停掉旧的
        try { this._currentBGM?.stop(); } catch {}
        const source = this._ctx.createBufferSource();
        source.buffer = this._bgmAudioBuffer;
        source.loop = true;
        source.loopStart = this._loopStart;
        source.loopEnd = this._loopEnd;
        source.connect(this._bgmGain);
        source.start(0, offset);
        this._currentBGM = source;
        this._currentBGMOffset = offset;
        this._currentBGMStartTime = this._ctx.currentTime;
    }

    /** 将原始进度回绕到循环区间 [loopStart, loopEnd) 内 */
    _wrapLoopTime(rawTime) {
        if (!this._bgmAudioBuffer) return rawTime;
        const loopLen = this._loopEnd - this._loopStart;
        if (loopLen <= 0 || rawTime < this._loopEnd) return rawTime;
        return this._loopStart + ((rawTime - this._loopStart) % loopLen);
    }

    /** 获取当前 BGM 进度 */
    getBGMProgress() {
        if (!this._ctx || !this._currentBGM) {
            return {
                currentTime: this._wrapLoopTime(this._currentBGMOffset || 0),
                duration: this._bgmDuration,
                loopStart: this._loopStart,
                loopEnd: this._loopEnd,
                isPlaying: false,
            };
        }
        const elapsed = this._isPaused ? 0 : (this._ctx.currentTime - this._currentBGMStartTime);
        const rawTime = this._currentBGMOffset + elapsed;
        return {
            currentTime: this._wrapLoopTime(rawTime),
            duration: this._bgmDuration,
            loopStart: this._loopStart,
            loopEnd: this._loopEnd,
            isPlaying: !this._isPaused,
        };
    }

    /** 定位到指定秒数 */
    seekBGM(time) {
        if (!this._ctx || !this._bgmAudioBuffer) return;
        const t = Math.max(0, Math.min(time, this._bgmDuration));
        this._isPaused = false;
        this._startSource(t);
    }

    /** 跳到循环止点前 10 秒 */
    jumpToLoopEndMinus10() {
        const target = Math.max(0, this._loopEnd - 10);
        this.seekBGM(target);
    }

    /** 暂停 BGM（停止当前 source，保存回绕后的位置） */
    pauseBGM() {
        if (!this._currentBGM) return;
        // 保存回绕后的进度
        const elapsed = this._ctx.currentTime - this._currentBGMStartTime;
        const rawTime = this._currentBGMOffset + Math.max(0, elapsed);
        this._currentBGMOffset = this._wrapLoopTime(rawTime);
        // 停掉当前 source，恢复时重建
        try { this._currentBGM.stop(); } catch (e) { /* 已停止 */ }
        this._currentBGM = null;
        this._isPaused = true;
    }

    /** 恢复 BGM（从暂停位置创建新 source） */
    resumeBGM() {
        if (!this._ctx || !this._bgmAudioBuffer) return;
        this._startSource(this._currentBGMOffset);
        this._isPaused = false;
    }

    /**
     * 播放音效
     * @param {string} name - 音效名称
     * @param {number} [volume=1.0] - 相对于主音量的倍率 (0~1)
     */
    playSFX(name, volume = 1.0) {
        if (!this._ctx || !this._sfxGain) return;
        let buffer = this._sfxBuffers[name];
        if (!buffer) {
            buffer = this._synthBuffers[name];
        }
        if (!buffer) return;

        const source = this._ctx.createBufferSource();
        source.buffer = buffer;
        if (volume !== 1.0) {
            const gain = this._ctx.createGain();
            gain.gain.value = Math.max(0, Math.min(1, volume));
            source.connect(gain);
            gain.connect(this._sfxGain);
        } else {
            source.connect(this._sfxGain);
        }
        source.start(0);
    }

    setVolume(volume) {
        this.setBGMVolume(volume);
        this.setSFXVolume(volume);
    }

    setBGMVolume(volume) {
        this._bgmVolume = Math.max(0, Math.min(1, volume));
        if (this._bgmGain) {
            this._bgmGain.gain.value = this._bgmVolume;
        }
    }

    setSFXVolume(volume) {
        this._sfxVolume = Math.max(0, Math.min(1, volume));
        if (this._sfxGain) {
            this._sfxGain.gain.value = this._sfxVolume;
        }
    }

    isBGMPaused() {
        return !this._currentBGM || this._isPaused;
    }

    dispose() {
        this.stopBGM();
        this._ctx?.close();
        this._ctx = null;
        this._bgmGain = null;
        this._sfxGain = null;
        this._bgmBuffers = {};
        this._sfxBuffers = {};
        this._synthBuffers = {};
        this._initialized = false;
    }
}

/**
 * 初始化 Web 音频系统
 * @returns {WebAudioPlayer}
 */
export function initWebAudio() {
    const player = new WebAudioPlayer();
    setAudioPlayer(player);
    return player;
}
