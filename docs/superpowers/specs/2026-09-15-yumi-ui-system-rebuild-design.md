# YUMI 全量 UI 设计系统与页面模式重构设计

- **设计日期**：2026-09-15
- **修改人**：chen
- **状态**：已完成架构复核，待负责人审阅
- **实施阶段**：P0 规范基线 → P1 共享组件与布局原语 → P2 页面模式 → P3 页面迁移

## 1. 背景与问题

YUMI 已经拥有 React、Radix、DayPicker、Lucide，以及一套 `Yumi*` 共享组件。生产页面基本不直接使用原生按钮、输入框、选择器或 Radix 组件，说明控件来源已经初步统一。

但当前一致性主要由源码字符串护栏保证：页面使用了指定组件，不代表最终渲染出的字号、间距、密度、层级、布局和响应式行为一致。现有 `components.css` 与 `pages.css` 分别约 1794 行和 1777 行，仍包含大量裸字号、裸间距、裸圆角、私有网格和分散断点。已定义的控件高度、页面间距、侧栏宽度和 Tab 指示器等组件别名令牌基本没有被生产样式消费。

旧方案记录的“28 个共享导出”已经过期。实施基线时共享出口为 40 个运行时导出（37 个 `Yumi*` 组件、Provider 或 Host + 3 个通知 hook 或工具）。重构必须以当前生产代码为基线，不能继续围绕过期清单局部修补；最终资产清单以自动治理基线 `src/renderer/test/ui-baseline/ui-inventory.json` 为准（终态 53 个运行时 + 20 个仅类型导出，见 §3/§18）。

## 2. 已确认决策

1. 保留 React、Radix、DayPicker 和 Lucide，不更换完整 UI 组件库。
2. 重建 YUMI 自有设计系统，覆盖全部实际使用的组件、页面模式与视觉规则。
3. 按 P0 → P1 → P2 → P3 推进；P0/P1 完成前暂停给单页新增私有视觉样式。
4. 视觉采用“中性经营工作台”：灰白承担主要信息表面，竹青只用于动作和关键状态。
5. 信息密度按页面模式编排，不允许页面作者自由选择。
6. 删除生产零使用的 `YumiBusinessList`、`YumiBusinessListItem`、`YumiTaskRateSummary`、`YumiDateTimePicker` 和 `YumiDateTimeRangePicker`，不保留兼容壳。
7. 按页面家族逐批迁移；不同页面可短期处于新旧体系，但一个页面开始迁移后必须整页完成。
8. 不保留旧 props、旧 class、双套组件 API 或兼容适配层。
9. 桌面窗口最小尺寸维持 `1100 × 720`，不建设手机和平板响应式流程。
10. UI 重构不改变数据库、IPC、领域计算、状态流转和导出数据口径。

## 3. 当前 UI 资产地图

> 终态口径（12.10 锁定）：共享出口 53 个运行时 + 20 个仅类型导出，全部由 `src/renderer/test/ui-baseline/ui-inventory.json` 自动治理（列表见 `baselines/ui-inventory.md`）；零使用与同层内部消费例外见 §18。

### 3.1 已统一来源

- 动作：`YumiButton`、`YumiIconButton`、`YumiActionMenu`、`YumiRecordActionBar`。
- 表单：`YumiField`、`YumiFieldLabel`、文本、数字、文本域、复选框、普通选择、搜索选择、日期、日期范围、月份和时间组件。
- 反馈：`YumiFormMessage`、Notification Provider/Host/hooks、`YumiEmptyState`、`YumiConfirmDialog`。
- 导航：`YumiPrimaryTabs`、`YumiSegmentedTabs`。
- 数据：`YumiDataTable`、`YumiDetailList`、`YumiMetricStrip`、`YumiStatusTag`。
- 浮层：`YumiDialog`、`YumiSheet`、Popover 基础行为。
- 页面骨架：`YumiPageHeader`、`YumiSection`、`YumiListSurface`、`YumiListToolbar`。

### 3.2 部分统一

