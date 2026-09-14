import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { V2ApplicationRuntime } from './v2-runtime'

const runtimes: V2ApplicationRuntime[] = []

afterEach(() => {
  runtimes.splice(0).forEach((runtime) => runtime.close())
})

describe('V2 大订单端到端验收', () => {
  it('在独立 V2 空库完成多产品、质检返工、分批发货、工资、垫付报销、售后、订单资金和月度经营', async () => {
    const userDataDirectory = await mkdtemp(join(tmpdir(), 'yumi-v2-large-order-'))
    const runtime = new V2ApplicationRuntime(userDataDirectory, '2.0.0')
    runtimes.push(runtime)
    runtime.start()

    const orders = runtime.orderService
    const fulfillment = runtime.fulfillmentService
    const settlements = runtime.settlementService
    const workTimeReviews = runtime.workTimeReviewService
    const finance = runtime.financeService
    const afterSales = runtime.afterSalesService
    const reports = runtime.reportService

    const maker = settlements.createWorker({
      name: '制作兼职',
      hourlyWageCents: 2_000,
      effectiveOn: '2026-09-01'
    })
    const fluffWorker = settlements.createWorker({
      name: '捏毛兼职',
      hourlyWageCents: 2_000,
      effectiveOn: '2026-09-01'
    })
    const customer = orders.createCustomer({ name: '大订单客户', contact: '企业微信' })
    const bear = orders.createProduct({
      name: '奶油小熊',
      basePriceCents: 6_000,
      packagingCostCents: 100,
      accessoryCostCents: 50,
      replacementBagCostCents: 50,
      edgeConsumableCostCents: 80,
      standardMakingMinutes: 12,
      makingCommissionCents: 300
    })
    const fruit = orders.createProduct({
      name: '草莓捏捏',
      basePriceCents: 5_000,
      packagingCostCents: 100,
      accessoryCostCents: 0,
      replacementBagCostCents: 50,
      edgeConsumableCostCents: 0,
      standardMakingMinutes: 10,
      makingCommissionCents: 250
    })
    const order = orders.createOrder({
      customerId: customer.id,
      customer: { name: customer.name, contact: customer.contact },
      items: [
        { productId: bear.id, quantity: 3, unitPriceCents: 6_000 },
        { productId: fruit.id, quantity: 2, unitPriceCents: 5_000 }
      ],
      expectedShipDate: '2026-09-20'
    })
    const [bearItem, fruitItem] = order.items

    orders.recordOrderFund(order.id, {
      businessType: 'payment',
      amountCents: 20_000,
      occurredOn: '2026-09-01',
      paymentMethod: '微信'
    })

    const firstMaking = fulfillment.createWorkAssignment({
      workerId: maker.id,
      assignedOn: '2026-09-02',
      processType: 'making',
      tasks: [{ orderItemId: bearItem.id, sourceType: 'normal_production', plannedQuantity: 3 }]
    })
    const firstMakingResult = fulfillment.submitProcessResult(firstMaking.tasks[0].id, {
      completedQuantity: 3,
      submittedOn: '2026-09-02'
    })
    fulfillment.confirmQualityInspection(firstMakingResult.id, {
      qualifiedQuantity: 2,
      unqualifiedQuantity: 1,
      inspectedOn: '2026-09-03',
      requiresRework: true,
      reasonNote: '表面瑕疵'
    })
    const rework = fulfillment.createWorkAssignment({
      workerId: maker.id,
      assignedOn: '2026-09-03',
      processType: 'making',
      tasks: [{ orderItemId: bearItem.id, sourceType: 'rework', plannedQuantity: 1 }]
    })
    const reworkResult = fulfillment.submitProcessResult(rework.tasks[0].id, {
      completedQuantity: 1,
      submittedOn: '2026-09-03'
    })
    fulfillment.confirmQualityInspection(reworkResult.id, {
      qualifiedQuantity: 1,
      unqualifiedQuantity: 0,
      inspectedOn: '2026-09-04'
    })
    const fruitMaking = fulfillment.createWorkAssignment({
      workerId: maker.id,
      assignedOn: '2026-09-03',
      processType: 'making',
      tasks: [{ orderItemId: fruitItem.id, sourceType: 'normal_production', plannedQuantity: 2 }]
    })
    const fruitMakingResult = fulfillment.submitProcessResult(fruitMaking.tasks[0].id, {
      completedQuantity: 2,
      submittedOn: '2026-09-03'
    })
    fulfillment.confirmQualityInspection(fruitMakingResult.id, {
      qualifiedQuantity: 2,
      unqualifiedQuantity: 0,
      inspectedOn: '2026-09-04'
    })

    const fluffing = fulfillment.createWorkAssignment({
      workerId: fluffWorker.id,
      assignedOn: '2026-09-04',
      processType: 'fluffing_bagging',
      tasks: [
        {
          orderItemId: bearItem.id,
          sourceType: 'normal_production',
          plannedQuantity: 3,
          plannedMinutes: 45,
          pieceRateCents: 60
        },
        {
          orderItemId: fruitItem.id,
          sourceType: 'normal_production',
          plannedQuantity: 2,
          plannedMinutes: 30,
          pieceRateCents: 60
        }
      ]
    })
    // 捏毛装袋完成数量在次日由负责人核算：一条 75 分钟的工时记录登记两个商品。
    const fluffingReview = workTimeReviews.createDraft({
      workerId: fluffWorker.id,
      workedOn: '2026-09-04',
      processType: 'fluffing_bagging',
      approvedMinutes: 75,
      assignmentIds: [fluffing.id],
      items: fluffing.tasks.map((task) => ({
        processTaskId: task.id,
        completedQuantity: task.orderItemId === bearItem.id ? 3 : 2
      }))
    })
    workTimeReviews.confirm(fluffingReview.id)

    const packing = fulfillment.createWorkAssignment({
      workerId: fluffWorker.id,
      assignedOn: '2026-09-05',
      processType: 'packing',
      tasks: [
        {
          orderItemId: bearItem.id,
          sourceType: 'normal_production',
          plannedQuantity: 3,
          plannedMinutes: 30
        },
        {
          orderItemId: fruitItem.id,
          sourceType: 'normal_production',
          plannedQuantity: 2,
          plannedMinutes: 20
        }
      ]
    })
    // 打包发货只按核算时长计个人时薪，不产生计件提成。
    const packingReview = workTimeReviews.createDraft({
      workerId: fluffWorker.id,
      workedOn: '2026-09-05',
      processType: 'packing',
      approvedMinutes: 50,
      assignmentIds: [packing.id],
      items: packing.tasks.map((task) => ({
        processTaskId: task.id,
        completedQuantity: task.orderItemId === bearItem.id ? 3 : 2
      }))
    })
    workTimeReviews.confirm(packingReview.id)

    const firstShipment = orders.createShipment(order.id, {
      shippedOn: '2026-09-06',
      items: [
        { orderItemId: bearItem.id, quantity: 2 },
        { orderItemId: fruitItem.id, quantity: 1 }
      ]
    })
    orders.createShipment(order.id, {
      shippedOn: '2026-09-08',
      items: [
        { orderItemId: bearItem.id, quantity: 1 },
        { orderItemId: fruitItem.id, quantity: 1 }
      ]
    })
    const afterSalesCase = afterSales.createCase({
      orderId: order.id,
      shipmentId: firstShipment.id,
      occurredOn: '2026-09-07',
      reasonDescription: '客户要求加封边',
      customerRequest: '补加封边并换袋',
      responsibilityDescription: '客户定制变更，负责人决定收费',
      handlingDescription: '人工重新包装',
      status: 'resolved',
      customerChargeNote: '已协商收费',
      accountingCostCents: 260
    })
    const charge = orders.recordOrderFund(order.id, {
      businessType: 'after_sales_charge',
      amountCents: 300,
      occurredOn: '2026-09-07',
      note: '售后加封边收费'
    })
    afterSales.linkCharge(afterSalesCase.id, charge.id)
    orders.recordOrderFund(order.id, {
      businessType: 'payment',
      amountCents: 7_700,
      occurredOn: '2026-09-08'
    })

    const expenseCategory = finance.createCategory({ direction: 'expense', name: '售后耗材' })
    const payer = finance.createAdvancePayer({ name: '负责人', note: '私人垫付' })
    const advance = finance.createManualExpense({
      amountCents: 260,
      occurredOn: '2026-09-07',
      categoryId: expenseCategory.id,
      paymentSource: 'private_advance',
      advancePayerId: payer.id,
      note: '售后封边与包装耗材'
    })
    finance.reimburse({
      advanceFinancialEntryId: advance.id,
      reimbursedOn: '2026-09-09',
      note: '整笔报销'
    })

    const makingSettlement = settlements.createDraft({
      workerId: maker.id,
      periodStartOn: '2026-09-02',
      periodEndOn: '2026-09-04'
    })
    const finalizedMakingSettlement = settlements.updateDraft(makingSettlement.id, {
      finalPaidAmountCents: 2_000,
      paidOn: '2026-09-09',
      managerNote: '按负责人最终决定发放'
    })
    settlements.confirm(finalizedMakingSettlement.id)
    const fluffSettlement = settlements.createDraft({
      workerId: fluffWorker.id,
      periodStartOn: '2026-09-04',
      periodEndOn: '2026-09-05'
    })
    const finalizedFluffSettlement = settlements.updateDraft(fluffSettlement.id, {
      finalPaidAmountCents: 1_800,
      paidOn: '2026-09-09',
      managerNote: '捏毛与打包工资'
    })
    settlements.confirm(finalizedFluffSettlement.id)

    expect(fulfillment.getOrderItemFulfillment(bearItem.id).stages).toMatchObject({
      shipped: 3,
      readyToShip: 0
    })
    expect(fulfillment.getOrderItemFulfillment(fruitItem.id).stages).toMatchObject({
      shipped: 2,
      readyToShip: 0
    })
    expect(settlements.listSettlements({ status: 'confirmed' })).toHaveLength(2)
    expect(finance.listPendingReimbursements('2026-09-09')).toEqual([])
    expect(afterSales.getCase(afterSalesCase.id)).toMatchObject({
      chargeFinancialEntryIds: [charge.id],
      accountingCostCents: 260
    })
    expect(orders.getOrder(order.id)).toMatchObject({
      amount: { currentAmountCents: 28_000 },
      funds: { netReceivedCents: 28_000, outstandingCents: 0 }
    })
    expect(reports.getFulfillmentProgress().totalShippedQuantity).toBe(5)
    expect(reports.listConfirmedSettlements().totalFinalPaidCents).toBe(3_800)
    expect(reports.getMonthlyOperation('2026-09')).toMatchObject({
      incomeCents: 28_000,
      operatingExpenseCents: 4_060,
      operatingResultCents: 23_940,
      confirmedSettlementPaidCents: 3_800
    })
  })
})
