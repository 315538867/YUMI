## 1. 领域契约与原子业务命令

- [x] 1.1 在 `src/shared/contracts/workbench.ts`、`src/shared/contracts/finance.ts`、`src/shared/contracts/index.ts` 和 `src/shared/contracts/v2-api.ts` 定义工作台事项、应用导航目标、批量报销输入/输出与接口类型，并为重复垫付标识、空选择和定位目标补充契约测试。
- [x] 1.2 在 `src/main/services/finance-service.ts` 和 `src/main/repositories/finance-repository.ts` 实现批量报销的全量预校验与单事务写入，复用现有财务流水和 `advance_reimbursements` 关联，保证失败时不产生部分报销。
- [x] 1.3 在 `src/main/services/settlement-service.ts` 及其关联仓储/领域校验中补齐工资期间、两套参考工资、制作不合格提成/标准工时/胶水扣款、顺延扣款和已确认工资待退款的保存与查询投影。
- [x] 1.4 在 `src/main/services/fulfillment-service.ts` 及其关联仓储中补齐返工新建正常任务、从当前阶段接入已有在制品、工序任务定位查询和分批发货可发数量校验，不回填接入前历史工资或质检扣款。
- [x] 1.5 在 `src/main/services/after-sales-service.ts` 及关联领域服务中补齐从原发货发起售后、负责人确认后才创建后续履约/资金事实的命令边界，并保留责任、收费、成本和备注的手工输入。
- [x] 1.6 新增 `src/main/services/workbench-service.ts`，从订单、履约、质检、售后、结算与财务事实聚合只读工作台事项，定义去重键、决策/可推进分组和稳定排序。
- [x] 1.7 在 `src/main/application/v2-runtime.ts` 注册新增工作台服务并补齐服务构造依赖，确保现有 V2 运行时创建路径不受影响。

## 2. IPC、预加载与服务级验证

- [x] 2.1 在 `src/main/ipc/` 新增工作台 IPC 注册，并扩展 `finance-ipc.ts`、`settlement-ipc.ts`、`after-sales-ipc.ts`、`register-v2-ipc.ts` 以暴露批量报销、结算/待退款和售后处理所需命令与查询。
- [x] 2.2 在 `src/preload/index.ts` 暴露新增工作台、批量报销和详情定位相关 API，并同步 `src/shared/contracts/v2-api.ts` 的窗口 API 类型。
- [x] 2.3 在 `src/main/services/finance-service.test.ts` 覆盖多笔成功、重复 ID、已报销、非私人垫付和事务回滚；在 `src/main/ipc/register-v2-ipc.test.ts` 覆盖新增 IPC 映射。
- [x] 2.4 在 `src/main/services/settlement-service.test.ts` 覆盖两套时长不相加、制作/捏毛装袋/打包发货计价、质量扣款、返工和已确认结算待退款。
- [x] 2.5 在 `src/main/services/fulfillment-service.test.ts`、`src/main/services/v2-order-service.test.ts` 与 `src/main/services/after-sales-service.test.ts` 覆盖在制品接入、分批发货、并行商品履约和售后显式确认后派生任务。
- [x] 2.6 新增 `src/main/services/workbench-service.test.ts`，覆盖各类事项生成、同一事实去重、稳定排序、无待办时首用前置资料引导和只读查询不修改领域状态。

## 3. 应用级导航与工作台

- [x] 3.1 重构 `src/renderer/pages/app.tsx` 的 `View` 与导航状态，新增默认 `workbench` 入口、业务/资金/资料与设置分组、声明式导航目标、来源恢复和页面主标题映射。
- [x] 3.2 新增 `src/renderer/composables/use-workbench.ts` 与 `src/renderer/pages/workbench/index.tsx`，实现“需要我决定 / 可以推进”互斥视图、唯一主要任务列表、首用唯一下一步和事项深链。
- [x] 3.3 在 `src/renderer/pages/app-components.test.ts` 或新增 `src/renderer/pages/workbench/index.test.tsx` 覆盖默认工作台、视图切换、首用引导、事项跳转和返回工作台后的上下文恢复。

## 4. 订单、履约与售后工作区

