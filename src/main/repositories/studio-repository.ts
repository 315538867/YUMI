import { randomUUID } from 'node:crypto'
import type { StudioDatabase } from '@main/database/connection'
import { calculateDailyCapacity, calculateProductCost } from '@main/domain/costing'
import { calculateActualProductionCost } from '@main/domain/production'
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
  CustomerInput,
  CustomerProfile,
  DashboardSummary,
  OrderCreateInput,
  OrderDefaults,
  OrderDetail,
  OrderFinancialSummary,
  OrderItemDetail,
  OrderProductionStatusInput,
  OrderUpdateInput,
  OrderProfitReport,
  OrderProfitReportQuery,
  OrderProfitReportRow,
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
  ShiftStatusInput,
  ShiftSummary,
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
const defaultCostSettings: CostSettings = {
  id: 'default',
  gluePriceCentsPerGram: 0,
  monthlyFixedCostCents: 0,
  targetEffectiveMinutes: 9600,
  fixedOverheadHourlyRateCents: 0,
  effectiveFrom: '',
  createdAt: ''
}

type Row = Record<string, unknown>

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
    gluePriceCentsPerGram: Number(row.glue_price_cents_per_gram),
    monthlyFixedCostCents: Number(row.monthly_fixed_cost_cents),
    targetEffectiveMinutes: Number(row.target_effective_minutes),
    fixedOverheadHourlyRateCents: Number(row.fixed_overhead_hourly_rate_cents),
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
    commissionCentsPerUnit: product.commissionCentsPerUnit,
    moldCount: product.moldCount,
    outputPerMoldPerBatch: product.outputPerMoldPerBatch,
    maxBatchesPerDay: product.maxBatchesPerDay,
    gluePriceCentsPerGram: settings.gluePriceCentsPerGram,
    fixedOverheadHourlyRateCents: settings.fixedOverheadHourlyRateCents
  }
}

