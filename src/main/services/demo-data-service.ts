import { addDays, format } from 'date-fns'
import { DomainValidationError } from '@main/domain/errors'
import { StudioRepository } from '@main/repositories/studio-repository'
import type { DemoDataSummary, ShiftInput } from '@shared/contracts'
import { StudioService } from './studio-service'

/**
 * 创建一组用于首轮验收和展示的本地数据。
 * 为避免误写真实数据，仅允许在尚无商品、订单和人员的数据库中执行一次。
 */
export class DemoDataService {
  constructor(
    private readonly studio: StudioService,
    private readonly repository: StudioRepository,
    private readonly currentDate = new Date()
  ) {}

  load(): DemoDataSummary {
    this.assertEmptyBusinessData()
    const today = format(this.currentDate, 'yyyy-MM-dd')
    const completedDate = today
    const scheduledDate = format(addDays(this.currentDate, 1), 'yyyy-MM-dd')

    this.studio.updateCostSettings({
      gluePriceCentsPerGram: 18,
      effectiveFrom: today
    })
    this.studio.updateOrderDefaults({ defaultReserveDays: 2 })

    const bear = this.studio.createProduct({
      name: '奶油小熊',
      code: 'DEMO-BEAR',
      category: '动物捏捏',
      basePriceCents: 3900,
      edgePriceCents: 300,
      weightGrams: 20,
      lossRate: 0.1,
      standardMinutesPerUnit: 30,
      packagingCostCents: 100,
      accessoryCostCents: 80,
      replacementBagCostCents: 30,
      commissionCentsPerUnit: 200,
      moldCount: 20,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 2,
      notes: '演示：缝边按 3 元/个计算。'
    })
    const toast = this.studio.createProduct({
      name: '云朵吐司',
      code: 'DEMO-TOAST',
      category: '食物捏捏',
      basePriceCents: 4900,
      edgePriceCents: 500,
      weightGrams: 28,
      lossRate: 0.12,
      standardMinutesPerUnit: 40,
      packagingCostCents: 150,
      accessoryCostCents: 120,
      replacementBagCostCents: 40,
      commissionCentsPerUnit: 300,
      moldCount: 2,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 1,
      notes: '演示：每日产能只有 2 个，用于显示模具超载风险。'
    })

    const lin = this.studio.createWorker({
      name: '小林',
      phone: '13800000001',
      hourlyWageCents: 2800,
      defaultWorkStart: '09:00',
      defaultWorkEnd: '18:00'
    })
    const li = this.studio.createWorker({
      name: '阿梨',
      phone: '13800000002',
      hourlyWageCents: 3000,
      defaultWorkStart: '13:00',
      defaultWorkEnd: '20:00'
    })

    const multiProductOrder = this.studio.createOrder({
      customer: {
        name: '林小姐',
        contact: '微信：lin-demo',
        defaultAddress: '演示地址，请勿发货'
      },
      expectedShipDate: format(addDays(this.currentDate, 6), 'yyyy-MM-dd'),
      reserveDays: 2,
      notes: '演示：包含两个商品、两次收款及一次退款。',
      items: [
        { productId: bear.id, quantity: 8, edgeEnabled: true, edgeQuantity: 5 },
        { productId: toast.id, quantity: 3, edgeEnabled: true, edgeQuantity: 3 }
      ]
    })
    this.studio.recordPayment({
      orderId: multiProductOrder.id,
      type: 'receipt',
      amountCents: 7000,
      paymentMethod: '微信',
      paidAt: today,
      note: '首笔定金'
    })
    this.studio.recordPayment({
      orderId: multiProductOrder.id,
      type: 'receipt',
      amountCents: 3000,
      paymentMethod: '支付宝',
      paidAt: today,
      note: '补款'
    })
    this.studio.recordPayment({
      orderId: multiProductOrder.id,
      type: 'refund',
      amountCents: 500,
      paymentMethod: '微信',
      paidAt: today,
      note: '缝边调整退款'
    })
    // 发货记录由用户逐次录入；这里仅提供两次演示记录，汇总由系统计算。
    this.studio.createShipment({
      orderId: multiProductOrder.id,
      shippedAt: today,
      notes: '演示第一次发货',
      items: [
        { orderItemId: multiProductOrder.items[0]!.id, quantity: 2 },
        { orderItemId: multiProductOrder.items[1]!.id, quantity: 1 }
      ]
    })
    this.studio.createShipment({
      orderId: multiProductOrder.id,
      shippedAt: scheduledDate,
      notes: '演示第二次发货',
      items: [
        { orderItemId: multiProductOrder.items[0]!.id, quantity: 1 },
        { orderItemId: multiProductOrder.items[1]!.id, quantity: 1 }
      ]
    })

    const capacityOrder = this.studio.createOrder({
      customer: { name: '周同学', contact: '微信：zhou-demo' },
      expectedShipDate: format(addDays(this.currentDate, 4), 'yyyy-MM-dd'),
      reserveDays: 1,
      notes: '演示：同日计划量超过云朵吐司模具日产能。',
      items: [{ productId: toast.id, quantity: 5, edgeEnabled: false }]
    })

    const completedShift = this.saveShiftWithAllRisks({
      workerId: lin.id,
      shiftDate: completedDate,
      extraMinutes: 25,
      tasks: [{ orderItemId: multiProductOrder.items[0]!.id, plannedQuantity: 4 }]
    })
    const completedTask = this.studio.getShiftDetail(completedShift.id)!.tasks[0]!
    this.studio.updateShiftStatus({
      shiftId: completedShift.id,
      status: 'completed',
      taskCompletions: [{ shiftTaskId: completedTask.id, qualifiedQuantity: 3, unqualifiedQuantity: 1 }]
    })

    const absentShift = this.saveShiftWithAllRisks({
      workerId: li.id,
      shiftDate: scheduledDate,
      extraMinutes: 15,
      tasks: [{ orderItemId: capacityOrder.items[0]!.id, plannedQuantity: 2 }]
    })
    this.studio.updateShiftStatus({ shiftId: absentShift.id, status: 'absent' })

    this.saveShiftWithAllRisks({
      workerId: lin.id,
      shiftDate: scheduledDate,
      extraMinutes: 15,
      tasks: [{ orderItemId: capacityOrder.items[0]!.id, plannedQuantity: 3 }]
    })

    return {
      products: 2,
      orders: 2,
      workers: 2,
      shifts: 3,
      generatedAt: new Date().toISOString()
    }
  }

  private saveShiftWithAllRisks(input: ShiftInput) {
    const preview = this.studio.previewShift(input)
    return this.studio.saveShift({
      ...input,
      confirmedWarningCodes: preview.risks.map((risk) => risk.code)
    })
  }

  private assertEmptyBusinessData(): void {
    if (
      this.repository.listProducts().length > 0 ||
      this.repository.listOrders().length > 0 ||
      this.repository.listWorkers().length > 0
    ) {
      throw new DomainValidationError('已有业务数据，不能加载演示数据')
    }
  }
}
