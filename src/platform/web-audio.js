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
        /** 是否已初始化 */
        this._initialized = false;
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

            // 预加载 BGM
            const bgmFiles = [];
            // 主 BGM: 优先用最新版本
            bgmFiles.push(`${BGM_DIR}/rogue-maze_mainbgm_v0.17_02.mp3`);

            // Boss BGM
            bgmFiles.push(`${BGM_DIR}/rogue-maze_mainbgm_boss_v0.19_02.mp3`);

            // 预加载 SFX
            const sfxFiles = [
                `${SFX_DIR}/skill_flash_move_01.wav`,
                `${SFX_DIR}/skill_flash_move_02.wav`,
            ];

            const allFiles = [
                ...bgmFiles.map((url, i) => ({ url, type: 'bgm', index: i })),
                ...sfxFiles.map((url) => ({ url, type: 'sfx' })),
            ];

            await Promise.allSettled(allFiles.map(async (file) => {
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
                    console.warn(`[WebAudio] 加载失败: ${file.url}`, err);
                }
            }));

            this._initialized = true;
            console.log('[WebAudio] 初始化完成');
        } catch (err) {
            console.warn('[WebAudio] 初始化失败（音频不可用）:', err);
        }
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

    playSFX(name) {
        if (!this._ctx || !this._sfxGain) return;
        const buffer = this._sfxBuffers[name];
        if (!buffer) return;

        const source = this._ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this._sfxGain);
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
        return this._currentBGM === null;
    }

    pauseBGM() {
        if (this._ctx && this._ctx.state === 'running') {
            this._ctx.suspend();
        }
    }

    resumeBGM() {
        if (this._ctx && this._ctx.state === 'suspended') {
            this._ctx.resume();
        }
    }

    dispose() {
        this.stopBGM();
        this._ctx?.close();
        this._ctx = null;
        this._bgmGain = null;
        this._sfxGain = null;
        this._bgmBuffers = {};
        this._sfxBuffers = {};
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