- `YumiEntitySummary`、`YumiRecordSummary` 和页面私有摘要并存。
- `YumiCalculatedAmount` 只在商品与计时核算使用，订单盈利仍有私有摘要。
- 表单控件已经统一，但 `.yumi-form-panel`、`.yumi-form-grid` 和 `.yumi-form-actions` 仍由页面手工组合。
- `compact/comfortable` 类型只覆盖部分组件，生产页面基本依赖默认值。
- 详情页存在订单、结算、客户和商品等多套详情头结构。

### 3.3 领域专属布局

- 人员周历和派工视图。
- 工时核算工作台及制作/计时核算表单。
- 商品全页双栏编辑工作区。
- 订单盈利摘要。
- 财务经营总览。
- 工作台阶段图、优先事项和分布区。

这些领域组件可以保留业务表达，但其通用空间关系、标题、指标、反馈和动作必须下沉到共享层。

## 4. 目标架构

依赖只能从上往下：

```text
业务页面与领域组件 Domain
        ↓
页面模式 Patterns
        ↓
复合组件 Composites
        ↓
基础组件 Primitives
        ↓
设计令牌 Foundations
        ↓
Radix / DayPicker / 原生语义元素
```

### 4.1 Foundations

负责颜色、排版、间距、尺寸、圆角、阴影、层级、动画和桌面断点。令牌只表达语义和尺度，不出现业务页面名称。

### 4.2 Primitives

负责按钮、图标按钮、字段、输入、选择、日期、复选框、Tab、标签和消息等单一控件的视觉、状态、键盘与无障碍契约。页面不得覆盖基础控件内部样式。

### 4.3 Composites

负责 PageHeader、SectionHeader、Toolbar、DataTable、MetricStrip、EntitySummary、Dialog、Sheet 和 Notification 等多组件固定关系。API 优先使用结构化 props；允许 `title`、`description`、`status`、`actions`、`footer` 和 `children` 等有明确职责的语义插槽，但插槽容器、顺序和间距由组件控制。消费者不得借助 class、style 或无语义包装节点绕开布局契约。

### 4.4 Patterns

负责 ListPage、DetailPage、FormWorkspace、DashboardOverview、ReviewWorkspace、CalendarWorkspace 和 SettingsWorkspace 的页面层级、区域顺序、密度、动作归属和桌面适配。

### 4.5 Domain

负责人员周历、核算、商品成本、订单盈利和财务总览等业务特有内容。可跨领域描述的布局必须下沉到 Patterns 或 Composites。

## 5. CSS 分层

```text
styles/
  foundations/
    tokens.css
    base.css
  primitives/
    action.css
    form.css
    navigation.css
    feedback.css
  composites/
    table.css
    summary.css
    overlay.css
    toolbar.css
  patterns/
    list.css
    detail.css
    form.css
    dashboard.css
    review.css
    calendar.css
    settings.css
  domains/
    orders.css
    fulfillment.css
    finance.css
    reports.css
    products.css
    customers.css
    settlements.css
    settings.css
```

现有 `components.css` 和 `pages.css` 按职责迁移后删除。`styles/index.css` 是 renderer 唯一样式入口，`main.tsx` 只导入该入口。入口将 DayPicker 等第三方 CSS 显式导入 `vendor` 层，并声明以下固定顺序：

```css
@layer reset, vendor, foundations, primitives, composites, patterns, domains, utilities;
```

依赖与覆盖方向统一为 Foundations → Primitives → Composites → Patterns → Domains；`vendor` 只承载第三方基线，`utilities` 只承载经批准的无障碍或调试工具，不作为业务页面逃逸层。第三方 CSS 的导入位置和覆盖边界必须由构建与样式入口测试锁定，确认当前打包器支持 layered import 后才删除 `main.tsx` 中的独立导入。

领域 CSS 可以表达日历轨道、人员色标、商品编辑分栏、任务块和其他业务固有几何，也可以使用 `grid`、`flex` 和命名局部自定义属性。它不得覆盖共享组件内部 class，不得重新实现可由布局原语表达的通用空间关系，也不得直接散落通用视觉裸值。

