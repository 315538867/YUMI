import { randomUUID } from 'node:crypto'
import {
  applyFulfillmentEvent,
  calculateMakingReviewQuantities,
  calculateTaskPlannedMinutes,
  createEdgeSewingCompletedEvent,
  createFluffingBaggingCompletedEvents,
  createFulfillmentEventKey,
  createFulfillmentState,
  createMakingQualifiedEvent,
  createPackingCompletedEvent,
  fulfillmentStages,
  processTaskSources,
  validateProcessResult,
  validateQualityInspection,
  type FulfillmentEventDraft,
  type FulfillmentState,
  type MakingReviewQuantities
} from '@main/domain/fulfillment'
import { DomainValidationError } from '@main/domain/errors'
import { makingReviewLockState } from '@main/repositories/review-lock'
import type { ReviewSettlementSync } from '@main/services/settlement-service'
import {
  V2FulfillmentRepository,
  type V2OrderItemFulfillmentSource
} from '@main/repositories/fulfillment-repository'
import type {
  V2FulfillmentAdjustmentInput,
  V2FulfillmentEvent,
  V2MakingReviewCorrectionInput,
  V2MakingReviewInput,
  V2MakingReviewVoidInput,
  V2MakingTaskInput,
  V2MakingWorkAssignmentCreateInput,
  V2OrderItemFulfillment,
  V2ProcessResult,
  V2ProcessResultInput,
  V2ProcessTask,
  V2ProcessTaskReassignmentInput,
  V2QualityInspection,
  V2QualityInspectionInput,
  V2TimedProcessType,
  V2TimedWorkAssignmentCreateInput,
  V2WorkAssignment,
  V2WorkAssignmentCreateInput,
  V2WorkAssignmentQuery,
  V2WorkAssignmentStatusUpdateInput
} from '@shared/contracts/fulfillment'

interface V2Clock {
  createId(): string
  now(): string
}

const defaultClock: V2Clock = {
  createId: randomUUID,
  now: () => new Date().toISOString()
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const timedProcessTypes: readonly V2TimedProcessType[] = [
  'fluffing_bagging',
  'edge_sewing',
  'packing'
]

/** 计时排班不得携带的排班期字段；主进程不信任渲染进程的输入。 */
const forbiddenTimedShiftFields = [
  'tasks',
  'orderItemId',
  'plannedQuantity',
  'plannedMinutes',
  'extraMinutes'
] as const

function nullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function requireText(value: string, label: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new DomainValidationError(`${label}不能为空`)
  return normalized
}

function requireBusinessDate(value: string, label: string): string {
  if (!ISO_DATE.test(value)) throw new DomainValidationError(`${label}格式必须为 YYYY-MM-DD`)
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new DomainValidationError(`${label}无效`)
  }
  return value
}

function requirePositiveInteger(value: number | null | undefined, label: string): number {
  if (!Number.isInteger(value) || value === null || value === undefined || value <= 0) {
    throw new DomainValidationError(`${label}必须是正整数`)
  }
  return value
}

function requireNonNegativeInteger(value: number | null | undefined, label: string): number {
  if (!Number.isInteger(value) || value === null || value === undefined || value < 0) {
    throw new DomainValidationError(`${label}必须是非负整数`)
  }
  return value
}

function requireOptionalNonNegativeCents(
  value: number | null | undefined,
  label: string
): number | null {
  if (value === null || value === undefined) return null
  if (!Number.isInteger(value) || value < 0)
    throw new DomainValidationError(`${label}必须是非负整数分`)
  return value
}

function asState(state: FulfillmentState) {
  return {
    making: state.making,
    fluffingBagging: state.fluffingBagging,
    edgeSewing: state.edgeSewing,
    packing: state.packing,
    readyToShip: state.readyToShip,
    shipped: state.shipped,
    edgeSewingRouted: state.edgeSewingRouted
  }
}

export class FulfillmentService {
  constructor(
    private readonly repository: V2FulfillmentRepository,
    private readonly clock: V2Clock = defaultClock,
    private readonly settlementSync?: ReviewSettlementSync
  ) {}

  /**
   * 按排班模式分派：制作排班继续关联订单商品与计划数量；
   * 计时班次只保存人员、日期、工序与备注，不创建工序任务。
   */
  createWorkAssignment(input: V2WorkAssignmentCreateInput): V2WorkAssignment {
    if (input.scheduleMode === 'making_task') {
      return this.createMakingAssignment(input)
    }
    if (input.scheduleMode === 'timed_shift') {
      return this.createTimedShift(input)
    }
    throw new DomainValidationError('排班模式不合法')
  }

