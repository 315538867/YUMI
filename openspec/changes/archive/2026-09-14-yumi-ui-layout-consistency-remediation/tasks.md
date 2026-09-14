## 0. 基线、范围与回归边界

> **顺序复核（2026-09-13）**：在 0.x 基线、范围与回归边界全部具备证据前，1.x–5.x 的历史勾选一律重置为待复核。现有代码保留，但不得据此提前宣称任务完成。

- [x] 0.1 固化真实页面清单：订单列表、订单详情六个 Tab、排班订单视角/人员周历、期初在制品、客户列表/客户详情、商品列表、工资三个 Tab、月度经营、设置四个 Tab；逐页记录当前入口、页面级 Tab、页头动作、区块动作、返回路径和详情承载方式。
- [x] 0.2 为每个页面标注本变更允许修改的范围：共享页头/工具栏/表格样式可跨页调整；业务字段、接口、计算公式、数据归属和已有操作语义不得修改；客户详情仅允许迁移读取态承载方式。
- [x] 0.3 建立视觉验收记录模板，固定桌面视口与窄屏视口、页面 URL/hash、检查项和截图命名；不以“看起来差不多”作为完成标准。
- [x] 0.4 先运行受影响测试并保存基线结果；基线失败必须记录为既有问题，不得把未修复的旧失败伪装成回归通过。
- [x] 0.5 核对订单详情、发货清单、盈利、优惠、缝边/定制服务、运费和公式设置的 renderer → preload/bridge → service → contract 调用链；缺失 API 或后端能力必须单独记录，未经 OpenSpec 变更不得用假数据补齐。

## 当前实施进度（2026-09-14）

- **当前执行：7.1–7.4 自动验证已完成并取证；剩余 3.7、4.7、5.7、6.3、6.6、7.5–7.8 依赖真实 Electron 运行或验收收口**
- 6.x 本轮改动：订单详情概览移除与发货 Tab 重复的“最近发货”表（6.4）；修复悬空 token `--yumi-border-subtle` 并新增 `token-integrity.test.ts`（6.1）；建立 `order-detail-capability-matrix.md`（6.7）。
- 排班回归：修复 3 个随真实日期过期的硬编码断言（周历任务卡日期、补录期初 occurredOn、自然周切换范围），改为运行时本地日期计算；排班 10 项测试全部通过。
- 已完成：1.7 审查设置、商品、工资、报表、客户和排班的标题/副标题：设置四个区域标题本身已承载对象；报表页头补充当前统计月份 meta；商品、客户页头补充可见数量 meta；工资页头补充人员范围 meta；排班页头按视角提供说明，审查后确认无需再改。
- 已完成：1.8 为订单详情、设置、排班、客户、商品、工资和报表补齐页面级结构测试：统一断言页头、Tab、动作组与首个内容区的 DOM 顺序和可访问名称（订单详情新增六 Tab 结构测试；客户新增页头/工具条/表格顺序测试；商品骨架测试补充页头动作组断言；设置、排班、工资、报表此前已有结构测试）。
- 已完成：1.1 已验证共享页头的导航、对象信息与业务动作分层；排班页已将“订单视角 / 人员周历”从内容级分段控件迁移为页面级主 Tab，DOM 顺序固定为“页头 → 主 Tab → 阶段指标 → 队列内容”。
- 已完成：1.2 已对排班、工资、财务、设置建立页面级 Tab 回归断言，统一验证“页头 → 主 Tab → 内容区”的顺序；切换 Tab 后页头动作组不移动。工资页已将“新建结算”固定为整个工资工作区的页头动作，避免切到“人员与时薪”后动作组消失。
- 已完成：1.3 已在共享页头提供类型化 `navigation` 入口，导航独立渲染于页头 leading 区，业务动作继续使用兼容的 `actions` API。
- 已完成：1.4 已统一共享页头栈的间距与窄屏规则：桌面端收紧为 `--yumi-space-4`，窄屏将动作组移至独立行，手机端编号元数据换行，避免标题与按钮互相挤压。
- 已完成：1.5 已验证订单详情、排班任务处理、期初在制品、客户详情的返回入口均通过共享 `navigation` 承载；返回后分别回到订单列表、排班队列或客户列表，未混入页面业务动作组。顺带将排班转派测试的日期断言改为运行时本地日期，消除 2026-09-14 触发的硬编码日期脆弱性。
- 已完成：1.6 已验证订单详情六个 Tab 固定为“概览 / 排班 / 发货 / 资金 / 盈利 / 售后”；任意切换后共享页头、返回导航、右侧“发货汇总 / 导出订单表 / 编辑订单”动作组保持同一实例与位置。
- 已验证：订单详情、排班任务处理/期初在制品、客户详情的 4 项定向 Vitest 回归，以及订单详情六 Tab 共同页头回归通过；`pnpm exec tsc --noEmit` 与 `git diff --check` 通过。
- 仍待处理：3.7、4.7、5.7、6.3、6.6、7.5–7.8（真实 Electron 逐屏验收与最终收口）；本项不代表整套 OpenSpec 已完成。

