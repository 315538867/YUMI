## Context

本变更以 `/Volumes/code/YUMI/.superpowers/brainstorm/11232-1789110636/content/11-current-functional-screen-catalog.html` 的完整界面目录为视觉验收基线，但只落地目录中已有领域事实能支持的页面、字段和动作。当前产品已实现订单优惠、订单商品折扣、按发货批次导出 XLSX 清单、发货批次快照及作废；这些能力不重做数据模型，只补入新的界面结构与回归测试。

当前商品只保存 `makingCommissionCents`，订单快照、制作任务、结算任务都缺少商品级捏毛装袋提成。已有 `process_tasks.piece_rate_cents` 可以冻结任务费率，因此本变更在商品与订单快照补齐来源字段，并让捏毛装袋任务写入该字段，避免结算时再读取可变的全局费率。

## Goals / Non-Goals

**Goals**

- 建立单一 CSS 语义令牌源和可复用 UI 组件，使全量经营页面按同一密度、动作层级和状态规则实现。
- 以客户、交付、资金和生产事实重构订单详情，提供“概览 / 排班 / 发货 / 资金 / 盈利 / 售后”六个稳定标签。
- 在不改变批次快照语义的前提下，让负责人在订单中查看某一已保存批次的发货清单，并从同一处导出 XLSX。
- 将商品级捏毛装袋提成从商品资料冻结到订单、排班任务和结算扣款，且兼容历史数据。

**Non-Goals**

- 不将包装成本自动转化为“打包计件提成”，也不新增打包计件工资。
- 不改变订单优惠、订单商品折扣、作废批次、订单/发货清单导出的业务规则。
- 不以新 UI 自动决定售后责任、工资实发、排班或资金事实。
- 不新增图表库；工作台与报表仅使用现有数据和轻量 CSS/SVG 图形表达必要趋势。
- 不将设计目录中的示例数据写入生产数据，也不把静态目录作为运行时页面。

## Architecture and Data Flow

### 1. 设计令牌与组件边界

`src/renderer/styles/tokens.css` 作为唯一原始令牌源；`base.css` 只负责重置与可访问性基础，`components.css` 只消费语义令牌，`pages.css` 仅组织页面布局，禁止页面内硬编码颜色、阴影、半径和间距。

令牌分为四层：

| 层级     | 代表令牌                                                                                                               | 约束                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 基础色板 | `--yumi-pigment-zhuqing-*`、`--yumi-pigment-tenghuang-*`、`--yumi-neutral-*`                                           | 仅在 tokens 文件中使用       |
| 语义色   | `--yumi-color-canvas`、`--yumi-color-surface`、`--yumi-color-text-*`、`--yumi-color-action-*`、`--yumi-color-status-*` | 组件与页面只可使用这一层     |
| 尺度     | `--yumi-space-*`、`--yumi-radius-*`、`--yumi-shadow-*`、`--yumi-font-size-*`、`--yumi-content-*`                       | 统一布局、密度、数字和断点   |
| 组件别名 | `--yumi-button-primary-*`、`--yumi-table-*`、`--yumi-sheet-*`                                                          | 仅组件内部使用，映射到语义色 |

视觉采用克制的“中国色系”而非大面积高饱和渐变：画布 `#F4F2EC`（暖宣纸）、表面 `#FFFDF8`（绢白）、正文 `#263436`（深黛）；主动作使用竹青 `#276D67`，悬停 `#1F5B56`，浅色反馈 `#E2EFEB`；辅助强调使用藤黄 `#C88F31`，浅色反馈 `#F8EDD8`；危险状态使用赭红 `#B7514A`。仅页面顶层背景或非数据装饰可使用 `--yumi-gradient-wash: linear-gradient(135deg, #E6F0EA 0%, #F8EDD8 100%)`，按钮、表格行、表单和金额卡不得使用渐变。实现时以文本、边框和焦点对比度测试为准，保证键盘焦点可见。

在保留现有 `YumiButton`、`YumiTabs`、`YumiMetricStrip`、`YumiDataTable`、`YumiDetailList`、`YumiFormSection`、`YumiSheet`、`YumiStatusTag` 等 API 的基础上，扩展或新增以下边界：