  private createMakingAssignment(input: V2MakingWorkAssignmentCreateInput): V2WorkAssignment {
    const workerId = requireText(input.workerId, '兼职人员标识')
    if (!this.repository.workerExists(workerId)) throw new DomainValidationError('兼职人员不存在')
    const assignedOn = requireBusinessDate(input.assignedOn, '安排日期')
    if (input.processType !== 'making') {
      throw new DomainValidationError('制作排班只能选择制作工序')
    }
    if (!Array.isArray(input.tasks) || input.tasks.length === 0) {
      throw new DomainValidationError('制作排班至少需要一条工序任务')
    }

    return this.repository.transaction(() => {
      const now = this.clock.now()
      const assignmentId = this.clock.createId()
      this.repository.insertWorkAssignment({
        id: assignmentId,
        workerId,
        assignedOn,
        processType: 'making',
        scheduleMode: 'making_task',
        status: 'scheduled',
        note: nullableText(input.note),
        createdAt: now,
        updatedAt: now
      })
      const tasks = input.tasks.map((taskInput) =>
        this.createMakingTask(assignmentId, taskInput, now)
      )
      tasks.forEach((task) => this.repository.insertTask(task))
      const assignment = this.repository.getWorkAssignment(assignmentId)!
      this.recordAudit(
        'fulfillment.assignment_created',
        'work_assignment',
        assignmentId,
        undefined,
        assignment,
        now
      )
      return assignment
    })
  }

  private createTimedShift(input: V2TimedWorkAssignmentCreateInput): V2WorkAssignment {
    const workerId = requireText(input.workerId, '兼职人员标识')
    if (!this.repository.workerExists(workerId)) throw new DomainValidationError('兼职人员不存在')
    const assignedOn = requireBusinessDate(input.assignedOn, '安排日期')
    if (!timedProcessTypes.includes(input.processType)) {
      throw new DomainValidationError('计时排班只能选择捏毛装袋、缝边或打包发货工序')
    }
    const raw = input as unknown as Record<string, unknown>
    if (raw.tasks !== undefined) {
      throw new DomainValidationError('计时排班不能携带工序任务')
    }
    for (const field of forbiddenTimedShiftFields) {
      if (raw[field] !== undefined) {
        throw new DomainValidationError('计时排班不能填写数量或预计分钟')
      }
    }

    return this.repository.transaction(() => {
      if (this.repository.findActiveTimedShift(workerId, assignedOn, input.processType)) {
        throw new DomainValidationError('同一人员同一天已有该工序的计时安排，不能重复排班')
      }
      const now = this.clock.now()
      const assignmentId = this.clock.createId()
      this.repository.insertWorkAssignment({
        id: assignmentId,
        workerId,
        assignedOn,
        processType: input.processType,
        scheduleMode: 'timed_shift',
        status: 'scheduled',
        note: nullableText(input.note),
        createdAt: now,
        updatedAt: now
      })
      const assignment = this.repository.getWorkAssignment(assignmentId)!
      this.recordAudit(
        'fulfillment.assignment_created',
        'work_assignment',
        assignmentId,
        undefined,
        assignment,
        now
      )
      return assignment
    })
  }

  getWorkAssignment(id: string): V2WorkAssignment | null {
    return this.repository.getWorkAssignment(requireText(id, '工作安排标识'))
  }

  listWorkAssignments(query?: V2WorkAssignmentQuery): V2WorkAssignment[] {
    if (query?.assignedOn) requireBusinessDate(query.assignedOn, '安排日期')
    return this.repository.listWorkAssignments(query)
  }

