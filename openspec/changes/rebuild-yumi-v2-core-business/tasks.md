> 当前执行：C.4（工资财务流水唯一化）。未通过对应验证前不得勾选完成。

## 阶段 A：V2 数据基线、基础资料与订单事实

- [x] A.1 在 `src/main/database/v2-storage.ts`、`v2-connection.ts`、`v2-migrations.ts` 建立独立 V2 路径、连接、`v2_schema_migrations` 和订单基础 schema（客户、商品、订单、订单商品、金额调整、内容变更、统一资金、发货、附件、审计）；完成条件是首次启动空库、增量迁移、V1 文件隔离和 V2 备份恢复均有自动化测试。
- [x] A.2 在 `src/main/domain/order-amounts.ts`、`order-funds.ts`、`shipment-quantities.ts` 实现订单金额/净收/待收计算、订单资金方向与冲正校验、阶段 A 按确认数量的发货上限；完成条件是金额使用整数分，覆盖定金/尾款/退款/减额/超收/超量发货边界测试。
- [x] A.3 新建 `src/shared/contracts/common.ts`、`customers.ts`、`products.ts`、`orders.ts`、`index.ts`，并将 V1 `src/shared/contracts.ts` 的 V2 使用方切换为新契约；完成条件是 V2 订单 API、输入、输出和领域错误在 renderer/preload/IPC/service 间只使用同一来源类型。
- [x] A.4 在 `src/main/repositories/`、`src/main/services/`、`src/main/ipc/` 新增客户、商品、订单、资金、发货和 V2 备份领域实现及 `register-v2-ipc.ts`；完成条件是订单创建、内容变更与可选金额调整、资金新增/冲正、发货和审计均在事务内完成，且不调用 V1 `StudioRepository`/`StudioService`。
- [x] A.5 修改 `src/main/index.ts` 与 `src/preload/index.ts`，由 V2 存储配置组合 V2 服务、备份与 API；完成条件是应用仅打开 V2 数据空间、恢复后重建 V2 服务引用、V2 renderer 不暴露 V1 写入通道。
- [x] A.6 将 `src/renderer/pages/app.tsx` 收敛为应用壳，新增 `pages/customers/`、`pages/products/`、`pages/orders/` 和对应 `composables/use-*.ts`；完成条件是支持客户/商品维护、一单多商品、初始确认金额、内容变更、金额调整、多笔资金、冲正和分批发货，失败保留草稿且组件不直连 IPC。
- [x] A.7 为阶段 A 新增 domain、repository/service、IPC/preload、renderer 和端到端测试；完成条件是独立 V2 启动、客户/商品快照、订单金额、收退款、发货、附件/备份与 V1 隔离场景全部自动验证。
- [x] A.8 运行阶段 A 定向测试、`npm run typecheck`、`npm run lint` 和 `npm run build`；完成条件是记录命令与结果，在本文件和 `proposal.md` 中写入证据后才进入阶段 B。

## 阶段 B：多工序履约、质检、期初在制品与售后补发

- [x] B.1 在 `src/main/database/v2-migrations.ts` 追加 `work_assignments`、`process_tasks`、`process_results`、`quality_inspections`、`fulfillment_events` 与期初在制品所需表、索引和约束；完成条件是订单商品、工作安排、任务、完成、质检和事件均可追溯，且数量不能为负。
- [x] B.2 新增 `src/main/domain/fulfillment.ts`，实现固定四工序、任务来源、制作计划分钟公式、阶段转换、合格/不合格校验、期初在制品和发货可用量计算；完成条件是任何完成申报只能质检一次，合格数加不合格数等于提交数，不能绕过事件直接修改阶段数量。
- [x] B.3 新增 `src/main/repositories/fulfillment-repository.ts`、`src/main/services/fulfillment-service.ts`、`src/main/ipc/fulfillment-ipc.ts` 和 `src/shared/contracts/fulfillment.ts`；完成条件是完成、质检、返工、补发、负责人数量调整和发货可用量校验在事务中编排并写入审计。
- [x] B.4 将订单发货服务从阶段 A 的确认数量上限升级为待发货可用量上限；完成条件是未打包合格产品不能发货，阶段 A 已存在发货记录保持可读且不产生负可用量。
- [x] B.5 新增 `src/renderer/pages/fulfillment/`、`pages/work-assignments/`、`composables/use-fulfillment.ts`、`use-work-assignments.ts` 和相关组件；完成条件是负责人能查看订单产品阶段数量、录入期初在制品、安排任务、登记完成、次日质检、创建返工/补发，且错误不丢草稿。
- [x] B.6 为固定工序、数量流转、期初在制品、制作/捏毛不合格、返工合格、补发和分批发货可用量新增测试；完成条件是方案验收矩阵中的生产与发货场景均有领域/服务/页面测试。
- [x] B.7 运行阶段 B 定向测试、`npm run typecheck`、`npm run lint` 和 `npm run build`；完成条件是记录验证证据后才进入阶段 C。

## 阶段 C：兼职工资结算与扣款顺延

