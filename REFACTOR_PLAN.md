# 项目重构计划

## 目标
1. 清理杂乱的旧文件
2. 重写迷宫生成器（采用"先定房间再连通道"方案）
3. 将代码模块化，为微信小游戏平台做准备
4. 最终产出可在 Web 和微信小游戏上运行的游戏

## 计划总览

- Phase 0: 项目清理（安全，不影响现有功能）
- Phase 1: 全新迷宫生成器（独立模块，可单独测试）
- Phase 2: 核心游戏逻辑重构（从 mist.html 中提取）
- Phase 3: 渲染层重构
- Phase 4: 新版 Web 入口
- Phase 5: 微信小游戏适配（后期）

---

## Phase 0: 项目清理

### 目标
清理根目录的旧文件，建立新目录结构，保留现有 mist.html 不动（作为参考/回退）。

### 操作步骤
1. 删除旧迷宫生成器文件（保留作为参考则移入 archive/）
   - maze-generator.js
   - maze-generator-new.js
   - maze-generator-v3.js
   - maze-generator-v4.js
   - maze-generator-v5.js
   - maze-generator-v6.js
   - maze-generator-ds01.js
2. 删除测试文件
   - test-maze.html
   - test-full.html
   - simple-test.html
   - debug.html
3. 删除 testTemp/ 目录
4. 删除旧文档（.md 文件，保留 story.md）
5. 创建新的 src/ 目录结构
6. 删除 capsule-data.js（后续迁移到 src/data/items.js）

### 验证方式
- mist.html 仍然可以正常运行（因为它引用的是 `<script>` 标签，删除文件后不影响它）
- 新目录结构就位

### 状态
✅ 已完成

---

## Phase 1: 全新迷宫生成器

### 目标
用"先定房间再连通道"方案，创建全新的迷宫生成模块。

### 架构
```
src/maze/
  config.js         - 参数配置（地图大小、房间数量、房间大小等）
  room-placer.js    - 在网格上摆放房间（随机位置，不重叠）
  corridor.js       - A* 寻路连接房间，生成通道
  generator.js      - 主生成器，协调各阶段
  types.js          - 单元格类型定义
```

### 生成流程
```
1. 在 N×N 网格上初始化全墙
2. 随机放置 M 个房间（指定大小范围，互不重叠，留墙距）
3. 随机选择起点房间和终点房间
4. 用 MST 算法生成房间间的最小连通树
5. 额外添加冗余连接，创造环路（多路径）
6. A* 寻路生成通道，确保墙体厚度≥2×3
7. 标记隐藏房间（部分房间设为"隐藏"类型）
8. 验证所有房间可达、墙体厚度达标
9. 返回 grid[][] 和房间元数据
```

### 数据模型
```javascript
// 单元格类型
CELL_TYPE = {
  WALL: 0,       // 墙体（不可通行）
  FLOOR: 1,      // 地面（可通行）
  CHEST: 2,      // 宝箱
  EXIT: 3,       // 出口
  HIDDEN_WALL: 11,   // 隐藏墙体（看起来是墙，触发后变 FLOOR）
  HIDDEN_FLOOR: 12,  // 隐藏地面（隐藏房间内部）
  HIDDEN_PASSAGE: 13, // 隐藏通道（触发后连通）
}

// 房间数据
Room = {
  id: string,
  type: 'normal' | 'hidden' | 'start' | 'end',
  bounds: { top, bottom, left, right },
  interiorSize: { width, height },
  doors: [{ row, col, direction }],
  chests: [{ row, col }],
  // 如果是隐藏房间
  hiddenTrigger: {
    type: 'key' | 'bomb' | 'proximity' | 'clue',
    params: {}
  },
  // 怪物（可选）
  monsters: [{ path, visionRange, behavior }]
}
```

### 验证方式
- 单独运行 generator.js，传入种子，输出 grid 和房间数据
- 检查：所有房间可达、墙体厚度≥2×3、起点到终点有路径
- 可视化验证：在 canvas 上渲染 grid 查看效果

### 与其他部分的关系
- 不依赖 window
- 不依赖渲染
- 不依赖任何平台 API
- 输入：配置参数 + 随机种子
- 输出：grid[][] + rooms[] 数据

### 状态
✅ 已完成

---

## Phase 1.5: 砖块式墙体系统（已完成）

### 目标
用"墙体由 2×3 标准砖块构成"的加法式思维，根治薄墙问题。

### 解决方案
在 `_ensureWallThickness`（拆墙清理）基础上，新增 `_fixBrickConnections` 步骤：
1. **垂直界面 2/3 格接触修复**：扫描每列中每 3 个连续行，将恰好 2 WALL + 1 FLOOR 且非通道的 FLOOR 补为 WALL，确保左右拼接的垂直界面 3 格全连通
2. **对角线角连接修复**：两个 WALL 对角线相邻且中间 2 格均为 FLOOR 时，补 1 格形成 2×2 连接
3. 保护通道网络（BFS 从起点遍历可通行格子），不堵门不堵路

### 相关文件
```
src/maze/wall-brick.js        - 砖块工具函数参考（已创建）
src/maze/corridor.js           - 新增 _collectProtectedCells / _fixBrickConnections
```