  /**
   * 缺勤或缺勤取消公共班次/制作安排：制作释放未核算计划数量，
   * 计时只结束该班次；已有有效核算的安排不得被状态更新静默撤销。
   */
  setWorkAssignmentStatus(
    assignmentId: string,
    input: V2WorkAssignmentStatusUpdateInput
  ): V2WorkAssignment {
    const id = requireText(assignmentId, '工作安排标识')
    if (input.status !== 'absent' && input.status !== 'cancelled') {
      throw new DomainValidationError('只支持把排班标记为缺勤或取消')
    }
    const reason = nullableText(input.reason)

    return this.repository.transaction(() => {
      const assignment = this.repository.getWorkAssignment(id)
      if (!assignment) throw new DomainValidationError('工作安排不存在')
      if (assignment.status !== 'scheduled' && assignment.status !== 'draft') {
        throw new DomainValidationError('只有进行中的排班可以标记缺勤或取消')
      }
      if (assignment.timedReview || assignment.tasks.some((task) => task.reviewSummary)) {
        throw new DomainValidationError(
          '该排班已有有效核算，不能通过状态更新撤销；请先在待核算中作废核算'
        )
      }
      if (assignment.tasks.some((task) => task.status === 'confirmed')) {
        throw new DomainValidationError(
          '该排班已有已确认任务，不能通过状态更新撤销；请先在待核算中处理'
        )
      }

      const now = this.clock.now()
      for (const task of assignment.tasks) {
        if (task.status !== 'pending' && task.status !== 'pending_inspection') continue
        const result = this.repository.getProcessResultForTask(task.id)
        // 历史未质检结果不构成核算事实，随排班一起作废以免残留中间态。
        if (
          result &&
          result.status === 'confirmed' &&
          !this.repository.getQualityInspectionByResult(result.id)
        ) {
          this.repository.voidProcessResult(
            result.id,
            reason ?? '排班缺勤或取消，释放未核算数量',
            now
          )
        }
        this.repository.updateTaskStatus(task.id, 'cancelled', now)
      }
      this.repository.updateWorkAssignmentStatus(id, input.status, now)
      const updated = this.repository.getWorkAssignment(id)!
      this.recordAudit(
        input.status === 'absent'
          ? 'fulfillment.assignment_marked_absent'
          : 'fulfillment.assignment_cancelled',
        'work_assignment',
        id,
        assignment,
        updated,
        now,
        { reason }
      )
      return updated
    })
  }

  reassignProcessTask(
    processTaskId: string,
    input: V2ProcessTaskReassignmentInput
  ): V2WorkAssignment {
    const workerId = requireText(input.workerId, '新负责人')
    const effectiveOn = requireBusinessDate(input.effectiveOn, '生效日期')
    const reason = requireText(input.reason, '调整原因')

    return this.repository.transaction(() => {
      const originalTask = this.requireTask(requireText(processTaskId, '工序任务标识'))
      if (originalTask.processType !== 'making') {
        throw new DomainValidationError('只有制作任务可以调整负责人')
      }
      if (originalTask.status !== 'pending')
        throw new DomainValidationError('只有待处理任务可以调整负责人')
      const originalAssignment = this.repository.getWorkAssignment(originalTask.workAssignmentId)
      if (!originalAssignment) throw new DomainValidationError('原工作安排不存在')
      if (originalAssignment.workerId === workerId)
        throw new DomainValidationError('新负责人不能与原负责人相同')

      const now = this.clock.now()
      const assignmentId = this.clock.createId()
      const taskId = this.clock.createId()
      this.repository.insertWorkAssignment({
        id: assignmentId,
        workerId,
        assignedOn: effectiveOn,
        processType: 'making',
        scheduleMode: 'making_task',
        status: 'scheduled',
        note: reason,
        createdAt: now,
        updatedAt: now
      })
      this.repository.insertTask({
        ...originalTask,
        id: taskId,
        workAssignmentId: assignmentId,
        status: 'pending',
        reviewSummary: null,
        createdAt: now,
        updatedAt: now
      })
      this.repository.updateTaskStatus(originalTask.id, 'cancelled', now)
      this.repository.completeWorkAssignmentWhenResolved(originalTask.workAssignmentId, now)

      const replacement = this.repository.getWorkAssignment(assignmentId)!
      this.recordAudit(
        'fulfillment.task_reassigned',
        'process_task',
        originalTask.id,
        { assignment: originalAssignment, task: originalTask },
        { assignment: replacement, task: replacement.tasks[0] },
        now,
        { reason }
      )
      return replacement
    })
  }

  getProcessResultForTask(processTaskId: string): V2ProcessResult | null {
    const task = this.requireTask(requireText(processTaskId, '工序任务标识'))
    return this.repository.getProcessResultForTask(task.id)
  }