## 6. 设计令牌

### 6.1 颜色

```text
canvas                 #F2F4F5
surface                #FFFFFF
surface-muted          #F6F7F8
surface-disabled       #ECEFF0

ink-strong             #20292C
ink                    #354144
ink-muted              #687477
ink-subtle             #8A9699
ink-disabled           #AAB2B4

border                 #DCE1E2
border-strong          #BDC8CA
border-focus           #60958F

brand                  #22665F
brand-hover            #1B554F
brand-soft             #E7F0EE
on-brand               #FFFFFF

success                #30725A
warning                #9A6B22
danger                 #B24943
info                   #356F9D
```

每个状态色提供 default、hover、soft、border 和 on-color。禁止渐变、装饰性色块和大面积品牌色背景。状态必须同时使用文字或图标，不能只靠颜色表达。

### 6.2 排版

```text
caption       12px / 18px
supporting    13px / 20px
body          14px / 22px
body-strong   14px / 22px / 600
section       16px / 24px / 600
page-title    20px / 28px / 700
workspace     24px / 32px / 700
```

页面不得直接指定字号、行高和字重。不使用响应式 `clamp()` 字号，不使用负字间距。金额、数量和日期使用 `tabular-nums`；编码可以使用等宽字体。24px 只用于独立工作区和关键经营结果。

### 6.3 间距

基础尺度为 `0/4/8/12/16/20/24/32/40px`。业务页面只使用 `control-inner-gap`、`field-gap`、`inline-gap`、`toolbar-gap`、`section-gap`、`page-gap`、`panel-padding`、`page-padding` 和 `overlay-padding` 等语义别名。

### 6.4 尺寸、圆角和阴影

```text
控制高度
  compact       32px
  standard      36px
  comfortable   40px

图标
  small         14px
  medium        16px
  large         20px

圆角
  control       5px
  panel         6px
  overlay       8px
  pill          999px
```

普通页面区块不使用阴影。阴影只用于菜单、Popover、Dialog 和 Sheet 等真实浮层。页面本身不再渲染成大圆角悬浮卡片。

### 6.5 动效与层级

动效只用于状态反馈和浮层进入/退出，定义 `motion-fast`、`motion-standard` 及统一 easing；不添加装饰性位移。`prefers-reduced-motion: reduce` 下关闭非必要动画并将必要过渡缩短到近乎即时。

浮层使用命名层级令牌，顺序固定为页面内容 < sticky/command bar < menu/popover/select < overlay < dialog/sheet < toast。禁止组件写任意 `z-index` 数字；`layering.test.ts` 应从新的样式入口验证令牌定义、消费关系和顺序。

## 7. 信息密度

| 密度        | 适用场景                     | 控件 | 表格行 | 区块间距 | 面板内距 |
| ----------- | ---------------------------- | ---: | -----: | -------: | -------: |
| compact     | 列表、工具栏、排班、核算     | 32px |   36px |     12px |  12–16px |
| standard    | 详情、常规表单、设置         | 36px |   44px |     20px |     20px |
| comfortable | 长流程、高风险确认、单据预览 | 40px |   48px |     24px |     24px |

顶层 Pattern 根节点设置 `data-density`，普通后代组件读取统一 CSS 语义变量。Pattern 同时通过密度上下文提供当前值；Dialog、Sheet、Popover、Select 等通过 Radix Portal 渲染的内容必须把该值显式写入 Portal 内容根节点，不能依赖页面 DOM 祖先继承。脱离 Pattern 独立渲染的测试、Story 或系统级浮层使用组件默认密度；只有组件契约明确允许时才能显式覆盖，并需测试覆盖。

## 8. 桌面窗口与响应式

Electron 窗口维持：

```text
默认窗口       1440 × 920
最小窗口       1100 × 720
宽屏验收       1920 × 1080
```

