/**
 * mist.html 桥接层集成入口
 *
 * 通过动态 import 加载 GameCoreBridge ES Module，
 * 替换全局 window.GameMapFree 为桥接实现。
 *
 * 加载时机（<script> 标签，非 module）：
 *   - 在所有同步脚本加载完毕后执行
 *   - 在用户点击"开始探索"（new GameFree()）之前完成替换
 */

import('./game-core-bridge.js').then((mod) => {
    const GameCoreBridge = mod.GameCoreBridge;

    console.log('[MistIntegration] 加载桥接层完成，替换 window.GameMapFree → GameCoreBridge');

    // 替换旧 GameMapFree 为桥接实现
    window.GameMapFree = GameCoreBridge;

    // 也暴露到全局方便调试
    window.GameCoreBridge = GameCoreBridge;
}).catch((err) => {
    console.error('[MistIntegration] 加载桥接层失败:', err);
});
