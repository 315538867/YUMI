import { isValid, parseISO } from 'date-fns'
import * as XLSX from 'xlsx'
import { z } from 'zod'
import { calculateDailyCapacity, calculateProductCost } from '@main/domain/costing'
import { DomainValidationError } from '@main/domain/errors'
import { calculateProductionDeadline } from '@main/domain/orders'
import {
  createOrderSheetWorkbook,
  createShipmentManifestWorkbook
} from '@main/services/export-document-workbook'
import { StudioRepository } from '@main/repositories/studio-repository'
import type {
  CostSettingsInput,
  CustomerInput,
  CustomerManagementQuery,
  CustomerUpdateInput,
  OrderCreateInput,
  OrderDefaults,
  OrderProductionStatusInput,
  OrderUpdateInput,
  OrderSheetExportInput,
  ShipmentManifestExportInput,
  PaymentRecordInput,
  ProductionRecordInput,
  ProductCostPreview,
  ProductCostPreviewInput,
  ProductCreateInput,
  ShiftInput,
  ShiftUpdateInput,
  ShiftStatusInput,
  ShipmentCreateInput,
  ShipmentUpdateInput,
  ProductUpdateInput,
  OrderProfitReport,
  OrderProfitReportQuery,
  WorkerCreateInput,
  WorkerSettlementReport,
  WorkerSettlementReportQuery,
  CapacityRiskReport,
  CapacityRiskReportQuery,
  MonthlyProductionWeightQuery,
  MonthlyProductionWeightReport,
  ReportExportInput,
  WorkerUpdateInput
} from '@shared/contracts'

const nonNegativeInteger = z.number().int().nonnegative('金额或数量不能为负数')
const positiveInteger = z.number().int().positive('数值必须大于 0')
const optionalText = z.string().trim().max(500).nullish()
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期必须为 YYYY-MM-DD')
const productBaseSchema = z.object({
  name: z.string().trim().min(1, '商品名称不能为空').max(100, '商品名称不能超过 100 个字符'),
  code: z.string().trim().max(100, '商品编码不能超过 100 个字符').nullish(),
  category: z.string().trim().max(100, '商品分类不能超过 100 个字符').nullish(),
  basePriceCents: nonNegativeInteger,
  edgePriceCents: nonNegativeInteger,
  weightGrams: z.number().nonnegative('单件重量不能为负数'),
  lossRate: z.number().min(0, '损耗率不能为负数').lt(1, '损耗率必须小于 100%'),
  standardMinutesPerUnit: z.number().nonnegative('标准制作时长不能为负数'),
  packagingCostCents: nonNegativeInteger,
  accessoryCostCents: nonNegativeInteger.optional().default(0),
  replacementBagCostCents: nonNegativeInteger.optional().default(0),
  fluffPackingCostCents: nonNegativeInteger.optional().default(0),
  edgeCostCents: nonNegativeInteger.optional().default(0),
  commissionCentsPerUnit: nonNegativeInteger,
  moldCount: positiveInteger,
  outputPerMoldPerBatch: positiveInteger,
  maxBatchesPerDay: positiveInteger,
  imagePath: optionalText,
  notes: optionalText
})
const productCreateSchema = productBaseSchema
const productCostPreviewSchema = productBaseSchema.extend({
  quantity: positiveInteger,
  edgeEnabled: z.boolean(),
  edgeQuantity: nonNegativeInteger
})
const productUpdateSchema = productBaseSchema.extend({
  id: z.string().uuid('商品 ID 无效'),
  enabled: z.boolean()
})
const costSettingsSchema = z.object({
  gluePriceMilliYuanPerGram: nonNegativeInteger,
  defaultHourlyWageCents: z
    .number()
    .int('默认兼职时薪必须是非负整数')
    .nonnegative('默认兼职时薪必须是非负整数')
    .optional()
    .default(0),
  effectiveFrom: dateText
})
const orderDefaultsSchema = z.object({ defaultReserveDays: nonNegativeInteger })
const customerInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '客户昵称或姓名不能为空')
    .max(100, '客户昵称或姓名不能超过 100 个字符'),
  contact: optionalText,
  defaultAddress: optionalText,
  notes: optionalText
})
const customerUpdateSchema = customerInputSchema.extend({ id: z.string().uuid('客户 ID 无效') })
const orderCustomerSchema = customerInputSchema
  .omit({ notes: true })
  .extend({ id: z.string({ required_error: '请先选择已有客户' }).uuid('客户 ID 无效') })
