# 技术设计：YUMI 前端设计系统与经营列表

## 元数据

| 项目 | 内容 |
| --- | --- |
| 提案 | `yumi-design-system-ui` |
| 状态 | 已规划，待实施授权 |
| 创建日期 | 2026-09-08 |
| 创建人 | Codex |
| 设计依据 | `docs/solutions/2026-09-08-yumi-design-system-ui.md` v1.1 |
| 关联变更 | `improve-operational-ui-flow`，已由提交 `a14709a` 实施 |

## 1. 背景与约束

当前渲染层的页面直接使用 `@radix-ui/themes` 默认控件，并在订单、履约、工资、财务、售后、设置等页面混用原生 `<select>`、`date`、`month`、`time`、`datetime-local` 输入。`src/renderer/styles/app.css` 同时承载应用壳、页面和控件细节，导致视觉令牌、控件状态与页面结构无法统一演进。

本提案只重构渲染层视觉与交互承载，不修改 `src/main/`、`src/preload/`、`src/shared/contracts/`、数据库 schema 或任一 V2 IPC 名称。所有日期值继续以既有表单所用 ISO 字符串传给 composable；现有 `useOrders`、`useFinance`、`useFulfillment`、`useSettlements`、`useWorkAssignments` 等接口保持不变。

业务不变量：负责人仍最终决定售后责任、客户收费、排班、实际发放工资和备注；UI 只改善事实展示、输入控件、校验提示和操作路径。

## 2. 决策

### 2.1 组件层与依赖

新建 `src/renderer/components/ui/` 作为唯一的业务 UI 入口。页面不得继续直接导入 `@radix-ui/themes` 或直接定义浏览器原生选择与日期/时间输入；页面只组合 YUMI 组件、Lucide 图标和业务 composable。

保留 Radix 的焦点管理、弹层定位与键盘能力，但把需要使用的 primitives 作为 `package.json` 的直接依赖声明（Dialog、AlertDialog、Popover、Select）。在迁移完成后移除 `@radix-ui/themes` 的默认主题与页面级依赖，避免默认橙色、系统下拉或 Radix Theme CSS 渗入视觉层。

日期日历采用 `@daypicker/react` 的无业务语义日历能力，YUMI 自己负责中文显示、令牌、快捷范围、日期字符串转换和业务校验；日期库不接触领域计算。测试补入 React DOM 交互工具，验证键盘、焦点回归、日期范围与行点击，而不再仅依赖源码字符串断言。

### 2.2 样式令牌与层次

新增以下样式文件，并由 `src/renderer/main.tsx` 按令牌、基础、组件、页面顺序引入：

```text
src/renderer/styles/
  tokens.css        # CSS custom properties：色彩、字号、行高、间距、圆角、阴影、z-index
  base.css          # 字体栈、box-sizing、可访问焦点、按钮/输入重置、浅色画布
  components.css    # Yumi UI 控件的稳定样式与状态
  pages.css         # 应用壳及页面布局，不放页面专属控件逻辑
```

视觉令牌采用设计方案 v1.1：画布 `#F9F6F7`、表面 `#FFFDFD`、主文字 `#30272B`、次文字 `#7F7177`、分割线 `#EADFE3`、品牌色 `#C4567C`、浅粉 `#FAE6ED`、极浅粉 `#FFF4F7`，并保留成功、警告、危险和信息状态色。仅建设浅色主题；所有主题色经 CSS 变量使用，禁止页面硬编码色值。

页面标题、区块标题、正文和辅助文字分别固定为 `28/36`、`18/26`、`14/21`、`12/18` 的层级；布局采用 4px 基准。面板为 16px 圆角，字段/按钮为 8px 圆角；浮层使用低对比阴影，非浮层不以阴影制造层级。

### 2.3 UI 组件契约

```text
src/renderer/components/ui/
  button/           # YumiButton、YumiIconButton
  field/            # YumiTextField、YumiNumberField、YumiTextArea、YumiFieldLabel
  select/           # YumiSelect、YumiSearchSelect
  date-picker/      # YumiDatePicker、YumiDateRangePicker、YumiDateTimePicker、YumiDateTimeRangePicker
  dialog/           # YumiDialog、YumiConfirmDialog
  sheet/            # YumiSheet
  status-tag/       # YumiStatusTag、状态映射辅助函数
  business-list/    # YumiBusinessList、YumiBusinessListItem
  data-table/       # YumiDataTable
  empty-state/      # YumiEmptyState
  page-header/      # YumiPageHeader、YumiSection
```