- `YumiPageHeader`：支持实体副标题/元信息、紧凑操作组和溢出禁止模式；当前可执行的实体动作必须显式渲染，危险动作仍留在对应记录和确认流。
- `YumiEntitySummary`：承载客户优先的订单摘要、四项以内核心指标及窄屏折行；不作为空白大卡片占位。
- `YumiRecordActionBar`：为列表/表格行提供“查看、导出、作废”等可访问的完整动作，不使用“更多”隐藏常用动作。
- `YumiSnapshotNotice`：说明订单、发货或费率来自何时冻结的事实，包含来源与只读提示，不伪造可编辑状态。
- `YumiDocumentPreview`：使用现有 `V2ShippingListDocument` 的只读字段展示抬头、物流、状态、商品和数量列；导出按钮始终复用原 XLSX 导出动作。

### 2. 页面落地和信息层级

应用壳保留现有导航语义（工作台、订单、排班、工资、财务、报表、客户、商品、设置），统一为固定左侧导航、轻量顶栏和可纵向扫描的内容工作区。桌面内容区最大宽度、间距、表格横滚与窄屏折行均以布局令牌定义。

页面采用下列规则：

1. 默认进入列表或只读详情；新建/编辑使用 `YumiSheet` 或详情工作区的明确入口，不能在列表旁长期展开完整表单。
2. 页面只有一个突出主操作；同等级的次要操作采用普通按钮。发货、资金、售后等子记录动作归属记录行或对应标签，不上浮到订单概览。
3. 订单详情头部主标题显示客户名和业务状态，次行显示订单日期、交付日期、收款/发货状态，订单号作为辅助小号元信息；右侧显示现有可执行订单级动作而不使用“更多”。
4. 订单概览仅呈现订单商品、紧凑金额摘要、客户/交付档案和一条排班摘要；“排班”标签呈现完整关联班次及查看/进入班次动作；“盈利”标签读取既有订单经营报表口径，明确区分已知核算成本与利润参考，不能将未发生或无法归属的工资伪装为已发生实际成本。
5. 发货标签默认先显示批次列表和“新增发货”入口。点击“查看发货清单”后才打开预览，不预先展示可填写的登记表单；每条批次的“导出本批清单”和“作废本批”均可见。
6. 商品页在只读详情和新建/编辑抽屉中将“制作提成”“捏毛装袋提成”并列为两个明确字段；包装成本与两项计件提成在不同分组中展示。

### 2.1 逐屏视觉还原与验收边界

静态目录 `/Volumes/code/YUMI/.superpowers/brainstorm/11232-1789110636/content/11-current-functional-screen-catalog.html` 是唯一视觉基线，共 40 屏。它不只是灵感图或展示页：每一屏都对应真实 renderer 页面中可到达的列表、详情、标签、抽屉、预览或确认态。实现不得用“复用某个通用卡片”替代目录所定义的信息层级。

- **还原粒度：** 先还原应用壳，再按目录顺序还原 `01` 工作台、`02` 订单列表/新建、`03` 订单详情及其 7 个子态、`04` 排班、`05` 工资、`06` 财务、`07` 报表、`08` 客户、`09` 商品、`10` 设置。每完成一屏只修改该屏关联的页面、组件和样式，禁止为了“统一风格”回退已核准的其他屏。
- **信息层级：** 订单详情以客户、交付和资金为一级信息，订单编号只作为辅助元信息；列表、表格、摘要和动作栏的列数、宽度、密度、对齐和位置必须以目录对应屏为准。不得以低密度三列卡片、泛化的“订单档案”或隐藏到“更多”的常用动作取代设计图。
- **状态一致性：** 目录中“点击后”的抽屉、清单预览和危险确认必须在真实页面保留同样的入口和关闭后返回上下文；目录中的数据仅作为状态展示样例，真实页面仍只消费当前已有领域事实，不能因为视觉还原虚构 API 或字段。
- **验收方法：** 每屏在用户已运行的 Electron 调试环境中从真实导航进入，与同编号目录屏进行并排比对；比对项至少包括应用壳、标题/元信息、动作组、主内容排列、表格/指标密度、标签、抽屉/确认态与空状态。测试可验证可达性、文案与关键结构，但不能取代逐屏截图/人工视觉验收。

#### 2.2 40 屏真实入口映射（还原台账）

下表中的“待还原”只表示**真实 Electron 视觉验收尚未完成**，不能因为已有路由、通用组件或静态目录就标记视觉完成。每屏已有的 DOM/交互测试用于验证源码结构、可达性与功能边界；40 屏的源码还原与自动化验证已完成，最终视觉完成条件仍是 `6.11` 的 Electron 截图并排验收。

