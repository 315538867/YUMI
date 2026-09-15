## 1. 锁定契约与领域规则

- [x] 1.1 在 `src/shared/contracts/fulfillment.ts` 及其类型测试中把工作安排创建输入拆为制作任务排班与计时公共班次，并加入制作一次核算输入、排班模式和只读核算摘要类型。
  - 证据：`V2WorkAssignmentCreateInput` 改为 `making_task`/`timed_shift` 可判别联合（计时输入类型无 `tasks`）；新增 `V2MakingTaskInput`、`V2MakingReviewInput`/`Correction`/`Void`、`V2WorkAssignmentScheduleMode`、`V2WorkAssignmentStatusUpdateInput`、`V2MakingReviewSummary`/`V2TimedReviewSummary`、`V2ReviewLockState`、`V2FulfillmentEvent.sourceEventKey`，`V2ProcessTask` 增加 `reviewSummary`、`V2WorkAssignment` 增加 `scheduleMode`/`timedReview`；`npx vitest run src/shared/contracts/contracts-v2.test.ts` 退出码 0（7 测试，含新 4 用例）；`npx tsc -p tsconfig.check.json` 对契约文件零错误。
- [x] 1.2 在 `src/shared/contracts/work-time-reviews.ts` 及其类型测试中移除新写入路径的草稿/手工分钟/`processTaskId` 输入，新增时间范围、`orderItemId` 明细、候选、更正与作废契约，同时保留历史读取所需兼容字段。
  - 证据：`V2WorkTimeReviewInput` 改为 `workAssignmentId + startedAt/endedAt + orderItemId 明细`（无 `approvedMinutes`/`assignmentIds`/`workerId`，类型断言 reject 三者）；新增 `V2WorkTimeReviewCorrectionInput`、`V2WorkTimeReviewCandidate`/`Query`；读取模型保留 `draft` 状态、历史 `processTaskId`、`assignmentIds` 兼容字段并增加 `lock`/`supersedesReviewId`/`voidReason`/`voidedAt`；`contracts-v2.test.ts` 断言新形状（`npx vitest run` 7 测试通过）。
- [x] 1.3 在 `src/main/domain/work-time-review.ts`、`src/shared/calculations/work-time.ts` 先补失败测试，再实现分钟精度时间范围校验、跨日分钟计算、开始日期归属、预计总分钟/时间差/效率计算。
  - 证据：TDD 红→绿（先 7 失败 1 通过，后全绿）；新增 `parseMinutePrecisionDateTime`（拒绝秒/毫秒非零与非法日期）、`calculateReviewTimeRange`（跨日 22:00→02:00 = 240 分钟、`workedOn` 取开始日期、结束不晚于开始返回 null）与领域 `assertReviewTimeRange`（结束必须晚于开始、当前时间不早于结束、开始日期等于排班日期）；`npx vitest run src/main/domain/work-time-review.test.ts src/shared/calculations/work-time.test.ts` 退出码 0（8 + 7 测试，预计总分钟/时间差/效率既有 4 用例保持通过）。
- [x] 1.4 在 `src/main/domain/fulfillment.ts` 及测试中补齐制作核算数量守恒规则：允许零产出、合格不超过实际产出、实际产出不超过本次计划、不合格与未完成由系统计算，零产出不生成履约或工资数量。
  - 证据：新增 `calculateMakingReviewQuantities`（不合格 = 实际产出 − 合格，未完成 = 计划 − 实际产出；`0 ≤ 合格 ≤ 实际产出 ≤ 计划`，计划必须正整数）；先补 4 个失败用例再实现；`npx vitest run src/main/domain/fulfillment.test.ts` 退出码 0（14 测试：25/20/18 → 不合格 2、未完成 5；零产出 → 未完成 10；零合格不产生履约事件；超计划与负数/小数拒绝）。
- [x] 1.5 在共享履约契约和领域测试中定义确定性的 `sourceEventKey`，覆盖一个计时核算明细生成多条合法分流事件及重复命令幂等。
  - 证据：`V2FulfillmentEvent.sourceEventKey: string | null` 写入契约并由 `contracts-v2.test.ts` 断言；领域新增 `createFulfillmentEventKey`（`来源类型:来源记录:事件类型:to_目标阶段`，历史事件允许为空）；先补 2 个失败用例再实现，捏毛装袋同一明细分流得到 `...:to_edge_sewing` 与 `...:to_packing` 两条不同键且重试生成同一组键；`npx vitest run src/main/domain src/shared/calculations src/shared/contracts` 退出码 0（22 文件 117 测试）。

## 2. 数据库迁移与兼容模型

