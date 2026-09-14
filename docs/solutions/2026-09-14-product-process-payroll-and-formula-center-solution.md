---
title: YUMI 商品、工序、工时工资与统一公式中心改造方案
date: 2026-09-14
last_modified: 2026-09-14
modifier: Codex
solution_version: v1.1
status: 已确认，OpenSpec 提案已生成
scope: 商品资料、预计盈利、商品阶段存量、订单履约工序、负责人次日工时核算、兼职工资、统一计算公式与金额公式组件
platform: Electron 单电脑离线桌面应用
implementation_status: 未实施
openspec_change_id: redesign-product-process-payroll-and-costing
openspec_change_name: YUMI 商品、工序、工资与公式中心重构
openspec_status: 计划工件完整，严格验证通过，未授权实施
open_questions: 无阻塞项；采用一个 OpenSpec 提案，提案内部按 A、B、C、D 四个阶段组织；不设计历史业务数据迁移
---

# YUMI 商品、工序、工时工资与统一公式中心改造方案

## 1. 方案目标

本次改造把商品资料、订单工序、负责人次日核算、兼职工资和预计盈利统一到同一套业务口径中，解决当前实现与实际工作方式之间的冲突：

1. 制作岗位不再按时薪结算，只按合格数量计算提成，并按不合格数量扣除材料成本。
2. 捏毛装袋、缝边、打包发货的实际工作时长不在排班时填写，而由负责人第二天根据兼职打卡情况核算后录入。
3. 同一段工作时间只能对应一道工序，但可以在同一道工序内连续处理多个商品。
4. 缝边成为独立工序，并根据订单商品是否选择缝边决定是否经过该工序。
5. 历史存量不再作为某个订单的“期初在制品”入口，而进入商品详情中的轻量阶段存量管理。
6. 商品详情展示基于当前商品参数计算的预计单件成本、预计单件利润和预计利润率，不展示历史盈利。
7. 建立统一公式中心和金额公式组件，确保实际计算、前端预览、公式说明和设置页公式目录使用同一份定义。
8. 当前不接入 SD 卡导入；为未来联网打卡机或设备导入保留数据来源接口。

## 2. 已确认业务规则

### 2.1 工序顺序

```text
制作
  → 捏毛装袋
  → 缝边（订单商品选择缝边时进入，否则跳过）
  → 打包发货
  → 发货记录确认
```

“打包发货”是兼职岗位和工资口径中的一道工序；订单的物流发货记录、物流单号和分批发货仍由订单发货功能负责，不与工时记录合并。

### 2.2 工资口径

#### 制作

```text
制作工资
= Σ（商品制作提成 × 合格数量）
- Σ（不合格数量 × 对应商品材料成本）
```

- 制作不计算时薪。
- 合格、不合格只属于制作工序。
- 不合格材料扣款按整条结果计算，在最终金额边界四舍五入到分。

#### 捏毛装袋

```text
捏毛装袋工资
= 个人时薪 × 负责人核算时长
+ Σ（商品捏毛装袋提成 × 商品完成数量）
```

#### 缝边

```text
缝边工资
= 个人时薪 × 负责人核算时长
+ Σ（商品缝边提成 × 商品完成数量）
```

只有订单商品选择了缝边，且仍有待缝边数量时，才能录入缝边完成数量。

#### 打包发货

```text
打包发货工资
= 个人时薪 × 负责人核算时长
```

打包发货不产生计件提成，但仍需按订单商品录入完成数量，以推动订单履约数量进入待发货阶段。

### 2.3 工时与产出关系

- 排班时不要求填写最终工作时长。
- 捏毛装袋、缝边的最终完成数量不能在排班时预先确定，必须在工作完成后录入。
- 同一员工的一条工时核算记录只允许选择一道工序。
- 一条工时核算记录允许关联多个订单商品完成明细。
- 计时工资按整段核算时长计算，不把时长拆分给各个商品。
- 各商品计件提成按各自完成数量和任务冻结提成分别汇总。
- 当前只计算员工实际工资，不把实际计时工资分摊为商品历史实际利润。

## 3. 范围与非目标

### 3.1 本方案范围

1. 商品字段、商品创建页、商品详情页和商品编辑页重构。
2. 商品预计盈利实时计算和展示。
3. 全局材料克单价及三道计时工序的预计基准时薪。
4. 制作、捏毛装袋、缝边、打包发货四道岗位工序。
5. 负责人次日工时核算和多商品完成明细。
6. 工资汇总公式调整。
7. 商品阶段存量、存量流水及将商品存量投入订单的原子操作。
8. 统一计算公式中心、公式目录和金额公式展示组件。
9. 为未来打卡设备接入预留来源字段和外部记录标识。
10. 使用一个整体提案承载全部改造，并在提案内部按四个实施阶段交付。

### 3.2 明确非目标

1. 不接入 SD 卡文件导入。
2. 不直接连接当前非联网打卡机。
3. 不自动判定员工恶意延长时间，不自动扣减负责人核算时长。
4. 不做仓库、库位、批次、盘点、采购、原材料库存和库存成本计价。
5. 不做商品历史实际利润、利润趋势或按订单分摊实际计时工资。
6. 不改变订单收退款、物流单号和分批发货的既有事实记录职责。
7. 不让前端执行字符串公式，不使用 `eval` 或动态脚本解释业务公式。
8. 不迁移或兼容改造前的商品、订单快照、排班、履约、期初在制品和结算历史业务数据。