- [x] C.1 在 `src/main/database/v2-migrations.ts` 追加兼职人员、时薪历史、结算单、结算任务归属、扣款记录、扣款分配和待抵扣余额表；完成条件是已确认任务/扣款不能被重复纳入结算，结算与工资流水具有一对一约束。
- [x] C.2 新增 `src/main/domain/settlement.ts`，实现排班与考勤两种分钟/工资参考、制作与捏毛提成、制作胶水扣款、捏毛计划分钟扣款、抵扣上限和顺延；完成条件是时薪差异只来自工作分钟，任何口径及最终实发均不产生负工资。
- [x] C.3 新增 `src/main/repositories/settlement-repository.ts`、`src/main/services/settlement-service.ts`、`src/main/ipc/settlement-ipc.ts` 与 `src/shared/contracts/settlements.ts`；完成条件是创建草稿、输入考勤总分钟、分配扣款、填写最终实发及确认结算的任务/扣款归属均可追溯且事务化；实际 `financial_entries` 工资流水由 C.4 统一写入。
- [ ] C.4 在 `financial_entries` 扩展工资来源类型，并实现确认结算时自动生成唯一工资支出；完成条件是重复确认被拒绝，工资调整和最终实发金额/备注不回写两套参考工资。
- [ ] C.5 新增 `src/renderer/pages/workers/`、`pages/settlements/`、`composables/use-settlements.ts` 及结算明细组件；完成条件是负责人能选择任意日期范围、查看两种参考结果、逐项查看任务/扣款来源、填写最终金额/日期/备注并确认。
- [ ] C.6 为制作和捏毛不合格公式、返工正常计薪、扣款顺延、两种口径、最终实发和唯一工资流水新增测试；完成条件是工资验收场景完整自动覆盖。
- [ ] C.7 运行阶段 C 定向测试、`npm run typecheck`、`npm run lint` 和 `npm run build`；完成条件是记录验证证据后才进入阶段 D。

## 阶段 D：日常财务、垫付报销、财务首页与售后单

- [ ] D.1 在 `src/main/database/v2-migrations.ts` 追加财务类目、垫付人、报销和售后处理单表，并为 `financial_entries` 增加手工收入/支出、工资、报销来源、付款来源、类目和垫付关联；完成条件是已引用类目/垫付人无法删除，私人垫付与整笔报销为一对一。
- [ ] D.2 新增 `src/main/domain/finance.ts`、`src/main/domain/after-sales.ts`，实现实际日期月度汇总、经营支出计入规则、待报销、整笔报销和售后客户收费/核算成本分离；完成条件是报销付款不重复计入经营支出，售后核算成本不自动生成日常支出。
- [ ] D.3 新增 `src/main/repositories/finance-repository.ts`、`after-sales-repository.ts`、`src/main/services/finance-service.ts`、`after-sales-service.ts`、对应 IPC 与 `src/shared/contracts/finance.ts`；完成条件是日常收支、类目、垫付、报销、售后、订单售后收费和审计记录均有稳定输入校验与事务边界。
- [ ] D.4 新增 `src/renderer/pages/finance/`、`pages/settings/`、订单售后组件、`composables/use-finance.ts`；完成条件是负责人可管理类目/垫付人、登记日常收支、查看待报销并完整报销、录入弹性售后，系统不自动定责/收费/建任务。
- [ ] D.5 实现月度财务首页，默认展示实际收入、经营支出、经营结果和截至查询日待报销金额，并支持查看流水；完成条件是收入不区分账户、支出明确公账/私人垫付、日期归属按实际付款日。
- [ ] D.6 为动态类目、私人垫付、整笔报销、月度口径、免费售后、有成本售后和售后收费新增测试；完成条件是财务与售后验收场景均可自动验证。
- [ ] D.7 运行阶段 D 定向测试、`npm run typecheck`、`npm run lint` 和 `npm run build`；完成条件是记录验证证据后才进入阶段 E。

## 阶段 E：报告、导出、V1 收敛与整体验证

- [ ] E.1 新增 `src/main/services/report-service.ts`、`src/shared/contracts/reports.ts`、`src/main/ipc/report-ipc.ts` 和 `src/renderer/pages/reports/`，基于 V2 事实重建订单资金/核算成本、履约进度、工资结算和月度经营报表；完成条件是未确认工资、非实际资金和 V1 测试数据不进入报表。
- [ ] E.2 重构 `src/main/services/export-document-workbook.ts`、`report-export.ts` 或其 V2 替代模块，保证订单、履约、工资和财务导出与当前筛选和 V2 页面口径一致；完成条件是导出可重复验证且不混入 V1 数据。
- [ ] E.3 清理或隔离 V1 `StudioRepository`、`StudioService`、旧 IPC、旧共享契约、`app.tsx` 中旧页面路径、演示数据入口和旧测试；完成条件是 V2 运行时不再依赖 V1 写入实现，删除范围有明确测试替代与代码审查证据。
- [ ] E.4 将所有阶段的端到端验收串联为完整大订单场景：多产品、分批生产/发货、质检不合格与返工、工资结算、私人垫付、报销、售后、订单资金和月度财务；完成条件是测试使用 V2 空库独立执行。
- [ ] E.5 运行全量质量门禁：`npm test`、`npm run typecheck`、`npm run lint`、`npm run build`、`openspec validate rebuild-yumi-v2-core-business --strict`；完成条件是所有命令退出码为 0，任何失败保留证据且不勾选未完成任务。
- [ ] E.6 全部任务和质量门禁完成后，更新 `proposal.md` 与 `docs/solutions/2026-09-07-yumi-v2-core-business-reconstruction-solution.md` 的实施记录、实际差异和验证证据；完成条件是仅在所有验证通过后将提案状态改为已完成，并等待单独归档授权。