- [x] 2.1 在 `src/main/database/v2-migrations.ts` 新增 v16 migration，为 `work_assignments` 增加排班模式，将既有记录标记为 `legacy_task`，并对新 `timed_shift` 建立人员/日期/工序未取消唯一约束。
  - 证据：新增 v16 `v2_timed_shift_and_one_shot_review`（事务化重建 `work_assignments`，状态枚举加入 `absent`，`schedule_mode` 默认 `legacy_task`，既有行全部标记；部分唯一索引 `uq_work_assignments_timed_shift` 仅覆盖 `status NOT IN ('cancelled','absent')`）；测试断言重复 `timed_shift` 被拒、取消/缺勤后允许重建、制作排班不共享约束。
- [x] 2.2 在 v16 migration 中扩展 `work_time_reviews` 的直接安排关联、更正/作废审计链字段，将既有草稿转换为作废历史且不新增履约或工资事实。
  - 证据：新增列 `work_assignment_id`（可空外键）/`supersedes_review_id`/`void_reason`/`voided_at` 与部分唯一索引 `uq_work_time_reviews_assignment_current`；`status='draft'` 的历史记录原位转为 `voided` 并写入迁移原因；升级测试断言草稿对应履约事件数与结算来源数不变（0 新增）。
- [x] 2.3 在 v16 migration 中兼容重建 `process_results`，允许完成数量为零，增加制作核算有效/作废、版本替代和原因字段，并把既有结果迁移为有效历史版本。
  - 证据：重建后 `CHECK(completed_quantity >= 0)`、`status IN ('confirmed','voided')`、`supersedes_result_id`/`void_reason`/`voided_at` 与每任务一条当前有效结果的部分唯一索引；升级测试断言历史结果保持 `confirmed` 且质量事实守恒、零产出结果可写入、重复当前有效结果被 UNIQUE 拒绝。
- [x] 2.4 在 v16 migration 中为 `fulfillment_events` 增加可空 `source_event_key`，对新来源建立 `(source_record_type, source_record_id, source_event_key)` 部分唯一索引，历史事件不得被重放或改写。
  - 证据：`source_event_key TEXT` 可空列 + 部分唯一索引；升级测试断言历史事件保持空键且未被改写，同一来源记录写入两个不同键的事件成功、重复键被 UNIQUE 拒绝。
- [x] 2.5 在 v16 migration 中事务化重建 `work_time_review_items`，以 `order_item_id` 支持新明细并加入提成、单件预计分钟快照，同时保留可空历史 `process_task_id`。
  - 证据：重建后 `order_item_id`/`process_task_id` 均可空、新增 `piece_rate_cents_snapshot`/`expected_unit_minutes_snapshot`，历史行保留 `UNIQUE(review_id, process_task_id)`，新行唯一性用部分索引 `(review_id, order_item_id) WHERE process_task_id IS NULL` 避免历史多任务聚合冲突；升级测试断言历史明细回填 `order_item_id` 与任务冻结提成、预计分钟留空。
- [x] 2.6 在 v16 migration 中兼容调整 `worker_settlement_timed_items`，加入核算明细来源并允许旧任务关联与新订单商品关联并存。
  - 证据：重建后新增 `work_time_review_item_id`（可空）、`process_task_id` 可空，两个部分唯一索引分别约束任务关联与核算明细关联；升级测试断言历史结算明细保留任务关联且新来源列为空、历史结算金额守恒。
- [x] 2.7 更新目标结构守卫，并在 `src/main/database/v2-storage.test.ts` 或现有迁移测试中覆盖全新库、v15 升级、零产出制作结果、历史已确认/已作废记录守恒、草稿释放、事件幂等键和重复计时排班约束。
  - 证据：`requiredTargetColumns` 新增 9 个目标列（排班模式、核算直接关联与版本链、结果版本、事件幂等键、商品快照、结算明细来源）；迁移运行器拆出 `runV2MigrationsUpTo` 测试夹具并导出；`npx vitest run src/main/database/v2-storage.test.ts` 退出码 0（11 测试，新增「全新库建立排班模式与重复计时班次唯一约束」「v15 升级保留历史事实、释放草稿并允许零产出制作结果」2 个用例，覆盖全新库、v15 升级、零产出、历史守恒、草稿释放、事件幂等键、重复计时排班）；既有版本号断言更新为 16 且 `PRAGMA foreign_key_check` 为空。

## 3. 工作安排仓储与服务

- [x] 3.1 先在 `src/main/services/fulfillment-service.test.ts` 增加制作排班仍要求任务、计时排班拒绝任务和数量、任意日期可排、重复计时安排被拒绝、返工/售后补发仅制作可用的失败测试。
  - 证据：先补 7 个失败用例再实现（红→绿）；覆盖制作缺少任务/错选计时工序/缺少订单商品、计时夹带 `tasks`/`plannedQuantity`/`plannedMinutes`/`extraMinutes`、过去日期可排、重复班次拒绝且取消后可重建、返工仅制作可用、缺勤/取消释放未核算数量、有效核算不可被状态更新撤销。