- [x] 4.1 重构 `src/renderer/pages/orders/index.tsx` 与 `src/renderer/composables/use-orders.ts`，保留订单列表/创建/详情互斥状态，并将订单详情组织为概览、履约、资金、售后互斥子视图。
- [x] 4.2 在订单创建工作区实现客户/商品快捷建档抽屉或对话框回填协议；复用 `src/renderer/composables/use-customers.ts` 与 `src/renderer/composables/use-products.ts`，确保取消、失败和成功都不丢失订单草稿。
- [x] 4.3 重构 `src/renderer/pages/fulfillment/index.tsx` 与 `src/renderer/composables/use-fulfillment.ts`，实现跨订单单一履约队列、互斥阶段筛选、任务定位、登记工序结果/质检/在制品接入以及进入分批发货处理。
- [x] 4.4 调整 `src/renderer/components/after-sales/after-sales-panel.tsx`，支持原发货上下文、责任/收费/成本/备注的负责人输入以及显式确认后续动作；不得从原因或责任自动创建任务。
- [x] 4.5 调整订单发货组件与 `src/renderer/pages/orders/index.tsx`，在发货弹窗中展示各商品可发数量、允许同批多商品、校验超发并支持订单未发完时持续创建后续批次；历史批次保持只读。
- [x] 4.6 为订单、履约和售后页面补充 Renderer 测试，覆盖并行商品无统一下一步、工作台任务定位、草稿回填、阶段空状态、分批发货和售后确认边界。

## 5. 工资确认与财务工作区

- [x] 5.1 重构 `src/renderer/pages/settlements/index.tsx` 与 `src/renderer/composables/use-settlements.ts`，支持负责人选择工资周期、互斥的结算列表/人员与时薪资料工作区、两套参考工资对照、质量扣款明细和待退款处理。
- [x] 5.2 在工资确认抽屉或详情中要求负责人输入实发金额、付款日期和备注，展示其与两套参考工资的区别，并在确认后刷新已确认结算与对应财务流水。
- [x] 5.3 重构 `src/renderer/pages/finance/index.tsx` 与 `src/renderer/composables/use-finance.ts`，实现月度经营结果、现金流水、待报销三种互斥视图及各自唯一主要列表/操作。
- [x] 5.4 在待报销视图实现多选、统一报销日期/支付方式/备注确认，以及成功后对列表、现金流水和月度汇总的刷新；失败时保留选中项并显示未执行原因。
- [x] 5.5 调整 `src/renderer/pages/settings/index.tsx`，将收支类目与垫付人组织为资料库型互斥工作区，支持新建、改名、启停和引用后不可删除提示。
- [x] 5.6 为工资、财务和设置页面补充 Renderer 测试，覆盖两套工资不相加、负责人实发覆盖参考金额、确认写入工资支出、批量报销与经营结果不重复计入、资料引用删除限制。

## 6. 全局页面模型、空状态与回归验证

- [x] 6.1 统一客户、商品、设置、订单、履约、工资和财务页面的页面模型：每页一个主标题、一层主要视图切换、一个实体级主操作和一个主要记录列表；移除同屏重复标题、重复空状态和重复 CTA。
- [x] 6.2 为首用无资料、动作缺少前置资料、筛选无结果分别实现可复用空状态组件/文案，并在 `src/renderer/components/ui/` 与页面测试中覆盖其不同入口和返回上下文。
- [x] 6.3 检查 `src/renderer/styles/` 与现有设计系统组件，确保交互重构沿用已落地的按钮、抽屉、选择器、日期范围和经营列表规范，不以新增原生控件绕过组件层。
- [x] 6.4 执行并修复共享契约、main 服务、IPC 与 Renderer 的定向测试；随后运行 `npm run typecheck`、`npm run lint`、`npm run build` 和可用的 `npm test`。
- [x] 6.5 在实施完成后运行 `openspec validate rebuild-responsible-workflow-interaction --strict`，将验证证据、环境阻塞（如存在）和与本提案的实际差异回写到方案文档与变更记录。



## 完成证据

