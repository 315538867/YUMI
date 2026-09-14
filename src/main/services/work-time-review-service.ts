import { randomUUID } from 'node:crypto'
import type { V2Database } from '@main/database/v2-connection'
import { DomainValidationError } from '@main/domain/errors'
import {
  assertReviewCanConfirm,
  assertReviewCanVoid,
  assertReviewIsDraft,
  assertWorkTimeReviewInput,
  requireWorkTimeProcessType
} from '@main/domain/work-time-review'
import { V2FulfillmentRepository } from '@main/repositories/fulfillment-repository'
import { FulfillmentService } from '@main/services/fulfillment-service'
import {
  WorkTimeReviewRepository,
  type WorkTimeReviewWriteInput
} from '@main/repositories/work-time-review-repository'
import type {
  V2WorkTimeReview,
  V2WorkTimeReviewInput,
  V2WorkTimeReviewQuery,
  V2WorkTimeReviewUpdateInput,
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 负责人次日工时核算：一条记录只属于一道计时工序，可关联多个同工序工作安排与商品完成明细。
 * 确认时在同一天事务中冻结个人时薪并提交完成结果；作废受下游履约与已确认结算约束。
 */
export class WorkTimeReviewService {
  private readonly repository: WorkTimeReviewRepository
  private readonly fulfillment: FulfillmentService

  constructor(
    database: V2Database,
    private readonly clock: Clock = defaultClock
  ) {
    this.repository = new WorkTimeReviewRepository(database)
    this.fulfillment = new FulfillmentService(new V2FulfillmentRepository(database), clock)
  }

  listReviews(query: V2WorkTimeReviewQuery = {}): V2WorkTimeReview[] {
    return this.repository.listReviews(query)
  }

  getReview(id: string): V2WorkTimeReview | null {
    return this.repository.getReview(id)
  }

  createDraft(input: V2WorkTimeReviewInput): V2WorkTimeReview {
    const normalized = this.normalizeInput(input)
    return this.repository.transaction(() => {
      this.assertAssignmentsUsable(normalized, null)
      const now = this.clock.now()
      const write: WorkTimeReviewWriteInput = {
        id: this.clock.createId(),
        ...normalized,
        hourlyWageCentsSnapshot: null,
        sourceType: 'manual_review',
        externalRecordId: null,
        rawStartedAt: null,
        rawEndedAt: null,
        status: 'draft',
        now
      }
      this.repository.insertReview(write)
      return this.requireReview(write.id)
    })
  }

  updateDraft(input: V2WorkTimeReviewUpdateInput): V2WorkTimeReview {
    const normalized = this.normalizeInput(input)
    const review = this.requireReview(input.id)
    assertReviewIsDraft(review.status)
    return this.repository.transaction(() => {
      this.assertAssignmentsUsable(normalized, review.id)
      const now = this.clock.now()
      this.repository.updateReview({
        id: review.id,
        ...normalized,
        hourlyWageCentsSnapshot: null,
        sourceType: 'manual_review',
        externalRecordId: null,
        rawStartedAt: null,
        rawEndedAt: null,
        status: 'draft',
        now
      })
      return this.requireReview(review.id)
    })
  }

  /** 确认即冻结个人时薪并提交商品完成结果；重复确认返回原结果且不重复写入。 */
  confirm(id: string): V2WorkTimeReview {
    const review = this.requireReview(id)
    if (review.status === 'confirmed') return review
    assertReviewCanConfirm(review.status)
    const hourlyWageCents = this.repository.wageEffectiveOn(review.workerId, review.workedOn)
    if (hourlyWageCents === null) {
      throw new DomainValidationError('缺少工作日期生效的个人时薪，不能确认工时核算')
    }
    return this.repository.transaction(() => {
      for (const item of review.items) {
        this.fulfillment.submitProcessResult(item.processTaskId, {
          completedQuantity: item.completedQuantity,
          submittedOn: review.workedOn
        })
      }
      this.repository.confirmReview(review.id, hourlyWageCents, this.clock.now())
      return this.requireReview(review.id)
    })
  }

  /** 已被下游消耗或进入确认结算的工时不得直接作废；否则原子作废并回退完成结果。 */
  void(id: string, input: V2WorkTimeReviewVoidInput): V2WorkTimeReview {
    const review = this.requireReview(id)
    assertReviewCanVoid(review.status)
    const reason = input.reason.trim()
    if (!reason) throw new DomainValidationError('作废原因不能为空')
    return this.repository.transaction(() => {
      this.assertResultsNotConsumed(review)
      const now = this.clock.now()
      for (const item of review.items) {
        const resultIds = this.repository.listResultIdsForTask(item.processTaskId)
        this.repository.deleteFulfillmentEventsForResults(resultIds)
        this.repository.deleteResultsForTask(item.processTaskId)
        this.repository.resetTaskToPending(item.processTaskId, now)
      }
      this.repository.setVoided(review.id, reason, now)
      return this.requireReview(review.id)
    })
  }

  private assertResultsNotConsumed(review: V2WorkTimeReview): void {
    if (this.repository.isReviewInConfirmedSettlement(review.id)) {
      throw new DomainValidationError(
        '该工时已进入已确认结算，不能直接作废；请在后续结算中建立来源关联调整'
      )
    }
    for (const item of review.items) {
      if (!item.orderItemId) continue
      const resultIds = this.repository.listResultIdsForTask(item.processTaskId)
      if (!resultIds.length) continue
      const fulfillment = this.fulfillment.getOrderItemFulfillment(item.orderItemId)
      const produced = this.repository.sumProducedByTargetStage(resultIds)
      for (const [targetStage, quantity] of produced) {
        const balance = fulfillment.stages[targetStage as keyof typeof fulfillment.stages] ?? 0
        if (balance < quantity) {
          throw new DomainValidationError(
            '关联完成结果已被下游工序或发货消耗，不能直接作废；请先处理下游履约'
          )
        }
      }
    }
  }

  private normalizeInput(input: V2WorkTimeReviewInput): {
    workerId: string
    workedOn: string
    processType: V2WorkTimeReview['processType']
    approvedMinutes: number
    assignmentIds: string[]
    items: WorkTimeReviewWriteInput['items']
    reviewNote: string | null
  } {
    const processType = requireWorkTimeProcessType(input.processType)
    assertWorkTimeReviewInput({
      processType,
      approvedMinutes: input.approvedMinutes,
      assignmentIds: input.assignmentIds,
      items: input.items
    })
    if (!ISO_DATE.test(input.workedOn))
      throw new DomainValidationError('工作日期格式必须为 YYYY-MM-DD')
    if (!this.repository.workerExists(input.workerId)) {
      throw new DomainValidationError('兼职人员不存在')
    }
    return {
      workerId: input.workerId,
      workedOn: input.workedOn,
      processType,
      approvedMinutes: input.approvedMinutes,
      assignmentIds: [...input.assignmentIds],
      items: input.items.map((item) => ({
        id: this.clock.createId(),
        processTaskId: item.processTaskId,
        orderItemId: this.repository.getTask(item.processTaskId)?.orderItemId ?? null,
        completedQuantity: item.completedQuantity
      })),
      reviewNote: input.reviewNote?.trim() ? input.reviewNote.trim() : null
    }
  }

  private assertAssignmentsUsable(
    input: {
      workerId: string
      workedOn: string
      processType: string
      assignmentIds: string[]
      items: Array<{ processTaskId: string }>
    },
    excludeReviewId: string | null
  ): void {
    const assignmentTaskIds = new Set<string>()
    for (const assignmentId of input.assignmentIds) {
      const assignment = this.repository.getAssignment(assignmentId)
      if (!assignment) throw new DomainValidationError('工作安排不存在')
      if (assignment.workerId !== input.workerId) {
        throw new DomainValidationError('工作安排与工时核算的兼职人员不一致')
      }
      if (assignment.assignedOn !== input.workedOn) {
        throw new DomainValidationError('工作安排日期与工时核算工作日期不一致')
      }
      if (assignment.processType !== input.processType) {
        throw new DomainValidationError('一条工时核算只能关联同一道工序的工作安排')
      }
      const activeReviewId = this.repository.findActiveReviewByAssignment(
        assignmentId,
        excludeReviewId ?? undefined
      )
      if (activeReviewId) {
        throw new DomainValidationError('该工作安排已存在未作废的工时核算')
      }
      for (const task of this.repository.listAssignmentTasks(assignmentId)) {
        assignmentTaskIds.add(task.id)
      }
    }
    for (const item of input.items) {
      if (!assignmentTaskIds.has(item.processTaskId)) {
        throw new DomainValidationError('完成明细必须来自所关联工作安排的工序任务')
      }
    }
  }

  private requireReview(id: string): V2WorkTimeReview {
    const review = this.repository.getReview(id)
    if (!review) throw new DomainValidationError('工时核算不存在')
    return review
  }
}