| 目录屏                | 真实入口 / 触发动作              | 真实页面与主状态                                                                                                             | 回归测试                                                                | 视觉状态 |
| --------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| 01 工作台（总览）     | 主导航“工作台”→“总览”            | `pages/app.tsx` + `pages/workbench/index.tsx`，`view=workbench`、`initialView=decision`                                      | `app-components.test.ts`、`workbench/index.test.tsx`                    | 待还原   |
| 01-A 需要我决定       | 工作台→“需要我决定”              | `pages/workbench/index.tsx`，`view=decision`                                                                                 | `workbench/index.test.tsx`                                              | 待还原   |
| 01-B 可以推进         | 工作台→“可以推进”                | `pages/workbench/index.tsx`，`view=advance`                                                                                  | `workbench/index.test.tsx`                                              | 待还原   |
| 02 订单列表           | 主导航“订单”                     | `pages/orders/index.tsx`，`workspaceMode=list`                                                                               | `orders/index.test.tsx`                                                 | 待还原   |
| 02-A 新建订单         | 订单列表→“新建订单”              | `pages/orders/index.tsx`，`workspaceMode=create`                                                                             | `orders/index.test.tsx`                                                 | 待还原   |
| 03 订单详情（概览）   | 订单列表→订单行 / 工作台订单事项 | `pages/orders/index.tsx`，`workspaceMode=detail`、`detailView=overview`                                                      | `orders/index.test.tsx`                                                 | 待还原   |
| 03-A 订单盈利         | 订单详情→“盈利”                  | `pages/orders/index.tsx`，`detailView=profit`、`OrderProfitPanel`                                                            | `orders/index.test.tsx`                                                 | 待还原   |
| 03-B 发货记录         | 订单详情→“发货”                  | `pages/orders/index.tsx`，`detailView=fulfillment`                                                                           | `orders/index.test.tsx`                                                 | 待还原   |
| 03-B-1 本批发货清单   | 发货批次→“查看发货清单”          | `pages/orders/index.tsx` + `components/ui/document-preview/`，批次预览态                                                     | `orders/index.test.tsx`、`components/ui/document-preview/*.test.tsx`    | 待还原   |
| 03-C 新增发货记录     | 发货标签→“新增发货”              | `pages/orders/index.tsx` + `components/ui/sheet/`，新增批次抽屉                                                              | `orders/index.test.tsx`、`components/ui/sheet/yumi-sheet.test.tsx`      | 待还原   |
| 03-D 订单排班         | 订单详情→“排班”                  | `pages/orders/index.tsx`，`detailView=schedule`                                                                              | `orders/index.test.tsx`                                                 | 待还原   |
| 03-E 订单资金         | 订单详情→“资金”                  | `pages/orders/index.tsx`，`detailView=funds`                                                                                 | `orders/index.test.tsx`                                                 | 待还原   |
| 03-F 登记收款         | 订单资金→“登记收款/退款”         | `pages/orders/index.tsx` + `components/ui/sheet/`，资金登记抽屉                                                              | `orders/index.test.tsx`、`components/ui/sheet/yumi-sheet.test.tsx`      | 待还原   |
| 03-G 订单售后         | 订单详情→“售后”                  | `pages/orders/index.tsx`，`detailView=after_sales`                                                                           | `orders/index.test.tsx`                                                 | 待还原   |
| 04 排班               | 主导航“排班”                     | `pages/fulfillment/index.tsx`，`workspaceMode=queue`、`overview=orders`                                                      | `fulfillment/index.test.tsx`                                            | 待还原   |
| 04-A 人员周视图       | 排班→“人员视图”                  | `pages/fulfillment/index.tsx` + `components/fulfillment/dispatch-views.tsx`，`overview=workers`                              | `fulfillment/index.test.tsx`                                            | 待还原   |
| 04-B 任务处理         | 排班队列→处理订单/任务           | `pages/fulfillment/index.tsx` + `pages/work-assignments/index.tsx`，`workspaceMode=processing`、`processingView=assignments` | `fulfillment/index.test.tsx`、`work-assignments/index.test.tsx`         | 待还原   |
| 04-C 负责人调整       | 任务处理→调整负责人              | `pages/work-assignments/index.tsx` + `components/fulfillment/dispatch-views.tsx`，负责人调整抽屉                             | `work-assignments/index.test.tsx`                                       | 待还原   |
| 04-D 补录期初在制品   | 排班→“补录期初在制品”            | `pages/fulfillment/index.tsx`，`processingView=opening_wip`                                                                  | `fulfillment/index.test.tsx`                                            | 待还原   |
| 05 工资               | 主导航“工资”                     | `pages/settlements/index.tsx`，列表默认态                                                                                    | `settlements/index.test.tsx`                                            | 待还原   |
| 05-A 工资结算详情     | 工资列表→结算记录                | `pages/settlements/index.tsx` + `components/settlement/settlement-detail.tsx`，详情态                                        | `settlements/index.test.tsx`                                            | 待还原   |
| 05-B 待退款           | 工资→“待退款”                    | `pages/settlements/index.tsx`，退款工作视图                                                                                  | `settlements/index.test.tsx`                                            | 待还原   |
| 05-C 人员与时薪       | 工资→“人员与时薪”                | `pages/settlements/index.tsx`，人员费率工作视图                                                                              | `settlements/index.test.tsx`                                            | 待还原   |
| 06 财务               | 主导航“财务”                     | `pages/finance/index.tsx`，`workspaceView=overview`                                                                          | `finance/index.test.tsx`                                                | 待还原   |
| 06-A 现金流水         | 财务→“现金流水”                  | `pages/finance/index.tsx`，`workspaceView=entries`                                                                           | `finance/index.test.tsx`                                                | 待还原   |
| 06-B 登记日常收支     | 财务→“登记收支”                  | `pages/finance/index.tsx` + `components/ui/sheet/`，收支登记抽屉                                                             | `finance/index.test.tsx`、`components/ui/sheet/yumi-sheet.test.tsx`     | 待还原   |
| 06-C 待报销           | 财务→“待报销”                    | `pages/finance/index.tsx`，`workspaceView=reimbursements`                                                                    | `finance/index.test.tsx`                                                | 待还原   |
| 07 经营报表           | 主导航“报表”                     | `pages/reports/index.tsx`，经营总览                                                                                          | `reports/index.test.tsx`                                                | 待还原   |
| 07-A 报表风险处理     | 报表→风险处理入口                | `pages/reports/index.tsx`，风险处理/跳转态                                                                                   | `reports/index.test.tsx`                                                | 待还原   |
| 08 客户               | 主导航“客户”                     | `pages/customers/index.tsx`，列表默认态                                                                                      | `reference-pages.test.tsx`                                              | 待还原   |
| 08-A 客户详情         | 客户列表→“查看客户资料”          | `pages/customers/index.tsx`，客户详情态                                                                                      | `reference-pages.test.tsx`                                              | 待还原   |
| 08-B 新建客户         | 客户列表→“新建客户”              | `pages/customers/index.tsx` + `components/ui/sheet/`，新建客户抽屉                                                           | `reference-pages.test.tsx`、`components/ui/sheet/yumi-sheet.test.tsx`   | 待还原   |
| 09 商品               | 主导航“商品”                     | `pages/products/index.tsx`，列表默认态                                                                                       | `reference-pages.test.tsx`                                              | 待还原   |
| 09-A 商品详情         | 商品列表→查看商品                | `pages/products/index.tsx`，商品详情态                                                                                       | `reference-pages.test.tsx`                                              | 待还原   |
| 09-B 新建商品         | 商品列表→“新建商品”              | `pages/products/index.tsx` + `components/ui/sheet/`，新建商品抽屉                                                            | `reference-pages.test.tsx`、`components/ui/sheet/yumi-sheet.test.tsx`   | 待还原   |
| 10 设置               | 主导航“设置”                     | `pages/settings/index.tsx`，`workspaceView=studio`                                                                           | `reference-pages.test.tsx`                                              | 待还原   |
| 10-A 计算公式         | 设置→“计算公式”                  | `pages/settings/index.tsx`，`workspaceView=formulas`、`CalculationFormulaCatalog`                                            | `reference-pages.test.tsx`                                              | 待还原   |
| 10-B 财务资料         | 设置→“财务资料”                  | `pages/settings/index.tsx`，`workspaceView=finance`                                                                          | `reference-pages.test.tsx`                                              | 待还原   |
| 10-C 数据保护         | 设置→“数据保护”                  | `pages/settings/index.tsx`，`workspaceView=protection`、`DataProtectionPanel`                                                | `reference-pages.test.tsx`                                              | 待还原   |
| 10-D 恢复备份二次确认 | 数据保护→选择备份→“恢复”         | `pages/settings/index.tsx` + `components/ui/dialog/`，危险确认对话框                                                         | `reference-pages.test.tsx`、`components/ui/dialog/yumi-dialog.test.tsx` | 待还原   |

