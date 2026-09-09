import type { V2Database } from '@main/database/v2-connection'
import { calculateOrderAmountSummary } from '@main/domain/order-amounts'
import { calculateOrderFundSummary } from '@main/domain/order-funds'
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
  initial_confirmed_amount_cents: number
  expected_ship_date: string | null
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
  created_at: string
  updated_at: string
}

interface ShipmentItemRow {
  shipment_id: string
  order_item_id: string
  quantity: number
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
    code: (row.code as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    basePriceCents: Number(row.base_price_cents),
    materialCostCents: Number(row.material_cost_cents),
    packagingCostCents: Number(row.packaging_cost_cents),
    accessoryCostCents: Number(row.accessory_cost_cents),
    replacementBagCostCents: Number(row.replacement_bag_cost_cents),
    edgeCostCents: Number(row.edge_cost_cents),
    standardMakingMinutes: Number(row.standard_making_minutes),
    makingCommissionCents: Number(row.making_commission_cents),
    makingGlueCostCents: Number(row.making_glue_cost_cents),
    glueWeightMilligrams: Number(row.glue_weight_milligrams ?? 0),
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
    attachment: null,
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
      .all(query.includeDisabled ? 1 : 0, keyword ?? null, `%${keyword ?? ''}%`, `%${keyword ?? ''}%`) as Array<Record<string, unknown>>
    return rows.map(mapCustomer)
  }