  /**
   * 制作一次核算：一次提交实际产出与合格数量，系统计算不合格与未完成，
   * 在同一事务内保存结果与质量事实、推进履约、冻结工资与材料依据并直接置为已核算。
   */
  reviewMaking(input: V2MakingReviewInput): V2ProcessResult {
    const reviewedOn = requireBusinessDate(input.reviewedOn, '核算日期')
    return this.repository.transaction(() => {
      const task = this.requireTask(input.processTaskId)
      if (task.processType !== 'making') {
        throw new DomainValidationError('制作核算只适用于制作任务')
      }
      if (task.status === 'cancelled') {
        throw new DomainValidationError('已取消任务不能核算')
      }
      if (task.reviewSummary || task.status === 'confirmed') {
        throw new DomainValidationError('该制作任务已完成核算，不能重复核算')
      }
      const plannedQuantity = requirePositiveInteger(task.plannedQuantity, '计划数量')
      const quantities = calculateMakingReviewQuantities({
        plannedQuantity,
        completedQuantity: input.completedQuantity,
        qualifiedQuantity: input.qualifiedQuantity
      })
      const orderItemId = this.requireOrderItemId(task)
      const now = this.clock.now()

      // 合格产出不得超过订单商品当前待制作数量，超出时先调整制作计划。
      if (quantities.qualifiedQuantity > 0) {
        this.assertMakingQuantityAvailable(orderItemId, quantities.qualifiedQuantity)
      }

      // 历史两步流程可能留下未质检结果：不构成核算事实，按版本链让位给一次核算。
      const previous = this.repository.getProcessResultForTask(task.id)
      if (
        previous &&
        previous.status === 'confirmed' &&
        !this.repository.getQualityInspectionByResult(previous.id)
      ) {
        this.repository.voidProcessResult(previous.id, '一次核算取代未质检的历史结果', now)
      }

      const { result, inspection } = this.writeMakingReview({
        task,
        orderItemId,
        quantities,
        reviewedOn,
        note: nullableText(input.note),
        supersedesResultId: null,
        now
      })
      this.recordAudit(
        'fulfillment.making_reviewed',
        'quality_inspection',
        inspection.id,
        undefined,
        { result, inspection },
        now,
        { processTaskId: task.id }
      )
      return result
    })
  }

  /**
   * 制作核算更正：以结果作为版本根原子替换。未锁定时保留旧版本事实（结果、质量、
   * 履约、工资与材料来源）并创建新的有效版本；已进入草稿结算的旧来源被取消并重算。
   */
  correctMakingReview(input: V2MakingReviewCorrectionInput): V2ProcessResult {
    const reason = requireText(input.reason, '更正原因')
    const reviewedOn = requireBusinessDate(input.reviewedOn, '核算日期')
    return this.repository.transaction(() => {
      const { task, result, inspection } = this.requireCurrentMakingReview(input.resultId)
      const lock = makingReviewLockState(this.repository.connection, {
        resultId: result.id,
        inspectionId: inspection.id
      })
      if (lock.locked) throw new DomainValidationError(lock.message!)

      const plannedQuantity = requirePositiveInteger(task.plannedQuantity, '计划数量')
      const quantities = calculateMakingReviewQuantities({
        plannedQuantity,
        completedQuantity: input.completedQuantity,
        qualifiedQuantity: input.qualifiedQuantity
      })
      const orderItemId = this.requireOrderItemId(task)
      const now = this.clock.now()

      this.retractMakingReview({ task, result, inspection, reason, now })
      if (quantities.qualifiedQuantity > 0) {
        this.assertMakingQuantityAvailable(orderItemId, quantities.qualifiedQuantity)
      }

      const { result: next, inspection: nextInspection } = this.writeMakingReview({
        task,
        orderItemId,
        quantities,
        reviewedOn,
        note: nullableText(input.note) ?? inspection.note ?? null,
        supersedesResultId: result.id,
        now
      })
      this.requireSettlementSync().syncDraftAfterReviewChange({
        workerId: this.requireAssignmentWorkerId(task),
        makingInspectionIds: [inspection.id],
        nextMakingInspectionId: nextInspection.id
      })
      this.recordAudit(
        'fulfillment.making_review_corrected',
        'quality_inspection',
        nextInspection.id,
        { result, inspection },
        { result: next, inspection: nextInspection },
        now,
        { processTaskId: task.id, reason }
      )
      return next
    })
  }

  /** 制作核算作废：保留旧版本与原因并回退履约与工资来源，对应安排重新待核算。 */
  voidMakingReview(input: V2MakingReviewVoidInput): V2ProcessResult {
    const reason = requireText(input.reason, '作废原因')
    return this.repository.transaction(() => {
      const { task, result, inspection } = this.requireCurrentMakingReview(input.resultId)
      const lock = makingReviewLockState(this.repository.connection, {
        resultId: result.id,
        inspectionId: inspection.id
      })
      if (lock.locked) throw new DomainValidationError(lock.message!)
      const now = this.clock.now()

      this.retractMakingReview({ task, result, inspection, reason, now })
      this.requireSettlementSync().syncDraftAfterReviewChange({
        workerId: this.requireAssignmentWorkerId(task),
        makingInspectionIds: [inspection.id]
      })
      const voided = this.repository.getProcessResult(result.id)!
      this.recordAudit(
        'fulfillment.making_review_voided',
        'quality_inspection',
        inspection.id,
        { result, inspection },
        voided,
        now,
        { processTaskId: task.id, reason }
      )
      return voided
    })
  }

