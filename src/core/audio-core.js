/**
 * 音频接口抽象
 *
 * 定义音频播放所需的接口，不依赖具体平台 API。
 * Web 版使用 Web Audio API，微信小游戏使用 wx API。
 *
 * 用法：各平台实现自己的 AudioPlayer，然后通过 setAudioPlayer 注入。
 */

/** @type {AudioPlayer|null} */
let _player = null;

/**
 * 音频播放器接口
 * 各平台需实现此接口
 *
 * @interface AudioPlayer
 * @method playBGM(trackIndex)        - 播放背景音乐
 * @method stopBGM()                  - 停止背景音乐
 * @method playSFX(name)              - 播放音效
 * @method setVolume(volume)          - 设置音量 0-1
 * @method setBGMVolume(volume)       - 设置 BGM 音量 0-1
 * @method setSFXVolume(volume)       - 设置 SFX 音量 0-1
 * @method isBGMPaused()              - BGM 是否暂停
 * @method pauseBGM()                 - 暂停 BGM
 * @method resumeBGM()                - 恢复 BGM
 * @method dispose()                  - 释放资源
 */

/**
 * 注入音频播放器实现
 * @param {AudioPlayer} player
 */
export function setAudioPlayer(player) {
    _player = player;
}

/** @returns {AudioPlayer|null} */
export function getAudioPlayer() {
    return _player;
}

export function playBGM(trackIndex) {
    _player?.playBGM(trackIndex);
}
export function stopBGM() {
    _player?.stopBGM();
}
export function playSFX(name) {
    _player?.playSFX(name);
}
export function setVolume(volume) {
    _player?.setVolume(volume);
}
export function setBGMVolume(volume) {
    _player?.setBGMVolume(volume);
}
export function setSFXVolume(volume) {
    _player?.setSFXVolume(volume);
}
export function isBGMPaused() {
    return _player?.isBGMPaused() ?? false;
}
export function pauseBGM() {
    _player?.pauseBGM();
}
export function resumeBGM() {
    _player?.resumeBGM();
}
export function disposeAudio() {
    _player?.dispose();
    _player = null;
}
