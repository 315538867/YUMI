import type {
  BusinessDate,
  Cents,
  MaterialPriceMicroYuanPerGram,
  IsoDateTime,
  WeightMilligrams
} from './common'

export type V2ProcessType = 'making' | 'fluffing_bagging' | 'edge_sewing' | 'packing'
/** 非制作计时工序：排班只关联人员、日期、工序和备注。 */
export type V2TimedProcessType = 'fluffing_bagging' | 'edge_sewing' | 'packing'
export type V2ProcessTaskSource =
  'normal_production' | 'rework' | 'after_sales_replacement' | 'manager_arrangement'
export type V2WorkAssignmentStatus = 'draft' | 'scheduled' | 'cancelled' | 'completed' | 'absent'
/** 排班模式：制作数量排班、计时公共班次、迁移前历史安排。 */
export type V2WorkAssignmentScheduleMode = 'making_task' | 'timed_shift' | 'legacy_task'
export type V2ProcessTaskStatus = 'pending' | 'pending_inspection' | 'confirmed' | 'cancelled'
export type V2FulfillmentStage =
  'making' | 'fluffing_bagging' | 'edge_sewing' | 'packing' | 'ready_to_ship' | 'shipped'
export type V2FulfillmentEventType =
  | 'inventory_allocation'
  | 'making_qualified'
  | 'fluffing_bagging_completed'
  | 'edge_sewing_completed'
  | 'packing_completed'
  | 'shipment'
  | 'manager_adjustment'
  | 'after_sales_return'
  | 'after_sales_replacement'

/** 制作排班任务输入：始终关联订单商品、计划数量及适用快照。 */
export interface V2MakingTaskInput {
  orderItemId: string
  sourceType: V2ProcessTaskSource
  plannedQuantity: number
  /** 制作额外预留分钟；与标准制作分钟 × 计划数量共同构成排班分钟。 */
  extraMinutes?: number | null
  /** 可选的计件提成覆盖；默认冻结商品快照值。 */
  pieceRateCents?: Cents | null
  note?: string | null
}

export interface V2MakingWorkAssignmentCreateInput {
  scheduleMode: 'making_task'
  workerId: string
  assignedOn: BusinessDate
  processType: 'making'
  note?: string | null
  tasks: V2MakingTaskInput[]
}

/** 计时公共班次输入：不得携带任务、数量、预计分钟或时间范围。 */
export interface V2TimedWorkAssignmentCreateInput {
  scheduleMode: 'timed_shift'
  workerId: string
  assignedOn: BusinessDate
  processType: V2TimedProcessType
  note?: string | null
}

export type V2WorkAssignmentCreateInput =
  V2MakingWorkAssignmentCreateInput | V2TimedWorkAssignmentCreateInput

/** 缺勤或取消：已有当前有效核算的安排不得被状态更新静默撤销。 */
export interface V2WorkAssignmentStatusUpdateInput {
  status: 'absent' | 'cancelled'
  reason?: string | null
}

/**
 * 仅对尚未提交完成结果的任务转派负责人；原任务保留并标记为已取消。
 */
export interface V2ProcessTaskReassignmentInput {
  workerId: string
  effectiveOn: BusinessDate
  reason: string
}

export type V2ReviewLockReason = 'downstream_consumed' | 'settlement_confirmed'

/** 已核算记录的更正/作废可用性；锁定后只能走履约调整或后续结算调整。 */
export interface V2ReviewLockState {
  locked: boolean
  reason: V2ReviewLockReason | null
  /** 锁定的可读原因与调整指引；未锁定时为空。 */
  message: string | null
}

/** 制作当前有效核算摘要：以一次核算结果与质量事实投影。 */
export interface V2MakingReviewSummary {
  resultId: string
  completedQuantity: number
  qualifiedQuantity: number
  /** 实际产出减合格数量，由系统计算。 */
  unqualifiedQuantity: number
  /** 本次计划数量减实际产出，仅用于展示与释放排产缺口。 */
  unfinishedQuantity: number
  reviewedOn: BusinessDate
  note: string | null
  supersedesResultId: string | null
  lock: V2ReviewLockState
  createdAt: IsoDateTime
}

