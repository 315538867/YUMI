import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { calculateTimedWageCents } from '@main/domain/settlement'
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

    runtime.studioSettingsService.update({
      materialPriceMicroYuanPerGram: 3_400,
      orderReservedDays: 2
    })
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
      unitWeightMilligrams: 25_000,
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
      unitWeightMilligrams: 0,
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

    // 制作一次核算：实际产出 3 件、合格 2 件，1 件不合格只留在待制作并形成材料扣款。
    const firstMaking = fulfillment.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: maker.id,
      assignedOn: '2026-09-02',
      processType: 'making',
      tasks: [{ orderItemId: bearItem.id, sourceType: 'normal_production', plannedQuantity: 3 }]
    })
    const firstMakingResult = fulfillment.reviewMaking({
      processTaskId: firstMaking.tasks[0]!.id,
      completedQuantity: 3,
      qualifiedQuantity: 2,
      reviewedOn: '2026-09-02'
    })
    expect(firstMakingResult).toMatchObject({
      status: 'confirmed',
      completedQuantity: 3
    })
    expect(fulfillment.getWorkAssignment(firstMaking.id)!.tasks[0]!.reviewSummary).toMatchObject({
      qualifiedQuantity: 2,
      unqualifiedQuantity: 1,
      unfinishedQuantity: 0
    })
    // 返工：不合格的 1 件重新排制作任务并一次核算合格。
    const rework = fulfillment.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: maker.id,
      assignedOn: '2026-09-03',
      processType: 'making',
      tasks: [{ orderItemId: bearItem.id, sourceType: 'rework', plannedQuantity: 1 }]
    })
    fulfillment.reviewMaking({
      processTaskId: rework.tasks[0]!.id,
      completedQuantity: 1,
      qualifiedQuantity: 1,
      reviewedOn: '2026-09-03'
    })
    const fruitMaking = fulfillment.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: maker.id,
      assignedOn: '2026-09-03',
      processType: 'making',
      tasks: [{ orderItemId: fruitItem.id, sourceType: 'normal_production', plannedQuantity: 2 }]
    })
    fulfillment.reviewMaking({
      processTaskId: fruitMaking.tasks[0]!.id,
      completedQuantity: 2,
      qualifiedQuantity: 2,
      reviewedOn: '2026-09-03'
    })
    expect(fulfillment.getOrderItemFulfillment(bearItem.id).stages).toMatchObject({
      making: 0,
      fluffingBagging: 3
    })
    expect(fulfillment.getOrderItemFulfillment(fruitItem.id).stages).toMatchObject({
      making: 0,
      fluffingBagging: 2
    })

    // 捏毛装袋：一条 75 分钟的计时班次核算登记两个商品。
    const fluffing = fulfillment.createWorkAssignment({
      scheduleMode: 'timed_shift',
      workerId: fluffWorker.id,
      assignedOn: '2026-09-04',
      processType: 'fluffing_bagging'
    })
    const fluffingReview = workTimeReviews.review({
      workAssignmentId: fluffing.id,
      startedAt: '2026-09-04T09:00',
      endedAt: '2026-09-04T10:15',
      items: [
        { orderItemId: bearItem.id, completedQuantity: 3 },
        { orderItemId: fruitItem.id, completedQuantity: 2 }
      ]
    })
    expect(fluffingReview).toMatchObject({ approvedMinutes: 75, workedOn: '2026-09-04' })

    // 打包发货：一次核算 50 分钟登记两个商品，打包只按核算时长计个人时薪。
    const packing = fulfillment.createWorkAssignment({
      scheduleMode: 'timed_shift',
      workerId: fluffWorker.id,
      assignedOn: '2026-09-05',
      processType: 'packing'
    })
    const packingReview = workTimeReviews.review({
      workAssignmentId: packing.id,
      startedAt: '2026-09-05T09:00',
      endedAt: '2026-09-05T09:50',
      items: [
        { orderItemId: bearItem.id, completedQuantity: 3 },
        { orderItemId: fruitItem.id, completedQuantity: 2 }
      ]
    })
    expect(packingReview.approvedMinutes).toBe(50)
    expect(packingReview.items.every((item) => item.pieceRateCentsSnapshot === 0)).toBe(true)

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

    // 制作工资：合格 2 + 返工 1 件按冻结提成，1 件不合格扣冻结材料成本 9 分。
    const makingSettlement = settlements.createDraft({
      workerId: maker.id,
      periodStartOn: '2026-09-02',
      periodEndOn: '2026-09-04'
    })
    expect(makingSettlement).toMatchObject({
      timedWageCents: 0,
      commissionCents: 2 * 300 + 1 * 300 + 2 * 250,
      materialDeductionCents: 9,
      candidateWageCents: 1_400 - 9
    })
    expect(makingSettlement.makingSources).toHaveLength(3)
    const finalizedMakingSettlement = settlements.updateDraft(makingSettlement.id, {
      finalPaidAmountCents: 2_000,
      paidOn: '2026-09-09',
      managerNote: '按负责人最终决定发放'
    })
    settlements.confirm(finalizedMakingSettlement.id)

    // 捏毛与打包工资：按核算分钟计个人时薪，商品提成为零。
    const fluffSettlement = settlements.createDraft({
      workerId: fluffWorker.id,
      periodStartOn: '2026-09-04',
      periodEndOn: '2026-09-05'
    })
    expect(fluffSettlement).toMatchObject({
      timedWageCents:
        calculateTimedWageCents({ minutes: 75, hourlyWageCents: 2_000 }) +
        calculateTimedWageCents({ minutes: 50, hourlyWageCents: 2_000 }),
      commissionCents: 0,
      materialDeductionCents: 0
    })
    expect(fluffSettlement.timedSources.map((source) => source.processType)).toEqual([
      'fluffing_bagging',
      'packing'
    ])
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
