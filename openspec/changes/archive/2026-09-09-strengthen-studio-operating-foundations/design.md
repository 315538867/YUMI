## Context

工作室的成本、工资、订单、履约、质检与报表都使用整数分字段，但商品层仍要求负责人手填“原材料成本”和“制作胶水成本”，而产品规格明确为全局胶水单价与商品克重。当前 `app_settings` 已存在但没有服务入口；备份/恢复 IPC 已存在但 preload 与设置页没有完整 UI；应用外壳使用 `min-height: 100vh`，导致内容可以拉伸左栏。

本变更同时纠正数据模型和操作界面。所有新计算必须是前后端共用的高精度十进制计算；历史订单和已确认工资不能因升级被重算。

## Goals / Non-Goals

**Goals:**
- 固定桌面外壳滚动边界并恢复数据保护入口。
- 由工作室统一胶水单价与商品克重推导胶水成本，订单冻结完整成本依据。
- 为金额、费率和重量建立共享解析、单位转换和 HALF_UP 舍入内核。
- 将人员与时薪变为人员列表优先、按需侧栏编辑。

**Non-Goals:**
- 原料库存、日常收支自动归集订单、历史已确认工资重算、Excel 数据恢复。

## Decisions

### 1. 金额单位与 decimal.js

新增 `decimal.js`，在 `src/shared/money/` 提供：

- `parseYuanToCents(text)`：最多两位小数；
- `formatCents(cents)`：仅显示；
- `parseGluePriceYuanPerGram(text)` / `formatGluePrice...`：微元/克整数，最多六位小数；
- `parseGramsToMilligrams(text)` / `formatGrams...`：毫克整数，最多三位小数；
- `calculateGlueCostCents({ gluePriceMicroYuanPerGram, glueWeightMilligrams, quantity })`：总量运算后 HALF_UP 至分。

前端字段保留文本状态，提交时调用共享 parser；IPC/service 再次调用同一校验逻辑或接受明确整数单位。`Cents` 保持整数分 API 契约；新增 `GluePriceMicroYuanPerGram` 与 `WeightMilligrams` 类型。除共享模块外，禁止在金额路径新增 `Number()`、`parseFloat()` 和 `Math.round()`。

### 2. 数据迁移与兼容

新增 V2 迁移：

- 在 `app_settings` 写入默认键 `studio.glue_price_micro_yuan_per_gram`，值为 `0`；
- 为 `products` 新增 `glue_weight_milligrams INTEGER NOT NULL DEFAULT 0`；
- 新订单 `product_snapshot_json` 增加 `glueWeightMilligrams` 与 `gluePriceMicroYuanPerGram`；
- `process_tasks` 已有 `glue_cost_cents` 继续作为当时任务的最终整数分结果，派生时改从订单快照计算。

保留旧 `material_cost_cents` 和 `making_glue_cost_cents`，仅服务于缺少新字段的旧订单快照和旧库兼容。新商品/新订单不写入手填胶水成本；真实历史资料不回填猜测克重或单价。测试数据允许使用新模型建库。

### 3. 调用链

- 设置页面 → `useStudioSettings` → `window.yumiV2.studioSettings` → `v2:studio-settings:*` → `StudioSettingsService` → `app_settings`。
- 商品页面 → `useStudioSettings` 获取只读单价；商品表单将克重的整数单位提交 → `V2OrderService.createProduct/updateProduct` → Repository。
- 创建订单 → `V2OrderService.createProductSnapshot` 复制克重与统一单价 → `order_items.product_snapshot_json`。
- 履约/质检 → 从快照计算本批不合格数量的胶水扣款 → deduction/settlement；报表使用同一计算函数做订单聚合。
- 设置数据保护模式 → `window.yumiV2.backup.create/list/restore`；恢复确认仅传递 `confirmed: true`。

### 4. 固定壳与互斥界面

应用根设置 100% 视口高度并禁用 body 外层滚动。`yumi-app-shell` 为固定高度 flex；sidebar 固定高度且导航 `overflow-y:auto`；workspace 为两行 grid；content `overflow-y:auto`。顶部栏不进入内容滚动。

设置内部以模式状态控制单一工作区。人员页仅显示列表；`YumiSheet` 承载新建和人员资料，资料侧栏内的调整时薪为局部状态，成功后刷新列表和该人员历史。

## Risks / Trade-offs

- 旧订单没有克重与单价时无法可靠重算；因此保留旧成本字段作为兼容读路径。
- 统一金额模块增加类型转换成本，但消除前后端规则漂移。
- 迁移不删除旧列，数据库短期会有冗余；这是历史数据安全优先于清表简洁的取舍。
- 当前本机 `better-sqlite3` Node 原生绑定缺失，数据库测试会受环境阻塞；实现期间保留失败证据，并以纯逻辑/渲染定向测试、类型检查和构建验证不受影响的部分。运行完整数据库测试前须恢复原生绑定。

## Migration Plan

1. 先引入共享金额模块与单元测试。
2. 增加契约、迁移、设置服务和 IPC；迁移测试覆盖空库与已有库。
3. 更新商品、订单快照、履约/结算/报表成本调用链并增加回归测试。
4. 改造固定壳、设置与人员页，添加渲染测试。
5. 运行严格 OpenSpec 校验、静态检查、构建、可运行的定向测试；原生绑定恢复后运行全量测试。

## Open Questions

无。商品克重按单件胶水用量处理；其它原材料库存和人工裁量不属于本变更。