上述数值是 Electron `BrowserWindow` 外层边界，不假设它们等于 renderer 的 CSS viewport。三档验收先设置窗口边界，再记录 `webContents` 中实际的 `innerWidth × innerHeight`；断点行为按实测 viewport 触发。最小窗口验收必须覆盖 macOS 当前标题栏配置，确保真实可用内容区仍满足布局约束。

不支持低于最小窗口所得实际 viewport 的移动或平板流程。桌面适配范围以 renderer 实测宽度为准：

- 较窄桌面：压缩非关键留白、工具栏换行、调整双栏比例。
- 标准桌面：使用标准布局。
- 宽桌面：数据表与日历利用额外宽度，同时限制文本行长。

页面只保留两个经实测确定的适配点，初始候选为 `1280px` 和 `1440px`；P0 基线截图记录外层窗口与实际 viewport 的对应关系后固化最终值。组件优先通过自身容器宽度折行。表格和日历可在自身区域横向滚动，页面整体不得出现横向滚动。工具栏换行时控件按内容紧凑排列，不拉伸填满。

Electron 主进程的 `backgroundColor` 与 renderer `canvas` 必须来自同一主题常量或由同步测试约束，不能分别维护互相漂移的裸色值。P1 完成时将当前 `#f6f5f2` 与目标 canvas 的差异一并消除。

## 9. 组件状态与反馈

### 9.1 状态矩阵

按组件类别建立状态矩阵：所有可交互组件至少覆盖 default、hover、active、focus-visible 和 disabled；提交型动作按需覆盖 loading；字段控件按需覆盖 read-only 和 invalid；不适用状态在契约中标为 N/A，不为追求矩阵完整而增加无意义 props。页面只能传语义状态，不能通过 class 修改状态视觉。

### 9.2 动作层级

- 每页最多一个 primary。
- secondary 用于同级辅助动作。
- ghost 用于查看、返回和取消。
- danger 用于破坏性动作并配合确认。
- 熟悉的工具动作优先使用 Lucide 图标和 tooltip。
- 页面、区块和记录动作分别由 PageHeader、SectionHeader 和 RecordActionBar 承载。

### 9.3 字段结构

所有字段使用 Label + required/optional + Control + 固定 Hint/Error 消息槽。Hint 与 Error 共用固定高度，切换不引发布局跳动。Error 同时设置 `aria-invalid` 和 `aria-describedby`。只读值使用只读字段或详情项，不用 disabled 输入框代替。

### 9.4 四级反馈

| 层级   | 场景                           | 呈现                                      |
| ------ | ------------------------------ | ----------------------------------------- |
| 字段级 | 必填、格式、范围错误           | 字段下方轻量红字并标记控件                |
| 表单级 | 跨字段、整单校验失败           | 提交区附近汇总，并标红可定位字段          |
| 页面级 | 加载失败、前置条件缺失、无数据 | 页面内容区 Error/Empty/Prerequisite State |
| 全局级 | 保存成功、导出完成、动作失败   | 统一 Toast                                |

Toast 不承载可定位字段错误。成功和普通信息自动消失；危险错误保持到用户关闭。需要选择或确认时使用 Dialog。轻提示使用弱化局部说明，不使用警告横幅。同一事件只保留一个主要反馈出口。

## 10. 导航层级

- PrimaryTabs：页面主要工作视图或实体详情主要分区。
- SecondaryTabs：Primary 内容内的稳定子区域。
- SegmentedControl：局部数据视角或显示模式切换。
- 同一视觉层级只能使用一种组件。
- 页面最多同时展示两级导航。
- Tab 不触发保存、导出或打开弹窗。

## 11. 页面模式

### 11.1 AppShell

固定 216px Sidebar，右侧为 Workspace。Workspace 包含固定 CommandBar 和唯一 ScrollableContent。页面内容宽度由 Pattern 决定，不统一强制窄版。

### 11.2 布局原语

- `YumiPageStack`：页面纵向区块。
- `YumiCluster`：操作、筛选和标签的内容宽度排列。
- `YumiGrid`：受控 2/3/4 列布局。
- `YumiSplitLayout`：主内容与辅助摘要双栏。
- `YumiScrollArea`：表格、日历和浮层滚动。
- `YumiStickyActions`：长表单固定操作区。
- `YumiDivider`：语义分隔。