  private requireCurrentMakingReview(resultId: string): {
    task: V2ProcessTask
    result: V2ProcessResult
    inspection: V2QualityInspection
  } {
    const result = this.requireResult(requireText(resultId, '核算标识'))
    const task = this.requireTask(result.processTaskId)
    if (task.processType !== 'making') {
      throw new DomainValidationError('只有制作核算可以更正或作废')
    }
    const current = this.repository.getProcessResultForTask(task.id)
    if (!current || current.id !== result.id || current.status !== 'confirmed') {
      throw new DomainValidationError('该核算已是历史版本，请刷新后重试')
    }
    const inspection = this.repository.getQualityInspectionByResult(result.id)
    if (!inspection) {
      throw new DomainValidationError('该核算缺少质量事实，不能更正或作废')
    }
    return { task, result, inspection }
  }

  /** 回退旧版本事实：草稿结算来源、履约事件、结果版本与任务/安排状态。 */
  private retractMakingReview(input: {
    task: V2ProcessTask
    result: V2ProcessResult
    inspection: V2QualityInspection
    reason: string
    now: string
  }): void {
    this.repository.deleteFulfillmentEventsForInspection(input.inspection.id)
    this.repository.voidProcessResult(input.result.id, input.reason, input.now)
    this.repository.resetTaskToPending(input.task.id, input.now)
  }

  private requireSettlementSync(): ReviewSettlementSync {
    if (!this.settlementSync) {
      throw new Error('结算来源同步未装配，不能更正或作废核算')
    }
    return this.settlementSync
  }

  private requireAssignmentWorkerId(task: V2ProcessTask): string {
    const workerId = this.repository.getAssignmentWorkerId(task.workAssignmentId)
    if (!workerId) throw new DomainValidationError('工作安排不存在')
    return workerId
  }

  /** 合格数量不得超过订单商品当前待制作数量；超出时先调整制作计划。 */
  private assertMakingQuantityAvailable(orderItemId: string, qualifiedQuantity: number): void {
    const item = this.requireOrderItem(orderItemId)
    const state = this.fulfillmentStateOf(orderItemId, item.quantity)
    if (state.making < qualifiedQuantity) {
      throw new DomainValidationError('合格数量超过订单商品当前待制作数量，请先调整制作计划')
    }
  }

  /** 制作核算的原子写入：结果、质量事实、履约事件与任务状态在同一事务内提交。 */
  private writeMakingReview(input: {
    task: V2ProcessTask
    orderItemId: string
    quantities: MakingReviewQuantities
    reviewedOn: string
    note: string | null
    supersedesResultId: string | null
    now: string
  }): { result: V2ProcessResult; inspection: V2QualityInspection } {
    const { task, quantities, reviewedOn, note, now } = input
    const result: V2ProcessResult = {
      id: this.clock.createId(),
      processTaskId: task.id,
      completedQuantity: quantities.completedQuantity,
      actualMinutes: null,
      submittedOn: reviewedOn,
      status: 'confirmed',
      supersedesResultId: input.supersedesResultId,
      voidReason: null,
      voidedAt: null,
      note,
      createdAt: now
    }
    this.repository.insertProcessResult(result)
    const inspection: V2QualityInspection = {
      id: this.clock.createId(),
      processResultId: result.id,
      processTaskId: task.id,
      qualifiedQuantity: quantities.qualifiedQuantity,
      unqualifiedQuantity: quantities.unqualifiedQuantity,
      inspectedOn: reviewedOn,
      reasonNote: null,
      requiresRework: false,
      note,
      createdAt: now
    }
    this.repository.insertQualityInspection(inspection)
    if (quantities.qualifiedQuantity > 0) {
      const draft: FulfillmentEventDraft =
        task.sourceType === 'after_sales_replacement'
          ? {
              eventType: 'after_sales_replacement',
              quantity: quantities.qualifiedQuantity,
              sourceStage: null,
              targetStage: 'fluffing_bagging'
            }
          : createMakingQualifiedEvent(quantities.qualifiedQuantity)
      const event = this.toPersistedEvent(
        input.orderItemId,
        draft,
        'quality_inspection',
        inspection.id,
        reviewedOn,
        note,
        now
      )
      this.assertEventCanApply(event)
      this.repository.insertFulfillmentEvent(event)
    }
    this.repository.updateTaskStatus(task.id, 'confirmed', now)
    this.repository.completeWorkAssignmentWhenResolved(task.workAssignmentId, now)
    return { result, inspection }
  }

