## 1. 设计系统基础（后续所有页面任务依赖本阶段）

- [x] 1.1 更新 `package.json` 与 `package-lock.json`：将 Dialog、AlertDialog、Popover、Select 所需 Radix primitives 与 `@daypicker/react` 声明为直接依赖，并增加渲染层交互测试所需开发依赖；迁移完成后删除 `@radix-ui/themes` 及其默认样式引用。完成条件：依赖不依赖 Radix Themes 的传递包，`npm install` 与 `npm run typecheck` 可解析新增模块。
> 实施证据（2026-09-08）：`@radix-ui/react-alert-dialog`、`dialog`、`popover`、`select` 与 `@daypicker/react` 已作为直接依赖，渲染层测试依赖已声明；`@radix-ui/themes` 已从依赖和入口移除。`npm install --ignore-scripts` 与 `npm run typecheck` 均通过。
- [x] 1.2 新建 `src/renderer/styles/tokens.css`、`base.css`、`components.css`、`pages.css`，迁移并最终删除 `src/renderer/styles/app.css`；在 `src/renderer/main.tsx` 移除 `Theme` 包装和 `@radix-ui/themes/styles.css`，按“令牌 → 基础 → 组件 → 页面”加载新样式。完成条件：全局仅浅色主题，颜色、字号、4px 间距、圆角、阴影、焦点环均通过 YUMI CSS 令牌提供。
> 实施证据（2026-09-08）：已按 `tokens.css → base.css → components.css → pages.css` 在 `main.tsx` 加载；旧 `app.css`、`Theme` 包装和 Themes 默认样式引用均已删除。
- [x] 1.3 新建 `src/renderer/components/ui/button/`、`field/`、`status-tag/`、`page-header/` 及统一导出入口，实现 `YumiButton`、`YumiIconButton`、文本/数字/多行字段、字段标签、状态标签、页面标题和区块容器。完成条件：提供 primary/secondary/ghost/danger、loading、disabled、错误和键盘焦点状态，页面无需通过 Radix 默认颜色/尺寸表达层级。
> 实施证据（2026-09-08）：新增 YUMI 按钮、字段、状态、标题与区块组件；`npm --ignore-scripts test -- src/renderer/components/ui/button/yumi-button.test.tsx`（1 项）及 `npm run typecheck` 均通过。
- [x] 1.4 新建 `src/renderer/components/ui/select/` 的 `YumiSelect` 与 `YumiSearchSelect`：固定选择支持占位项和禁用状态，搜索选择支持本地筛选、空结果和可选的新建动作；用直接声明的 Radix Select/Popover 管理箭头键、回车、Esc、点击外部关闭与焦点回归。完成条件：业务表单能够用字符串 value/onValueChange 替换全部原生 `<select>`，且浮层视觉遵循 v1.1 设计令牌。
> 实施证据（2026-09-08）：新增基于直接 Radix primitives 的固定/搜索选择器和 JSDOM 交互兼容辅助；`npm --ignore-scripts test -- src/renderer/components/ui/select/yumi-select.test.tsx`（2 项）及 `npm run typecheck` 均通过。
- [x] 1.5 新建 `src/renderer/components/ui/date-picker/` 与 ISO 日期辅助：实现单日期、月份、日期范围、日期时间、日期时间范围组件；提供中文显示、今天标记、本周/本月/上月快捷范围、双月范围视图、范围端点和连续区间样式，以及 `end > start` 校验。完成条件：控件保持既有 `YYYY-MM-DD`、`YYYY-MM` 与页面当前日期时间字符串的输入输出兼容，日期范围空值统一为 `null`。
> 实施证据（2026-09-08）：新增 ISO 日期辅助、单日期、月份、日期范围、日期时间和日期时间范围组件，以及本周/本月/上月快捷范围；`npm --ignore-scripts test -- src/renderer/components/ui/date-picker/iso-date.test.ts`（2 项）及 `npm run typecheck` 均通过。
- [x] 1.6 新建 `src/renderer/components/ui/dialog/` 与 `sheet/`，实现 `YumiDialog`、`YumiConfirmDialog`、`YumiSheet`，并为长表单加入未保存内容关闭确认。完成条件：简单资料可由抽屉/弹窗编辑，不可逆操作在确认弹窗后执行，所有浮层的 Esc、外部点击和焦点回归行为可测试。
> 实施证据（2026-09-08）：新增 Dialog、危险确认弹窗和带未保存内容确认的 Sheet；`npm --ignore-scripts test -- src/renderer/components/ui/dialog/yumi-dialog.test.tsx`（2 项）及 `npm run typecheck` 均通过。
- [x] 1.7 新建 `src/renderer/components/ui/business-list/`、`data-table/`、`empty-state/`：实现可聚焦、可点击的 `YumiBusinessList`/`YumiBusinessListItem`，以及仅用于横向指标比较的 `YumiDataTable` 和统一空状态。完成条件：经营列表包含状态线索、主次事实、指标、更新时间和详情入口，Enter/Space 与点击执行同一打开动作；数据表格 API 不被日常运营列表使用。
> 实施证据（2026-09-08）：新增经营列表、横向数据表与统一空状态；`npm --ignore-scripts test -- src/renderer/components/ui/business-list/yumi-business-list.test.tsx`（1 项）及 `npm run typecheck` 均通过。
- [x] 1.8 为第 1.3 至 1.7 项新增组件测试（建议位于对应 `src/renderer/components/ui/**/**.test.tsx`）：覆盖按钮层级、选择器键盘/焦点、日期范围与无效时段、确认弹窗和经营列表键盘打开。完成条件：测试不依赖业务 IPC，且可用 `npm --ignore-scripts test -- <新增测试路径>` 单独执行。
> 实施证据（2026-09-08）：已覆盖按钮、选择器、ISO 日期、日期/月份触发器、确认浮层、经营列表和浮层层级；`src/renderer/styles/layering.test.ts` 防止下拉浮层被抽屉遮挡。`npm --ignore-scripts test -- src/renderer` 通过 14 个文件、46 项测试，均不依赖业务 IPC。