## 4. 已验证现状与主要冲突

### 4.1 可复用基础

- `src/shared/money/index.ts` 已使用整数分与 `Decimal` 实现材料金额、比例金额和分钟时薪计算，可继续作为金额精度底座。
- `src/main/domain/order-amounts.ts`、`settlement.ts`、`product-costing.ts` 已包含领域计算函数。
- `src/renderer/components/ui/metric-strip`、`YumiPageHeader`、`YumiPrimaryTabs`、`YumiSection`、`YumiDataTable` 等组件可复用到新商品工作区。
- `work_assignments`、`process_tasks`、`process_results`、`quality_inspections` 已具备排班、任务、结果和质检的基础关系。
- 订单商品已有 `edgeEnabled`、`edgeQuantity` 和 `edgeUnitPriceCents`，可以决定缝边工序数量及订单对客缝边收入。
- 商品与订单已有快照机制，适合冻结材料参数、预计时长和提成。

### 4.2 当前冲突

| 当前实现 | 冲突 |
| --- | --- |
| 工序为制作、捏毛装袋、打包、发货 | 缺少独立缝边工序，且打包与发货岗位口径未统一 |
| 非制作任务在排班时填写计划分钟 | 实际时长只能由负责人第二天根据打卡核算 |
| `process_results.actualMinutes` 位于单个商品任务结果 | 一段同工序时间可以处理多个商品，不能把整段时间重复写到每个商品 |
| 制作按标准分钟和时薪参与工资、捏毛也存在不合格逻辑 | 新规则中制作无时薪，且只有制作有合格/不合格 |
| `opening_wip_records` 必须绑定 `orderItemId` | 历史存量应属于商品，而非必须属于某个订单 |
| 商品同时保留胶水用量、单件材料重量和材料损耗率 | 新规则只保留单件材料重量，使用量与成品重量一致 |
| 商品缺少缝边提成、固定成本和三道计时工序预计时长 | 无法完整计算商品预计盈利 |
| 商品创建与详情使用 `YumiSheet` | 字段和预计盈利内容增加后，抽屉空间不足 |
| 设置页公式目录为前端硬编码，订单预览也有独立前端算法 | 公式说明、前端预览和主进程计算可能漂移 |

## 5. 总体设计

本方案只建立一个整体 OpenSpec 提案，在同一个提案的 `tasks.md` 内分为四个依次交付的阶段：

```text
A. 统一公式中心与金额公式组件
        ↓
B. 商品资料、预计盈利与全页工作区
        ↓
C. 商品阶段存量与四工序履约流转
        ↓
D. 负责人次日工时核算与工资重算
```

依赖关系：

- B 使用 A 计算并展示预计盈利。
- C 使用 B 新增的商品字段和订单快照字段。
- D 使用 A 的工资公式，并依赖 C 的新工序和完成记录结构。
- A、B、C、D 不拆成四个独立提案；需求、设计和任务在同一个提案中统一管理。
- 每个阶段完成后执行阶段验收，全部阶段完成后再对同一个提案执行最终严格验证。
- 后续阶段依赖前序阶段的已完成结果，不为阶段之间设计历史数据兼容层。

## 6. 统一公式中心

### 6.1 目录与职责

新增：

```text
src/shared/calculations/
├── types.ts                  # 公式标识、表达式节点、金额/比例计算结果
├── expression.ts             # 安全表达式构造、求值、舍入与展示数据生成
├── material-cost.ts          # 材料成本公式
├── product-profit.ts         # 商品预计成本、利润、利润率、缝边增加成本
├── wage.ts                   # 制作、计时工序和结算汇总公式
├── order-amount.ts           # 订单金额与订单预计盈利公式
├── catalog.ts                # 设置页公式目录
└── index.ts                  # 对外稳定出口
```

### 6.2 结构化公式而非字符串执行

公式由受限表达式节点组成：

- 金额常量：整数分。
- 数量、分钟、重量和比例输入。
- 加、减、乘、除。
- 分组与业务标签。
- 明确的最终舍入规则。

公式结果至少包含：

```ts
interface MoneyCalculationResult {
  formulaId: string
  formulaVersion: number
  label: string
  amountCents: number
  expression: string
  substitutedExpression: string
  breakdown: CalculationBreakdownItem[]
  notes: string[]
}
```

百分比使用独立的 `PercentageCalculationResult`，默认售价为零时返回不可计算状态，前端显示 `—`，不得产生 `Infinity` 或 `NaN`。

### 6.3 权威边界

```text
商品编辑草稿
  → renderer 直接调用 shared 公式生成实时预览
  → 保存时只提交原始字段
  → main service 使用同一 shared 公式重新校验和计算
  → repository 保存原始字段或需要冻结的快照
```

- 前端计算仅为预览。
- 主进程计算是最终可信结果。
- 不接受前端提交的派生利润、派生成本或工资总额作为可信值。

### 6.4 现有公式集中改造

- `src/main/domain/order-amounts.ts` 等调用方统一改为委托 `@shared/calculations`；是否保留原函数名只由代码组织便利决定，不作为旧数据或旧公式兼容承诺。
- `src/renderer/pages/settings/index.tsx` 删除本地 `calculationFormulaRows`，改为读取 `catalog.ts`。
- `src/renderer/pages/orders/index.tsx` 的订单草稿金额预览改用共享公式，删除重复的业务求和逻辑。
- 金额解析、格式化和比例舍入仍由 `src/shared/money/index.ts` 提供，不与公式目录混为一层。

