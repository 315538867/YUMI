# 任务：YUMI V1 核心能力恢复

关联方案：`docs/solutions/2026-09-09-yumi-v1-core-capability-recovery-solution.md`（v1.0）

本提案按阶段实施；每项任务必须先写失败测试或确认现有失败行为，再实现最小改动，完成后记录验证证据。除非另行授权，本提案只描述实施任务，不在当前计划阶段修改业务代码。

## 阶段 1：订单金额、订单级缝边和优惠

- [x] 1.1 修改 `src/shared/contracts/orders.ts` 的订单创建、订单明细和金额汇总契约：移除新模型 `initialConfirmedAmountCents`，增加成交单价、缝边、明细优惠、订单优惠和派生金额字段；验证：契约类型检查和序列化测试。
- [x] 1.2 修改 `src/shared/contracts/products.ts`，删除客户缝边售价语义或改为 `internalEdgeCostCents`；验证：业务读取路径不再把商品字段当客户售价。
- [x] 1.3 为 `src/main/domain/order-amounts.ts` 补充失败测试，覆盖商品金额、缝边金额、明细优惠、订单优惠、金额调整、收退款、零值和负值；验证：测试先因旧模型/缺少规则失败。
- [x] 1.4 实现统一订单金额、调整后应收、已收净额、待收金额和资金状态计算；验证：领域测试全部通过。
- [x] 1.5 实现缝边数量规则：未勾选归零、勾选默认全量、允许部分数量、数量变化收敛和边界校验；验证：领域测试覆盖 0、全量、部分量、越界和数量减少。
- [x] 1.6 更新本地数据库 schema、订单仓储和 `src/main/services/v2-order-service.ts`，在一个事务中保存订单明细快照、金额汇总和变更记录，不创建旧字段兼容迁移；验证：新库保存/读取、校验失败回滚、重启后读取测试。
- [x] 1.7 修改 `src/renderer/pages/orders/index.tsx`，移除“初始确认金额”，增加商品成交价、缝边勾选/数量/单价、明细优惠和订单优惠，实时显示“订单金额”；验证：页面测试覆盖默认全量、部分量、取消缝边、错误定位。
- [x] 1.8 修改商品页面和成本链路，明确内部缝边成本与客户缝边收费边界；验证：商品页面不出现默认客户缝边收费入口，成本测试通过。


阶段 1 验证证据：`src/main/domain/order-amounts.test.ts`、`src/main/services/v2-order-service.test.ts`、`src/main/database/v2-storage.test.ts` 与订单页面测试已覆盖订单金额、订单级缝边默认全量/部分量、优惠和事务回滚；`npm run typecheck` 通过。

## 阶段 2：查看优先与全局通知

- [x] 2.1 盘点所有局部成功/失败反馈调用点和永久 `message` 状态，列出订单、客户、商品、设置、财务、工资、报表、售后页面替换清单；验证：搜索覆盖现有 `.yumi-feedback` 和相关消息状态。
- [x] 2.2 为 `src/renderer/components/ui/notification/yumi-notification.tsx` 先写自动关闭、手动关闭、多条堆叠和失败保留测试；验证：测试先因组件/状态管理不存在而失败。
- [x] 2.3 实现全局通知 provider/host 并在 `src/renderer/main.tsx` 挂载到内容区域右上角；验证：通知测试通过，窄窗口不覆盖导航。
- [x] 2.4 替换页面成功反馈，成功/信息默认 3 秒，导出/备份 5 秒，警告至少 5 秒，失败不自动关闭；验证：fake timers 及取消/失败场景测试。
- [x] 2.5 将客户、商品、设置、工资结算、日常收支和订单页面统一改为 `view | create | edit`；验证：进入页面没有可直接输入的控件，点击新增/编辑后才可操作，保存成功回到只读态。
- [x] 2.6 保留字段校验在当前表单上下文，删除/撤销/恢复先确认后执行；验证：错误不只显示 Toast，取消确认不触发业务调用。


阶段 2 当前验证证据：`YumiNotificationProvider` 已在 `src/renderer/main.tsx` 挂载，并由固定右上角的 host 统一堆叠；成功/信息默认 3 秒、警告 5 秒、失败默认常驻且均可手动关闭，导出反馈显式使用 5 秒。客户、商品、设置和订单详情已采用先查看、点击新增/编辑后操作；工资“确认并记账”已改为二次确认，取消不触发实际写入。`src/renderer/components/ui/notification/yumi-notification.test.tsx`、`src/renderer/components/settlement/settlement-detail.test.tsx`、`npm test`、`npm run typecheck` 与 `npm run lint` 均已通过。