布局原语只解决空间关系，不包含业务文案和数据请求。业务 CSS 可以实现领域固有几何，但不得重复可由这些原语完整表达的通用 flex、grid、gap 和 padding 组合。

### 11.3 List Page

```text
PageHeader
PrimaryTabs?
MetricStrip?
ListSurface
├── ListToolbar
└── DataTable / EmptyState
```

列表主体只使用一个 Surface。搜索、筛选和计数位于 Toolbar；新建和导出位于 PageHeader；记录操作位于行内。默认 compact。

### 11.4 Detail Page

```text
PageHeader
EntitySummary
MetricStrip?
PrimaryTabs
Section[]
```

收敛 EntitySummary 与 RecordSummary。摘要不重复 Tab 完整明细；实体状态固定在摘要区；Section 不嵌套装饰性 Card。默认 standard。

### 11.5 Form Workspace

```text
PageHeader
WorkflowSteps?
SplitLayout
├── FormSections
└── StickySummary / Preview?
StickyActions
```

长表单使用全页工作区。多步骤流程显示编号步骤。字段按语义分组，持续变化的金额或成本可放在右侧预览。1100px 外层窗口下优先保持双栏并压缩辅助栏；确实无法容纳时才改为上下布局。Form Workspace 默认 standard；只有规范列明的长流程或高风险任务变体可由 Pattern 根切换为 comfortable，页面内部区块不得自行改变密度。

### 11.6 Dashboard Overview

```text
PageHeader
PrimaryTabs?
PeriodToolbar
MetricStrip
PrimaryInsight
DetailSections / DataTable
```

第一屏回答一个明确经营问题。指标统一使用 MetricStrip；经营结论和下钻明细分区。页面默认 standard，明细表使用 compact。

### 11.7 Review Workspace

```text
PageHeader
PrimaryTabs
QueueToolbar
UnifiedQueueTable
SelectionSummary?
Dialog / Full-page Task
```

同类事项进入统一队列，处理入口固定在记录行。短核对使用 Dialog，长流程进入全页 Task。队列 compact，处理表单 standard。

### 11.8 Calendar Workspace

```text
PageHeader
PrimaryTabs
CalendarToolbar
CalendarGrid
DetailDialog / AssignmentSheet
```

七日列宽、人员行高和任务块高度使用命名令牌。最小窗口允许日历区域横向滚动，不压缩到文字重叠。默认 compact。

### 11.9 Settings Workspace

```text
PageHeader
PrimaryTabs
SecondaryTabs?
FormSection / ResourceList
```

最多两级 Tab。局部类别切换使用 SegmentedControl。参数读取态和编辑态结构一致。默认 standard。

## 12. 页面归类

| 页面家族                           | 目标模式           |
| ---------------------------------- | ------------------ |
| 订单、客户、商品、人员主列表       | List Page          |
| 订单、客户、商品、结算详情         | Detail Page        |
| 订单创建、商品编辑                 | Form Workspace     |
| 工作台、经营报表、财务月度结果     | Dashboard Overview |
| 待核算、待退款、待报销、售后       | Review Workspace   |
| 排班、人员周历                     | Calendar Workspace |
| 工作室参数、资料库、通知、系统设置 | Settings Workspace |

每个路由级页面或由 AppShell 直接承载的顶层业务页面只能有一个主模式，并由 Pattern 根组件输出 `data-page-pattern` 与 `data-density`。嵌入其他页面的视图（例如嵌入模式的人员或派工视图）属于 Domain 或 Composite 内容，不渲染 Pattern 根、不重复 PageHeader，也不建立第二套页面滚动容器。局部可以嵌入表格、详情列表或 Dialog，但不能嵌套另一个完整 Page Pattern。

## 13. 迁移计划

### P0：规范基线