## 7. 金额公式组件

### 7.1 组件结构

新增：

```text
src/renderer/components/ui/calculated-amount/
├── yumi-calculated-amount.tsx
├── yumi-calculated-amount.test.tsx
└── index.ts
```

组件接口：

```tsx
<YumiCalculatedAmount
  calculation={calculationResult}
  density="compact"
  showBreakdown
/>
```

组件不接收由页面自行拼接的公式字符串和金额组合，避免页面显示与领域公式脱节。

### 7.2 始终可见内容

```text
预计单件利润                         ¥13.42
默认售价 − 预计单件成本
¥35.00 − ¥21.58 = ¥13.42
```

复杂成本可继续展开组成明细。公式主干和代入值始终直接显示，不藏在仅鼠标可见的提示中；详细组成可展开收起。

### 7.3 视觉与可访问性

- 延续当前 YUMI 连续指标、细分隔线、紧凑经营页面风格，不建立卡片墙。
- 金额使用等宽数字、右对齐和统一人民币符号。
- 正利润使用成功色，负利润使用危险色，预计值使用品牌色或“预计”状态标记。
- 组件提供完整 `aria-label`，屏幕阅读器可读出名称、结果和公式。
- 打印或导出时公式文字不得依赖折叠状态或悬浮交互。

## 8. 商品模型与字段

### 8.1 商品录入字段

#### 基础资料

| 字段 | 约束 |
| --- | --- |
| 商品名称 | 必填 |
| 商品编码 | 可空 |
| 分类 | 可空 |
| 商品图片 | 可空，复用附件 |
| 默认销售单价 | 非负整数分 |
| 状态 | 启用/停用 |
| 备注 | 可空 |

#### 材料与单件成本

| 字段 | 约束与用途 |
| --- | --- |
| 单件材料重量 | 非负毫克；既是使用量也是成品材料重量 |
| 包装成本 | 非负整数分/件 |
| 配饰成本 | 非负整数分/件 |
| 替换袋成本 | 非负整数分/件 |
| 缝边耗材成本 | 非负整数分/件；只进入缝边增加成本 |
| 单件固定成本 | 非负整数分/件；负责人直接录入房租、水电、网络等分摊 |

全局材料克单价只在设置中维护，商品页面只读展示，不作为商品重复字段。

单件固定成本是负责人手工录入的预计分摊值，用于商品和新订单快照的预计成本。房租、水电、网络等实际付款仍只进入财务流水，不得自动回写商品固定成本，也不得与单件固定成本重复计入订单预计成本。

#### 提成

| 字段 | 用途 |
| --- | --- |
| 制作提成 | 制作合格数量计件 |
| 捏毛装袋提成 | 捏毛装袋完成数量计件 |
| 缝边提成 | 缝边完成数量计件 |

#### 预计时长与产能

| 字段 | 用途 |
| --- | --- |
| 预计单件制作时长 | 排产和产能参考，不进入制作工资 |
| 预计单件捏毛装袋时长 | 预计计时人工成本和工时核对参考 |
| 预计单件缝边时长 | 缝边预计计时人工成本和工时核对参考 |
| 预计单件打包发货时长 | 打包发货预计计时人工成本和工时核对参考 |
| 模具数量 | 产能计算 |
| 每模每批产出 | 产能计算 |
| 每日最大批次数 | 产能计算 |
| 日产能 | 派生字段，不手工录入 |

### 8.2 删除或退出新口径的字段

以下字段不再出现在新建和编辑界面，也不参与新商品计算：

- 单件制作胶水用量 `glueWeightMilligrams`。
- 人工材料成本 `materialCostCents`。
- 人工胶水成本 `makingGlueCostCents`。
- 材料损耗率 `materialLossRateBasisPoints`。

相关旧字段直接退出新目标模型。实施时不编写旧商品、旧订单快照的数据转换和兼容读取分支。

### 8.3 建议新增字段名

```text
products.fixed_cost_cents
products.edge_consumable_cost_cents
products.edge_sewing_commission_cents
products.expected_fluffing_bagging_minutes
products.expected_edge_sewing_minutes
products.expected_packing_minutes
```

`standard_making_minutes` 可保留存储名，界面文案改为“预计单件制作时长”。

## 9. 全局设置

在 `V2StudioSettings` 增加：

```text
fluffing_bagging_expected_hourly_wage_cents
edge_sewing_expected_hourly_wage_cents
packing_expected_hourly_wage_cents
```

用途仅限：

- 商品预计计时人工成本。
- 商品预计利润。
- 负责人核对实际工时时展示预计时长差异。

实际工资仍使用员工在工作日期生效的个人时薪，不使用上述预计基准时薪。

## 10. 商品预计盈利公式

### 10.1 预计材料成本

```text
预计单件材料成本
= 全局材料克单价 × 单件材料重量
```

底层按“微元/克 × 毫克”保持整数精度，在最终金额处四舍五入到分。

### 10.2 预计计时人工成本

```text
预计单件捏毛装袋计时工资
= 预计单件捏毛装袋分钟 ÷ 60
× 捏毛装袋预计基准时薪

预计单件缝边计时工资
= 预计单件缝边分钟 ÷ 60
× 缝边预计基准时薪

预计单件打包发货计时工资
= 预计单件打包发货分钟 ÷ 60
× 打包发货预计基准时薪
```

### 10.3 不缝边的商品预计成本