## 阶段 3：订单表、发货清单和历史快照

- [x] 3.1 检查并复用现有导出服务、图片读取和工作簿构建模块；验证：形成文件/符号清单，避免重建已有能力。
- [x] 3.2 为发货批次清单快照补充失败测试并实现按批次保存/读取，校验 `shipmentId` 所属订单；验证：批次 A 重导出不包含批次 B，后续订单/商品修改不污染 A。
- [x] 3.3 为订单表 builder 编写测试，覆盖客户、地址、商品图片/重量、成交价、缝边、优惠、数量、金额、备注和总计；验证：测试先失败。
- [x] 3.4 实现独立订单表 XLSX builder，设置正式表头、合计、图片、冻结表头、打印区域和文件名；验证：ExcelJS 读取关键单元格和打印设置。
- [x] 3.5 为发货清单 builder 编写测试，覆盖全部商品、总量、本次量、累计量、未发量、无批次和图片缺失；验证：测试先失败。
- [x] 3.6 实现独立发货清单 XLSX builder、合并工作簿和文件下载入口；验证：两个独立 sheet 字段不串用，导出不改业务状态。
- [x] 3.7 在订单详情和发货处理区增加“订单表导出”“发货清单导出”“合并导出”，并用右上角通知反馈；验证：未保存订单不可导出，取消不显示成功通知。


阶段 3 当前验证证据：已复用 `ReportService` 的订单表/发货清单事实查询，新增基于 ExcelJS 的 `src/main/services/order-document-workbook.ts`，提供独立订单表、独立发货清单和合并工作簿；正式表头、合计、冻结表头、打印区域、商品图片及图片缺失降级均有覆盖。订单详情和履约区可导出订单表、发货清单或合并文件，导出输入支持按当前订单及发货批次限定；发货批次在创建时冻结全订单商品、客户、交期和数量快照，因此批次 A 不受批次 B 或后续资料变化影响。`src/main/services/order-document-workbook.test.ts`、`src/main/services/report-service.test.ts`、`src/main/services/v2-report-export-service.test.ts`、`src/main/ipc/report-ipc.test.ts` 与 `src/renderer/pages/orders/index.test.tsx` 已通过。

## 阶段 4：V1 其他业务能力恢复

- [x] 4.1 补充订单预留天数、预计发货日期、制作截止日期和订单优惠入口的契约/领域测试；验证：默认带入、单订单覆盖、负优惠、日期缺失和跨日计算。
- [x] 4.2 恢复商品材料重量、损耗率、模具批次日产能维护及新模型 schema；验证：商品快照不受后续资料修改影响，产能边界校验通过。
- [x] 4.3 为客户历史订单、客户订单/资金统计写查询测试并实现服务；验证：不串客户，金额复用订单资金汇总，支持订单深链。
- [x] 4.4 为商品产能风险和订单交期风险写聚合查询测试并实现风险等级、缺口和深链；验证：过滤取消/无效记录，覆盖缺日期、已完成和超阈值。
- [x] 4.5 修改客户、商品和报表页面，增加历史、统计、产能风险和交期风险入口；验证：默认只读，风险记录可进入实际处理区，空状态正确。
- [x] 4.6 为资金流水附件关联、替换、查看和缺失文件补充测试并实现部分收款凭证入口；验证：凭证操作不改变金额、日期、支付方式和业务类型。

阶段 4 当前验证证据：订单契约新增预留天数与制作截止日期，`order-schedule` 领域规则覆盖工作室默认值、单订单覆盖、日期缺失、跨日计算及负数/小数校验；订单服务已保存并读取订单级预留天数，订单金额继续复用订单优惠校验；工作室参数可维护默认预留天数，订单新建界面默认带入且允许修改，订单详情显示预计发货日、制作截止日和预留天数。`src/main/domain/order-schedule.test.ts`、`src/main/services/studio-settings-service.test.ts`、`src/main/services/v2-order-service.test.ts` 与 `src/renderer/pages/orders/index.test.tsx` 已通过。

阶段 4.2 当前验证证据：新增商品 schema 迁移 `v2_product_material_and_capacity`，以毫克保存单件材料重量、以基点保存损耗率，并维护模具数量、每模每批产出、每日最大批次数及计算后的日产能；仅为既有记录补零默认值，不执行旧数据回填。商品新增/编辑抽屉可维护这些字段，列表展示材料、损耗与日产能；订单创建时完整冻结该资料，后续修改商品不回写历史订单。`src/main/domain/product-capacity.test.ts`、`src/main/domain/product-costing.test.ts`、`src/main/database/v2-storage.test.ts`、`src/main/services/v2-order-service.test.ts` 和 `src/renderer/pages/reference-pages.test.tsx` 已通过。