形成资产清单、目标架构、令牌、组件状态、反馈、导航、页面模式、功能矩阵、确定性基线数据、基线截图和静态治理规则。P0 记录现有裸值、旧 class、私有断点和未消费令牌的数量与位置，先启用“不得新增违规”的增量门禁，不要求旧页面立即清零。P0 不大规模迁移业务页面。

### P1：共享组件与布局原语

建立新令牌、唯一样式入口、基础组件、复合组件和布局原语，删除生产零使用组件。每个子批次只改一组有明确调用面的共享能力，并在合入前验证全部现有页面；共享组件的全局视觉变化不能等到 P3 才发现。

P1 不为了提前统一页面结构而修改业务页面。非破坏性内部实现可直接替换；需要改变 props、DOM 结构或布局职责的共享 API，必须在一个原子变更中更新全部调用点，或推迟到使用它的首个 P3 页面家族，不能引入兼容 props、双实现或适配层。摘要、指标、反馈等涉及页面组合关系的收敛在对应调用点可原子迁移时进行。完成 Foundations、Primitives、Composites 和布局原语的契约测试后进入 P2。

### P2：页面模式

基于 P1 的稳定组件，为七种 Pattern 完成根组件、结构化 API、密度、三档桌面窗口行为、加载/空态/错误态/溢出状态、示例和契约测试。Pattern 验证通过后才进入 P3 页面迁移。

### P3：页面迁移

```text
报表
→ 设置
→ 订单
→ 排班与核算
→ 财务、工资、工作台
→ 客户、商品、人员
```

每个页面家族单独完成、验证和评审，不跨批次留下半迁移页面。

## 14. 单批迁移流程

```text
现状截图与功能矩阵
→ 新模式契约测试先失败
→ 整页迁移
→ 组件与页面测试
→ 三档窗口真实验收
→ 功能保留复核
→ 删除旧 JSX/CSS
→ 检查无兼容残留
```

不同页面可短期处于新旧体系。同一页面不得长期混用两套 PageHeader、Tabs、表单布局、反馈方式、摘要、通用间距或响应式规则。每批在删除旧 JSX/CSS 前保留可逆检查点；若功能矩阵或真实窗口验收失败，回退该页面家族的原子变更，而不是增加兼容层。完成迁移的页面立即启用该页面范围内的严格零违规门禁，未迁移页面继续受 P0 增量门禁约束。

## 15. 自动化治理

静态护栏检查：

- 业务层不得使用原生 button/input/select/textarea 或直接依赖 Radix。
- 除令牌文件外不得新增裸颜色、字号、间距、圆角、阴影、控件高度和页面断点。
- 领域固有尺寸必须使用有业务含义的局部自定义属性，并进入审查过的窄范围 allowlist；allowlist 不接受通用间距、颜色或控件尺寸。
- 页面不得覆盖共享组件内部 class。
- 每个路由级或 AppShell 直接承载的业务页面必须渲染一种明确的 Pattern 根组件，由根组件输出稳定的 `data-page-pattern`；嵌入式视图不得输出 Pattern 根。自动化测试据此验证归类与禁止嵌套。
- 禁止手写页头、Tab、工具栏、字段消息、状态标签和通用卡片容器。
- 禁止新增未使用共享导出、未消费令牌和悬空令牌引用。
- CSS 依赖方向只能是 Foundations → Primitives → Composites → Patterns → Domains，导入和选择器覆盖关系均需验证。

P0 先快照既有违规并阻止数量或范围增长；P1 对已迁移的 Foundations、Primitives 和 Composites 启用严格检查；P2 对 Patterns 启用严格检查；P3 每迁移一个页面家族就清零并锁定其 Domains 违规。只有在全部页面家族完成后，才启用仓库级零裸值、零旧 class 和零私有断点门禁。基线文件必须列出具体文件和规则类别，不能只保存一个可被新增与删除互相抵消的总数。

现有 `app-components.test.ts` 和 `layering.test.ts` 依赖旧 CSS 文件名及源码字符串断言，CSS 拆分时必须同步迁移为针对唯一入口、级联层和最终渲染契约的检查；源码护栏不能替代 render-level 测试。

