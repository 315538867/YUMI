/**
 * 运营域夹具工厂：人员、时薪、结算、退款、排班、计时核算、工作台（任务 1.6）。
 */
import type {
  V2MakingReviewSummary,
  V2ProcessTask,
  V2ProcessType,
  V2WorkAssignment,
  V2WorkbenchItem,
  V2WorkbenchSnapshot,
  V2Worker,
  V2WorkerRefundRecord,
  V2WorkerSettlement,
  V2WorkerWageHistory,
  V2WorkTimeReview
} from '@shared/contracts/index'
import { EXTREME_AMOUNTS, EXTREME_QUANTITIES, LONG_TEXT } from './edge-values'
import { atFixedHour, shiftDate, FIXED_WEEK_START, FIXED_TODAY } from './determinism'
import type { FactoryContext } from './context'

const WORKER_SURNAMES = ['李', '王', '张', '刘', '陈'] as const
const WORKER_GIVEN_NAMES = ['秀英', '桂芳', '建国', '小梅', '玉兰'] as const
const TIMED_PROCESS_TYPES: readonly V2ProcessType[] = ['fluffing_bagging', 'edge_sewing', 'packing']
const SETTLEMENT_STATUSES = ['draft', 'confirmed', 'adjusted'] as const
const ASSIGNMENT_STATUSES = ['scheduled', 'scheduled', 'completed', 'absent', 'cancelled'] as const
const REVIEW_STATUSES = ['confirmed', 'confirmed', 'draft', 'voided'] as const
const WORKBENCH_KINDS = [
  'work_time_review',
  'quality_inspection',
  'settlement_confirmation',
  'refund',
  'after_sales_handling',
  'process_task',
  'shipment',
  'reimbursement'
] as const

export const buildWorkerFixtures = (context: FactoryContext, total: number): V2Worker[] =>
  Array.from({ length: total }, (_, index) => {
    const { random, nextId, today } = context
    const createdAt = atFixedHour(shiftDate(today, -(index + 30)), 9)
    return {
      id: nextId('worker'),
      name: `${random.pick(WORKER_SURNAMES)}${random.pick(WORKER_GIVEN_NAMES)}`,
      enabled: index % 6 !== 5,
      note: random.chance(0.4) ? LONG_TEXT.workerNote : null,
      createdAt,
      updatedAt: createdAt
    }
  })

export const buildWageHistoryFixtures = (
  context: FactoryContext,
  total: number,
  workers: V2Worker[]
): V2WorkerWageHistory[] =>
  Array.from({ length: total }, (_, index) => {
    const { nextId, today } = context
    const worker = workers[index % workers.length]
    const effectiveOn = shiftDate(today, -(index * 20 + 10))
    return {
      id: nextId('wage'),
      workerId: worker?.id ?? 'worker-missing',
      effectiveOn,
      hourlyWageCents: 2400 + index * 50,
      createdAt: atFixedHour(effectiveOn, 9)
    }
  })

/** 索引 0 刻意用极大金额，索引 3 留成草稿（最终实发为空）。 */
export const buildSettlementFixtures = (
  context: FactoryContext,
  total: number,
  workers: V2Worker[]
): V2WorkerSettlement[] =>
  Array.from({ length: total }, (_, index) => {
    const { nextId, today } = context
    const worker = workers[index % workers.length]
    const status = SETTLEMENT_STATUSES[index % SETTLEMENT_STATUSES.length] ?? 'draft'
    const periodEndOn = shiftDate(today, -(index + 1))
    const periodStartOn = shiftDate(periodEndOn, -6)
    const timedWageCents = index === 0 ? EXTREME_AMOUNTS.huge : 12000 + index * 800
    const commissionCents = 4000 + index * 300
    const otherAdjustmentCents = index % 4 === 0 ? -1500 : 0
    const candidateWageCents = timedWageCents + commissionCents
    const createdAt = atFixedHour(periodEndOn, 20)
    return {
      id: nextId('settlement'),
      workerId: worker?.id ?? 'worker-missing',
      periodStartOn,
      periodEndOn,
      status,
      timedWageCents,
      commissionCents,
      materialDeductionCents: 0,
      adjustmentCents: otherAdjustmentCents,
      otherAdjustmentCents,
      candidateWageCents,
      currentDeductionCents: 0,
      carriedDeductionCents: 0,
      actualDeductionCents: 0,
      continuingCarryoverCents: 0,
      finalPaidAmountCents: status === 'draft' ? null : candidateWageCents + otherAdjustmentCents,
      paidOn: status === 'draft' ? null : periodEndOn,
      managerNote: index % 2 === 0 ? LONG_TEXT.managerNote : null,
      financialEntryId: status === 'draft' ? null : nextId('finance-entry'),
      createdAt,
      updatedAt: createdAt
    }
  })