- 1.1：`npx vitest run src/shared/contracts/contracts-v2.test.ts`（3/3 通过）；`npm run typecheck` 通过；`git diff --check -- src/shared/contracts/contracts-v2.test.ts openspec/changes/rebuild-responsible-workflow-interaction/tasks.md` 通过；`openspec validate rebuild-responsible-workflow-interaction --strict` 通过。
- 2.4：`npx vitest run src/main/services/settlement-service.test.ts`（3/3 通过）；`npm run typecheck` 通过；`git diff --check -- src/main/services/settlement-service.test.ts openspec/changes/rebuild-responsible-workflow-interaction/tasks.md` 通过；`openspec validate rebuild-responsible-workflow-interaction --strict` 通过。
- 4.1：`npx vitest run src/renderer/pages/app-components.test.ts`（28/28 通过）；`npm run typecheck` 通过；`openspec validate rebuild-responsible-workflow-interaction --strict` 通过。
- 4.3：`npx vitest run src/renderer/composables/use-fulfillment.test.ts src/renderer/pages/app-components.test.ts src/renderer/pages/workbench/index.test.tsx`（33/33 通过）；`npm run typecheck` 通过；`openspec validate rebuild-responsible-workflow-interaction --strict` 通过。
- 4.4：`npx vitest run src/renderer/components/after-sales/after-sales-panel.test.tsx src/renderer/composables/use-fulfillment.test.ts src/renderer/pages/app-components.test.ts src/renderer/pages/workbench/index.test.tsx`（35/35 通过）；`npm run typecheck` 通过；`openspec validate rebuild-responsible-workflow-interaction --strict` 通过。
- 4.2：`npx vitest run src/renderer/pages/orders/index.test.tsx src/renderer/pages/app-components.test.ts`（35/35 通过）；`npm run typecheck` 通过；`git diff --check` 通过；`openspec validate rebuild-responsible-workflow-interaction --strict` 通过。
- 5.2：`npx vitest run src/renderer/components/settlement/settlement-detail.test.tsx`（1/1 通过）；`npm run typecheck` 通过；`git diff --check` 通过；`openspec validate rebuild-responsible-workflow-interaction --strict` 通过。
- 5.5：`npx vitest run src/renderer/pages/reference-pages.test.tsx`（5/5 通过）；`npm run typecheck` 通过；`git diff --check -- src/renderer/pages/settings/index.tsx src/renderer/pages/reference-pages.test.tsx openspec/changes/rebuild-responsible-workflow-interaction/tasks.md` 通过；`openspec validate rebuild-responsible-workflow-interaction --strict` 通过。
- 4.5：`npx vitest run src/renderer/composables/use-orders.test.ts src/renderer/pages/app-components.test.ts`（31/31 通过）；`npm run typecheck` 通过；`git diff --check` 通过；`openspec validate rebuild-responsible-workflow-interaction --strict` 通过。
- 4.6：`npx vitest run src/renderer/pages/fulfillment/index.test.tsx src/renderer/pages/orders/index.test.tsx src/renderer/components/after-sales/after-sales-panel.test.tsx src/renderer/pages/workbench/index.test.tsx src/renderer/composables/use-fulfillment.test.ts src/renderer/composables/use-orders.test.ts src/renderer/pages/app-components.test.ts`（39/39 通过）；`npm run typecheck` 通过；`git diff --check` 通过；`openspec validate rebuild-responsible-workflow-interaction --strict` 通过。

- 2.5：`npx vitest run src/main/services/fulfillment-service.test.ts src/main/services/v2-order-service.test.ts src/main/services/after-sales-service.test.ts`（10/10 通过）；`npm run typecheck` 通过；`git diff --check -- src/main/services/fulfillment-service.test.ts src/main/services/v2-order-service.test.ts src/main/services/after-sales-service.test.ts openspec/changes/rebuild-responsible-workflow-interaction/tasks.md` 通过；`npx openspec validate rebuild-responsible-workflow-interaction --strict` 通过。

- 1.4：`npx vitest run src/main/services/fulfillment-service.test.ts src/main/services/v2-order-service.test.ts`（8/8 通过）；`npm run typecheck` 通过；`git diff --check -- src/main/services/fulfillment-service.test.ts src/main/services/v2-order-service.test.ts openspec/changes/rebuild-responsible-workflow-interaction/tasks.md` 通过；`npx openspec validate rebuild-responsible-workflow-interaction --strict` 通过。

- 1.5：`npx vitest run src/main/services/after-sales-service.test.ts src/renderer/components/after-sales/after-sales-panel.test.tsx`（4/4 通过）；`npm run typecheck` 通过；`git diff --check -- src/main/domain/after-sales.ts src/main/services/after-sales-service.ts src/main/services/after-sales-service.test.ts src/renderer/components/after-sales/after-sales-panel.tsx src/renderer/components/after-sales/after-sales-panel.test.tsx openspec/changes/rebuild-responsible-workflow-interaction/tasks.md` 通过；`npx openspec validate rebuild-responsible-workflow-interaction --strict` 通过。

