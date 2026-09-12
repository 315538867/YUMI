## 1. 商品级捏毛装袋提成：数据、快照与结算（后端）

- [x] 1.1 在 `src/main/database/v2-migrations.ts` 增加版本 17 的幂等迁移，为 `products` 添加 `fluffing_bagging_commission_cents` 非负整数列、默认值 0；补充迁移测试，验收旧库升级、全新库初始化和已有商品读取都得到 0 且不影响既有列。
- [x] 1.2 在 `src/shared/contracts/products.ts` 的 `V2Product`、`V2ProductInput`、`V2ProductOrderSnapshot` 增加 `fluffingBaggingCommissionCents`；订单快照字段允许缺失以兼容旧 JSON，并在类型/序列化测试中验证缺失按 0 读取。
- [x] 1.3 修改 `src/main/repositories/v2-order-repository.ts` 的 `mapProduct`、商品 `INSERT/UPDATE` 和订单商品 JSON 映射，使新字段完整往返；覆盖创建、更新、禁用及读取商品的仓储测试。
- [x] 1.4 修改 `src/main/services/v2-order-service.ts` 的商品快照构造和订单内容变更路径，将捏毛装袋提成冻结进 `product_snapshot_json`；测试商品提成更新不会改写历史订单快照，订单内容重算仅生成新版本的快照。
- [x] 1.5 修改 `src/main/services/fulfillment-service.ts` 的 `createTask`：关联订单商品的 `fluffing_bagging` 任务默认采用订单商品快照的 `fluffingBaggingCommissionCents`，写入已有 `pieceRateCents` 与 `rateSnapshot`；制作、打包、发货的既有费率分支不得回归。
- [x] 1.6 修改 `src/main/services/settlement-service.ts` 及相关仓储读取路径，确保合格提成和捏毛装袋不合格扣款只使用任务冻结 `pieceRateCents`；新增服务/领域测试覆盖旧任务为 `null` 时按 0、商品后续改价不影响历史任务、返工仍按新任务快照结算。
- [x] 1.7 审核 `src/main/domain/product-costing.ts` 与 `src/main/services/report-service.ts`：明确产品成本只含材料、包装、配饰、替换袋和缝边内部成本，不含运费和未确认工资；为订单利润参考增加口径说明测试，避免将计划/跨订单工资混入已知核算成本。

## 2. 发货清单预览：只读快照链路（后端与共享契约）

- [x] 2.1 在 `src/shared/contracts/reports.ts` 和 `src/shared/contracts/v2-api.ts` 定义按 `orderId + shipmentId` 查询的发货清单预览入参/返回值；复用 `V2ShippingListDocument`，不复制新的快照结构。
- [x] 2.2 扩展 `src/main/services/report-service.ts`，增加校验订单归属的单批次预览读取方法，底层仍调用既有 `getShippingListDocuments` 快照来源；批次不存在、批次不属于订单和没有清单内容时返回明确领域错误。
- [x] 2.3 在 `src/main/ipc/report-ipc.ts`、`src/main/ipc/register-v2-ipc.ts`、`src/preload/index.ts` 注册 `v2:reports:shipping-list:preview` 与 `window.yumiV2.reports.getShippingListPreview`；补充 IPC 注册测试和预加载契约类型检查。
- [x] 2.4 扩展 `src/main/services/report-service.test.ts`、`src/main/ipc/report-ipc.test.ts`：验证预览读取创建时的客户、物流、商品、数量、累计/待发快照，作废批次保留作废元数据，预览/导出不创建或修改发货记录。

## 3. 设计令牌与可复用组件（前端基础）

