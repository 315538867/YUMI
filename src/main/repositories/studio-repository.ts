import { randomUUID } from 'node:crypto'
import type { StudioDatabase } from '@main/database/connection'
import {
  calculateDailyCapacity,
  calculateProductCost,
  type ProductCostInput
} from '@main/domain/costing'
import { calculateActualProductionCost, calculateProductionProgress } from '@main/domain/production'
import { previewShiftRisks } from '@main/domain/scheduling'
import { DomainValidationError } from '@main/domain/errors'
import {
  assertProductionStatusTransition,
  calculatePaymentSummary,
  calculateProductionDeadline
} from '@main/domain/orders'
import type {
  AuditLogDetail,
  AuditLogInput,
  AttachmentSummary,
  AuditLogSummary,
  CostSettings,
  CostSettingsInput,
  CustomerDetail,
  CustomerInput,
  CustomerManagementQuery,
  CustomerOverview,
  CustomerProfile,
  CustomerUpdateInput,
  DashboardSummary,
  OrderCreateInput,
  OrderCostDetail,
  OrderCostItemDetail,
  OrderDefaults,
  OrderDetail,
  OrderFinancialSummary,
  OrderItemDetail,
  OrderProductionStatusInput,
  OrderUpdateInput,
  OrderProfitReport,
  OrderProfitReportQuery,
  OrderProfitReportRow,
  MonthlyProductionWeightQuery,
  MonthlyProductionWeightReport,
  WorkerSettlementReport,
  WorkerSettlementReportQuery,
  WorkerSettlementReportRow,
  CapacityRiskReport,
  CapacityRiskReportQuery,
  DailyCapacityReportRow,
  DeliveryRiskReportRow,
  ProductCapacityReportRow,
  OrderSummary,
  PaymentRecord,
  PaymentRecordInput,
  ProductionRecord,
  ProductionRecordInput,
  ProductCreateInput,
  ProductDetail,
  ProductOrderSnapshot,
  ProductSummary,
  ProductUpdateInput,
  ProductionStatus,
  ShiftDetail,
  ShiftInput,
  ShiftUpdateInput,
  ShiftStatus,
  ShiftStatusInput,
  ShiftSummary,
  ShipmentCreateInput,
  ShipmentDetail,
  ShipmentManifestSnapshot,
  ShipmentUpdateInput,
  OrderShipmentSummary,
  WorkerCreateInput,
  WorkerDetail,
  WorkerShiftSummary,
  WorkerSummary,
  WorkerUpdateInput,
  WorkerWageHistory
} from '@shared/contracts'

const now = () => new Date().toISOString()
const costSettingsKey = 'cost-settings'
const orderDefaultsKey = 'order-defaults'
const defaultOrderDefaults: OrderDefaults = { defaultReserveDays: 2 }
const retiredCostSettingsValues = {
  monthlyFixedCostCents: 0,
  targetEffectiveMinutes: 9600,
  fixedOverheadHourlyRateCents: 0
} as const

const defaultCostSettings: CostSettings = {
  id: 'default',
  gluePriceMilliYuanPerGram: 0,
  defaultHourlyWageCents: 0,
  effectiveFrom: '',
  createdAt: ''
}

type Row = Record<string, unknown>

type LegacyProductOrderSnapshot = Partial<ProductOrderSnapshot> & {
  gluePriceCentsPerGram?: unknown
}

function snapshotCostNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function productCostInputFromSnapshot(
  snapshot: LegacyProductOrderSnapshot,
  quantity: number,
  edgeEnabled: boolean,
  edgeQuantity: number,
  edgePriceCents: number
): ProductCostInput {
  // 旧订单快照可能没有后来新增的成本字段；更早版本的胶水单价以“分/克”保存。
  const legacyGluePriceMilliYuanPerGram = snapshotCostNumber(snapshot.gluePriceCentsPerGram) * 10
  return {
    quantity,
    weightGrams: snapshotCostNumber(snapshot.weightGrams),
    lossRate: snapshotCostNumber(snapshot.lossRate),
    gluePricePerGram:
      snapshotCostNumber(snapshot.gluePriceMilliYuanPerGram, legacyGluePriceMilliYuanPerGram) /
      1000,
    packagingCostPerUnit: snapshotCostNumber(snapshot.packagingCostCents) / 100,
    accessoryCostPerUnit: snapshotCostNumber(snapshot.accessoryCostCents) / 100,
    replacementBagCostPerUnit: snapshotCostNumber(snapshot.replacementBagCostCents) / 100,
    fluffPackingCostPerUnit: snapshotCostNumber(snapshot.fluffPackingCostCents) / 100,
    edgeCostPerUnit: snapshotCostNumber(snapshot.edgeCostCents) / 100,
    standardMinutesPerUnit: snapshotCostNumber(snapshot.standardMinutesPerUnit),
    hourlyLaborCost: snapshotCostNumber(snapshot.defaultHourlyWageCents) / 100,
    commissionPerUnit: snapshotCostNumber(snapshot.commissionCentsPerUnit) / 100,
    edgeEnabled,
    edgeQuantity,
    edgePricePerUnit: edgePriceCents / 100
  }
}