- 2.1：`npx vitest run src/main/ipc/register-v2-ipc.test.ts`（1/1 通过）；`npm run typecheck` 通过；`git diff --check -- src/main/ipc/register-v2-ipc.ts src/main/ipc/register-v2-ipc.test.ts src/main/ipc/finance-ipc.ts src/main/ipc/settlement-ipc.ts src/main/ipc/after-sales-ipc.ts openspec/changes/rebuild-responsible-workflow-interaction/tasks.md` 通过；`npx openspec validate rebuild-responsible-workflow-interaction --strict` 通过。

- 5.6：`npx vitest run src/renderer/components/settlement/settlement-detail.test.tsx src/renderer/pages/finance/index.test.tsx src/renderer/pages/reference-pages.test.tsx`（10/10 通过）；`npm run typecheck` 通过；`git diff --check -- src/renderer/components/settlement/settlement-detail.test.tsx src/renderer/pages/finance/index.tsx src/renderer/pages/finance/index.test.tsx src/renderer/pages/reference-pages.test.tsx openspec/changes/rebuild-responsible-workflow-interaction/tasks.md` 通过；`npx openspec validate rebuild-responsible-workflow-interaction --strict` 通过。

## 进度说明（2026-09-08）

- 已完成项以已实际落地的契约、服务、IPC/预加载、Renderer 工作区和定向测试为准。
- 未勾选项仍包含未完成的交互闭环或验证范围；例如订单详情互斥子视图、履约阶段筛选/任务定位、快捷建档、售后与设置资料库的完整闭环，以及全量回归验证。

- 6.1：`npx vitest run src/renderer/pages/reference-pages.test.tsx src/renderer/pages/finance/index.test.tsx src/renderer/pages/app-components.test.ts`（3 个文件、38 项通过）；`npm run typecheck` 通过；`git diff --check -- <6.1 相关页面、测试与任务文件>` 通过；`npx openspec validate rebuild-responsible-workflow-interaction --strict` 通过。
- 6.2：`npx vitest run src/renderer/components/ui/empty-state/yumi-empty-state.test.tsx src/renderer/pages/reference-pages.test.tsx src/renderer/pages/workbench/index.test.tsx src/renderer/pages/fulfillment/index.test.tsx src/renderer/pages/orders/index.test.tsx src/renderer/pages/app-components.test.ts`（6 个文件、46 项通过）；`npm run typecheck` 通过；`git diff --check -- <6.2 相关组件、页面、测试、样式与任务文件>` 通过；`npx openspec validate rebuild-responsible-workflow-interaction --strict` 通过。
- 6.3：页面与组件静态审计确认业务页面未直接使用原生 `select`、日期输入或旧 Radix Themes，字段原语中的 `input`/`textarea` 为设计系统内部实现；`npx vitest run src/renderer/components/ui/button/yumi-button.test.tsx src/renderer/components/ui/business-list/yumi-business-list.test.tsx src/renderer/components/ui/dialog/yumi-dialog.test.tsx src/renderer/components/ui/select/yumi-select.test.tsx src/renderer/components/ui/date-picker/yumi-date-picker.test.tsx src/renderer/components/ui/empty-state/yumi-empty-state.test.tsx src/renderer/styles/layering.test.ts src/renderer/pages/app-components.test.ts`（8 个文件、39 项通过）；`npm run typecheck` 通过；`git diff --check -- <6.3 相关文件>` 通过；`npx openspec validate rebuild-responsible-workflow-interaction --strict` 通过。
- 6.4：`npx vitest run` 覆盖共享契约、V2 runtime、IPC、财务/工资/履约/订单/售后/工作台服务及 Renderer（19 个文件、77 项通过）；`npm run lint` 通过（修复 `fulfillment/index.tsx` 中一个未使用类型导入）；`npm run build` 通过；`npm test` 通过（53 个文件、151 项）；`npm run typecheck` 已在 6.1–6.3 验证通过。

- 6.5：方案文档已回写实际交互结果、售后由负责人显式决策的边界、在制品按当前工序接入的边界、无环境阻塞与完整验证结果；`npx openspec validate rebuild-responsible-workflow-interaction --strict` 通过；`git diff --check` 通过。