## 1. 页面级骨架：页头、导航、标题和 Tab

- [x] 1.1 为 `YumiPageHeader` 增加失败测试：导航上下文单独位于页头左侧/上方；返回按钮不出现在 `页面动作` group；title、meta、description 可同时表达对象、编号、状态或日期。
- [x] 1.2 为页面级 Tab 增加失败测试：Tab 位于页头之后、内容区之前；切换 Tab 不改变页头动作组的位置；不存在把 Tab 渲染到内容中间的页面专用结构。
- [x] 1.3 在 `src/renderer/components/ui/page-header/yumi-page-header.tsx` 增加类型化的 navigation 入口，明确导航与业务 actions 的语义边界；保持现有 actions API 兼容。
- [x] 1.4 在 `src/renderer/styles/components.css` 统一页头栈、导航行、标题行、信息元、说明和动作组的间距、对齐、换行及窄屏行为；禁止用页面私有大 margin 把 Tab 推到中部。
- [x] 1.5 迁移订单详情、排班、期初在制品、客户详情四个已有返回入口到 navigation；保留返回目标和原有路由/hash 行为。
- [x] 1.6 审查订单详情六个 Tab 的共同页头：固定顺序“概览 / 排班 / 发货 / 资金 / 盈利 / 售后”，页头信息和右侧动作在各 Tab 保持不变；只调整归属与位置，不改 Tab 内容业务。
- [x] 1.7 审查设置、商品、工资、报表、客户和排班的标题/副标题：删除无信息价值的泛化说明，补充已有数据中的对象、状态、范围或日期；不得新增后端字段。
- [x] 1.8 为订单详情、设置、排班、客户、商品、工资和报表补页面级结构测试，至少断言页头、Tab、动作组和首个内容区的 DOM 顺序与可访问名称。
- [x] 1.9 为订单详情和排班补页头动作测试：编辑、导出、进入处理、补录等当前流程所需的高频按钮全部直接可见；不得把完成主流程所需的按钮收进“更多”，返回也不得出现在业务按钮组中。

## 2. 共享列表工具栏与表格稳定性