  /** 旧的两步流程入口：仅历史兼容与内部测试使用，新界面与新 IPC 不再暴露。 */
  submitProcessResult(processTaskId: string, input: V2ProcessResultInput): V2ProcessResult {
    validateProcessResult({
      completedQuantity: input.completedQuantity,
      actualMinutes: input.actualMinutes
    })
    const submittedOn = requireBusinessDate(input.submittedOn, '完成提交日期')
    return this.repository.transaction(() => {
      const task = this.requireTask(processTaskId)
      if (task.status !== 'pending')
        throw new DomainValidationError('只有待完成任务可以提交完成结果')
      const result: V2ProcessResult = {
        id: this.clock.createId(),
        processTaskId: task.id,
        completedQuantity: input.completedQuantity,
        actualMinutes: input.actualMinutes ?? null,
        submittedOn,
        status: 'confirmed',
        supersedesResultId: null,
        voidReason: null,
        voidedAt: null,
        note: nullableText(input.note),
        createdAt: this.clock.now()
      }
      this.repository.insertProcessResult(result)
      const now = this.clock.now()
      if (task.processType === 'making') {
        this.repository.updateTaskStatus(task.id, 'pending_inspection', now)
      } else {
        for (const event of this.completionEventsFor(task, result)) {
          this.assertEventCanApply(event)
          this.repository.insertFulfillmentEvent(event)
        }
        this.repository.updateTaskStatus(task.id, 'confirmed', now)
        this.repository.completeWorkAssignmentWhenResolved(task.workAssignmentId, now)
      }
      this.recordAudit(
        'fulfillment.result_submitted',
        'process_result',
        result.id,
        undefined,
        result,
        now,
        { processTaskId: task.id }
      )
      return result
    })
  }

  /** 旧的两步流程入口：仅历史兼容与内部测试使用，新界面与新 IPC 不再暴露。 */
  confirmQualityInspection(
    processResultId: string,
    input: V2QualityInspectionInput
  ): V2QualityInspection {
    const inspectedOn = requireBusinessDate(input.inspectedOn, '质检日期')
    return this.repository.transaction(() => {
      const result = this.requireResult(processResultId)
      const task = this.requireTask(result.processTaskId)
      if (task.processType !== 'making') {
        throw new DomainValidationError('只有制作任务需要质量确认')
      }
      validateQualityInspection({
        completedQuantity: result.completedQuantity,
        qualifiedQuantity: input.qualifiedQuantity,
        unqualifiedQuantity: input.unqualifiedQuantity,
        alreadyInspected: Boolean(this.repository.getQualityInspectionByResult(result.id))
      })
      if (task.status !== 'pending_inspection')
        throw new DomainValidationError('任务当前不处于待质检状态')
      const now = this.clock.now()
      const inspection: V2QualityInspection = {
        id: this.clock.createId(),
        processResultId: result.id,
        processTaskId: task.id,
        qualifiedQuantity: input.qualifiedQuantity,
        unqualifiedQuantity: input.unqualifiedQuantity,
        inspectedOn,
        reasonNote: nullableText(input.reasonNote),
        requiresRework: Boolean(input.requiresRework),
        note: nullableText(input.note),
        createdAt: now
      }
      this.repository.insertQualityInspection(inspection)
      if (inspection.qualifiedQuantity > 0) {
        const orderItemId = this.requireOrderItemId(task)
        const draft: FulfillmentEventDraft =
          task.sourceType === 'after_sales_replacement'
            ? {
                eventType: 'after_sales_replacement',
                quantity: inspection.qualifiedQuantity,
                sourceStage: null,
                targetStage: 'fluffing_bagging'
              }
            : createMakingQualifiedEvent(inspection.qualifiedQuantity)
        const event = this.toPersistedEvent(
          orderItemId,
          draft,
          'quality_inspection',
          inspection.id,
          inspectedOn,
          inspection.note ?? null,
          now
        )
        this.assertEventCanApply(event)
        this.repository.insertFulfillmentEvent(event)
      }
      this.repository.updateTaskStatus(task.id, 'confirmed', now)
      this.repository.completeWorkAssignmentWhenResolved(task.workAssignmentId, now)
      this.recordAudit(
        'fulfillment.inspection_confirmed',
        'quality_inspection',
        inspection.id,
        undefined,
        inspection,
        now,
        { processTaskId: task.id }
      )
      return inspection
    })
  }

