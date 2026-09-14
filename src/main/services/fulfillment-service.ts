import { randomUUID } from 'node:crypto'
import {
  applyFulfillmentEvent,
  calculateTaskPlannedMinutes,
  createEdgeSewingCompletedEvent,
  createFluffingBaggingCompletedEvents,
  createFulfillmentState,
  createMakingQualifiedEvent,
  createPackingCompletedEvent,
  fulfillmentStages,
  processTaskSources,
  processTypes,
  validateProcessResult,
  validateQualityInspection,
  type FulfillmentEventDraft,
  type FulfillmentState
} from '@main/domain/fulfillment'
import { DomainValidationError } from '@main/domain/errors'
import {
  V2FulfillmentRepository,
  type V2OrderItemFulfillmentSource
} from '@main/repositories/fulfillment-repository'
import type {
  V2FulfillmentAdjustmentInput,
  V2FulfillmentEvent,
  V2OrderItemFulfillment,
  V2ProcessResult,
  V2ProcessResultInput,
  V2ProcessTask,
  V2ProcessTaskInput,
  V2ProcessTaskReassignmentInput,
  V2QualityInspection,
  V2QualityInspectionInput,
  V2WorkAssignment,
  V2WorkAssignmentCreateInput,
  V2WorkAssignmentQuery
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

function nullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function requireText(value: string, label: string): string {
  const normalized = value.trim()
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
    private readonly clock: V2Clock = defaultClock
  ) {}

  createWorkAssignment(input: V2WorkAssignmentCreateInput): V2WorkAssignment {
    const workerId = requireText(input.workerId, '兼职人员标识')
    if (!this.repository.workerExists(workerId)) throw new DomainValidationError('兼职人员不存在')
    const assignedOn = requireBusinessDate(input.assignedOn, '安排日期')
    if (!processTypes.includes(input.processType)) throw new DomainValidationError('工序类型不合法')
    if (!Array.isArray(input.tasks) || input.tasks.length === 0)
      throw new DomainValidationError('工作安排至少需要一条任务')

    return this.repository.transaction(() => {
      const now = this.clock.now()
      const assignmentId = this.clock.createId()
      this.repository.insertWorkAssignment({
        id: assignmentId,
        workerId,
        assignedOn,
        processType: input.processType,
        status: 'scheduled',
        note: nullableText(input.note),
        createdAt: now,
        updatedAt: now
      })
      const tasks = input.tasks.map((taskInput) =>
        this.createTask(assignmentId, input.processType, taskInput, now)
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

  getWorkAssignment(id: string): V2WorkAssignment | null {
    return this.repository.getWorkAssignment(requireText(id, '工作安排标识'))
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
        processType: originalTask.processType,
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

  listWorkAssignments(query?: V2WorkAssignmentQuery): V2WorkAssignment[] {
    if (query?.assignedOn) requireBusinessDate(query.assignedOn, '安排日期')
    return this.repository.listWorkAssignments(query)
  }

  getProcessResultForTask(processTaskId: string): V2ProcessResult | null {
    const task = this.requireTask(requireText(processTaskId, '工序任务标识'))
    return this.repository.getProcessResultForTask(task.id)
  }

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
          inspection.note,
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

  private createTask(
    assignmentId: string,
    processType: V2WorkAssignmentCreateInput['processType'],
    input: V2ProcessTaskInput,
    now: string
  ): V2ProcessTask {
    if (!processTaskSources.includes(input.sourceType))
      throw new DomainValidationError('任务来源不合法')
    const orderItem = input.orderItemId ? this.requireOrderItem(input.orderItemId) : null
    if (!orderItem) throw new DomainValidationError('该工序任务必须关联订单产品')
    if (input.sourceType === 'after_sales_replacement' && processType !== 'making') {
      throw new DomainValidationError('售后补发任务必须从制作工序开始')
    }
    if (processType === 'edge_sewing') {
      this.assertEdgeSewingDemand(orderItem.id)
    }

    const extraMinutes = input.extraMinutes ?? 0
    let plannedMinutes: number
    if (processType === 'making') {
      const quantity = input.plannedQuantity ?? null
      const standardMakingMinutes = orderItem!.productSnapshot.standardMakingMinutes
      calculateTaskPlannedMinutes({
        processType,
        plannedQuantity: quantity,
        standardMakingMinutes,
        extraMinutes
      })
      plannedMinutes = quantity! * standardMakingMinutes
    } else {
      plannedMinutes = input.plannedMinutes ?? 0
      calculateTaskPlannedMinutes({
        processType,
        plannedQuantity: input.plannedQuantity,
        plannedMinutes,
        extraMinutes
      })
    }

    const hourlyWageCents = requireOptionalNonNegativeCents(input.hourlyWageCents, '时薪')
    const productSnapshot = processType === 'making' ? orderItem!.productSnapshot : null
    const snapshotPieceRateCents =
      processType === 'making'
        ? orderItem!.productSnapshot.makingCommissionCents
        : processType === 'fluffing_bagging'
          ? (orderItem!.productSnapshot.fluffingBaggingCommissionCents ?? 0)
          : processType === 'edge_sewing'
            ? (orderItem!.productSnapshot.edgeSewingCommissionCents ?? 0)
            : null
    const pieceRateCents =
      snapshotPieceRateCents === null
        ? requireOptionalNonNegativeCents(input.pieceRateCents, '计件提成')
        : (input.pieceRateCents ?? snapshotPieceRateCents)
    const hasMaterialSnapshot =
      productSnapshot !== null && productSnapshot.materialPriceMicroYuanPerGram !== undefined
    const materialPriceMicroYuanPerGram = hasMaterialSnapshot
      ? productSnapshot!.materialPriceMicroYuanPerGram
      : null
    const glueWeightMilligrams = hasMaterialSnapshot ? productSnapshot!.unitWeightMilligrams : null
    const glueCostCents =
      processType === 'making'
        ? null
        : requireOptionalNonNegativeCents(input.glueCostCents, '材料成本')
    requireOptionalNonNegativeCents(pieceRateCents, '计件提成')
    requireOptionalNonNegativeCents(glueCostCents, '材料成本')

    return {
      id: this.clock.createId(),
      workAssignmentId: assignmentId,
      orderItemId: orderItem?.id ?? null,
      processType,
      sourceType: input.sourceType,
      plannedQuantity: input.plannedQuantity ?? null,
      plannedMinutes,
      extraMinutes,
      scheduledMinutes: plannedMinutes + extraMinutes,
      status: 'pending',
      hourlyWageCents,
      pieceRateCents,
      glueCostCents,
      materialPriceMicroYuanPerGram,
      glueWeightMilligrams,
      rateSnapshot:
        input.rateSnapshot ??
        (processType === 'fluffing_bagging'
          ? { fluffingBaggingCommissionCents: snapshotPieceRateCents! }
          : null),
      note: nullableText(input.note),
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
        result.note,
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

  /** 只有订单商品选择了缝边且仍有未完成、未派工的缝边需求时才能安排缝边任务。 */
  private assertEdgeSewingDemand(orderItemId: string): void {
    const item = this.requireOrderItem(orderItemId)
    if (!item.edgeEnabled || item.edgeQuantity <= 0) {
      throw new DomainValidationError('该订单商品未选择缝边，不能安排缝边任务')
    }
    const state = this.fulfillmentStateOf(orderItemId, item.quantity)
    const completedSewing = state.edgeSewingRouted - state.edgeSewing
    const assignedPending = this.repository
      .listTasksByOrderItem(orderItemId)
      .filter((task) => task.processType === 'edge_sewing' && task.status === 'pending')
      .reduce((total, task) => total + (task.plannedQuantity ?? 0), 0)
    if (item.edgeQuantity - completedSewing - assignedPending <= 0) {
      throw new DomainValidationError('该订单商品已无剩余缝边需求，不能安排缝边任务')
    }
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