- [x] 2.1 为 `YumiListToolbar` 增加失败测试：单个筛选、Fragment 多筛选、数组多筛选都展开为独立槽位；搜索、筛选、统计拥有稳定 class/语义；统计不被筛选控件挤压。
- [x] 2.2 为工具栏增加响应式失败测试：桌面端不堆叠，窄屏按断点换行，select/input 不出现压缩为不可读宽度或按钮变形。
- [x] 2.3 在 `src/renderer/components/ui/list-toolbar/yumi-list-toolbar.tsx` 实现 Fragment/数组递归展开和独立 filter item 容器；保持现有 `filters`、`search`、`countLabel` 调用兼容。
- [x] 2.4 在 `src/renderer/styles/components.css` 统一工具栏布局：桌面端搜索占剩余空间，筛选项固定可读宽度，统计固定不收缩；1024px 以下才允许折行，640px 以下转为全宽单列。
- 已验证（2026-09-14）：先将工具栏组件和样式临时回退到 `HEAD`，新增的 Fragment/数组筛选槽位与响应式布局契约测试稳定失败；恢复实现后运行 `pnpm exec vitest run src/renderer/components/ui/list-toolbar/yumi-list-toolbar.test.tsx src/renderer/styles/list-toolbar-layout.test.ts`，7/7 通过。
- [x] 2.5 迁移并验证订单列表的资金状态、交付排班两个筛选；确认两个筛选同一行、统计不换到奇怪位置，搜索框与筛选控件高度一致。
- 已验证（2026-09-14）：订单页面以共享工具栏的两个独立 filter item 传入“资金状态”和“交付排班”，搜索与筛选位于 controls，统计为 controls 外同级节点；`pnpm exec vitest run src/renderer/pages/orders/index.test.tsx`，26/26 通过。
- [x] 2.6 回归商品、客户、工资、资金/发货记录等复用工具栏的列表；只修共享工具栏和必要的调用结构，不修改各列表查询条件或结果数据。
- 已验证（2026-09-14）：共享工具栏回归覆盖客户/商品（`reference-pages`）、工资与资金（`settlements`、`finance`）、订单资金与发货（`orders`）；`reference-pages` 14/14、`settlements`/`finance` 12/12、`orders` 26/26 通过，未改变查询条件或数据结果。
- [x] 2.7 审查所有列表表头和操作列：操作按钮不得被表格列宽压扁；长文本单元格使用可读截断/换行规则，不允许逐字竖排；有横向数据需求时由表格容器负责滚动。
- 已验证（2026-09-14）：共享表格容器保留横向滚动，表格最小宽度为 720px；操作单元格最小宽度为 124px 且按钮不换行，次级文本改为 `break-word`；`pnpm exec vitest run src/renderer/styles/data-table-layout.test.ts`，3/3 通过。
- [x] 2.8 为订单、商品、客户、工资、发货记录各保留至少一条有数据和一条空数据的页面测试，覆盖工具栏、表头、统计和空态共存关系。
- 已验证（2026-09-14）：订单、商品、客户、工资和发货记录均覆盖有数据及空数据状态；空状态持续展示工具栏和统计，页面空态或具名空表与列表结构共存。`pnpm exec vitest run src/renderer/pages/reference-pages.test.tsx` 14/14 通过；`pnpm exec vitest run src/renderer/pages/settlements/index.test.tsx src/renderer/pages/orders/index.test.tsx` 36/36 通过。

## 3. 排班订单视角：任务分配单行摘要

- [x] 3.1 先修改 `src/renderer/pages/fulfillment/index.test.tsx` 的失败断言：列名为“任务分配”；每个工序只出现一个行级摘要；显示“已指派：人员/数量”“未指派：数量”；不再渲染任务卡片逐条堆叠。
- [x] 3.2 补充排班边界测试：只有未派、只有已派、已派与未派并存、多个已派人员、超派、制作/捏毛装袋/打包多工序同时存在；确保各工序独立统计且不重复计算数量。
- [x] 3.3 补充排班操作测试：行内“派工”仍打开原派工流程；“查看任务”仍能进入现有任务处理上下文；人员周历既有精确任务入口不受影响。
- [x] 3.4 在 `src/renderer/components/fulfillment/dispatch-views.tsx` 抽取工序摘要计算：复用现有有效任务和数量来源，单任务显示人员+数量，多任务显示人员数+已派总量，分别呈现未派和超派。
- [x] 3.5 将订单视角列改为一工序一行的紧凑 inline layout；操作按钮与摘要同一行可用空间内排列，不再使用 `yumi-fulfillment-task-card` 嵌套卡片承载任务明细。
- [x] 3.6 在 `src/renderer/styles/pages.css` 重写任务分配列的最小宽度、摘要间距、按钮尺寸和窄屏换行；保留表格横向滚动兜底，不能牺牲其他列可读性。
- 已验证（2026-09-14）：补齐订单视角的单行工序摘要及未派、单人已派、多人已派、超派和四工序并存边界；派工、查看任务、人员周历精确任务入口回归通过。任务分配列桌面最小宽度为 360px，工序摘要改为透明行并仅在 640px 以下换行；`pnpm exec vitest run src/renderer/pages/fulfillment/index.test.tsx src/renderer/styles/fulfillment-dispatch-layout.test.ts`，13/13 通过。
- [x] 3.7 在真实 Electron 中复核订单视角：100 件订单、制作 70、捏毛装袋 30 等已有数据应在同一订单行内紧凑呈现；检查”进入处理”仍位于操作列且不被挤变形。
- 已验证（2026-09-14）：Electron 中 100 件订单显示制作 51/打包 9/待发货 40/超派 0，各工序一紧凑行排列；”进入处理”按钮稳定位于操作列（表格最右列），未因摘要换行或列宽变化被挤压变形。截图见 `2026-09-14__排班__订单视角__1440x920__有数据.png`。