### 状态
✅ 已完成

---

## Phase 2: 核心游戏逻辑重构

### 目标
将 mist.html 中的游戏逻辑提取到独立的模块中。

### 提取内容
```
src/core/
  game.js         - 游戏主循环、状态管理
  player.js       - 玩家位置、移动、碰撞
  fog.js          - 迷雾系统（当前在 mist.html 中）
  inventory.js    - 背包/道具系统（当前在 mist.html 中）
  audio-core.js   - 音频接口抽象（不依赖具体 API）
  storage.js      - 存档接口抽象
  level-manager.js - 关卡管理（加载配置、生成迷宫、切换关卡）
```

### 设计原则
- 所有模块不依赖 window、document、localStorage 等 Web API
- 通过接口（interface）定义平台依赖，由 platform 层注入实现
- 模块之间通过 import/export 通信

### 验证方式
- 模块可以被 Node.js 直接加载测试
- 功能与原有 mist.html 一致

### 状态
⬜ 待开始

---

## Phase 2b: 核心游戏逻辑模块提取（已全部完成）

### 提取结果
```
src/core/
  player.js       ✅ 玩家（移动/碰撞/视野）
  fog.js          ✅ 迷雾（视野计算/可见性更新）
  game.js         ✅ 游戏主模块（状态机/迷宫协调）
  inventory.js    ✅ 背包/道具（回响/追忆/宝箱）
  audio-core.js   ✅ 音频接口抽象（接口层，可注入平台实现）
  storage.js      ✅ 存档接口抽象（接口层，可注入平台实现）

src/bridge/
  game-core-bridge.js  ✅ 桥接层（将新模块包装为旧 GameMapFree 兼容API）
```

### 验证
- 所有模块 Node.js 加载测试通过 ✅
- 不依赖任何 window/DOM/localStorage ✅

### 状态
✅ 已完成

---

## Phase 2c: 桥接层接入 mist.html（已完成）

将 `game-core-bridge.js` 接入 mist.html，替换旧的 `GameMapFree`。

### 实现方式
1. `bridge/game-core-bridge.js` 构造函数末尾自动调用 `generateWorld()`，设置 `TOTAL_ROWS/TOTAL_COLS` 全局变量
2. 创建 `bridge/mist-integration.js`，通过动态 `import()` 加载桥接 ES Module，替换 `window.GameMapFree = GameCoreBridge`
3. mist.html 在 `maze-v7-adapter.js` 后加载 `mist-integration.js`
4. 修复条件宝箱数据一致性问题

### 状态
✅ 已完成

---

## Phase 3: 渲染层重构

### 目标
将 canvas 渲染代码提取到独立模块，基于 Canvas 2D API，不依赖 DOM。

### 结构
```
src/render/
  tile-renderer.js    - 地图瓦片绘制
  sprite-renderer.js  - 角色帧动画
  fog-renderer.js     - 迷雾效果
  hud-renderer.js     - HUD 界面
  camera.js           - 摄像机（跟随玩家，计算可见区域）
```

### 注意
- Canvas 2D API 在 Web 和微信小游戏中是兼容的
- 微信小游戏使用 wx.createCanvas() 而不是 document.createElement('canvas')

### 状态
⬜ 待开始

---

## Phase 4: 新版 Web 入口

### 目标
创建一个轻量的 index.html，作为 Web 版入口。

### 结构
```html
<!-- index.html -->
<html>
  <body>
    <canvas id="game-canvas"></canvas>
    <!-- 只加载启动器 -->
    <script type="module" src="src/platform/web-bootstrap.js"></script>
  </body>
</html>
```

### 功能
- 加载所有模块
- 提供 Web 平台的 API 实现（localStorage、AudioContext、input 事件）
- 启动游戏

### 状态
⬜ 待开始

---

## Phase 5: 微信小游戏适配

### 目标
打包为微信小游戏格式。

### 需要处理的内容
1. 用构建工具打包为 game.js
2. 提供 WeChat 平台的 API 实现
   - wx.setStorageSync / wx.getStorageSync 代替 localStorage
   - wx.createInnerAudioContext 代替 AudioContext
   - wx.createCanvas 代替 document.createElement
   - 触摸事件代替鼠标事件
3. 生成 game.json 配置文件
4. 资源文件处理（微信小游戏需要将资源放在包内或通过 CDN 下载）

### 状态
⬜ 待开始（Phase 1-4 完成后进行）

---

## 当前阶段

**Phase 0 → Phase 1 → Phase 1.5 → Phase 2b → Phase 2c → Phase 3 → Phase 4 → Phase 5**

当前进度：Phase 3（渲染层重构）

## 已完成阶段

- ✅ Phase 0: 项目清理
- ✅ Phase 1: 全新迷宫生成器（MST + A* + 房间摆放）
- ✅ Phase 1.5: 砖块式墙体系统（_fixBrickConnections）
- ✅ Phase 2b: 核心游戏逻辑模块（player/fog/game/inventory/audio/storage）
- ✅ Phase 2c: 桥接层接入 mist.html（替换 GameMapFree）
- ⬜ Phase 3: 渲染层重构
- ⬜ Phase 4: 新版 Web 入口
- ⬜ Phase 5: 微信小游戏适配