- [x] 3.2 更新 `src/main/repositories/fulfillment-repository.ts` 的映射、创建、查询和状态更新，使无任务 `timed_shift` 可持久化并让历史 `legacy_task` 继续可读。
  - 证据：`insertWorkAssignment` 写入 `schedule_mode`；`getWorkAssignment/listWorkAssignments` 映射 `scheduleMode` 与 `timedReview` 摘要（新记录按直接关联、历史记录回退关联表）；新增 `updateWorkAssignmentStatus`、`findActiveTimedShift`、`voidProcessResult`、任务行核算摘要左连接（`reviewSummary`）与事件 `source_event_key` 映射；`completeWorkAssignmentWhenResolved` 对无任务班次不做“已完成”推断。
- [x] 3.3 更新 `src/main/services/fulfillment-service.ts`，按排班模式分派校验；制作继续执行订单需求及超排规则，计时排班不查询订单可处理量、不生成任务、不参与已派/待派/超派汇总。
  - 证据：`createWorkAssignment` 按 `scheduleMode` 分派（输入判别联合 + 主进程字段组合校验，不信任渲染层）；制作任务冻结商品快照（提成/材料用量），继续走订单商品与计划数量；计时班次只写人员/日期/工序/备注、不创建 `process_tasks`、不做任何订单商品查询（已派/待派/超派由任务推导，故自动不参与）；新增 `setWorkAssignmentStatus`（缺勤/取消）与 `assertFulfillmentEventCanApply` 复用给计时核算；`reassignProcessTask` 限制为制作任务；`npx vitest run src/main/services/fulfillment-service.test.ts` 退出码 0（13 测试）。
- [x] 3.4 更新取消、缺勤、完成状态逻辑及相关测试，确保制作释放未核算计划数量、计时取消不改变订单履约、已有有效核算不能被状态更新静默撤销。
  - 证据：缺勤/取消把未核算任务置为 `cancelled` 并作废未质检的历史结果（释放计划数量，履约阶段数量不变）；计时班次只结束班次、履约数量零变化（测试断言）；已存在有效核算（任务 `reviewSummary` 或计时 `timedReview`）时拒绝状态更新并提示先作废核算；`npx vitest run src/main/services/fulfillment-service.test.ts src/main/services/report-service.test.ts src/main/services/workbench-service.test.ts src/main/ipc src/main/database` 退出码 0（13 + 10 + 2 + 16 测试）。

## 4. 制作一次核算

- [x] 4.1 在 `src/main/services/fulfillment-service.test.ts` 先覆盖一次提交实际产出与合格数量、系统计算不合格/未完成、零产出、零合格、实际产出超过本次计划被拒绝、重复提交和事务失败回滚。
  - 证据：先补 5 个失败用例再实现；覆盖 25 件计划 20 产出 18 合格 → 不合格 2 / 未完成 5、零产出与零合格不生成履约数量、超计划与合格超产出被拒、重复提交被拒、已取消任务被拒、订单需求不足时整个事务回滚（结果/质检/事件零残留，任务保持待核算）。
- [x] 4.2 在 `src/main/repositories/fulfillment-repository.ts` 提供同一事务写入制作结果、质量事实、履约事件及任务状态的原子仓储操作。
  - 证据：仓储提供 `transaction()` 包裹下的 `insertProcessResult`/`insertQualityInspection`/`insertFulfillmentEvent`/`updateTaskStatus`/`completeWorkAssignmentWhenResolved` 与 `voidProcessResult`/`deleteFulfillmentEventsForInspection`/`resetTaskToPending`；一次核算把这些写入组合在单个 SQLite 事务内（回滚用例断言无残留）。
- [x] 4.3 在 `src/main/services/fulfillment-service.ts` 实现制作一次核算命令，直接把任务置为已确认并生成制作工资与材料扣款所需事实，不再产生新的待质检中间状态。
  - 证据：`reviewMaking` 校验任务为制作且未核算、按 `calculateMakingReviewQuantities` 守恒校验、合格产出不得超过订单当前待制作数量；原子写入结果 + 质量事实（0/0 也保存）、合格履约事件（含 `sourceEventKey`）并把任务直接置为 `confirmed`、安排置为 `completed`；历史未质检结果按版本链让位；新增 `V2MakingReviewInput` 相关域测试全部通过（`npx vitest run src/main/services/fulfillment-service.test.ts` 退出码 0，23 测试）。
- [x] 4.4 保留历史两步结果/质检数据的读取兼容，但从新 IPC 和渲染入口移除两步写入；用现有制作结算测试验证合格计件和不合格材料扣款口径不变。
  - 证据：`submitProcessResult`/`confirmQualityInspection` 保留为内部兼容方法并补齐 `status`/`supersedesResultId` 等新列写入，历史结果读取（`getProcessResultForTask`、任务 `reviewSummary` 左连接）继续可用；结算口径由改写后的 `settlement-service.test.ts` 验证不变（制作 20 合格 × 300 = 6,000 提成 + 2 不合格材料扣款 17 分，8 测试通过）；IPC 与渲染入口移除见任务 7.1 与 9.x。