const customerManagementQuerySchema = z.object({ keyword: z.string().trim().max(100).optional() })
const orderItemSchema = z.object({
  id: z.string().uuid('订单商品明细 ID 无效').optional(),
  productId: z.string().uuid('商品 ID 无效'),
  quantity: positiveInteger,
  unitPriceCents: nonNegativeInteger.optional(),
  edgeEnabled: z.boolean().optional(),
  edgeQuantity: nonNegativeInteger.optional(),
  edgePriceCents: nonNegativeInteger.optional(),
  discountCents: nonNegativeInteger.optional()
})
const orderCreateSchema = z.object({
  customer: orderCustomerSchema,
  expectedShipDate: dateText,
  reserveDays: nonNegativeInteger.optional(),
  discountCents: nonNegativeInteger.optional(),
  notes: optionalText,
  items: z.array(orderItemSchema).min(1, '订单至少需要一个商品明细')
})
const orderUpdateSchema = orderCreateSchema.extend({ id: z.string().uuid('订单 ID 无效') })
const shipmentItemSchema = z.object({
  orderItemId: z.string().uuid('订单商品明细 ID 无效'),
  quantity: nonNegativeInteger
})
const shipmentBaseSchema = z.object({
  orderId: z.string().uuid('订单 ID 无效'),
  shippedAt: dateText,
  notes: optionalText,
  items: z.array(shipmentItemSchema).min(1, '发货至少需要一个商品明细')
})

function withUniqueShipmentItems<T extends z.ZodType<{ items: Array<{ orderItemId: string }> }>>(
  schema: T
): z.ZodEffects<T> {
  return schema.superRefine((input, context) => {
    const orderItemIds = new Set<string>()
    input.items.forEach((item, index) => {
      if (orderItemIds.has(item.orderItemId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'orderItemId'],
          message: '同一订单商品只能填写一次本次发货数量'
        })
      orderItemIds.add(item.orderItemId)
    })
  })
}

const shipmentSchema = withUniqueShipmentItems(shipmentBaseSchema)
const shipmentUpdateSchema = withUniqueShipmentItems(
  shipmentBaseSchema.extend({ id: z.string().uuid('发货记录 ID 无效') })
)

const orderSheetExportSchema = z.object({
  orderId: z.string().uuid('订单 ID 无效')
})

const shipmentManifestExportSchema = z.object({
  orderId: z.string().uuid('订单 ID 无效'),
  shipmentId: z.string().uuid('发货记录 ID 无效')
})

const paymentSchema = z.object({
  orderId: z.string().uuid('订单 ID 无效'),
  type: z.enum(['receipt', 'refund']),
  amountCents: positiveInteger,
  paymentMethod: z
    .string()
    .trim()
    .min(1, '收退款方式不能为空')
    .max(50, '收退款方式不能超过 50 个字符'),
  paidAt: dateText,
  note: optionalText,
  receiptAttachmentId: z.string().uuid('凭证 ID 无效').nullish()
})
const orderProductionStatusSchema = z.object({
  orderId: z.string().uuid('订单 ID 无效'),
  productionStatus: z.enum([
    'pending_confirmation',
    'pending_schedule',
    'in_production',
    'pending_shipment',
    'completed',
    'cancelled'
  ])
})
const shiftTaskSchema = z.object({
  orderItemId: z.string().uuid('订单商品明细 ID 无效'),
  plannedQuantity: positiveInteger
})
const shiftSchema = z.object({
  workerId: z.string().uuid('兼职人员 ID 无效'),
  shiftDate: dateText,
  extraMinutes: nonNegativeInteger.optional().default(0),
  tasks: z.array(shiftTaskSchema).min(1, '排班至少需要一个订单商品任务'),
  confirmedWarningCodes: z
    .array(z.enum(['MOLD_DAILY_CAPACITY_EXCEEDED', 'DEADLINE_RISK', 'ORDER_QUANTITY_EXCEEDED']))
    .optional()
})
const shiftUpdateSchema = shiftSchema.extend({ id: z.string().uuid('排班 ID 无效') })
const shiftTaskCompletionSchema = z.object({
  shiftTaskId: z.string().uuid('排班任务 ID 无效'),
  qualifiedQuantity: nonNegativeInteger,
  unqualifiedQuantity: nonNegativeInteger
})
const shiftStatusSchema = z
  .object({
    shiftId: z.string().uuid('排班 ID 无效'),
    status: z.enum(['scheduled', 'leave', 'absent', 'late', 'cancelled', 'completed']),
    taskCompletions: z.array(shiftTaskCompletionSchema).optional()
  })
  .superRefine((value, context) => {
    if (value.status === 'completed' && !value.taskCompletions) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: '标记已完成时必须填写每个任务的合格与不合格数量',
        path: ['taskCompletions']
      })
    }
  })
