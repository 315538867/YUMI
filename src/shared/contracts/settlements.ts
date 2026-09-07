import type { BusinessDate, Cents, IsoDateTime } from './common'

export type V2WorkerSettlementStatus = 'draft' | 'confirmed' | 'adjusted'
export type V2WorkerDeductionStatus = 'pending' | 'partially_deducted' | 'settled'

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

export interface V2WorkerSettlementTask {
  id: string
  processTaskId: string
  scheduledMinutes: number
  qualifiedQuantity: number
  qualifiedCommissionCents: Cents
  status: 'draft' | 'confirmed' | 'cancelled'
  createdAt: IsoDateTime
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
  commissionDeductionCents: Cents
  wageDeductionCents: Cents
  glueDeductionCents: Cents
  totalDeductionCents: Cents
  deductedCents: Cents
  remainingCarryoverCents: Cents
  status: V2WorkerDeductionStatus
  occurredOn: BusinessDate
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
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
  scheduledMinutes: number
  attendanceMinutes: number | null
  attendanceNote: string | null
  scheduledReferenceWageCents: Cents
  attendanceReferenceWageCents: Cents
  qualifiedCommissionCents: Cents
  currentDeductionCents: Cents
  carriedDeductionCents: Cents
  actualDeductionCents: Cents
  continuingCarryoverCents: Cents
  otherAdjustmentCents: Cents
  finalPaidAmountCents: Cents | null
  paidOn: BusinessDate | null
  managerNote: string | null
  financialEntryId: string | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface V2WorkerSettlementDetail extends V2WorkerSettlement {
  tasks: V2WorkerSettlementTask[]
  deductions: V2WorkerDeductionRecord[]
  deductionAllocations: V2WorkerSettlementDeductionAllocation[]
}

export interface V2WorkerSettlementCreateInput {
  workerId: string
  periodStartOn: BusinessDate
  periodEndOn: BusinessDate
  attendanceMinutes?: number | null
  attendanceNote?: string | null
  otherAdjustmentCents?: Cents
}

export interface V2WorkerSettlementDraftUpdateInput {
  attendanceMinutes?: number | null
  attendanceNote?: string | null
  actualDeductionCents?: Cents
  otherAdjustmentCents?: Cents
  finalPaidAmountCents?: Cents | null
  paidOn?: BusinessDate | null
  managerNote?: string | null
}
