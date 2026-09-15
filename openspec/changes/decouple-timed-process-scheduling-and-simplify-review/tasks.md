## 1. 锁定契约与领域规则

- [ ] 1.1 在 `src/shared/contracts/fulfillment.ts` 及其类型测试中把工作安排创建输入拆为制作任务排班与计时公共班次，并加入制作一次核算输入、排班模式和只读核算摘要类型。
- [ ] 1.2 在 `src/shared/contracts/work-time-reviews.ts` 及其类型测试中移除新写入路径的草稿/手工分钟/`processTaskId` 输入，新增时间范围、`orderItemId` 明细、候选、更正与作废契约，同时保留历史读取所需兼容字段。
- [ ] 1.3 在 `src/main/domain/work-time-review.ts`、`src/shared/calculations/work-time.ts` 先补失败测试，再实现分钟精度时间范围校验、跨日分钟计算、开始日期归属、预计总分钟/时间差/效率计算。
- [ ] 1.4 在 `src/main/domain/fulfillment.ts` 及测试中补齐制作核算数量守恒规则：允许零产出、合格不超过实际产出、实际产出不超过本次计划、不合格与未完成由系统计算，零产出不生成履约或工资数量。
- [ ] 1.5 在共享履约契约和领域测试中定义确定性的 `sourceEventKey`，覆盖一个计时核算明细生成多条合法分流事件及重复命令幂等。

## 2. 数据库迁移与兼容模型

- [ ] 2.1 在 `src/main/database/v2-migrations.ts` 新增 v16 migration，为 `work_assignments` 增加排班模式，将既有记录标记为 `legacy_task`，并对新 `timed_shift` 建立人员/日期/工序未取消唯一约束。
- [ ] 2.2 在 v16 migration 中扩展 `work_time_reviews` 的直接安排关联、更正/作废审计链字段，将既有草稿转换为作废历史且不新增履约或工资事实。
- [ ] 2.3 在 v16 migration 中兼容重建 `process_results`，允许完成数量为零，增加制作核算有效/作废、版本替代和原因字段，并把既有结果迁移为有效历史版本。
- [ ] 2.4 在 v16 migration 中为 `fulfillment_events` 增加可空 `source_event_key`，对新来源建立 `(source_record_type, source_record_id, source_event_key)` 部分唯一索引，历史事件不得被重放或改写。
- [ ] 2.5 在 v16 migration 中事务化重建 `work_time_review_items`，以 `order_item_id` 支持新明细并加入提成、单件预计分钟快照，同时保留可空历史 `process_task_id`。
- [ ] 2.6 在 v16 migration 中兼容调整 `worker_settlement_timed_items`，加入核算明细来源并允许旧任务关联与新订单商品关联并存。
- [ ] 2.7 更新目标结构守卫，并在 `src/main/database/v2-storage.test.ts` 或现有迁移测试中覆盖全新库、v15 升级、零产出制作结果、历史已确认/已作废记录守恒、草稿释放、事件幂等键和重复计时排班约束。

## 3. 工作安排仓储与服务

- [ ] 3.1 先在 `src/main/services/fulfillment-service.test.ts` 增加制作排班仍要求任务、计时排班拒绝任务和数量、任意日期可排、重复计时安排被拒绝、返工/售后补发仅制作可用的失败测试。
- [ ] 3.2 更新 `src/main/repositories/fulfillment-repository.ts` 的映射、创建、查询和状态更新，使无任务 `timed_shift` 可持久化并让历史 `legacy_task` 继续可读。
- [ ] 3.3 更新 `src/main/services/fulfillment-service.ts`，按排班模式分派校验；制作继续执行订单需求及超排规则，计时排班不查询订单可处理量、不生成任务、不参与已派/待派/超派汇总。
- [ ] 3.4 更新取消、缺勤、完成状态逻辑及相关测试，确保制作释放未核算计划数量、计时取消不改变订单履约、已有有效核算不能被状态更新静默撤销。

## 4. 制作一次核算