- [x] 4.5 实现制作更正与作废服务及测试：以 `process_result` 为版本根，原子回退质量、履约、制作工资和材料扣款来源；草稿结算同步重算，存在下游消耗或已确认结算时拒绝。
  - 证据：新增 `correctMakingReview`/`voidMakingReview`，版本根为结果记录（`supersedes_result_id` + 旧版本 `voided`/原因）；回退履约事件、任务与安排状态；`review-lock.ts` 计算下游消耗（按目标阶段余额对比）与确认结算/已抵扣/已退款锁定并返回可读指引；`SettlementService.syncDraftAfterReviewChange` 取消旧草稿来源、替换新版本来源、重建未抵扣扣款并重算草稿金额；测试断言更正直连草稿口径（6,000 → 6,600 提成、材料扣款 17 → 0）、作废回退（安排回到待核算、金额归零）、下游消耗与已确认结算被拒（`npx vitest run src/main/services/fulfillment-service.test.ts` 退出码 0，含 4 个更正/作废用例）。

## 5. 计时候选与一次核算

- [x] 5.1 在 `src/main/services/work-time-review-service.test.ts` 先增加候选测试，覆盖捏毛装袋、缝边剩余需求、打包发货可处理量、跨订单搜索、逾期/交期/订单时间排序及默认数量来源。
  - 证据：重写测试文件并先跑失败；新增候选用例覆盖：逾期优先→交期升序→无交期置后排序、按客户/订单号搜索、候选携带客户/订单号/商品/交期/可处理量/预计单件分钟/提成快照、缝边 `min(待缝边量, 订单剩余缝边需求)`（4 件需求场景）、打包候选 = 待打包量且提成为 0；`npx vitest run src/main/services/work-time-review-service.test.ts` 退出码 0（10 测试）。
- [x] 5.2 更新 `src/main/repositories/work-time-review-repository.ts`，提供按订单商品读取候选事实、直接保存核算明细快照、按安排读取当前有效核算及历史版本链的能力。
  - 证据：仓储重写为 `listCandidates`（履约事件聚合计算各工序余额，不依赖任务）、`insertReview`（新明细写 `order_item_id` 与提成/预计分钟快照，同时维护兼容关联表）、`getCurrentConfirmedReviewForAssignment`、`voidReview`、`deleteFulfillmentEventsForItems`、`setAssignmentCompleted`/`setAssignmentScheduled` 与 `toReadModel`（含 `lock`）；结算仓储 `listReviewItems` 改为 `COALESCE(快照, 任务冻结提成)` 并新增 `getMakingSourceByInspection`/`getTimedReviewSource`/草稿来源取消与扣款移除能力。
- [x] 5.3 在 `src/main/services/work-time-review-service.ts` 实现计时候选查询，验证班次人员/日期/工序并返回客户、订单号、商品、交期、可处理数量、提成和预计分钟快照。
  - 证据：`listCandidates(assignmentId, {search})` 校验安排存在且未取消/缺勤、工序为计时工序，返回排序后的候选（`sortCandidates` 导出并测试）；制作排班查询候选被拒。
- [x] 5.4 先补失败测试，再实现计时一次确认：只接受单个安排和一个时间范围，在事务内重新计算可处理量、逐项校验数量、冻结时薪/提成/预计分钟并直接生成履约事件和已核算记录。
  - 证据：`review` 只接受 `workAssignmentId + startedAt/endedAt + orderItemId 明细`；事务内复算候选、逐项校验可处理量、冻结工作日期生效时薪与商品快照、按工序生成履约事件（捏毛装袋按剩余缝边需求分流）并直接写为已核算；时间范围校验覆盖分钟精度、开始日期等于排班日期、结束晚于开始且不晚于当前时间、跨日归属开始日期（240 分钟）。
- [x] 5.5 增加幂等与并发保护测试，确保重复提交、已有当前有效核算、两个窗口竞争同一订单商品时不会重复履约、超量处理或重复计薪，并覆盖捏毛装袋同一明细按不同 `sourceEventKey` 合法分流两条事件。
  - 证据：测试断言重复提交抛“已完成核算”且事件数不变（2 → 2）；候选加载后由其他窗口消耗可处理量时提交被拒（模拟并发）；捏毛装袋同一明细分流 `to_edge_sewing` 与 `to_packing` 两条不同键事件；候选与确认均在单事务内保证不重复计薪（结算来源唯一约束兜底）。
- [x] 5.6 实现计时更正和作废服务及测试：未锁定时原子回退并保留版本/原因，作废后班次回到待核算；已进入草稿结算时取消旧来源并重算草稿，存在下游消耗或已确认结算时拒绝并返回明确原因。
  - 证据：`correct` 先回退旧版本再复算可处理量（失败整体回滚）、保留 `supersedesReviewId` 版本链、草稿来源替换并重算（9,000 → 4,500 计时工资）；`void` 回退履约、班次回到 `scheduled`、草稿金额归零且可重新核算；下游消耗（缝边消耗待缝边池）与已确认结算锁定被拒并返回指引；历史聚合核算（`work_assignment_id` 为空）明确只读。`npx vitest run src/main/services/work-time-review-service.test.ts` 退出码 0（10 测试）。