const productionRecordSchema = z.object({
  shiftTaskId: z.string().uuid('排班任务 ID 无效'),
  actualMinutes: z.number().int().nonnegative('实际制作分钟不能为负数'),
  qualifiedQuantity: nonNegativeInteger,
  reworkQuantity: nonNegativeInteger,
  scrapQuantity: nonNegativeInteger
})
const workerSchema = z.object({
  name: z.string().trim().min(1, '兼职人员姓名不能为空'),
  hourlyWageCents: nonNegativeInteger,
  phone: z.string().trim().optional(),
  defaultWorkStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  defaultWorkEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
})
const workerUpdateSchema = workerSchema.extend({
  id: z.string().uuid('兼职人员 ID 无效'),
  active: z.boolean(),
  effectiveFrom: dateText
})

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new DomainValidationError(parsed.error.issues[0].message)
  return parsed.data
}

interface ProductImageAttachmentCleaner {
  deleteProductImageByStoragePath(storagePath: string): boolean
}

export class StudioService {
  constructor(
    private readonly repository: StudioRepository,
    private readonly productImageAttachments?: ProductImageAttachmentCleaner
  ) {}

  createProduct(input: ProductCreateInput) {
    return this.repository.createProduct(validate(productCreateSchema, input))
  }

  updateProduct(input: ProductUpdateInput) {
    const parsed = validate(productUpdateSchema, input)
    const previous = this.repository.getProduct(parsed.id)
    const product = this.repository.updateProduct(parsed)
    if (!product) throw new DomainValidationError('商品不存在或已被删除')
    if (previous?.imagePath && previous.imagePath !== product.imagePath)
      this.productImageAttachments?.deleteProductImageByStoragePath(previous.imagePath)
    return product
  }

  previewProductCost(input: ProductCostPreviewInput): ProductCostPreview {
    const parsed = validate(productCostPreviewSchema, input)
    if (parsed.edgeQuantity > parsed.quantity)
      throw new DomainValidationError('缝边数量不能超过制作数量')
    const settings = this.repository.getCostSettings()
    const result = calculateProductCost({
      quantity: parsed.quantity,
      weightGrams: parsed.weightGrams,
      lossRate: parsed.lossRate,
      gluePricePerGram: settings.gluePriceMilliYuanPerGram / 1000,
      packagingCostPerUnit: parsed.packagingCostCents / 100,
      accessoryCostPerUnit: parsed.accessoryCostCents / 100,
      replacementBagCostPerUnit: parsed.replacementBagCostCents / 100,
      fluffPackingCostPerUnit: parsed.fluffPackingCostCents / 100,
      edgeCostPerUnit: parsed.edgeCostCents / 100,
      standardMinutesPerUnit: parsed.standardMinutesPerUnit,
      hourlyLaborCost: settings.defaultHourlyWageCents / 100,
      commissionPerUnit: parsed.commissionCentsPerUnit / 100,
      edgeEnabled: parsed.edgeEnabled,
      edgeQuantity: parsed.edgeQuantity,
      edgePricePerUnit: parsed.edgePriceCents / 100
    })
    return {
      appliedHourlyWageCents: settings.defaultHourlyWageCents,
      glueGrams: result.glueGrams,
      glueCostCents: Math.round(result.glueCost * 100),
      packagingCostCents: Math.round(result.packagingCost * 100),
      accessoryCostCents: Math.round(result.accessoryCost * 100),
      replacementBagCostCents: Math.round(result.replacementBagCost * 100),
      fluffPackingCostCents: Math.round(result.fluffPackingCost * 100),
      edgeCostCents: Math.round(result.edgeCost * 100),
      laborMinutes: Math.round(result.laborHours * 60),
      laborCostCents: Math.round(result.laborCost * 100),
      commissionCostCents: Math.round(result.commissionCost * 100),
      edgeRevenueCents: Math.round(result.edgeRevenue * 100),
      totalCostCents: Math.round(result.totalCost * 100),
      dailyCapacity: calculateDailyCapacity({
        moldCount: parsed.moldCount,
        outputPerMoldPerBatch: parsed.outputPerMoldPerBatch,
        maxBatchesPerDay: parsed.maxBatchesPerDay
      })
    }
  }