### 3. 商品级捏毛装袋提成的事实链路

字段命名统一为 `fluffingBaggingCommissionCents`，单位为分/件，范围为非负整数。

1. 新增迁移版本 17：在 `products` 增加 `fluffing_bagging_commission_cents INTEGER NOT NULL DEFAULT 0 CHECK(... >= 0)`。历史产品得到 0，不回填或猜测历史费率。
2. 更新 `V2Product`、`V2ProductInput`、`V2ProductOrderSnapshot`、商品仓储映射和商品表单；订单创建及订单内容确认将该字段写入 `product_snapshot_json`。旧快照字段缺失时读取为 0。
3. 在 `FulfillmentService.createTask` 中：制作任务沿用 `makingCommissionCents`；捏毛装袋任务在关联订单商品时默认使用该订单商品快照的 `fluffingBaggingCommissionCents`，并写入已有 `process_tasks.piece_rate_cents` 和 `rate_snapshot_json`。负责人显式覆盖费率的现有输入约束如保留，必须在 UI 明确标明“本次任务覆盖”，且不会改写订单快照。
4. 结算服务继续只按任务中已冻结的 `pieceRateCents` 计算合格提成和不合格提成扣款；历史任务缺失或为 `null` 时按 0 兼容，绝不在结算时从当前商品资料或可变全局设置回读。
5. 商品成本、订单盈利与运费：产品成本函数继续只计算材料、包装、配饰、替换袋和缝边内部成本；不包含运费。订单“盈利”首期展示既有已知核算成本/利润参考，并在字段旁说明其已确认口径。制作与捏毛的实际工资、提成在任务/结算事实层分别显示，不把尚未确认的计划工资混入已知核算利润。