function productSummaryFromRow(row: Row): ProductSummary {
  return {
    id: String(row.id),
    name: String(row.name),
    code: (row.code as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    basePriceCents: Number(row.base_price_cents),
    edgePriceCents: Number(row.edge_price_cents),
    enabled: Boolean(row.enabled),
    standardMinutesPerUnit: Number(row.standard_minutes_per_unit),
    dailyCapacity: calculateDailyCapacity({
      moldCount: Number(row.mold_count),
      outputPerMoldPerBatch: Number(row.output_per_mold_per_batch),
      maxBatchesPerDay: Number(row.max_batches_per_day)
    })
  }
}

function productDetailFromRow(row: Row): ProductDetail {
  return {
    ...productSummaryFromRow(row),
    weightGrams: Number(row.weight_grams),
    lossRate: Number(row.loss_rate),
    packagingCostCents: Number(row.packaging_cost_cents),
    accessoryCostCents: Number(row.accessory_cost_cents ?? 0),
    replacementBagCostCents: Number(row.replacement_bag_cost_cents ?? 0),
    fluffPackingCostCents: Number(row.fluff_packing_cost_cents ?? 0),
    edgeCostCents: Number(row.edge_cost_cents ?? 0),
    commissionCentsPerUnit: Number(row.commission_cents_per_unit),
    moldCount: Number(row.mold_count),
    outputPerMoldPerBatch: Number(row.output_per_mold_per_batch),
    maxBatchesPerDay: Number(row.max_batches_per_day),
    imagePath: (row.image_path as string | null) ?? null,
    notes: (row.notes as string | null) ?? null
  }
}

function customerFromRow(row: Row): CustomerProfile {
  return {
    id: String(row.id),
    name: String(row.name),
    contact: (row.contact as string | null) ?? null,
    defaultAddress: (row.default_address as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined
  }
}

function costSettingsFromRow(row: Row): CostSettings {
  return {
    id: String(row.id),
    gluePriceMilliYuanPerGram: Number(row.glue_price_milli_yuan_per_gram),
    defaultHourlyWageCents: Number(row.default_hourly_wage_cents ?? 0),
    effectiveFrom: String(row.effective_from),
    createdAt: String(row.created_at)
  }
}

function orderFinancial(
  receivableCents: number,
  payments: Pick<PaymentRecord, 'type' | 'amountCents'>[]
): OrderFinancialSummary {
  const paymentSummary = calculatePaymentSummary({
    receivable: receivableCents,
    receipts: payments
      .filter((payment) => payment.type === 'receipt' && payment.amountCents > 0)
      .map((payment) => payment.amountCents),
    refunds: payments
      .filter((payment) => payment.type === 'refund' && payment.amountCents > 0)
      .map((payment) => payment.amountCents)
  })
  return {
    receivableCents: paymentSummary.receivable,
    receivedCents: paymentSummary.received,
    refundedCents: paymentSummary.refunded,
    receivedNetCents: paymentSummary.receivedNet,
    outstandingCents: paymentSummary.outstanding,
    status: paymentSummary.status
  }
}

function productSnapshot(product: ProductDetail, settings: CostSettings): ProductOrderSnapshot {
  return {
    productId: product.id,
    name: product.name,
    code: product.code,
    category: product.category,
    basePriceCents: product.basePriceCents,
    edgePriceCents: product.edgePriceCents,
    weightGrams: product.weightGrams,
    lossRate: product.lossRate,
    standardMinutesPerUnit: product.standardMinutesPerUnit,
    packagingCostCents: product.packagingCostCents,
    accessoryCostCents: product.accessoryCostCents,
    replacementBagCostCents: product.replacementBagCostCents,
    fluffPackingCostCents: product.fluffPackingCostCents,
    edgeCostCents: product.edgeCostCents,
    commissionCentsPerUnit: product.commissionCentsPerUnit,
    moldCount: product.moldCount,
    outputPerMoldPerBatch: product.outputPerMoldPerBatch,
    maxBatchesPerDay: product.maxBatchesPerDay,
    gluePriceMilliYuanPerGram: settings.gluePriceMilliYuanPerGram,
    defaultHourlyWageCents: settings.defaultHourlyWageCents
  }
}

function estimateItemCostCents(
  snapshot: ProductOrderSnapshot,
  quantity: number,
  edgeEnabled: boolean,
  edgeQuantity: number,
  edgePriceCents: number
): number {
  const result = calculateProductCost(
    productCostInputFromSnapshot(snapshot, quantity, edgeEnabled, edgeQuantity, edgePriceCents)
  )
  return Math.round(result.totalCost * 100)
}

function calculateOrderCostItem(
  orderItemId: string,
  snapshot: ProductOrderSnapshot,
  quantity: number,
  edgeEnabled: boolean,
  edgeQuantity: number,
  edgePriceCents: number,
  actualLaborMinutes: number,
  actualLaborCostCents: number
): OrderCostItemDetail {
  const expected = calculateProductCost(
    productCostInputFromSnapshot(snapshot, quantity, edgeEnabled, edgeQuantity, edgePriceCents)
  )
  const directCostCents = Math.round((expected.totalCost - expected.laborCost) * 100)
  return {
    orderItemId,
    productName: snapshot.name,
    quantity,
    glueCostCents: Math.round(expected.glueCost * 100),
    packagingCostCents: Math.round(expected.packagingCost * 100),
    accessoryCostCents: Math.round(expected.accessoryCost * 100),
    replacementBagCostCents: Math.round(expected.replacementBagCost * 100),
    fluffPackingCostCents: Math.round(expected.fluffPackingCost * 100),
    edgeCostCents: Math.round(expected.edgeCost * 100),
    commissionCostCents: Math.round(expected.commissionCost * 100),
    estimatedLaborMinutes: Math.round(expected.laborHours * 60),
    estimatedLaborCostCents: Math.round(expected.laborCost * 100),
    actualLaborMinutes,
    actualLaborCostCents,
    estimatedCostCents: Math.round(expected.totalCost * 100),
    actualCostCents: directCostCents + actualLaborCostCents
  }
}

export class StudioRepository {
  constructor(private readonly database: StudioDatabase) {}

  listProducts(): ProductSummary[] {
    const rows = this.database
      .prepare(
        `SELECT id, name, code, category, base_price_cents, edge_price_cents, enabled,
        standard_minutes_per_unit, mold_count, output_per_mold_per_batch, max_batches_per_day
        FROM products ORDER BY enabled DESC, updated_at DESC`
      )
      .all() as Row[]
    return rows.map(productSummaryFromRow)
  }

  getProduct(id: string): ProductDetail | null {
    const row = this.database
      .prepare(
        `SELECT id, name, code, category, base_price_cents, edge_price_cents, enabled,
        weight_grams, loss_rate, standard_minutes_per_unit, packaging_cost_cents,
        accessory_cost_cents, replacement_bag_cost_cents, fluff_packing_cost_cents, edge_cost_cents, commission_cents_per_unit, mold_count,
        output_per_mold_per_batch, max_batches_per_day,
        image_path, notes FROM products WHERE id = ?`
      )
      .get(id) as Row | undefined
    return row ? productDetailFromRow(row) : null
  }

  createProduct(input: ProductCreateInput): ProductDetail {
    const id = randomUUID()
    const timestamp = now()
    this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO products (
            id, name, code, category, base_price_cents, edge_price_cents, weight_grams, loss_rate,
            standard_minutes_per_unit, packaging_cost_cents, accessory_cost_cents,
            replacement_bag_cost_cents, fluff_packing_cost_cents, edge_cost_cents, commission_cents_per_unit, mold_count,
            output_per_mold_per_batch, max_batches_per_day, image_path, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.name.trim(),
          input.code?.trim() || null,
          input.category?.trim() || null,
          input.basePriceCents,
          input.edgePriceCents,
          input.weightGrams,
          input.lossRate,
          input.standardMinutesPerUnit,
          input.packagingCostCents,
          input.accessoryCostCents ?? 0,
          input.replacementBagCostCents ?? 0,
          input.fluffPackingCostCents ?? 0,
          input.edgeCostCents ?? 0,
          input.commissionCentsPerUnit,
          input.moldCount,
          input.outputPerMoldPerBatch,
          input.maxBatchesPerDay,
          input.imagePath?.trim() || null,
          input.notes?.trim() || null,
          timestamp,
          timestamp
        )
      this.writeAudit(
        'product.created',
        'product',
        id,
        null,
        input,
        { capacity: this.productCapacityAudit(input) },
        timestamp
      )
    })()
    return this.getProduct(id)!
  }

  updateProduct(input: ProductUpdateInput): ProductDetail | null {
    const previous = this.getProduct(input.id)
    if (!previous) return null
    const timestamp = now()
    let updated: ProductDetail | null = null
    this.database.transaction(() => {
      const result = this.database
        .prepare(
          `UPDATE products SET
            name = ?, code = ?, category = ?, base_price_cents = ?, edge_price_cents = ?,
            weight_grams = ?, loss_rate = ?, standard_minutes_per_unit = ?, packaging_cost_cents = ?,
            accessory_cost_cents = ?, replacement_bag_cost_cents = ?, fluff_packing_cost_cents = ?, edge_cost_cents = ?, commission_cents_per_unit = ?,
            mold_count = ?, output_per_mold_per_batch = ?,
            max_batches_per_day = ?, image_path = ?, notes = ?, enabled = ?, updated_at = ?
          WHERE id = ?`
        )
        .run(
          input.name.trim(),
          input.code?.trim() || null,
          input.category?.trim() || null,
          input.basePriceCents,
          input.edgePriceCents,
          input.weightGrams,
          input.lossRate,
          input.standardMinutesPerUnit,
          input.packagingCostCents,
          input.accessoryCostCents ?? 0,
          input.replacementBagCostCents ?? 0,
          input.fluffPackingCostCents ?? 0,
          input.edgeCostCents ?? 0,
          input.commissionCentsPerUnit,
          input.moldCount,
          input.outputPerMoldPerBatch,
          input.maxBatchesPerDay,
          input.imagePath?.trim() || null,
          input.notes?.trim() || null,
          input.enabled ? 1 : 0,
          timestamp,
          input.id
        )
      if (result.changes === 0) return
      updated = this.getProduct(input.id)
      this.writeAudit(
        'product.updated',
        'product',
        input.id,
        previous,
        updated,
        {
          capacityBefore: this.productCapacityAudit(previous),
          capacityAfter: this.productCapacityAudit(updated)
        },
        timestamp
      )
    })()
    return updated
  }

  getCostSettings(): CostSettings {
    const row = this.database
      .prepare(
        `SELECT id, glue_price_milli_yuan_per_gram, default_hourly_wage_cents, effective_from, created_at
        FROM cost_settings_history ORDER BY effective_from DESC, created_at DESC LIMIT 1`
      )
      .get() as Row | undefined
    return row ? costSettingsFromRow(row) : defaultCostSettings
  }

  getCostSettingsHistory(): CostSettings[] {
    return (
      this.database
        .prepare(
          `SELECT id, glue_price_milli_yuan_per_gram, default_hourly_wage_cents, effective_from, created_at
          FROM cost_settings_history ORDER BY effective_from DESC, created_at DESC`
        )
        .all() as Row[]
    ).map(costSettingsFromRow)
  }

  updateCostSettings(input: CostSettingsInput): CostSettings {
    const id = randomUUID()
    const timestamp = now()
    const record: CostSettings = {
      id,
      ...input,
      defaultHourlyWageCents: input.defaultHourlyWageCents ?? 0,
      createdAt: timestamp
    }
    this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO cost_settings_history (
            id, glue_price_milli_yuan_per_gram, monthly_fixed_cost_cents, target_effective_minutes,
            fixed_overhead_hourly_rate_cents, default_hourly_wage_cents, effective_from, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          record.id,
          record.gluePriceMilliYuanPerGram,
          retiredCostSettingsValues.monthlyFixedCostCents,
          retiredCostSettingsValues.targetEffectiveMinutes,
          retiredCostSettingsValues.fixedOverheadHourlyRateCents,
          record.defaultHourlyWageCents,
          record.effectiveFrom,
          record.createdAt
        )
      this.setAppSetting(costSettingsKey, record, timestamp)
      this.writeAudit(
        'cost-settings.updated',
        'system_cost_settings',
        id,
        null,
        record,
        { source: 'settings' },
        timestamp
      )
    })()
    return record
  }

  getOrderDefaults(): OrderDefaults {
    const row = this.database
      .prepare('SELECT value_json FROM app_settings WHERE key = ?')
      .get(orderDefaultsKey) as Row | undefined
    if (!row) return defaultOrderDefaults
    try {
      const value = JSON.parse(String(row.value_json)) as Partial<OrderDefaults>
      return Number.isInteger(value.defaultReserveDays) && value.defaultReserveDays >= 0
        ? { defaultReserveDays: value.defaultReserveDays }
        : defaultOrderDefaults
    } catch {
      return defaultOrderDefaults
    }
  }

  updateOrderDefaults(input: OrderDefaults): OrderDefaults {
    const timestamp = now()
    this.database.transaction(() => {
      this.setAppSetting(orderDefaultsKey, input, timestamp)
      this.writeAudit(
        'order-defaults.updated',
        'order_defaults',
        orderDefaultsKey,
        null,
        input,
        {},
        timestamp
      )
    })()
    return input
  }

  listCustomers(): CustomerProfile[] {
    return (
      this.database
        .prepare(
          `SELECT id, name, contact, default_address, notes, created_at, updated_at
          FROM customers ORDER BY updated_at DESC, name`
        )
        .all() as Row[]
    ).map(customerFromRow)
  }

  getCustomer(id: string): CustomerProfile | null {
    const row = this.database
      .prepare(
        `SELECT id, name, contact, default_address, notes, created_at, updated_at
        FROM customers WHERE id = ?`
      )
      .get(id) as Row | undefined
    return row ? customerFromRow(row) : null
  }

  createCustomer(input: CustomerInput): CustomerProfile {
    return this.insertCustomer(input)
  }

  updateCustomer(input: CustomerUpdateInput): CustomerProfile | null {
    const timestamp = now()
    const result = this.database
      .prepare(
        `UPDATE customers
        SET name = ?, contact = ?, default_address = ?, notes = ?, updated_at = ?
        WHERE id = ?`
      )
      .run(
        input.name.trim(),
        input.contact?.trim() || null,
        input.defaultAddress?.trim() || null,
        input.notes?.trim() || null,
        timestamp,
        input.id
      )
    return result.changes > 0 ? this.getCustomer(input.id) : null
  }

  deleteCustomer(id: string): boolean {
    let deleted = false
    this.database.transaction(() => {
      const linkedOrderCount = this.database
        .prepare('SELECT COUNT(*) AS count FROM orders WHERE customer_id = ?')
        .get(id) as { count: number }
      if (Number(linkedOrderCount.count) > 0)
        throw new DomainValidationError('该客户已有订单记录，不能删除')
      deleted = this.database.prepare('DELETE FROM customers WHERE id = ?').run(id).changes > 0
    })()
    return deleted
  }

  listCustomerManagement(query: CustomerManagementQuery = {}): CustomerOverview[] {
    const keyword = query.keyword?.trim()
    const whereSql = keyword
      ? 'WHERE c.name LIKE ? COLLATE NOCASE OR c.contact LIKE ? COLLATE NOCASE OR c.default_address LIKE ? COLLATE NOCASE'
      : ''
    const parameters = keyword ? [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`] : []
    return this.queryCustomerOverviews(whereSql, parameters)
  }

  getCustomerDetail(id: string): CustomerDetail | null {
    const [customer] = this.queryCustomerOverviews('WHERE c.id = ?', [id])
    return customer ? { ...customer, orders: this.listCustomerOrderHistory(id) } : null
  }

  listCustomerOrderHistory(customerId: string): OrderSummary[] {
    return this.queryOrderSummaries('WHERE o.customer_id = ?', [customerId])
  }

  createOrder(input: OrderCreateInput): OrderDetail {
    const orderId = randomUUID()
    const timestamp = now()
    this.database.transaction(() => {
      const customer = this.getCustomer(input.customer.id)
      if (!customer) throw new DomainValidationError('客户不存在')
      const reserveDays = input.reserveDays ?? this.getOrderDefaults().defaultReserveDays
      const productionDeadline = calculateProductionDeadline(input.expectedShipDate, reserveDays)
      const costSettings = this.getCostSettings()
      const preparedItems = input.items.map((item, sortOrder) => {
        const product = this.getProduct(item.productId)
        if (!product) throw new DomainValidationError('商品不存在')
        if (!product.enabled) throw new DomainValidationError('商品未启用，不能创建订单')
        const edgeEnabled = item.edgeEnabled ?? false
        const edgeQuantity = edgeEnabled ? item.quantity : 0
        const unitPriceCents = item.unitPriceCents ?? product.basePriceCents
        const edgePriceCents = item.edgePriceCents ?? product.edgePriceCents
        const discountCents = item.discountCents ?? 0
        const beforeDiscount = unitPriceCents * item.quantity + edgePriceCents * edgeQuantity
        if (discountCents > beforeDiscount)
          throw new DomainValidationError('明细优惠不能超过明细金额')
        const snapshot = productSnapshot(product, costSettings)
        return {
          id: randomUUID(),
          sortOrder,
          productId: product.id,
          snapshot,
          quantity: item.quantity,
          unitPriceCents,
          edgeEnabled,
          edgeQuantity,
          edgePriceCents,
          discountCents,
          estimatedCostCents: estimateItemCostCents(
            snapshot,
            item.quantity,
            edgeEnabled,
            edgeQuantity,
            edgePriceCents
          ),
          receivableCents: beforeDiscount - discountCents
        }
      })
      const beforeOrderDiscount = preparedItems.reduce(
        (total, item) => total + item.receivableCents,
        0
      )
      const orderDiscountCents = input.discountCents ?? 0
      if (orderDiscountCents > beforeOrderDiscount)
        throw new DomainValidationError('订单优惠不能超过订单金额')
      const customerSnapshot = {
        id: customer.id,
        name: input.customer.name.trim(),
        contact: input.customer.contact?.trim() || null,
        defaultAddress: input.customer.defaultAddress?.trim() || null,
        notes: null
      }
      const code = `YM-${timestamp.slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 4).toUpperCase()}`
      this.database
        .prepare(
          `INSERT INTO orders (
            id, code, customer_id, customer_snapshot_json, expected_ship_date, reserve_days,
            production_deadline, production_status, discount_cents, receivable_cents, estimated_cost_cents,
            notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          orderId,
          code,
          customer.id,
          JSON.stringify(customerSnapshot),
          input.expectedShipDate,
          reserveDays,
          productionDeadline,
          'pending_confirmation',
          orderDiscountCents,
          beforeOrderDiscount - orderDiscountCents,
          preparedItems.reduce((total, item) => total + item.estimatedCostCents, 0),
          input.notes?.trim() || null,
          timestamp,
          timestamp
        )
      const insertItem = this.database.prepare(
        `INSERT INTO order_items (
          id, order_id, product_id, product_snapshot_json, sort_order, quantity, unit_price_cents, edge_enabled,
          edge_quantity, edge_price_cents, discount_cents, accessory_cost_cents,
          replacement_bag_cost_cents, estimated_cost_cents, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      preparedItems.forEach((item) => {
        insertItem.run(
          item.id,
          orderId,
          item.productId,
          JSON.stringify(item.snapshot),
          item.sortOrder,
          item.quantity,
          item.unitPriceCents,
          item.edgeEnabled ? 1 : 0,
          item.edgeQuantity,
          item.edgePriceCents,
          item.discountCents,
          item.snapshot.accessoryCostCents,
          item.snapshot.replacementBagCostCents,
          item.estimatedCostCents,
          timestamp,
          timestamp
        )
      })
      this.refreshOrderActualCost(orderId, timestamp)
      this.writeAudit(
        'order.created',
        'order',
        orderId,
        null,
        {
          customer: customerSnapshot,
          expectedShipDate: input.expectedShipDate,
          reserveDays,
          discountCents: orderDiscountCents,
          items: preparedItems.map((item) => this.orderItemAuditValue(item)),
          receivableCents: beforeOrderDiscount - orderDiscountCents
        },
        { pricingChanged: false },
        timestamp
      )
    })()
    return this.getOrderDetail(orderId)!
  }

  getOrderShipmentSummary(orderId: string): OrderShipmentSummary[] {
    const rows = this.database
      .prepare(
        `SELECT oi.id AS order_item_id, oi.quantity AS ordered_quantity,
          COALESCE(SUM(si.quantity), 0) AS shipped_quantity, oi.product_snapshot_json
         FROM order_items oi
         LEFT JOIN shipment_items si ON si.order_item_id = oi.id
         WHERE oi.order_id = ?
         GROUP BY oi.id, oi.quantity, oi.product_snapshot_json
         ORDER BY oi.sort_order, oi.created_at, oi.id`
      )
      .all(orderId) as Row[]
    return rows.map((row) => {
      const orderedQuantity = Number(row.ordered_quantity)
      const shippedQuantity = Number(row.shipped_quantity)
      const snapshot = JSON.parse(String(row.product_snapshot_json)) as ProductOrderSnapshot
      return {
        orderItemId: String(row.order_item_id),
        productName: snapshot.name,
        orderedQuantity,
        shippedQuantity,
        pendingQuantity: orderedQuantity - shippedQuantity
      }
    })
  }

  listShipments(orderId: string): ShipmentDetail[] {
    const rows = this.database
      .prepare(
        'SELECT id FROM shipments WHERE order_id = ? ORDER BY shipped_at DESC, created_at DESC, id DESC'
      )
      .all(orderId) as Row[]
    return rows.map((row) => this.getShipmentDetail(String(row.id))!).filter(Boolean)
  }

  createShipment(input: ShipmentCreateInput): ShipmentDetail {
    const id = randomUUID()
    const timestamp = now()
    this.database.transaction(() => {
      this.assertShipmentItemsCanBeSaved(input.orderId, input.items)
      this.database
        .prepare(
          `INSERT INTO shipments (id, order_id, shipped_at, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(id, input.orderId, input.shippedAt, input.notes?.trim() || null, timestamp, timestamp)
      const insertItem = this.database.prepare(
        `INSERT INTO shipment_items (id, shipment_id, order_item_id, quantity, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      input.items.forEach((item) =>
        insertItem.run(randomUUID(), id, item.orderItemId, item.quantity, timestamp, timestamp)
      )
      this.persistShipmentManifestSnapshot(id)
    })()
    return this.getShipmentDetail(id)!
  }

  updateShipment(input: ShipmentUpdateInput): ShipmentDetail {
    const timestamp = now()
    this.database.transaction(() => {
      const existing = this.database
        .prepare('SELECT order_id FROM shipments WHERE id = ?')
        .get(input.id) as Row | undefined
      if (!existing) throw new DomainValidationError('发货记录不存在')
      if (String(existing.order_id) !== input.orderId)
        throw new DomainValidationError('发货记录不能更换所属订单')
      this.assertShipmentItemsCanBeSaved(input.orderId, input.items, input.id)
      this.database
        .prepare('UPDATE shipments SET shipped_at = ?, notes = ?, updated_at = ? WHERE id = ?')
        .run(input.shippedAt, input.notes?.trim() || null, timestamp, input.id)
      this.database.prepare('DELETE FROM shipment_items WHERE shipment_id = ?').run(input.id)
      const insertItem = this.database.prepare(
        `INSERT INTO shipment_items (id, shipment_id, order_item_id, quantity, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      input.items.forEach((item) =>
        insertItem.run(
          randomUUID(),
          input.id,
          item.orderItemId,
          item.quantity,
          timestamp,
          timestamp
        )
      )
      this.persistShipmentManifestSnapshot(input.id)
    })()
    return this.getShipmentDetail(input.id)!
  }

  private assertShipmentItemsCanBeSaved(
    orderId: string,
    items: ShipmentCreateInput['items'],
    excludedShipmentId?: string
  ): void {
    const order = this.database.prepare('SELECT id FROM orders WHERE id = ?').get(orderId)
    if (!order) throw new DomainValidationError('订单不存在')
    for (const item of items) {
      const orderItem = this.database
        .prepare('SELECT id, quantity FROM order_items WHERE id = ? AND order_id = ?')
        .get(item.orderItemId, orderId) as Row | undefined
      if (!orderItem) throw new DomainValidationError('发货商品明细不属于当前订单')
      const shipped = this.database
        .prepare(
          `SELECT COALESCE(SUM(quantity), 0) AS quantity
           FROM shipment_items
           WHERE order_item_id = ? AND (? IS NULL OR shipment_id <> ?)`
        )
        .get(item.orderItemId, excludedShipmentId ?? null, excludedShipmentId ?? null) as {
        quantity: number
      }
      const pendingQuantity = Number(orderItem.quantity) - Number(shipped.quantity)
      if (item.quantity > pendingQuantity)
        throw new DomainValidationError(
          `本次发货数量不能超过待发数量（待发 ${pendingQuantity} 件）`
        )
    }
  }

  getShipmentManifestSnapshot(id: string): ShipmentManifestSnapshot | null {
    const row = this.database.prepare('SELECT * FROM shipments WHERE id = ?').get(id) as
      Row | undefined
    if (!row) return null
    const storedSnapshot = row.manifest_snapshot_json as string | null | undefined
    if (storedSnapshot) return JSON.parse(storedSnapshot) as ShipmentManifestSnapshot
    return this.buildLegacyShipmentManifestSnapshot(row)
  }

  private persistShipmentManifestSnapshot(shipmentId: string): void {
    const shipment = this.database
      .prepare('SELECT * FROM shipments WHERE id = ?')
      .get(shipmentId) as Row | undefined
    if (!shipment) throw new DomainValidationError('发货记录不存在')
    const snapshot = this.buildLegacyShipmentManifestSnapshot(shipment)
    this.database
      .prepare('UPDATE shipments SET manifest_snapshot_json = ? WHERE id = ?')
      .run(JSON.stringify(snapshot), shipmentId)
  }

  private buildLegacyShipmentManifestSnapshot(shipment: Row): ShipmentManifestSnapshot {
    const order = this.getOrderDetail(String(shipment.order_id))
    if (!order) throw new DomainValidationError('订单不存在')
    const rows = this.database
      .prepare(
        `SELECT oi.id AS order_item_id, oi.product_id, oi.quantity AS ordered_quantity,
          oi.product_snapshot_json, p.image_path,
          COALESCE(MAX(CASE WHEN si.shipment_id = ? THEN si.quantity ELSE 0 END), 0) AS shipment_quantity,
          COALESCE(SUM(CASE WHEN s.created_at < ? OR s.id = ? THEN si.quantity ELSE 0 END), 0) AS shipped_quantity
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         LEFT JOIN shipment_items si ON si.order_item_id = oi.id
         LEFT JOIN shipments s ON s.id = si.shipment_id
         WHERE oi.order_id = ?
         GROUP BY oi.id, oi.product_id, oi.quantity, oi.product_snapshot_json, p.image_path
         ORDER BY oi.sort_order, oi.created_at, oi.id`
      )
      .all(shipment.id, shipment.created_at, shipment.id, shipment.order_id) as Row[]
    return this.toShipmentManifestSnapshot(order.customer.name, shipment, rows)
  }

  private toShipmentManifestSnapshot(
    customerName: string,
    shipment: Row,
    rows: Row[]
  ): ShipmentManifestSnapshot {
    return {
      customerName,
      shippedAt: String(shipment.shipped_at),
      notes: (shipment.notes as string | null) ?? '',
      rows: rows.map((row) => {
        const snapshot = JSON.parse(String(row.product_snapshot_json)) as ProductOrderSnapshot
        const orderedQuantity = Number(row.ordered_quantity)
        return {
          productId: String(row.product_id),
          productName: snapshot.name,
          imagePath: (row.image_path as string | null) ?? null,
          orderedQuantity,
          shipmentQuantity: Number(row.shipment_quantity),
          pendingQuantity: Math.max(0, orderedQuantity - Number(row.shipped_quantity))
        }
      })
    }
  }

  private getShipmentDetail(id: string): ShipmentDetail | null {
    const row = this.database.prepare('SELECT * FROM shipments WHERE id = ?').get(id) as
      Row | undefined
    if (!row) return null
    const summaries = new Map(
      this.getOrderShipmentSummary(String(row.order_id)).map((item) => [item.orderItemId, item])
    )
    const itemRows = this.database
      .prepare(
        'SELECT order_item_id, quantity FROM shipment_items WHERE shipment_id = ? ORDER BY created_at, id'
      )
      .all(id) as Row[]
    return {
      id: String(row.id),
      orderId: String(row.order_id),
      shippedAt: String(row.shipped_at),
      notes: (row.notes as string | null) ?? null,
      items: itemRows.map((item) => {
        const summary = summaries.get(String(item.order_item_id))
        if (!summary) throw new DomainValidationError('发货记录包含不存在的订单商品')
        return { ...summary, shipmentQuantity: Number(item.quantity) }
      }),
      manifestSnapshot: row.manifest_snapshot_json
        ? (JSON.parse(String(row.manifest_snapshot_json)) as ShipmentManifestSnapshot)
        : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    }
  }

  updateOrder(input: OrderUpdateInput): OrderDetail {
    const previous = this.getOrderDetail(input.id)
    if (!previous) throw new DomainValidationError('订单不存在')
    const timestamp = now()
    this.database.transaction(() => {
      const customer = this.getCustomer(input.customer.id)
      if (!customer) throw new DomainValidationError('客户不存在')
      const reserveDays = input.reserveDays ?? previous.reserveDays
      const productionDeadline = calculateProductionDeadline(input.expectedShipDate, reserveDays)
      const costSettings = this.getCostSettings()
      const existingItems = new Map(previous.items.map((item) => [item.id, item]))
      const preparedItems = input.items.map((item, sortOrder) => {
        const product = this.getProduct(item.productId)
        if (!product) throw new DomainValidationError('商品不存在')
        if (!product.enabled && !existingItems.has(item.id ?? ''))
          throw new DomainValidationError('商品未启用，不能加入订单')
        const existing = item.id ? existingItems.get(item.id) : undefined
        if (item.id && !existing) throw new DomainValidationError('订单商品明细不存在')
        const completed = existing
          ? (this.database
              .prepare(
                `SELECT COALESCE(SUM(qualified_quantity), 0) AS quantity
                 FROM shift_tasks WHERE order_item_id = ?`
              )
              .get(existing.id) as { quantity: number })
          : { quantity: 0 }
        if (item.quantity < Number(completed.quantity))
          throw new DomainValidationError(
            `商品数量不能低于已完成数量（已完成 ${completed.quantity} 件）`
          )
        const shipped = existing
          ? (this.database
              .prepare(
                `SELECT COALESCE(SUM(shipment_items.quantity), 0) AS quantity
                 FROM shipment_items WHERE order_item_id = ?`
              )
              .get(existing.id) as { quantity: number })
          : { quantity: 0 }
        if (item.quantity < Number(shipped.quantity))
          throw new DomainValidationError(
            `商品数量不能低于累计已发数量（累计已发 ${shipped.quantity} 件）`
          )
        const edgeEnabled = item.edgeEnabled ?? existing?.edgeEnabled ?? false
        const edgeQuantity = edgeEnabled ? item.quantity : 0
        const unitPriceCents =
          item.unitPriceCents ?? existing?.unitPriceCents ?? product.basePriceCents
        const edgePriceCents =
          item.edgePriceCents ?? existing?.edgePriceCents ?? product.edgePriceCents
        const discountCents = item.discountCents ?? existing?.discountCents ?? 0
        const beforeDiscount = unitPriceCents * item.quantity + edgePriceCents * edgeQuantity
        if (discountCents > beforeDiscount)
          throw new DomainValidationError('明细优惠不能超过明细金额')
        const snapshot = productSnapshot(product, costSettings)
        return {
          id: existing?.id ?? randomUUID(),
          sortOrder,
          productId: product.id,
          snapshot,
          quantity: item.quantity,
          unitPriceCents,
          edgeEnabled,
          edgeQuantity,
          edgePriceCents,
          discountCents,
          estimatedCostCents: estimateItemCostCents(
            snapshot,
            item.quantity,
            edgeEnabled,
            edgeQuantity,
            edgePriceCents
          ),
          receivableCents: beforeDiscount - discountCents
        }
      })
      const retainedIds = new Set(preparedItems.map((item) => item.id))
      for (const item of previous.items) {
        if (retainedIds.has(item.id)) continue
        const shipmentDependency = this.database
          .prepare('SELECT 1 AS found FROM shipment_items WHERE order_item_id = ? LIMIT 1')
          .get(item.id)
        if (shipmentDependency) throw new DomainValidationError('已有发货明细的订单商品不能删除')
        const dependency = this.database
          .prepare('SELECT 1 AS found FROM shift_tasks WHERE order_item_id = ? LIMIT 1')
          .get(item.id)
        if (dependency) throw new DomainValidationError('已有排班或制作记录的商品明细不能删除')
      }
      const beforeOrderDiscount = preparedItems.reduce(
        (total, item) => total + item.receivableCents,
        0
      )
      const orderDiscountCents = input.discountCents ?? 0
      if (orderDiscountCents > beforeOrderDiscount)
        throw new DomainValidationError('订单优惠不能超过订单金额')
      const customerSnapshot = {
        id: customer.id,
        name: input.customer.name.trim(),
        contact: input.customer.contact?.trim() || null,
        defaultAddress: input.customer.defaultAddress?.trim() || null,
        notes: null
      }
      this.database
        .prepare(
          `UPDATE orders SET customer_id = ?, customer_snapshot_json = ?, expected_ship_date = ?,
           reserve_days = ?, production_deadline = ?, discount_cents = ?, receivable_cents = ?,
           estimated_cost_cents = ?, notes = ?, updated_at = ? WHERE id = ?`
        )
        .run(
          customer.id,
          JSON.stringify(customerSnapshot),
          input.expectedShipDate,
          reserveDays,
          productionDeadline,
          orderDiscountCents,
          beforeOrderDiscount - orderDiscountCents,
          preparedItems.reduce((total, item) => total + item.estimatedCostCents, 0),
          input.notes?.trim() || null,
          timestamp,
          input.id
        )
      const updateItem = this.database.prepare(
        `UPDATE order_items SET product_id = ?, product_snapshot_json = ?, sort_order = ?, quantity = ?,
         unit_price_cents = ?, edge_enabled = ?, edge_quantity = ?, edge_price_cents = ?, discount_cents = ?,
         accessory_cost_cents = ?, replacement_bag_cost_cents = ?, estimated_cost_cents = ?, updated_at = ?
         WHERE id = ? AND order_id = ?`
      )
      const insertItem = this.database.prepare(
        `INSERT INTO order_items (
          id, order_id, product_id, product_snapshot_json, sort_order, quantity, unit_price_cents, edge_enabled,
          edge_quantity, edge_price_cents, discount_cents, accessory_cost_cents,
          replacement_bag_cost_cents, estimated_cost_cents, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      preparedItems.forEach((item) => {
        if (existingItems.has(item.id)) {
          updateItem.run(
            item.productId,
            JSON.stringify(item.snapshot),
            item.sortOrder,
            item.quantity,
            item.unitPriceCents,
            item.edgeEnabled ? 1 : 0,
            item.edgeQuantity,
            item.edgePriceCents,
            item.discountCents,
            item.snapshot.accessoryCostCents,
            item.snapshot.replacementBagCostCents,
            item.estimatedCostCents,
            timestamp,
            item.id,
            input.id
          )
        } else {
          insertItem.run(
            item.id,
            input.id,
            item.productId,
            JSON.stringify(item.snapshot),
            item.sortOrder,
            item.quantity,
            item.unitPriceCents,
            item.edgeEnabled ? 1 : 0,
            item.edgeQuantity,
            item.edgePriceCents,
            item.discountCents,
            item.snapshot.accessoryCostCents,
            item.snapshot.replacementBagCostCents,
            item.estimatedCostCents,
            timestamp,
            timestamp
          )
        }
      })
      for (const item of previous.items) {
        if (!retainedIds.has(item.id))
          this.database
            .prepare('DELETE FROM order_items WHERE id = ? AND order_id = ?')
            .run(item.id, input.id)
      }
      this.refreshOrderActualCost(input.id, timestamp)
      this.writeAudit(
        'order.updated',
        'order',
        input.id,
        this.orderAuditValue(previous),
        {
          customer: customerSnapshot,
          expectedShipDate: input.expectedShipDate,
          reserveDays,
          discountCents: orderDiscountCents,
          items: preparedItems.map((item) => this.orderItemAuditValue(item)),
          receivableCents: beforeOrderDiscount - orderDiscountCents
        },
        {
          pricingChanged:
            previous.receivableCents !== beforeOrderDiscount - orderDiscountCents ||
            previous.discountCents !== orderDiscountCents ||
            previous.items.length !== preparedItems.length
        },
        timestamp
      )
    })()
    return this.getOrderDetail(input.id)!
  }

  getOrderCostDetail(orderId: string): OrderCostDetail {
    const order = this.database.prepare('SELECT id FROM orders WHERE id = ?').get(orderId)
    if (!order) throw new DomainValidationError('订单不存在')
    const laborRows = this.database
      .prepare(
        `SELECT st.order_item_id,
          COALESCE(SUM(st.estimated_minutes + s.extra_minutes), 0) AS actual_labor_minutes,
          COALESCE(SUM(ROUND((st.estimated_minutes + s.extra_minutes) * (
            SELECT hourly_wage_cents FROM worker_wage_history
            WHERE worker_id = s.worker_id AND effective_from <= s.shift_date
            ORDER BY effective_from DESC, created_at DESC LIMIT 1
          ) / 60.0)), 0) AS actual_labor_cost_cents
         FROM shift_tasks st
         JOIN shifts s ON s.id = st.shift_id
         JOIN order_items oi ON oi.id = st.order_item_id
         WHERE oi.order_id = ? AND s.status = 'completed'
         GROUP BY st.order_item_id`
      )
      .all(orderId) as Row[]
    const laborByItem = new Map(
      laborRows.map((row) => [
        String(row.order_item_id),
        {
          minutes: Number(row.actual_labor_minutes),
          costCents: Number(row.actual_labor_cost_cents)
        }
      ])
    )
    const items = (
      this.database
        .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY sort_order, created_at, id')
        .all(orderId) as Row[]
    ).map((row) => {
      const labor = laborByItem.get(String(row.id)) ?? { minutes: 0, costCents: 0 }
      return calculateOrderCostItem(
        String(row.id),
        JSON.parse(String(row.product_snapshot_json)) as ProductOrderSnapshot,
        Number(row.quantity),
        Boolean(row.edge_enabled),
        Number(row.edge_quantity),
        Number(row.edge_price_cents),
        labor.minutes,
        labor.costCents
      )
    })
    return {
      orderId,
      items,
      estimatedCostCents: items.reduce((total, item) => total + item.estimatedCostCents, 0),
      actualCostCents: items.reduce((total, item) => total + item.actualCostCents, 0)
    }
  }

  private refreshOrderActualCost(orderId: string, timestamp = now()): void {
    const detail = this.getOrderCostDetail(orderId)
    this.database
      .prepare('UPDATE orders SET actual_cost_cents = ?, updated_at = ? WHERE id = ?')
      .run(detail.actualCostCents, timestamp, orderId)
  }

  getOrderDetail(id: string): OrderDetail | null {
    const row = this.database.prepare('SELECT * FROM orders WHERE id = ?').get(id) as
      Row | undefined
    if (!row) return null
    const customer = JSON.parse(String(row.customer_snapshot_json)) as CustomerProfile
    const progress = this.getOrderProgress(id)
    const items = (
      this.database
        .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY sort_order, created_at, id')
        .all(id) as Row[]
    ).map((item): OrderItemDetail => ({
      id: String(item.id),
      productId: String(item.product_id),
      productSnapshot: JSON.parse(String(item.product_snapshot_json)) as ProductOrderSnapshot,
      quantity: Number(item.quantity),
      unitPriceCents: Number(item.unit_price_cents),
      edgeEnabled: Boolean(item.edge_enabled),
      edgeQuantity: Number(item.edge_quantity),
      edgePriceCents: Number(item.edge_price_cents),
      discountCents: Number(item.discount_cents),
      estimatedCostCents: Number(item.estimated_cost_cents),
      progress: progress.items.get(String(item.id))!
    }))
    const payments = this.listPayments(id)
    return {
      id: String(row.id),
      code: String(row.code),
      customerId: (row.customer_id as string | null) ?? null,
      customer,
      expectedShipDate: String(row.expected_ship_date),
      reserveDays: Number(row.reserve_days),
      productionDeadline: String(row.production_deadline),
      productionStatus: row.production_status as ProductionStatus,
      schedulingStatus: progress.summary.status,
      progress: progress.summary,
      discountCents: Number(row.discount_cents),
      receivableCents: Number(row.receivable_cents),
      estimatedCostCents: Number(row.estimated_cost_cents),
      actualCostCents: Number(row.actual_cost_cents),
      notes: (row.notes as string | null) ?? null,
      items,
      payments,
      financial: orderFinancial(Number(row.receivable_cents), payments),
      relatedSchedules: this.listOrderRelatedSchedules(id),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    }
  }

  recordPayment(input: PaymentRecordInput): OrderDetail {
    const paymentId = randomUUID()
    const timestamp = now()
    this.database.transaction(() => {
      const order = this.database.prepare('SELECT id FROM orders WHERE id = ?').get(input.orderId)
      if (!order) throw new DomainValidationError('订单不存在')
      if (input.receiptAttachmentId) {
        const attachment = this.database
          .prepare('SELECT id FROM attachments WHERE id = ?')
          .get(input.receiptAttachmentId)
        if (!attachment) throw new DomainValidationError('收款凭证不存在')
      }
      this.database
        .prepare(
          `INSERT INTO payments (
            id, order_id, type, amount_cents, payment_method, paid_at, note, receipt_attachment_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          paymentId,
          input.orderId,
          input.type,
          input.amountCents,
          input.paymentMethod.trim(),
          input.paidAt,
          input.note?.trim() || null,
          input.receiptAttachmentId || null,
          timestamp
        )
      this.writeAudit(
        'payment.recorded',
        'payment',
        input.orderId,
        null,
        { id: paymentId, ...input },
        { orderId: input.orderId, paymentType: input.type },
        timestamp
      )
    })()
    return this.getOrderDetail(input.orderId)!
  }

  updateOrderProductionStatus(input: OrderProductionStatusInput): OrderDetail | null {
    const timestamp = now()
    const previous = this.getOrderDetail(input.orderId)
    if (!previous) return null
    try {
      assertProductionStatusTransition(previous.productionStatus, input.productionStatus)
    } catch (error) {
      throw new DomainValidationError(
        error instanceof Error ? error.message : '订单制作状态变更无效'
      )
    }
    this.database.transaction(() => {
      this.database
        .prepare('UPDATE orders SET production_status = ?, updated_at = ? WHERE id = ?')
        .run(input.productionStatus, timestamp, input.orderId)
      this.writeAudit(
        'order.production-status.updated',
        'order',
        input.orderId,
        { productionStatus: previous.productionStatus },
        { productionStatus: input.productionStatus },
        {},
        timestamp
      )
    })()
    return this.getOrderDetail(input.orderId)
  }

  previewShift(input: ShiftInput, excludedShiftId?: string) {
    if (input.tasks.length !== 1) {
      throw new DomainValidationError('一次排班只能安排一个订单内的一种商品')
    }
    const worker = this.database
      .prepare('SELECT id, active FROM workers WHERE id = ?')
      .get(input.workerId) as Row | undefined
    if (!worker) throw new DomainValidationError('兼职人员不存在')
    if (Number(worker.active) !== 1) throw new DomainValidationError('兼职人员已停用，不能排班')
    const otherPlannedByProduct = this.database
      .prepare(
        `SELECT st.product_id, COALESCE(SUM(st.planned_quantity), 0) AS quantity
       FROM shift_tasks st JOIN shifts s ON s.id = st.shift_id
       WHERE s.shift_date = ? AND s.status NOT IN ('leave', 'absent', 'cancelled')
       AND (? IS NULL OR s.id != ?) GROUP BY st.product_id`
      )
      .all(input.shiftDate, excludedShiftId ?? null, excludedShiftId ?? null) as Row[]
    const plannedByProduct = new Map(
      otherPlannedByProduct.map((row) => [String(row.product_id), Number(row.quantity)])
    )
    const requestedByOrderItem = new Map<string, number>()
    input.tasks.forEach((task) => {
      requestedByOrderItem.set(
        task.orderItemId,
        (requestedByOrderItem.get(task.orderItemId) ?? 0) + task.plannedQuantity
      )
    })
    const contexts = input.tasks.map((task) => {
      const row = this.database
        .prepare(
          `SELECT oi.id AS order_item_id, oi.product_id, oi.quantity, oi.product_snapshot_json, o.code AS order_code, o.production_deadline,
         COALESCE(SUM(st.qualified_quantity), 0) AS completed_quantity,
         COALESCE(SUM(CASE WHEN s.status = 'scheduled' AND (? IS NULL OR s.id != ?) THEN st.planned_quantity ELSE 0 END), 0) AS scheduled_quantity
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN shift_tasks st ON st.order_item_id = oi.id
         LEFT JOIN shifts s ON s.id = st.shift_id
         WHERE oi.id = ? GROUP BY oi.id`
        )
        .get(excludedShiftId ?? null, excludedShiftId ?? null, task.orderItemId) as Row | undefined
      if (!row) throw new DomainValidationError('订单商品明细不存在')
      const snapshot = JSON.parse(String(row.product_snapshot_json)) as ProductOrderSnapshot
      const completedQuantity = Number(row.completed_quantity)
      const scheduledQuantity = Number(row.scheduled_quantity)
      const otherQuantity = plannedByProduct.get(String(row.product_id)) ?? 0
      plannedByProduct.set(String(row.product_id), otherQuantity + task.plannedQuantity)
      return {
        productId: String(row.product_id),
        orderItemId: String(row.order_item_id),
        productName: snapshot.name,
        orderCode: String(row.order_code),
        orderedQuantity: Number(row.quantity),
        plannedQuantity: task.plannedQuantity,
        requestedQuantity: requestedByOrderItem.get(task.orderItemId) ?? task.plannedQuantity,
        standardMinutesPerUnit: snapshot.standardMinutesPerUnit,
        completedQuantity,
        scheduledQuantity,
        dueDate: String(row.production_deadline),
        dailyCapacity: calculateDailyCapacity({
          moldCount: snapshot.moldCount,
          outputPerMoldPerBatch: snapshot.outputPerMoldPerBatch,
          maxBatchesPerDay: snapshot.maxBatchesPerDay
        }),
        otherPlannedQuantityForDay: otherQuantity
      }
    })
    try {
      const base = previewShiftRisks({
        date: input.shiftDate,
        extraMinutes: input.extraMinutes ?? 0,
        tasks: contexts
      })
      const exceededOrderItems = new Set<string>()
      const quantityRisks = contexts.flatMap((task) => {
        if (exceededOrderItems.has(task.orderItemId)) return []
        const progress = calculateProductionProgress({
          orderedQuantity: task.orderedQuantity,
          qualifiedQuantity: task.completedQuantity,
          unqualifiedQuantity: 0,
          scheduledQuantity: task.scheduledQuantity + task.requestedQuantity,
          hasReleasedQuantity: false
        })
        if (progress.excessQuantity === 0) return []
        exceededOrderItems.add(task.orderItemId)
        return [
          {
            code: 'ORDER_QUANTITY_EXCEEDED' as const,
            level: 'critical' as const,
            message: `订单 ${task.orderCode} · ${task.productName} 的计划覆盖 ${progress.coveredQuantity} 件，超过订单合格产品数量 ${progress.orderedQuantity} 件。`,
            orderItemId: task.orderItemId,
            orderCode: task.orderCode,
            orderedQuantity: progress.orderedQuantity,
            qualifiedQuantity: progress.qualifiedQuantity,
            scheduledQuantity: task.scheduledQuantity,
            requestedQuantity: task.requestedQuantity,
            excessQuantity: progress.excessQuantity
          }
        ]
      })
      return {
        ...base,
        taskProgress: contexts.map((task) => ({
          orderItemId: task.orderItemId,
          productName: task.productName,
          progress: calculateProductionProgress({
            orderedQuantity: task.orderedQuantity,
            qualifiedQuantity: task.completedQuantity,
            unqualifiedQuantity: 0,
            scheduledQuantity: task.scheduledQuantity,
            hasReleasedQuantity: false
          })
        })),
        risks: [...base.risks, ...quantityRisks]
      }
    } catch (error) {
      throw new DomainValidationError(error instanceof Error ? error.message : '排班风险预览失败')
    }
  }

  saveShift(input: ShiftInput): ShiftSummary {
    const preview = this.previewShift(input)
    const id = randomUUID()
    const timestamp = now()
    this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO shifts (
            id, worker_id, shift_date, start_time, end_time, extra_minutes, status, confirmed_risks_json, detected_risks_json,
            created_at, updated_at
          ) VALUES (?, ?, ?, NULL, NULL, ?, 'scheduled', ?, ?, ?, ?)`
        )
        .run(
          id,
          input.workerId,
          input.shiftDate,
          input.extraMinutes ?? 0,
          JSON.stringify(input.confirmedWarningCodes ?? []),
          JSON.stringify(preview.risks),
          timestamp,
          timestamp
        )
      const insertTask = this.database.prepare(
        `INSERT INTO shift_tasks (
          id, shift_id, order_item_id, product_id, planned_quantity, estimated_minutes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      input.tasks.forEach((task) => {
        const context = this.getOrderItemSchedulingContext(task.orderItemId)
        insertTask.run(
          randomUUID(),
          id,
          task.orderItemId,
          context.productId,
          task.plannedQuantity,
          Math.ceil(task.plannedQuantity * context.standardMinutesPerUnit),
          timestamp,
          timestamp
        )
        this.database
          .prepare(
            `UPDATE orders SET production_status = CASE
              WHEN production_status = 'pending_confirmation' THEN 'pending_schedule'
              ELSE production_status END, updated_at = ?
            WHERE id = ?`
          )
          .run(timestamp, context.orderId)
      })
      this.writeAudit(
        'shift.saved',
        'shift',
        id,
        null,
        { workerId: input.workerId, shiftDate: input.shiftDate, tasks: input.tasks },
        { risks: preview.risks, confirmedWarningCodes: input.confirmedWarningCodes ?? [] },
        timestamp
      )
    })()
    return this.getShiftSummary(id)!
  }

  updateShift(input: ShiftUpdateInput): ShiftSummary | null {
    const previous = this.getShiftDetail(input.id)
    if (!previous) return null
    if (previous.status !== 'scheduled') {
      throw new DomainValidationError('仅可编辑待执行的排班')
    }
    if (
      previous.tasks.some(
        (task) =>
          task.actualMinutes !== null ||
          task.qualifiedQuantity > 0 ||
          task.reworkQuantity > 0 ||
          task.scrapQuantity > 0
      )
    ) {
      throw new DomainValidationError('已登记实际制作结果的排班不能编辑')
    }
    const preview = this.previewShift(input, input.id)
    const timestamp = now()
    this.database.transaction(() => {
      this.database
        .prepare(
          `UPDATE shifts SET worker_id = ?, shift_date = ?, extra_minutes = ?,
          confirmed_risks_json = ?, detected_risks_json = ?, updated_at = ? WHERE id = ?`
        )
        .run(
          input.workerId,
          input.shiftDate,
          input.extraMinutes ?? 0,
          JSON.stringify(input.confirmedWarningCodes ?? []),
          JSON.stringify(preview.risks),
          timestamp,
          input.id
        )
      this.database.prepare('DELETE FROM shift_tasks WHERE shift_id = ?').run(input.id)
      const insertTask = this.database.prepare(
        `INSERT INTO shift_tasks (
          id, shift_id, order_item_id, product_id, planned_quantity, estimated_minutes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      input.tasks.forEach((task) => {
        const context = this.getOrderItemSchedulingContext(task.orderItemId)
        insertTask.run(
          randomUUID(),
          input.id,
          task.orderItemId,
          context.productId,
          task.plannedQuantity,
          Math.ceil(task.plannedQuantity * context.standardMinutesPerUnit),
          timestamp,
          timestamp
        )
        this.database
          .prepare(
            `UPDATE orders SET production_status = CASE
              WHEN production_status = 'pending_confirmation' THEN 'pending_schedule'
              ELSE production_status END, updated_at = ?
            WHERE id = ?`
          )
          .run(timestamp, context.orderId)
      })
      this.writeAudit(
        'shift.updated',
        'shift',
        input.id,
        {
          workerId: previous.workerId,
          shiftDate: previous.shiftDate,
          extraMinutes: previous.extraMinutes,
          tasks: previous.tasks.map((task) => ({
            orderItemId: task.orderItemId,
            plannedQuantity: task.plannedQuantity
          }))
        },
        {
          workerId: input.workerId,
          shiftDate: input.shiftDate,
          extraMinutes: input.extraMinutes ?? 0,
          tasks: input.tasks
        },
        { risks: preview.risks, confirmedWarningCodes: input.confirmedWarningCodes ?? [] },
        timestamp
      )
    })()
    return this.getShiftSummary(input.id)
  }

  recordProduction(input: ProductionRecordInput): ProductionRecord {
    const timestamp = now()
    const task = this.database
      .prepare(
        `SELECT st.id, st.planned_quantity, st.qualified_quantity AS previous_qualified_quantity,
        st.rework_quantity AS previous_rework_quantity, st.scrap_quantity AS previous_scrap_quantity,
        st.actual_minutes AS previous_actual_minutes, st.actual_labor_cost_cents AS previous_labor_cost_cents,
        st.commission_cost_cents AS previous_commission_cost_cents, s.worker_id, s.shift_date,
        oi.order_id, oi.product_snapshot_json
        FROM shift_tasks st JOIN shifts s ON s.id = st.shift_id JOIN order_items oi ON oi.id = st.order_item_id
        WHERE st.id = ?`
      )
      .get(input.shiftTaskId) as Row | undefined
    if (!task) throw new DomainValidationError('排班任务不存在')
    const wage = this.database
      .prepare(
        `SELECT hourly_wage_cents FROM worker_wage_history
        WHERE worker_id = ? AND effective_from <= ? ORDER BY effective_from DESC, created_at DESC LIMIT 1`
      )
      .get(task.worker_id, task.shift_date) as Row | undefined
    if (!wage) throw new DomainValidationError('未找到该排班日期对应的兼职人员时薪')
    const snapshot = JSON.parse(String(task.product_snapshot_json)) as ProductOrderSnapshot
    let costs: ReturnType<typeof calculateActualProductionCost>
    try {
      costs = calculateActualProductionCost({
        actualMinutes: input.actualMinutes,
        qualifiedQuantity: input.qualifiedQuantity,
        reworkQuantity: input.reworkQuantity,
        scrapQuantity: input.scrapQuantity,
        plannedQuantity: Number(task.planned_quantity),
        hourlyWageCents: Number(wage.hourly_wage_cents),
        commissionCentsPerUnit: snapshot.commissionCentsPerUnit
      })
    } catch (error) {
      throw new DomainValidationError(error instanceof Error ? error.message : '实际制作结果无效')
    }
    this.database.transaction(() => {
      this.database
        .prepare(
          `UPDATE shift_tasks SET actual_minutes = ?, qualified_quantity = ?, rework_quantity = ?,
          scrap_quantity = ?, actual_labor_cost_cents = ?, commission_cost_cents = ?, updated_at = ?
          WHERE id = ?`
        )
        .run(
          input.actualMinutes,
          input.qualifiedQuantity,
          input.reworkQuantity,
          input.scrapQuantity,
          costs.actualLaborCostCents,
          costs.commissionCostCents,
          timestamp,
          input.shiftTaskId
        )
      const progress = this.database
        .prepare(
          `SELECT COUNT(*) AS item_count,
          SUM(CASE WHEN oi.quantity <= COALESCE(done.qualified_quantity, 0) THEN 1 ELSE 0 END) AS completed_items
          FROM order_items oi LEFT JOIN (
            SELECT order_item_id, SUM(qualified_quantity) AS qualified_quantity
            FROM shift_tasks GROUP BY order_item_id
          ) done ON done.order_item_id = oi.id WHERE oi.order_id = ?`
        )
        .get(task.order_id) as { item_count: number; completed_items: number }
      const nextStatus =
        progress.item_count > 0 && progress.item_count === progress.completed_items
          ? 'pending_shipment'
          : 'in_production'
      this.database
        .prepare(
          `UPDATE orders SET production_status = CASE
            WHEN production_status IN ('pending_confirmation', 'pending_schedule', 'in_production') THEN ?
            ELSE production_status END, updated_at = ? WHERE id = ?`
        )
        .run(nextStatus, timestamp, task.order_id)
      this.refreshOrderActualCost(task.order_id, timestamp)
      this.writeAudit(
        'production.recorded',
        'production',
        input.shiftTaskId,
        {
          actualMinutes: task.previous_actual_minutes,
          qualifiedQuantity: task.previous_qualified_quantity,
          reworkQuantity: task.previous_rework_quantity,
          scrapQuantity: task.previous_scrap_quantity
        },
        { ...input, ...costs },
        { workerId: task.worker_id, wageCents: Number(wage.hourly_wage_cents) },
        timestamp
      )
    })()
    return {
      id: input.shiftTaskId,
      ...input,
      actualLaborCostCents: costs.actualLaborCostCents,
      commissionCostCents: costs.commissionCostCents,
      recordedAt: timestamp
    }
  }

  updateShiftStatus(input: ShiftStatusInput): ShiftSummary | null {
    const previous = this.getShiftSummary(input.shiftId)
    if (!previous) return null
    const timestamp = now()
    this.database.transaction(() => {
      if (input.status === 'completed') {
        const tasks = this.database
          .prepare('SELECT id FROM shift_tasks WHERE shift_id = ?')
          .all(input.shiftId) as Row[]
        const completions = input.taskCompletions ?? []
        if (
          tasks.length !== completions.length ||
          new Set(completions.map((item) => item.shiftTaskId)).size !== tasks.length ||
          tasks.some((task) => !completions.some((item) => item.shiftTaskId === String(task.id)))
        ) {
          throw new DomainValidationError('标记已完成时必须填写每个任务的合格与不合格数量')
        }
        const updateTask = this.database.prepare(
          'UPDATE shift_tasks SET qualified_quantity = ?, unqualified_quantity = ?, completed_quantity = ?, updated_at = ? WHERE id = ? AND shift_id = ?'
        )
        completions.forEach((item) =>
          updateTask.run(
            item.qualifiedQuantity,
            item.unqualifiedQuantity,
            item.qualifiedQuantity + item.unqualifiedQuantity,
            timestamp,
            item.shiftTaskId,
            input.shiftId
          )
        )
      }
      this.database
        .prepare('UPDATE shifts SET status = ?, updated_at = ? WHERE id = ?')
        .run(input.status, timestamp, input.shiftId)
      const orderIds = this.database
        .prepare(
          'SELECT DISTINCT oi.order_id FROM shift_tasks st JOIN order_items oi ON oi.id = st.order_item_id WHERE st.shift_id = ?'
        )
        .all(input.shiftId) as Row[]
      orderIds.forEach((row) => this.refreshOrderActualCost(String(row.order_id), timestamp))
      this.writeAudit(
        'shift.status.updated',
        'shift',
        input.shiftId,
        { status: previous.status },
        {
          status: input.status,
          taskCompletions: input.status === 'completed' ? input.taskCompletions : undefined
        },
        { releasesUnfinishedQuantity: ['leave', 'absent', 'cancelled'].includes(input.status) },
        timestamp
      )
    })()
    return this.getShiftSummary(input.shiftId)
  }

  getShiftDetail(id: string): ShiftDetail | null {
    const summary = this.getShiftSummary(id)
    if (!summary) return null
    const tasks = (
      this.database
        .prepare(
          `SELECT st.id, st.order_item_id, st.product_id, oi.order_id, o.code AS order_code,
          oi.product_snapshot_json, st.planned_quantity, st.estimated_minutes, st.actual_minutes,
          st.qualified_quantity, st.unqualified_quantity, st.completed_quantity, st.rework_quantity, st.scrap_quantity, st.actual_labor_cost_cents,
          st.commission_cost_cents
          FROM shift_tasks st
          JOIN order_items oi ON oi.id = st.order_item_id
          JOIN orders o ON o.id = oi.order_id
          WHERE st.shift_id = ? ORDER BY st.created_at, st.id`
        )
        .all(id) as Row[]
    ).map((row) => {
      const snapshot = JSON.parse(String(row.product_snapshot_json)) as ProductOrderSnapshot
      const plannedQuantity = Number(row.planned_quantity)
      const qualifiedQuantity = Number(row.qualified_quantity)
      const reworkQuantity = Number(row.rework_quantity)
      const scrapQuantity = Number(row.scrap_quantity)
      return {
        id: String(row.id),
        orderItemId: String(row.order_item_id),
        productId: String(row.product_id),
        productName: snapshot.name,
        orderId: String(row.order_id),
        orderCode: String(row.order_code),
        plannedQuantity,
        estimatedMinutes: Number(row.estimated_minutes),
        baseMinutes: Number(row.estimated_minutes),
        actualMinutes: row.actual_minutes === null ? null : Number(row.actual_minutes),
        completedQuantity: row.completed_quantity === null ? null : Number(row.completed_quantity),
        qualifiedQuantity,
        unqualifiedQuantity:
          row.unqualified_quantity === null ? null : Number(row.unqualified_quantity),
        reworkQuantity,
        scrapQuantity,
        actualLaborCostCents: Number(row.actual_labor_cost_cents),
        commissionCostCents: Number(row.commission_cost_cents),
        unfinishedQuantity: Math.max(
          0,
          plannedQuantity - qualifiedQuantity - reworkQuantity - scrapQuantity
        )
      }
    })
    return { ...summary, tasks }
  }

  getOrderItemSchedulingContext(orderItemId: string): {
    productId: string
    orderId: string
    standardMinutesPerUnit: number
  } {
    const row = this.database
      .prepare(
        `SELECT oi.product_id, oi.order_id, oi.product_snapshot_json
        FROM order_items oi WHERE oi.id = ?`
      )
      .get(orderItemId) as Row | undefined
    if (!row) throw new DomainValidationError('订单商品明细不存在')
    const snapshot = JSON.parse(String(row.product_snapshot_json)) as ProductOrderSnapshot
    return {
      productId: String(row.product_id),
      orderId: String(row.order_id),
      standardMinutesPerUnit: snapshot.standardMinutesPerUnit
    }
  }

  private getShiftSummary(id: string): ShiftSummary | null {
    const row = this.database
      .prepare(
        `SELECT s.id, s.worker_id, w.name AS worker_name, s.shift_date, s.start_time, s.end_time, s.extra_minutes, s.status,
        s.confirmed_risks_json, COUNT(st.id) AS task_count, COALESCE(SUM(st.estimated_minutes), 0) AS base_task_minutes
        FROM shifts s JOIN workers w ON w.id = s.worker_id LEFT JOIN shift_tasks st ON st.shift_id = s.id
        WHERE s.id = ? GROUP BY s.id`
      )
      .get(id) as Row | undefined
    return row
      ? {
          id: String(row.id),
          workerId: String(row.worker_id),
          workerName: String(row.worker_name),
          shiftDate: String(row.shift_date),
          startTime: (row.start_time as string | null) ?? null,
          endTime: (row.end_time as string | null) ?? null,
          baseTaskMinutes: Number(row.base_task_minutes),
          extraMinutes: Number(row.extra_minutes),
          totalMinutes: Number(row.base_task_minutes) + Number(row.extra_minutes),
          status: String(row.status),
          taskCount: Number(row.task_count),
          confirmedRisks: JSON.parse(String(row.confirmed_risks_json)) as string[]
        }
      : null
  }

  listAuditLogs(entityType?: string): AuditLogSummary[] {
    const rows = (
      entityType
        ? this.database
            .prepare(
              `SELECT id, action, entity_type, entity_id, actor_name, created_at
              FROM audit_logs WHERE entity_type = ? ORDER BY created_at DESC`
            )
            .all(entityType)
        : this.database
            .prepare(
              `SELECT id, action, entity_type, entity_id, actor_name, created_at
              FROM audit_logs ORDER BY created_at DESC`
            )
            .all()
    ) as Row[]
    return rows.map((row) => ({
      id: String(row.id),
      action: String(row.action),
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      actorName: String(row.actor_name),
      createdAt: String(row.created_at)
    }))
  }

  recordAudit(input: AuditLogInput): AuditLogDetail {
    const id = randomUUID()
    const timestamp = now()
    this.database.transaction(() => {
      this.writeAudit(
        input.action,
        input.entityType,
        input.entityId,
        input.before ?? null,
        input.after ?? null,
        input.metadata ?? {},
        timestamp,
        id
      )
    })()
    return this.getAuditLog(id)!
  }

  createAttachment(input: AttachmentSummary): AttachmentSummary {
    this.database
      .prepare(
        `INSERT INTO attachments (
          id, kind, original_name, storage_path, mime_type, size_bytes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.kind,
        input.originalName,
        input.storagePath,
        input.mimeType,
        input.sizeBytes,
        input.createdAt
      )
    return input
  }

  getAttachment(id: string): AttachmentSummary | null {
    const row = this.database
      .prepare(
        `SELECT id, kind, original_name, storage_path, mime_type, size_bytes, created_at
        FROM attachments WHERE id = ?`
      )
      .get(id) as Row | undefined
    return row
      ? {
          id: String(row.id),
          kind: row.kind as AttachmentSummary['kind'],
          originalName: String(row.original_name),
          storagePath: String(row.storage_path),
          mimeType: (row.mime_type as string | null) ?? null,
          sizeBytes: Number(row.size_bytes),
          createdAt: String(row.created_at)
        }
      : null
  }

  getAttachmentByStoragePath(storagePath: string): AttachmentSummary | null {
    const row = this.database
      .prepare(
        `SELECT id, kind, original_name, storage_path, mime_type, size_bytes, created_at
        FROM attachments WHERE storage_path = ?`
      )
      .get(storagePath) as Row | undefined
    return row
      ? {
          id: String(row.id),
          kind: row.kind as AttachmentSummary['kind'],
          originalName: String(row.original_name),
          storagePath: String(row.storage_path),
          mimeType: (row.mime_type as string | null) ?? null,
          sizeBytes: Number(row.size_bytes),
          createdAt: String(row.created_at)
        }
      : null
  }

  deleteAttachment(id: string): AttachmentSummary | null {
    const attachment = this.getAttachment(id)
    if (!attachment) return null
    this.database.prepare('DELETE FROM attachments WHERE id = ?').run(id)
    return attachment
  }

  getAuditLog(id: string): AuditLogDetail | null {
    const row = this.database
      .prepare(
        `SELECT id, action, entity_type, entity_id, before_json, after_json,
        metadata_json, actor_name, created_at FROM audit_logs WHERE id = ?`
      )
      .get(id) as Row | undefined
    if (!row) return null
    return {
      id: String(row.id),
      action: String(row.action),
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      actorName: String(row.actor_name),
      createdAt: String(row.created_at),
      before: this.parseAuditJson(row.before_json),
      after: this.parseAuditJson(row.after_json),
      metadata: this.parseAuditJson(row.metadata_json)
    }
  }

  listWorkers(): WorkerSummary[] {
    return (
      this.database
        .prepare(
          `SELECT id, name, hourly_wage_cents, default_work_start, default_work_end, active
          FROM workers ORDER BY active DESC, name`
        )
        .all() as Row[]
    ).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      hourlyWageCents: Number(row.hourly_wage_cents),
      defaultWorkStart: (row.default_work_start as string | null) ?? null,
      defaultWorkEnd: (row.default_work_end as string | null) ?? null,
      active: Boolean(row.active)
    }))
  }

  createWorker(input: WorkerCreateInput): WorkerSummary {
    const id = randomUUID()
    const timestamp = now()
    this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO workers (id, name, phone, hourly_wage_cents, default_work_start, default_work_end, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.name.trim(),
          input.phone?.trim() || null,
          input.hourlyWageCents,
          input.defaultWorkStart || null,
          input.defaultWorkEnd || null,
          timestamp,
          timestamp
        )
      this.database
        .prepare(
          `INSERT INTO worker_wage_history (id, worker_id, hourly_wage_cents, effective_from, created_at)
          VALUES (?, ?, ?, ?, ?)`
        )
        .run(randomUUID(), id, input.hourlyWageCents, timestamp.slice(0, 10), timestamp)
      this.writeAudit('worker.created', 'worker', id, null, input, {}, timestamp)
    })()
    return this.listWorkers().find((worker) => worker.id === id)!
  }

  updateWorker(input: WorkerUpdateInput): WorkerSummary | null {
    const previous = this.listWorkers().find((worker) => worker.id === input.id)
    if (!previous) return null
    const timestamp = now()
    this.database.transaction(() => {
      this.database
        .prepare(
          `UPDATE workers SET name = ?, phone = ?, hourly_wage_cents = ?, default_work_start = ?,
          default_work_end = ?, active = ?, updated_at = ? WHERE id = ?`
        )
        .run(
          input.name.trim(),
          input.phone?.trim() || null,
          input.hourlyWageCents,
          input.defaultWorkStart || null,
          input.defaultWorkEnd || null,
          input.active ? 1 : 0,
          timestamp,
          input.id
        )
      if (input.hourlyWageCents !== previous.hourlyWageCents) {
        this.database
          .prepare(
            `INSERT INTO worker_wage_history (id, worker_id, hourly_wage_cents, effective_from, created_at)
            VALUES (?, ?, ?, ?, ?)`
          )
          .run(randomUUID(), input.id, input.hourlyWageCents, input.effectiveFrom, timestamp)
      }
      this.writeAudit('worker.updated', 'worker', input.id, previous, input, {}, timestamp)
    })()
    return this.listWorkers().find((worker) => worker.id === input.id) ?? null
  }

  getWorkerWageHistory(workerId: string): WorkerWageHistory[] {
    return (
      this.database
        .prepare(
          `SELECT id, worker_id, hourly_wage_cents, effective_from, created_at
          FROM worker_wage_history WHERE worker_id = ? ORDER BY effective_from DESC, created_at DESC`
        )
        .all(workerId) as Row[]
    ).map((row) => ({
      id: String(row.id),
      workerId: String(row.worker_id),
      hourlyWageCents: Number(row.hourly_wage_cents),
      effectiveFrom: String(row.effective_from),
      createdAt: String(row.created_at)
    }))
  }

  getWorkerDetail(id: string): WorkerDetail | null {
    const workerRow = this.database
      .prepare(
        `SELECT id, name, phone, hourly_wage_cents, default_work_start, default_work_end, active
        FROM workers WHERE id = ?`
      )
      .get(id) as Row | undefined
    if (!workerRow) return null
    const summary: WorkerSummary = {
      id: String(workerRow.id),
      name: String(workerRow.name),
      hourlyWageCents: Number(workerRow.hourly_wage_cents),
      defaultWorkStart: (workerRow.default_work_start as string | null) ?? null,
      defaultWorkEnd: (workerRow.default_work_end as string | null) ?? null,
      active: Boolean(workerRow.active)
    }
    const shifts = (
      this.database
        .prepare(
          `SELECT s.id, s.worker_id, w.name AS worker_name, s.shift_date, s.start_time, s.end_time, s.status,
          s.confirmed_risks_json, COUNT(DISTINCT st.id) AS task_count, s.extra_minutes, COALESCE(SUM(st.estimated_minutes), 0) AS base_task_minutes,
          COALESCE(SUM(st.actual_minutes), 0) AS actual_minutes,
          COALESCE(SUM(st.qualified_quantity), 0) AS qualified_quantity,
          COALESCE(SUM(st.commission_cost_cents), 0) AS commission_cost_cents
          FROM shifts s JOIN workers w ON w.id = s.worker_id
          LEFT JOIN shift_tasks st ON st.shift_id = s.id
          WHERE s.worker_id = ?
          GROUP BY s.id ORDER BY s.shift_date DESC, s.start_time DESC`
        )
        .all(id) as Row[]
    ).map((row) => {
      const shift: WorkerShiftSummary = {
        id: String(row.id),
        workerId: String(row.worker_id),
        workerName: String(row.worker_name),
        shiftDate: String(row.shift_date),
        startTime: (row.start_time as string | null) ?? null,
        endTime: (row.end_time as string | null) ?? null,
        baseTaskMinutes: Number(row.base_task_minutes),
        extraMinutes: Number(row.extra_minutes),
        totalMinutes: Number(row.base_task_minutes) + Number(row.extra_minutes),
        status: String(row.status),
        taskCount: Number(row.task_count),
        confirmedRisks: JSON.parse(String(row.confirmed_risks_json)) as string[],
        actualMinutes: Number(row.actual_minutes),
        qualifiedQuantity: Number(row.qualified_quantity),
        commissionCostCents: Number(row.commission_cost_cents)
      }
      return shift
    })
    const orderTasks = (
      this.database
        .prepare(
          `SELECT s.id AS shift_id, s.shift_date, s.status AS shift_status,
          o.id AS order_id, o.code AS order_code, st.order_item_id,
          oi.product_snapshot_json, st.planned_quantity, st.qualified_quantity, st.unqualified_quantity
          FROM shift_tasks st
          JOIN shifts s ON s.id = st.shift_id
          JOIN order_items oi ON oi.id = st.order_item_id
          JOIN orders o ON o.id = oi.order_id
          WHERE s.worker_id = ?
          ORDER BY s.shift_date DESC, s.created_at DESC, st.created_at DESC`
        )
        .all(id) as Row[]
    ).map((row) => ({
      shiftId: String(row.shift_id),
      shiftDate: String(row.shift_date),
      shiftStatus: row.shift_status as ShiftStatus,
      orderId: String(row.order_id),
      orderCode: String(row.order_code),
      orderItemId: String(row.order_item_id),
      productName: (JSON.parse(String(row.product_snapshot_json)) as ProductOrderSnapshot).name,
      plannedQuantity: Number(row.planned_quantity),
      qualifiedQuantity: Number(row.qualified_quantity),
      unqualifiedQuantity: Number(row.unqualified_quantity),
      unfinishedQuantity: Math.max(
        0,
        Number(row.planned_quantity) -
          Number(row.qualified_quantity) -
          Number(row.unqualified_quantity)
      )
    }))
    return {
      ...summary,
      phone: (workerRow.phone as string | null) ?? null,
      wageHistory: this.getWorkerWageHistory(id),
      shifts,
      orderTasks,
      totalActualMinutes: shifts.reduce((sum, shift) => sum + shift.actualMinutes, 0),
      totalQualifiedQuantity: shifts.reduce((sum, shift) => sum + shift.qualifiedQuantity, 0),
      totalCommissionCostCents: shifts.reduce((sum, shift) => sum + shift.commissionCostCents, 0),
      absenceCount: shifts.filter((shift) => ['absent', 'leave'].includes(shift.status)).length
    }
  }

  listOrders(): OrderSummary[] {
    return this.queryOrderSummaries('', [])
  }

  queryOrderProfitReport(query: OrderProfitReportQuery): OrderProfitReport {
    const conditions = ['o.expected_ship_date BETWEEN ? AND ?']
    const parameters: unknown[] = [query.fromDate, query.toDate]
    if (query.productionStatus && query.productionStatus !== 'all') {
      conditions.push('o.production_status = ?')
      parameters.push(query.productionStatus)
    }
    const rows = this.database
      .prepare(
        `SELECT o.id, o.code, o.customer_snapshot_json, o.expected_ship_date,
        o.production_status, o.receivable_cents, o.estimated_cost_cents, o.actual_cost_cents,
        COALESCE(SUM(CASE WHEN p.type = 'receipt' THEN p.amount_cents ELSE 0 END), 0) AS received_cents,
        COALESCE(SUM(CASE WHEN p.type = 'refund' THEN p.amount_cents ELSE 0 END), 0) AS refunded_cents
        FROM orders o LEFT JOIN payments p ON p.order_id = o.id
        WHERE ${conditions.join(' AND ')}
        GROUP BY o.id ORDER BY o.expected_ship_date ASC, o.created_at ASC`
      )
      .all(...parameters) as Row[]
    const reportRows = rows
      .map((row): OrderProfitReportRow => {
        const customer = JSON.parse(String(row.customer_snapshot_json)) as CustomerProfile
        const financial = orderFinancial(Number(row.receivable_cents), [
          { type: 'receipt', amountCents: Number(row.received_cents) },
          { type: 'refund', amountCents: Number(row.refunded_cents) }
        ])
        const estimatedCostCents = Number(row.estimated_cost_cents)
        const actualCostCents = Number(row.actual_cost_cents)
        return {
          id: String(row.id),
          code: String(row.code),
          customerName: customer.name || '未命名客户',
          expectedShipDate: String(row.expected_ship_date),
          productionStatus: row.production_status as ProductionStatus,
          financialStatus: financial.status,
          receivableCents: Number(row.receivable_cents),
          receivedNetCents: financial.receivedNetCents,
          outstandingCents: financial.outstandingCents,
          estimatedCostCents,
          actualCostCents,
          estimatedProfitCents: Number(row.receivable_cents) - estimatedCostCents,
          actualProfitCents: financial.receivedNetCents - actualCostCents
        }
      })
      .filter((row) => !query.outstandingOnly || row.outstandingCents > 0)
    return {
      rows: reportRows,
      totals: reportRows.reduce(
        (totals, row) => ({
          orderCount: totals.orderCount + 1,
          receivableCents: totals.receivableCents + row.receivableCents,
          receivedNetCents: totals.receivedNetCents + row.receivedNetCents,
          outstandingCents: totals.outstandingCents + row.outstandingCents,
          estimatedCostCents: totals.estimatedCostCents + row.estimatedCostCents,
          actualCostCents: totals.actualCostCents + row.actualCostCents,
          estimatedProfitCents: totals.estimatedProfitCents + row.estimatedProfitCents,
          actualProfitCents: totals.actualProfitCents + row.actualProfitCents
        }),
        {
          orderCount: 0,
          receivableCents: 0,
          receivedNetCents: 0,
          outstandingCents: 0,
          estimatedCostCents: 0,
          actualCostCents: 0,
          estimatedProfitCents: 0,
          actualProfitCents: 0
        }
      )
    }
  }

  queryWorkerSettlementReport(query: WorkerSettlementReportQuery): WorkerSettlementReport {
    const rows = this.database
      .prepare(
        `SELECT w.id AS worker_id, w.name AS worker_name,
        COALESCE(SUM(st.actual_minutes), 0) AS actual_minutes,
        COALESCE(SUM(st.qualified_quantity), 0) AS qualified_quantity,
        COALESCE(SUM(st.actual_labor_cost_cents), 0) AS labor_cost_cents,
        COALESCE(SUM(st.commission_cost_cents), 0) AS commission_cost_cents,
        SUM(CASE WHEN s.status IN ('absent', 'leave') THEN 1 ELSE 0 END) AS absence_count
        FROM workers w JOIN shifts s ON s.worker_id = w.id
        LEFT JOIN shift_tasks st ON st.shift_id = s.id
        WHERE s.shift_date BETWEEN ? AND ?
        GROUP BY w.id ORDER BY w.name ASC`
      )
      .all(query.fromDate, query.toDate) as Row[]
    const reportRows = rows.map((row): WorkerSettlementReportRow => ({
      workerId: String(row.worker_id),
      workerName: String(row.worker_name),
      actualMinutes: Number(row.actual_minutes),
      qualifiedQuantity: Number(row.qualified_quantity),
      laborCostCents: Number(row.labor_cost_cents),
      commissionCostCents: Number(row.commission_cost_cents),
      absenceCount: Number(row.absence_count)
    }))
    return {
      rows: reportRows,
      totals: reportRows.reduce(
        (totals, row) => ({
          workerCount: totals.workerCount + 1,
          actualMinutes: totals.actualMinutes + row.actualMinutes,
          qualifiedQuantity: totals.qualifiedQuantity + row.qualifiedQuantity,
          laborCostCents: totals.laborCostCents + row.laborCostCents,
          commissionCostCents: totals.commissionCostCents + row.commissionCostCents,
          absenceCount: totals.absenceCount + row.absenceCount
        }),
        {
          workerCount: 0,
          actualMinutes: 0,
          qualifiedQuantity: 0,
          laborCostCents: 0,
          commissionCostCents: 0,
          absenceCount: 0
        }
      )
    }
  }

  queryMonthlyProductionWeight(query: MonthlyProductionWeightQuery): MonthlyProductionWeightReport {
    const rows = this.database
      .prepare(
        `SELECT st.completed_quantity, st.qualified_quantity, st.unqualified_quantity, oi.product_snapshot_json
        FROM shift_tasks st
        JOIN shifts s ON s.id = st.shift_id
        JOIN order_items oi ON oi.id = st.order_item_id
        WHERE s.status = 'completed'
          AND st.completed_quantity IS NOT NULL
          AND st.qualified_quantity IS NOT NULL
          AND st.unqualified_quantity IS NOT NULL
          AND st.completed_quantity = st.qualified_quantity + st.unqualified_quantity
          AND substr(s.shift_date, 1, 7) = ?`
      )
      .all(query.month) as Row[]
    const totals = rows.reduce(
      (result, row) => {
        const snapshot = JSON.parse(String(row.product_snapshot_json)) as ProductOrderSnapshot
        const completedQuantity = Number(row.completed_quantity ?? 0)
        return {
          completedQuantity: result.completedQuantity + completedQuantity,
          qualifiedQuantity: result.qualifiedQuantity + Number(row.qualified_quantity ?? 0),
          unqualifiedQuantity: result.unqualifiedQuantity + Number(row.unqualified_quantity ?? 0),
          totalWeightGrams:
            result.totalWeightGrams + completedQuantity * Number(snapshot.weightGrams)
        }
      },
      { completedQuantity: 0, qualifiedQuantity: 0, unqualifiedQuantity: 0, totalWeightGrams: 0 }
    )
    return {
      month: query.month,
      ...totals,
      totalWeightKilograms: Number((totals.totalWeightGrams / 1000).toFixed(3))
    }
  }

  queryCapacityRiskReport(query: CapacityRiskReportQuery): CapacityRiskReport {
    const settings = this.getCostSettings()
    const productRows = this.database
      .prepare(
        `SELECT p.id, p.name, p.weight_grams, p.loss_rate, p.standard_minutes_per_unit, p.packaging_cost_cents,
        p.commission_cents_per_unit, p.mold_count, p.output_per_mold_per_batch, p.max_batches_per_day,
        COALESCE(SUM(CASE WHEN s.status NOT IN ('leave', 'absent', 'cancelled') THEN st.planned_quantity ELSE 0 END), 0) AS planned_quantity,
        COALESCE(SUM(CASE WHEN s.status NOT IN ('leave', 'absent', 'cancelled') THEN st.qualified_quantity ELSE 0 END), 0) AS qualified_quantity
        FROM products p
        LEFT JOIN shift_tasks st ON st.product_id = p.id
        LEFT JOIN shifts s ON s.id = st.shift_id AND s.shift_date BETWEEN ? AND ?
        GROUP BY p.id ORDER BY p.name ASC`
      )
      .all(query.fromDate, query.toDate) as Row[]
    const products = productRows.map((row): ProductCapacityReportRow => ({
      productId: String(row.id),
      productName: String(row.name),
      estimatedCostPerUnitCents: Math.round(
        (Number(row.weight_grams) *
          (1 + Number(row.loss_rate)) *
          settings.gluePriceMilliYuanPerGram) /
          10 +
          Number(row.packaging_cost_cents) +
          Number(row.commission_cents_per_unit)
      ),
      dailyCapacity:
        Number(row.mold_count) *
        Number(row.output_per_mold_per_batch) *
        Number(row.max_batches_per_day),
      plannedQuantity: Number(row.planned_quantity),
      qualifiedQuantity: Number(row.qualified_quantity)
    }))
    const dailyRows = this.database
      .prepare(
        `SELECT s.shift_date AS date, p.id AS product_id, p.name AS product_name,
        SUM(st.planned_quantity) AS planned_quantity, SUM(st.qualified_quantity) AS qualified_quantity,
        p.mold_count, p.output_per_mold_per_batch, p.max_batches_per_day,
        COALESCE((SELECT SUM(MAX(0, oi.quantity - COALESCE((
          SELECT SUM(st2.planned_quantity) FROM shift_tasks st2 JOIN shifts s2 ON s2.id = st2.shift_id
          WHERE st2.order_item_id = oi.id AND s2.shift_date <= s.shift_date
          AND s2.status NOT IN ('leave', 'absent', 'cancelled')
        ), 0))) FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = p.id AND o.production_status NOT IN ('completed', 'cancelled')
        AND o.production_deadline <= s.shift_date), 0) AS pending_schedule_quantity
        FROM shift_tasks st JOIN shifts s ON s.id = st.shift_id JOIN products p ON p.id = st.product_id
        WHERE s.shift_date BETWEEN ? AND ? AND s.status NOT IN ('leave', 'absent', 'cancelled')
        GROUP BY s.shift_date, p.id ORDER BY s.shift_date ASC, p.name ASC`
      )
      .all(query.fromDate, query.toDate) as Row[]
    const daily = dailyRows.map((row): DailyCapacityReportRow => ({
      date: String(row.date),
      productId: String(row.product_id),
      productName: String(row.product_name),
      plannedQuantity: Number(row.planned_quantity),
      qualifiedQuantity: Number(row.qualified_quantity),
      dailyCapacity:
        Number(row.mold_count) *
        Number(row.output_per_mold_per_batch) *
        Number(row.max_batches_per_day),
      pendingScheduleQuantity: 0
    }))
    const riskRows = this.database
      .prepare(
        `SELECT o.id AS order_id, o.code AS order_code, o.customer_snapshot_json, o.expected_ship_date,
        o.production_deadline, oi.quantity,
        COALESCE(SUM(CASE WHEN s.status NOT IN ('leave', 'absent', 'cancelled') THEN st.planned_quantity ELSE 0 END), 0) AS planned_quantity,
        COALESCE(SUM(CASE WHEN s.status NOT IN ('leave', 'absent', 'cancelled') THEN st.qualified_quantity ELSE 0 END), 0) AS qualified_quantity
        FROM orders o JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN shift_tasks st ON st.order_item_id = oi.id
        LEFT JOIN shifts s ON s.id = st.shift_id
        WHERE o.expected_ship_date BETWEEN ? AND ? AND o.production_status NOT IN ('completed', 'cancelled')
        GROUP BY oi.id ORDER BY o.expected_ship_date ASC, o.created_at ASC`
      )
      .all(query.fromDate, query.toDate) as Row[]
    const risksByOrder = new Map<string, DeliveryRiskReportRow>()
    riskRows.forEach((row) => {
      const id = String(row.order_id)
      const quantity = Number(row.quantity)
      const planned = Number(row.planned_quantity)
      const qualified = Number(row.qualified_quantity)
      const remaining = Math.max(0, quantity - qualified)
      const pending = Math.max(0, quantity - planned)
      const reasons: string[] = []
      if (pending > 0) reasons.push(`待排 ${pending} 个`)
      if (String(row.production_deadline) <= query.toDate && remaining > 0)
        reasons.push(`制作截止 ${String(row.production_deadline)}`)
      if (reasons.length === 0 || remaining === 0) return
      const customer = JSON.parse(String(row.customer_snapshot_json)) as CustomerProfile
      const existing = risksByOrder.get(id)
      const next: DeliveryRiskReportRow = existing ?? {
        orderId: id,
        orderCode: String(row.order_code),
        customerName: customer.name || '未命名客户',
        expectedShipDate: String(row.expected_ship_date),
        productionDeadline: String(row.production_deadline),
        remainingQuantity: 0,
        pendingScheduleQuantity: 0,
        riskReasons: []
      }
      next.remainingQuantity += remaining
      next.pendingScheduleQuantity += pending
      reasons.forEach((reason) => {
        if (!next.riskReasons.includes(reason)) next.riskReasons.push(reason)
      })
      risksByOrder.set(id, next)
    })
    return { products, daily, risks: [...risksByOrder.values()] }
  }

  listShifts(from: string, to: string): ShiftSummary[] {
    return (
      this.database
        .prepare(
          `SELECT s.id, s.worker_id, w.name AS worker_name, s.shift_date, s.start_time, s.end_time, s.extra_minutes, s.status,
          s.confirmed_risks_json, COUNT(st.id) AS task_count, COALESCE(SUM(st.estimated_minutes), 0) AS base_task_minutes
          FROM shifts s JOIN workers w ON w.id = s.worker_id LEFT JOIN shift_tasks st ON st.shift_id = s.id
          WHERE s.shift_date BETWEEN ? AND ? GROUP BY s.id ORDER BY s.shift_date, s.id`
        )
        .all(from, to) as Row[]
    ).map((row) => ({
      id: String(row.id),
      workerId: String(row.worker_id),
      workerName: String(row.worker_name),
      shiftDate: String(row.shift_date),
      startTime: (row.start_time as string | null) ?? null,
      endTime: (row.end_time as string | null) ?? null,
      baseTaskMinutes: Number(row.base_task_minutes),
      extraMinutes: Number(row.extra_minutes),
      totalMinutes: Number(row.base_task_minutes) + Number(row.extra_minutes),
      status: String(row.status),
      taskCount: Number(row.task_count),
      confirmedRisks: JSON.parse(String(row.confirmed_risks_json)) as string[]
    }))
  }

  getDashboard(): DashboardSummary {
    const today = new Date().toISOString().slice(0, 10)
    const financial = this.database
      .prepare(
        `SELECT COUNT(*) AS count, COALESCE(SUM(outstanding), 0) AS amount FROM (
          SELECT o.id, o.receivable_cents - COALESCE(SUM(CASE WHEN p.type = 'receipt' THEN p.amount_cents ELSE -p.amount_cents END), 0) AS outstanding
          FROM orders o LEFT JOIN payments p ON p.order_id = o.id GROUP BY o.id
        ) WHERE outstanding > 0`
      )
      .get() as { count: number; amount: number }
    const upcoming = this.database
      .prepare(
        `SELECT COUNT(*) AS count FROM orders WHERE expected_ship_date >= ? AND expected_ship_date <= date(?, '+7 day') AND production_status NOT IN ('completed', 'cancelled')`
      )
      .get(today, today) as { count: number }
    const reschedule = this.database
      .prepare(
        `SELECT COALESCE(SUM(st.planned_quantity - st.qualified_quantity), 0) AS count
        FROM shift_tasks st JOIN shifts s ON s.id = st.shift_id WHERE s.status IN ('leave', 'absent', 'cancelled')`
      )
      .get() as { count: number }
    const risks = this.database
      .prepare(
        'SELECT COUNT(*) AS count FROM shifts WHERE json_array_length(detected_risks_json) > 0'
      )
      .get() as { count: number }
    return {
      outstandingOrderCount: financial.count,
      outstandingCents: financial.amount,
      upcomingOrderCount: upcoming.count,
      rescheduleTaskCount: reschedule.count,
      riskShiftCount: risks.count
    }
  }

  private insertCustomer(input: CustomerInput): CustomerProfile {
    const id = randomUUID()
    const timestamp = now()
    this.database
      .prepare(
        `INSERT INTO customers (id, name, contact, default_address, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.name.trim(),
        input.contact?.trim() || null,
        input.defaultAddress?.trim() || null,
        input.notes?.trim() || null,
        timestamp,
        timestamp
      )
    return this.getCustomer(id)!
  }

  private getOrderProgress(orderId: string) {
    const rows = this.database
      .prepare(
        `SELECT oi.id AS order_item_id, oi.quantity,
        COALESCE(SUM(CASE WHEN s.status = 'scheduled' THEN st.planned_quantity ELSE 0 END), 0) AS scheduled_quantity,
        COALESCE(SUM(st.qualified_quantity), 0) AS qualified_quantity,
        COALESCE(SUM(st.unqualified_quantity), 0) AS unqualified_quantity,
        MAX(CASE WHEN s.status IN ('leave', 'absent', 'cancelled', 'completed')
          OR st.qualified_quantity > 0 OR st.rework_quantity > 0 OR st.scrap_quantity > 0
          THEN 1 ELSE 0 END) AS has_released_quantity
        FROM order_items oi
        LEFT JOIN shift_tasks st ON st.order_item_id = oi.id
        LEFT JOIN shifts s ON s.id = st.shift_id
        WHERE oi.order_id = ?
        GROUP BY oi.id`
      )
      .all(orderId) as Row[]
    const items = new Map(
      rows.map((row) => {
        const progress = calculateProductionProgress({
          orderedQuantity: Number(row.quantity),
          qualifiedQuantity: Number(row.qualified_quantity),
          unqualifiedQuantity: Number(row.unqualified_quantity),
          scheduledQuantity: Number(row.scheduled_quantity),
          hasReleasedQuantity: Number(row.has_released_quantity) === 1
        })
        return [String(row.order_item_id), progress] as const
      })
    )
    const summary = calculateProductionProgress({
      orderedQuantity: [...items.values()].reduce((sum, item) => sum + item.orderedQuantity, 0),
      qualifiedQuantity: [...items.values()].reduce((sum, item) => sum + item.qualifiedQuantity, 0),
      unqualifiedQuantity: [...items.values()].reduce(
        (sum, item) => sum + item.unqualifiedQuantity,
        0
      ),
      scheduledQuantity: [...items.values()].reduce((sum, item) => sum + item.scheduledQuantity, 0),
      hasReleasedQuantity: [...items.values()].some(
        (item) => item.status === 'pending_replenishment'
      )
    })
    return { items, summary }
  }

  private listOrderRelatedSchedules(orderId: string) {
    return (
      this.database
        .prepare(
          `SELECT s.id, s.worker_id, w.name AS worker_name, s.shift_date, s.status,
          st.planned_quantity, st.qualified_quantity, st.unqualified_quantity, st.order_item_id, oi.product_snapshot_json
          FROM shift_tasks st
          JOIN shifts s ON s.id = st.shift_id
          JOIN workers w ON w.id = s.worker_id
          JOIN order_items oi ON oi.id = st.order_item_id
          WHERE oi.order_id = ?
          ORDER BY s.shift_date DESC, s.created_at DESC, st.created_at DESC`
        )
        .all(orderId) as Row[]
    ).map((row) => ({
      id: String(row.id),
      workerId: String(row.worker_id),
      workerName: String(row.worker_name),
      shiftDate: String(row.shift_date),
      status: row.status as ShiftStatus,
      plannedQuantity: Number(row.planned_quantity),
      qualifiedQuantity: Number(row.qualified_quantity),
      unqualifiedQuantity: Number(row.unqualified_quantity),
      unfinishedQuantity: Math.max(
        0,
        Number(row.planned_quantity) -
          Number(row.qualified_quantity) -
          Number(row.unqualified_quantity)
      ),
      orderItemId: String(row.order_item_id),
      productName: (JSON.parse(String(row.product_snapshot_json)) as ProductOrderSnapshot).name
    }))
  }

  private listPayments(orderId: string): PaymentRecord[] {
    return (
      this.database
        .prepare(
          `SELECT id, order_id, type, amount_cents, payment_method, paid_at, note, receipt_attachment_id, created_at
          FROM payments WHERE order_id = ? ORDER BY paid_at, created_at`
        )
        .all(orderId) as Row[]
    ).map((row) => ({
      id: String(row.id),
      orderId: String(row.order_id),
      type: row.type as PaymentRecord['type'],
      amountCents: Number(row.amount_cents),
      paymentMethod: String(row.payment_method),
      paidAt: String(row.paid_at),
      note: (row.note as string | null) ?? null,
      receiptAttachmentId: (row.receipt_attachment_id as string | null) ?? null,
      createdAt: String(row.created_at)
    }))
  }

  private queryCustomerOverviews(whereSql: string, parameters: unknown[]): CustomerOverview[] {
    const rows = this.database
      .prepare(
        `SELECT c.id, c.name, c.contact, c.default_address, c.notes, c.created_at, c.updated_at,
        COUNT(o.id) AS order_count,
        COALESCE(SUM(CASE WHEN o.production_status = 'pending_shipment' THEN 1 ELSE 0 END), 0) AS pending_shipment_order_count,
        COALESCE(SUM(o.receivable_cents - COALESCE(payment.received_net_cents, 0)), 0) AS outstanding_cents,
        MAX(o.created_at) AS latest_order_at
        FROM customers c
        LEFT JOIN orders o ON o.customer_id = c.id
        LEFT JOIN (
          SELECT order_id,
          SUM(CASE WHEN type = 'receipt' THEN amount_cents ELSE -amount_cents END) AS received_net_cents
          FROM payments GROUP BY order_id
        ) payment ON payment.order_id = o.id
        ${whereSql}
        GROUP BY c.id
        ORDER BY c.updated_at DESC, c.name`
      )
      .all(...parameters) as Row[]
    return rows.map((row) => ({
      ...customerFromRow(row),
      orderCount: Number(row.order_count),
      pendingShipmentOrderCount: Number(row.pending_shipment_order_count),
      outstandingCents: Number(row.outstanding_cents),
      latestOrderAt: row.latest_order_at ? String(row.latest_order_at) : null
    }))
  }

  private queryOrderSummaries(whereSql: string, parameters: unknown[]): OrderSummary[] {
    const rows = this.database
      .prepare(
        `SELECT o.id, o.code, o.customer_snapshot_json, o.expected_ship_date, o.production_deadline,
        o.production_status, o.receivable_cents,
        COALESCE(SUM(CASE WHEN p.type = 'receipt' THEN p.amount_cents ELSE 0 END), 0) AS received_cents,
        COALESCE(SUM(CASE WHEN p.type = 'refund' THEN p.amount_cents ELSE 0 END), 0) AS refunded_cents
        FROM orders o LEFT JOIN payments p ON p.order_id = o.id
        ${whereSql} GROUP BY o.id ORDER BY o.expected_ship_date ASC, o.created_at ASC`
      )
      .all(...parameters) as Row[]
    return rows.map((row) => {
      const customer = JSON.parse(String(row.customer_snapshot_json)) as CustomerProfile
      const financial = orderFinancial(Number(row.receivable_cents), [
        { type: 'receipt', amountCents: Number(row.received_cents) },
        { type: 'refund', amountCents: Number(row.refunded_cents) }
      ])
      const progress = this.getOrderProgress(String(row.id)).summary
      return {
        id: String(row.id),
        code: String(row.code),
        customerName: customer.name || '未命名客户',
        expectedShipDate: String(row.expected_ship_date),
        productionDeadline: String(row.production_deadline),
        productionStatus: row.production_status as ProductionStatus,
        schedulingStatus: progress.status,
        progress,
        receivableCents: Number(row.receivable_cents),
        receivedNetCents: financial.receivedNetCents,
        outstandingCents: financial.outstandingCents,
        financialStatus: financial.status
      }
    })
  }

  private setAppSetting(key: string, value: unknown, timestamp: string): void {
    this.database
      .prepare(
        `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      )
      .run(key, JSON.stringify(value), timestamp)
  }

  private orderItemAuditValue(item: {
    id?: string
    productId: string
    quantity: number
    unitPriceCents: number
    edgeEnabled: boolean
    edgeQuantity: number
    edgePriceCents: number
    discountCents: number
    estimatedCostCents: number
  }) {
    return {
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      edgeEnabled: item.edgeEnabled,
      edgeQuantity: item.edgeQuantity,
      edgePriceCents: item.edgePriceCents,
      discountCents: item.discountCents,
      estimatedCostCents: item.estimatedCostCents
    }
  }

  private orderAuditValue(order: OrderDetail) {
    return {
      customer: order.customer,
      expectedShipDate: order.expectedShipDate,
      reserveDays: order.reserveDays,
      discountCents: order.discountCents,
      items: order.items.map((item) => this.orderItemAuditValue(item)),
      receivableCents: order.receivableCents
    }
  }

  private productCapacityAudit(product: ProductCreateInput | ProductDetail | null) {
    if (!product) return null
    return {
      moldCount: product.moldCount,
      outputPerMoldPerBatch: product.outputPerMoldPerBatch,
      maxBatchesPerDay: product.maxBatchesPerDay,
      dailyCapacity: calculateDailyCapacity({
        moldCount: product.moldCount,
        outputPerMoldPerBatch: product.outputPerMoldPerBatch,
        maxBatchesPerDay: product.maxBatchesPerDay
      })
    }
  }

  private parseAuditJson(value: unknown): unknown {
    if (value === null || value === undefined) return null
    try {
      return JSON.parse(String(value))
    } catch {
      return value
    }
  }

  private writeAudit(
    action: string,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
    metadata: unknown,
    timestamp: string,
    id = randomUUID()
  ): void {
    this.database
      .prepare(
        `INSERT INTO audit_logs (
          id, action, entity_type, entity_id, before_json, after_json, metadata_json, actor_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        action,
        entityType,
        entityId,
        this.serializeAuditJson(before),
        this.serializeAuditJson(after),
        this.serializeAuditJson(metadata),
        '本机管理员',
        timestamp
      )
  }

  private serializeAuditJson(value: unknown): string | null {
    return value === null || value === undefined ? null : JSON.stringify(value)
  }
}
