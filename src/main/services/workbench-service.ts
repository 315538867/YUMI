import type {
  V2AfterSalesCase,
  V2Order,
  V2OrderItemFulfillment,
  V2OrderSummary,
  V2PendingReimbursement,
  V2WorkbenchFirstUseGuide,
  V2WorkbenchItem,
  V2WorkbenchSnapshot,
  V2WorkerRefundRecord,
  V2WorkerSettlementDetail,
  V2WorkAssignment
} from '@shared/contracts/index'

interface WorkbenchOrderReader {
  listCustomers(): Array<{ id: string }>
  listProducts(): Array<{ id: string }>
  listOrders(): V2OrderSummary[]
  getOrder(orderId: string): V2Order | null
}

interface WorkbenchFulfillmentReader {
  listWorkAssignments(): V2WorkAssignment[]
  getOrderItemFulfillment(orderItemId: string): V2OrderItemFulfillment
}

interface WorkbenchSettlementReader {
  listSettlements(): V2WorkerSettlementDetail[]
  listRefunds(query?: { status?: V2WorkerRefundRecord['status'] }): V2WorkerRefundRecord[]
}

interface WorkbenchAfterSalesReader {
  listCases(): V2AfterSalesCase[]
}

interface WorkbenchFinanceReader {
  listPendingReimbursements(asOf: string): V2PendingReimbursement[]
}

interface WorkbenchClock {
  today(): string
}

export interface WorkbenchServiceDependencies {
  orders: WorkbenchOrderReader
  fulfillment: WorkbenchFulfillmentReader
  settlements: WorkbenchSettlementReader
  afterSales: WorkbenchAfterSalesReader
  finance: WorkbenchFinanceReader
  clock?: WorkbenchClock
}

const defaultClock: WorkbenchClock = {
  today: () => new Date().toISOString().slice(0, 10)
}

const priorityRank: Record<V2WorkbenchItem['priority'], number> = {
  urgent: 0,
  high: 1,
  normal: 2
}

function asCurrency(value: number) {
  return { kind: 'amount' as const, value, unit: '元' }
}

function asQuantity(value: number) {
  return { kind: 'quantity' as const, value, unit: '件' }
}

/**
 * 将既有领域事实投影为负责人可处理事项。该服务只读，不创建待办或改变任何领域状态。
 */
export class WorkbenchService {
  private readonly clock: WorkbenchClock

  constructor(private readonly dependencies: WorkbenchServiceDependencies) {
    this.clock = dependencies.clock ?? defaultClock
  }

  getSnapshot(): V2WorkbenchSnapshot {
    const generatedOn = this.clock.today()
    const orders = this.dependencies.orders.listOrders()
    const decisionItems = new Map<string, V2WorkbenchItem>()
    const advanceItems = new Map<string, V2WorkbenchItem>()

    this.collectTaskItems(decisionItems, advanceItems)
    this.collectShipmentItems(orders, advanceItems)
    this.collectSettlementItems(decisionItems)
    this.collectRefundItems(decisionItems)
    this.collectAfterSalesItems(decisionItems)
    this.collectReimbursementItems(generatedOn, advanceItems)

    const sortedDecisionItems = this.sortItems([...decisionItems.values()])
    const sortedAdvanceItems = this.sortItems([...advanceItems.values()])

    return {
      decisionItems: sortedDecisionItems,
      advanceItems: sortedAdvanceItems,
      firstUseGuide: this.getFirstUseGuide({
        hasPendingItems: sortedDecisionItems.length > 0 || sortedAdvanceItems.length > 0,
        orderCount: orders.length
      }),
      generatedOn
    }
  }

