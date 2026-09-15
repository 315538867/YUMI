# YUMI UI 组件库与自定义业务组件规范方案

- **方案版本**：v1.0
- **设计时间**：2026-09-15
- **修改人**：Codex
- **前置方案**：
  - `2026-09-08-yumi-design-system-ui.md`（v1.1：视觉令牌与基础组件）
  - `2026-09-10-yumi-operating-ui-design-standard-v2-solution.md`（v2.71：经营页面模式、动作归属、术语、反馈语义；已归档）
- **状态**：审计完成；P1–P7 已全部整改落地并通过定向回归；P8 属未提交的财务总览 WIP，由负责人合并前整改。

## 0. 为什么立规

负责人提出“治理一下 ui 库和自定义组件的规范和标准”。此前两套方案已覆盖视觉令牌、页面模式、动作层级与表单反馈语义，但组件库内部与自定义业务组件之间仍缺少一份“边界与复用契约”，导致：

1. 同一视觉职责存在两套写法（例如记录操作条既用共享 `YumiRecordActionBar`，又有人手拼 `yumi-record-action-bar` 类）；
2. 样式归属不一致（部分业务样式写进共享 `components.css`，部分写进 `pages.css`）；
3. 日期录入不统一（同一页面同时出现 `YumiDatePicker` 和用 `YumiTextField` 手输日期）；
4. 反馈语义边界需要固化（字段级内联轻量红字、内容级 toast、辅助说明 hint）。

本方案不重写组件，也不改变业务口径；只把“已存在的事实 + 期望的边界”写成可审查、可测试的规范。

## 1. 现状盘点（2026-09-15）

### 1.1 共享组件库（`src/renderer/components/ui/`，28 个导出）

全部有独立测试文件，出口在 `src/renderer/components/ui/index.ts`：

| 类别 | 组件 | 关键契约 |
| --- | --- | --- |
| 动作 | `YumiButton` / `YumiIconButton` | variant `primary/secondary/ghost/danger`；`loading` 转禁用 + spinner；`type` 默认 `button` |
| 动作 | `YumiActionMenu` | 收纳低频操作；键盘上下/Home/End/Esc |
| 动作 | `YumiRecordActionBar` | 记录行具名操作条；不得折叠成“更多” |
| 布局 | `YumiPageHeader` / `YumiPageActions` | 页头层级：context → secondaryAction/visibleActions → menu → primaryAction；一页一个 primary |
| 布局 | `YumiSection` / `YumiRecordSummary` | 区块头（title/description/status/actions）；摘要头 + 整行指标 |
| 布局 | `YumiListSurface` / `YumiListToolbar` | 单一列表容器；工具条只承载检索/筛选/计数 |
| 布局 | `YumiFormSection` / `YumiDetailList` / `YumiEntitySummary` | 资料分组、只读描述列表、实体主体摘要 |
| 表格 | `YumiDataTable` | 必填 `ariaLabel`、`getRowKey`；密度 compact/comfortable；空态 `role=status` |
| 列表 | `YumiBusinessList` | 经营记录列表（历史保留，报表外已基本不再使用） |
| 表单 | `YumiField` / `YumiFieldLabel` / `YumiField` 系列控件 | `error` 内联轻量红字 + 预留消息槽；`hint` 同槽位；`aria-invalid/describedby` 自动接 |
| 表单 | `YumiSelect` / `YumiSearchSelect` | Radix Select / Popover 可搜索；均经 `useYumiFieldAccessibility` |
| 表单 | 日期族（`YumiDatePicker` / `YumiDateRangePicker` / `YumiDateTimePicker` / `YumiDateTimeRangePicker` / `YumiMonthPicker` / `YumiTimeField`） | 中文格式；日期输入一律经此族 |
| 反馈 | `YumiFormMessage` | tone `error/hint`；error `role=alert` |
| 反馈 | `YumiNotification` / `useYumiNotificationMessage` | danger 常驻（timeout 0）、warning 5s、其余 3s；danger `role=alert` |
| 反馈 | `YumiEmptyState` | scenario default/filter/first-use/prerequisite/loading |
| 状态 | `YumiStatusTag` / `YumiMetricStrip` / `YumiCalculatedAmount` / `YumiTaskRateSummary` | 状态胶囊；连续指标带；金额计算呈现；任务费率摘要 |
| 导航 | `YumiPrimaryTabs` / `YumiSegmentedTabs` | 一级下划线 / 二级分段；nav+button，非 tablist |
| 浮层 | `YumiDialog` / `YumiConfirmDialog` / `YumiSheet` | 弹窗、确认、抽屉（dirty 放弃确认） |
| 其他 | `YumiSnapshotNotice` / `YumiDocumentPreview` / `YumiDetailList` 等 | 快照提示、单据预览 |