## 6. 工资结算与历史兼容

- [x] 6.1 在 `src/main/services/settlement-service.test.ts` 和 `src/main/application/v2-work-time-payroll.e2e.test.ts` 先覆盖新计时核算按分钟时薪加商品提成、打包提成为零、跨商品汇总和快照不受商品后续修改影响。
  - 证据：结算测试夹具改写为新一次核算流程（含可控时钟）；新增/保留用例断言：240 分钟 × 3,000 分/时 = 12,000 计时工资与 20 × 85 提成、跨商品汇总（10 × 85 + 5 × 50 = 1,100）、商品参数核算后被修改（85 → 999、预计分钟 4 → 99）结算仍用冻结快照、打包发货只计分钟工资且明细提成为 0；`npx vitest run src/main/services/settlement-service.test.ts` 退出码 0（8 测试）。E2E 部分在任务 11.2 完成。
- [x] 6.2 更新 `src/main/repositories/settlement-repository.ts`，让新计时结算直接读取 `work_time_review_items` 快照，不再依赖计时 `process_tasks`，同时兼容历史任务型核算和既有已确认结算。
  - 证据：`listReviewItems` 以 `LEFT JOIN process_tasks` + `COALESCE(piece_rate_cents_snapshot, process_tasks.piece_rate_cents)` 同时支持新快照与历史任务型；结算明细插入写入 `work_time_review_item_id` 并允许 `process_task_id` 为空（v16 迁移已建对应列与部分唯一索引）；历史已确认结算金额与来源不由任何迁移重新生成。
- [x] 6.3 更新 `src/main/services/settlement-service.ts` 的候选、结算明细和调整逻辑：制作或计时核算更正/作废时取消草稿来源并重新计算草稿金额；已确认结算锁阻止直接操作，历史已确认金额不得被迁移或重新计算。
  - 证据：`syncDraftAfterReviewChange` 仅处理草稿结算（取消旧来源、替换新版本来源、重建未抵扣扣款、按剩余来源重算 `timedWageCents`/`commissionCents`/`materialDeductionCents` 与候选应发）；`assignMakingSource`/`assignTimedSource` 在来源汇总与候选分配中排除 `cancelled`；已确认结算由 `review-lock.ts` 判定锁定并在核算更正/作废前拒绝；制作/计时草稿重算分别由 `fulfillment-service.test.ts` 与 `work-time-review-service.test.ts` 的新用例断言。

## 7. Runtime、IPC 与 preload

- [x] 7.1 更新 `src/main/application/v2-runtime.ts`、现有 IPC handler 和 `src/preload/index.ts`，暴露制作一次核算、制作/计时更正与作废、计时候选、计时确认及新的排班创建契约，并移除渲染层对草稿/确认工时写入路径的依赖。
  - 证据：`V2YumiApi` 更新为 `fulfillment.{setWorkAssignmentStatus, reviewMaking, correctMakingReview, voidMakingReview}` 与 `workTimeReviews.{list,get,listCandidates,review,correct,void}`，移除 `submitProcessResult`/`confirmQualityInspection`/`createDraft`/`updateDraft`/`confirm`；IPC 新增 `v2:fulfillment:assignments:status`、`v2:fulfillment:making-reviews:create|correct|void`、`v2:work-time-reviews:candidates:list|create|correct|void` 并删除旧通道；preload 同步；runtime 组合根把 `SettlementService` 注入 `FulfillmentService` 与 `WorkTimeReviewService`，核算更正/作废时草稿结算同步重算。
- [x] 7.2 更新 `src/shared/contracts/index.ts` 与 `src/renderer/global.d.ts` 或现有窗口 API 声明，确保主进程、preload、渲染进程对新契约无重复定义。
  - 证据：`contracts/index.ts` 导出新契约（含 `V2MakingReview*`、`V2WorkTimeReviewCandidate*`、`V2ReviewLockState`、`V2TimedReviewSummary`、`V2WorkAssignmentScheduleMode` 等）；渲染层 `env.d.ts` 的 `window.yumiV2` 仍以 `V2YumiApi` 单一定义，无重复声明；preload 类型测试断言新通道存在且旧两步通道与草稿通道不再暴露。
- [x] 7.3 增加 runtime/IPC 集成测试，验证渲染输入不能绕过结束时间、可处理数量、重复核算、锁定记录和计时排班唯一性校验。
  - 证据：新增 `src/main/ipc/fulfillment-ipc.integration.test.ts`（真实服务 + 内存库经 IPC 处理器调用）：计时班次重复创建被拒、结束时间晚于当前时间被拒、完成数量超过可处理量被拒、重复核算被拒、已确认结算后作废被拒并保留结算状态、制作更正/作废保留版本链且安排回到待核算；`npx vitest run src/main/ipc` 退出码 0（6 测试）。