export interface V2ProcessTask {
  id: string
  workAssignmentId: string
  orderItemId: string | null
  processType: V2ProcessType
  sourceType: V2ProcessTaskSource
  plannedQuantity: number | null
  plannedMinutes: number
  extraMinutes: number
  scheduledMinutes: number
  status: V2ProcessTaskStatus
  hourlyWageCents: Cents | null
  pieceRateCents: Cents | null
  /** 历史固定胶水成本；当前任务会使用冻结的单价和用量。 */
  glueCostCents: Cents | null
  materialPriceMicroYuanPerGram: MaterialPriceMicroYuanPerGram | null
  glueWeightMilligrams: WeightMilligrams | null
  rateSnapshot: Record<string, unknown> | null
  note: string | null
  /** 当前有效制作核算；尚无有效结果或只有未质检历史结果时为 null。 */
  reviewSummary: V2MakingReviewSummary | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

/** 计时班次当前有效核算摘要；作废或未核算时为 null。 */
export interface V2TimedReviewSummary {
  reviewId: string
  approvedMinutes: number
  reviewedOn: BusinessDate
  lock: V2ReviewLockState
}

export interface V2WorkAssignment {
  id: string
  workerId: string
  assignedOn: BusinessDate
  processType: V2ProcessType
  scheduleMode: V2WorkAssignmentScheduleMode
  status: V2WorkAssignmentStatus
  note: string | null
  tasks: V2ProcessTask[]
  /** 计时班次当前有效核算摘要；制作班次恒为 null（核算在任务上）。 */
  timedReview: V2TimedReviewSummary | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface V2WorkAssignmentQuery {
  workerId?: string
  assignedOn?: BusinessDate
  orderItemId?: string
}

export interface V2ProcessResultInput {
  completedQuantity: number
  actualMinutes?: number | null
  submittedOn: BusinessDate
  note?: string | null
}

export type V2ProcessResultStatus = 'confirmed' | 'voided'

export interface V2ProcessResult extends V2ProcessResultInput {
  id: string
  processTaskId: string
  status: V2ProcessResultStatus
  /** 版本链：本版本替代的旧结果。 */
  supersedesResultId: string | null
  voidReason: string | null
  voidedAt: IsoDateTime | null
  createdAt: IsoDateTime
}

export interface V2QualityInspectionInput {
  qualifiedQuantity: number
  unqualifiedQuantity: number
  inspectedOn: BusinessDate
  reasonNote?: string | null
  requiresRework?: boolean
  note?: string | null
}

export interface V2QualityInspection extends V2QualityInspectionInput {
  id: string
  processResultId: string
  processTaskId: string
  requiresRework: boolean
  createdAt: IsoDateTime
}

/** 制作一次核算：实际产出与合格数量，系统计算不合格与未完成。 */
export interface V2MakingReviewInput {
  processTaskId: string
  completedQuantity: number
  qualifiedQuantity: number
  reviewedOn: BusinessDate
  note?: string | null
}

export interface V2MakingReviewCorrectionInput {
  resultId: string
  completedQuantity: number
  qualifiedQuantity: number
  reviewedOn: BusinessDate
  reason: string
  note?: string | null
}

export interface V2MakingReviewVoidInput {
  resultId: string
  reason: string
}

export interface V2FulfillmentAdjustmentInput {
  orderItemId: string
  quantity: number
  sourceStage?: V2FulfillmentStage | null
  targetStage?: V2FulfillmentStage | null
  occurredOn: BusinessDate
  note: string
}

export interface V2FulfillmentEvent {
  id: string
  orderItemId: string
  eventType: V2FulfillmentEventType
  quantity: number
  sourceStage: V2FulfillmentStage | null
  targetStage: V2FulfillmentStage | null
  sourceRecordType: string | null
  sourceRecordId: string | null
  /** 事件级幂等键：同一来源记录可合法生成多条不同键的事件。 */
  sourceEventKey: string | null
  occurredOn: BusinessDate
  note: string | null
  createdAt: IsoDateTime
}

export interface V2FulfillmentStageBalances {
  making: number
  fluffingBagging: number
  edgeSewing: number
  packing: number
  readyToShip: number
  shipped: number
  /** 累计进入过待缝边的数量，用于展示订单商品剩余缝边需求。 */
  edgeSewingRouted: number
}

export interface V2OrderItemFulfillment {
  orderItemId: string
  orderId: string
  confirmedQuantity: number
  stages: V2FulfillmentStageBalances
  events: V2FulfillmentEvent[]
}