/** 偶数索引待退款、奇数索引已退款；索引 0 用宽金额验证列宽。 */
export const buildRefundFixtures = (
  context: FactoryContext,
  total: number,
  workers: V2Worker[],
  settlements: V2WorkerSettlement[]
): V2WorkerRefundRecord[] =>
  Array.from({ length: total }, (_, index) => {
    const { nextId, today } = context
    const worker = workers[index % workers.length]
    const settlement = settlements[index % settlements.length]
    const refunded = index % 2 === 1
    const materialRefundCents = index === 0 ? EXTREME_AMOUNTS.wide : 800 + index * 120
    const refundedOn = shiftDate(today, -(index + 1))
    const createdAt = atFixedHour(refundedOn, 16)
    return {
      id: nextId('refund'),
      workerId: worker?.id ?? 'worker-missing',
      originalSettlementId: settlement?.id ?? 'settlement-missing',
      processTaskId: nextId('process-task'),
      processResultId: nextId('process-result'),
      qualityInspectionId: nextId('inspection'),
      orderId: null,
      orderItemId: null,
      unqualifiedQuantity: index + 1,
      materialRefundCents,
      actualRefundCents: refunded ? materialRefundCents : null,
      refundedOn: refunded ? refundedOn : null,
      managerNote: refunded ? LONG_TEXT.managerNote : null,
      status: refunded ? 'refunded' : 'pending',
      createdAt,
      updatedAt: createdAt
    }
  })

const makeMakingReview = (
  context: FactoryContext,
  plannedQuantity: number,
  reviewedOn: string,
  locked: boolean
): V2MakingReviewSummary => {
  const completedQuantity = Math.max(1, plannedQuantity - 1)
  const qualifiedQuantity = Math.max(1, completedQuantity - 1)
  return {
    resultId: context.nextId('process-result'),
    completedQuantity,
    qualifiedQuantity,
    unqualifiedQuantity: completedQuantity - qualifiedQuantity,
    unfinishedQuantity: plannedQuantity - completedQuantity,
    reviewedOn,
    note: null,
    supersedesResultId: null,
    lock: {
      locked,
      reason: locked ? 'settlement_confirmed' : null,
      message: locked ? '本期结算已确认，如需调整请走后续结算调整。' : null
    },
    createdAt: atFixedHour(reviewedOn, 19)
  }
}

const makeProcessTask = (
  context: FactoryContext,
  assignmentId: string,
  orderItemId: string,
  index: number,
  reviewedOn: string | null,
  locked: boolean
): V2ProcessTask => {
  const { nextId, today } = context
  const plannedQuantity = 2 + index
  const plannedMinutes = 30 + index * 5
  const extraMinutes = index % 3 === 0 ? 15 : 0
  return {
    id: nextId('process-task'),
    workAssignmentId: assignmentId,
    orderItemId,
    processType: 'making',
    sourceType: index % 5 === 4 ? 'rework' : 'normal_production',
    plannedQuantity,
    plannedMinutes,
    extraMinutes,
    scheduledMinutes: plannedMinutes + extraMinutes,
    status: reviewedOn ? 'confirmed' : index % 4 === 3 ? 'pending_inspection' : 'pending',
    hourlyWageCents: 3000,
    pieceRateCents: 500,
    glueCostCents: 120,
    materialPriceMicroYuanPerGram: context.settings.materialPriceMicroYuanPerGram,
    glueWeightMilligrams: 3200,
    rateSnapshot: null,
    note: index % 4 === 0 ? LONG_TEXT.taskNote : null,
    reviewSummary: reviewedOn
      ? makeMakingReview(context, plannedQuantity, reviewedOn, locked)
      : null,
    createdAt: atFixedHour(shiftDate(today, -3), 12),
    updatedAt: atFixedHour(shiftDate(today, -3), 12)
  }
}

const makeWorkAssignment = (
  context: FactoryContext,
  worker: V2Worker,
  assignedOn: string,
  index: number
): V2WorkAssignment => {
  const { nextId, random, today } = context
  const isTimed = index % 3 !== 1
  const status = ASSIGNMENT_STATUSES[index % ASSIGNMENT_STATUSES.length] ?? 'scheduled'
  const reviewed = status === 'completed' && !isTimed
  const locked = reviewed && index % 4 === 0
  const assignmentId = nextId('assignment')
  return {
    id: assignmentId,
    workerId: worker.id,
    assignedOn,
    processType: isTimed ? random.pick(TIMED_PROCESS_TYPES) : 'making',
    scheduleMode: isTimed ? 'timed_shift' : 'making_task',
    status,
    note: random.chance(0.3) ? LONG_TEXT.taskNote : null,
    tasks: isTimed
      ? []
      : [
          makeProcessTask(
            context,
            assignmentId,
            nextId('order-item'),
            index,
            reviewed ? assignedOn : null,
            locked
          )
        ],
    timedReview:
      isTimed && reviewed
        ? {
            reviewId: nextId('work-time-review'),
            approvedMinutes: 120 + index * 5,
            reviewedOn: assignedOn,
            lock: {
              locked,
              reason: locked ? 'downstream_consumed' : null,
              message: locked ? '下游已消耗，需先回退下游记录。' : null
            }
          }
        : null,
    createdAt: atFixedHour(shiftDate(today, -2), 10),
    updatedAt: atFixedHour(shiftDate(today, -2), 10)
  }
}