### 4. 发货清单预览与快照读取

现有 `ReportService.getShippingListDocuments({ orderId, shipmentId })` 已以 `shipment_document_snapshots` 为指定批次的来源，导出服务同样依赖它。新增只读 IPC `v2:reports:shipping-list:preview`：输入必须同时包含订单标识和发货批次标识，返回对应的 `V2ShippingListDocument`（找不到或不属于该订单时返回明确领域错误）。其链路是：

`ReportService` → `registerReportIpc` → `window.yumiV2.reports.getShippingListPreview` → 订单 composable → `YumiDocumentPreview`。

预览不得写入、重算或替换快照；作废批次仍返回作废状态、日期与原因。导出动作保持调用 `exportShippingList({ orderId, shipmentId })`，因此预览和 XLSX 的抬头、物流、商品、数量、累计和待发数据使用同一快照事实。

## Testing and Verification

- 设计令牌/组件：Vitest + Testing Library 检查语义 class、可访问名称、键盘焦点、动作是否可见，避免只用快照测试；用浏览器人工核对完整静态目录的代表页（工作台、订单列表/详情六标签、商品编辑、发货清单、工资、财务、报表、设置）。
- 数据迁移：内存 SQLite 迁移测试验证新列默认 0、现有产品可读写、旧订单快照缺字段不崩溃。
- 订单与排班：服务测试验证创建/修改订单冻结两项提成；捏毛任务默认取得订单快照费率，后续商品修改不影响旧任务；合格和不合格结算使用任务冻结费率。
- 发货预览：IPC、服务和 renderer 测试验证仅允许按订单的指定批次读取，预览字段与导出来源一致，作废批次保留标识；导出和预览均不产生发货记录。
- 回归命令：`pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm format:check`，并对实际运行中的本地调试环境进行人工点击核验，不由代理启动新的常驻开发服务。

## Risks and Decisions

- **历史快照风险：** 历史订单不具备新费率。采用可选字段加 0 默认值，禁止从当前商品资料回填，保证历史工资/报表不静默变化。
- **利润口径风险：** 工资结算可能跨订单且最终实发由负责人确认，不能精确自动分摊到单订单。盈利标签明确为“利润参考”，只展示既有可追溯已知成本，不将计划或跨单实发混为实际成本。
- **视觉回归风险：** 先替换令牌和基础组件，再逐模块迁移；每次迁移需保持既有 IPC 与领域动作，并用代表屏和交互测试验收。
- **开放问题：** 无。本方案明确将打包维持为商品成本、将捏毛装袋计件费率设为商品级冻结字段；若未来需要打包计件，应作为独立变更，不能复用包装成本字段。
