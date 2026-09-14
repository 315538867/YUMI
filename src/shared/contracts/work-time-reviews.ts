import type { BusinessDate, Cents, IsoDateTime } from './common'

/** 只有三道计时工序需要负责人次日核算；制作走结果与质量确认。 */
export type V2WorkTimeReviewProcessType = 'fluffing_bagging' | 'edge_sewing' | 'packing'

export type V2WorkTimeReviewStatus = 'draft' | 'confirmed' | 'voided'

/** 当前 UI 只创建手工核算；考勤设备来源为未来接入预留。 */
export type V2WorkTimeReviewSource = 'manual_review' | 'attendance_device'

export interface V2WorkTimeReviewItemInput {
  processTaskId: string
  completedQuantity: number
}

export interface V2WorkTimeReviewItem {
  id: string
  processTaskId: string
  orderItemId: string | null
  completedQuantity: number
}

export interface V2WorkTimeReviewInput {
  workerId: string
  workedOn: BusinessDate
  processType: V2WorkTimeReviewProcessType
  approvedMinutes: number
  /** 一个或多个员工、日期和工序一致的工作安排。 */
  assignmentIds: string[]
  /** 一条核算记录可以登记多个商品完成明细，全部属于记录的同一道工序。 */
  items: V2WorkTimeReviewItemInput[]
  reviewNote?: string | null
}

export interface V2WorkTimeReviewUpdateInput extends V2WorkTimeReviewInput {
  id: string
}

export interface V2WorkTimeReview {
  id: string
  workerId: string
  workedOn: BusinessDate
  processType: V2WorkTimeReviewProcessType
  approvedMinutes: number
  /** 确认时冻结的工作日期生效个人时薪；草稿阶段为空。 */
  hourlyWageCentsSnapshot: Cents | null
  sourceType: V2WorkTimeReviewSource
  externalRecordId: string | null
  rawStartedAt: IsoDateTime | null
  rawEndedAt: IsoDateTime | null
  status: V2WorkTimeReviewStatus
  reviewNote: string | null
  assignmentIds: string[]
  items: V2WorkTimeReviewItem[]
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface V2WorkTimeReviewQuery {
  workerId?: string
  workedOn?: BusinessDate
  status?: V2WorkTimeReviewStatus
}

export interface V2WorkTimeReviewVoidInput {
  reason: string
}