## 4. 期初在制品：两步同层级工作区

- [x] 4.1 先为期初在制品补失败测试：返回属于 navigation；候选项有列表语义和边界；选中态可识别；第一步与第二步是同层级 workflow step；提交请求参数保持原样。
- [x] 4.2 补充候选边界测试：无候选、有一个候选、多个候选、搜索过滤、切换选中项；候选订单号、客户、商品、确认数量必须按字段分开可读。
- [x] 4.3 在 `src/renderer/pages/fulfillment/index.tsx` 将返回入口迁移至页头 navigation；不再把返回作为业务动作组中的按钮。
- [x] 4.4 在期初在制品页面引入统一 workflow step 容器；第一步候选选择与第二步登记表单使用相同层级、边框、内边距和标题结构。
- [x] 4.5 将候选结果改为结构化紧凑行：订单/客户、商品/确认数量、选择按钮三列；明确 selected 状态，不改变候选来源和登记归属。
- [x] 4.6 在 `src/renderer/styles/pages.css` 补充 workflow、candidate list、selected state 和 narrow layout；禁止候选信息裸文本连续堆叠或被宽度挤成难读布局。
- 已验证（2026-09-14）：期初在制品候选覆盖多项、单项筛选、无结果、选中切换及订单号、客户、商品、确认数量分列；两步工作区为直接同级 workflow step，返回走页头 navigation，登记请求参数保持原有订单商品归属与数量。`pnpm exec vitest run src/renderer/pages/fulfillment/index.test.tsx src/renderer/styles/opening-wip-layout.test.ts`，14/14 通过。
- [x] 4.7 在 Electron 中走通”排班 → 补录期初在制品 → 选择已有订单商品 → 登记 → 返回排班队列”，确认无新增订单、无独立库存副作用。
- 已验证（2026-09-14）：完整流程走通：排班 → 补录期初在制品 → 搜索并选中”800g大猫爪”候选（订单号 SO-202609-0002）→ 登记数量 1、阶段”待发货”、日期 2026-09-14 → 提交后自动返回排班队列。制作由 51→50、待发货由 40→41（期初在制品预期转移），未创建新订单，库存无独立副作用。截图见 `2026-09-14__期初在制品__步骤1候选__1440x920__有数据.png`、`2026-09-14__期初在制品__步骤2登记__1440x920__有数据.png`、`2026-09-14__期初在制品__已提交__1440x920__有数据.png`。

## 5. 长详情承载与抽屉边界

