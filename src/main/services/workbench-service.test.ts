import { describe, expect, it } from 'vitest'
import { WorkbenchService } from './workbench-service'
import type {
  V2AfterSalesCase,
  V2Order,
  V2OrderItemFulfillment,
  V2OrderSummary,
  V2PendingReimbursement,
  V2WorkerRefundRecord,
  V2WorkerSettlementDetail,
  V2WorkAssignment
} from '@shared/contracts/index'

const iso = '2026-09-08T09:00:00.000Z'

function assignment(taskId = 'task-1', overrides: Partial<V2WorkAssignment['tasks'][number]> = {}): V2WorkAssignment {
  return {
    id: `assignment-${taskId}`, workerId: 'worker-1', assignedOn: '2026-09-06', processType: 'making', status: 'scheduled', note: null, createdAt: iso, updatedAt: iso,
    tasks: [{
      id: taskId, workAssignmentId: `assignment-${taskId}`, orderItemId: 'item-1', processType: 'making', sourceType: 'normal_production', plannedQuantity: 10,
      plannedMinutes: 300, extraMinutes: 0, scheduledMinutes: 300, status: 'pending', hourlyWageCents: 2_000, pieceRateCents: 100,
      glueCostCents: 20, rateSnapshot: null, note: null, createdAt: iso, updatedAt: iso, ...overrides
    }]
  }
}

function order(): V2Order {
  return {
    id: 'order-1', code: 'YD-001', customer: null, customerSnapshot: { name: '小雨' },
    items: [{ id: 'item-1', orderId: 'order-1', productId: null, productSnapshot: { name: '草莓团子', unitPriceCents: 1_000, makingCommissionCents: 100, makingStandardMinutes: 30, makingGlueCostCents: 20 }, quantity: 10, unitPriceCents: 1_000, createdAt: iso, updatedAt: iso }],
    funds: { receivedCents: 0, refundedCents: 0, netReceivedCents: 0, outstandingCents: 10_000 }, expectedShipDate: '2026-09-10', notes: null, createdAt: iso, updatedAt: iso
  }
}

function fulfillment(readyToShip = 0): V2OrderItemFulfillment {
  return {
    orderItemId: 'item-1', orderId: 'order-1', confirmedQuantity: 10,
    stages: { making: 0, fluffingBagging: 0, packing: 0, readyToShip, shipped: 0 }, events: []
  }
}

function settlement(): V2WorkerSettlementDetail {
  return {
    id: 'settlement-1', workerId: 'worker-1', periodStartOn: '2026-09-01', periodEndOn: '2026-09-07', status: 'draft', scheduledMinutes: 300,
    attendanceMinutes: null, attendanceNote: null, scheduledReferenceWageCents: 10_000, attendanceReferenceWageCents: 0, qualifiedCommissionCents: 1_000,
    currentDeductionCents: 0, carriedDeductionCents: 0, actualDeductionCents: 0, continuingCarryoverCents: 0, otherAdjustmentCents: 0,
    finalPaidAmountCents: null, paidOn: null, managerNote: null, financialEntryId: null, createdAt: iso, updatedAt: iso,
    tasks: [], deductions: [], deductionAllocations: []
  }
}

function afterSales(): V2AfterSalesCase {
  return {
    id: 'after-sales-1', orderId: 'order-1', shipmentId: 'shipment-1', occurredOn: '2026-09-07', reasonDescription: '包装不满意',
    customerRequest: '加封边', responsibilityDescription: '待负责人确认', handlingDescription: '待商议', status: 'open',
    customerChargeNote: null, accountingCostCents: 300, note: null, chargeFinancialEntryIds: [], createdAt: iso, updatedAt: iso
  }
}

function reimbursement(): V2PendingReimbursement {
  return {
    financialEntryId: 'advance-1', amountCents: 1_280, occurredOn: '2026-09-01', categoryId: 'cat-1', categoryName: '包材', advancePayerId: 'payer-1', advancePayerName: '小林', note: null
  }
}

function refund(): V2WorkerRefundRecord {
  return {
    id: 'refund-1', workerId: 'worker-1', originalSettlementId: 'settlement-confirmed-1', processTaskId: 'task-refund-1',
    processResultId: 'result-refund-1', qualityInspectionId: 'inspection-refund-1', orderId: 'order-1', orderItemId: 'item-1',
    unqualifiedQuantity: 1, commissionDeductionCents: 300, wageDeductionCents: 400, glueDeductionCents: 50,
    requestedRefundCents: 750, actualRefundCents: null, refundedOn: null, managerNote: null, status: 'pending', createdAt: iso, updatedAt: iso
  }
}