## 8. 人员周历、负责人工作台与唯一排班入口

- [x] 8.1 在 `src/renderer/pages/fulfillment/index.test.tsx` 与 `src/renderer/styles/fulfillment-dispatch-layout.test.ts` 先锁定排班默认人员周历、订单视角移除、周切换及仅日期格显示“+ 派工”。
  - 证据：测试先重写后实现；`pages/fulfillment/index.test.tsx`（15 例）断言默认人员周历、无“订单视角”入口、上周/本周/下周切换、仅日期格“+ 派工”、制作抽屉含数量/订单商品而计时抽屉不含数量、重复计时班次错误提示、待核算页签渲染核算面板；`styles/fulfillment-dispatch-layout.test.ts`（4 例）更新到新结构并保留 tokens 守卫。
- [x] 8.2 更新 `src/renderer/pages/fulfillment/index.tsx` 和 `src/renderer/components/fulfillment/dispatch-views.tsx`，移除订单视角及行内派工，保留现有人员周历布局、人员稳定配色和历史/未来周浏览。
  - 证据：删除 `OrderDispatchBoard` 与订单视角页签；页面保留 人员周历（默认）/待核算 两页签、阶段总量概览、周导航与导出排班；周历按天分列、同人员聚合成框并沿用 data-tone 稳定配色；卡片点击：不晚于今天的待核算/已核算卡切到待核算页签并给出定位说明，未来卡只打开只读安排详情，任何卡片都不创建安排。
- [x] 8.3 重构派工抽屉及 `src/renderer/composables/use-fulfillment.ts`：制作显示订单商品、数量、来源和超排确认；计时只显示人员、日期、工序、备注，并处理重复班次错误。
  - 证据：`WorkAssignmentSheet` 按工序切换：制作提交 `scheduleMode:'making_task'` 且保留待派上限校验，计时提交 `scheduleMode:'timed_shift'` 仅人员/日期/工序/备注；主进程重复班次错误在抽屉内展示且不关闭；`use-fulfillment` 新增 `assignments`/`itemLabels`/`setWorkAssignmentStatus` 封装与 `buildWorkerWeekCards`，已派/待派推导只按制作任务。
- [x] 8.4 更新周历卡片及组件测试：制作卡显示商品/数量/核算状态，计时卡只显示“工序 · 待核算/已核算”；排班日期不晚于今天的待核算卡可打开核算，未来日期只打开安排详情，提交时再校验实际结束时间。
  - 证据：制作卡显示 商品名 + `制作 · 计划 N 件` + 核算状态标签（`task.reviewSummary`）；计时卡只有 `工序 · 待核算/已核算`（`assignment.timedReview`）不显示商品名；未来卡只读详情；实际结束时间校验由主进程在提交时执行（任务 5.4 已覆盖），渲染层同步阻止提前确认。
- [x] 8.5 更新 `src/main/services/workbench-service.ts`、工作台契约及测试，使制作待核算任务与无任务 `timed_shift` 都直接生成“待核算”事项，不再依赖制作 `pending_inspection` 或计时 `process_tasks`。
  - 证据：`V2WorkbenchItemKind` 新增 `work_time_review`；`collectTaskItems` 重写为：制作任务在 `reviewSummary` 为空且排班日期不晚于今天时生成「核算制作产出」，未来排班生成待执行的 `process_task`；计时班次（不要求 `process_tasks`）同样按 `timedReview` 为空生成「核算X工时」，已核算/取消/缺勤不生成；`pending_inspection` 专属事项移除；`npx vitest run src/main/services/workbench-service.test.ts` 退出码 0（3 测试，含未来排班不进待核算、已核算/缺勤不生成事项）。
- [x] 8.6 更新负责人工作台页面与导航测试，使制作/计时待核算事项深链到排班菜单待核算视图，并保留返回工作台时的视图和筛选上下文。
  - 证据：`V2NavigationTarget` 的履约目标新增 `workAssignmentId` 与 `focus:'reviews'`；工作台页事项分组改为「排班与核算」、阶段分布「待执行/待核算/待发货」；测试断言 `核算制作产出` 事项点击后导航到 `{view:'fulfillment', processTaskId, workAssignmentId, focus:'reviews'}`；返回工作台视图上下文由 `app.tsx` 的 `workbenchView` 状态与「返回工作台」按钮保留（既有机制，未回归）。

## 9. 单次核算界面

- [x] 9.1 在 `src/renderer/components/fulfillment/work-time-review-panel.test.tsx` 先重写行为测试，确保待核算只有制作/计时两类“核算”入口，页面不存在保存草稿、保存并确认、确认工时和制作待质检二次按钮。
  - 证据：测试先重写后实现（红→绿）；断言待核算行只有“核算”入口、计时行核算前不显示商品名称，并显式断言不含「保存草稿/保存并确认/确认工时/待质检/确认结果」；`npx vitest run src/renderer/components/fulfillment/work-time-review-panel.test.tsx` 退出码 0（11 测试）。
