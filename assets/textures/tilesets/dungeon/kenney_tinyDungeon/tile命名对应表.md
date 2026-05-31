# Kenney Tiny Dungeon Tileset - Tile 命名对应表

> 命名规范：`类别_材质_位置_变体`。方向用 `tl/tr/bl/br`（四角），`l/r`（左右），`h/v`（水平/垂直）。

---

## Row 0（墙体顶部·凹角·凸角·门洞）

| Index | 文件 | 规范命名 | 用途说明 |
|-------|------|---------|---------|
| 0 | tile_0000.png | `wall_stone_top_center_01` | 墙体顶部中心填充 |
| 1 | tile_0001.png | `wall_stone_top_inner_tl` | 墙体顶部凹角，右侧+下方是墙，左上暴露 |
| 2 | tile_0002.png | `wall_stone_top_edge_h` | 墙体顶部水平边缘，上方是地面 |
| 3 | tile_0003.png | `wall_stone_top_inner_tr` | 墙体顶部凹角，左侧+下方是墙，右上暴露 |
| 4 | tile_0004.png | `wall_stone_top_outer_tl` | 墙体顶部凸角，右侧+下方是墙，左上暴露 |
| 5 | tile_0005.png | `wall_stone_top_outer_tr` | 墙体顶部凸角，左侧+下方是墙，右上暴露 |
| 6 | tile_0006.png | `wall_stone_top_to_pillar` | 墙体顶部与立面柱子的衔接格 |
| 7 | tile_0007.png | `wall_stone_front_statue_small_dry` | 墙体立面装饰，未流水小雕像 |
| 8 | tile_0008.png | `wall_stone_front_statue_small_wet` | 墙体立面装饰，流水小雕像 |
| 9 | tile_0009.png | `wall_stone_front_doorway_open_1w` | 墙体立面单格门洞，无门板 |
| 10 | tile_0010.png | `wall_stone_front_doorway_open_2w_l` | 墙体立面双格门洞左格，无门板 |
| 11 | tile_0011.png | `wall_stone_front_doorway_open_2w_r` | 墙体立面双格门洞右格，无门板 |

---

## Row 1（墙体侧边·立面装饰·门）

| Index | 文件 | 规范命名 | 用途说明 |
|-------|------|---------|---------|
| 12 | tile_0012.png | `wall_stone_top_center_02` | 墙体顶部中心变体，泥土小坑 |
| 13 | tile_0013.png | `wall_stone_top_side_r` | 墙体顶部右侧边，右侧是地面 |
| 14 | tile_0014.png | `wall_stone_front_center_damaged` | 墙体立面中间格变体，脱落砖块 |
| 15 | tile_0015.png | `wall_stone_top_side_l` | 墙体顶部左侧边，左侧是地面 |
| 16 | tile_0016.png | `wall_stone_top_side_to_front_l` | 墙体顶部左侧边与立面左侧边的衔接 |
| 17 | tile_0017.png | `wall_stone_top_side_to_front_r` | 墙体顶部右侧边与立面右侧边的衔接 |
| 18 | tile_0018.png | `wall_stone_front_pillar` | 墙体立面柱子，与 tile_0006 配对 |
| 19 | tile_0019.png | `wall_stone_front_statue_large_dry` | 墙体立面装饰，未流水大雕像 |
| 20 | tile_0020.png | `wall_stone_front_statue_large_wet` | 墙体立面装饰，流水大雕像 |
| 21 | tile_0021.png | `wall_stone_front_door_open_1w` | 墙体立面单格门，门板全开 |
| 22 | tile_0022.png | `wall_stone_front_door_open_2w_l` | 墙体立面双格门左格，门板全开 |
| 23 | tile_0023.png | `wall_stone_front_door_open_2w_r` | 墙体立面双格门右格，门板全开 |

---

## Row 2（墙体凹角·上边缘·立面装饰·地面·门）