  updateCostSettings(input: CostSettingsInput) {
    return this.repository.updateCostSettings(validate(costSettingsSchema, input))
  }

  updateOrderDefaults(input: OrderDefaults) {
    return this.repository.updateOrderDefaults(validate(orderDefaultsSchema, input))
  }

  createCustomer(input: CustomerInput) {
    return this.repository.createCustomer(validate(customerInputSchema, input))
  }

  updateCustomer(input: CustomerUpdateInput) {
    const customer = this.repository.updateCustomer(validate(customerUpdateSchema, input))
    if (!customer) throw new DomainValidationError('客户不存在或已被删除')
    return customer
  }

  deleteCustomer(customerId: string) {
    if (!z.string().uuid().safeParse(customerId).success)
      throw new DomainValidationError('客户 ID 无效')
    if (!this.repository.deleteCustomer(customerId))
      throw new DomainValidationError('客户不存在或已被删除')
  }

  listCustomerManagement(input: CustomerManagementQuery = {}) {
    return this.repository.listCustomerManagement(validate(customerManagementQuerySchema, input))
  }

  getCustomerDetail(customerId: string) {
    if (!z.string().uuid().safeParse(customerId).success)
      throw new DomainValidationError('客户 ID 无效')
    return this.repository.getCustomerDetail(customerId)
  }

  listCustomerOrderHistory(customerId: string) {
    if (!z.string().uuid().safeParse(customerId).success)
      throw new DomainValidationError('客户 ID 无效')
    return this.repository.listCustomerOrderHistory(customerId)
  }

  queryOrderProfitReport(input: OrderProfitReportQuery): OrderProfitReport {
    const parsed = validate(
      z.object({
        fromDate: dateText,
        toDate: dateText,
        productionStatus: z
          .union([
            z.enum([
              'pending_confirmation',
              'pending_schedule',
              'in_production',
              'pending_shipment',
              'completed',
              'cancelled'
            ]),
            z.literal('all')
          ])
          .optional(),
        outstandingOnly: z.boolean().optional()
      }),
      input
    )
    if (parsed.fromDate > parsed.toDate)
      throw new DomainValidationError('报表开始日期不能晚于结束日期')
    return this.repository.queryOrderProfitReport(parsed)
  }

  queryWorkerSettlementReport(input: WorkerSettlementReportQuery): WorkerSettlementReport {
    const parsed = validate(
      z.object({
        fromDate: dateText,
        toDate: dateText
      }),
      input
    )
    if (parsed.fromDate > parsed.toDate)
      throw new DomainValidationError('结算报表开始日期不能晚于结束日期')
    return this.repository.queryWorkerSettlementReport(parsed)
  }