### 1.2 自定义业务组件（`src/renderer/components/<domain>/`）

| 组件 | 复用情况 |
| --- | --- |
| `fulfillment/dispatch-views.tsx`（周历、派工抽屉、安排详情） | 全部组合共享组件；周历样式在 `pages.css`；`data-tone` 用人员识别令牌 |
| `fulfillment/work-time-review-panel.tsx` / `-forms.tsx`（待核算/已核算/核算弹窗） | 全部组合共享组件；样式已随 P3 迁至 `pages.css` |
| `after-sales/after-sales-panel.tsx` | 组合共享组件；错误统一字段内联 + toast |
| `settlement/settlement-detail.tsx` | 组合共享组件；确认错误 toast，草稿校验用 hint |
| `product/product-inventory-panel.tsx` | 组合共享组件；日期已改 `YumiDatePicker`（P2）；记录操作条已复用 `YumiRecordActionBar`（P1） |

页面内嵌复合组件（`pages/fulfillment` 等的周历/派工）与 `pages/numeric-text-field.tsx`（数字草稿输入，正确包裹 `YumiTextField`）已纳入本节边界。

### 1.3 发现的问题清单

| 编号 | 问题 | 位置 | 性质 |
| --- | --- | --- | --- |
| P1 | 记录/区块操作条手拼 `className="yumi-record-action-bar"`，未复用 `YumiRecordActionBar` 组件 | `work-time-review-panel.tsx:342`、`product-inventory-panel.tsx:174` | 复用边界 |
| P2 | 商品存量的“发生日期”用 `YumiTextField` 手输，而非 `YumiDatePicker`；与 v1.1 §3.3 冲突 | `product-inventory-panel.tsx:291/353/433` | 控件口径 |
| P3 | 业务样式归属不一致：`.yumi-work-time-review__*`、`.yumi-product-workspace` 写在共享 `components.css`，而 `.yumi-worker-week__*`、`.yumi-settlement-detail` 在 `pages.css` | `components.css:1667-1731` | 样式归属 |
| P4 | 时间四字段用 `<label>` 包裹已带 `aria-label` 的控件，label 无 `htmlFor`，关联不成立 | `work-time-review-forms.tsx:471-498` | 可访问性 |
| P5 | `YumiDialog` 有 `aria-describedby={description ? undefined : undefined}` 死代码；Radix 已自动关联描述 | `yumi-dialog.tsx:32` | 组件库清理 |
| P6 | 通知关闭图标用文本 `×`，与弹窗/抽屉的 Lucide `X` 不一致 | `yumi-notification.tsx:53` | 组件库一致性 |
| P7 | `YumiPageActions` 同时有 `secondaryAction` 与 `visibleActions` 两个近似入口 | `yumi-page-header.tsx` | API 收敛 |
| P8 | 未提交的财务总览 WIP 引入了 `pages.css` 的 `rgba()` 与报表页 `YumiMetricStrip` 缺口，导致现有护栏 2 项失败 | `pages.css:1409`、`reports/index.tsx` | 待合并前整改 |

## 2. 组件库规范（共享组件）

### 2.1 通用约定

1. **命名**：文件与组件统一 `yumi-*`（组件 `YumiXxx`，样式类 `yumi-xxx`）；禁止业务页创建平行同名组件。
2. **props 约定**：
   - 控制密度统一用 `density?: 'compact' | 'comfortable'`（来自 `YumiDensity`）；
   - 需要向辅助技术命名的容器必填 `ariaLabel`（表格、工具条、指标带、摘要、描述列表、标签组）；
   - 受控输入统一 `value` + `onValueChange`（选择/日期族）或原生 `value/onChange`（文本/数字）；
   - 禁用用 `disabled`，异步提交用 `loading`（自动禁用），不要自造 `busy`/`submitting` 之外的视觉态。
3. **错误与提示**：
   - 字段级校验错误 → `YumiField error={...}`，渲染为轻量红字并预留消息槽，不出现边框/红底横幅；
   - 非字段的内容级/服务端错误 → `useYumiNotificationMessage(error)` toast；
   - 辅助说明/状态文案 → `YumiFormMessage tone="hint"`，不得使用 `error` 表达提示；
   - 反馈必须经 `YumiFormMessage`，业务页不得自拼 `yumi-form-error` 等私有类。