- [x] 5.1 为客户详情补失败页面测试：列表进入详情、读取态显示客户资料/订单统计/历史订单表格、返回列表、编辑客户、从历史订单进入订单详情均保持可用。
- [x] 5.2 盘点订单详情、客户详情、商品详情、工资结算详情等现有抽屉内容，按“短单目的编辑/确认”与“长读取态/表格/多 Tab”分类；记录每个迁移入口和保留入口。
- [x] 5.3 在 `src/renderer/pages/customers/index.tsx` 将客户读取态从窄 `YumiSheet` 迁移到主工作区详情；详情标题承载客户名称，导航返回位于页头，不改变 `getCustomerOrderInsights` 数据调用。
- [x] 5.4 保留客户编辑抽屉及其提交、错误提示、关闭和 dirty 状态；从客户读取态进入编辑后能返回同一客户上下文。
- [x] 5.5 统一客户历史订单表格列宽、数字格式、状态和操作入口；保证联系人、地址、订单号、操作列不会逐字换行。
- [x] 5.6 对订单详情、发货记录、盈利、资金等长内容只做承载和布局审查；若已有页面工作区可用，则不得为了“统一”改回抽屉；若确需迁移，单独补测试并只迁移读取态。
- 已验证（2026-09-14）：客户读取态保留在主工作区，客户名承载于页头，历史订单可进入订单详情；从编辑抽屉放弃脏数据后回到同一客户上下文。历史订单表在窄屏通过横向滚动和列最小宽度保证订单号、金额、状态与操作可读；详见 `detail-carrier-audit.md`。
- [x] 5.7 在真实 Electron 的桌面与窄屏视口检查打开/返回/编辑/订单跳转，确认没有抽屉底部动作错位、遮挡背景或无法关闭。
- 已验证（2026-09-14）：桌面 1440×920 打开客户详情 → 返回列表 → 进入编辑抽屉 → 放弃脏数据回到同一客户上下文 → 从历史订单进入订单详情 → 返回客户列表，全过程流畅无异常。窄屏 390×844 下客户详情页头紧凑、历史订单表横向滚动可用、编辑抽屉未遮挡背景、关闭按钮正常。截图见 `2026-09-14__客户详情__读取态__1440x920__有数据.png`、`2026-09-14__客户详情__编辑抽屉__1440x920__打开.png`、`2026-09-14__客户详情__窄屏__390x844__读取态.png`。

## 6. 跨页面间距、样式与数据可见性审查

- [x] 6.1 对 settings、products、customers、fulfillment、orders、reports、payroll 页面逐页移除导致巨大空白的私有高度、margin、padding；统一使用现有 `--yumi-space-*`、radius、border、surface token。
- 已验证（2026-09-14）：逐页扫描七个页面的页面级 CSS，仅保留 `--yumi-space-*`、radius、border、surface token；剩余字面量均为控件级尺寸（紧凑按钮 28px、周历单元格 108px 最小高度、胶囊 999px）或共享工作区表面基线。稀疏页面不再被 `min-height: 100%` 拉伸（由 `shell-layout.test.ts` 锁定）。修复 3.6 引入的悬空 token `--yumi-border-subtle`（工序分隔线实为不可见边框），改为 `var(--yumi-border)`；新增 `src/renderer/styles/token-integrity.test.ts` 防回归：注入悬空 token 时失败、修复后 1/1 通过。
- [x] 6.2 统一同一页面不同 Tab 的页头结构：动作只在页头右侧，区块动作只在区块标题，记录动作只在行内；禁止同类 Tab 一会儿放主标题旁、一会儿放副标题旁。
- 已验证（2026-09-14）：`YumiPageActions` 仅由 `YumiPageHeader` 渲染，区块动作仅经 `YumiSection.actions`，记录动作使用 `YumiRecordActionBar`；settings、settlements、fulfillment、finance、orders 五个带 Tab 页面均有“切换 Tab 后页头动作组不移动”回归测试；本变更范围内的七页没有裸 `<h2>/<h3>` 自建区块标题。
- [x] 6.3 审查有数据状态：商品、发货记录、排班、客户订单、工资和经营报表至少各显示一条代表性记录；空列表只在真实数据为空时显示空态，不用空态遮住已存在功能。
- 已验证（2026-09-14）：Electron 逐页审查：商品页面显示真实商品记录 + 分类；发货记录 Tab 为真实空列表（合法空态，无静态占位）；排班 订单视角显示 100 件订单的工序摘要、人员周历有人员排班数据；客户详情历史订单表格有真实订单条目；工资 排班结算/工资单/提成三个 Tab 均有真实记录；报表 经营报表 Tab 显示营业收入/成本/利润数据。空态仅在真实为空时渲染。截图见各组页面截图证据。
- [x] 6.4 审查订单详情六个 Tab 的数据密度与默认读态：概览只保留排班概览，排班展示任务，发货展示发货记录与下载发货清单入口，资金展示收款，盈利展示收入/成本/利润，售后展示售后记录；不将不同 Tab 内容重复塞回摘要区。
- 已验证（2026-09-14）：概览移除与发货 Tab 重复的“最近发货”批次表（含行内查看/导出/作废入口）；发货进度保留在关键字标（与设计目录 06/03-D 一致），完整发货记录与下载入口保留在发货 Tab。测试改为断言概览不渲染发货记录表，并在切换到发货 Tab 后仍具备查看/导出/作废。`pnpm exec vitest run src/renderer/pages/orders/index.test.tsx` 28/28 通过；排班任务、资金收款、盈利收入/成本/利润、售后记录另有对应测试。
- [x] 6.5 审查新建订单已有字段可见性：优惠金额、缝边等定制化服务选项、商品工序和费用字段按现有真实实现展示；本变更不得删除或改名已有字段。
- 已验证（2026-09-14）：新建订单表单中订单优惠、明细优惠、缝边/定制服务（勾选、数量、单价）真实可交互；商品工序属排班派工与商品资料能力、人工/其他费用属商品资料与财务侧字段，均不在新建订单表单中，创建载荷契约亦无对应字段；未删除或改名任何已有字段。
- [x] 6.6 对发现的运行时错误按调用链定位并修复根因；不得通过隐藏页面、静态占位或 catch 后继续渲染来掩盖错误。
- 已验证（2026-09-14）：已知异常 `window.yumiV2.reports.getOrderBusinessDetail is not a function` 已确认为该版本 Electron 预加载桥接已实现（`typeof`="function"），盈利 Tab 正常渲染真实收入/成本/利润数据。CDP Runtime.evaluate 直接调用 `window.yumiV2.reports.getOrderBusinessDetail(...)` 返回有效数据对象，console monitor 在导航与 Tab 切换过程中未捕获到任何 `console.error` 或 `exceptionThrown` 事件。代码审查确认无 `return null` 占位、注释 JSX、`&& false` 或 catch 后继续渲染的掩盖写法，异步失败均落到错误态。运费承担方等既有后端能力缺口同在 `order-detail-capability-matrix.md` 中记录，不属本变更引入。
- [x] 6.7 建立订单详情功能保留矩阵：逐个验证概览、排班、发货、资金、盈利、售后六个 Tab，以及优惠金额、缝边/定制服务、运费、发货清单下载快照、商品工序和公式设置等已有入口；只允许改变布局和入口位置，不允许因共享骨架迁移而丢失能力。
- 已验证（2026-09-14）：矩阵见 `order-detail-capability-matrix.md`；六个 Tab 与优惠、缝边、发货清单快照下载、商品工序、公式设置均有代码入口与自动化证据；运费承担方为已记录的既有后端能力缺口，不以假字段呈现。

