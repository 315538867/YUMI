import { randomUUID } from 'node:crypto'
import type { V2Database } from '@main/database/v2-connection'
import {
  assertReviewCanCorrect,
  assertReviewCanVoid,
  assertReviewTimeRange,
  assertWorkTimeReviewInput,
  requireWorkTimeProcessType
} from '@main/domain/work-time-review'
import {
  createEdgeSewingCompletedEvent,
  createFluffingBaggingCompletedEvents,
  createFulfillmentEventKey,
  createPackingCompletedEvent,
  type FulfillmentEventDraft
} from '@main/domain/fulfillment'
import { DomainValidationError } from '@main/domain/errors'
import { V2FulfillmentRepository } from '@main/repositories/fulfillment-repository'
import { timedReviewLockState } from '@main/repositories/review-lock'
import {
  WorkTimeReviewRepository,
  type ReviewRow,
  type WorkTimeReviewItemWriteInput
} from '@main/repositories/work-time-review-repository'
import { FulfillmentService } from '@main/services/fulfillment-service'
import type { ReviewSettlementSync } from '@main/services/settlement-service'
import type {
  V2FulfillmentEvent,
  V2TimedProcessType,
  V2WorkTimeReview,
  V2WorkTimeReviewCandidate,
  V2WorkTimeReviewCandidateQuery,
  V2WorkTimeReviewCorrectionInput,
  V2WorkTimeReviewInput,
  V2WorkTimeReviewQuery,
  V2WorkTimeReviewVoidInput
} from '@shared/contracts/index'

interface Clock {
  createId(): string
  now(): string
}

const defaultClock: Clock = {
  createId: randomUUID,
  now: () => new Date().toISOString()
}

function requireText(value: string, label: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new DomainValidationError(`${label}不能为空`)
  return normalized
}

function nullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function localBusinessDate(isoDateTime: string): string {
  const date = new Date(isoDateTime)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 候选排序：逾期优先、交期由近到远、订单时间由早到晚，最后稳定按订单与商品。 */
export function sortCandidates(
  candidates: readonly V2WorkTimeReviewCandidate[],
  today: string
): V2WorkTimeReviewCandidate[] {
  const deliveryKey = (candidate: V2WorkTimeReviewCandidate) =>
    candidate.deliveryDate ?? '9999-12-31'
  const overdue = (candidate: V2WorkTimeReviewCandidate) =>
    candidate.deliveryDate !== null && candidate.deliveryDate < today
  return [...candidates].sort((left, right) => {
    if (overdue(left) !== overdue(right)) return overdue(left) ? -1 : 1
    if (deliveryKey(left) !== deliveryKey(right))
      return deliveryKey(left) < deliveryKey(right) ? -1 : 1
    if (left.orderCreatedAt !== right.orderCreatedAt) {
      return left.orderCreatedAt < right.orderCreatedAt ? -1 : 1
    }
    if (left.orderCode !== right.orderCode) return left.orderCode < right.orderCode ? -1 : 1
    return left.orderItemId < right.orderItemId ? -1 : 1
  })
}

/**
 * 计时工序一次核算：单项安排 + 单一连续时间范围 + 跨订单商品明细。
 * 确认时在同一事务内复算可处理量、冻结时薪与商品快照并直接形成履约与工资事实。
 */
export class WorkTimeReviewService {
  private readonly repository: WorkTimeReviewRepository
  private readonly fulfillment: FulfillmentService
  private readonly fulfillmentRepository: V2FulfillmentRepository

  constructor(
    database: V2Database,
    private readonly clock: Clock = defaultClock,
    private readonly settlementSync?: ReviewSettlementSync
  ) {
    this.repository = new WorkTimeReviewRepository(database)
    this.fulfillmentRepository = new V2FulfillmentRepository(database)
    this.fulfillment = new FulfillmentService(this.fulfillmentRepository, clock, settlementSync)
  }

  listReviews(query: V2WorkTimeReviewQuery = {}): V2WorkTimeReview[] {
    return this.repository.listReviews(query).map((row) => this.repository.toReadModel(row))
  }

  getReview(id: string): V2WorkTimeReview | null {
    const row = this.repository.getReview(requireText(id, '工时核算标识'))
    return row ? this.repository.toReadModel(row) : null
  }

  /** 计时候选：验证安排人员、日期、工序与状态后返回当前可处理的订单商品。 */
  listCandidates(
    assignmentId: string,
    query: V2WorkTimeReviewCandidateQuery = {}
  ): V2WorkTimeReviewCandidate[] {
    const assignment = this.requireTimedAssignment(assignmentId)
    const candidates = this.repository.listCandidates(
      requireWorkTimeProcessType(assignment.processType)
    )
    const search = query.search?.trim().toLowerCase() ?? ''
    const filtered = search
      ? candidates.filter(
          (candidate) =>
            candidate.customerName.toLowerCase().includes(search) ||
            candidate.orderCode.toLowerCase().includes(search) ||
            candidate.productName.toLowerCase().includes(search)
        )
      : candidates
    return sortCandidates(filtered, localBusinessDate(this.clock.now()))
  }

  /** 计时一次确认：时间范围、人员时薪与商品快照在同一事务内冻结。 */
  review(input: V2WorkTimeReviewInput): V2WorkTimeReview {
    const assignment = this.requireTimedAssignment(
      requireText(input.workAssignmentId, '工作安排标识')
    )
    assertWorkTimeReviewInput({
      processType: assignment.processType,
      workAssignmentId: assignment.id,
      items: input.items
    })
    const range = assertReviewTimeRange({
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      assignedOn: assignment.assignedOn,
      now: this.clock.now()
    })
    const items = this.normalizeItems(input.items)

    return this.repository.transaction(() => {
      if (this.repository.getCurrentConfirmedReviewForAssignment(assignment.id)) {
        throw new DomainValidationError('该排班已完成核算，不能重复核算')
      }
      const hourlyWageCents = this.repository.wageEffectiveOn(assignment.workerId, range.workedOn)
      if (hourlyWageCents === null) {
        throw new DomainValidationError('缺少工作日期生效的个人时薪，不能确认核算')
      }
      const snapshots = this.resolveItemSnapshots(
        requireWorkTimeProcessType(assignment.processType),
        items
      )
      const now = this.clock.now()
      const reviewId = this.clock.createId()
      this.repository.insertReview({
        id: reviewId,
        workerId: assignment.workerId,
        workedOn: range.workedOn,
        processType: requireWorkTimeProcessType(assignment.processType),
        approvedMinutes: range.minutes,
        hourlyWageCentsSnapshot: hourlyWageCents,
        workAssignmentId: assignment.id,
        rawStartedAt: range.startedAt,
        rawEndedAt: range.endedAt,
        status: 'confirmed',
        supersedesReviewId: null,
        reviewNote: nullableText(input.reviewNote),
        items: snapshots,
        now
      })
      this.applyItemEvents({
        reviewId,
        processType: requireWorkTimeProcessType(assignment.processType),
        reviewedOn: range.workedOn,
        items: snapshots,
        note: nullableText(input.reviewNote),
        now
      })
      this.repository.setAssignmentCompleted(assignment.id, now)
      this.recordAudit({
        action: 'work_time.reviewed',
        reviewId,
        before: undefined,
        after: { workAssignmentId: assignment.id, approvedMinutes: range.minutes },
        now
      })
      return this.requireReview(reviewId)
    })
  }

  /** 更正：保留旧版本并创建新的已核算版本，草稿结算来源同步替换。 */
  correct(input: V2WorkTimeReviewCorrectionInput): V2WorkTimeReview {
    const reason = requireText(input.reason, '更正原因')
    const reviewRow = this.requireReviewRow(input.id)
    assertReviewCanCorrect(reviewRow.status)
    if (!reviewRow.work_assignment_id) {
      throw new DomainValidationError(
        '历史聚合核算不支持直接更正；差异请通过履约调整或后续结算调整处理'
      )
    }
    const assignment = this.requireTimedAssignment(reviewRow.work_assignment_id)
    assertWorkTimeReviewInput({
      processType: assignment.processType,
      workAssignmentId: assignment.id,
      items: input.items
    })
    const range = assertReviewTimeRange({
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      assignedOn: assignment.assignedOn,
      now: this.clock.now()
    })
    const items = this.normalizeItems(input.items)

    return this.repository.transaction(() => {
      this.assertCurrentVersion(reviewRow)
      this.assertNotLocked(reviewRow)
      const hourlyWageCents = this.repository.wageEffectiveOn(assignment.workerId, range.workedOn)
      if (hourlyWageCents === null) {
        throw new DomainValidationError('缺少工作日期生效的个人时薪，不能确认核算')
      }
      const now = this.clock.now()
      // 先回退旧版本占用再复算可处理量；任一步失败整个事务回滚。
      this.retractReview(reviewRow, assignment.id, reason, now)
      const snapshots = this.resolveItemSnapshots(
        requireWorkTimeProcessType(assignment.processType),
        items
      )
      const reviewId = this.clock.createId()
      this.repository.insertReview({
        id: reviewId,
        workerId: assignment.workerId,
        workedOn: range.workedOn,
        processType: requireWorkTimeProcessType(assignment.processType),
        approvedMinutes: range.minutes,
        hourlyWageCentsSnapshot: hourlyWageCents,
        workAssignmentId: assignment.id,
        rawStartedAt: range.startedAt,
        rawEndedAt: range.endedAt,
        status: 'confirmed',
        supersedesReviewId: reviewRow.id,
        reviewNote: nullableText(input.reviewNote) ?? reviewRow.review_note,
        items: snapshots,
        now
      })
      this.applyItemEvents({
        reviewId,
        processType: requireWorkTimeProcessType(assignment.processType),
        reviewedOn: range.workedOn,
        items: snapshots,
        note: nullableText(input.reviewNote) ?? reviewRow.review_note,
        now
      })
      this.repository.setAssignmentCompleted(assignment.id, now)
      this.requireSettlementSync().syncDraftAfterReviewChange({
        workerId: assignment.workerId,
        timedReviewIds: [reviewRow.id],
        nextTimedReviewId: reviewId
      })
      this.recordAudit({
        action: 'work_time.review_corrected',
        reviewId,
        before: { supersededReviewId: reviewRow.id },
        after: { workAssignmentId: assignment.id, approvedMinutes: range.minutes },
        now,
        reason
      })
      return this.requireReview(reviewId)
    })
  }

  /** 作废：保留记录与原因，回退履约与工资来源，对应班次重新待核算。 */
  void(id: string, input: V2WorkTimeReviewVoidInput): V2WorkTimeReview {
    const reason = requireText(input.reason, '作废原因')
    const reviewRow = this.requireReviewRow(requireText(id, '工时核算标识'))
    assertReviewCanVoid(reviewRow.status)
    if (!reviewRow.work_assignment_id) {
      throw new DomainValidationError(
        '历史聚合核算不支持直接作废；差异请通过履约调整或后续结算调整处理'
      )
    }
    const assignment = this.requireTimedAssignment(reviewRow.work_assignment_id)

    return this.repository.transaction(() => {
      this.assertCurrentVersion(reviewRow)
      this.assertNotLocked(reviewRow)
      const now = this.clock.now()
      this.retractReview(reviewRow, assignment.id, reason, now)
      this.requireSettlementSync().syncDraftAfterReviewChange({
        workerId: assignment.workerId,
        timedReviewIds: [reviewRow.id]
      })
      this.recordAudit({
        action: 'work_time.review_voided',
        reviewId: reviewRow.id,
        before: { workAssignmentId: assignment.id, approvedMinutes: reviewRow.approved_minutes },
        after: undefined,
        now,
        reason
      })
      return this.requireReview(reviewRow.id)
    })
  }

  /** 回退一项核算的履约事件、有效状态与安排状态。 */
  private retractReview(
    reviewRow: ReviewRow,
    assignmentId: string,
    reason: string,
    now: string
  ): void {
    const itemIds = this.repository.listItems(reviewRow.id).map((item) => item.id)
    this.repository.deleteFulfillmentEventsForItems(itemIds)
    this.repository.voidReview(reviewRow.id, reason, now)
    this.repository.setAssignmentScheduled(assignmentId, now)
  }

  private assertCurrentVersion(reviewRow: ReviewRow): void {
    const current = this.repository.getCurrentConfirmedReviewForAssignment(
      reviewRow.work_assignment_id!
    )
    if (!current || current.id !== reviewRow.id) {
      throw new DomainValidationError('该核算已是历史版本，请刷新后重试')
    }
  }

  private assertNotLocked(reviewRow: ReviewRow): void {
    const lock = timedReviewLockState(this.repository.connection, reviewRow.id)
    if (lock.locked) throw new DomainValidationError(lock.message!)
  }

  private normalizeItems(
    items: readonly { orderItemId: string; completedQuantity: number }[]
  ): Array<{ orderItemId: string; completedQuantity: number }> {
    return items.map((item) => ({
      orderItemId: item.orderItemId.trim(),
      completedQuantity: item.completedQuantity
    }))
  }

  /** 事务内复算可处理量，逐项校验数量并冻结提成与预计分钟快照。 */
  private resolveItemSnapshots(
    processType: V2TimedProcessType,
    items: readonly { orderItemId: string; completedQuantity: number }[]
  ): WorkTimeReviewItemWriteInput[] {
    const candidates = new Map(
      this.repository
        .listCandidates(processType)
        .map((candidate) => [candidate.orderItemId, candidate])
    )
    return items.map((item) => {
      const candidate = candidates.get(item.orderItemId)
      if (!candidate) {
        throw new DomainValidationError('存在当前工序不可处理的订单商品，请刷新候选后重试')
      }
      if (item.completedQuantity > candidate.processableQuantity) {
        throw new DomainValidationError(
          `完成数量超过当前可处理数量（最多 ${candidate.processableQuantity} 件），请刷新候选后重试`
        )
      }
      return {
        id: this.clock.createId(),
        orderItemId: item.orderItemId,
        completedQuantity: item.completedQuantity,
        pieceRateCentsSnapshot: candidate.pieceRateCents,
        expectedUnitMinutesSnapshot: candidate.expectedUnitMinutes
      }
    })
  }

  /** 每个明细按当前工序直接生成履约事件；捏毛装袋按剩余缝边需求分流。 */
  private applyItemEvents(input: {
    reviewId: string
    processType: V2TimedProcessType
    reviewedOn: string
    items: readonly WorkTimeReviewItemWriteInput[]
    note: string | null
    now: string
  }): void {
    for (const item of input.items) {
      for (const event of this.buildItemEvents({
        processType: input.processType,
        item,
        reviewedOn: input.reviewedOn,
        note: input.note,
        now: input.now
      })) {
        this.fulfillment.assertFulfillmentEventCanApply(event)
        this.fulfillmentRepository.insertFulfillmentEvent(event)
      }
    }
  }

  private buildItemEvents(input: {
    processType: V2TimedProcessType
    item: WorkTimeReviewItemWriteInput
    reviewedOn: string
    note: string | null
    now: string
  }): V2FulfillmentEvent[] {
    let drafts: FulfillmentEventDraft[]
    if (input.processType === 'fluffing_bagging') {
      const edge = this.repository.getOrderItemEdgeInfo(input.item.orderItemId)
      if (!edge) throw new DomainValidationError('订单产品不存在')
      const state = this.fulfillment.getOrderItemFulfillment(input.item.orderItemId).stages
      drafts = createFluffingBaggingCompletedEvents({
        completedQuantity: input.item.completedQuantity,
        edgeQuantity: edge.edgeEnabled ? edge.edgeQuantity : 0,
        edgeSewingRouted: state.edgeSewingRouted
      })
    } else if (input.processType === 'edge_sewing') {
      drafts = [createEdgeSewingCompletedEvent(input.item.completedQuantity)]
    } else {
      drafts = [createPackingCompletedEvent(input.item.completedQuantity)]
    }
    return drafts.map((draft) => ({
      id: this.clock.createId(),
      orderItemId: input.item.orderItemId,
      eventType: draft.eventType,
      quantity: draft.quantity,
      sourceStage: draft.sourceStage ?? null,
      targetStage: draft.targetStage ?? null,
      sourceRecordType: 'work_time_review_item',
      sourceRecordId: input.item.id,
      sourceEventKey: createFulfillmentEventKey({
        sourceRecordType: 'work_time_review_item',
        sourceRecordId: input.item.id,
        eventType: draft.eventType,
        targetStage: draft.targetStage ?? null
      }),
      occurredOn: input.reviewedOn,
      note: input.note,
      createdAt: input.now
    }))
  }

  private requireTimedAssignment(assignmentId: string) {
    const assignment = this.repository.getAssignment(requireText(assignmentId, '工作安排标识'))
    if (!assignment) throw new DomainValidationError('工作安排不存在')
    if (assignment.status === 'cancelled' || assignment.status === 'absent') {
      throw new DomainValidationError('该排班已取消或缺勤，不能核算')
    }
    if (!['fluffing_bagging', 'edge_sewing', 'packing'].includes(assignment.processType)) {
      throw new DomainValidationError('制作排班在制作任务上核算，不能创建计时核算')
    }
    return assignment
  }

  private requireReviewRow(id: string): ReviewRow {
    const row = this.repository.getReview(requireText(id, '工时核算标识'))
    if (!row) throw new DomainValidationError('工时核算不存在')
    return row
  }

  private requireReview(id: string): V2WorkTimeReview {
    return this.repository.toReadModel(this.requireReviewRow(id))
  }

  private requireSettlementSync(): ReviewSettlementSync {
    if (!this.settlementSync) {
      throw new Error('结算来源同步未装配，不能更正或作废核算')
    }
    return this.settlementSync
  }

  private recordAudit(input: {
    action: string
    reviewId: string
    before: unknown
    after: unknown
    now: string
    reason?: string
  }): void {
    this.repository.connection
      .prepare(
        `INSERT INTO audit_logs (id, action, entity_type, entity_id, before_json, after_json, metadata_json, created_at)
         VALUES (?, ?, 'work_time_review', ?, ?, ?, ?, ?)`
      )
      .run(
        this.clock.createId(),
        input.action,
        input.reviewId,
        input.before === undefined ? null : JSON.stringify(input.before),
        input.after === undefined ? null : JSON.stringify(input.after),
        input.reason === undefined ? null : JSON.stringify({ reason: input.reason }),
        input.now
      )
  }
}