- [x] 3.1 重构 `src/renderer/styles/tokens.css` 为基础色板、语义色、状态色、排版、间距、半径、阴影、布局和组件别名四层令牌；采用设计中的暖宣纸/绢白/竹青/藤黄/赭红色值，并在 `src/renderer/styles/base.css` 建立可见焦点、选区和数字等宽字体规则。
- [x] 3.2 整理 `src/renderer/styles/components.css` 与 `src/renderer/styles/pages.css`，将现有组件样式改为只消费语义令牌；移除页面级硬编码色值和不必要的大面积渐变，保持浅色高密度数据阅读和表格横向滚动能力。
- [x] 3.3 扩展 `src/renderer/components/ui/page-header/yumi-page-header.tsx` 与测试：支持实体元信息、可见的紧凑操作组和禁止常用动作进入溢出菜单的模式；保留唯一突出主操作与危险操作确认边界。
- [x] 3.4 新建 `src/renderer/components/ui/entity-summary/`、`record-action-bar/`、`snapshot-notice/`、`document-preview/` 及对应测试，并从 `src/renderer/components/ui/index.ts` 导出；分别实现紧凑实体摘要、完整行操作、只读快照提示和发货清单预览。
- [x] 3.5 调整现有 `YumiTabs`、`YumiMetricStrip`、`YumiDataTable`、`YumiDetailList`、`YumiFormSection`、`YumiSheet`、`YumiStatusTag` 的令牌消费和密度 API；为键盘操作、窄宽度折行、状态文字及金额对齐添加组件测试。

## 4. 应用壳与全量经营页面迁移（前端）

- [x] 4.1 修改 `src/renderer/pages/app.tsx` 及相关应用壳样式，统一左侧导航、顶栏、页面内容宽度和工作区返回上下文；保留“工作台 / 订单 / 排班 / 工资 / 财务 / 报表 / 客户 / 商品 / 设置”的现有导航和页面切换契约。
- [x] 4.2 迁移 `src/renderer/pages/workbench/index.tsx`：使用令牌化指标、待办列表和不超过必要数量的履约阶段分布图；只汇总已有工作台事实，不新增自动决策、派工或虚构经营指标。
- [x] 4.3 迁移 `src/renderer/pages/orders/index.tsx` 订单列表与新建/编辑工作区：默认列表可扫描、仅通过明确入口打开表单；保留订单优惠、商品折扣、缝边、客户选择和金额计算，并在创建/编辑测试中验证“订单优惠（元）”仍影响订单金额。
- [x] 4.4 重构 `src/renderer/pages/orders/index.tsx` 的订单详情头部与 `YumiTabs`：客户和交付/资金状态为主、订单号为辅助；将标签固定为“概览 / 排班 / 发货 / 资金 / 盈利 / 售后”，概览仅显示排班摘要，完整排班移至“排班”。
- [x] 4.5 在订单盈利标签接入现有 `window.yumiV2.reports.getOrderBusiness()` 的对应订单行，使用 `YumiEntitySummary`/`YumiDetailList` 显示成交金额、净收款、已知核算成本和利润参考，并在界面写明不含未确认或不能按订单归属的工资；不新增不可靠的自动成本分摊。
- [x] 4.6 在订单发货标签用 `YumiRecordActionBar` 显式展示“查看发货清单 / 导出本批清单 / 作废本批”，保留“新增发货”仅打开 `YumiSheet`；接入 `getShippingListPreview` 和 `YumiDocumentPreview`，并确保预览关闭后回到原批次列表。
- [x] 4.7 迁移 `src/renderer/pages/products/index.tsx`：在商品列表、只读详情和编辑抽屉中分别展示和编辑制作提成、捏毛装袋提成、包装成本与缝边内部成本；在 `ProductDraft`、`toDraft`、`toInput` 中完成字段转换，补齐页面交互测试。
- [x] 4.8 迁移 `src/renderer/pages/fulfillment/index.tsx`、`work-assignments/index.tsx`、`settlements/index.tsx` 及 `components/settlement/settlement-detail.tsx`：保留制作/捏毛装袋/打包/发货阶段，明确展示任务冻结的计件提成及扣款来源，且不把包装成本显示为打包计件工资。
- [x] 4.9 迁移 `src/renderer/pages/finance/index.tsx`、`reports/index.tsx`、`customers/index.tsx`、`settings/index.tsx`：沿用列表优先、主标签/次级分段、抽屉编辑和危险确认规范；保留现有报表筛选、导出、客户洞察、本地备份与恢复流程；在设置新增只读“计算公式”标签，完整列出当前已实现的业务计算、输入来源、快照边界和未纳入订单盈利的项目。
- [x] 4.9.1 在 `src/renderer/pages/settings/index.tsx` 增加只读“计算公式”标签，并以 30 条当前已实现的业务公式覆盖订单金额、资金、交期发货、商品成本产能、生产排班、兼职结算与财务；明确输入来源、快照边界及不纳入订单盈利项，补充页面回归测试。