function createService(input: {
  customers?: number
  products?: number
  orders?: V2OrderSummary[]
  order?: V2Order | null
  assignments?: V2WorkAssignment[]
  fulfillment?: V2OrderItemFulfillment
  settlements?: V2WorkerSettlementDetail[]
  afterSalesCases?: V2AfterSalesCase[]
  reimbursements?: V2PendingReimbursement[]
  refunds?: V2WorkerRefundRecord[]
} = {}) {
  return new WorkbenchService({
    orders: {
      listCustomers: () => Array.from({ length: input.customers ?? 1 }, (_, index) => ({ id: `customer-${index}` })),
      listProducts: () => Array.from({ length: input.products ?? 1 }, (_, index) => ({ id: `product-${index}` })),
      listOrders: () => input.orders ?? [{ id: 'order-1', code: 'YD-001', customerName: '小雨', itemCount: 1, currentAmountCents: 10_000, netReceivedCents: 0, outstandingCents: 10_000, expectedShipDate: '2026-09-10', updatedAt: iso }],
      getOrder: () => input.order ?? order()
    },
    fulfillment: {
      listWorkAssignments: () => input.assignments ?? [assignment()],
      getOrderItemFulfillment: () => input.fulfillment ?? fulfillment(3)
    },
    settlements: {
      listSettlements: () => input.settlements ?? [settlement()],
      listRefunds: () => input.refunds ?? [refund()]
    },
    afterSales: { listCases: () => input.afterSalesCases ?? [afterSales()] },
    finance: { listPendingReimbursements: () => input.reimbursements ?? [reimbursement()] },
    clock: { today: () => '2026-09-08' }
  })
}

describe('WorkbenchService', () => {
  it('从既有事实聚合待决定和可推进事项，去重并按优先级稳定排序', () => {
    const snapshot = createService({ assignments: [assignment('task-1', { status: 'pending_inspection' }), assignment('task-2')] }).getSnapshot()

    expect(snapshot.generatedOn).toBe('2026-09-08')
    expect(snapshot.decisionItems.map((item) => item.id)).toEqual([
      'quality-inspection:task-1', 'after-sales:after-sales-1', 'refund:refund-1', 'settlement:settlement-1'
    ])
    expect(snapshot.advanceItems.map((item) => item.id)).toEqual([
      'shipment:item-1', 'process-task:task-2', 'reimbursement:advance-1'
    ])
    expect(snapshot.decisionItems[0]).toMatchObject({
      navigationTarget: { view: 'fulfillment', orderItemId: 'item-1', processTaskId: 'task-1', focus: 'inspection' },
      quantityOrAmount: { kind: 'quantity', value: 10, unit: '件' }
    })
    expect(snapshot.advanceItems[0]).toMatchObject({
      navigationTarget: { view: 'fulfillment', orderId: 'order-1', orderItemId: 'item-1', focus: 'shipment' },
      quantityOrAmount: { kind: 'quantity', value: 3, unit: '件' }
    })
    expect(snapshot.decisionItems[2]).toMatchObject({
      kind: 'refund', quantityOrAmount: { kind: 'amount', value: 750, unit: '元' },
      navigationTarget: { view: 'settlements', focus: 'refund' }
    })
    expect(snapshot.firstUseGuide).toBeNull()
  })

  it('无待办时仅返回当前最先缺失的首用前置操作，读取不会写入领域状态', () => {
    const snapshot = createService({ customers: 0, products: 0, orders: [], assignments: [], settlements: [], afterSalesCases: [], reimbursements: [], refunds: [] }).getSnapshot()

    expect(snapshot.decisionItems).toEqual([])
    expect(snapshot.advanceItems).toEqual([])
    expect(snapshot.firstUseGuide).toEqual({
      title: '先建立客户', description: '订单需要关联客户资料，先建立首个客户后再继续。', actionLabel: '建立客户', navigationTarget: { view: 'customers' }
    })

    const productGuide = createService({ customers: 1, products: 0, orders: [], assignments: [], settlements: [], afterSalesCases: [], reimbursements: [], refunds: [] }).getSnapshot().firstUseGuide
    expect(productGuide?.navigationTarget).toEqual({ view: 'products' })

    const orderGuide = createService({ customers: 1, products: 1, orders: [], assignments: [], settlements: [], afterSalesCases: [], reimbursements: [], refunds: [] }).getSnapshot().firstUseGuide
    expect(orderGuide?.navigationTarget).toEqual({ view: 'orders' })
  })
})
