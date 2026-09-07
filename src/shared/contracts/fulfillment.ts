import type { BusinessDate, Cents, IsoDateTime } from './common'

export type V2ProcessType = 'making' | 'fluffing_bagging' | 'packing' | 'shipping'
export type V2ProcessTaskSource = 'normal_production' | 'rework' | 'after_sales_replacement' | 'manager_arrangement'
export type V2WorkAssignmentStatus = 'draft' | 'scheduled' | 'cancelled' | 'completed'
export type V2ProcessTaskStatus = 'pending' | 'pending_inspection' | 'confirmed' | 'cancelled'
export type V2FulfillmentStage = 'making' | 'fluffing_bagging' | 'packing' | 'ready_to_ship' | 'shipped'
export type V2FulfillmentEventType =
  | 'opening_wip'
  | 'making_qualified'
  | 'fluffing_bagging_qualified'
  | 'packing_completed'
  | 'shipment'
  | 'manager_adjustment'
  | 'after_sales_return'
  | 'after_sales_replacement'

export interface V2ProcessTaskInput {
  orderItemId?: string | null
  sourceType: V2ProcessTaskSource
  plannedQuantity?: number | null
  /** 制作保存“标准分钟 × 数量”的基础值；其他工序为负责人填写值。 */
  plannedMinutes?: number | null
  /** 仅制作任务可填写，会与 plannedMinutes 一起构成排班总分钟。 */
  extraMinutes?: number | null
  hourlyWageCents?: Cents | null
  pieceRateCents?: Cents | null
  glueCostCents?: Cents | null
  rateSnapshot?: Record<string, unknown> | null
  note?: string | null
}

export interface V2WorkAssignmentCreateInput {
  workerId: string
  assignedOn: BusinessDate
  processType: V2ProcessType
  note?: string | null
  tasks: V2ProcessTaskInput[]
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
  glueCostCents: Cents | null
  rateSnapshot: Record<string, unknown> | null
  note: string | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface V2WorkAssignment {
  id: string
  workerId: string
  assignedOn: BusinessDate
  processType: V2ProcessType
  status: V2WorkAssignmentStatus
  note: string | null
  tasks: V2ProcessTask[]
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

export interface V2ProcessResult extends V2ProcessResultInput {
  id: string
  processTaskId: string
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

export interface V2OpeningWipInput {
  orderItemId: string
  targetStage: Exclude<V2FulfillmentStage, 'making' | 'shipped'>
  quantity: number
  occurredOn: BusinessDate
  note?: string | null
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
  occurredOn: BusinessDate
  note: string | null
  createdAt: IsoDateTime
}

export interface V2FulfillmentStageBalances {
  making: number
  fluffingBagging: number
  packing: number
  readyToShip: number
  shipped: number
}

export interface V2OrderItemFulfillment {
  orderItemId: string
  orderId: string
  confirmedQuantity: number
  stages: V2FulfillmentStageBalances
  events: V2FulfillmentEvent[]
}