| Index | 文件 | 规范命名 | 用途说明 |
|-------|------|---------|---------|
| 24 | tile_0024.png | `wall_stone_top_center_03` | 墙体顶部中心变体，碎石头 |
| 25 | tile_0025.png | `wall_stone_top_inner_bl` | 墙体顶部凹角，右侧+上方是墙，左下暴露 |
| 26 | tile_0026.png | `wall_stone_top_edge_h_02` | 墙体顶部上边缘，上方是地面 |
| 27 | tile_0027.png | `wall_stone_top_inner_br` | 墙体顶部凹角，左侧+上方是墙，右下暴露 |
| 28 | tile_0028.png | `wall_stone_front_center_window` | 墙体立面中间格变体，带栏杆窥视孔 |
| 29 | tile_0029.png | `wall_stone_front_center_flag` | 墙体立面中间格变体，橙色小旗 |
| 30 | tile_0030.png | `floor_pillar` | 地面，与立面柱子专用衔接 |
| 31 | tile_0031.png | `floor_pool_open_dry` | 地面，敞开水池（无水） |
| 32 | tile_0032.png | `floor_pool_open_wet` | 地面，敞开水池（流水） |
| 33 | tile_0033.png | `wall_stone_front_door_half_1w` | 墙体立面单格门，门板半开 |
| 34 | tile_0034.png | `wall_stone_front_door_half_2w_l` | 墙体立面双格门左格，门板半开 |
| 35 | tile_0035.png | `wall_stone_front_door_half_2w_r` | 墙体立面双格门右格，门板半开 |

---

## Row 3（台阶·立面·陷阱·地面·门）

| Index | 文件 | 规范命名 | 用途说明 |
|-------|------|---------|---------|
| 36 | tile_0036.png | `stair_stone_l` | 石头台阶左侧边 |
| 37 | tile_0037.png | `stair_stone_center` | 石头台阶中间段 |
| 38 | tile_0038.png | `stair_stone_r` | 石头台阶右侧边 |
| 39 | tile_0039.png | `stair_stone_single` | 单格石头台阶，可纵向连续拼接 |
| 40 | tile_0040.png | `wall_stone_front_center` | 墙体立面中间格（默认款） |
| 41 | tile_0041.png | `floor_trap_spike` | 地面尖刺陷阱 |
| 42 | tile_0042.png | `floor_variant_stone` | 地面变体，小石块 |
| 43 | tile_0043.png | `floor_pool_rail_dry` | 地面，带栏杆水池（无水） |
| 44 | tile_0044.png | `floor_pool_rail_wet` | 地面，带栏杆水池（流水） |
| 45 | tile_0045.png | `wall_stone_front_door_closed_1w` | 墙体立面单格门，门板全关 |
| 46 | tile_0046.png | `wall_stone_front_door_closed_2w_l` | 墙体立面双格门左格，门板全关 |
| 47 | tile_0047.png | `wall_stone_front_door_closed_2w_r` | 墙体立面双格门右格，门板全关 |

---

## Row 4（地面·阴影地面·矿车·立面边缘）

| Index | 文件 | 规范命名 | 用途说明 |
|-------|------|---------|---------|
| 48 | tile_0048.png | `floor_01` | 地面（默认款） |
| 49 | tile_0049.png | `floor_02` | 地面变体，碎石头 |
| 50 | tile_0050.png | `floor_shadow_n` | 地面，上方有阴影（阴影侧朝向墙体，可旋转适配左/右墙） |
| 51 | tile_0051.png | `floor_shadow_n_stone` | 地面，上方有阴影变体，碎石头 |
| 52 | tile_0052.png | `floor_shadow_inner` | 地面，上方+右侧双阴影（适配墙体凹角，可旋转） |
| 53 | tile_0053.png | `floor_shadow_outer` | 地面，左上角阴影（适配墙体凸角，可旋转） |
| 54 | tile_0054.png | `cart_mine_h` | 横向移动的矿车 |
| 55 | tile_0055.png | `cart_mine_v` | 纵向移动的矿车 |
| 56 | tile_0056.png | `cart_mine_diag` | 45° 斜向移动的矿车 |
| 57 | tile_0057.png | `wall_stone_front_edge_l` | 墙体立面左边缘 |
| 58 | tile_0058.png | `wall_stone_front_1w` | 单格宽墙体立面，可纵向连续拼接 |
| 59 | tile_0059.png | `wall_stone_front_edge_r` | 墙体立面右边缘 |

---

## 快速索引（名称 → tile 文件）

