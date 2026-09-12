import type { BusinessDate, Cents } from './common'

/** 应用内导航仅描述真实处理位置，不携带或写入业务状态。 */
export type V2NavigationTarget =
  | {
      view: 'orders'
      orderId?: string
      orderView?: 'overview' | 'fulfillment' | 'funds' | 'after_sales'
    }
  | {
      view: 'fulfillment'
      orderId?: string
      orderItemId?: string
      processTaskId?: string
      focus?: 'queue' | 'inspection' | 'shipment'
    }
  | { view: 'settlements'; settlementId?: string; focus?: 'draft' | 'confirm' | 'refund' }
  | {
      view: 'finance'
      financeView?: 'overview' | 'cashflow' | 'reimbursements'
      financialEntryId?: string
    }
  | { view: 'customers'; customerId?: string }
  | { view: 'products'; productId?: string }

export type V2WorkbenchBucket = 'decision' | 'advance'
export type V2WorkbenchPriority = 'urgent' | 'high' | 'normal'
export type V2WorkbenchItemKind =
  | 'quality_inspection'
  | 'settlement_confirmation'
  | 'refund'
  | 'after_sales_handling'
  | 'process_task'
  | 'shipment'
  | 'reimbursement'

export interface V2WorkbenchSubject {
  title: string
  description: string | null
}

export interface V2WorkbenchQuantityOrAmount {
  kind: 'quantity' | 'amount'
  value: number | Cents
  unit: string
}

/** 负责人工作台事项；由既有事实只读聚合而来，不是新的手工待办。 */
export interface V2WorkbenchItem {
  id: string
  kind: V2WorkbenchItemKind
  bucket: V2WorkbenchBucket
  priority: V2WorkbenchPriority
  subject: V2WorkbenchSubject
  quantityOrAmount: V2WorkbenchQuantityOrAmount | null
  dueHint: string | null
  navigationTarget: V2NavigationTarget
}

/** 首用时仅显示一个当前最先缺失的前置操作。 */
export interface V2WorkbenchFirstUseGuide {
  title: string
  description: string
  actionLabel: string
  navigationTarget: Extract<V2NavigationTarget, { view: 'customers' | 'products' | 'orders' }>
}

export interface V2WorkbenchSnapshot {
  decisionItems: V2WorkbenchItem[]
  advanceItems: V2WorkbenchItem[]
  firstUseGuide: V2WorkbenchFirstUseGuide | null
  generatedOn: BusinessDate
}