  private collectTaskItems(
    decisionItems: Map<string, V2WorkbenchItem>,
    advanceItems: Map<string, V2WorkbenchItem>
  ): void {
    for (const assignment of this.dependencies.fulfillment.listWorkAssignments()) {
      for (const task of assignment.tasks) {
        if (task.status === 'pending_inspection') {
          decisionItems.set(`quality-inspection:${task.id}`, {
            id: `quality-inspection:${task.id}`,
            kind: 'quality_inspection',
            bucket: 'decision',
            priority: 'urgent',
            subject: {
              title: '确认质检结果',
              description: `${this.processLabel(task.processType)} · 排班 ${assignment.assignedOn}`
            },
            quantityOrAmount:
              task.plannedQuantity === null ? null : asQuantity(task.plannedQuantity),
            dueHint: `完成后待质检 · ${assignment.assignedOn}`,
            navigationTarget: {
              view: 'fulfillment',
              orderItemId: task.orderItemId ?? undefined,
              processTaskId: task.id,
              focus: 'inspection'
            }
          })
          continue
        }

        if (task.status !== 'pending') continue
        advanceItems.set(`process-task:${task.id}`, {
          id: `process-task:${task.id}`,
          kind: 'process_task',
          bucket: 'advance',
          priority: 'high',
          subject: {
            title: `推进${this.processLabel(task.processType)}`,
            description: `${task.sourceType === 'rework' ? '返工' : '已排班'} · ${assignment.assignedOn}`
          },
          quantityOrAmount: task.plannedQuantity === null ? null : asQuantity(task.plannedQuantity),
          dueHint: `安排日期 ${assignment.assignedOn}`,
          navigationTarget: {
            view: 'fulfillment',
            orderItemId: task.orderItemId ?? undefined,
            processTaskId: task.id,
            focus: 'queue'
          }
        })
      }
    }
  }

  private collectShipmentItems(
    orders: V2OrderSummary[],
    advanceItems: Map<string, V2WorkbenchItem>
  ): void {
    for (const orderSummary of orders) {
      const order = this.dependencies.orders.getOrder(orderSummary.id)
      if (!order) continue
      for (const item of order.items) {
        const fulfillment = this.dependencies.fulfillment.getOrderItemFulfillment(item.id)
        const quantity = fulfillment.stages.readyToShip
        if (quantity <= 0) continue
        advanceItems.set(`shipment:${item.id}`, {
          id: `shipment:${item.id}`,
          kind: 'shipment',
          bucket: 'advance',
          priority: 'urgent',
          subject: {
            title: '登记发货',
            description: `${order.code} · ${item.productSnapshot.name}`
          },
          quantityOrAmount: asQuantity(quantity),
          dueHint: order.expectedShipDate ? `预计发货 ${order.expectedShipDate}` : null,
          navigationTarget: {
            view: 'fulfillment',
            orderId: order.id,
            orderItemId: item.id,
            focus: 'shipment'
          }
        })
      }
    }
  }

  private collectSettlementItems(decisionItems: Map<string, V2WorkbenchItem>): void {
    for (const settlement of this.dependencies.settlements.listSettlements()) {
      if (settlement.status !== 'draft' && settlement.status !== 'adjusted') continue
      decisionItems.set(`settlement:${settlement.id}`, {
        id: `settlement:${settlement.id}`,
        kind: 'settlement_confirmation',
        bucket: 'decision',
        priority: 'normal',
        subject: {
          title: '确认兼职工资',
          description: `${settlement.periodStartOn} 至 ${settlement.periodEndOn}`
        },
        quantityOrAmount: asCurrency(
          settlement.finalPaidAmountCents ??
            settlement.scheduledReferenceWageCents +
              settlement.qualifiedCommissionCents -
              settlement.actualDeductionCents +
              settlement.otherAdjustmentCents
        ),
        dueHint: `工资周期截止 ${settlement.periodEndOn}`,
        navigationTarget: { view: 'settlements', settlementId: settlement.id, focus: 'confirm' }
      })
    }
  }