  getCustomer(id: string): V2Customer | null {
    const row = this.database.prepare('SELECT * FROM customers WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? mapCustomer(row) : null
  }

  insertCustomer(id: string, input: V2CustomerInput, now: string): V2Customer {
    this.database
      .prepare(
        `INSERT INTO customers (id, name, contact, default_address, notes, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(id, input.name.trim(), nullableText(input.contact), nullableText(input.defaultAddress), nullableText(input.notes), now, now)
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
      .prepare('SELECT * FROM products WHERE (? = 1 OR enabled = 1) ORDER BY enabled DESC, updated_at DESC, name ASC')
      .all(includeDisabled ? 1 : 0) as Array<Record<string, unknown>>
    return rows.map(mapProduct)
  }

  getProduct(id: string): V2Product | null {
    const row = this.database.prepare('SELECT * FROM products WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? mapProduct(row) : null
  }

  insertProduct(id: string, input: V2ProductInput, now: string): V2Product {
    this.database
      .prepare(
        `INSERT INTO products (
          id, name, code, category, base_price_cents, material_cost_cents, packaging_cost_cents,
          accessory_cost_cents, replacement_bag_cost_cents, edge_cost_cents, standard_making_minutes,
          making_commission_cents, making_glue_cost_cents, glue_weight_milligrams, enabled, image_attachment_id, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
      )
      .run(
        id, input.name.trim(), nullableText(input.code), nullableText(input.category), input.basePriceCents,
        input.materialCostCents ?? 0, input.packagingCostCents, input.accessoryCostCents,
        input.replacementBagCostCents, input.edgeCostCents, input.standardMakingMinutes,
        input.makingCommissionCents, input.makingGlueCostCents ?? 0, input.glueWeightMilligrams ?? 0,
        nullableText(input.imageAttachmentId),
        nullableText(input.notes), now, now
      )
    return this.getProduct(id)!
  }

  updateProduct(input: V2ProductUpdateInput, now: string): V2Product | null {
    const result = this.database
      .prepare(
        `UPDATE products SET
          name = ?, code = ?, category = ?, base_price_cents = ?, material_cost_cents = ?, packaging_cost_cents = ?,
          accessory_cost_cents = ?, replacement_bag_cost_cents = ?, edge_cost_cents = ?, standard_making_minutes = ?,
          making_commission_cents = ?, making_glue_cost_cents = ?, glue_weight_milligrams = ?, enabled = COALESCE(?, enabled),
          image_attachment_id = ?, notes = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        input.name.trim(), nullableText(input.code), nullableText(input.category), input.basePriceCents,
        input.materialCostCents ?? 0, input.packagingCostCents, input.accessoryCostCents,
        input.replacementBagCostCents, input.edgeCostCents, input.standardMakingMinutes,
        input.makingCommissionCents, input.makingGlueCostCents ?? 0, input.glueWeightMilligrams ?? 0,
        input.enabled === undefined ? null : Number(input.enabled), nullableText(input.imageAttachmentId),
        nullableText(input.notes), now, input.id
      )
    return result.changes ? this.getProduct(input.id) : null
  }

  insertOrder(input: {
    id: string
    code: string
    customerId: string | null
    customerSnapshot: V2CustomerInput
    initialConfirmedAmountCents: number
    expectedShipDate: string | null
    notes: string | null
    now: string
  }): void {
    this.database
      .prepare(
        `INSERT INTO orders (
          id, code, customer_id, customer_snapshot_json, initial_confirmed_amount_cents,
          expected_ship_date, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id, input.code, input.customerId, JSON.stringify(input.customerSnapshot),
        input.initialConfirmedAmountCents, input.expectedShipDate, input.notes, input.now, input.now
      )
  }

  insertOrderItems(orderId: string, items: Array<Omit<V2OrderItem, 'orderId'>>): void {
    const statement = this.database.prepare(
      `INSERT INTO order_items (
        id, order_id, product_id, product_snapshot_json, quantity, unit_price_cents, line_no, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const [lineNo, item] of items.entries()) {
      statement.run(
        item.id, orderId, item.productId, JSON.stringify(item.productSnapshot), item.quantity,
        item.unitPriceCents, lineNo, item.createdAt, item.updatedAt
      )
    }
  }

  replaceOrderItems(orderId: string, items: Array<Omit<V2OrderItem, 'orderId'>>): void {
    this.database.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId)
    this.insertOrderItems(orderId, items)
    this.database.prepare('UPDATE orders SET updated_at = ? WHERE id = ?').run(items[0]?.updatedAt ?? new Date().toISOString(), orderId)
  }

  getOrder(orderId: string): V2Order | null {
    const row = this.database.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as OrderRow | undefined
    if (!row) return null
    const customer = row.customer_id ? this.getCustomer(row.customer_id) : null
    const items = this.listOrderItems(orderId)
    const adjustmentRows = this.database
      .prepare('SELECT * FROM order_amount_adjustments WHERE order_id = ? ORDER BY created_at ASC')
      .all(orderId) as AdjustmentRow[]
    const amount = calculateOrderAmountSummary({
      initialConfirmedAmountCents: row.initial_confirmed_amount_cents,
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
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  listOrders(): V2OrderSummary[] {
    const rows = this.database.prepare('SELECT * FROM orders ORDER BY updated_at DESC, created_at DESC').all() as OrderRow[]
    return rows.map((row) => {
      const customer = row.customer_id ? this.getCustomer(row.customer_id) : null
      const adjustmentRows = this.database
        .prepare('SELECT amount_cents FROM order_amount_adjustments WHERE order_id = ?')
        .all(row.id) as Array<{ amount_cents: number }>
      const amount = calculateOrderAmountSummary({
        initialConfirmedAmountCents: row.initial_confirmed_amount_cents,
        adjustmentsCents: adjustmentRows.map((item) => item.amount_cents)
      })
      const funds = this.getOrderFundSummary(row.id, amount.currentAmountCents)
      return {
        id: row.id,
        code: row.code,
        customerName: customer?.name ?? parseJson<V2CustomerInput>(row.customer_snapshot_json).name,
        itemCount: this.listOrderItems(row.id).length,
        currentAmountCents: amount.currentAmountCents,
        netReceivedCents: funds.netReceivedCents,
        outstandingCents: funds.outstandingCents,
        expectedShipDate: row.expected_ship_date,
        updatedAt: row.updated_at
      }
    })
  }

  listOrderItems(orderId: string): V2OrderItem[] {
    return (this.database
      .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY line_no ASC, id ASC')
      .all(orderId) as OrderItemRow[]).map(mapOrderItem)
  }

  createAmountAdjustment(input: V2OrderAmountAdjustment): void {
    this.database
      .prepare(
        `INSERT INTO order_amount_adjustments (id, order_id, amount_cents, occurred_on, reason, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(input.id, input.orderId, input.amountCents, input.occurredOn, input.reason, input.note ?? null, input.createdAt)
  }

  listAmountAdjustments(orderId: string): V2OrderAmountAdjustment[] {
    return (this.database
      .prepare('SELECT * FROM order_amount_adjustments WHERE order_id = ? ORDER BY created_at ASC, id ASC')
      .all(orderId) as AdjustmentRow[])
      .map((row) => ({
        id: row.id, orderId: row.order_id, amountCents: row.amount_cents, occurredOn: row.occurred_on,
        reason: row.reason, note: row.note, createdAt: row.created_at
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
        change.id, change.orderId, change.occurredOn, change.description,
        JSON.stringify(change.beforeItems), JSON.stringify(change.afterItems), change.createdAt
      )
  }

  listContentChanges(orderId: string): V2OrderContentChange[] {
    return (this.database
      .prepare('SELECT * FROM order_content_changes WHERE order_id = ? ORDER BY created_at ASC, id ASC')
      .all(orderId) as ContentChangeRow[])
      .map((row) => ({
        id: row.id, orderId: row.order_id, occurredOn: row.occurred_on, description: row.description,
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
        fund.id, fund.direction, fund.businessType, fund.amountCents, fund.occurredOn,
        fund.paymentMethod ?? null, fund.orderId, fund.attachmentId ?? null,
        fund.reversalOfEntryId, fund.note ?? null, fund.createdAt
      )
  }

  getFund(id: string): V2OrderFund | null {
    const row = this.database.prepare('SELECT * FROM financial_entries WHERE id = ?').get(id) as FundRow | undefined
    return row ? mapFund(row) : null
  }

  listOrderFunds(orderId: string): V2OrderFund[] {
    return (this.database
      .prepare('SELECT * FROM financial_entries WHERE order_id = ? ORDER BY created_at ASC, id ASC')
      .all(orderId) as FundRow[]).map(mapFund)
  }

  getOrderFundSummary(orderId: string, currentAmountCents: number): V2OrderFundSummary {
    return calculateOrderFundSummary({
      currentAmountCents,
      entries: this.listOrderFunds(orderId).map(({ id, direction, businessType, amountCents, reversalOfEntryId }) => ({
        id,
        direction,
        businessType,
        amountCents,
        reversalOfEntryId
      }))
    })
  }

  hasReversalForFund(fundId: string): boolean {
    return Boolean(this.database.prepare('SELECT 1 FROM financial_entries WHERE reversal_of_entry_id = ?').get(fundId))
  }

  countShipments(orderId: string): number {
    return Number((this.database.prepare('SELECT COUNT(*) AS count FROM shipments WHERE order_id = ?').get(orderId) as { count: number }).count)
  }

  listShippedQuantities(orderId: string): Map<string, number> {
    const rows = this.database
      .prepare(
        `SELECT shipment_items.order_item_id, COALESCE(SUM(shipment_items.quantity), 0) AS quantity
         FROM shipment_items
         JOIN shipments ON shipments.id = shipment_items.shipment_id
         WHERE shipments.order_id = ?
         GROUP BY shipment_items.order_item_id`
      )
      .all(orderId) as Array<{ order_item_id: string; quantity: number }>
    return new Map(rows.map((row) => [row.order_item_id, row.quantity]))
  }

  insertShipment(shipment: V2Shipment): void {
    this.database
      .prepare(
        `INSERT INTO shipments (
          id, order_id, shipped_on, carrier, tracking_number, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        shipment.id, shipment.orderId, shipment.shippedOn, shipment.carrier ?? null,
        shipment.trackingNumber ?? null, shipment.note ?? null, shipment.createdAt, shipment.updatedAt
      )
    const statement = this.database.prepare(
      'INSERT INTO shipment_items (id, shipment_id, order_item_id, quantity, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    for (const item of shipment.items) {
      statement.run(item.id, shipment.id, item.orderItemId, item.quantity, shipment.createdAt)
    }
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
      items: items.filter((item) => item.shipment_id === row.id).map((item) => ({
        orderItemId: item.order_item_id,
        quantity: item.quantity
      })),
      carrier: row.carrier,
      trackingNumber: row.tracking_number,
      note: row.note,
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
        input.id, input.action, input.entityType, input.entityId,
        input.before === undefined ? null : JSON.stringify(input.before),
        input.after === undefined ? null : JSON.stringify(input.after),
        input.metadata === undefined ? null : JSON.stringify(input.metadata), input.createdAt
      )
    return this.getAudit(input.id)!
  }

  getAudit(id: string): V2AuditLog | null {
    const row = this.database.prepare('SELECT * FROM audit_logs WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return null
    return {
      id: String(row.id), action: String(row.action), entityType: String(row.entity_type), entityId: String(row.entity_id),
      before: row.before_json ? parseJson(String(row.before_json)) : null,
      after: row.after_json ? parseJson(String(row.after_json)) : null,
      metadata: row.metadata_json ? parseJson(String(row.metadata_json)) : null,
      createdAt: String(row.created_at)
    }
  }

  listAuditLogs(entityId?: string): V2AuditLog[] {
    const rows = entityId
      ? this.database.prepare('SELECT * FROM audit_logs WHERE entity_id = ? ORDER BY created_at ASC, rowid ASC').all(entityId)
      : this.database.prepare('SELECT * FROM audit_logs ORDER BY created_at ASC, rowid ASC').all()
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id), action: String(row.action), entityType: String(row.entity_type), entityId: String(row.entity_id),
      before: row.before_json ? parseJson(String(row.before_json)) : null,
      after: row.after_json ? parseJson(String(row.after_json)) : null,
      metadata: row.metadata_json ? parseJson(String(row.metadata_json)) : null,
      createdAt: String(row.created_at)
    }))
  }
}