阶段 4.4 当前验证证据：`ReportRepository` 聚合有效订单行、非取消制作排产和履约事件；产能报表按预计发货日期范围返回未完成制作需求、有效模具日产能、周期可用产能、排产量、缺口、利用率、风险来源及商品深链。交期报表以订单预留天数推导制作截止日，返回剩余履约量、缺日期、临期、逾期与订单履约深链；已全部发货订单被排除。V2 当前无订单取消状态，查询仅接受具备商品标识且数量为正的订单行，且显式排除已取消的工序/工作安排。`src/main/services/report-service.test.ts` 覆盖取消排产、缺日期、已完成订单和超阈值；风险接口已通过 `src/main/ipc/report-ipc.ts` 与 `src/preload/index.ts` 暴露。`src/main/ipc/report-ipc.test.ts`、`src/preload/v2-api.test.ts`、`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 和严格 OpenSpec 校验均已通过。

阶段 4.6 当前验证证据：新增订单收款凭证服务，采用“文件入库 + `financial_entries.attachment_id` 关联”模型，不执行历史数据迁移；登记前可选取凭证，已登记收款可关联、查看、替换，缺失文件保留流水并提示重新关联。替换操作只更新附件关联并写入审计日志，不覆盖金额、发生日期、支付方式或业务类型；退款及不存在/类型错误的凭证均被拒绝，冲正更正的替代收款同样校验凭证类型。附件目录改为首次实际导入时创建，保持备份流程既有的懒创建边界。`src/main/services/order-fund-attachment-service.test.ts`、`src/main/services/v2-order-service.test.ts`、`src/main/application/v2-order-workflow.e2e.test.ts`、`src/main/ipc/register-v2-ipc.test.ts`、`src/preload/v2-api.test.ts` 与 `src/renderer/pages/orders/index.test.tsx` 已通过；本轮 `pnpm lint`、`pnpm typecheck`、`pnpm exec vitest run`（62 files / 198 tests）、`pnpm build`、`git diff --check` 和严格 OpenSpec 校验均已通过。

阶段 4.5 当前验证证据：客户和商品列表点击后先进入只读资料抽屉，只有负责人主动点击“编辑客户”或“编辑商品”才会打开可输入表单。客户资料抽屉按需读取订单统计与历史订单，并可跳转到订单总览；风险报表增加产能周期、交期截至日和交期等级筛选，产能记录跳转到指定商品资料，交期记录跳转到订单履约队列。客户无历史订单、产能无待制作订单和交期筛选无风险均有明确空状态。`src/renderer/pages/reference-pages.test.tsx` 与 `src/renderer/pages/reports/index.test.tsx` 覆盖只读后编辑、客户订单深链及风险处理跳转；`pnpm typecheck`、`pnpm lint`、`pnpm test`（61 files / 195 tests）、`pnpm build`、`git diff --check` 和严格 OpenSpec 校验均已通过。

阶段 4.3 当前验证证据：`ReportService` 新增按客户汇总的历史订单和经营统计，统一复用订单金额与资金汇总规则，返回订单金额、已收净额、待收金额、下单日期、发货/履约状态及 `orderId` 深链标识；统计严格按 `orders.customer_id` 聚合，不混入其他客户。客户经营统计已通过只读 IPC 与 preload 暴露，供客户详情和报表页面下一阶段接入。`src/main/services/report-service.test.ts`、`src/main/ipc/report-ipc.test.ts` 与 `src/preload/v2-api.test.ts` 已通过。

## 阶段 5：新模型初始化、联调和验收

- [x] 5.1 清理新模型初始化和所有测试 fixture 中的旧 `initialConfirmedAmountCents` 业务依赖，不实现旧 V2 数据迁移；验证：空库启动、旧字段无业务读取路径、备份恢复仅针对新模型。
- [x] 5.2 运行领域、服务、renderer、工作簿和报表测试；验证：所有测试通过并记录失败修复证据。
- [x] 5.3 运行 `npm run typecheck`、`npm run lint`、`npm test`、`npm run build` 和 `git diff --check`；记录完整输出。
- [ ] 5.4 在获得桌面人工验证授权后，检查只读/编辑流程、通知自动关闭、订单表和发货清单图片/打印布局；记录实际文件和界面结果。
- [x] 5.5 运行 `npx openspec validate yumi-core-capability-recovery --strict`，确认方案文档、提案、规格、设计和任务清单无漂移；通过后再标记阶段完成。
