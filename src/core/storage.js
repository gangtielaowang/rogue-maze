/**
 * 存档接口抽象
 *
 * 定义数据持久化所需的接口，不依赖具体平台 API。
 * Web 版使用 localStorage，微信小游戏使用 wx.setStorageSync。
 *
 * 用法：各平台实现自己的 StorageBackend，然后通过 setStorage 注入。
 */

/** @type {StorageBackend|null} */
let _backend = null;

/**
 * 存储后端接口
 * @interface StorageBackend
 * @method getItem(key)          - 读取数据，返回 string|null
 * @method setItem(key, value)   - 写入数据
 * @method removeItem(key)       - 删除数据
 * @method clear()               - 清空所有数据
 */

// ===== 默认 Web 实现（localStorage） =====
const _webBackend = {
    getItem(key) {
        try { return localStorage.getItem(key); } catch { return null; }
    },
    setItem(key, value) {
        try { localStorage.setItem(key, value); } catch { /* 存储满或禁用 */ }
    },
    removeItem(key) {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
    },
    clear() {
        try { localStorage.clear(); } catch { /* ignore */ }
    },
};

/**
 * 注入存储后端的实现
 * @param {StorageBackend} [backend]
 */
export function setStorage(backend) {
    _backend = backend || _webBackend;
}

/** @returns {StorageBackend} */
export function getStorage() {
    if (!_backend) setStorage();
    return _backend;
}

// ────────── 便捷方法 ──────────

export function saveJSON(key, data) {
    getStorage().setItem(key, JSON.stringify(data));
}

export function loadJSON(key) {
    const raw = getStorage().getItem(key);
    if (raw === null || raw === undefined) return null;
    try { return JSON.parse(raw); } catch { return null; }
}

export function remove(key) {
    getStorage().removeItem(key);
}

export function clearAll() {
    getStorage().clear();
}