  private collectRefundItems(decisionItems: Map<string, V2WorkbenchItem>): void {
    for (const refund of this.dependencies.settlements.listRefunds({ status: 'pending' })) {
      decisionItems.set(`refund:${refund.id}`, {
        id: `refund:${refund.id}`,
        kind: 'refund',
        bucket: 'decision',
        priority: 'high',
        subject: {
          title: '处理兼职退款',
          description: `不合格 ${refund.unqualifiedQuantity} 件 · 已确认工资需单独处理`
        },
        quantityOrAmount: asCurrency(refund.materialRefundCents),
        dueHint: `关联结算 ${refund.originalSettlementId}`,
        navigationTarget: {
          view: 'settlements',
          settlementId: refund.originalSettlementId,
          focus: 'refund'
        }
      })
    }
  }

  private collectAfterSalesItems(decisionItems: Map<string, V2WorkbenchItem>): void {
    for (const item of this.dependencies.afterSales.listCases()) {
      if (item.status === 'resolved' || item.status === 'cancelled') continue
      decisionItems.set(`after-sales:${item.id}`, {
        id: `after-sales:${item.id}`,
        kind: 'after_sales_handling',
        bucket: 'decision',
        priority: 'high',
        subject: { title: '确认售后处理', description: item.reasonDescription },
        quantityOrAmount:
          item.accountingCostCents > 0 ? asCurrency(item.accountingCostCents) : null,
        dueHint: `登记于 ${item.occurredOn}`,
        navigationTarget: { view: 'orders', orderId: item.orderId, orderView: 'after_sales' }
      })
    }
  }

  private collectReimbursementItems(
    generatedOn: string,
    advanceItems: Map<string, V2WorkbenchItem>
  ): void {
    for (const item of this.dependencies.finance.listPendingReimbursements(generatedOn)) {
      advanceItems.set(`reimbursement:${item.financialEntryId}`, {
        id: `reimbursement:${item.financialEntryId}`,
        kind: 'reimbursement',
        bucket: 'advance',
        priority: 'normal',
        subject: {
          title: '处理私人垫付报销',
          description: `${item.advancePayerName ?? '未命名垫付人'} · ${item.categoryName ?? '未分类支出'}`
        },
        quantityOrAmount: asCurrency(item.amountCents),
        dueHint: `垫付日期 ${item.occurredOn}`,
        navigationTarget: {
          view: 'finance',
          financeView: 'reimbursements',
          financialEntryId: item.financialEntryId
        }
      })
    }
  }

  private getFirstUseGuide(input: {
    hasPendingItems: boolean
    orderCount: number
  }): V2WorkbenchFirstUseGuide | null {
    if (input.hasPendingItems || input.orderCount > 0) return null
    if (this.dependencies.orders.listCustomers().length === 0) {
      return {
        title: '先建立客户',
        description: '订单需要关联客户资料，先建立首个客户后再继续。',
        actionLabel: '建立客户',
        navigationTarget: { view: 'customers' }
      }
    }
    if (this.dependencies.orders.listProducts().length === 0) {
      return {
        title: '再建立商品',
        description: '订单需要选择商品，建立首个商品后即可录入订单。',
        actionLabel: '建立商品',
        navigationTarget: { view: 'products' }
      }
    }
    return {
      title: '创建首个订单',
      description: '客户和商品资料已齐全，现在可以录入第一笔订单。',
      actionLabel: '新建订单',
      navigationTarget: { view: 'orders' }
    }
  }

  private sortItems(items: V2WorkbenchItem[]): V2WorkbenchItem[] {
    return items.sort((left, right) => {
      const priorityDifference = priorityRank[left.priority] - priorityRank[right.priority]
      if (priorityDifference !== 0) return priorityDifference
      return left.id.localeCompare(right.id, 'zh-Hans-CN')
    })
  }

  private processLabel(processType: V2WorkAssignment['processType']): string {
    return {
      making: '制作',
      fluffing_bagging: '捏毛装袋',
      edge_sewing: '缝边',
      packing: '打包发货'
    }[processType]
  }
}
