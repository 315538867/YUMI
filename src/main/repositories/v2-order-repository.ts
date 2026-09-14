import type { V2Database } from '@main/database/v2-connection'
import { calculateOrderAmountSummary } from '@main/domain/order-amounts'
import { calculateOrderFundSummary } from '@main/domain/order-funds'
import { calculateOrderSchedule } from '@main/domain/order-schedule'
import { calculateDailyMoldCapacity } from '@main/domain/product-capacity'
import type {
  V2Customer,
  V2CustomerInput,
  V2CustomerQuery,
  V2CustomerUpdateInput,
  V2Order,
  V2OrderAmountAdjustment,
  V2OrderContentChange,
  V2OrderFund,
  V2OrderFundSummary,
  V2OrderItem,
  V2OrderSummary,
  V2Product,
  V2ProductInput,
  V2ProductOrderSnapshot,
  V2ProductUpdateInput,
  V2Shipment
} from '@shared/contracts/index'

export interface V2AuditLog {
  id: string
  action: string
  entityType: string
  entityId: string
  before: unknown | null
  after: unknown | null
  metadata: unknown | null
  createdAt: string
}

interface OrderRow {
  id: string
  code: string
  customer_id: string | null
  customer_snapshot_json: string
  order_discount_cents: number
  expected_ship_date: string | null
  reserved_days: number
  notes: string | null
  created_at: string
  updated_at: string
}

interface OrderItemRow {
  id: string
  order_id: string
  product_id: string | null
  product_snapshot_json: string
  quantity: number
  unit_price_cents: number
  edge_enabled: number
  edge_quantity: number
  edge_unit_price_cents: number
  item_discount_cents: number
  created_at: string
  updated_at: string
  line_no: number
}

interface FundRow {
  id: string
  order_id: string
  direction: 'income' | 'expense'
  business_type: 'payment' | 'refund' | 'after_sales_charge'
  amount_cents: number
  occurred_on: string
  payment_method: string | null
  attachment_id: string | null
  reversal_of_entry_id: string | null
  note: string | null
  created_at: string
  attachment_original_name?: string | null
  attachment_storage_key?: string | null
  attachment_mime_type?: string | null
  attachment_size_bytes?: number | null
  attachment_created_at?: string | null
}

interface AdjustmentRow {
  id: string
  order_id: string
  amount_cents: number
  occurred_on: string
  reason: string
  note: string | null
  created_at: string
}

interface ContentChangeRow {
  id: string
  order_id: string
  occurred_on: string
  description: string
  before_items_snapshot_json: string
  after_items_snapshot_json: string
  created_at: string
}

interface ShipmentRow {
  id: string
  order_id: string
  shipped_on: string
  carrier: string | null
  tracking_number: string | null
  note: string | null
  snapshot_json: string | null
  status: 'active' | 'voided'
  voided_on: string | null
  void_reason: string | null
  voided_at: string | null
  created_at: string
  updated_at: string
}

interface ShipmentItemRow {
  shipment_id: string
  order_item_id: string
  quantity: number
}

function calculateProductionDeadline(
  expectedShipDate: string | null,
  reservedDays: number
): string | null {
  return calculateOrderSchedule({ expectedShipDate, reservedDays }).productionDeadline
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T
}

function nullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function mapCustomer(row: Record<string, unknown>): V2Customer {
  return {
    id: String(row.id),
    name: String(row.name),
    contact: (row.contact as string | null) ?? null,
    defaultAddress: (row.default_address as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    enabled: Boolean(row.enabled),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function mapProduct(row: Record<string, unknown>): V2Product {
  return {
    id: String(row.id),
    name: String(row.name),
    code: String(row.code ?? ''),
    basePriceCents: Number(row.base_price_cents),
    packagingCostCents: Number(row.packaging_cost_cents),
    accessoryCostCents: Number(row.accessory_cost_cents),
    replacementBagCostCents: Number(row.replacement_bag_cost_cents),
    edgeConsumableCostCents: Number(row.edge_consumable_cost_cents),
    fixedCostCents: Number(row.fixed_cost_cents),
    unitWeightMilligrams: Number(row.unit_weight_milligrams),
    standardMakingMinutes: Number(row.standard_making_minutes),
    expectedFluffingBaggingMinutes: Number(row.expected_fluffing_bagging_minutes),
    expectedEdgeSewingMinutes: Number(row.expected_edge_sewing_minutes),
    expectedPackingMinutes: Number(row.expected_packing_minutes),
    makingCommissionCents: Number(row.making_commission_cents),
    fluffingBaggingCommissionCents: Number(row.fluffing_bagging_commission_cents),
    edgeSewingCommissionCents: Number(row.edge_sewing_commission_cents),
    moldCount: Number(row.mold_count),
    outputPerMoldPerBatch: Number(row.output_per_mold_per_batch),
    maxBatchesPerDay: Number(row.max_batches_per_day),
    dailyCapacity: Number(row.daily_capacity),
    enabled: Boolean(row.enabled),
    imageAttachmentId: (row.image_attachment_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function mapOrderItem(row: OrderItemRow): V2OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    productSnapshot: parseJson<V2ProductOrderSnapshot>(row.product_snapshot_json),
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    edgeEnabled: Boolean(row.edge_enabled),
    edgeQuantity: row.edge_quantity,
    edgeUnitPriceCents: row.edge_unit_price_cents,
    itemAmountCents: row.quantity * row.unit_price_cents,
    edgeAmountCents: row.edge_quantity * row.edge_unit_price_cents,
    itemDiscountCents: row.item_discount_cents,
    lineAmountCents:
      row.quantity * row.unit_price_cents +
      row.edge_quantity * row.edge_unit_price_cents -
      row.item_discount_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapFund(row: FundRow): V2OrderFund {
  return {
    id: row.id,
    orderId: row.order_id,
    direction: row.direction,
    businessType: row.business_type,
    amountCents: row.amount_cents,
    occurredOn: row.occurred_on,
    paymentMethod: row.payment_method,
    attachmentId: row.attachment_id,
    note: row.note,
    reversalOfEntryId: row.reversal_of_entry_id,
    attachment:
      row.attachment_original_name && row.attachment_storage_key && row.attachment_created_at
        ? {
            id: row.attachment_id!,
            originalName: row.attachment_original_name,
            storageKey: row.attachment_storage_key,
            mimeType: row.attachment_mime_type ?? null,
            sizeBytes: Number(row.attachment_size_bytes ?? 0),
            createdAt: row.attachment_created_at
          }
        : null,
    createdAt: row.created_at
  }
}

export class V2OrderRepository {
  constructor(private readonly database: V2Database) {}

  get connection(): V2Database {
    return this.database
  }

  transaction<T>(operation: () => T): T {
    return this.database.transaction(operation)()
  }

  listCustomers(query: V2CustomerQuery = {}): V2Customer[] {
    const keyword = query.keyword?.trim()
    const rows = this.database
      .prepare(
        `SELECT * FROM customers
         WHERE (? = 1 OR enabled = 1)
           AND (? IS NULL OR name LIKE ? OR contact LIKE ?)
         ORDER BY enabled DESC, updated_at DESC, name ASC`
      )
      .all(
        query.includeDisabled ? 1 : 0,
        keyword ?? null,
        `%${keyword ?? ''}%`,
        `%${keyword ?? ''}%`
      ) as Array<Record<string, unknown>>
    return rows.map(mapCustomer)
  }

  getCustomer(id: string): V2Customer | null {
    const row = this.database.prepare('SELECT * FROM customers WHERE id = ?').get(id) as
      Record<string, unknown> | undefined
    return row ? mapCustomer(row) : null
  }

  insertCustomer(id: string, input: V2CustomerInput, now: string): V2Customer {
    this.database
      .prepare(
        `INSERT INTO customers (id, name, contact, default_address, notes, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(
        id,
        input.name.trim(),
        nullableText(input.contact),
        nullableText(input.defaultAddress),
        nullableText(input.notes),
        now,
        now
      )
    return this.getCustomer(id)!
  }

  updateCustomer(input: V2CustomerUpdateInput, now: string): V2Customer | null {
    const result = this.database
      .prepare(
        `UPDATE customers
         SET name = ?, contact = ?, default_address = ?, notes = ?, enabled = COALESCE(?, enabled), updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.name.trim(),
        nullableText(input.contact),
        nullableText(input.defaultAddress),
        nullableText(input.notes),
        input.enabled === undefined ? null : Number(input.enabled),
        now,
        input.id
      )
    return result.changes ? this.getCustomer(input.id) : null
  }

  listProducts(includeDisabled = false): V2Product[] {
    const rows = this.database
      .prepare(
        'SELECT * FROM products WHERE (? = 1 OR enabled = 1) ORDER BY enabled DESC, updated_at DESC, name ASC'
      )
      .all(includeDisabled ? 1 : 0) as Array<Record<string, unknown>>
    return rows.map(mapProduct)
  }

  getProduct(id: string): V2Product | null {
    const row = this.database.prepare('SELECT * FROM products WHERE id = ?').get(id) as
      Record<string, unknown> | undefined
    return row ? mapProduct(row) : null
  }

  listProductCodes(): string[] {
    return (
      this.database.prepare('SELECT code FROM products WHERE code IS NOT NULL').all() as Array<{
        code: string
      }>
    ).map((row) => row.code)
  }

  insertProduct(id: string, code: string, input: V2ProductInput, now: string): V2Product {
    this.database
      .prepare(
        `INSERT INTO products (
          id, name, code, base_price_cents, packaging_cost_cents,
          accessory_cost_cents, replacement_bag_cost_cents, edge_consumable_cost_cents, fixed_cost_cents,
          unit_weight_milligrams, standard_making_minutes, expected_fluffing_bagging_minutes,
          expected_edge_sewing_minutes, expected_packing_minutes,
          making_commission_cents, fluffing_bagging_commission_cents, edge_sewing_commission_cents,
          mold_count, output_per_mold_per_batch, max_batches_per_day,
          daily_capacity, enabled, image_attachment_id, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.name.trim(),
        code,
        input.basePriceCents,
        input.packagingCostCents,
        input.accessoryCostCents,
        input.replacementBagCostCents,
        input.edgeConsumableCostCents,
        input.fixedCostCents ?? 0,
        input.unitWeightMilligrams ?? 0,
        input.standardMakingMinutes,
        input.expectedFluffingBaggingMinutes ?? 0,
        input.expectedEdgeSewingMinutes ?? 0,
        input.expectedPackingMinutes ?? 0,
        input.makingCommissionCents,
        input.fluffingBaggingCommissionCents ?? 0,
        input.edgeSewingCommissionCents ?? 0,
        input.moldCount ?? 0,
        input.outputPerMoldPerBatch ?? 0,
        input.maxBatchesPerDay ?? 0,
        input.moldCount && input.outputPerMoldPerBatch && input.maxBatchesPerDay
          ? calculateDailyMoldCapacity({
              moldCount: input.moldCount,
              outputPerMoldPerBatch: input.outputPerMoldPerBatch,
              maxBatchesPerDay: input.maxBatchesPerDay
            })
          : 0,
        nullableText(input.imageAttachmentId),
        nullableText(input.notes),
        now,
        now
      )
    return this.getProduct(id)!
  }

  updateProduct(input: V2ProductUpdateInput, now: string): V2Product | null {
    const result = this.database
      .prepare(
        `UPDATE products SET
          name = ?, base_price_cents = ?, packaging_cost_cents = ?,
          accessory_cost_cents = ?, replacement_bag_cost_cents = ?, edge_consumable_cost_cents = ?, fixed_cost_cents = ?,
          unit_weight_milligrams = ?, standard_making_minutes = ?, expected_fluffing_bagging_minutes = ?,
          expected_edge_sewing_minutes = ?, expected_packing_minutes = ?,
          making_commission_cents = ?, fluffing_bagging_commission_cents = ?, edge_sewing_commission_cents = ?,
          mold_count = ?, output_per_mold_per_batch = ?, max_batches_per_day = ?,
          daily_capacity = ?, enabled = COALESCE(?, enabled), image_attachment_id = ?, notes = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        input.name.trim(),
        input.basePriceCents,
        input.packagingCostCents,
        input.accessoryCostCents,
        input.replacementBagCostCents,
        input.edgeConsumableCostCents,
        input.fixedCostCents ?? 0,
        input.unitWeightMilligrams ?? 0,
        input.standardMakingMinutes,
        input.expectedFluffingBaggingMinutes ?? 0,
        input.expectedEdgeSewingMinutes ?? 0,
        input.expectedPackingMinutes ?? 0,
        input.makingCommissionCents,
        input.fluffingBaggingCommissionCents ?? 0,
        input.edgeSewingCommissionCents ?? 0,
        input.moldCount ?? 0,
        input.outputPerMoldPerBatch ?? 0,
        input.maxBatchesPerDay ?? 0,
        input.moldCount && input.outputPerMoldPerBatch && input.maxBatchesPerDay
          ? calculateDailyMoldCapacity({
              moldCount: input.moldCount,
              outputPerMoldPerBatch: input.outputPerMoldPerBatch,
              maxBatchesPerDay: input.maxBatchesPerDay
            })
          : 0,
        input.enabled === undefined ? null : Number(input.enabled),
        nullableText(input.imageAttachmentId),
        nullableText(input.notes),
        now,
        input.id
      )
    return result.changes ? this.getProduct(input.id) : null
  }

  insertOrder(input: {
    id: string
    code: string
    customerId: string | null
    customerSnapshot: V2CustomerInput
    orderDiscountCents: number
    expectedShipDate: string | null
    reservedDays: number
    notes: string | null
    now: string
  }): void {
    this.database
      .prepare(
        `INSERT INTO orders (
          id, code, customer_id, customer_snapshot_json, order_discount_cents,
          expected_ship_date, reserved_days, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.code,
        input.customerId,
        JSON.stringify(input.customerSnapshot),
        input.orderDiscountCents,
        input.expectedShipDate,
        input.reservedDays,
        input.notes,
        input.now,
        input.now
      )
  }

  insertOrderItems(orderId: string, items: Array<Omit<V2OrderItem, 'orderId'>>): void {
    const statement = this.database.prepare(
      `INSERT INTO order_items (
        id, order_id, product_id, product_snapshot_json, quantity, unit_price_cents,
        edge_enabled, edge_quantity, edge_unit_price_cents, item_discount_cents,
        line_no, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const [lineNo, item] of items.entries()) {
      statement.run(
        item.id,
        orderId,
        item.productId,
        JSON.stringify(item.productSnapshot),
        item.quantity,
        item.unitPriceCents,
        Number(item.edgeEnabled),
        item.edgeQuantity,
        item.edgeUnitPriceCents,
        item.itemDiscountCents,
        lineNo,
        item.createdAt,
        item.updatedAt
      )
    }
  }

  replaceOrderItems(
    orderId: string,
    items: Array<Omit<V2OrderItem, 'orderId'>>,
    orderDiscountCents: number
  ): void {
    this.database.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId)
    this.insertOrderItems(orderId, items)
    this.database
      .prepare('UPDATE orders SET order_discount_cents = ?, updated_at = ? WHERE id = ?')
      .run(orderDiscountCents, items[0]?.updatedAt ?? new Date().toISOString(), orderId)
  }

  getOrder(orderId: string): V2Order | null {
    const row = this.database.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as
      OrderRow | undefined
    if (!row) return null
    const customer = row.customer_id ? this.getCustomer(row.customer_id) : null
    const items = this.listOrderItems(orderId)
    const adjustmentRows = this.database
      .prepare('SELECT * FROM order_amount_adjustments WHERE order_id = ? ORDER BY created_at ASC')
      .all(orderId) as AdjustmentRow[]
    const amount = calculateOrderAmountSummary({
      items: items.map((item) => ({
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        edge: {
          enabled: item.edgeEnabled,
          quantity: item.edgeQuantity,
          unitPriceCents: item.edgeUnitPriceCents
        },
        itemDiscountCents: item.itemDiscountCents
      })),
      orderDiscountCents: row.order_discount_cents,
      adjustmentsCents: adjustmentRows.map((item) => item.amount_cents)
    })
    const funds = this.getOrderFundSummary(orderId, amount.currentAmountCents)
    return {
      id: row.id,
      code: row.code,
      customer,
      customerSnapshot: parseJson<V2CustomerInput>(row.customer_snapshot_json),
      items,
      amount,
      funds,
      expectedShipDate: row.expected_ship_date,
      reservedDays: row.reserved_days,
      productionDeadline: calculateProductionDeadline(row.expected_ship_date, row.reserved_days),
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  listOrders(): V2OrderSummary[] {
    const rows = this.database
      .prepare('SELECT * FROM orders ORDER BY updated_at DESC, created_at DESC')
      .all() as OrderRow[]
    return rows.map((row) => {
      const customer = row.customer_id ? this.getCustomer(row.customer_id) : null
      const orderItems = this.listOrderItems(row.id)
      const activeShipmentItems = this.listShipments(row.id)
        .filter((shipment) => shipment.status !== 'voided')
        .flatMap((shipment) => shipment.items)
      const adjustmentRows = this.database
        .prepare('SELECT amount_cents FROM order_amount_adjustments WHERE order_id = ?')
        .all(row.id) as Array<{ amount_cents: number }>
      const amount = calculateOrderAmountSummary({
        items: orderItems.map((item) => ({
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          edge: {
            enabled: item.edgeEnabled,
            quantity: item.edgeQuantity,
            unitPriceCents: item.edgeUnitPriceCents
          },
          itemDiscountCents: item.itemDiscountCents
        })),
        orderDiscountCents: row.order_discount_cents,
        adjustmentsCents: adjustmentRows.map((item) => item.amount_cents)
      })
      const funds = this.getOrderFundSummary(row.id, amount.currentAmountCents)
      return {
        id: row.id,
        code: row.code,
        customerName: customer?.name ?? parseJson<V2CustomerInput>(row.customer_snapshot_json).name,
        itemCount: orderItems.length,
        totalQuantity: orderItems.reduce((total, item) => total + item.quantity, 0),
        shippedQuantity: activeShipmentItems.reduce((total, item) => total + item.quantity, 0),
        createdAt: row.created_at,
        currentAmountCents: amount.currentAmountCents,
        netReceivedCents: funds.netReceivedCents,
        outstandingCents: funds.outstandingCents,
        expectedShipDate: row.expected_ship_date,
        reservedDays: row.reserved_days,
        productionDeadline: calculateProductionDeadline(row.expected_ship_date, row.reserved_days),
        updatedAt: row.updated_at
      }
    })
  }

  listOrderItems(orderId: string): V2OrderItem[] {
    return (
      this.database
        .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY line_no ASC, id ASC')
        .all(orderId) as OrderItemRow[]
    ).map(mapOrderItem)
  }

  createAmountAdjustment(input: V2OrderAmountAdjustment): void {
    this.database
      .prepare(
        `INSERT INTO order_amount_adjustments (id, order_id, amount_cents, occurred_on, reason, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.orderId,
        input.amountCents,
        input.occurredOn,
        input.reason,
        input.note ?? null,
        input.createdAt
      )
  }

  listAmountAdjustments(orderId: string): V2OrderAmountAdjustment[] {
    return (
      this.database
        .prepare(
          'SELECT * FROM order_amount_adjustments WHERE order_id = ? ORDER BY created_at ASC, id ASC'
        )
        .all(orderId) as AdjustmentRow[]
    ).map((row) => ({
      id: row.id,
      orderId: row.order_id,
      amountCents: row.amount_cents,
      occurredOn: row.occurred_on,
      reason: row.reason,
      note: row.note,
      createdAt: row.created_at
    }))
  }

  createContentChange(change: V2OrderContentChange): void {
    this.database
      .prepare(
        `INSERT INTO order_content_changes (
          id, order_id, occurred_on, description, before_items_snapshot_json, after_items_snapshot_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        change.id,
        change.orderId,
        change.occurredOn,
        change.description,
        JSON.stringify(change.beforeItems),
        JSON.stringify(change.afterItems),
        change.createdAt
      )
  }

  listContentChanges(orderId: string): V2OrderContentChange[] {
    return (
      this.database
        .prepare(
          'SELECT * FROM order_content_changes WHERE order_id = ? ORDER BY created_at ASC, id ASC'
        )
        .all(orderId) as ContentChangeRow[]
    ).map((row) => ({
      id: row.id,
      orderId: row.order_id,
      occurredOn: row.occurred_on,
      description: row.description,
      beforeItems: parseJson<V2OrderItem[]>(row.before_items_snapshot_json),
      afterItems: parseJson<V2OrderItem[]>(row.after_items_snapshot_json),
      createdAt: row.created_at
    }))
  }

  insertFund(fund: V2OrderFund): void {
    this.database
      .prepare(
        `INSERT INTO financial_entries (
          id, source_type, direction, business_type, amount_cents, occurred_on, payment_method, order_id,
          attachment_id, reversal_of_entry_id, note, created_at
        ) VALUES (?, 'order_fund', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        fund.id,
        fund.direction,
        fund.businessType,
        fund.amountCents,
        fund.occurredOn,
        fund.paymentMethod ?? null,
        fund.orderId,
        fund.attachmentId ?? null,
        fund.reversalOfEntryId,
        fund.note ?? null,
        fund.createdAt
      )
  }

  getFund(id: string): V2OrderFund | null {
    const row = this.database
      .prepare(
        `
      SELECT entry.*, a.original_name AS attachment_original_name, a.storage_key AS attachment_storage_key,
        a.mime_type AS attachment_mime_type, a.size_bytes AS attachment_size_bytes, a.created_at AS attachment_created_at
      FROM financial_entries entry LEFT JOIN attachments a ON a.id = entry.attachment_id
      WHERE entry.id = ?
    `
      )
      .get(id) as FundRow | undefined
    return row ? mapFund(row) : null
  }

  listOrderFunds(orderId: string): V2OrderFund[] {
    return (
      this.database
        .prepare(
          `
        SELECT entry.*, a.original_name AS attachment_original_name, a.storage_key AS attachment_storage_key,
          a.mime_type AS attachment_mime_type, a.size_bytes AS attachment_size_bytes, a.created_at AS attachment_created_at
        FROM financial_entries entry LEFT JOIN attachments a ON a.id = entry.attachment_id
        WHERE entry.order_id = ? ORDER BY entry.created_at ASC, entry.id ASC
      `
        )
        .all(orderId) as FundRow[]
    ).map(mapFund)
  }

  getOrderFundSummary(orderId: string, currentAmountCents: number): V2OrderFundSummary {
    return calculateOrderFundSummary({
      currentAmountCents,
      entries: this.listOrderFunds(orderId).map(
        ({ id, direction, businessType, amountCents, reversalOfEntryId }) => ({
          id,
          direction,
          businessType,
          amountCents,
          reversalOfEntryId
        })
      )
    })
  }

  hasReversalForFund(fundId: string): boolean {
    return Boolean(
      this.database
        .prepare('SELECT 1 FROM financial_entries WHERE reversal_of_entry_id = ?')
        .get(fundId)
    )
  }

  countShipments(orderId: string): number {
    return Number(
      (
        this.database
          .prepare('SELECT COUNT(*) AS count FROM shipments WHERE order_id = ?')
          .get(orderId) as { count: number }
      ).count
    )
  }

  listShippedQuantities(orderId: string): Map<string, number> {
    const rows = this.database
      .prepare(
        `SELECT shipment_items.order_item_id, COALESCE(SUM(shipment_items.quantity), 0) AS quantity
         FROM shipment_items
         JOIN shipments ON shipments.id = shipment_items.shipment_id
         WHERE shipments.order_id = ? AND shipments.status = 'active'
         GROUP BY shipment_items.order_item_id`
      )
      .all(orderId) as Array<{ order_item_id: string; quantity: number }>
    return new Map(rows.map((row) => [row.order_item_id, row.quantity]))
  }

  insertShipment(shipment: V2Shipment, snapshot: unknown): void {
    this.database
      .prepare(
        `INSERT INTO shipments (
          id, order_id, shipped_on, carrier, tracking_number, note, snapshot_json, status, voided_on, void_reason, voided_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        shipment.id,
        shipment.orderId,
        shipment.shippedOn,
        shipment.carrier ?? null,
        shipment.trackingNumber ?? null,
        shipment.note ?? null,
        JSON.stringify(snapshot),
        shipment.status,
        shipment.voidedOn,
        shipment.voidReason,
        shipment.voidedAt,
        shipment.createdAt,
        shipment.updatedAt
      )
    const statement = this.database.prepare(
      'INSERT INTO shipment_items (id, shipment_id, order_item_id, quantity, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    for (const item of shipment.items) {
      statement.run(item.id, shipment.id, item.orderItemId, item.quantity, shipment.createdAt)
    }
  }

  voidShipment(
    orderId: string,
    shipmentId: string,
    voidedOn: string,
    voidReason: string,
    voidedAt: string
  ): void {
    const result = this.database
      .prepare(
        `UPDATE shipments
       SET status = 'voided', voided_on = ?, void_reason = ?, voided_at = ?, updated_at = ?
       WHERE id = ? AND order_id = ? AND status = 'active'`
      )
      .run(voidedOn, voidReason, voidedAt, voidedAt, shipmentId, orderId)
    if (result.changes !== 1) throw new Error('发货批次不存在或已作废')
  }

  getShipmentDocumentSnapshot(orderId: string, shipmentId: string): Record<string, unknown> | null {
    const row = this.database
      .prepare('SELECT snapshot_json FROM shipments WHERE id = ? AND order_id = ?')
      .get(shipmentId, orderId) as { snapshot_json: string | null } | undefined
    if (!row) return null
    return row.snapshot_json ? parseJson<Record<string, unknown>>(row.snapshot_json) : null
  }

  listShipments(orderId: string): V2Shipment[] {
    const shipments = this.database
      .prepare('SELECT * FROM shipments WHERE order_id = ? ORDER BY shipped_on ASC, created_at ASC')
      .all(orderId) as ShipmentRow[]
    if (!shipments.length) return []
    const items = this.database
      .prepare(
        `SELECT shipment_items.shipment_id, shipment_items.order_item_id, shipment_items.quantity
         FROM shipment_items JOIN shipments ON shipments.id = shipment_items.shipment_id
         WHERE shipments.order_id = ? ORDER BY shipment_items.created_at ASC`
      )
      .all(orderId) as ShipmentItemRow[]
    return shipments.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      shippedOn: row.shipped_on,
      items: items
        .filter((item) => item.shipment_id === row.id)
        .map((item) => ({
          orderItemId: item.order_item_id,
          quantity: item.quantity
        })),
      carrier: row.carrier,
      trackingNumber: row.tracking_number,
      note: row.note,
      status: row.status ?? 'active',
      voidedOn: row.voided_on ?? null,
      voidReason: row.void_reason ?? null,
      voidedAt: row.voided_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  }

  insertAudit(input: {
    id: string
    action: string
    entityType: string
    entityId: string
    before?: unknown
    after?: unknown
    metadata?: unknown
    createdAt: string
  }): V2AuditLog {
    this.database
      .prepare(
        `INSERT INTO audit_logs (
          id, action, entity_type, entity_id, before_json, after_json, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.action,
        input.entityType,
        input.entityId,
        input.before === undefined ? null : JSON.stringify(input.before),
        input.after === undefined ? null : JSON.stringify(input.after),
        input.metadata === undefined ? null : JSON.stringify(input.metadata),
        input.createdAt
      )
    return this.getAudit(input.id)!
  }

  getAudit(id: string): V2AuditLog | null {
    const row = this.database.prepare('SELECT * FROM audit_logs WHERE id = ?').get(id) as
      Record<string, unknown> | undefined
    if (!row) return null
    return {
      id: String(row.id),
      action: String(row.action),
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      before: row.before_json ? parseJson(String(row.before_json)) : null,
      after: row.after_json ? parseJson(String(row.after_json)) : null,
      metadata: row.metadata_json ? parseJson(String(row.metadata_json)) : null,
      createdAt: String(row.created_at)
    }
  }

  listAuditLogs(entityId?: string): V2AuditLog[] {
    const rows = entityId
      ? this.database
          .prepare(
            'SELECT * FROM audit_logs WHERE entity_id = ? ORDER BY created_at ASC, rowid ASC'
          )
          .all(entityId)
      : this.database.prepare('SELECT * FROM audit_logs ORDER BY created_at ASC, rowid ASC').all()
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      action: String(row.action),
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      before: row.before_json ? parseJson(String(row.before_json)) : null,
      after: row.after_json ? parseJson(String(row.after_json)) : null,
      metadata: row.metadata_json ? parseJson(String(row.metadata_json)) : null,
      createdAt: String(row.created_at)
    }))
  }
}
