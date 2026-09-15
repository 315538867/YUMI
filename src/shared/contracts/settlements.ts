import type { BusinessDate, Cents, IsoDateTime } from './common'
import type { V2WorkTimeReviewProcessType } from './work-time-reviews'

export type V2WorkerSettlementStatus = 'draft' | 'confirmed' | 'adjusted'
export type V2WorkerDeductionStatus = 'pending' | 'partially_deducted' | 'settled'
export type V2WorkerRefundStatus = 'pending' | 'refunded'

export interface V2Worker {
  id: string
  name: string
  enabled: boolean
  note: string | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface V2WorkerCreateInput {
  name: string
  note?: string | null
  hourlyWageCents: Cents
  effectiveOn: BusinessDate
}

export interface V2WorkerWageHistory {
  id: string
  workerId: string
  effectiveOn: BusinessDate
  hourlyWageCents: Cents
  createdAt: IsoDateTime
}

export interface V2WorkerWageHistoryInput {
  workerId: string
  effectiveOn: BusinessDate
  hourlyWageCents: Cents
}

export interface V2WorkerSettlementQuery {
  workerId?: string
  status?: V2WorkerSettlementStatus
  periodStartOn?: BusinessDate
  periodEndOn?: BusinessDate
}

/** 制作结果来源：按合格数量计提成、按不合格数量扣冻结材料成本，不含时薪。 */
export interface V2WorkerSettlementMakingSource {
  id: string
  processTaskId: string
  qualityInspectionId: string
  orderId: string | null
  orderItemId: string | null
  /** 工作安排日期，用于工资期间归属。 */
  occurredOn: BusinessDate
  qualifiedQuantity: number
  unqualifiedQuantity: number
  pieceRateCents: Cents | null
  qualifiedCommissionCents: Cents
  materialDeductionCents: Cents
  status: 'draft' | 'confirmed' | 'cancelled'
  createdAt: IsoDateTime
}

export interface V2WorkerSettlementTimedItem {
  id: string
  /** 新核算明细来源；历史任务型来源为空。 */
  workTimeReviewItemId: string | null
  /** 仅历史任务型来源；新订单商品型来源为空。 */
  processTaskId: string | null
  orderItemId: string | null
  completedQuantity: number
  pieceRateCents: Cents | null
  commissionCents: Cents
}

/** 计时来源：来自一条已确认工时核算，按核算分钟冻结时薪并携带多商品完成明细。 */
export interface V2WorkerSettlementTimedSource {
  id: string
  workTimeReviewId: string
  processType: V2WorkTimeReviewProcessType
  /** 工时核算的工作日期，用于工资期间归属。 */
  occurredOn: BusinessDate
  approvedMinutes: number
  hourlyWageCentsSnapshot: Cents
  timedWageCents: Cents
  commissionCents: Cents
  status: 'draft' | 'confirmed' | 'cancelled'
  items: V2WorkerSettlementTimedItem[]
  createdAt: IsoDateTime
}

/** 已结算工时差异：在后续草稿结算中关联原工时与原结算建立正负调整。 */
export interface V2WorkerSettlementWorkTimeAdjustment {
  id: string
  workTimeReviewId: string
  originalSettlementId: string
  processType: V2WorkTimeReviewProcessType
  originalMinutes: number
  correctedMinutes: number
  hourlyWageCentsSnapshot: Cents
  amountCents: Cents
  reason: string
  note: string | null
  status: 'draft' | 'confirmed' | 'cancelled'
  createdAt: IsoDateTime
}

export interface V2WorkerSettlementWorkTimeAdjustmentInput {
  workTimeReviewId: string
  correctedMinutes: number
  reason: string
  note?: string | null
}

export interface V2WorkerDeductionRecord {
  id: string
  workerId: string
  workAssignmentId: string | null
  processTaskId: string
  processResultId: string | null
  qualityInspectionId: string | null
  orderId: string | null
  orderItemId: string | null
  unqualifiedQuantity: number
  /** 制作不合格材料成本扣款，使用冻结材料克单价与单件材料重量。 */
  materialDeductionCents: Cents
  totalDeductionCents: Cents
  deductedCents: Cents
  remainingCarryoverCents: Cents
  status: V2WorkerDeductionStatus
  occurredOn: BusinessDate
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface V2WorkerRefundRecord {
  id: string
  workerId: string
  originalSettlementId: string
  processTaskId: string
  processResultId: string | null
  qualityInspectionId: string
  orderId: string | null
  orderItemId: string | null
  unqualifiedQuantity: number
  /** 按冻结材料成本计算的待退款金额；不包含提成扣回或制作时薪。 */
  materialRefundCents: Cents
  actualRefundCents: Cents | null
  refundedOn: BusinessDate | null
  managerNote: string | null
  status: V2WorkerRefundStatus
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface V2WorkerRefundQuery {
  workerId?: string
  status?: V2WorkerRefundStatus
}

export interface V2WorkerRefundResolveInput {
  actualRefundCents: Cents
  refundedOn: BusinessDate
  managerNote?: string | null
}

export interface V2WorkerSettlementDeductionAllocation {
  id: string
  deductionRecordId: string
  allocatedCents: Cents
  status: 'draft' | 'confirmed' | 'cancelled'
  createdAt: IsoDateTime
}

export interface V2WorkerSettlement {
  id: string
  workerId: string
  periodStartOn: BusinessDate
  periodEndOn: BusinessDate
  status: V2WorkerSettlementStatus
  /** 计时工资合计：已确认核算分钟 × 冻结个人时薪。 */
  timedWageCents: Cents
  /** 计件提成合计：制作合格数量 + 捏毛装袋/缝边完成数量 × 冻结提成。 */
  commissionCents: Cents
  /** 本期新纳入的制作不合格材料扣款。 */
  materialDeductionCents: Cents
  /** 来源关联工资调整合计，可为负。 */
  adjustmentCents: Cents
  otherAdjustmentCents: Cents
  /** 唯一计算候选应发：扣款抵扣前合计减本期实际抵扣，且不为负。 */
  candidateWageCents: Cents
  currentDeductionCents: Cents
  carriedDeductionCents: Cents
  actualDeductionCents: Cents
  continuingCarryoverCents: Cents
  finalPaidAmountCents: Cents | null
  paidOn: BusinessDate | null
  managerNote: string | null
  financialEntryId: string | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface V2WorkerSettlementDetail extends V2WorkerSettlement {
  makingSources: V2WorkerSettlementMakingSource[]
  timedSources: V2WorkerSettlementTimedSource[]
  adjustments: V2WorkerSettlementWorkTimeAdjustment[]
  deductions: V2WorkerDeductionRecord[]
  deductionAllocations: V2WorkerSettlementDeductionAllocation[]
}

export interface V2WorkerSettlementCreateInput {
  workerId: string
  periodStartOn: BusinessDate
  periodEndOn: BusinessDate
  otherAdjustmentCents?: Cents
}

export interface V2WorkerSettlementDraftUpdateInput {
  actualDeductionCents?: Cents
  otherAdjustmentCents?: Cents
  finalPaidAmountCents?: Cents | null
  paidOn?: BusinessDate | null
  managerNote?: string | null
}
