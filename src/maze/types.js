/**
 * 迷宫单元格类型定义
 * 纯数据，不依赖任何平台 API
 */

export const CELL = {
    WALL: 0,             // 墙体 — 不可通行
    FLOOR: 1,            // 地面 — 可通行
    CHEST: 2,            // 宝箱
    EXIT: 3,             // 出口
    HIDDEN_WALL: 11,     // 隐藏墙体 — 看起来是墙，触发后变 FLOOR
    HIDDEN_FLOOR: 12,    // 隐藏房间内部地面
    HIDDEN_PASSAGE: 13,  // 隐藏通道 — 触发后连通
};

/**
 * 房间类型
 */
export const ROOM_TYPE = {
    START: 'start',
    END: 'end',
    NORMAL: 'normal',
    HIDDEN: 'hidden',
};

/**
 * 隐藏房间触发条件类型
 */
export const TRIGGER_TYPE = {
    KEY: 'key',         // 需要钥匙
    BOMB: 'bomb',       // 需要炸弹/工具破坏
    PROXIMITY: 'proximity', // 走近自动触发
    CLUE: 'clue',       // 获得线索后互动触发
};