- [ ] 4.1 在 `src/main/services/fulfillment-service.test.ts` 先覆盖一次提交实际产出与合格数量、系统计算不合格/未完成、零产出、零合格、实际产出超过本次计划被拒绝、重复提交和事务失败回滚。
- [ ] 4.2 在 `src/main/repositories/fulfillment-repository.ts` 提供同一事务写入制作结果、质量事实、履约事件及任务状态的原子仓储操作。
- [ ] 4.3 在 `src/main/services/fulfillment-service.ts` 实现制作一次核算命令，直接把任务置为已确认并生成制作工资与材料扣款所需事实，不再产生新的待质检中间状态。
- [ ] 4.4 保留历史两步结果/质检数据的读取兼容，但从新 IPC 和渲染入口移除两步写入；用现有制作结算测试验证合格计件和不合格材料扣款口径不变。
- [ ] 4.5 实现制作更正与作废服务及测试：以 `process_result` 为版本根，原子回退质量、履约、制作工资和材料扣款来源；草稿结算同步重算，存在下游消耗或已确认结算时拒绝。

## 5. 计时候选与一次核算

- [ ] 5.1 在 `src/main/services/work-time-review-service.test.ts` 先增加候选测试，覆盖捏毛装袋、缝边剩余需求、打包发货可处理量、跨订单搜索、逾期/交期/订单时间排序及默认数量来源。
- [ ] 5.2 更新 `src/main/repositories/work-time-review-repository.ts`，提供按订单商品读取候选事实、直接保存核算明细快照、按安排读取当前有效核算及历史版本链的能力。
- [ ] 5.3 在 `src/main/services/work-time-review-service.ts` 实现计时候选查询，验证班次人员/日期/工序并返回客户、订单号、商品、交期、可处理数量、提成和预计分钟快照。
- [ ] 5.4 先补失败测试，再实现计时一次确认：只接受单个安排和一个时间范围，在事务内重新计算可处理量、逐项校验数量、冻结时薪/提成/预计分钟并直接生成履约事件和已核算记录。
- [ ] 5.5 增加幂等与并发保护测试，确保重复提交、已有当前有效核算、两个窗口竞争同一订单商品时不会重复履约、超量处理或重复计薪，并覆盖捏毛装袋同一明细按不同 `sourceEventKey` 合法分流两条事件。
- [ ] 5.6 实现计时更正和作废服务及测试：未锁定时原子回退并保留版本/原因，作废后班次回到待核算；已进入草稿结算时取消旧来源并重算草稿，存在下游消耗或已确认结算时拒绝并返回明确原因。

## 6. 工资结算与历史兼容

- [ ] 6.1 在 `src/main/services/settlement-service.test.ts` 和 `src/main/application/v2-work-time-payroll.e2e.test.ts` 先覆盖新计时核算按分钟时薪加商品提成、打包提成为零、跨商品汇总和快照不受商品后续修改影响。
- [ ] 6.2 更新 `src/main/repositories/settlement-repository.ts`，让新计时结算直接读取 `work_time_review_items` 快照，不再依赖计时 `process_tasks`，同时兼容历史任务型核算和既有已确认结算。
- [ ] 6.3 更新 `src/main/services/settlement-service.ts` 的候选、结算明细和调整逻辑：制作或计时核算更正/作废时取消草稿来源并重新计算草稿金额；已确认结算锁阻止直接操作，历史已确认金额不得被迁移或重新计算。

## 7. Runtime、IPC 与 preload

- [ ] 7.1 更新 `src/main/application/v2-runtime.ts`、现有 IPC handler 和 `src/preload/index.ts`，暴露制作一次核算、制作/计时更正与作废、计时候选、计时确认及新的排班创建契约，并移除渲染层对草稿/确认工时写入路径的依赖。
- [ ] 7.2 更新 `src/shared/contracts/index.ts` 与 `src/renderer/global.d.ts` 或现有窗口 API 声明，确保主进程、preload、渲染进程对新契约无重复定义。
- [ ] 7.3 增加 runtime/IPC 集成测试，验证渲染输入不能绕过结束时间、可处理数量、重复核算、锁定记录和计时排班唯一性校验。

## 8. 人员周历、负责人工作台与唯一排班入口

