import type { BusinessDate, Cents, IsoDateTime } from './common'
import type { V2ReviewLockState, V2TimedProcessType } from './fulfillment'

/** 只有三道计时工序需要一次核算；制作走一次结果与质量核算。 */
export type V2WorkTimeReviewProcessType = V2TimedProcessType

export type V2WorkTimeReviewStatus = 'draft' | 'confirmed' | 'voided'

/** 当前 UI 只创建手工核算；考勤设备来源为未来接入预留。 */
export type V2WorkTimeReviewSource = 'manual_review' | 'attendance_device'

export interface V2WorkTimeReviewItemInput {
  orderItemId: string
  completedQuantity: number
}

export interface V2WorkTimeReviewItem {
  id: string
  /** 新记录必填；历史记录可能为空并通过 processTaskId 追溯。 */
  orderItemId: string | null
  /** 仅历史兼容：旧记录通过工序任务关联商品，新记录恒为 null。 */
  processTaskId: string | null
  completedQuantity: number
  /** 核算确认时冻结的商品工序提成；打包发货固定为 0。 */
  pieceRateCentsSnapshot: Cents | null
  /** 核算确认时冻结的商品单件预计分钟；历史缺口允许为空。 */
  expectedUnitMinutesSnapshot: number | null
}

/** 计时一次核算：单项安排、单一连续时间范围、跨订单商品明细。 */
export interface V2WorkTimeReviewInput {
  workAssignmentId: string
  startedAt: IsoDateTime
  endedAt: IsoDateTime
  items: V2WorkTimeReviewItemInput[]
  reviewNote?: string | null
}

export interface V2WorkTimeReviewCorrectionInput {
  id: string
  startedAt: IsoDateTime
  endedAt: IsoDateTime
  items: V2WorkTimeReviewItemInput[]
  reason: string
  reviewNote?: string | null
}

export interface V2WorkTimeReview {
  id: string
  workerId: string
  workedOn: BusinessDate
  processType: V2WorkTimeReviewProcessType
  approvedMinutes: number
  /** 确认时冻结的工作日期生效个人时薪；作废历史可能为空。 */
  hourlyWageCentsSnapshot: Cents | null
  sourceType: V2WorkTimeReviewSource
  externalRecordId: string | null
  rawStartedAt: IsoDateTime | null
  rawEndedAt: IsoDateTime | null
  status: V2WorkTimeReviewStatus
  /** 新记录的直接安排关联；历史聚合记录为空并继续通过 assignmentIds 读取。 */
  workAssignmentId: string | null
  assignmentIds: string[]
  /** 版本链：本版本替代的旧核算记录。 */
  supersedesReviewId: string | null
  voidReason: string | null
  voidedAt: IsoDateTime | null
  reviewNote: string | null
  /** 更正/作废的下游与结算锁定状态；未锁定时可原子替换或回退。 */
  lock: V2ReviewLockState
  items: V2WorkTimeReviewItem[]
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface V2WorkTimeReviewQuery {
  workerId?: string
  workedOn?: BusinessDate
  status?: V2WorkTimeReviewStatus
  workAssignmentId?: string
}

export interface V2WorkTimeReviewVoidInput {
  reason: string
}

export interface V2WorkTimeReviewCandidateQuery {
  /** 按客户、订单号或商品名模糊搜索；为空时返回全部候选。 */
  search?: string | null
}

/** 计时核算的订单商品候选：直接来自当前工序可处理量，不依赖排班任务。 */
export interface V2WorkTimeReviewCandidate {
  orderItemId: string
  orderId: string
  orderCode: string
  customerName: string
  productName: string
  deliveryDate: BusinessDate | null
  orderCreatedAt: IsoDateTime
  /** 当前工序可处理数量；缝边取待缝边量与订单剩余缝边需求的较小值。 */
  processableQuantity: number
  /** 商品快照的单件预计分钟；历史商品缺少快照时为空。 */
  expectedUnitMinutes: number | null
  /** 商品快照的本工序单件提成；打包发货为 0。 */
  pieceRateCents: Cents
}