/** 覆盖固定那一周的周一到周日，并按人员轮转，供周历渲染。 */
export const buildWorkAssignmentFixtures = (
  context: FactoryContext,
  total: number,
  workers: V2Worker[]
): V2WorkAssignment[] =>
  Array.from({ length: total }, (_, index) => {
    const worker = workers[index % workers.length] as V2Worker
    return makeWorkAssignment(context, worker, shiftDate(FIXED_WEEK_START, index % 7), index)
  })

export const buildWorkTimeReviewFixtures = (
  context: FactoryContext,
  total: number,
  workers: V2Worker[],
  assignments: V2WorkAssignment[]
): V2WorkTimeReview[] =>
  Array.from({ length: total }, (_, index) => {
    const { nextId, random, today } = context
    const worker = workers[index % workers.length] as V2Worker
    const assignment = assignments[index % assignments.length] as V2WorkAssignment
    const status = REVIEW_STATUSES[index % REVIEW_STATUSES.length] ?? 'draft'
    const workedOn = shiftDate(today, -(index + 1))
    const locked = status === 'confirmed' && index % 3 === 0
    return {
      id: nextId('work-time-review'),
      workerId: worker.id,
      workedOn,
      processType: random.pick(TIMED_PROCESS_TYPES) as V2WorkTimeReview['processType'],
      approvedMinutes: 90 + index * 12,
      hourlyWageCentsSnapshot: status === 'voided' ? null : 2800 + index * 40,
      sourceType: 'manual_review',
      externalRecordId: null,
      rawStartedAt: atFixedHour(workedOn, 9),
      rawEndedAt: atFixedHour(workedOn, 11, 30),
      status,
      workAssignmentId: assignment.id,
      assignmentIds: [assignment.id],
      supersedesReviewId: null,
      voidReason: status === 'voided' ? '录入时间范围有误，作废后重新登记' : null,
      voidedAt: status === 'voided' ? atFixedHour(FIXED_TODAY, 9) : null,
      reviewNote: LONG_TEXT.managerNote,
      lock: {
        locked,
        reason: locked ? 'downstream_consumed' : null,
        message: locked ? '下游已消耗，需先回退下游记录。' : null
      },
      items: [
        {
          id: nextId('work-time-review-item'),
          orderItemId: nextId('order-item'),
          processTaskId: null,
          completedQuantity: random.int(1, 8),
          pieceRateCentsSnapshot: 260 + index * 10,
          expectedUnitMinutesSnapshot: 12 + index
        }
      ],
      createdAt: atFixedHour(workedOn, 20),
      updatedAt: atFixedHour(workedOn, 20)
    }
  })

const makeWorkbenchItem = (
  context: FactoryContext,
  bucket: 'decision' | 'advance',
  index: number
): V2WorkbenchItem => {
  const { nextId, today } = context
  const kind =
    WORKBENCH_KINDS[(bucket === 'decision' ? index : index + 3) % WORKBENCH_KINDS.length] ??
    'process_task'
  const priority =
    bucket === 'decision' ? (index === 0 ? 'urgent' : index < 3 ? 'high' : 'normal') : 'normal'
  const asAmount =
    kind === 'refund' || kind === 'reimbursement' || kind === 'settlement_confirmation'
  return {
    id: nextId('workbench-item'),
    kind,
    bucket,
    priority,
    subject: {
      title: `${bucket === 'decision' ? '需要决定' : '可以推进'}·${kind}`,
      description: index % 2 === 0 ? LONG_TEXT.afterSalesNote : null
    },
    quantityOrAmount: asAmount
      ? {
          kind: 'amount',
          value: index === 0 ? EXTREME_AMOUNTS.wide : 3200 + index * 400,
          unit: '元'
        }
      : { kind: 'quantity', value: EXTREME_QUANTITIES.min + index, unit: '件' },
    dueHint: index % 3 === 0 ? `计划 ${shiftDate(today, index + 1)} 前完成` : null,
    navigationTarget: { view: 'orders', orderView: 'overview' }
  }
}

export const buildWorkbenchSnapshot = (
  context: FactoryContext,
  decisionCount: number,
  advanceCount: number
): V2WorkbenchSnapshot => ({
  decisionItems: Array.from({ length: decisionCount }, (_, index) =>
    makeWorkbenchItem(context, 'decision', index)
  ),
  advanceItems: Array.from({ length: advanceCount }, (_, index) =>
    makeWorkbenchItem(context, 'advance', index)
  ),
  firstUseGuide: null,
  generatedOn: FIXED_TODAY
})
