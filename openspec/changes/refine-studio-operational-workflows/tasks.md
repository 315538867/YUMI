# 工作室运营流程优化实施任务

- 提案名称：工作室运营流程优化
- Change ID：`refine-studio-operational-workflows`
- 方案版本：v1.3
- 状态：已完成
- 创建人：Codex
- 创建时间：2026-09-05
- 最后修改时间：2026-09-06

## 1. 数据迁移与共享契约

- [x] 1.1 在 `src/main/database/migrations.ts` 新增运营流程迁移：为 `products` 增加 `accessory_cost_cents`、`replacement_bag_cost_cents`，为 `order_items` 增加对应快照列，为 `shift_tasks` 增加可空 `completed_quantity`、`unqualified_quantity`；新增 `shipments`、`shipment_items` 表及订单/订单商品索引、唯一约束和非负数量约束；以事务重建 `shifts` 表，将 `start_time`/`end_time` 改为可空历史兼容列、保留业务列并增加 `extra_minutes INTEGER NOT NULL DEFAULT 0`，恢复 `idx_shifts_worker_date` 等索引；完成条件是旧费用回填 0、旧完成数量保持 `NULL`、历史排班保留 ID/任务/日期/状态/风险/备注及原有时间数据；验证方式为扩充 `src/main/database/database.test.ts` 并运行 `npm test -- src/main/database/database.test.ts`。
- [x] 1.2 在 `src/shared/contracts.ts` 扩展商品输入、商品成本预览、商品详情和订单商品快照的配件费/替换袋费用字段；扩展订单文档生成输入/结果、本次发货记录/发货汇总类型和本月重量报表类型；调整 `ShiftInput`、`ShiftUpdateInput`、`ShiftPreviewResult`、`ShiftSummary`、`ShiftDetail`、`ShiftStatusInput` 和风险代码，加入预留时长与完成数量并移除固定时段字段/风险；新增发货记录创建、发货明细、已发/待发汇总和带 `shipmentId` 的导出契约；完成条件是所有进程共享同一输入和输出形状；验证方式为 `npm run typecheck`。
- [x] 1.3 在 `src/preload/index.ts` 与 `src/main/ipc/register-ipc.ts` 注册并暴露发货记录新增/查询、订单工作簿生成、月度重量查询，以及携带任务完成记录的排班状态更新接口；完成条件是 IPC 不接受绕过完成数量校验的“已完成”请求，发货数量保存和已发/待发计算均经过服务校验，导出可携带 `shipmentId` 并返回保存路径；验证方式为 IPC/服务集成测试和 `npm run typecheck`。

## 2. 商品费用、单页创建与订单地址

- [x] 2.1 在 `src/main/domain/costing.ts` 扩展成本输入和计算结果，将单件配件费和单件替换袋费用按订单数量计入预计直接成本；完成条件是两个费用都允许为 0 且总成本可解释地包含它们；验证方式为更新并运行 `npm test -- src/main/domain/costing.test.ts`。
- [x] 2.2 在 `src/main/services/studio-service.ts` 的商品 Zod schema、`createProduct`、`updateProduct`、`previewProductCost`，以及 `src/main/repositories/studio-repository.ts` 的商品保存、读取、订单创建和订单详情查询路径中保存费用、生成订单商品快照并保留历史快照；完成条件是修改商品费用不改变既有订单，且新订单/成本预览使用新费用；验证方式为更新产品与订单服务测试并运行相关 `npm test` 用例。
- [x] 2.3 在 `src/renderer/pages/app.tsx` 的 `ProductDialog` 和商品详情编辑流程中，把商品基础资料、制作参数和费用组织为单一连续表单，新增“配件费”“替换袋费用”输入并显示成本预览；完成条件是无“下一步”式创建流程，输入为空按 0 处理，负数或非数值无法保存；验证方式为更新 `src/renderer/pages/app-components.test.ts`、运行 `npm run typecheck` 并人工检查。
- [x] 2.4 在 `src/renderer/pages/app.tsx` 的 `OrderDialog`、订单检查器和相关标签中将“常用地址”统一改为“收货地址”，并在已选择且有地址的客户时提供“复制客户收货地址”操作；完成条件是复制只修改当前订单草稿/快照，不回写客户资料；验证方式为订单创建/更新服务测试和渲染交互测试。
- [x] 2.5 在订单更新服务和 `src/main/repositories/studio-repository.ts` 中增加发货数量保护：订单商品订购数量不得小于累计已发数量，已有发货明细的订单商品不得直接删除；完成条件是修改/删除会返回明确校验错误且不会破坏已有发货记录；验证方式为订单更新服务测试和发货累计集成测试。

## 3. 订单表与发货清单导出

- [x] 3.1 在 `src/main/services` 新增或扩展订单工作簿生成服务，复用 `xlsx` 将已保存订单快照转换为一个含“订单表”“发货清单表”的工作簿；订单表包含订单、客户、收货信息、商品明细、数量和金额汇总，发货清单包含订购数量、本次发货数量、累计已发数量及待发数量；完成条件是生成过程不新增发货记录、不修改订单状态，带 `shipmentId` 时展示本次发货数量，不带时本次发货列为空且累计结果正确，缺失图片时仍输出完整文字资料；验证方式为新增服务测试，解析工作簿并断言工作表名、关键单元格、累计已发和待发汇总。
- [x] 3.2 在 `src/main/ipc/register-ipc.ts`、`src/preload/index.ts` 和 `src/main/services/studio-service.ts` 串联发货记录新增/查询/修改、已发/待发汇总、订单工作簿生成与现有保存文件流程，并在 `src/renderer/pages/app.tsx` 的订单详情提供本次发货录入和“生成订单表和发货清单”操作；完成条件是用户可创建或修改发货批次、填写并保存本次发货数量、看到累计已发和待发数量，并可选择某批次导出后获得保存位置和结果提示；验证方式为 IPC 模拟测试、渲染交互测试和人工导出检查。
- [x] 3.3 在 `src/renderer/styles/app.css` 调整订单详情导出入口、地址展示和长商品名称的视觉布局；完成条件是控件在桌面窗口下可访问、标签不截断且不与订单操作冲突；验证方式为 `npm run lint` 与截图审查。