4. **键盘与焦点**：浮层支持 Esc、外部点击、焦点回归；方向键导航见 `yumi-tabs` / `yumi-action-menu`；全局 `focus-visible` 与 `--yumi-focus-ring` 已由 `base.css` 保证。
5. **样式归属**：共享组件自身的样式契约写入 `components.css`，且只消费语义/布局令牌（现状护栏已锁：两文件不得出现裸色值）。

### 2.2 反馈语义决策表

| 场景 | 呈现 | 承载 |
| --- | --- | --- |
| 字段值不合法（提交后） | 字段下方轻量红字 | `YumiField error` |
| 交互级错误（服务端拒绝、动作失败） | 全局右上角 toast，danger 常驻 | `useYumiNotificationMessage` |
| 辅助说明、上限提示、状态说明 | 字段/区块内弱文字 | `YumiFormMessage tone="hint"` |
| 成功反馈 | toast（success，3s） | `useYumiNotificationMessage(..., { tone: 'success' })` |
| 加载/空态 | `YumiEmptyState`；轻量行内加载用 hint | `YumiEmptyState` / `YumiFormMessage` |

## 3. 自定义业务组件规范

### 3.1 边界

1. **目录**：领域复合组件放 `src/renderer/components/<domain>/`，页面只负责装配与数据流；
2. **复用优先**：按钮、选择、日期、弹窗、抽屉、表格、状态标签、摘要、指标带、描述列表、资料分组、空态、反馈必须来自 `../ui` 共享出口；
3. **记录操作条**：记录行/区块的具名操作必须用 `YumiRecordActionBar`，不得手拼 `yumi-record-action-bar` 类；
4. **日期口径**：交期、付款日、发货日、发生日期等日期值一律用 `YumiDatePicker` 族，不得用 `YumiTextField` 手输；
5. **样式**：业务/领域样式写入 `pages.css`（类名 `yumi-<domain>-<name>`），只消费令牌；共享 `components.css` 只容纳共享组件契约；
6. **禁止项**：业务组件不得出现原生 `<button>/<select>/<input>/<textarea>`（搜索输入等共享组件内部除外）、不得写裸色值、不得自拼反馈类、不得重复造 Tab/页头/表格容器。

### 3.2 可访问性补充

- 复合字段用 `YumiFieldLabel` + `htmlFor`/`aria-label` 关联，不要用“label 包裹带 aria-label 控件”的无效关联（P4）；
- 表格行内控件必须有可访问名称（现有样例已用 `aria-label={`${订单号} ${商品} 完成数量`}`）。

## 4. 护栏测试（测试锁定规范）

现有 `src/renderer/pages/app-components.test.ts` 已锁定：应用壳装配、composable 数据源、`YumiListSurface`、`YumiFormMessage` 反馈、`YumiPageHeader` 结构化动作、主/次 Tab、实体摘要、共享指标带、空状态、原生控件禁令、令牌分层与裸色值禁令、焦点与数字阅读规则。

本轮新增/拟新增：

1. **记录操作条复用**：业务组件不得出现 `className="yumi-record-action-bar"`；改用 `YumiRecordActionBar` 后补充该断言（需先修 P1）。
2. **反馈来源**：自定义业务组件（work-time-review-panel、dispatch-views、settlement-detail、product-inventory-panel、after-sales-panel）必须经 `YumiField error` 或 `useYumiNotificationMessage`，不允许残留内联 `tone="error"` 横幅逻辑。
3. **共享样式归属**：`components.css` 只允许共享组件类（可选，保守起见以文档约定为主，不硬卡业务类）。
4. **日期口径**（拟）：业务组件中出现“发生日期”等日期字段不得以 `YumiTextField` 呈现（需先修 P2，涉及交互变化，先讨论）。

## 5. 待整改清单与决策