- [ ] 8.1 在 `src/renderer/pages/fulfillment/index.test.tsx` 与 `src/renderer/styles/fulfillment-dispatch-layout.test.ts` 先锁定排班默认人员周历、订单视角移除、周切换及仅日期格显示“+ 派工”。
- [ ] 8.2 更新 `src/renderer/pages/fulfillment/index.tsx` 和 `src/renderer/components/fulfillment/dispatch-views.tsx`，移除订单视角及行内派工，保留现有人员周历布局、人员稳定配色和历史/未来周浏览。
- [ ] 8.3 重构派工抽屉及 `src/renderer/composables/use-fulfillment.ts`：制作显示订单商品、数量、来源和超排确认；计时只显示人员、日期、工序、备注，并处理重复班次错误。
- [ ] 8.4 更新周历卡片及组件测试：制作卡显示商品/数量/核算状态，计时卡只显示“工序 · 待核算/已核算”；排班日期不晚于今天的待核算卡可打开核算，未来日期只打开安排详情，提交时再校验实际结束时间。
- [ ] 8.5 更新 `src/main/services/workbench-service.ts`、工作台契约及测试，使制作待核算任务与无任务 `timed_shift` 都直接生成“待核算”事项，不再依赖制作 `pending_inspection` 或计时 `process_tasks`。
- [ ] 8.6 更新负责人工作台页面与导航测试，使制作/计时待核算事项深链到排班菜单待核算视图，并保留返回工作台时的视图和筛选上下文。

## 9. 单次核算界面

- [ ] 9.1 在 `src/renderer/components/fulfillment/work-time-review-panel.test.tsx` 先重写行为测试，确保待核算只有制作/计时两类“核算”入口，页面不存在保存草稿、保存并确认、确认工时和制作待质检二次按钮。
- [ ] 9.2 更新 `src/renderer/components/fulfillment/work-time-review-panel.tsx` 与 `src/renderer/composables/use-work-time-reviews.ts`，实现制作实际产出+合格数量表单，允许零产出、阻止超过本次计划，并只读展示系统计算的不合格和未完成数量。
- [ ] 9.3 实现计时时间范围选择、跨日展示、结束时间未到提示、系统计算分钟和按人员/日期/工序预填，禁止手工编辑分钟。
- [ ] 9.4 实现计时商品搜索选择器，展示客户、订单号、商品、交期和可处理数量，按服务端顺序呈现；勾选默认填满、允许调小并在提交前做界面层校验。
- [ ] 9.5 在同一核算表单展示预计总分钟、时间差和预计效率，明确为只读参考，不影响工资或提交。
- [ ] 9.6 重做已核算记录区域：提供查看、更正、作废及原因输入；更正直接提交新版本，作废后刷新为待核算，锁定时展示不可操作原因和调整指引。

## 10. 工作安排记录与详情导航

- [ ] 10.1 更新 `src/renderer/pages/work-assignments/index.test.tsx`，先断言列表右侧和详情均不存在“新建工作安排”及实际完成/质检/确认工时表单。
- [ ] 10.2 在保留当前工作树既有修改的前提下更新 `src/renderer/pages/work-assignments/index.tsx` 和 `src/renderer/composables/use-work-assignments.ts`，仅保留查询、详情、适用状态操作及核算摘要查看。
- [ ] 10.3 更新订单详情、人员详情及 `src/renderer/pages/app-components.test.ts`，让相关入口只能只读查看安排或跳转到排班人员周历/待核算视图，不自动打开新建表单。
- [ ] 10.4 更新 `src/renderer/styles/components.css`、`src/renderer/styles/pages.css` 及布局测试，保持现有视觉层级并覆盖简化派工抽屉、时间范围、商品选择器和更正/作废反馈。

## 11. 端到端验收与规格同步

- [ ] 11.1 更新 `src/main/application/v2-order-workflow.e2e.test.ts`，覆盖制作一次核算后合格流转、不合格不流转、未完成释放以及三道计时工序直接按订单商品推进阶段。
- [ ] 11.2 增加完整跨日计时场景：先在人员周历补排，再于结束后核算跨订单商品，验证开始日期归属、分钟工资、提成、效率和最终发货可用量。
- [ ] 11.3 增加制作与计时更正/作废 E2E：未锁定事实可原子替换或回退，草稿结算来源被取消并重算，已被下游消耗或已确认结算的事实被阻止且历史审计链完整。
- [ ] 11.4 增加负责人工作台与捏毛分流 E2E：无任务计时班次仍产生待核算事项，一个核算明细可生成两条不同事件键的合法分流且重试不重复。
- [ ] 11.5 运行针对性测试后依次执行 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm build`，修复本变更引入的问题并记录任何与既有工作树修改相关的独立失败。
- [ ] 11.6 根据最终实现同步 `docs/solutions/2026-09-14-timed-process-scheduling-decoupling-solution.md` 的状态/版本记录，并运行 `openspec validate decouple-timed-process-scheduling-and-simplify-review --strict` 确认提案、设计、规格和任务保持一致。