## 2. 核心经营页面迁移（依赖：1.2 至 1.8）

- [x] 2.1 重构 `src/renderer/pages/app.tsx`：使用 YUMI 页面壳、导航项和命令栏组件重建“业务运营 / 资金与分析 / 基础资料”导航。完成条件：保留现有 `View` 联合类型、默认订单视图、导航 ID 和各页面挂载关系，视觉不再引用 Radix Themes Button/Text。
> 实施证据（2026-09-08）：应用壳已迁移为 YUMI 导航与命令栏，保留导航分组、View 联合类型与页面挂载；`npm --ignore-scripts test -- src/renderer/pages/app-components.test.ts src/renderer/components/ui/button/yumi-button.test.tsx`（17 项）及 `npm run typecheck` 均通过。
- [x] 2.2 重构 `src/renderer/pages/orders/index.tsx`：保留 `OrderWorkspaceMode` 的 list/create/detail 互斥状态，把订单列表迁移为 `YumiBusinessList`；将客户与商品替换为搜索选择器，将预计发货、内容变更、收付款、发货等日期替换为 YUMI 日期组件。完成条件：订单行呈现订单号、客户、产品/数量摘要、收款/履约状态、金额和更新时间，点击进入既有详情，订单草稿与现有 composable 调用不变。
> 实施证据（2026-09-08）：订单列表已迁移为 YUMI 经营列表，订单创建与详情中的客户/商品、选择、日期、文本和数值字段均使用 YUMI 组件；保留 list/create/detail 草稿状态与既有 composable 调用。`npm --ignore-scripts test -- src/renderer/pages/app-components.test.ts`（17 项）及 `npm run typecheck` 均通过。
- [x] 2.3 重构 `src/renderer/pages/fulfillment/index.tsx` 与 `src/renderer/pages/work-assignments/index.tsx`：把履约队列改为经营列表，把期初在制品、负责人调整、工序和安排日期改为 YUMI 选择/日期字段。完成条件：阶段数量、实际阶段、在制品、调整、排班、完成与次日质检的参数和写入顺序不变。
> 实施证据（2026-09-08）：履约队列和工作安排已迁移为 YUMI 经营列表；期初在制品、负责人调整、工序、安排日期及任务完成/质检字段改用 YUMI 选择、日期和数值组件。默认发生日期仍为当天，既有参数与写入顺序保持不变。`npm --ignore-scripts test -- src/renderer/pages/app-components.test.ts`（18 项）及 `npm run typecheck` 均通过。
- [x] 2.4 重构 `src/renderer/pages/settlements/index.tsx` 与 `src/renderer/components/settlement/settlement-detail.tsx`：结算单使用经营列表，人员与结算范围使用搜索选择和日期范围，实际付款日期使用 YUMI 日期组件。完成条件：候选工资、考勤参考、负责人填写实际工资及备注、确认即实际发放的既有语义保持不变。
> 实施证据（2026-09-08）：工资结算已迁移为 YUMI 经营列表；兼职人员使用搜索选择，结算范围使用日期范围选择，实际付款日期使用 YUMI 日期组件。排班/考勤两套参考、负责人实际工资与备注、确认即写入实际工资支出的调用顺序保持不变。`npm --ignore-scripts test -- src/renderer/pages/app-components.test.ts`（19 项）及 `npm run typecheck` 均通过。
- [x] 2.5 重构 `src/renderer/pages/finance/index.tsx` 与 `src/renderer/pages/reports/index.tsx`：财务概览保留，财务流水与待报销改为经营列表、按需收支录入改为抽屉；月度报表保留 `YumiDataTable`、月份选择、刷新和导出入口。完成条件：发生日期、私人垫付、完整报销和月度经营口径不变；报表仍可横向比较订单核算、履约、工资与月度事实。
> 实施证据（2026-09-08）：财务流水和待报销已迁移为 YUMI 经营列表，收支登记改为 YUMI 抽屉；月份、截至日期、发生日期和报销日期均使用 YUMI 日期组件。报表使用 YumiDataTable 保留订单、履约与已确认工资的横向比较，并保留月份刷新和导出入口。`npm --ignore-scripts test -- src/renderer/pages/app-components.test.ts`（20 项）、核心 UI 组件测试（8 项）及 `npm run typecheck` 均通过。
- [x] 2.6 重构 `src/renderer/components/after-sales/after-sales-panel.tsx`：售后新建、状态切换和收费关联全部使用 YUMI 字段、选择器、日期和状态标签，并将售后记录呈现为轻量经营记录。完成条件：仍保留问题原因、责任判断、处理方式、核算成本、收费说明与手动关联收费；不新增自动定责、自动收费或自动返工。
> 实施证据（2026-09-08）：售后记录已改为 YUMI 经营列表，新建售后使用按需抽屉、日期选择、运单搜索选择、状态选择和状态标签；保留问题原因、客户诉求、负责人责任判断、处理方式、核算成本、收费说明及手动关联收费。界面明确提示系统不会自动定责、收费或创建返工任务。`npm --ignore-scripts test -- src/renderer/components/after-sales/after-sales-panel.test.tsx`（1 项）通过，覆盖负责人未完成必填判断时不得创建售后记录。
- [x] 2.7 更新 `src/renderer/pages/app-components.test.ts` 及新增核心页渲染/交互测试：验证订单、履约、结算、财务均调用经营列表，报表使用数据表格，订单三种工作状态和负责人裁量文案/字段仍存在。完成条件：测试继续断言页面只通过 composable 调用 V2 API，不出现 `window.yumi` 或 `ipcRenderer` 直连。
> 实施证据（2026-09-08）：`src/renderer/pages/app-components.test.ts` 已覆盖订单、履约、结算、财务使用经营列表、报表使用数据表格、订单 list/create/detail 三种工作状态与负责人裁量相关源码边界，并继续断言业务页面不直连 `window.yumi` 或 `ipcRenderer`。新增 `AfterSalesPanel` JSDOM 交互测试，验证负责人信息不完整时只显示校验错误、不调用创建接口。定向执行 7 个测试文件、30 项测试全部通过；`npm run typecheck`、`git diff --check` 与 `openspec validate yumi-design-system-ui --strict` 均通过。