## 实施证据

- **A.1（2026-09-07）**：新增 V2 独立存储路径、连接和两段增量迁移，建立客户、商品、订单、订单商品、金额调整、内容变更、统一资金、发货、附件与审计基础表；V1 `schema_migrations` 文件被拒绝作为 V2 打开目标。V2 备份服务支持独立数据库/附件名称，恢复不会触碰 V1 文件。验证通过：`npx vitest run src/main/database/v2-storage.test.ts src/main/services/v2-backup-service.test.ts src/main/services/backup-service.test.ts`（3 文件、5 用例）、`npm run typecheck`、`npm run lint`。

- **A.2（2026-09-07）**：新增订单金额、订单资金和发货数量纯领域规则，统一整数分、收退款净额、资金方向/日期/冲正校验，并支持阶段 A 确认数量上限及阶段 B 待发货可用数量上限。验证通过：3 个领域测试文件、8 个用例，`npm run typecheck`、`npm run lint`；联合阶段 A 定向测试累计 6 个文件、13 个用例通过。

- **A.3（2026-09-07）**：建立 `src/shared/contracts/` 的 common、customers、products、orders 和统一入口；V2 领域规则已通过该入口引用金额与订单资金类型，不再为 V2 复制 V1 类型。验证通过：V2 契约测试 1 个用例，订单领域与契约联合测试 4 文件、9 个用例，`npm run typecheck`、`npm run lint`。

- **A.4（2026-09-07）**：新增 `V2OrderRepository`、`V2OrderService`、`V2BackupService` 和独立 `v2:` IPC 命名空间；客户、商品、订单、内容变更与可选金额调整、资金新增/冲正、分批发货均由 V2 服务在 SQLite 事务中编排并写入审计，不依赖 V1 `StudioRepository`/`StudioService`。订单商品新增顺序迁移，冲正与原记录在资金汇总中成对排除。验证通过：新增服务与 IPC 定向测试，`npm test`（42 文件、130 用例）、`npm run typecheck`、`npm run lint`。

- **A.5（2026-09-07）**：应用启动已只组合 `V2ApplicationRuntime`、V2 存储、服务、备份和 `v2:` IPC；恢复前创建安全备份、关闭旧连接、应用恢复、重建 V2 引用并写入恢复审计，随后重启应用。preload 仅暴露 `window.yumiV2`，没有 V1 写入桥接。验证通过：`src/main/application/v2-runtime.test.ts`、`src/preload/v2-api.test.ts`、`tests/preload-sandbox-config.test.ts`，并通过全量测试、类型检查、lint 和构建。

- **A.6（2026-09-07）**：`app.tsx` 已收敛为订单、客户、商品三页的导航壳；新增各领域页面与 `use-customers`、`use-products`、`use-orders` composable。订单页面支持多商品创建、初始确认金额、内容与可选金额调整、收退款、资金冲正以及分批发货；页面只经 composable 调用 V2 API，提交失败不会重置草稿。验证通过：渲染层边界测试、全量 `npm test`（44 文件、114 用例）、`npm run typecheck`、`npm run lint`、`npm run build` 与严格 OpenSpec 校验。

- **A.7（2026-09-07）**：补齐 V2 运行时订单核心链路测试，使用独立临时数据空间自动覆盖客户/商品快照、订单确认金额、收款与退款净额、分批发货、V2 附件备份恢复以及 V1 数据文件和附件隔离；同时补强 V2 IPC 的资金流水查询委托与 renderer/composable 边界测试。

- **A.8（2026-09-07）**：阶段 A 全量验证通过：`npm test`（45 文件、115 用例）、`npm run typecheck`、`npm run lint`、`npm run build`、`openspec validate rebuild-yumi-v2-core-business --strict`、`git diff --check` 均退出码为 0；另以源代码扫描确认 V2 组合根、preload 和新页面不依赖 V1 写入实现。

- **B.1（2026-09-07）**：追加 V2 迁移版本 4，建立工作安排、工序任务、完成申报、质检、履约事件和期初在制品记录表；各表通过外键、唯一性、工序/状态枚举、正数量与非负分钟/费率约束保持可追溯性。兼职人员主数据将在阶段 C 建立，工作安排先保存 `worker_id` 引用值，由后续服务统一校验。验证通过：迁移定向测试（4 用例）、全量 `npm test`（45 文件、116 用例）、`npm run typecheck`、`npm run lint`、`git diff --check`。