- `YumiButton`：`primary`、`secondary`、`ghost`、`danger` 四种层级，支持 loading、disabled 和可见 focus ring。一个页面只放置一个实体级 `primary`。
- `YumiSelect`：固定选项，传入 `value`、`onValueChange`、`options`、`placeholder`、`disabled`；用 Radix Select 管理键盘与焦点。`YumiSearchSelect` 面向客户、商品、订单等增长数据，支持筛选、空结果与上下文“新建”行动。
- 日期组件输入输出均为既有 ISO 表单值：单日期 `YYYY-MM-DD`，月份 `YYYY-MM`，日期时间使用当前页面既有的本地日期时间字符串格式。范围组件输出 `{ start, end }`，并由页面将其映射到现有查询字段；空值统一为 `null`，而不是混用空字符串与 `undefined`。
- `YumiDateRangePicker` 默认提供本周、本月、上月快捷范围，跨月显示双月；端点为主色、区间为连续淡粉。`YumiDateTimeRangePicker` 在确认前执行 `end > start` 校验并呈现预计时长。
- `YumiBusinessList` 接收语义化 `items` 和每条记录的状态、标题、摘要、指标、更新时间、`onOpen`；行是一个可聚焦的完整操作目标，Enter/Space 与点击都触发 `onOpen`。危险或低频行操作放进“更多”菜单，不能抢占行主路径。
- `YumiDataTable` 只为统计、汇总和横向比较服务；不得被订单、履约、工资结算或财务流水的日常列表调用。
- `YumiDialog`、`YumiSheet`、`YumiConfirmDialog` 管理 Esc、外部点击、焦点陷阱和触发控件回归。关闭含未保存输入的复杂表单前显示确认提示。

### 2.4 页面映射

| 页面/组件 | 呈现方式 | 业务保持项 |
| --- | --- | --- |
| `pages/app.tsx`、`main.tsx` | 浅色应用壳、分组导航、命令栏与一致焦点 | 不改变视图 ID、导航分组和页面挂载 |
| `pages/orders/index.tsx` | 订单经营列表；独立创建与详情工作区；客户/商品搜索选择和日期选择 | `OrderWorkspaceMode`、订单草稿、收付款和售后调用不变 |
| `pages/fulfillment/index.tsx` | 履约队列经营列表；详情内阶段操作使用受控选择/日期 | 在制品、负责人调整、发货与排班 API 不变 |
| `pages/settlements/index.tsx`、`components/settlement/settlement-detail.tsx` | 结算经营列表与结算详情；实际工资输入保留负责人确认 | 计算候选、实际工资、备注和确认语义不变 |
| `pages/finance/index.tsx` | 月度概览 + 财务流水经营列表 + 按需收支抽屉 | 付款日期、垫付、完整报销与月度概览逻辑不变 |
| `pages/reports/index.tsx` | 指标概览 + 结构化比较表格 + 期间选择与导出 | 报表数据和导出入口不变 |
| `pages/customers/index.tsx`、`products/index.tsx`、`workers/index.tsx`、`settings/index.tsx` | 基础资料经营列表或资料表格 + 右侧抽屉编辑 | 建档、启停、时薪历史、类目和垫付人逻辑不变 |
| `pages/work-assignments/index.tsx`、`components/after-sales/after-sales-panel.tsx` | 任务/售后记录使用受控选择、日期和状态标签 | 质检、返工、售后弹性记录和负责人裁量不变 |

### 2.5 迁移与回退策略

迁移在一个变更内按四个内部阶段执行：先完成令牌与通用组件，再迁移核心经营页，随后迁移资料与辅助模块，最后消除旧样式并验证。每个页面迁移后立即运行对应渲染层测试、类型检查和 Lint；UI 组件不包裹或重写 composable，因此失败时可以在不影响领域层的前提下回退单个页面的呈现改动。

迁移完成后，`rg` 静态检查不得在 `src/renderer/` 的业务页面中发现 `<select>` 或 `date`、`month`、`time`、`datetime-local` 原生输入，也不得发现业务页面从 `@radix-ui/themes` 直接导入组件。受控 UI 基础实现中的语义化原生 `<input type="text|number">` 可保留，但不使用浏览器原生日期和选择视觉。

## 3. 风险与处理

| 风险 | 处理 |
| --- | --- |
| 全量重构导致业务行为漂移 | 只替换渲染组合与表单控件；现有 composable、合同和 IPC 不改；以 V2 前端契约测试和关键交互测试回归 |
| 组件迁移过度抽象 | 仅封装跨页面重复的视觉与交互；订单明细、售后责任、工资确认等业务区仍留在业务页面/组件 |
| 日期值格式不兼容 | 建立单一 ISO 转换辅助函数，并为单日期、月份、范围、日期时间范围建立测试；不在组件内部猜测时区业务含义 |
| Radix 或日历样式泄漏 | 业务页不使用默认主题组件；所有 class、令牌和状态由 YUMI UI 层掌控，并在人机检查中覆盖浮层与长列表 |
| 原生 `better-sqlite3` 绑定影响全量测试 | UI 验证先执行 `npm --ignore-scripts test -- <renderer tests>`、typecheck、lint、build；若全量测试被已知绑定缺失阻塞，记录完整失败输出，不修改业务代码掩盖 |

## 4. 验证设计

- 单元/交互：按钮层级、选择器键盘导航与焦点回归、日期范围端点与快捷范围、日期时间无效范围、经营列表行 Enter/Space 与点击、危险确认弹窗。
- 页面：订单、履约、工资、财务流水使用 `YumiBusinessList`；报表使用 `YumiDataTable`；订单仍保留 list/create/detail 互斥工作区；售后与工资仍保留负责人输入。
- 静态：业务页面无原生选择/日期时间控件，且无 `@radix-ui/themes` 直接 UI 导入。
- 构建：定向 renderer 测试、`npm run typecheck`、`npm run lint`、`npm run build`、`openspec validate yumi-design-system-ui --strict`。
- 人工：在既有 Electron 开发实例中检查导航、所有浮层、键盘焦点、长列表、空状态、表单未保存提示和主要运营路径；不写入测试数据。