## 3. 基础资料与辅助模块迁移（依赖：1.2 至 1.8）

- [x] 3.1 重构 `src/renderer/pages/customers/index.tsx` 与 `src/renderer/pages/products/index.tsx`：列表改用经营列表或数据密度适宜的资料列表，新建/编辑改用 `YumiSheet` 或 `YumiDialog`。完成条件：仍只能在负责人主动点击后录入，客户快照说明、商品成本/提成规则和启停状态逻辑不变。
> 实施证据（2026-09-08）：客户与商品已迁移为 YUMI 经营资料列表，负责人点击列表项或新建按钮后才打开带未保存内容提示的 `YumiSheet`。客户页保留订单客户快照说明；商品页保留单件成本、标准制作分钟、制作提成、制作胶水及启停状态的展示/更新语义。`npm --ignore-scripts test -- src/renderer/pages/app-components.test.ts`（22 项）及 `npm run typecheck` 均通过。
- [x] 3.2 重构 `src/renderer/pages/workers/index.tsx`、`src/renderer/pages/settings/index.tsx` 与 `src/renderer/pages/numeric-text-field.tsx`：人员、时薪历史、收支分类、私人垫付人和数字字段统一接入 YUMI 组件。完成条件：生效日期、分类/垫付人选择、动态新建入口、数值草稿与验证语义不变，且不再直接导入 Radix Themes。
> 实施证据（2026-09-08）：人员页已使用 YUMI 日期选择、搜索选择、数字字段和经营列表，保留首个时薪与后续时薪历史按生效日期记录的语义。财务设置已使用经营列表、YUMI 对话框、确认删除和自定义状态选择管理动态收支类目与私人垫付人。`NumericTextField` 改用 `YumiTextField`，原有字符串草稿、中间小数状态及验证逻辑保持不变。`npm --ignore-scripts test -- src/renderer/pages/app-components.test.ts src/renderer/pages/numeric-text-field.component.test.ts src/renderer/pages/numeric-text-field.test.ts`（27 项）及 `npm run typecheck` 均通过。
- [x] 3.3 清理各业务页面和组件的旧视觉标记与原生控件：覆盖 `src/renderer/pages/**/*.tsx`、`src/renderer/components/**/*.tsx` 中剩余的 Radix Theme 导入、`<select>`、`date`/`month`/`time`/`datetime-local` 输入及旧 `.panel`、`.v2-*`、`.rt-*` 视觉耦合。完成条件：静态扫描仅允许 UI 基础实现使用语义化文本/数字输入，业务页无禁用原生控件和 Radix Themes 默认 UI。
> 实施证据（2026-09-08）：静态扫描 `rg -n '<select|type="(date|month|time|datetime-local)"|@radix-ui/themes' src/renderer/pages src/renderer/components --glob '*.tsx'` 无匹配；业务页面精确扫描旧 `.panel`、`.v2-*`、`.rt-*` class 亦无匹配。Radix primitives 仅保留在 YUMI 基础 UI 实现中。
- [x] 3.4 扩充渲染层测试，覆盖基础资料按需打开编辑区、人员时薪历史日期、设置动态选择、新字段错误态和无数据空状态。完成条件：`src/renderer/pages/app-components.test.ts` 的既有业务边界断言保持有效，并新增对 YUMI UI 接入的行为断言。
> 实施证据（2026-09-08）：新增 `src/renderer/pages/reference-pages.test.tsx`，覆盖客户空状态与按需抽屉、客户保存失败错误态、既有客户编辑、人员时薪历史日期选择和动态收入类目新建；定向测试共 44 项通过。