```text
预计单件成本
= 预计单件材料成本
+ 包装成本
+ 配饰成本
+ 替换袋成本
+ 单件固定成本
+ 制作提成
+ 捏毛装袋提成
+ 预计捏毛装袋计时工资
+ 预计打包发货计时工资
```

### 10.4 预计利润和预计利润率

```text
预计单件利润
= 默认销售单价 − 预计单件成本

预计利润率
= 预计单件利润 ÷ 默认销售单价
```

默认销售单价为零时，预计利润仍可显示，预计利润率显示 `—` 并说明“默认售价为零，无法计算利润率”。

### 10.5 缝边边界

商品页面额外展示：

```text
缝边预计增加成本
= 缝边耗材成本
+ 缝边提成
+ 预计单件缝边计时工资
```

商品默认销售单价不包含订单现场填写的缝边对客单价，因此商品页不虚构“含缝边预计利润”。订单录入了 `edgeUnitPriceCents` 后，订单预计盈利公式再按下式计算：

```text
订单缝边预计增量利润
= 订单缝边对客单价 − 商品缝边预计增加成本
```

这一边界避免商品预计利润把尚未确定的订单级缝边收入当成已知收入。

## 11. 商品全页工作区

### 11.1 页面结构

商品创建、查看和编辑不再使用 `YumiSheet`，改为主内容区工作页面：

```text
商品列表
  → 新建商品工作区
  → 商品详情工作区
  → 编辑商品工作区
```

详情标签：

1. 商品概览。
2. 成本与预计盈利。
3. 制作产能。
4. 商品存量。

### 11.2 顶部指标

- 默认售价。
- 预计单件成本。
- 预计单件利润。
- 预计利润率。
- 缝边预计增加成本。

所有派生金额使用 `YumiCalculatedAmount`；预计利润率使用同一计算结果体系的百分比展示组件或金额组件的通用基础组件。

### 11.3 编辑行为

- 左侧或主栏录入商品字段。
- 右侧保持“预计盈利预览”。
- 任一售价、重量、成本、提成、预计时长或全局预计时薪变化时立即重算。
- 保存时只提交原始商品字段；主进程重新校验。
- 新建、详情和编辑均提供“返回商品列表”。
- 停用确认、存量调整等短操作仍可使用对话框。

## 12. 商品阶段存量

### 12.1 定位

商品存量是“按商品和当前工序阶段统计的轻量数量账”，不是完整库存系统。

阶段：

```text
已制作，待捏毛装袋
已捏毛装袋，未缝边
已缝边，待打包发货
已打包，待发货
```

阶段按商品的物理加工状态定义。尚未绑定订单的已捏毛装袋商品不提前假设一定需要或一定不需要缝边；投入订单时再根据订单缝边需求进入待缝边或待打包发货。

### 12.2 数据结构

新增：

```text
product_stage_inventory_events
```

建议字段：

```text
id
product_id
stage
quantity_delta
source_type          # opening / order_allocation / manager_adjustment
order_item_id        # 仅投入订单时填写
occurred_on
note
created_at
```

余额由流水求和或由仓储层提供汇总查询，不允许直接覆盖一个“当前数量”而不留下事件。

### 12.3 商品详情操作

“商品存量”标签提供：

- 各阶段当前数量。
- 新增历史存量。
- 增加或减少的负责人调整。
- 最近存量流水。
- 将存量投入订单。

录入历史存量时只选择：

- 阶段。
- 数量。
- 发生日期。
- 备注。

### 12.4 投入订单

将商品存量投入订单时必须：

1. 商品与订单商品一致。
2. 阶段可用数量充足。
3. 已捏毛装袋未缝边存量按订单剩余缝边需求路由：需要缝边的进入待缝边，无需缝边的进入待打包发货。
4. 已缝边待打包发货存量只能投入仍有缝边需求的订单，并直接进入订单待打包发货。
5. 在同一数据库事务中写入商品存量负向流水和订单履约正向事件。
6. 任一步失败时全部回滚，防止商品存量减少但订单未增加。

### 12.5 原期初在制品入口处理

- 新入口从排班页移除，改到商品详情“商品存量”。
- `opening_wip_records` 不转换到新商品存量流水，也不保留新业务入口。
- 目标数据库按新模型重新建立后，只使用 `product_stage_inventory_events` 表达商品阶段存量。

## 13. 四工序履约模型

### 13.1 内部类型与界面标签

新建任务只允许：

```text
making             → 制作
fluffing_bagging   → 捏毛装袋
edge_sewing        → 缝边
packing            → 打包发货
```

原 `shipping` 岗位类型退出新模型，不再提供新建、展示或工资计算兼容分支；目标模型只保留上述四道岗位工序。

履约阶段新增 `edge_sewing`。现有内部 `packing` 阶段保留，界面文案统一改为“待打包发货”，避免无必要的数据重命名。

### 13.2 条件流转

订单商品完成捏毛装袋后：

- 未选择缝边的数量直接进入待打包发货。
- 选择缝边的数量进入待缝边。
- 若订单商品只为部分数量选择缝边，则按 `edgeQuantity` 分流；超出待缝边需求的完成数量进入待打包发货。
- 缝边完成后进入待打包发货。
- 打包发货工序完成后进入已打包待发货。
- 最终由订单发货记录把数量移动到已发货。

### 13.3 排班输入

排班只负责“谁、哪天、做哪道工序、处理哪些订单商品”，不要求负责人预知最终结果：

```text
兼职人员
安排日期
工序
订单商品任务列表
计划处理数量（可空或仅作参考）
备注
```

