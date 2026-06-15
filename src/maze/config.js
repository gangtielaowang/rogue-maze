/**
 * 迷宫生成参数配置
 * 所有参数均可覆盖，提供合理的默认值
 */

export const DEFAULT_CONFIG = {
    // === 地图尺寸 ===
    mapSize: 80,            // 地图边长（格数）

    // === 房间参数 ===
    roomCount: 15,          // 房间总数（含起点终点）
    roomMinWidth: 6,        // 房间内部最小宽度
    roomMaxWidth: 14,       // 房间内部最大宽度
    roomMinHeight: 6,       // 房间内部最小高度
    roomMaxHeight: 12,      // 房间内部最大高度
    roomMinGap: 3,          // 房间之间最小间距（格，保证墙体厚度）

    // === 墙体参数 ===
    wallThicknessH: 2,      // 墙体最小水平厚度
    wallThicknessV: 3,      // 墙体最小垂直厚度
    wallBuffer: 2,          // 房间墙体边框厚度

    // === 通道参数 ===
    corridorWidthMain: 2,   // 主干道宽度
    corridorWidthBranch: 1, // 分支通道宽度
    extraEdgeRatio: 0.25,   // 额外连接边比例（创造环路）
    branchCorridorCount: 8, // 分支死胡同数量

    // === 隐藏房间 ===
    hiddenRoomCount: { min: 3, max: 5 },  // 隐藏房间数量范围

    // === 宝箱参数 ===
    chest: {
        placeChance: 0.55,          // 每个房间生成宝箱的概率
        lockedChance: 0.25,        // 宝箱被锁定的概率
        blockedByDefault: true,    // 宝箱格默认是否可穿越（true=不可穿越）
        animDuration: 400,         // 打开动画时长(ms)
    },

    // === 起点终点 ===
    startEndMinDist: 6,     // 起点终点最小曼哈顿距离（以房间数为单位）

    // === 随机种子 ===
    seed: Date.now(),       // 随机种子
};