- [x] 9.2 更新 `src/renderer/components/fulfillment/work-time-review-panel.tsx` 与 `src/renderer/composables/use-work-time-reviews.ts`，实现制作实际产出+合格数量表单，允许零产出、阻止超过本次计划，并只读展示系统计算的不合格和未完成数量。
  - 证据：新增 `work-time-review-forms.tsx` 的 `MakingReviewDialog` 与导出校验函数 `validateMakingReviewQuantities`（0 ≤ 合格 ≤ 实际产出 ≤ 本次计划；不合格 = 实际产出 − 合格、未完成 = 计划 − 实际产出 实时只读）；测试覆盖一次提交传参、零产出可提交、超计划/合格大于实际被阻止提示。
- [x] 9.3 实现计时时间范围选择、跨日展示、结束时间未到提示、系统计算分钟和按人员/日期/工序预填，禁止手工编辑分钟。
  - 证据：扩展 `yumi-date-picker.tsx` 提供受控 `YumiDateTimeRangePicker`（分钟精度本地时间串，`formatIsoDateTime` 输出 `YYYY-MM-DDTHH:mm`）；表单头部按人员/排班日期/工序预填；用 `calculateReviewTimeRange` 只读展示核算分钟与归属日期（跨日提示“跨日核算按开始日期归属”）；结束时间晚于当前时间时禁止确认并提示必须在实际结束时间之后；界面无手工分钟输入。
- [x] 9.4 实现计时商品搜索选择器，展示客户、订单号、商品、交期和可处理数量，按服务端顺序呈现；勾选默认填满、允许调小并在提交前做界面层校验。
  - 证据：`TimedReviewDialog` 调 `listCandidates(assignmentId, {search})` 并原序渲染（客户/订单号/商品/交期含逾期标记/可处理数量），搜索触发服务端检索；勾选默认完成数量 = 可处理数量并允许改小；提交前校验 0 < 数量 ≤ 可处理数量（测试断言默认填满、改小与超量提示）。
- [x] 9.5 在同一核算表单展示预计总分钟、时间差和预计效率，明确为只读参考，不影响工资或提交。
  - 证据：效率核对区用 `calculateWorkTimeComparison` 展示预计总分钟（Σ 完成数量 × 单件预计分钟快照）、时间差与预计效率，测试断言 20×3+30×2=120 分钟下的只读数值且不阻止确认。
- [x] 9.6 重做已核算记录区域：提供查看、更正、作废及原因输入；更正直接提交新版本，作废后刷新为待核算，锁定时展示不可操作原因和调整指引。
  - 证据：已核算表提供「查看/更正/作废」；更正要求原因并直连调用（制作 `correctMakingReview`、计时 `correctTimed`）保留版本链；作废要求原因后调用作废接口并刷新待核算；`lock.locked` 时按钮禁用并展示 `lock.message` 作为锁定原因与调整指引；历史 `draft` 记录只读（测试逐项断言）。

## 10. 工作安排记录与详情导航

- [x] 10.1 更新 `src/renderer/pages/work-assignments/index.test.tsx`，先断言列表右侧和详情均不存在“新建工作安排”及实际完成/质检/确认工时表单。
  - 证据：测试重写（6 例）并断言页面不存在“新建工作安排”入口与实际完成/质检/确认工时录入，只保留查询、详情、状态操作与核算摘要查看。
- [x] 10.2 在保留当前工作树既有修改的前提下更新 `src/renderer/pages/work-assignments/index.tsx` 和 `src/renderer/composables/use-work-assignments.ts`，仅保留查询、详情、适用状态操作及核算摘要查看。
  - 证据：页面移除新建按钮与两类录入表单；`use-work-assignments` 收敛为只读加载（assignments/workers/workTimeReviews/itemLabels）并暴露 `setWorkAssignmentStatus`（缺勤/取消，含原因与主进程拒绝回显）、`reassignProcessTask`（仅待处理制作任务）与 `reload`；详情改为就地只读视图（含「返回工作安排列表」），核算摘要来自制作 `reviewSummary` 与计时 `timedReview`。
- [x] 10.3 更新订单详情、人员详情及 `src/renderer/pages/app-components.test.ts`，让相关入口只能只读查看安排或跳转到排班人员周历/待核算视图，不自动打开新建表单。
  - 证据：订单详情行内「派工」改为「前往排班」只读导航（不再携带 `processTaskId`、不自动打开新建表单）；`app-components.test.ts` 更新相关文案与结构断言并通过；工作安排页详情提供「前往核算」只读导航。