- 非制作任务不填写计划分钟。
- 制作预计分钟只用于排产提示，不进入制作工资。
- 捏毛装袋和缝边完成数量在次日核算时填写。

## 14. 负责人次日工时核算

### 14.1 数据模型

新增：

```text
work_time_reviews
```

建议字段：

```text
id
worker_id
worked_on
process_type
approved_minutes
hourly_wage_cents_snapshot
source_type               # manual_review / attendance_device
external_record_id        # 未来设备记录标识，当前为空
raw_started_at            # 未来设备原始上班时间，当前可空
raw_ended_at              # 未来设备原始下班时间，当前可空
status                    # draft / confirmed / voided
review_note
created_at
updated_at
```

当前 UI 固定写入：

```text
source_type = manual_review
```

未来设备接入可写入 `attendance_device`，但仍由负责人确认 `approved_minutes` 后才能进入工资。

### 14.2 工时与完成明细

一条工时核算记录：

- 只属于一个员工、一个工作日期、一道工序。
- 关联一个或多个员工、日期和工序一致的工作安排；同一工作安排最多进入一条未作废核算记录。
- 可以关联多个 `process_results`。
- 每个结果对应所关联工作安排中的一个订单商品任务和完成数量。
- `process_results.actual_minutes` 退出权威工时模型，新的计时工资只读取已确认的 `work_time_reviews`。

制作不需要创建计时记录，只提交制作结果和质检结果。

### 14.3 次日核算页面

负责人进入“排班/待核算”区域时，页面分成两类待确认事项，避免把制作结果错误地当作计时工序：

#### 制作结果确认

1. 选择员工和工作日期。
2. 逐行选择当天处理的制作任务和订单商品。
3. 填写制作完成数量、合格数量和不合格数量。
4. 系统校验“合格数量 + 不合格数量 = 制作完成数量”。
5. 确认后只生成制作计件提成和不合格材料扣款，不生成工时记录。

#### 计时工序核算

1. 选择员工和工作日期。
2. 选择一个或多个员工、日期和工序一致的工作安排，并确定捏毛装袋、缝边或打包发货中的一道实际工序。
3. 填写负责人核算后的总时长。
4. 逐行选择所关联工作安排中的订单商品并填写各商品完成数量；打包发货可登记完成明细，但不产生计件提成。
5. 查看预计时长对比和预计人效提示。
6. 确认后生成已确认工时来源，并提交关联工序完成结果。

两类事项都可以从原排班任务带出候选商品，但最终结果和工时均由负责人第二天核对后录入。

### 14.4 工时风险核对

系统不自动判定恶意行为，只提供可核对证据：

```text
预计总分钟
= Σ（各商品完成数量 × 对应商品该工序预计单件分钟）

时间差
= 负责人核算分钟 − 预计总分钟

预计效率
= 预计总分钟 ÷ 负责人核算分钟
```

页面展示：

- 负责人核算时长。
- 根据完成数量计算的预计时长。
- 时间差。
- 预计效率。
- 完成商品和数量明细。

实际时长高于预计时只显示“实际用时高于预计，请核对”的提示，不自动减少工资、不阻止负责人确认。

## 15. 工资结算重构

### 15.1 工资来源

```text
制作结果与制作质检
  → 制作提成和不合格材料扣款

已确认工时核算记录
  → 捏毛装袋、缝边、打包发货计时工资

工时记录下的商品完成明细
  → 捏毛装袋、缝边计件提成
```

### 15.2 制作工资

```text
制作应得提成
= Σ（合格数量 × 冻结制作提成）

制作材料扣款
= Σ（全局材料克单价快照
    × 商品单件材料重量快照
    × 不合格数量）

制作工资
= 制作应得提成 − 制作材料扣款
```

不再扣除制作时薪，也不再按标准制作分钟生成制作时薪。

### 15.3 计时工序工资

```text
计时工资
= Σ（已确认核算分钟 ÷ 60 × 工作日个人时薪快照）

捏毛装袋提成
= Σ（捏毛装袋完成数量 × 冻结捏毛装袋提成）

缝边提成
= Σ（缝边完成数量 × 冻结缝边提成）

打包发货提成
= 0
```

### 15.4 结算单

保留：

- 结算周期。
- 当前扣款和顺延扣款。
- 其他调整。
- 最终实发金额。
- 付款日期和财务流水。

调整：

- 不再由负责人给整张结算单填写一个模糊的 `attendanceMinutes`。
- 结算单汇总周期内已确认 `work_time_reviews`。
- 结算详情按工序显示工时、时薪、计时工资、计件数量、提成和制作材料扣款。
- 结算单只保存一套由已确认事实计算的候选应发来源汇总，不再保存排班与考勤两套参考结果；负责人仍填写最终实发金额、付款日期和备注。
- 重复确认同一工时记录必须幂等，不得重复写完成结果。
- 只有关联结果未被下游消耗且工时未进入已确认结算时，才能原子作废原工时和结果后重新核算；已被下游或确认结算引用时不得静默修改，工资差异通过后续结算中关联原工时与原结算的正负调整处理。

## 16. 快照与数据库策略

### 16.1 订单商品快照新增

下单时冻结：

- 单件材料重量。
- 全局材料克单价。
- 包装、配饰、替换袋、缝边耗材和单件固定成本。
- 制作、捏毛装袋、缝边提成。
- 四道工序预计单件时长。
- 模具与日产能参数。

### 16.2 工资快照

