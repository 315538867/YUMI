import type { BusinessDate, Cents, IsoDateTime, V2AttachmentReference } from './common'
import type { V2Customer, V2CustomerInput } from './customers'
import type { V2ProductOrderSnapshot } from './products'

export type V2OrderFundDirection = 'income' | 'expense'
export type V2OrderFundBusinessType = 'payment' | 'refund' | 'after_sales_charge'

export interface V2OrderEdgeInput {
  enabled: boolean
  quantity?: number
  unitPriceCents?: Cents
}

export interface V2OrderItemInput {
  productId: string
  quantity: number
  unitPriceCents: Cents
  edge?: V2OrderEdgeInput
  itemDiscountCents?: Cents
}

export interface V2OrderItem {
  id: string
  orderId: string
  productId: string | null
  productSnapshot: V2ProductOrderSnapshot
  quantity: number
  unitPriceCents: Cents
  edgeEnabled: boolean
  edgeQuantity: number
  edgeUnitPriceCents: Cents
  itemAmountCents: Cents
  edgeAmountCents: Cents
  itemDiscountCents: Cents
  lineAmountCents: Cents
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface V2OrderCreateInput {
  code?: string
  customerId?: string | null
  customer: V2CustomerInput
  items: V2OrderItemInput[]
  orderDiscountCents?: Cents
  expectedShipDate?: BusinessDate | null
  reservedDays?: number | null
  notes?: string | null
}

export interface V2OrderAmountAdjustmentInput {
  amountCents: Cents
  occurredOn: BusinessDate
  reason: string
  note?: string | null
}

export interface V2OrderContentChangeInput {
  occurredOn: BusinessDate
  description: string
  items: V2OrderItemInput[]
  orderDiscountCents?: Cents
  amountAdjustment?: V2OrderAmountAdjustmentInput | null
}

export interface V2OrderAmountAdjustment extends V2OrderAmountAdjustmentInput {
  id: string
  orderId: string
  createdAt: IsoDateTime
}

export interface V2OrderContentChange {
  id: string
  orderId: string
  occurredOn: BusinessDate
  description: string
  beforeItems: V2OrderItem[]
  afterItems: V2OrderItem[]
  createdAt: IsoDateTime
}

export interface V2OrderFundInput {
  businessType: V2OrderFundBusinessType
  amountCents: Cents
  occurredOn: BusinessDate
  paymentMethod?: string | null
  attachmentId?: string | null
  note?: string | null
}

export interface V2OrderFund extends V2OrderFundInput {
  id: string
  orderId: string
  direction: V2OrderFundDirection
  reversalOfEntryId: string | null
  attachment: V2AttachmentReference | null
  createdAt: IsoDateTime
}

export interface V2OrderFundCorrectionInput {
  originalEntryId: string
  reversalOccurredOn: BusinessDate
  replacement: V2OrderFundInput
}

export interface V2ShipmentItemInput {
  orderItemId: string
  quantity: number
}

export interface V2ShipmentInput {
  shippedOn: BusinessDate
  items: V2ShipmentItemInput[]
  carrier?: string | null
  trackingNumber?: string | null
  note?: string | null
}

export interface V2ShipmentItem extends V2ShipmentItemInput {
  id: string
}

export interface V2Shipment extends Omit<V2ShipmentInput, 'items'> {
  id: string
  orderId: string
  items: V2ShipmentItem[]
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface V2OrderFundSummary {
  receivedCents: Cents
  refundedCents: Cents
  netReceivedCents: Cents
  outstandingCents: Cents
}

export interface V2OrderAmountSummary {
  itemAmountCents: Cents
  edgeAmountCents: Cents
  itemDiscountCents: Cents
  orderDiscountCents: Cents
  orderAmountCents: Cents
  adjustmentsCents: Cents
  currentAmountCents: Cents
}

export interface V2Order {
  id: string
  code: string
  customer: V2Customer | null
  customerSnapshot: V2CustomerInput
  items: V2OrderItem[]
  amount: V2OrderAmountSummary
  funds: V2OrderFundSummary
  expectedShipDate: BusinessDate | null
  reservedDays: number
  productionDeadline: BusinessDate | null
  notes: string | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface V2OrderSummary {
  id: string
  code: string
  customerName: string
  itemCount: number
  currentAmountCents: Cents
  netReceivedCents: Cents
  outstandingCents: Cents
  expectedShipDate: BusinessDate | null
  reservedDays: number
  productionDeadline: BusinessDate | null
  updatedAt: IsoDateTime
}