## 5. 视觉、回归与交付验收

- [x] 5.1 更新 `src/renderer/pages/reference-pages.test.tsx`、订单/商品/排班/工资/财务/报表页面测试，覆盖代表性真实状态：订单六标签、订单优惠、商品两种提成、发货清单预览、作废批次、盈利口径说明、设置计算公式目录和本地备份风险确认。
- [x] 5.2 对照 `/Volumes/code/YUMI/.superpowers/brainstorm/11232-1789110636/content/11-current-functional-screen-catalog.html` 审核并更新代表屏，保证工作台、订单列表/新建/详情六标签、发货清单、排班、工资、财务、报表、客户、商品、设置与关键抽屉/确认态均完整呈现；目录不得仅显示单一页面或虚构能力。
- [ ] 5.3 执行 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm format:check`；在用户已运行的本地调试环境中人工验证订单创建、订单优惠、商品两种提成、捏毛排班/结算、按批清单预览/导出/作废及订单盈利标签，并记录失败项后再修复。
  - 2026-09-12：`pnpm test` 通过（83 个测试文件、310 个测试）；期间发现并修复订单盈利读取绕过 composable、设计护栏断言过期、遗留订单摘要样式，以及被 Prettier 换行影响的源码护栏断言。
  - 2026-09-12：`pnpm typecheck` 通过；`pnpm lint` 通过；`pnpm format:check` 通过。为使格式门禁只覆盖受维护的应用代码与当前交付物，新增 `.prettierignore` 排除历史方案、归档 OpenSpec、方案草图和 pnpm 锁文件；现有 `src/` 代码已按仓库 Prettier 配置统一格式化。
  - 2026-09-12：本轮重新执行 `pnpm test`，83 个测试文件、315 个测试全部通过；`pnpm typecheck`、`pnpm lint` 与 `pnpm format:check` 也全部通过。逐屏 Electron 人工视觉验收仍待完成，故本项保持未完成。
  - 2026-09-12：`npx openspec validate yumi-operating-ui-system-and-fluffing-commission --strict` 通过，`git diff --check` 通过。
  - 2026-09-12：用户已运行的 Electron 本地调试进程和 `http://localhost:54640/` 的 40 屏目录均可访问；后者已完成首屏视觉核查。Codex 尝试接入 Electron 窗口时，系统报告 Mac 已锁屏且浏览器认证令牌不可用，尚不能替代用户在解锁后的 Electron 调试窗口内逐项人工点击确认订单创建、优惠、两种提成、捏毛排班/结算、按批清单预览/导出/作废及订单盈利标签。因此 5.3 保持待完成，仅剩该人工验收边界。

## 6. 已确认设计目录的真实页面逐屏还原