- 计件提成使用任务或订单商品快照中的费率。
- 制作不合格材料扣款使用任务创建时冻结的材料克单价和单件材料重量。
- 计时工资使用工作日期生效的员工时薪，并在工时核算确认时冻结。
- 后续修改商品、全局设置或员工时薪不得改写已确认记录。

### 16.3 数据库重建策略

本次不考虑历史业务数据迁移，数据库实现按“直接建立目标模型”处理：

1. 不编写旧商品、旧订单快照、旧履约、旧期初在制品和旧结算数据到新模型的复制脚本。
2. 不为旧字段、旧公式、旧 `shipping` 类型或旧 `actual_minutes` 建立兼容计算分支。
3. 商品、设置、工序、商品存量、工时核算和结算相关表可以按目标结构直接重建。
4. 实施和部署前明确执行数据库备份及重置；旧业务数据不进入新库。
5. 数据库测试只覆盖“空数据库建立最新结构”“最新结构重复启动”和新模型约束，不覆盖旧版本数据库升级。
6. 代码层仍保留业务发生时的订单商品快照与工资快照，用于新模型内部冻结费率；这不属于历史数据迁移。

## 17. 入口与调用链

### 17.1 商品预计盈利

```text
ProductsPage 商品编辑草稿
  → useProducts / shared product-profit calculator
  → YumiCalculatedAmount 实时展示
  → window.yumiV2.products.create/update 提交原始字段
  → V2OrderService.normalizeProduct
  → shared product-profit calculator 重新校验
  → V2OrderRepository 保存
```

### 17.2 商品阶段存量

```text
商品详情“商品存量”
  → useProductInventory
  → preload productInventory API
  → ProductInventoryService
  → ProductInventoryRepository
  → product_stage_inventory_events
```

投入订单：

```text
商品存量投入订单
  → ProductInventoryService.allocateToOrder
  → 校验商品、阶段、数量和订单缝边需求
  → 同一事务写商品负向流水 + fulfillment event
  → 返回商品余额和订单履约余额
```

### 17.3 次日工时核算

```text
排班“待核算”页面
  → useWorkTimeReviews
  → preload workTimeReviews API
  → WorkTimeReviewService
  → 校验同一记录单一工序、任务归属和完成数量
  → shared wage / expected-time formulas
  → WorkTimeReviewRepository + FulfillmentRepository 事务写入
```

### 17.4 工资结算

```text
工资创建结算草稿
  → SettlementService 查询周期内：
       制作结果与质检
       已确认工时核算
       工时关联完成明细
       员工时薪快照
  → shared wage formulas
  → SettlementRepository 保存结算来源与汇总
  → 负责人确认实发
  → 财务流水
```

## 18. 契约与 IPC 调整

### 18.1 商品 API

新增或调整：

```text
products.list
products.get
products.create
products.update
products.getExpectedProfit
```

编辑草稿可直接调用 shared 公式；`getExpectedProfit` 用于读取已保存商品的主进程权威结果和跨页面调用。

### 18.2 商品存量 API

```text
productInventory.getSummary(productId)
productInventory.listEvents(productId)
productInventory.recordOpening(input)
productInventory.adjust(input)
productInventory.allocateToOrder(input)
```

### 18.3 工时核算 API

```text
workTimeReviews.list(query)
workTimeReviews.get(id)
workTimeReviews.createDraft(input)
workTimeReviews.updateDraft(input)
workTimeReviews.confirm(id)
workTimeReviews.void(id, reason)
```

### 18.4 履约 API

- `createWorkAssignment` 不再要求非制作任务填写计划分钟。
- `submitProcessResult` 支持由工时核算事务统一提交多条结果。
- 质检确认接口只接受制作结果。
- 新增缝边任务和缝边完成流转。
- `recordOpeningWip` 从新契约和新 UI 中移除，由商品阶段存量 API 完全替代。

## 19. 页面状态与异常处理

### 19.1 通用状态

每个新工作区覆盖：

- 加载中。
- 空数据。
- 表单草稿。
- 保存中。
- 保存成功。
- 校验失败。
- 数据已被其他操作改变时的重新加载提示。
- 已结算或已确认记录的只读状态。

### 19.2 关键校验

- 金额、分钟、重量、数量必须为非负安全整数或可精确转换的输入。
- 完成数量不得超过对应阶段可用数量与未完成需求。
- 缝边完成数量不得超过订单缝边数量。
- 制作合格数量 + 不合格数量必须等于制作完成数量。
- 非制作工序不得提交合格、不合格字段。
- 一条工时核算记录的所有明细必须与记录工序相同。
- 一条工时核算记录只能关联员工、日期和工序一致的工作安排，同一工作安排不得重复进入未作废核算。
- 已确认工时不得直接修改。
- 重复确认工时不得重复写完成结果；已被下游或确认结算引用的工时不得直接作废。
- 商品存量投入订单必须在事务内完成双边记账。
- 默认售价为零时不得计算利润率。

## 20. 文件映射

### 20.1 新增文件