组件契约测试检查状态矩阵、键盘操作、焦点恢复、ARIA 关联、loading 布局稳定、消息槽稳定，以及极端文案下的溢出行为。Portal 组件额外检查密度传播、层级顺序、关闭后焦点恢复和 reduced-motion。

## 16. 视觉与功能验收

固定窗口：

```text
1100 × 720
1440 × 920
1920 × 1080
```

每个验收结果同时记录外层窗口尺寸与 renderer 实际 viewport。每页验证默认数据、加载、空态或筛选无结果、错误、最长中文文案、最大金额和数量、多按钮、disabled/loading，以及 Dialog、Sheet、Popover 展开状态。页面整体不得横向滚动，不得出现重叠、截断、跳动和异常留白。

截图与交互验收使用版本化的确定性 fixture 或隔离测试数据库，固定日期、时区、排序和随机数据，禁止为截图写入真实用户数据库。确需使用真实数据核对信息密度时只允许只读打开，并将其作为人工补充证据，不作为可重复基线。

每页建立功能矩阵，覆盖入口、可见数据、筛选、搜索、创建、编辑、状态变更、详情、导出、错误反馈、键盘操作、返回和上下文恢复。视觉任务不得通过隐藏功能、静态占位或吞掉错误获得通过。

除页面矩阵外，迁移必须显式保留并执行已存在的高价值业务链路：订单 → 制作 → 计时工序 → 锁边/包装 → 部分发货 → 工资核算 → 财务与报表。该链路以 `src/main/application/v2-work-time-payroll.e2e.test.ts` 为当前自动化证据；UI 入口、状态显示和结果口径还需在相关页面家族迁移时逐段核对。

## 17. 工程验证

每批至少执行：

- 受影响组件和页面的 Vitest。
- 全量 renderer 回归。
- ESLint 和 Prettier 检查。
- `git diff --check`。
- `pnpm build`。
- 独立 TypeScript 检查配置，不依赖当前 no-op 的 `pnpm typecheck`。
- Electron 真实页面检查和截图。
- 控制台错误、网络失败和运行时异常检查。

避免运行会破坏 `better-sqlite3` ABI 的 `pnpm test` 或 `npm rebuild` 路径。使用定向 `pnpm exec vitest run` 和项目原生模块恢复脚本。

## 18. 完成标准

- 所有生产顶层页面归入明确 Pattern，嵌入式视图无嵌套 Pattern。
- 所有共享组件使用新令牌和适用状态契约；Portal 内容正确继承 Pattern 密度。
- renderer 只有一个受测试约束的 CSS 入口，级联层、第三方样式和浮层层级顺序稳定。
- 不存在零使用共享组件：`zeroProductionUse` 基线仅保留两类例外——规格明确交付的布局原语（4.6 的 `YumiPageStack`/`YumiCluster`/`YumiGrid`/`YumiScrollArea`/`YumiDivider`，附结构契约测试，作为页面模式构建能力随 P3 接线）与组件内部活跃实现（`YumiPageActions`/`YumiSectionHeader` 由 PageHeader 渲染、`YumiNotification`/`YumiNotificationHost` 由 NotificationProvider 渲染、`useYumiNotification` 支撑 `useYumiNotificationMessage`，作为内部细节保留）；两类均在 `zeroProductionUse` 基线登记并由契约用例覆盖，其余导出全部由生产页面或同层共享组件消费。
- 不存在旧 class、兼容 props 或双套反馈方式。
- P0 基线违规已全部清零，仓库级零裸值、零旧 class 和零私有断点门禁启用。
- 所有功能保留矩阵和关键业务链路通过。
- 三档 BrowserWindow 外层尺寸及其实际 renderer viewport 视觉验收通过。
- 自动测试、构建和运行时检查通过。
- 最终 UI 资产清单、代码和规范一致。

## 19. 保护边界

当前工作区包含未提交的财务总览相关改动。P0/P1 实施不得覆盖、回退或误提交这些既有改动。涉及同一文件时必须按 hunk 区分本次变更与既有 WIP。