function estimateItemCostCents(
  snapshot: ProductOrderSnapshot,
  quantity: number,
  edgeEnabled: boolean,
  edgeQuantity: number,
  edgePriceCents: number
): number {
  const result = calculateProductCost({
    quantity,
    weightGrams: snapshot.weightGrams,
    lossRate: snapshot.lossRate,
    gluePricePerGram: snapshot.gluePriceCentsPerGram / 100,
    packagingCostPerUnit: snapshot.packagingCostCents / 100,
    standardMinutesPerUnit: snapshot.standardMinutesPerUnit,
    // 订单创建时尚未分配具体兼职人员；实际人工工时成本会在完工记录中计算。
    hourlyLaborCost: 0,
    commissionPerUnit: snapshot.commissionCentsPerUnit / 100,
    fixedOverheadHourlyRate: snapshot.fixedOverheadHourlyRateCents / 100,
    edgeEnabled,
    edgeQuantity,
    edgePricePerUnit: edgePriceCents / 100
  })
  return Math.round(result.totalCost * 100)
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
        commission_cents_per_unit, mold_count, output_per_mold_per_batch, max_batches_per_day,
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
            standard_minutes_per_unit, packaging_cost_cents, commission_cents_per_unit, mold_count,
            output_per_mold_per_batch, max_batches_per_day, image_path, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
            commission_cents_per_unit = ?, mold_count = ?, output_per_mold_per_batch = ?,
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
        `SELECT id, glue_price_cents_per_gram, monthly_fixed_cost_cents,
        target_effective_minutes, fixed_overhead_hourly_rate_cents, effective_from, created_at
        FROM cost_settings_history ORDER BY effective_from DESC, created_at DESC LIMIT 1`
      )
      .get() as Row | undefined
    return row ? costSettingsFromRow(row) : defaultCostSettings
  }

  getCostSettingsHistory(): CostSettings[] {
    return (
      this.database
        .prepare(
          `SELECT id, glue_price_cents_per_gram, monthly_fixed_cost_cents,
          target_effective_minutes, fixed_overhead_hourly_rate_cents, effective_from, created_at
          FROM cost_settings_history ORDER BY effective_from DESC, created_at DESC`
        )
        .all() as Row[]
    ).map(costSettingsFromRow)
  }

  updateCostSettings(input: CostSettingsInput): CostSettings {
    const id = randomUUID()
    const timestamp = now()
    const fixedOverheadHourlyRateCents = Math.round(
      input.monthlyFixedCostCents / (input.targetEffectiveMinutes / 60)
    )
    const record: CostSettings = {
      id,
      ...input,
      fixedOverheadHourlyRateCents,
      createdAt: timestamp
    }
    this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO cost_settings_history (
            id, glue_price_cents_per_gram, monthly_fixed_cost_cents, target_effective_minutes,
            fixed_overhead_hourly_rate_cents, effective_from, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          record.id,
          record.gluePriceCentsPerGram,
          record.monthlyFixedCostCents,
          record.targetEffectiveMinutes,
          record.fixedOverheadHourlyRateCents,
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
    const customer = this.insertCustomer(input)
    return customer
  }

  listCustomerOrderHistory(customerId: string): OrderSummary[] {
    return this.queryOrderSummaries('WHERE o.customer_id = ?', [customerId])
  }

  createOrder(input: OrderCreateInput): OrderDetail {
    const orderId = randomUUID()
    const timestamp = now()
    this.database.transaction(() => {
      const customer = input.customer.id
        ? this.getCustomer(input.customer.id)
        : this.insertCustomer(input.customer)
      if (!customer) throw new DomainValidationError('客户不存在')
      const reserveDays = input.reserveDays ?? this.getOrderDefaults().defaultReserveDays
      const productionDeadline = calculateProductionDeadline(input.expectedShipDate, reserveDays)
      const costSettings = this.getCostSettings()
      const preparedItems = input.items.map((item, sortOrder) => {
        const product = this.getProduct(item.productId)
        if (!product) throw new DomainValidationError('商品不存在')
        if (!product.enabled) throw new DomainValidationError('商品未启用，不能创建订单')
        const edgeEnabled = item.edgeEnabled ?? false
        const edgeQuantity = edgeEnabled ? (item.edgeQuantity ?? item.quantity) : 0
        const unitPriceCents = item.unitPriceCents ?? product.basePriceCents
        const edgePriceCents = item.edgePriceCents ?? product.edgePriceCents
        const discountCents = item.discountCents ?? 0
        const beforeDiscount = unitPriceCents * item.quantity + edgePriceCents * edgeQuantity
        if (edgeQuantity > item.quantity)
          throw new DomainValidationError('缝边数量不能超过商品数量')
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
        notes: input.customer.notes?.trim() || null
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
          edge_quantity, edge_price_cents, discount_cents, estimated_cost_cents, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          item.estimatedCostCents,
          timestamp,
          timestamp
        )
      })
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

  updateOrder(input: OrderUpdateInput): OrderDetail {
    const previous = this.getOrderDetail(input.id)
    if (!previous) throw new DomainValidationError('订单不存在')
    const timestamp = now()
    this.database.transaction(() => {
      const customer = input.customer.id
        ? this.getCustomer(input.customer.id)
        : this.insertCustomer(input.customer)
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
        const edgeEnabled = item.edgeEnabled ?? existing?.edgeEnabled ?? false
        const edgeQuantity = edgeEnabled
          ? (item.edgeQuantity ?? existing?.edgeQuantity ?? item.quantity)
          : 0
        const unitPriceCents =
          item.unitPriceCents ?? existing?.unitPriceCents ?? product.basePriceCents
        const edgePriceCents =
          item.edgePriceCents ?? existing?.edgePriceCents ?? product.edgePriceCents
        const discountCents = item.discountCents ?? existing?.discountCents ?? 0
        const beforeDiscount = unitPriceCents * item.quantity + edgePriceCents * edgeQuantity
        if (edgeQuantity > item.quantity)
          throw new DomainValidationError('缝边数量不能超过商品数量')
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
        notes: input.customer.notes?.trim() || null
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
         estimated_cost_cents = ?, updated_at = ? WHERE id = ? AND order_id = ?`
      )
      const insertItem = this.database.prepare(
        `INSERT INTO order_items (
          id, order_id, product_id, product_snapshot_json, sort_order, quantity, unit_price_cents, edge_enabled,
          edge_quantity, edge_price_cents, discount_cents, estimated_cost_cents, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

  getOrderDetail(id: string): OrderDetail | null {
    const row = this.database.prepare('SELECT * FROM orders WHERE id = ?').get(id) as
      Row | undefined
    if (!row) return null
    const customer = JSON.parse(String(row.customer_snapshot_json)) as CustomerProfile
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
      estimatedCostCents: Number(item.estimated_cost_cents)
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
      discountCents: Number(row.discount_cents),
      receivableCents: Number(row.receivable_cents),
      estimatedCostCents: Number(row.estimated_cost_cents),
      actualCostCents: Number(row.actual_cost_cents),
      notes: (row.notes as string | null) ?? null,
      items,
      payments,
      financial: orderFinancial(Number(row.receivable_cents), payments),
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
    const worker = this.database
      .prepare('SELECT id, active FROM workers WHERE id = ?')
      .get(input.workerId) as Row | undefined
    if (!worker) throw new DomainValidationError('兼职人员不存在')
    if (Number(worker.active) !== 1) throw new DomainValidationError('兼职人员已停用，不能排班')
    const existingWorkerShifts = this.database
      .prepare(
        `SELECT start_time, end_time FROM shifts
        WHERE worker_id = ? AND shift_date = ? AND status NOT IN ('leave', 'absent', 'cancelled')
        AND (? IS NULL OR id != ?)`
      )
      .all(
        input.workerId,
        input.shiftDate,
        excludedShiftId ?? null,
        excludedShiftId ?? null
      ) as Row[]
    const otherPlannedByProduct = this.database
      .prepare(
        `SELECT st.product_id, COALESCE(SUM(st.planned_quantity), 0) AS quantity
        FROM shift_tasks st JOIN shifts s ON s.id = st.shift_id
        WHERE s.shift_date = ? AND s.status NOT IN ('leave', 'absent', 'cancelled')
        AND (? IS NULL OR s.id != ?)
        GROUP BY st.product_id`
      )
      .all(input.shiftDate, excludedShiftId ?? null, excludedShiftId ?? null) as Row[]
    const plannedByProduct = new Map(
      otherPlannedByProduct.map((row) => [String(row.product_id), Number(row.quantity)])
    )
    const contexts = input.tasks.map((task) => {
      const row = this.database
        .prepare(
          `SELECT oi.id AS order_item_id, oi.product_id, oi.quantity, oi.product_snapshot_json,
          o.production_deadline, COALESCE(SUM(existing.qualified_quantity), 0) AS completed_quantity
          FROM order_items oi JOIN orders o ON o.id = oi.order_id
          LEFT JOIN shift_tasks existing ON existing.order_item_id = oi.id
          WHERE oi.id = ? GROUP BY oi.id`
        )
        .get(task.orderItemId) as Row | undefined
      if (!row) throw new DomainValidationError('订单商品明细不存在')
      const snapshot = JSON.parse(String(row.product_snapshot_json)) as ProductOrderSnapshot
      const completedQuantity = Number(row.completed_quantity)
      const remainingQuantity = Number(row.quantity) - completedQuantity
      if (task.plannedQuantity > remainingQuantity) {
        throw new DomainValidationError(
          `计划数量不能超过订单商品待制作数量（剩余 ${remainingQuantity} 件）`
        )
      }
      const otherQuantity = plannedByProduct.get(String(row.product_id)) ?? 0
      plannedByProduct.set(String(row.product_id), otherQuantity + task.plannedQuantity)
      return {
        productId: String(row.product_id),
        orderItemId: String(row.order_item_id),
        plannedQuantity: task.plannedQuantity,
        standardMinutesPerUnit: snapshot.standardMinutesPerUnit,
        completedQuantity,
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
      return previewShiftRisks({
        date: input.shiftDate,
        startTime: input.startTime,
        endTime: input.endTime,
        existingWorkerShifts: existingWorkerShifts.map((shift) => ({
          startTime: String(shift.start_time),
          endTime: String(shift.end_time)
        })),
        tasks: contexts
      })
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
            id, worker_id, shift_date, start_time, end_time, status, confirmed_risks_json, detected_risks_json,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?)`
        )
        .run(
          id,
          input.workerId,
          input.shiftDate,
          input.startTime,
          input.endTime,
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
          Math.round(task.plannedQuantity * context.standardMinutesPerUnit),
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
          `UPDATE shifts SET worker_id = ?, shift_date = ?, start_time = ?, end_time = ?,
          confirmed_risks_json = ?, detected_risks_json = ?, updated_at = ? WHERE id = ?`
        )
        .run(
          input.workerId,
          input.shiftDate,
          input.startTime,
          input.endTime,
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
          Math.round(task.plannedQuantity * context.standardMinutesPerUnit),
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
          startTime: previous.startTime,
          endTime: previous.endTime,
          tasks: previous.tasks.map((task) => ({
            orderItemId: task.orderItemId,
            plannedQuantity: task.plannedQuantity
          }))
        },
        {
          workerId: input.workerId,
          shiftDate: input.shiftDate,
          startTime: input.startTime,
          endTime: input.endTime,
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
          `UPDATE orders SET actual_cost_cents = (
            SELECT COALESCE(SUM(st.actual_labor_cost_cents + st.commission_cost_cents), 0)
            FROM shift_tasks st JOIN order_items oi ON oi.id = st.order_item_id
            WHERE oi.order_id = orders.id
          ), production_status = CASE
            WHEN production_status IN ('pending_confirmation', 'pending_schedule', 'in_production') THEN ?
            ELSE production_status END, updated_at = ? WHERE id = ?`
        )
        .run(nextStatus, timestamp, task.order_id)
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
      this.database
        .prepare('UPDATE shifts SET status = ?, updated_at = ? WHERE id = ?')
        .run(input.status, timestamp, input.shiftId)
      this.writeAudit(
        'shift.status.updated',
        'shift',
        input.shiftId,
        { status: previous.status },
        { status: input.status },
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
          st.qualified_quantity, st.rework_quantity, st.scrap_quantity, st.actual_labor_cost_cents,
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
        actualMinutes: row.actual_minutes === null ? null : Number(row.actual_minutes),
        qualifiedQuantity,
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

  private getOrderItemSchedulingContext(orderItemId: string): {
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
        `SELECT s.id, s.worker_id, w.name AS worker_name, s.shift_date, s.start_time, s.end_time, s.status,
        s.confirmed_risks_json, COUNT(st.id) AS task_count
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
          startTime: String(row.start_time),
          endTime: String(row.end_time),
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
          s.confirmed_risks_json, COUNT(DISTINCT st.id) AS task_count,
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
        startTime: String(row.start_time),
        endTime: String(row.end_time),
        status: String(row.status),
        taskCount: Number(row.task_count),
        confirmedRisks: JSON.parse(String(row.confirmed_risks_json)) as string[],
        actualMinutes: Number(row.actual_minutes),
        qualifiedQuantity: Number(row.qualified_quantity),
        commissionCostCents: Number(row.commission_cost_cents)
      }
      return shift
    })
    return {
      ...summary,
      phone: (workerRow.phone as string | null) ?? null,
      wageHistory: this.getWorkerWageHistory(id),
      shifts,
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
        Number(row.weight_grams) * (1 + Number(row.loss_rate)) * settings.gluePriceCentsPerGram +
          Number(row.packaging_cost_cents) +
          Number(row.commission_cents_per_unit) +
          (Number(row.max_batches_per_day) > 0
            ? (Number(row.standard_minutes_per_unit ?? 0) * settings.fixedOverheadHourlyRateCents) /
              60
            : 0)
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
          `SELECT s.id, s.worker_id, w.name AS worker_name, s.shift_date, s.start_time, s.end_time, s.status,
          s.confirmed_risks_json, COUNT(st.id) AS task_count
          FROM shifts s JOIN workers w ON w.id = s.worker_id LEFT JOIN shift_tasks st ON st.shift_id = s.id
          WHERE s.shift_date BETWEEN ? AND ? GROUP BY s.id ORDER BY s.shift_date, s.start_time`
        )
        .all(from, to) as Row[]
    ).map((row) => ({
      id: String(row.id),
      workerId: String(row.worker_id),
      workerName: String(row.worker_name),
      shiftDate: String(row.shift_date),
      startTime: String(row.start_time),
      endTime: String(row.end_time),
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
      return {
        id: String(row.id),
        code: String(row.code),
        customerName: customer.name || '未命名客户',
        expectedShipDate: String(row.expected_ship_date),
        productionDeadline: String(row.production_deadline),
        productionStatus: row.production_status as ProductionStatus,
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