```text
src/shared/calculations/types.ts
src/shared/calculations/expression.ts
src/shared/calculations/material-cost.ts
src/shared/calculations/product-profit.ts
src/shared/calculations/wage.ts
src/shared/calculations/order-amount.ts
src/shared/calculations/catalog.ts
src/shared/calculations/index.ts

src/renderer/components/ui/calculated-amount/yumi-calculated-amount.tsx
src/renderer/components/ui/calculated-amount/yumi-calculated-amount.test.tsx
src/renderer/components/ui/calculated-amount/index.ts

src/shared/contracts/product-inventory.ts
src/shared/contracts/work-time-reviews.ts
src/main/domain/product-inventory.ts
src/main/domain/work-time-review.ts
src/main/repositories/product-inventory-repository.ts
src/main/repositories/work-time-review-repository.ts
src/main/services/product-inventory-service.ts
src/main/services/work-time-review-service.ts
src/renderer/composables/use-product-inventory.ts
src/renderer/composables/use-work-time-reviews.ts
```

### 20.2 主要修改文件

```text
src/shared/contracts/products.ts
src/shared/contracts/settings.ts
src/shared/contracts/fulfillment.ts
src/shared/contracts/settlements.ts
src/shared/contracts/v2-api.ts
src/shared/contracts/workbench.ts
src/shared/contracts/index.ts

src/shared/money/index.ts
src/main/database/v2-migrations.ts
src/main/domain/fulfillment.ts
src/main/domain/product-costing.ts
src/main/domain/settlement.ts
src/main/domain/order-amounts.ts
src/main/repositories/v2-order-repository.ts
src/main/repositories/fulfillment-repository.ts
src/main/repositories/settlement-repository.ts
src/main/services/v2-order-service.ts
src/main/services/studio-settings-service.ts
src/main/services/fulfillment-service.ts
src/main/services/settlement-service.ts
src/main/ipc/register-v2-ipc.ts
src/preload/index.ts

src/renderer/pages/products/index.tsx
src/renderer/pages/fulfillment/index.tsx
src/renderer/pages/settlements/index.tsx
src/renderer/pages/settings/index.tsx
src/renderer/pages/orders/index.tsx
src/renderer/pages/app.tsx
src/renderer/composables/use-products.ts
src/renderer/composables/use-fulfillment.ts
src/renderer/composables/use-work-assignments.ts
src/renderer/components/ui/index.ts
src/renderer/styles/components.css
```

### 20.3 重点测试文件

```text
src/shared/calculations/*.test.ts
src/shared/money/money.test.ts
src/main/database/v2-storage.test.ts
src/main/domain/product-costing.test.ts
src/main/domain/fulfillment.test.ts
src/main/domain/settlement.test.ts
src/main/services/v2-order-service.test.ts
src/main/services/fulfillment-service.test.ts
src/main/services/settlement-service.test.ts
src/main/ipc/register-v2-ipc.test.ts
src/preload/v2-api.test.ts
src/renderer/pages/reference-pages.test.tsx
src/renderer/pages/fulfillment/index.test.tsx
src/renderer/pages/settlements/index.test.tsx
src/renderer/pages/app-components.test.ts
src/main/application/v2-order-workflow.e2e.test.ts
```

## 21. 实施任务拆分

### 阶段 A：统一公式中心

1. 先为表达式求值、舍入、公式文本和组成明细编写失败测试。
2. 实现结构化表达式与金额/百分比结果类型。
3. 迁移材料成本、订单金额和时薪比例公式。
4. 建立公式目录并替换设置页硬编码目录。
5. 实现 `YumiCalculatedAmount` 和可访问性测试。
6. 替换订单草稿金额的重复前端算法。
7. 运行共享计算、设置页、订单页、类型检查和 lint。

### 阶段 B：商品资料与预计盈利

1. 为新增商品字段、设置字段和空数据库目标结构编写失败测试。
2. 增加数据库列、仓储映射、服务校验和订单快照。
3. 实现商品预计成本、利润、利润率和缝边增加成本公式。
4. 将商品创建、详情和编辑改为全页工作区。
5. 接入实时预计盈利预览和公式组件。
6. 删除新 UI 中的胶水用量、材料损耗率及旧人工成本输入。
7. 验证重置后的空数据库可以直接创建并读取新商品和新订单快照。

### 阶段 C：商品阶段存量与缝边工序

1. 建立商品阶段存量流水表和领域余额测试。
2. 实现历史存量、负责人调整和投入订单事务。
3. 在商品详情新增“商品存量”标签。
4. 增加 `edge_sewing` 工序与阶段，完成部分缝边数量分流测试。
5. 将新任务工序列表统一为四道岗位工序。
6. 从排班、契约和服务中移除原期初在制品入口。
7. 验证订单发货记录仍是最终已发货事实来源。

### 阶段 D：次日工时核算与工资

1. 建立工时核算表、状态和未来设备来源字段。
2. 实现一条工时记录关联多商品结果，禁止跨工序明细。
3. 实现预计时长、时间差和预计效率公式。
4. 改造排班页面为“安排”和“待核算”两个职责明确的区域。
5. 将质检限制为制作工序。
6. 重写工资来源汇总：制作计件减材料、两道工序计时加计件、打包发货仅计时。
7. 将结算单总考勤分钟改为已确认工时记录汇总。
8. 完成全流程 E2E：订单 → 四工序 → 次日核算 → 工资确认 → 财务流水。

## 22. 测试与验收矩阵