  adjustStageQuantity(input: V2FulfillmentAdjustmentInput): V2OrderItemFulfillment {
    const occurredOn = requireBusinessDate(input.occurredOn, '负责人调整日期')
    const note = requireText(input.note, '负责人调整说明')
    if (!input.sourceStage && !input.targetStage)
      throw new DomainValidationError('负责人调整至少指定来源阶段或目标阶段')
    if (input.sourceStage && !fulfillmentStages.includes(input.sourceStage))
      throw new DomainValidationError('来源阶段不合法')
    if (input.targetStage && !fulfillmentStages.includes(input.targetStage))
      throw new DomainValidationError('目标阶段不合法')
    if (input.sourceStage && input.sourceStage === input.targetStage)
      throw new DomainValidationError('负责人调整的来源阶段和目标阶段不能相同')

    return this.repository.transaction(() => {
      this.requireOrderItem(input.orderItemId)
      const now = this.clock.now()
      const event = this.toPersistedEvent(
        input.orderItemId,
        {
          eventType: 'manager_adjustment',
          quantity: input.quantity,
          sourceStage: input.sourceStage ?? null,
          targetStage: input.targetStage ?? null
        },
        'manager_adjustment',
        null,
        occurredOn,
        note,
        now
      )
      this.assertEventCanApply(event)
      this.repository.insertFulfillmentEvent(event)
      const summary = this.getOrderItemFulfillment(input.orderItemId)
      this.recordAudit(
        'fulfillment.manager_adjusted',
        'fulfillment_event',
        event.id,
        undefined,
        event,
        now
      )
      return summary
    })
  }

  getOrderItemFulfillment(orderItemId: string): V2OrderItemFulfillment {
    const item = this.requireOrderItem(orderItemId)
    const events = this.repository.listFulfillmentEvents(item.id)
    const state = events.reduce<FulfillmentState>(
      (current, event) => applyFulfillmentEvent(current, event),
      createFulfillmentState(item.quantity)
    )
    return {
      orderItemId: item.id,
      orderId: item.orderId,
      confirmedQuantity: item.quantity,
      stages: asState(state),
      events
    }
  }

  /** 供计时核算服务在写入履约事件前复用同一套阶段可用性校验。 */
  assertFulfillmentEventCanApply(event: V2FulfillmentEvent): void {
    this.assertEventCanApply(event)
  }

