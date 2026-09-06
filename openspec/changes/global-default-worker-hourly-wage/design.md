# 全局默认兼职时薪设计

- 方案来源：`docs/solutions/2026-09-06-global-default-worker-hourly-wage-solution.md` v1.0
- Change ID：`global-default-worker-hourly-wage`
- 状态：已完成

## 决策

1. 在现有版本化 `cost_settings_history` 中新增默认兼职时薪，而非在兼职人员表增加全局特殊记录。
2. 商品成本预览的时薪来源收敛为服务端成本设置；删除预览 IPC 入参中的临时时薪，避免客户端绕过标准口径。
3. 订单商品 JSON 快照保存默认兼职时薪并用于预计成本；旧快照读取缺失字段时按 0 处理。
4. 实际成本继续读取排班人员时薪历史，不使用全局默认时薪。

## 数据流

设置页面 → `settings:cost:update` → 成本设置历史记录 → `products:preview-cost` 读取当前设置 → 商品预估结果。

创建/更新订单 → 当前成本设置 → `ProductOrderSnapshot.defaultHourlyWageCents` → 订单商品 `estimatedCostCents`。

实际制作登记 → 人员时薪历史 → `actualLaborCostCents`（无变化）。

## 迁移与兼容性

新增数据库迁移，为 `cost_settings_history.default_hourly_wage_cents` 设置 `NOT NULL DEFAULT 0`。由于成本设置与订单商品快照是可扩展记录，旧数据以 0 兼容读取；不回填、不回算。

## 验证策略

- 服务测试：设置保存与读取、商品预览采用全局时薪、拒绝废弃临时时薪入参、订单历史快照不受设置变更影响。
- 数据库测试：迁移后默认值可读取。
- 渲染测试：设置页和两种商品预览均显示全局时薪，不保留临时预估时薪输入。
- 全量：类型检查、lint、测试、构建、OpenSpec 严格校验。