```
wall_stone_top_center_01          → tile_0000
wall_stone_top_inner_tl           → tile_0001
wall_stone_top_edge_h             → tile_0002
wall_stone_top_inner_tr           → tile_0003
wall_stone_top_outer_tl           → tile_0004
wall_stone_top_outer_tr           → tile_0005
wall_stone_top_to_pillar          → tile_0006
wall_stone_front_statue_small_dry → tile_0007
wall_stone_front_statue_small_wet → tile_0008
wall_stone_front_doorway_open_1w  → tile_0009
wall_stone_front_doorway_open_2w_l → tile_0010
wall_stone_front_doorway_open_2w_r → tile_0011
wall_stone_top_center_02          → tile_0012
wall_stone_top_side_r             → tile_0013
wall_stone_front_center_damaged   → tile_0014
wall_stone_top_side_l             → tile_0015
wall_stone_top_side_to_front_l    → tile_0016
wall_stone_top_side_to_front_r    → tile_0017
wall_stone_front_pillar           → tile_0018
wall_stone_front_statue_large_dry → tile_0019
wall_stone_front_statue_large_wet → tile_0020
wall_stone_front_door_open_1w     → tile_0021
wall_stone_front_door_open_2w_l   → tile_0022
wall_stone_front_door_open_2w_r   → tile_0023
wall_stone_top_center_03          → tile_0024
wall_stone_top_inner_bl           → tile_0025
wall_stone_top_edge_h_02          → tile_0026
wall_stone_top_inner_br           → tile_0027
wall_stone_front_center_window    → tile_0028
wall_stone_front_center_flag      → tile_0029
floor_pillar                      → tile_0030
floor_pool_open_dry               → tile_0031
floor_pool_open_wet               → tile_0032
wall_stone_front_door_half_1w     → tile_0033
wall_stone_front_door_half_2w_l   → tile_0034
wall_stone_front_door_half_2w_r   → tile_0035
stair_stone_l                     → tile_0036
stair_stone_center                → tile_0037
stair_stone_r                     → tile_0038
stair_stone_single                → tile_0039
wall_stone_front_center           → tile_0040
floor_trap_spike                  → tile_0041
floor_variant_stone               → tile_0042
floor_pool_rail_dry               → tile_0043
floor_pool_rail_wet               → tile_0044
wall_stone_front_door_closed_1w   → tile_0045
wall_stone_front_door_closed_2w_l → tile_0046
wall_stone_front_door_closed_2w_r → tile_0047
floor_01                          → tile_0048
floor_02                          → tile_0049
floor_shadow_n                    → tile_0050
floor_shadow_n_stone              → tile_0051
floor_shadow_inner                → tile_0052
floor_shadow_outer                → tile_0053
cart_mine_h                       → tile_0054
cart_mine_v                       → tile_0055
cart_mine_diag                    → tile_0056
wall_stone_front_edge_l           → tile_0057
wall_stone_front_1w               → tile_0058
wall_stone_front_edge_r           → tile_0059
```

---

## 类别速查

| 类别 | 前缀 | tile 范围 | 数量 |
|------|------|----------|------|
| 墙体顶部中心 | `wall_stone_top_center_` | 0000, 0012, 0024 | 3 |
| 墙体顶部凹角 | `wall_stone_top_inner_` | 0001, 0003, 0025, 0027 | 4 |
| 墙体顶部凸角 | `wall_stone_top_outer_` | 0004, 0005 | 2 |
| 墙体顶部边缘/侧边 | `wall_stone_top_edge_` / `_side_` | 0002, 0013, 0015, 0026 | 4 |
| 墙体顶部→立面衔接 | `wall_stone_top_*_to_front` / `_to_pillar` | 0006, 0016, 0017 | 3 |
| 墙体立面中间格 | `wall_stone_front_center*` | 0014, 0028, 0029, 0040 | 4 |
| 墙体立面柱子 | `wall_stone_front_pillar` | 0018 | 1 |
| 墙体立面装饰 | `wall_stone_front_statue_` / `_deco_` | 0007, 0008, 0019, 0020 | 4 |
| 墙体立面边缘 | `wall_stone_front_edge_` | 0057, 0059 | 2 |
| 墙体立面单格 | `wall_stone_front_1w` | 0058 | 1 |
| 门洞/门 | `wall_stone_front_door*` / `_doorway_` | 0009~0011, 0021~0023, 0033~0035, 0045~0047 | 12 |
| 地面 | `floor_` | 0030, 0048, 0049 | 3 |
| 地面（阴影） | `floor_shadow_` | 0050, 0051, 0052, 0053 | 4 |
| 地面（陷阱/水池/石块） | `floor_` | 0031, 0032, 0041~0044 | 6 |
| 石头台阶 | `stair_stone_` | 0036~0039 | 4 |
| 矿车 | `cart_mine_` | 0054~0056 | 3 |