- [x] 6.1 将目录的 40 屏与真实页面建立可审阅的映射表：在 `design.md` 的“2.2 40 屏真实入口映射（还原台账）”记录 `01` 至 `10-D` 的编号、入口、页面文件、预期视图状态和对应 UI 测试；明确 `.superpowers/brainstorm/11232-1789110636/content/11-current-functional-screen-catalog.html` 只作为视觉基准而不是已完成证据。已用脚本确认映射表 40 行与目录 40 个 `<article class="screen">` 一致；40 屏的源码结构与交互已由对应自动化测试覆盖，视觉状态仍为“待还原”，仅等待 6.11 的 Electron 逐屏验收。
- [x] 6.2 按 `01`、`01-A`、`01-B` 还原工作台与应用壳：修改 `src/renderer/pages/app.tsx`、`src/renderer/pages/workbench/index.tsx`、`src/renderer/styles/pages.css` 和对应测试，使左侧导航、顶栏、工作台指标、事项列表与阶段分布匹配目录；不得新增预测、自动派工或目录外 KPI。先写失败的页面结构/可达性测试，再实现并运行 `pnpm exec vitest run src/renderer/pages/app-components.test.ts src/renderer/pages/workbench/index.test.tsx`。
- [x] 6.3 按 `02`、`02-A` 还原订单列表和新建订单：修改 `src/renderer/pages/orders/index.tsx`、`src/renderer/styles/pages.css`、`src/renderer/pages/orders/index.test.tsx`，使列表默认态、筛选/操作区、新建抽屉、订单优惠、商品折扣和缝边服务与目录一致；新建表单不得替换列表作为默认入口。先写失败的交互/结构测试，再运行订单页面测试。
- [x] 6.4 按 `03`、`03-A`、`03-D`、`03-E`、`03-F`、`03-G` 还原订单详情头部、概览、盈利、排班、资金、登记收款与售后：在 `src/renderer/pages/orders/index.tsx` 及订单专属样式中实现客户优先的信息头、完整可见动作组、六标签与每个标签的目录层级；订单号降为辅助信息，概览仅保留排班摘要，完整排班只在“排班”标签。先为每个标签写失败的可达性/层级测试，验证 `pnpm exec vitest run src/renderer/pages/orders/index.test.tsx src/renderer/pages/reference-pages.test.tsx`。
- [x] 6.5 按 `03-B`、`03-B-1`、`03-C` 还原发货记录、批次清单预览和新增发货抽屉：修改订单发货标签以及 `src/renderer/components/ui/record-action-bar/`、`document-preview/`、`sheet/` 的专属组合样式。确保“查看发货清单 / 导出本批清单 / 作废本批”在每条批次上完整可见，新增发货只在点击后展开，关闭预览/抽屉返回原列表。先写失败的交互测试，验证订单页与新增组件测试。
- [x] 6.6 按 `04` 至 `04-D` 还原排班、人员周视图、任务处理、负责人调整和补录期初在制品：修改 `src/renderer/pages/fulfillment/index.tsx`、`src/renderer/pages/work-assignments/index.tsx`、相关任务组件与测试；保持制作、捏毛装袋、打包、发货四阶段和既有派工/质检事实，不在订单内补录期初商品。先写失败的视图切换和抽屉测试，运行 `pnpm exec vitest run src/renderer/pages/fulfillment/index.test.tsx src/renderer/pages/work-assignments/index.test.tsx`。
- [x] 6.7 按 `05` 至 `05-C` 还原工资列表、结算详情、待退款与人员时薪：修改 `src/renderer/pages/settlements/index.tsx`、`src/renderer/components/settlement/settlement-detail.tsx` 与测试，区分计件提成、统一兼职时薪、冻结费率与扣款来源。先写失败的列表/详情/抽屉测试，运行工资相关测试。
- [x] 6.8 按 `06` 至 `07-A` 还原财务、现金流水、日常收支、待报销和经营报表：修改 `src/renderer/pages/finance/index.tsx`、`src/renderer/pages/reports/index.tsx`、相关样式和测试，保留真实筛选、导出、风险处理入口与资金事实。先写失败的页面结构/交互测试，再运行财务和报表测试。
- [x] 6.9 按 `08` 至 `09-B` 还原客户、客户详情、新建客户、商品、商品详情和新建商品：修改 `src/renderer/pages/customers/index.tsx`、`src/renderer/pages/products/index.tsx`、相关样式和测试，完整呈现两种提成、包装/缝边成本和订单快照边界；不得把运费混入商品成本。先写失败的测试，再运行客户/商品和参考页面测试。
- [x] 6.10 按 `10` 至 `10-D` 还原设置、计算公式、财务资料、数据保护和恢复备份二次确认：修改 `src/renderer/pages/settings/index.tsx`、相关测试与样式，保证公式只读、恢复确认的风险边界完整可见。先写失败的标签/确认态测试，再运行设置及参考页面测试。
  - 2026-09-12：6.2 至 6.10 已完成源代码还原与自动化验收；本轮覆盖工作台、订单、排班、工资、财务、报表、客户、商品和设置，并由完整测试门禁确认。40 屏的真实 Electron 截图并排比对不以此替代，仍由 6.11 单独验收。

- [ ] 6.11 对目录中的 40 屏逐一执行真实 Electron 视觉验收：从已运行的本地调试窗口按映射表进入每个状态，逐屏保存截图并与目录同编号屏并排比对，记录偏差、修复后复验；不以静态目录、DOM 断言或通用组件接入替代真实页面视觉验收。验证完成后运行 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`npx openspec validate yumi-operating-ui-system-and-fluffing-commission --strict` 和 `git diff --check`。