## 4. 月度产出重量统计

- [x] 4.1 在 `src/main/repositories/studio-repository.ts` 新增本月重量聚合查询：仅汇总已完成且 `completed_quantity`、`qualified_quantity`、`unqualified_quantity` 均有完整记录且三者满足求和关系的排班任务，使用订单商品重量快照计算克数，并返回实际完成数量、克与千克展示所需值；完成条件是实际完成数量等于合格数量与不合格数量之和，待执行、取消和历史未登记完整质量数据的任务不参与统计，合格与不合格品均计入；验证方式为新增仓储/服务测试覆盖跨月、质量数量和历史记录场景。
- [x] 4.2 在 `src/main/services/studio-service.ts`、`src/shared/contracts.ts` 和 IPC/preload 中暴露月度重量查询，在 `src/renderer/pages/app.tsx` 的概览或报表工作区显示“本月捏捏总重量”；完成条件是同时显示克和千克且使用当前自然月；验证方式为 `src/renderer/pages/app-components.test.ts`、服务测试和 `npm run typecheck`。

## 5. 按任务时长的排班与完成数量

- [x] 5.1 在 `src/main/domain/scheduling.ts` 将预览模型改为任务基础总时长加全局额外预留时长，基础任务时长按计划数量乘标准时长并向上取整，删除开始/结束时间、人员重叠、时段超载和未排满的计算，保留模具日产能与交期风险；完成条件是预览返回每项基础时长、基础任务总时长、额外预留时长、最终总时长和适用风险；验证方式为更新并运行 `npm test -- src/main/domain/scheduling.test.ts`。
- [x] 5.2 在 `src/main/repositories/studio-repository.ts` 的排班预览、保存、更新、详情读取和状态更新路径中保存/读取 `extra_minutes`、汇总总时长，并在一个数据库事务内写入每个任务的 `completed_quantity`、`qualified_quantity`、`unqualified_quantity` 与排班状态；实际完成数量由合格数量与不合格数量之和生成；完成条件是任一任务数据无效时数量和状态均不写入，历史记录仍可读且详情读取已保存的不合格数量；验证方式为新增原子性、历史迁移和质量数量持久化断言。
- [x] 5.3 在 `src/main/services/studio-service.ts` 的排班 schema、`previewShift`、`saveShift`、`updateShift` 和 `updateShiftStatus` 中实施边界校验：预留时长必须为非负整数；目标状态为已完成时每个任务均必须提供合格和不合格数量，实际完成数量由两者自动汇总；完成条件是非完成状态不强制质量记录，质量数量均为非负整数且错误可定位到无效输入；验证方式为更新并运行 `npm test -- src/main/services/scheduling-management.test.ts`。
- [x] 5.4 在 `src/renderer/pages/app.tsx` 的 `ShiftDialog`、预览区域、`ShiftInspector`、状态操作和 `ProductionRecordDialog` 流程中移除起止时间控件，新增排班级“额外预留时长（分钟）”，展示任务/基础/最终总时长，并在选择“已完成”时要求逐任务填写合格和不合格数量，自动展示实际完成数量（合格 + 不合格）；完成条件是遗漏任务、负数/小数/非数字或负质量数量均不得完成提交；验证方式为渲染交互测试和服务集成测试。
- [x] 5.5 在 `src/renderer/styles/app.css` 调整时长汇总与完成登记表格的数字对齐、错误反馈和桌面布局；完成条件是任务、时长和质量数量均可辨识且无裁切/重叠；验证方式为 `npm run lint`、人工窗口检查和截图审查。

## 6. 演示数据、报表边界与回归验证

- [x] 6.1 更新 `src/main/services/demo-data-service.ts` 及相关测试，使演示商品包含新增费用、订单含费用快照、排班使用预留时长并通过完整合格/不合格数量登记；完成条件是演示数据不依赖固定起止时间，并包含至少两次发货记录及正确的已发/待发汇总；验证方式为演示数据服务测试与人工加载检查。
- [x] 6.2 审查 `src/main/services/report-management.test.ts`、`src/main/services/worker-settlement-report.test.ts` 与关联查询，确保本期新增质量数据不触发或展示不合格扣费、工资或提成计算；完成条件是没有新增基于不合格数量的金额字段或公式；验证方式为运行受影响报表测试和代码审查。
- [x] 6.3 运行完整质量门禁：`npm run typecheck`、`npm run lint`、`npm test` 和 `npm run build`；完成条件是所有命令退出码为 0，任何失败均记录实施证据且不勾选未完成任务；验证方式为保存命令输出摘要。
- [x] 6.4 实施完成后逐项更新本文件复选框，在 `proposal.md` 记录实际完成时间和验证结果，并执行 `openspec validate refine-studio-operational-workflows --strict`；完成条件是每项任务均具备实现与验证证据，OpenSpec 严格校验通过；验证方式为读取完整校验输出。