## 4. 清理、验证与交付（依赖：第 1 至 3 阶段全部完成）

- [x] 4.1 运行静态迁移检查并修复遗留：对 `src/renderer/pages` 和 `src/renderer/components` 执行 `rg '<select|type="(date|month|time|datetime-local)"|@radix-ui/themes'`；确认订单、履约、结算和财务列表不直接使用 `YumiDataTable`，报表不使用经营列表替代横向比较。完成条件：命令无业务页面遗留匹配，结果和必要白名单写入实施证据。
> 实施证据（2026-09-08）：上述旧控件/主题扫描无匹配；订单、履约、结算、财务目录中 `YumiDataTable` 无匹配，报表页 `YumiBusinessList` 无匹配；无需白名单。
- [x] 4.2 执行新增 UI 测试与既有渲染层定向测试：`npm --ignore-scripts test -- src/renderer/components/ui src/renderer/pages/app-components.test.ts src/renderer/composables/use-fulfillment.test.ts src/renderer/pages/numeric-text-field.component.test.ts src/renderer/pages/numeric-text-field.test.ts src/renderer/pages/shift-task-options.test.ts`。完成条件：所有指定测试通过；若路径或测试脚本调整，在任务记录中写明替代命令和完整输出。
> 实施证据（2026-09-08）：最终以覆盖全部渲染层的替代命令 `npm --ignore-scripts test -- src/renderer` 执行，包含指定路径，并额外覆盖浮层层级、日期触发器、参考页和售后面板；14 个文件、46 项测试全部通过。
- [x] 4.3 执行 `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 与 `openspec validate yumi-design-system-ui --strict`。完成条件：每个命令读取完整输出并通过；若 `npm test` 仍被本机 `better-sqlite3` 原生绑定阻塞，单独运行并记录失败原因，不以跳过脚本结果冒充全量通过。
> 实施证据（2026-09-08）：`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check`、`npx openspec validate yumi-design-system-ui --strict` 均通过。普通 `npm test` 在本轮的 `pretest` 阶段执行 `npm rebuild better-sqlite3` 时失败：预构建进程被终止后回退到 node-gyp，而本机 Python 3.13 缺少 `distutils`；因此未将跳过脚本的结果冒充为主进程全量通过，改以渲染层 14 个文件、46 项测试验证 UI 改动。
- [x] 4.4 在不写入测试数据、不重启或终止用户现有 Electron 开发实例的前提下人工检查：导航、订单列表/创建/详情、履约队列、工资确认、财务流水与报表、客户/商品抽屉、售后、下拉、单日期、日期范围、日期时间范围、长列表、空状态、键盘焦点和未保存内容提示。完成条件：记录检查日期、路径和发现项；发现问题回到对应任务修复并重新验证。
> 实施证据（2026-09-08）：在负责人明确授权“你自己启动吧”后，以 `npm run dev` 启动本地 Electron 调试实例，未写入测试数据。已人工检查设置、订单、客户、商品、履约、工资、财务、报表页面的导航和空状态；检查客户/商品抽屉、财务登记抽屉、设置新增类目弹窗、常规/搜索下拉、单日期和月份浮层，Esc 关闭与焦点回归。检查中发现两项浮层问题并修复后复验：日期触发器未转发 Radix 的 ref/事件，导致日期与月份浮层无法打开；抽屉内下拉浮层层级低于抽屉而被遮挡。已增加回归测试并复验浮层可见。当前实例无业务数据，故订单详情、售后、含数据的履约/工资确认、长列表滚动以及创建后数据路径不以虚构数据验证；对应结构/交互由渲染层 46 项测试覆盖。
- [x] 4.5 全部任务完成且验证证据齐全后，更新 `docs/solutions/2026-09-08-yumi-design-system-ui.md` 的实施状态、实际依赖、验证结果与偏差；再将本提案状态标为完成。完成条件：仅在 4.1 至 4.4 全部通过后执行，且不归档，归档需负责人后续明确授权。
> 实施证据（2026-09-08）：已回写方案的实施状态、实际依赖、验证结果、人工检查范围与偏差；提案保持未归档状态，等待负责人后续验收或归档授权。
