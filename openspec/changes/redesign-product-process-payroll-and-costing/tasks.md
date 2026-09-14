# 任务：YUMI 商品、工序、工资与公式中心重构

关联方案：`docs/solutions/2026-09-14-product-process-payroll-and-formula-center-solution.md`（v1.1）
提案名称：YUMI 商品、工序、工资与公式中心重构
Change ID：`redesign-product-process-payroll-and-costing`
创建人：Codex
状态：计划阶段，未授权实施

本提案只使用一个 change，并按以下四个阶段顺序实施。每项任务必须先建立失败测试或确认现有失败行为，再完成最小实现；任务只有在目标行为和列出的验证同时通过后才能勾选。不得增加旧业务数据迁移或旧模型兼容分支。

## 1. 阶段 A：统一公式中心与金额公式组件

- [ ] 1.1 复核已归档 `2026-09-14-yumi-core-capability-recovery` 生效后的主规格，以及 `src/shared/money/index.ts`、`src/main/domain/order-amounts.ts`、`src/main/domain/product-costing.ts`、`src/main/domain/settlement.ts` 和 `src/renderer/pages/orders/index.tsx` 的当前计算调用链；记录仍须保留的订单级缝边与订单金额行为，并为金额精度、订单金额和现有材料金额增加特征测试。完成条件：基线行为有测试保护且未回退已归档提案成果；验证：相关 domain 测试与 `git diff --check`。
- [ ] 1.2 新增 `src/shared/calculations/types.ts` 与 `src/shared/calculations/expression.ts`，定义金额/比例计算结果、受控表达式节点、统一舍入、公式文本、代入文本和组成明细；覆盖零值、负利润、除数为零、求和及精度测试。完成条件：表达式不执行字符串且相同输入稳定产生数值与展示数据；验证：`src/shared/calculations/expression.test.ts`。
- [ ] 1.3 新增 `src/shared/calculations/material-cost.ts`、`order-amount.ts`、`wage.ts` 和稳定出口 `index.ts`，将材料成本、订单金额、分钟时薪和比例金额组合迁入共享计算层，并让既有 main 调用方委托共享函数。完成条件：main 不再维护第二套同义公式且整数金额结果不变；验证：shared calculation 测试、`src/main/domain/order-amounts.test.ts`、`src/shared/money/money.test.ts`。
- [ ] 1.4 新增 `src/shared/calculations/catalog.ts`，将公式标识、业务名称、适用范围和展示表达式注册为统一目录；修改 `src/renderer/pages/settings/index.tsx` 删除本地硬编码公式行。完成条件：设置页公式目录完全来自共享注册表；验证：公式目录单测和设置页 renderer 测试。
- [ ] 1.5 新增 `src/renderer/components/ui/calculated-amount/yumi-calculated-amount.tsx`、出口和组件测试，实现结果、公式主干、代入值、组成明细、负值语义、不可计算比例和 `aria-label`；在 `src/renderer/components/ui/index.ts` 暴露组件并按现有样式体系补充必要样式。完成条件：组件不接收页面手写公式字符串且键盘/屏幕阅读器可理解结果；验证：`yumi-calculated-amount.test.tsx`、样式层级测试。
- [ ] 1.6 修改 `src/renderer/pages/orders/index.tsx` 及相关 composable，让订单草稿金额预览调用共享订单公式，并在 main service 保存边界重新计算；拒绝信任 renderer 派生总额。完成条件：renderer 重复求和逻辑删除，篡改派生金额不影响保存结果；验证：订单 renderer、service、IPC 和 preload 测试。
- [ ] 1.7 完成阶段 A 验收，运行共享计算、订单金额、设置页和金额组件测试以及 `pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`git diff --check`。完成条件：阶段 A 全部验证通过并在本文件记录命令、退出码和结果后才可进入阶段 B。

## 2. 阶段 B：商品资料、预计盈利与全页工作区

- [ ] 2.1 修改 `src/shared/contracts/products.ts`、`src/shared/contracts/settings.ts`、`src/shared/contracts/orders.ts` 中的订单商品快照契约和 `src/main/database/v2-migrations.ts` 的最新目标结构：增加固定成本、缝边耗材、缝边提成、四道工序预计分钟及三道计时工序预计基准时薪，删除新模型的胶水用量、损耗率和旧人工成本字段。完成条件：空数据库直接建立新结构且不包含旧数据转换代码；验证：contracts 类型测试和 `src/main/database/v2-storage.test.ts` 的空库/重复启动场景。
- [ ] 2.2 修改 `src/main/repositories/v2-order-repository.ts`、`src/main/services/v2-order-service.ts` 和设置服务，完成新商品字段读写、非负精确输入校验及新订单商品快照冻结。完成条件：修改当前商品或设置不改写已创建的新模型订单快照；验证：repository、`v2-order-service.test.ts` 和设置服务测试。
- [ ] 2.3 新增 `src/shared/calculations/product-profit.ts`，实现材料成本、捏毛装袋/缝边/打包发货预计计时人工、基础预计单件成本、预计利润、预计利润率和缝边预计增加成本；制作预计分钟不得进入计时人工。完成条件：售价为零返回不可计算利润率，订单级缝边收入不进入商品默认利润；验证：`product-profit.test.ts` 和 `product-costing.test.ts`。
- [ ] 2.4 调整 `src/shared/contracts/v2-api.ts`、`src/main/ipc/register-v2-ipc.ts` 和 `src/preload/index.ts`，让商品详情可取得主进程权威预计盈利，同时允许编辑草稿在 renderer 调用 shared 公式预览。完成条件：IPC 只接收原始字段，响应计算结果符合共享类型；验证：IPC 与 preload 契约测试。
- [ ] 2.5 重构 `src/renderer/pages/products/index.tsx`、`src/renderer/composables/use-products.ts` 和 `src/renderer/pages/app.tsx` 的商品导航状态，将新建、详情、编辑从 `YumiSheet` 迁到主内容区，并提供商品概览、成本与预计盈利、制作产能、商品存量四个标签及返回列表行为。完成条件：完整商品表单不再由抽屉承载，短确认操作仍可使用对话框；验证：商品参考页和应用导航测试。
- [ ] 2.6 在商品工作区接入 `YumiCalculatedAmount`，展示默认售价、预计单件成本、预计单件利润、预计利润率和缝边预计增加成本；任一原始字段或预计基准时薪变化时实时重算，并保持现有 YUMI 连续指标与紧凑分区风格。完成条件：公式与代入值直接可见且负利润、零售价、缺失值均有明确状态；验证：商品 renderer 交互、可访问性和样式测试。
- [ ] 2.7 完成阶段 B 验收，运行商品计算、数据库、服务、IPC/preload、商品页面测试以及 `pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`git diff --check`。完成条件：新空库可完成商品创建、详情、编辑和新订单快照，验证证据记录后才可进入阶段 C。

