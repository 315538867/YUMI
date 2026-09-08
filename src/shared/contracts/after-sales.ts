import type { BusinessDate, Cents, IsoDateTime } from './common'

export type V2AfterSalesStatus = 'open' | 'processing' | 'resolved' | 'cancelled'

export interface V2AfterSalesCase {
  id: string
  orderId: string
  shipmentId: string | null
  occurredOn: BusinessDate
  reasonDescription: string
  customerRequest: string | null
  responsibilityDescription: string
  handlingDescription: string
  status: V2AfterSalesStatus
  customerChargeNote: string | null
  accountingCostCents: Cents
  note: string | null
  chargeFinancialEntryIds: string[]
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface V2AfterSalesCaseCreateInput {
  orderId: string
  shipmentId?: string | null
  occurredOn: BusinessDate
  reasonDescription: string
  customerRequest?: string | null
  responsibilityDescription: string
  handlingDescription: string
  status: V2AfterSalesStatus
  customerChargeNote?: string | null
  accountingCostCents: Cents
  note?: string | null
}

export interface V2AfterSalesCaseUpdateInput {
  shipmentId?: string | null
  occurredOn?: BusinessDate
  reasonDescription?: string
  customerRequest?: string | null
  responsibilityDescription?: string
  handlingDescription?: string
  status?: V2AfterSalesStatus
  customerChargeNote?: string | null
  accountingCostCents?: Cents
  note?: string | null
}

export interface V2AfterSalesCaseQuery {
  orderId?: string
  status?: V2AfterSalesStatus
}

export interface V2AfterSalesChargeLink {
  afterSalesCaseId: string
  financialEntryId: string
  createdAt: IsoDateTime
}