| 编号 | 建议动作 | 是否需先讨论 |
| --- | --- | --- |
| P1 | 两处手拼操作条改为 `YumiRecordActionBar`（渲染结果不变） | 否（小改动，随护栏一起做） |
| P5 | 删除 `yumi-dialog.tsx` 死代码 `aria-describedby` 行 | 否（小改动） |
| P6 | 通知关闭图标改 Lucide `X`，与弹窗/抽屉一致 | 否（小改动） |
| P3 | 迁移 `.yumi-work-time-review__*` / `.yumi-product-workspace` 到 `pages.css`，或接受为已记录债 | 已完成（2026-09-15） |
| P2 | 商品存量“发生日期”改 `YumiDatePicker` | 已完成（2026-09-15） |
| P4 | 时间四字段 label 关联修正 | 已完成（2026-09-15） |
| P7 | `secondaryAction` 与 `visibleActions` 收敛为一个入口 | 已完成（2026-09-15） |
| P8 | 财务总览 WIP 合并前整改，消除现有 2 项护栏失败 | 是（他人/未提交工作，不代改） |

## 7. 实施结果（2026-09-15）

### 已落地

1. **P1 记录操作条复用**：`work-time-review-panel.tsx` 与 `product-inventory-panel.tsx` 的手拼 `yumi-record-action-bar` 均改为共享 `YumiRecordActionBar`；`YumiRecordAction` 新增可选 `title` 透传（保留锁定原因悬停提示）。
2. **P5 死代码清理**：`yumi-dialog.tsx` 删除无效 `aria-describedby` 行（Radix 已自动关联描述）。
3. **P6 图标一致性**：`yumi-notification.tsx` 关闭按钮由文本 `×` 改为 Lucide `X`，与弹窗/抽屉一致。
4. **P2 日期口径**：`product-inventory-panel.tsx` 三处“发生日期/调整日期/投入日期”由 `YumiTextField` 手输改为 `YumiDatePicker`；label 关联依赖 `YumiField` 上下文（`useYumiFieldAccessibility` 自动接 `aria-labelledby`），不再依赖 `id`/`htmlFor`。
5. **P3 样式归属**：`.yumi-work-time-review__*`、`.yumi-product-workspace` 整块从共享 `components.css` 迁至 `pages.css`，与 `.yumi-worker-week__*` 等业务样式同侧。
6. **P4 可访问性**：`work-time-review-forms.tsx` 时间四字段由 `<label>` 包裹改回 `<div>`，控件保留 `aria-label`，消除无效 label 关联。
7. **P7 页头动作 API 收敛**：`YumiPageActions` 删除 `secondaryAction`，统一为 `visibleActions` 数组；类型 `YumiPageSecondaryAction` 更名为 `YumiPageVisibleAction`；订单详情、排班、工作台三个页面与 `yumi-page-header.test.tsx` 全部迁移（订单详情保持“导出订单表 → 发货汇总”原顺序）。
8. **护栏新增**：
   - `app-components.test.ts` 新增 `YUMI 记录操作规范`：业务组件必须用 `YumiRecordActionBar`，不得手拼容器类；
   - 反馈来源护栏扩展到 `work-time-review-panel` / `work-time-review-forms` / `product-inventory-panel`；
   - 原生控件禁令护栏扩展到五个自定义业务组件（dispatch-views、settlement-detail、work-time-review-panel/forms、product-inventory-panel）；
   - 页头动作护栏改为断言 `visibleActions:\s*\[` 结构化数组（不再有 `secondaryAction` 入口）。

### 验证记录

- 定向 Vitest（本次 7 个改动文件）：**124/126 通过**；2 项失败为财务总览 WIP 的既有失败（`reports/index.tsx` 缺 `YumiMetricStrip`、`pages.css` 出现 `rgba()`），与本次改动无关，见 P8。
- 全量 renderer 回归：**279/281 通过**（60 个文件），与改动前基线一致，仍仅剩上述 2 项 WIP 失败。
- `pnpm exec eslint` 对本次 13 个改动文件 **通过**。
- `git diff --check`、`pnpm build` 与全量 Electron 回归待提交前执行。

### 偏差

- P8 属未提交的财务总览 WIP，由负责人合并前整改（消除 `pages.css` 的 `rgba()` 与 `reports/index.tsx` 的 `YumiMetricStrip` 缺口）；本轮未代改。

## 8. 更新与归档规则

- 本方案确认后，护栏落地、整改完成、`pnpm typecheck`、`pnpm lint`、`pnpm build`、`git diff --check` 与 Electron 定向/全量回归通过后，回写本方案实施结果与偏差；
- 若需进入 OpenSpec 任务流，按现有“方案 → OpenSpec 变更 → 文件级任务 → 证据回填”的流程单独建变更，不回写已归档的 v2 方案；
- 本规范与 v1.1 / v2.71 冲突时，以本方案为准并在变更记录中说明。