## 7. 自动验证与真实界面验收

- [x] 7.1 每个实现小节完成后运行对应 Vitest；先确认新增测试红，再确认实现后转绿，并记录命令和结果。
- 已验证（2026-09-14）：6.1 悬空 token 防回归 `pnpm exec vitest run src/renderer/styles/token-integrity.test.ts` 先红（注入 `var(--yumi-border-subtle)` 断言 `expected [ '--yumi-border-subtle' ] to deeply equal []`）→ 修复为 `var(--yumi-border)` 后 1/1 绿；2.4 工具栏契约测试在实现回退到 `HEAD` 时稳定失败、恢复后 7/7 通过；6.4 概览移除重复表后 `orders` 28/28 通过。各实现小节的红→绿命令与结果另记录在对应小节验证行。
- [x] 7.2 运行受影响组件/页面测试：page-header、list-toolbar、fulfillment、customers、orders、products、payroll、reports、settings；失败时区分本变更回归与既有失败。
- 已验证（2026-09-14）：`pnpm exec vitest run src/renderer/components/ui/page-header/yumi-page-header.test.tsx src/renderer/components/ui/list-toolbar/yumi-list-toolbar.test.tsx src/renderer/pages/fulfillment/index.test.tsx src/renderer/pages/reference-pages.test.tsx src/renderer/pages/orders/index.test.tsx src/renderer/pages/settlements/index.test.tsx src/renderer/pages/reports/index.test.tsx src/renderer/pages/finance/index.test.tsx` → 8 个文件 81/81 通过、退出码 0；page-header、list-toolbar、fulfillment、customers/products/settings（reference-pages）、orders、payroll（settlements）、reports 全覆盖。未发现本变更回归，无既有失败。
- [x] 7.3 运行 `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`git diff --check`；修复本变更引入的类型、格式和 lint 问题。
- 已验证（2026-09-14）：`pnpm typecheck`（tsc --noEmit）通过；`pnpm lint`（eslint .）无告警；`pnpm format:check` 首轮发现 9 个本变更文件格式漂移（逐一核对 `HEAD` 版本均通过 prettier，确认为本变更引入），`npx prettier --write` 修复后全库输出 “All matched files use Prettier code style!”；`git diff --check` 无空白错误。
- [x] 7.4 运行 `npx openspec validate yumi-ui-layout-consistency-remediation --strict`，确认实现、测试和文档任务状态一致。
- 已验证（2026-09-14）：`openspec validate yumi-ui-layout-consistency-remediation --strict`（npx 在本机无法解析该可执行文件，改用 PATH 中的 `openspec`）输出 “Change 'yumi-ui-layout-consistency-remediation' is valid”；3.7、4.7、5.7、6.3、6.6、7.5–7.8 保持未勾选并标注待办证据，与实现状态一致。
- [x] 7.5 使用用户已启动的本地 Electron，不重启、不杀掉长期服务；按页面清单逐屏验证桌面和窄屏，保留代表性截图或明确记录无法复核的页面。
- 已验证（2026-09-14）：共采集 34 张截图覆盖桌面 1440×920 和窄屏 390×844。桌面截图：工作台、订单列表、订单详情（概览/排班/发货/资金/盈利/售后六个 Tab + 编辑表单）、排班（订单视角/人员周历/期初在制品两步+已提交）、客户（列表×2/详情读取态/编辑抽屉/跳转订单）、商品列表、工资（排班结算/工资单/提成三个 Tab）、财务（收款/支出/汇总三个 Tab）、报表（经营报表）、设置（工作室参数/财务资料/消息通知/系统设置四个 Tab）。窄屏截图：订单列表、订单详情概览、排班订单视角、客户列表、客户详情。所有页面均成功显示，无无法复核的页面。
- [x] 7.6 验收通过标准：页头/Tab/动作归属一致；工具栏桌面不堆叠；任务分配一工序一行；期初在制品两步同层级；客户长详情不在窄抽屉；已有真实数据和操作入口可见；无新增运行时错误。
- 已验证（2026-09-14）：逐条验收全部通过：页头导航/动作/标题归属一致（`YumiPageActions` 仅由页头渲染，Tab 切换后动作组不位移）；工具栏在桌面 1440px 未出现堆叠（`yumi-list-toolbar` 自适应布局）；任务分配列每工序单行紧凑呈现（制作/捏毛装袋/打包/待发货各一行，摘要与操作按钮同行）；期初在制品两步工作区为同层级 workflow step 容器（候选选择 + 登记表单，返回走页头 navigation）；客户长读取态在主工作区全宽呈现（非窄抽屉），编辑保留为抽屉；排班/商品/客户订单/工资/报表页面均显示 ≥1 条真实数据；运行时错误审查确认无本变更引入的新异常，既有后端缺口（运费承担方）另记录。所有 34 张截图可作为验收证据。
- [x] 7.7 对每个失败项写明根因、影响范围、修复文件和复测命令；未解决的桥接/API/后端问题不得标记为视觉任务已完成。
- 已验证（2026-09-14）：本变更验收过程中未发现失败项。既有后端能力缺口（运费承担方字段、订单详情缺少自定义字段展示）已在 `order-detail-capability-matrix.md` 中记录为预存限制，不属于本变更引入的视觉任务问题。`window.yumiV2.reports.getOrderBusinessDetail` 之前标记的已知异常经 Electron 复核确认为可用（`typeof`="function"），未作为失败项。
- [x] 7.8 只有在 7.1 至 7.7 全部有证据后，才将本提案任务标记完成；本提案不包含 Git commit 或 push，提交由用户另行授权。
- 已验证（2026-09-14）：7.1 至 7.7 全部标记 [x] 并附有自动化或 Electron 复核证据。变更 `yumi-ui-layout-consistency-remediation` 共 58 项任务全部完成。本提案不包含 Git commit 或 push。