- [x] 10.4 更新 `src/renderer/styles/components.css`、`src/renderer/styles/pages.css` 及布局测试，保持现有视觉层级并覆盖简化派工抽屉、时间范围、商品选择器和更正/作废反馈。
  - 证据：样式更新（派工抽屉分模式、周历计时单行卡、核算面板时间范围/候选/锁定反馈）只使用 tokens 变量；`app-components.test.ts` 的色值守卫与布局测试全部通过；`npx vitest run src/renderer` 退出码 0（58 文件 275 测试）。

## 11. 端到端验收与规格同步

- [x] 11.1 更新 `src/main/application/v2-order-workflow.e2e.test.ts`，覆盖制作一次核算后合格流转、不合格不流转、未完成释放以及三道计时工序直接按订单商品推进阶段。
  - 证据：新增“四工序一次核算链路”用例：制作 10 件一次核算（产 8 合 7）后 `stages.making` 只被合格数量扣减（余 3 = 1 不合格 + 2 未完成释放）；捏毛 7 件分流 4 待缝边 + 3 待打包、缝边候选 = min(待缝边 4, 剩余需求 4) = 4、打包候选 7/6 且提成为 0、打包后 readyToShip 7/6；每步断言六阶段余额之和守恒且未完成缺口可重新排产。
- [x] 11.2 增加完整跨日计时场景：先在人员周历补排，再于结束后核算跨订单商品，验证开始日期归属、分钟工资、提成、效率和最终发货可用量。
  - 证据：`v2-work-time-payroll.e2e.test.ts` 新增跨日用例：补排 `timed_shift` 2026-08-07 后核算 22:00→次日 02:00 = 240 分钟、`workedOn` 取 2026-08-07；分钟工资 240/60×3,000 = 12,000 分、跨两个订单商品提成 11×85 = 935 分；效率用 `calculateWorkTimeComparison` 重算一致（预计 220、时间差 20、9,167bp）；打包后 readyToShip 6/5 并成功发货；结算来源 `occurredOn` 归属开始日期。
- [x] 11.3 增加制作与计时更正/作废 E2E：未锁定事实可原子替换或回退，草稿结算来源被取消并重算，已被下游消耗或已确认结算的事实被阻止且历史审计链完整。
  - 证据：制作在 6/6 更正为 6/4 后生成 `supersedesResultId` 版本、履约只反映新版本一次（making 2/fluffingBagging 4）、草稿提成 1,800→1,200 与材料扣款 17 同步重算；作废后任务回 `pending`、安排回 `scheduled`、草稿归零且来源全部 `cancelled`；计时更正 120→60 分钟后旧版本可读（`voided` + 原因）、草稿 6,000→3,000；下游消耗与已确认结算分别被拒；`audit_logs` 断言 `making_review_corrected/voided` 与 `work_time.review_corrected/voided` 的 before/after 与原因完整。
- [x] 11.4 增加负责人工作台与捏毛分流 E2E：无任务计时班次仍产生待核算事项，一个核算明细可生成两条不同事件键的合法分流且重试不重复。
  - 证据：工作台 `decisionItems` 含 `making-review:<taskId>` 与 `timed-review:<assignmentId>`（`kind:'work_time_review'`、深链 `focus:'reviews'`），未来排班不产生事项、核算后事项消失；捏毛 10 件一次核算在需缝边订单上生成 `to_edge_sewing`/`to_packing` 两条不同 `sourceEventKey` 事件，重复提交抛错且事件数保持 2。
- [x] 11.5 运行针对性测试后依次执行 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm build`，修复本变更引入的问题并记录任何与既有工作树修改相关的独立失败。
  - 证据（2026-09-15）：`npx vitest run` 退出码 0（109 文件 529 测试）；`pnpm run typecheck` 为既有 no-op（根 tsconfig `files: []`），改用临时 `tsconfig.check.json` 核查：本变更触碰文件无新增类型错误（既有历史错误如 `workbench-service.ts` 的 `scheduledReferenceWageCents`、`orders/index.tsx` 的 `V2OrderBusinessDetail`、报表导出的 Buffer 类型等在做变更前即存在，未修复以保持范围）；`pnpm run lint` 退出码 0（0 错误 0 警告，拆分 `work-time-review-helpers.ts` 以消除 react-refresh 警告）；`pnpm run format:check` 通过（`prettier --write` 后复检）；`pnpm run build` 退出码 0；`git diff --check` 干净。
- [x] 11.6 根据最终实现同步 `docs/solutions/2026-09-14-timed-process-scheduling-decoupling-solution.md` 的状态/版本记录，并运行 `openspec validate decouple-timed-process-scheduling-and-simplify-review --strict` 确认提案、设计、规格和任务保持一致。
  - 证据：方案文档 frontmatter 与交付追踪更新为「已实施（待授权归档）」并补充 v1.2 版本记录与实施摘要；`openspec validate decouple-timed-process-scheduling-and-simplify-review --strict` 输出「Change is valid」（退出码 0）。