  queryMonthlyProductionWeight(input: MonthlyProductionWeightQuery): MonthlyProductionWeightReport {
    const parsed = validate(
      z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, '月份必须为 YYYY-MM') }),
      input
    )
    return this.repository.queryMonthlyProductionWeight(parsed)
  }

  queryCapacityRiskReport(input: CapacityRiskReportQuery): CapacityRiskReport {
    const parsed = validate(
      z.object({
        fromDate: dateText,
        toDate: dateText
      }),
      input
    )
    if (parsed.fromDate > parsed.toDate)
      throw new DomainValidationError('产能风险报表开始日期不能晚于结束日期')
    return this.repository.queryCapacityRiskReport(parsed)
  }

  exportReport(input: ReportExportInput): Uint8Array {
    const parsed = validate(
      z.object({
        kind: z.enum(['orders', 'workers', 'capacity']),
        fromDate: dateText,
        toDate: dateText,
        productionStatus: z
          .union([
            z.enum([
              'pending_confirmation',
              'pending_schedule',
              'in_production',
              'pending_shipment',
              'completed',
              'cancelled'
            ]),
            z.literal('all')
          ])
          .optional(),
        outstandingOnly: z.boolean().optional()
      }),
      input
    )
    if (parsed.fromDate > parsed.toDate)
      throw new DomainValidationError('导出开始日期不能晚于结束日期')
    const workbook = XLSX.utils.book_new()
    if (parsed.kind === 'orders') {
      const report = this.repository.queryOrderProfitReport(parsed)
      const rows = report.rows.map((row) => ({
        订单号: row.code,
        客户: row.customerName,
        预计发货: row.expectedShipDate,
        制作状态: row.productionStatus,
        财务状态: row.financialStatus,
        应收: row.receivableCents,
        已收净额: row.receivedNetCents,
        待收: row.outstandingCents,
        预计成本: row.estimatedCostCents,
        实际成本: row.actualCostCents,
        预计利润: row.estimatedProfitCents,
        实际利润: row.actualProfitCents
      }))
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), '订单资金与利润')
    } else if (parsed.kind === 'workers') {
      const report = this.repository.queryWorkerSettlementReport(parsed)
      const rows = report.rows.map((row) => ({
        兼职人员: row.workerName,
        实际工时分钟: row.actualMinutes,
        合格完成数量: row.qualifiedQuantity,
        时薪成本: row.laborCostCents,
        按件提成: row.commissionCostCents,
        缺勤次数: row.absenceCount
      }))
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), '兼职人员结算')
    } else {
      const report = this.repository.queryCapacityRiskReport(parsed)
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          report.products.map((row) => ({
            商品: row.productName,
            预计单位成本: row.estimatedCostPerUnitCents,
            日产能: row.dailyCapacity,
            计划数量: row.plannedQuantity,
            合格完成: row.qualifiedQuantity
          }))
        ),
        '商品产能'
      )
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          report.daily.map((row) => ({
            日期: row.date,
            商品: row.productName,
            计划数量: row.plannedQuantity,
            合格完成: row.qualifiedQuantity,
            日产能: row.dailyCapacity,
            待补排: row.pendingScheduleQuantity
          }))
        ),
        '每日计划'
      )
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          report.risks.map((row) => ({
            订单号: row.orderCode,
            客户: row.customerName,
            预计发货: row.expectedShipDate,
            制作截止: row.productionDeadline,
            剩余数量: row.remainingQuantity,
            待补排数量: row.pendingScheduleQuantity,
            风险原因: row.riskReasons.join('；')
          }))
        ),
        '交期风险'
      )
    }
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array
  }

  getOrderShipmentSummary(orderId: string) {
    if (!z.string().uuid().safeParse(orderId).success)
      throw new DomainValidationError('订单 ID 无效')
    return this.repository.getOrderShipmentSummary(orderId)
  }

  listShipments(orderId: string) {
    if (!z.string().uuid().safeParse(orderId).success)
      throw new DomainValidationError('订单 ID 无效')
    return this.repository.listShipments(orderId)
  }

  createShipment(input: ShipmentCreateInput) {
    return this.repository.createShipment(validate(shipmentSchema, input))
  }

  updateShipment(input: ShipmentUpdateInput) {
    return this.repository.updateShipment(validate(shipmentUpdateSchema, input))
  }

  async exportOrderSheet(input: OrderSheetExportInput): Promise<Uint8Array> {
    const parsed = validate(orderSheetExportSchema, input)
    const order = this.repository.getOrderDetail(parsed.orderId)
    if (!order) throw new DomainValidationError('订单不存在')
    const imagePathByProductId = new Map(
      order.items.map((item) => [
        item.productId,
        this.repository.getProduct(item.productId)?.imagePath ?? null
      ])
    )
    const rows = order.items.map((item) => {
      const unitPrice = item.unitPriceCents / 100
      const packagingFee = item.productSnapshot.packagingCostCents / 100
      const replacementBagFee = item.productSnapshot.replacementBagCostCents / 100
      const totalUnitPrice = unitPrice + packagingFee + replacementBagFee
      return {
        productId: item.productId,
        productName: item.productSnapshot.name,
        weightGrams: item.productSnapshot.weightGrams,
        unitPrice,
        packagingFee,
        replacementBagFee,
        totalUnitPrice,
        quantity: item.quantity,
        totalAmount: totalUnitPrice * item.quantity,
        notes: order.notes ?? ''
      }
    })
    return createOrderSheetWorkbook({
      customerName: order.customer.name,
      contact: order.customer.contact ?? '',
      address: order.customer.defaultAddress ?? '',
      createdAt: order.createdAt,
      rows,
      imagePathByProductId
    })
  }

  async exportShipmentManifest(input: ShipmentManifestExportInput): Promise<Uint8Array> {
    const parsed = validate(shipmentManifestExportSchema, input)
    const order = this.repository.getOrderDetail(parsed.orderId)
    if (!order) throw new DomainValidationError('订单不存在')
    const shipment = this.repository
      .listShipments(order.id)
      .find((item) => item.id === parsed.shipmentId)
    if (!shipment) throw new DomainValidationError('发货记录不存在或不属于当前订单')
    const manifestSnapshot = this.repository.getShipmentManifestSnapshot(shipment.id)
    if (!manifestSnapshot) throw new DomainValidationError('发货记录不存在')
    return createShipmentManifestWorkbook({
      customerName: manifestSnapshot.customerName,
      shippedAt: manifestSnapshot.shippedAt,
      notes: manifestSnapshot.notes,
      rows: manifestSnapshot.rows.map((row) => ({
        productId: row.productId,
        productName: row.productName,
        orderedQuantity: row.orderedQuantity,
        shipmentQuantity: row.shipmentQuantity,
        pendingQuantity: row.pendingQuantity,
        notes: manifestSnapshot.notes
      })),
      imagePathByProductId: new Map(
        manifestSnapshot.rows.map((row) => [row.productId, row.imagePath])
      )
    })
  }

  createOrder(input: OrderCreateInput) {
    const parsed = validate(orderCreateSchema, input)
    if (!this.repository.getCustomer(parsed.customer.id))
      throw new DomainValidationError('客户不存在')
    if (parsed.reserveDays !== undefined)
      calculateProductionDeadline(parsed.expectedShipDate, parsed.reserveDays)
    for (const item of parsed.items) {
      if (
        item.edgeEnabled &&
        item.edgeQuantity !== undefined &&
        item.edgeQuantity > item.quantity
      ) {
        throw new DomainValidationError('缝边数量不能超过商品数量')
      }
    }
    return this.repository.createOrder(parsed)
  }

  updateOrder(input: OrderUpdateInput) {
    const parsed = validate(orderUpdateSchema, input)
    if (!this.repository.getCustomer(parsed.customer.id))
      throw new DomainValidationError('客户不存在')
    if (parsed.reserveDays !== undefined)
      calculateProductionDeadline(parsed.expectedShipDate, parsed.reserveDays)
    for (const item of parsed.items) {
      if (
        item.edgeEnabled &&
        item.edgeQuantity !== undefined &&
        item.edgeQuantity > item.quantity
      ) {
        throw new DomainValidationError('缝边数量不能超过商品数量')
      }
    }
    return this.repository.updateOrder(parsed)
  }

  getOrderDetail(orderId: string) {
    if (!z.string().uuid().safeParse(orderId).success)
      throw new DomainValidationError('订单 ID 无效')
    return this.repository.getOrderDetail(orderId)
  }

  getOrderCostDetail(orderId: string) {
    if (!z.string().uuid().safeParse(orderId).success)
      throw new DomainValidationError('订单 ID 无效')
    return this.repository.getOrderCostDetail(orderId)
  }

  recordPayment(input: PaymentRecordInput) {
    const parsed = validate(paymentSchema, input)
    calculateProductionDeadline(parsed.paidAt, 0)
    return this.repository.recordPayment(parsed)
  }

  updateOrderProductionStatus(input: OrderProductionStatusInput) {
    const order = this.repository.updateOrderProductionStatus(
      validate(orderProductionStatusSchema, input)
    )
    if (!order) throw new DomainValidationError('订单不存在')
    return order
  }

  previewShift(input: ShiftInput | ShiftUpdateInput) {
    const parsed = 'id' in input ? validate(shiftUpdateSchema, input) : validate(shiftSchema, input)
    if (!isValid(parseISO(parsed.shiftDate))) throw new DomainValidationError('排班日期无效')
    this.assertSingleShiftTask(parsed.tasks)
    this.assertUniqueShiftOrderProducts(parsed.tasks)
    return this.repository.previewShift(parsed, 'id' in parsed ? parsed.id : undefined)
  }

  saveShift(input: ShiftInput) {
    const parsed = validate(shiftSchema, input)
    if (!isValid(parseISO(parsed.shiftDate))) throw new DomainValidationError('排班日期无效')
    this.assertSingleShiftTask(parsed.tasks)
    this.assertUniqueShiftOrderProducts(parsed.tasks)
    const preview = this.repository.previewShift(parsed)
    const confirmed = new Set(parsed.confirmedWarningCodes ?? [])
    const missing = preview.risks.filter((risk) => !confirmed.has(risk.code))
    if (missing.length > 0) {
      throw new DomainValidationError(
        `请先确认以下风险：${missing.map((risk) => risk.code).join('、')}`
      )
    }
    return this.repository.saveShift({ ...parsed, confirmedWarningCodes: [...confirmed] })
  }

  updateShift(input: ShiftUpdateInput) {
    const parsed = validate(shiftUpdateSchema, input)
    if (!isValid(parseISO(parsed.shiftDate))) throw new DomainValidationError('排班日期无效')
    this.assertSingleShiftTask(parsed.tasks)
    this.assertUniqueShiftOrderProducts(parsed.tasks)
    const current = this.repository.getShiftDetail(parsed.id)
    if (!current) throw new DomainValidationError('排班不存在')
    if (current.status !== 'scheduled') throw new DomainValidationError('仅可编辑待执行的排班')
    if (
      current.tasks.some(
        (task) =>
          task.actualMinutes !== null ||
          task.qualifiedQuantity > 0 ||
          task.reworkQuantity > 0 ||
          task.scrapQuantity > 0
      )
    ) {
      throw new DomainValidationError('已登记实际制作结果的排班不能编辑')
    }
    const preview = this.repository.previewShift(parsed, parsed.id)
    const confirmed = new Set(parsed.confirmedWarningCodes ?? [])
    const missing = preview.risks.filter((risk) => !confirmed.has(risk.code))
    if (missing.length > 0) {
      throw new DomainValidationError(
        `请先确认以下风险：${missing.map((risk) => risk.code).join('、')}`
      )
    }
    const result = this.repository.updateShift({ ...parsed, confirmedWarningCodes: [...confirmed] })
    if (!result) throw new DomainValidationError('排班不存在')
    return result
  }

  private assertSingleShiftTask(tasks: ShiftInput['tasks']): void {
    if (tasks.length !== 1) throw new DomainValidationError('一次排班只能安排一个订单内的一种商品')
  }

  private assertUniqueShiftOrderProducts(tasks: ShiftInput['tasks']): void {
    const selectedOrderProducts = new Set<string>()
    tasks.forEach((task) => {
      const context = this.repository.getOrderItemSchedulingContext(task.orderItemId)
      const key = `${context.orderId}:${context.productId}`
      if (selectedOrderProducts.has(key))
        throw new DomainValidationError('同一订单下同一产品只能选择一次')
      selectedOrderProducts.add(key)
    })
  }

  getShiftDetail(shiftId: string) {
    if (!z.string().uuid().safeParse(shiftId).success)
      throw new DomainValidationError('排班 ID 无效')
    return this.repository.getShiftDetail(shiftId)
  }

  updateShiftStatus(input: ShiftStatusInput) {
    const result = this.repository.updateShiftStatus(validate(shiftStatusSchema, input))
    if (!result) throw new DomainValidationError('排班不存在')
    return result
  }

  recordProduction(input: ProductionRecordInput) {
    return this.repository.recordProduction(validate(productionRecordSchema, input))
  }

  getWorkerDetail(workerId: string) {
    if (!z.string().uuid().safeParse(workerId).success)
      throw new DomainValidationError('兼职人员 ID 无效')
    return this.repository.getWorkerDetail(workerId)
  }

  createWorker(input: WorkerCreateInput) {
    const parsed = validate(workerSchema, input)
    if (
      parsed.defaultWorkStart &&
      parsed.defaultWorkEnd &&
      parsed.defaultWorkStart >= parsed.defaultWorkEnd
    ) {
      throw new DomainValidationError('默认结束时间必须晚于开始时间')
    }
    return this.repository.createWorker(parsed)
  }

  updateWorker(input: WorkerUpdateInput) {
    const parsed = validate(workerUpdateSchema, input)
    if (
      parsed.defaultWorkStart &&
      parsed.defaultWorkEnd &&
      parsed.defaultWorkStart >= parsed.defaultWorkEnd
    ) {
      throw new DomainValidationError('默认结束时间必须晚于开始时间')
    }
    const worker = this.repository.updateWorker(parsed)
    if (!worker) throw new DomainValidationError('兼职人员不存在')
    return worker
  }

  get repositoryApi() {
    return this.repository
  }
}