  private createMakingTask(
    assignmentId: string,
    input: V2MakingTaskInput,
    now: string
  ): V2ProcessTask {
    if (!processTaskSources.includes(input.sourceType))
      throw new DomainValidationError('任务来源不合法')
    const orderItemId = input.orderItemId?.trim() ?? ''
    if (!orderItemId) throw new DomainValidationError('工序任务必须关联订单产品')
    const orderItem = this.requireOrderItem(orderItemId)
    const plannedQuantity = requirePositiveInteger(input.plannedQuantity, '计划数量')
    const extraMinutes = requireNonNegativeInteger(input.extraMinutes ?? 0, '额外预留分钟')
    const standardMakingMinutes = orderItem.productSnapshot.standardMakingMinutes
    calculateTaskPlannedMinutes({
      processType: 'making',
      plannedQuantity,
      standardMakingMinutes,
      extraMinutes
    })
    const plannedMinutes = plannedQuantity * standardMakingMinutes
    const pieceRateCents = input.pieceRateCents ?? orderItem.productSnapshot.makingCommissionCents
    requireOptionalNonNegativeCents(pieceRateCents, '计件提成')
    const hasMaterialSnapshot =
      orderItem.productSnapshot.materialPriceMicroYuanPerGram !== undefined

    return {
      id: this.clock.createId(),
      workAssignmentId: assignmentId,
      orderItemId: orderItem.id,
      processType: 'making',
      sourceType: input.sourceType,
      plannedQuantity,
      plannedMinutes,
      extraMinutes,
      scheduledMinutes: plannedMinutes + extraMinutes,
      status: 'pending',
      hourlyWageCents: null,
      pieceRateCents,
      glueCostCents: null,
      materialPriceMicroYuanPerGram: hasMaterialSnapshot
        ? orderItem.productSnapshot.materialPriceMicroYuanPerGram!
        : null,
      glueWeightMilligrams: hasMaterialSnapshot
        ? orderItem.productSnapshot.unitWeightMilligrams
        : null,
      rateSnapshot: null,
      note: nullableText(input.note),
      reviewSummary: null,
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 非制作工序按完成数量直接流转：捏毛装袋按订单剩余缝边需求分流，
   * 缝边完成后进入待打包发货，打包完成后进入已发货前的待发货阶段。
   */
  private completionEventsFor(task: V2ProcessTask, result: V2ProcessResult): V2FulfillmentEvent[] {
    const orderItemId = this.requireOrderItemId(task)
    const item = this.requireOrderItem(orderItemId)
    const state = this.fulfillmentStateOf(orderItemId, item.quantity)
    let drafts: FulfillmentEventDraft[]
    if (task.processType === 'fluffing_bagging') {
      const edgeQuantity = item.edgeEnabled ? item.edgeQuantity : 0
      drafts = createFluffingBaggingCompletedEvents({
        completedQuantity: result.completedQuantity,
        edgeQuantity,
        edgeSewingRouted: state.edgeSewingRouted
      })
    } else if (task.processType === 'edge_sewing') {
      drafts = [createEdgeSewingCompletedEvent(result.completedQuantity)]
    } else {
      drafts = [createPackingCompletedEvent(result.completedQuantity)]
    }
    return drafts.map((draft) =>
      this.toPersistedEvent(
        orderItemId,
        draft,
        'process_result',
        result.id,
        result.submittedOn,
        result.note ?? null,
        this.clock.now()
      )
    )
  }

  private fulfillmentStateOf(orderItemId: string, orderQuantity: number) {
    let state = createFulfillmentState(orderQuantity)
    for (const event of this.repository.listFulfillmentEvents(orderItemId)) {
      state = applyFulfillmentEvent(state, {
        eventType: event.eventType,
        quantity: event.quantity,
        sourceStage: event.sourceStage,
        targetStage: event.targetStage
      })
    }
    return state
  }

  private toPersistedEvent(
    orderItemId: string,
    draft: FulfillmentEventDraft,
    sourceRecordType: string,
    sourceRecordId: string | null,
    occurredOn: string,
    note: string | null,
    createdAt: string
  ): V2FulfillmentEvent {
    return {
      id: this.clock.createId(),
      orderItemId,
      eventType: draft.eventType,
      quantity: draft.quantity,
      sourceStage: draft.sourceStage ?? null,
      targetStage: draft.targetStage ?? null,
      sourceRecordType,
      sourceRecordId,
      /** 无来源记录的事件不参与幂等键（例如负责人调整）。 */
      sourceEventKey:
        sourceRecordId === null
          ? null
          : createFulfillmentEventKey({
              sourceRecordType,
              sourceRecordId,
              eventType: draft.eventType,
              targetStage: draft.targetStage ?? null
            }),
      occurredOn,
      note,
      createdAt
    }
  }

  private assertEventCanApply(event: V2FulfillmentEvent): void {
    const item = this.requireOrderItem(event.orderItemId)
    const events = this.repository.listFulfillmentEvents(item.id)
    const firstFutureEvent = events.findIndex((existing) => existing.occurredOn > event.occurredOn)
    // 同一天的事件按落库先后处理；待写入事件必须排在已存在的同日事件之后，
    // 不能以随机 UUID 作为时间并列时的顺序依据。
    events.splice(firstFutureEvent === -1 ? events.length : firstFutureEvent, 0, event)
    events.reduce<FulfillmentState>(
      (current, currentEvent) => applyFulfillmentEvent(current, currentEvent),
      createFulfillmentState(item.quantity)
    )
  }

  private requireOrderItem(orderItemId: string): V2OrderItemFulfillmentSource {
    const item = this.repository.getOrderItemSource(requireText(orderItemId, '订单产品标识'))
    if (!item) throw new DomainValidationError('订单产品不存在')
    return item
  }

  private requireTask(processTaskId: string): V2ProcessTask {
    const task = this.repository.getTask(requireText(processTaskId, '工序任务标识'))
    if (!task) throw new DomainValidationError('工序任务不存在')
    return task
  }

  private requireResult(processResultId: string): V2ProcessResult {
    const result = this.repository.getProcessResult(requireText(processResultId, '完成申报标识'))
    if (!result) throw new DomainValidationError('完成申报不存在')
    return result
  }

  private requireOrderItemId(task: V2ProcessTask): string {
    if (!task.orderItemId)
      throw new DomainValidationError('该工序任务未关联订单产品，不能推动履约数量')
    return task.orderItemId
  }

  private recordAudit(
    action: string,
    entityType: string,
    entityId: string,
    before: unknown | undefined,
    after: unknown | undefined,
    createdAt: string,
    metadata?: unknown
  ): void {
    this.repository.insertAudit({
      id: this.clock.createId(),
      action,
      entityType,
      entityId,
      before,
      after,
      metadata,
      createdAt
    })
  }
}