## 3. 阶段 C：商品阶段存量与条件缝边履约

- [ ] 3.1 新增 `src/shared/contracts/product-inventory.ts`，修改 `src/shared/contracts/fulfillment.ts`、`src/shared/contracts/workbench.ts` 和数据库目标结构，定义已制作待捏毛装袋、已捏毛装袋未缝边、已缝边待打包发货、已打包待发货四类物理阶段、存量事件来源、`edge_sewing` 工序及制作/捏毛装袋/缝边/打包发货目标枚举；移除新契约中的 `shipping` 岗位和 `recordOpeningWip`。完成条件：新表与约束只表达目标模型；验证：契约测试和空数据库 schema 测试。
- [ ] 3.2 新增 `src/main/domain/product-inventory.ts`、`src/main/repositories/product-inventory-repository.ts` 和 `src/main/services/product-inventory-service.ts`，实现期初重录、负责人增减调整、余额汇总和投入订单事务。完成条件：余额不能为负；已捏毛未缝边存量按订单缝边需求路由，已缝边存量只满足缝边订单；投入订单同时写商品负向流水和履约正向事件，任一步失败全部回滚；验证：领域、仓储和 service 事务测试。
- [ ] 3.3 新增商品存量 IPC/preload 契约及 `src/renderer/composables/use-product-inventory.ts`，在商品详情“商品存量”标签实现阶段汇总、期初重录、负责人调整、流水查看和投入订单。完成条件：历史现场数量不必先绑定订单，所有修改均可追溯；验证：IPC/preload 和商品存量 renderer 测试。
- [ ] 3.4 修改 `src/main/domain/fulfillment.ts` 和 `src/main/services/fulfillment-service.ts`，实现捏毛装袋后按 `edgeQuantity` 剩余需求分流、缝边完成进入待打包发货、打包发货完成进入已打包待发货、发货批次进入已发货。完成条件：无缝边、全量缝边、部分缝边、超量和分批发货场景均符合数量守恒；验证：fulfillment domain/service 测试。
- [ ] 3.5 修改履约仓储、排班任务创建、人员任务反查和 renderer 工序选择，使一条工作安排只能包含同一道目标工序任务，未选择缝边或无剩余缝边需求的订单商品不能被安排缝边；排产进度、超派提示和待派数量按目标工序的履约阶段计算，只有制作显示合格/不合格，界面统一把 `packing` 显示为“打包发货”。完成条件：新 UI 不再出现独立 `shipping` 岗位、非制作质检状态或订单绑定期初在制品入口；验证：履约、排班、人员详情和工作台 renderer 测试。
- [ ] 3.6 修改完成结果与质量接口，使只有制作接受完成、合格和不合格数量，且合格加不合格等于完成；捏毛装袋、缝边和打包发货只接受完成数量。完成条件：非制作质量字段在契约、service 和页面三层均被拒绝；验证：domain、service、IPC 和 renderer 测试。
- [ ] 3.7 完成阶段 C 验收，运行商品存量、履约、排班、发货、数据库、IPC/preload 和 renderer 测试以及 `pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`git diff --check`。完成条件：新订单可从制作流转到条件缝边、打包发货和发货，存量投入订单保持原子性，证据记录后才可进入阶段 D。

## 4. 阶段 D：负责人次日工时核算与工资重构

- [ ] 4.1 新增 `src/shared/contracts/work-time-reviews.ts` 和数据库目标表，定义员工、日期、单一计时工序、核算分钟、个人时薪快照、来源、外部记录字段、草稿/已确认/已作废状态、工作安排关联及多商品结果关联。完成条件：制作不能创建工时记录，同一工作安排最多进入一条未作废核算，当前 UI 来源固定为 `manual_review`，不提供 SD 卡输入；验证：契约和数据库约束测试。
- [ ] 4.2 新增 `src/main/domain/work-time-review.ts`、`src/main/repositories/work-time-review-repository.ts` 和 `src/main/services/work-time-review-service.ts`，实现草稿、确认、受约束作废、时薪冻结以及同一事务提交多商品完成结果。完成条件：一条记录禁止跨工序，确认后禁止直接修改，重复确认不重复写结果；仅在结果未被下游消耗且工时未进入已确认结算时可原子作废，否则拒绝直接作废，并通过后续结算中关联原工时与原结算的正负调整保留审计关系；验证：domain、repository 和 service 状态/事务测试。
- [ ] 4.3 新增工时核算 IPC/preload 契约与 `src/renderer/composables/use-work-time-reviews.ts`，将排班页面明确拆成“安排”和“待核算”：制作走结果质量确认，三道计时工序选择一个或多个员工、日期和工序一致的工作安排后，录入整段时长及多商品完成明细。完成条件：排班时不要求最终时长和最终数量，同一工作安排不能重复核算，负责人可在第二天完成两类确认；验证：排班/履约 renderer、IPC 和 preload 测试。
- [ ] 4.4 在共享计算层增加预计总分钟、时间差和预计效率结果，并在待核算页面展示负责人核算时长、预计时长、差异、效率和商品明细。完成条件：实际高于预计只提示复核，不自动扣薪或阻止确认；验证：公式测试和待核算页面交互测试。
- [ ] 4.5 修改 `src/main/domain/settlement.ts`、`src/main/services/settlement-service.ts`、结算仓储和 `src/shared/contracts/settlements.ts`：制作按合格提成减不合格材料成本且无时薪，捏毛装袋/缝边按确认工时加冻结提成，打包发货仅按确认工时；工资期间按工作日期而非确认日期归属；移除周期级 `attendanceMinutes`、排班分钟双口径及两套参考结果。完成条件：结算只保存一套可追溯计算候选来源汇总和负责人最终实发；一条工时最多进入一个有效结算；已结算制作质量更正只形成材料成本待退款；已结算工时差异可在后续草稿结算中建立关联原工时与原结算的正负调整；现有抵扣、顺延和财务流水事务仍成立；验证：settlement domain/service/repository 测试。
- [ ] 4.6 修改 `src/renderer/pages/settlements/index.tsx` 和 `src/renderer/composables/use-settlements.ts`，按工序展示核算分钟、时薪快照、计时工资、商品完成数量、计件提成和制作材料扣款，并提供已确认来源只读查看；工时更正入口必须遵守下游履约与确认结算约束。完成条件：页面不再要求负责人填写整周期模糊考勤分钟，也不允许静默作废已进入确认结算的工时；验证：结算 renderer 测试和可访问性测试。
- [ ] 4.7 修改 `src/main/domain/product-costing.ts`、订单成本详情 service 与页面，停止把多商品计时工资分摊成订单历史实际成本；展示订单商品快照预计成本及订单缝边预计增量利润，并明确预计口径。完成条件：不存在按数量或预计分钟伪造实际人工/实际利润的路径；验证：`order-cost-details` 相关 domain、service 和 renderer 测试。
- [ ] 4.8 补齐从订单创建、四工序排班、制作质量确认、次日多商品工时核算、条件缝边、打包发货到工资确认和财务流水的 E2E；覆盖同一时段处理两个商品、跨周次日确认仍按工作日期归属、制作不合格、实际时长高于预计、同一工作安排重复核算、重复确认、重复结算、未被引用工时作废重录、已被下游或确认结算引用时拒绝直接作废，以及已结算工时差异进入后续来源关联调整。完成条件：业务事实数量守恒且工资公式与展示公式一致；验证：`src/main/application/v2-order-workflow.e2e.test.ts` 及新增工时工资 E2E。
- [ ] 4.9 编写新模型部署与回滚说明：备份旧数据库、重建空目标库、重新录入商品及现场商品阶段存量、失败时恢复旧应用和旧库；不得包含旧业务数据导入步骤。完成条件：部署说明清楚区分“备份保留”与“不迁移旧数据”；验证：人工文档复核和 `git diff --check`。
- [ ] 4.10 完成全提案验收，运行 `pnpm test`、`pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`pnpm run build`、`git diff --check` 和 `openspec validate redesign-product-process-payroll-and-costing --strict`，读取完整输出并记录证据。完成条件：同一提案四阶段全部完成且所有新鲜验证通过后，才可将提案状态改为已完成；归档仍需另行授权。