| 场景 | 预期 |
| --- | --- |
| 商品修改重量 | 预计材料成本、预计成本、预计利润同步变化，公式代入值一致 |
| 商品修改预计捏毛时长 | 预计捏毛计时工资和预计利润同步变化 |
| 默认售价为零 | 预计利润可显示，利润率为 `—` |
| 订单未选择缝边 | 捏毛完成数量直接进入待打包发货 |
| 订单全部选择缝边 | 捏毛完成数量进入待缝边，缝边后进入待打包发货 |
| 订单部分数量缝边 | 数量按 `edgeQuantity` 分流且不超量 |
| 一段捏毛工时处理两个商品 | 时薪只计算一次，两种商品提成分别汇总 |
| 制作结果有不合格 | 不产生制作时薪；按合格计提成，按不合格扣材料成本 |
| 捏毛或缝边结果 | 不出现合格/不合格字段 |
| 打包发货工时 | 只产生时薪，不产生计件提成 |
| 实际核算时长高于预计 | 显示核对提示，但允许负责人确认 |
| 同一工作安排重复核算 | 拒绝创建第二条未作废工时核算 |
| 同一工时重复确认 | 返回原确认结果，不重复增加完成数量或工资来源 |
| 未被下游或结算引用的已确认工时更正 | 原子作废工时及关联结果后重新核算 |
| 已被下游或确认结算引用的工时更正 | 拒绝直接作废，要求先处理下游履约或在后续结算中建立来源关联调整 |
| 商品历史存量投入订单 | 商品余额减少与订单履约增加在同一事务完成 |
| 投入数量超过余额 | 整体失败，双方数量均不改变 |
| 修改当前商品提成 | 已创建订单和已确认任务继续使用冻结费率 |
| 设置页公式目录 | 与实际公式定义来自同一注册表 |
| 前端篡改派生金额 | 主进程忽略并按原始输入重新计算 |

## 23. 验证命令

每个阶段至少运行：

```bash
pnpm exec vitest run <本阶段相关测试文件>
pnpm run typecheck
pnpm run lint
pnpm run format:check
git diff --check
```

全部阶段完成后运行：

```bash
pnpm test
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run build
openspec validate <对应变更名> --strict
```

如果 `better-sqlite3` 因 Electron ABI 与系统 Node ABI 不一致导致测试失败，应按项目既有验证方式使用 Electron Node 运行同一 Vitest 套件，并记录实际命令和输出；不得把 ABI 环境失败误报为业务测试通过。

## 24. 风险与控制

### 24.1 公式集中改造范围大

控制：在同一提案的阶段 A 中一次建立共享公式出口，再按调用链逐项替换；每条公式以输入、结果、公式文本和舍入结果四类断言锁定。

### 24.2 数据库重建造成原数据清空

控制：在实施说明和部署操作中明确“先备份、再重置、旧数据不导入”；重建前要求人工确认备份文件存在，避免把“不迁移”误操作成“无备份删除”。

### 24.3 工时重复计算

控制：一条已确认工时记录在一个结算周期内只能被一个有效结算来源引用；结算仓储建立唯一约束或显式排除已引用记录。

### 24.4 商品存量与订单履约双边不一致

控制：只允许通过领域服务事务执行投入订单，不开放分别修改两边余额的 API。

### 24.5 预计时长不等于真实时长

控制：页面始终使用“预计”字样；预计值只用于商品预计盈利和负责人核对，不自动改变员工实际工资。

### 24.6 单提案改动面较大

控制：虽然只使用一个提案，但 `tasks.md` 必须按 A、B、C、D 分阶段设置清晰检查点；前一阶段的测试和验收未通过，不进入后一阶段。

## 25. 验收标准

1. 商品创建和详情均为主内容区全页工作区，不再使用抽屉承载完整商品表单和详情。
2. 商品只录入单件材料重量，不再录入单件制作胶水用量和材料损耗率。
3. 商品可维护单件固定成本、缝边提成和三道计时工序预计单件时长。
4. 商品详情显示预计单件成本、预计单件利润、预计利润率和缝边预计增加成本，并直接显示公式及代入值。
5. 设置页可维护三道计时工序的预计基准时薪；实际工资仍使用员工个人时薪。
6. 工序顺序为制作、捏毛装袋、条件缝边、打包发货。
7. 排班时不要求填写最终工时和最终完成数量。
8. 负责人可在第二天录入一段单工序核算时长，并在同一记录中登记多个商品完成数量。
9. 制作工资不含时薪，只按合格数量计提成并按不合格数量扣材料成本。
10. 捏毛装袋和缝边工资为核算时薪加完成数量提成；打包发货只有核算时薪。
11. 只有制作显示合格和不合格字段。
12. 商品历史存量在商品详情维护，不再要求先绑定排班订单；投入订单时双边数量原子更新。
13. 当前无 SD 卡导入入口；工时来源保留 `manual_review` 与未来 `attendance_device` 扩展口。
14. 公式计算、公式目录、前端预览和金额公式组件来自同一份结构化公式定义。
15. 同一个 OpenSpec 提案内的四个阶段全部完成，且全量测试、类型检查、lint、格式检查、构建和严格验证通过后，才可声明实施完成。

## 26. 提案状态与实施授权门

本方案已经确认，并已生成一个 OpenSpec 提案：

```text
提案名称：YUMI 商品、工序、工资与公式中心重构
Change ID：redesign-product-process-payroll-and-costing
组织方式：同一提案内按 A、B、C、D 四个阶段实施
数据策略：不迁移或兼容旧业务数据
计划状态：proposal、specs、design、tasks 完整，严格验证通过
实施状态：未实施
```

生成提案只代表计划授权，不代表业务代码实施授权。下一步必须由用户再次明确授权实施，之后才能执行：

```bash
openspec instructions apply --change redesign-product-process-payroll-and-costing
```

实施时严格按照同一份 `tasks.md` 的阶段顺序推进；归档仍需单独授权。
