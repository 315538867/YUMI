import { DomainValidationError } from '@main/domain/errors'
import type { V2Database } from '@main/database/v2-connection'
import type { V2FulfillmentEvent } from '@shared/contracts/fulfillment'
import type { V2FinanceEntrySourceType } from '@shared/contracts/finance'

export interface OrderBusinessSource {
  id: string
  code: string
  customerId: string | null
  customerSnapshotJson: string
  createdAt: string
  orderDiscountCents: number
  adjustmentsCents: number[]
  itemSnapshots: Array<{
    id: string
    quantity: number
    edgeEnabled: boolean
    edgeQuantity: number
    unitPriceCents: number
    edgeUnitPriceCents: number
    itemDiscountCents: number
    productSnapshotJson: string
  }>
  funds: Array<{
    id: string
    direction: 'income' | 'expense'
    businessType: 'payment' | 'refund' | 'after_sales_charge'
    amountCents: number
    reversalOfEntryId: string | null
  }>
  afterSalesCostCents: number
}

export interface FulfillmentProgressSource {
  orderId: string
  orderCode: string
  orderItemId: string
  confirmedQuantity: number
  productSnapshotJson: string
  events: V2FulfillmentEvent[]
}

export interface RiskOrderItemSource {
  orderId: string
  orderCode: string
  orderItemId: string
  productId: string
  productSnapshotJson: string
  confirmedQuantity: number
  expectedShipDate: string | null
  reservedDays: number
  dailyCapacity: number
  scheduledMakingTasks: Array<{ assignedOn: string; plannedQuantity: number }>
  events: V2FulfillmentEvent[]
}

export interface ConfirmedSettlementSource {
  id: string
  workerId: string
  workerName: string
  periodStartOn: string
  periodEndOn: string
  finalPaidAmountCents: number
  paidOn: string
  managerNote: string | null
}

export interface MonthlyFinanceSource {
  id: string
  sourceType: V2FinanceEntrySourceType
  direction: 'income' | 'expense'
  amountCents: number
  occurredOn: string
}

interface EventRow {
  id: string
  order_item_id: string
  event_type: V2FulfillmentEvent['eventType']
  quantity: number
  source_stage: V2FulfillmentEvent['sourceStage']
  target_stage: V2FulfillmentEvent['targetStage']
  source_record_type: string | null
  source_record_id: string | null
  source_event_key: string | null
  occurred_on: string
  note: string | null
  created_at: string
}

function mapEvent(row: EventRow): V2FulfillmentEvent {
  return {
    id: row.id,
    orderItemId: row.order_item_id,
    eventType: row.event_type,
    quantity: row.quantity,
    sourceStage: row.source_stage,
    targetStage: row.target_stage,
    sourceRecordType: row.source_record_type,
    sourceRecordId: row.source_record_id,
    sourceEventKey: row.source_event_key,
    occurredOn: row.occurred_on,
    note: row.note,
    createdAt: row.created_at
  }
}

/** 只读取 V2 独立 schema 中已经落库的事实，不访问任何 V1 表。 */
export class ReportRepository {
  constructor(private readonly database: V2Database) {}

  listOrderBusinessSources(): OrderBusinessSource[] {
    const orders = this.database
      .prepare(
        `SELECT id, code, customer_id, customer_snapshot_json, created_at, order_discount_cents
       FROM orders ORDER BY updated_at DESC, created_at DESC, id DESC`
      )
      .all() as Array<{
      id: string
      code: string
      customer_id: string | null
      customer_snapshot_json: string
      created_at: string
      order_discount_cents: number
    }>
    const adjustments = this.database.prepare(
      'SELECT amount_cents FROM order_amount_adjustments WHERE order_id = ? ORDER BY created_at ASC, id ASC'
    )
    const items = this.database.prepare(
      `SELECT id, quantity, unit_price_cents, edge_enabled, edge_quantity, edge_unit_price_cents,
              item_discount_cents, product_snapshot_json
       FROM order_items WHERE order_id = ? ORDER BY line_no ASC, id ASC`
    )
    const funds = this.database.prepare(
      `SELECT id, direction, business_type, amount_cents, reversal_of_entry_id
       FROM financial_entries WHERE order_id = ? AND source_type = 'order_fund'
       ORDER BY occurred_on ASC, created_at ASC, id ASC`
    )
    const afterSalesCost = this.database.prepare(
      'SELECT COALESCE(SUM(accounting_cost_cents), 0) AS total FROM after_sales_cases WHERE order_id = ?'
    )

    return orders.map((order) => ({
      id: order.id,
      code: order.code,
      customerId: order.customer_id,
      customerSnapshotJson: order.customer_snapshot_json,
      createdAt: order.created_at,
      orderDiscountCents: order.order_discount_cents,
      adjustmentsCents: (adjustments.all(order.id) as Array<{ amount_cents: number }>).map(
        (item) => item.amount_cents
      ),
      itemSnapshots: (
        items.all(order.id) as Array<{
          quantity: number
          unit_price_cents: number
          edge_enabled: number
          edge_quantity: number
          edge_unit_price_cents: number
          item_discount_cents: number
          product_snapshot_json: string
          id: string
        }>
      ).map((item) => ({
        id: item.id,
        quantity: item.quantity,
        unitPriceCents: item.unit_price_cents,
        edgeEnabled: Boolean(item.edge_enabled),
        edgeQuantity: item.edge_quantity,
        edgeUnitPriceCents: item.edge_unit_price_cents,
        itemDiscountCents: item.item_discount_cents,
        productSnapshotJson: item.product_snapshot_json
      })),
      funds: (
        funds.all(order.id) as Array<{
          id: string
          direction: 'income' | 'expense'
          business_type: 'payment' | 'refund' | 'after_sales_charge'
          amount_cents: number
          reversal_of_entry_id: string | null
        }>
      ).map((fund) => ({
        id: fund.id,
        direction: fund.direction,
        businessType: fund.business_type,
        amountCents: fund.amount_cents,
        reversalOfEntryId: fund.reversal_of_entry_id
      })),
      afterSalesCostCents: (afterSalesCost.get(order.id) as { total: number }).total
    }))
  }

  listCustomersForOrderInsights(): Array<{ id: string; name: string }> {
    return this.database
      .prepare('SELECT id, name FROM customers ORDER BY name COLLATE NOCASE ASC, id ASC')
      .all()
      .map((row) => {
        const source = row as Record<string, unknown>
        return { id: String(source.id), name: String(source.name) }
      })
  }

  listOrderTableSources(orderId?: string | null): Array<{
    id: string
    code: string
    customerSnapshotJson: string
    createdAt: string
    expectedShipDate: string | null
    itemCount: number
    totalQuantity: number
    orderDiscountCents: number
    adjustmentsCents: number[]
    itemSnapshots: OrderBusinessSource['itemSnapshots']
    funds: OrderBusinessSource['funds']
    notes: string | null
  }> {
    const filter = orderId?.trim() ? 'WHERE orders.id = ?' : ''
    const statement = this.database.prepare(
      `SELECT orders.id, orders.code, orders.customer_snapshot_json, orders.created_at,
              orders.expected_ship_date, orders.order_discount_cents, orders.notes,
              COUNT(order_items.id) AS item_count, COALESCE(SUM(order_items.quantity), 0) AS total_quantity
       FROM orders
       LEFT JOIN order_items ON order_items.order_id = orders.id
       ${filter}
       GROUP BY orders.id
       ORDER BY orders.created_at DESC, orders.id DESC`
    )
    const rows = (orderId?.trim() ? statement.all(orderId.trim()) : statement.all()) as Array<
      Record<string, unknown>
    >
    const details = this.listOrderBusinessSources()
    return rows.map((row) => {
      const detail = details.find((item) => item.id === String(row.id))
      return {
        id: String(row.id),
        code: String(row.code),
        customerSnapshotJson: String(row.customer_snapshot_json),
        createdAt: String(row.created_at),
        expectedShipDate: row.expected_ship_date === null ? null : String(row.expected_ship_date),
        itemCount: Number(row.item_count),
        totalQuantity: Number(row.total_quantity),
        orderDiscountCents: Number(row.order_discount_cents),
        adjustmentsCents: detail?.adjustmentsCents ?? [],
        itemSnapshots: detail?.itemSnapshots ?? [],
        funds: detail?.funds ?? [],
        notes: row.notes === null ? null : String(row.notes)
      }
    })
  }

  /**
   * 指定批次时，始终读取该批创建时写入的订单快照；未指定时则提供当前全量发货视图。
   * 这样后续批次、客户资料或商品资料发生变化，不会改写历史发货清单。
   */
  listShippingListSources(
    shipmentId?: string | null,
    orderId?: string | null
  ): Array<{
    orderItemId: string
    orderCode: string
    customerSnapshotJson: string
    productSnapshotJson: string
    expectedShipDate: string | null
    orderedQuantity: number
    shippedQuantity: number
    latestShippedOn: string | null
    carrier: string | null
    trackingNumber: string | null
    shipmentSnapshotJson: string | null
    shipmentStatus: 'active' | 'voided' | null
    voidedOn: string | null
    voidReason: string | null
  }> {
    const shipment = shipmentId
      ? (this.database
          .prepare(
            'SELECT order_id, snapshot_json, status, voided_on, void_reason FROM shipments WHERE id = ?'
          )
          .get(shipmentId) as
          | {
              order_id: string
              snapshot_json: string | null
              status: 'active' | 'voided'
              voided_on: string | null
              void_reason: string | null
            }
          | undefined)
      : undefined
    if (shipmentId && !shipment) throw new DomainValidationError('发货批次不存在')
    if (shipment && orderId?.trim() && shipment.order_id !== orderId.trim()) {
      throw new DomainValidationError('发货批次不属于指定订单')
    }
    const selectedOrderId = shipment?.order_id ?? orderId?.trim() ?? null
    const batchFields = shipment
      ? `, ? AS shipment_snapshot_json, ? AS shipment_status, ? AS voided_on, ? AS void_reason`
      : `, NULL AS shipment_snapshot_json, NULL AS shipment_status, NULL AS voided_on, NULL AS void_reason`
    const orderFilter = selectedOrderId ? 'WHERE orders.id = ?' : ''
    const statement = this.database.prepare(
      `SELECT order_items.id AS order_item_id, orders.code AS order_code,
              orders.customer_snapshot_json, orders.expected_ship_date,
              order_items.product_snapshot_json, order_items.quantity AS ordered_quantity,
              COALESCE(SUM(CASE WHEN shipments.status = 'active' THEN shipment_items.quantity ELSE 0 END), 0) AS shipped_quantity,
              MAX(CASE WHEN shipments.status = 'active' THEN shipments.shipped_on END) AS latest_shipped_on,
              GROUP_CONCAT(DISTINCT CASE WHEN shipments.status = 'active' THEN shipments.carrier END) AS carrier,
              GROUP_CONCAT(DISTINCT CASE WHEN shipments.status = 'active' THEN shipments.tracking_number END) AS tracking_number
              ${batchFields}
       FROM order_items
       INNER JOIN orders ON orders.id = order_items.order_id
       LEFT JOIN shipment_items ON shipment_items.order_item_id = order_items.id
       LEFT JOIN shipments ON shipments.id = shipment_items.shipment_id
       ${orderFilter}
       GROUP BY order_items.id
       ORDER BY orders.expected_ship_date IS NULL, orders.expected_ship_date ASC, orders.code ASC, order_items.line_no ASC`
    )
    const rows = shipment
      ? statement.all(
          shipment.snapshot_json,
          shipment.status,
          shipment.voided_on,
          shipment.void_reason,
          selectedOrderId
        )
      : selectedOrderId
        ? statement.all(selectedOrderId)
        : statement.all()
    return rows.map((row) => {
      const source = row as Record<string, unknown>
      return {
        orderItemId: String(source.order_item_id),
        orderCode: String(source.order_code),
        customerSnapshotJson: String(source.customer_snapshot_json),
        productSnapshotJson: String(source.product_snapshot_json),
        expectedShipDate:
          source.expected_ship_date === null ? null : String(source.expected_ship_date),
        orderedQuantity: Number(source.ordered_quantity),
        shippedQuantity: Number(source.shipped_quantity),
        latestShippedOn:
          source.latest_shipped_on === null ? null : String(source.latest_shipped_on),
        carrier: source.carrier === null ? null : String(source.carrier),
        trackingNumber: source.tracking_number === null ? null : String(source.tracking_number),
        shipmentSnapshotJson:
          source.shipment_snapshot_json === null ? null : String(source.shipment_snapshot_json),
        shipmentStatus:
          source.shipment_status === null ? null : (source.shipment_status as 'active' | 'voided'),
        voidedOn: source.voided_on === null ? null : String(source.voided_on),
        voidReason: source.void_reason === null ? null : String(source.void_reason)
      }
    })
  }

  listFulfillmentProgressSources(): FulfillmentProgressSource[] {
    const rows = this.database
      .prepare(
        `SELECT items.id AS order_item_id, items.order_id, items.quantity, items.product_snapshot_json, orders.code AS order_code
       FROM order_items items INNER JOIN orders ON orders.id = items.order_id
       ORDER BY orders.updated_at DESC, items.line_no ASC, items.id ASC`
      )
      .all() as Array<{
      order_item_id: string
      order_id: string
      quantity: number
      product_snapshot_json: string
      order_code: string
    }>
    const events = this.database.prepare(
      `SELECT id, order_item_id, event_type, quantity, source_stage, target_stage, source_record_type, source_record_id,
              occurred_on, note, created_at
       FROM fulfillment_events WHERE order_item_id = ? ORDER BY occurred_on ASC, created_at ASC, rowid ASC`
    )
    return rows.map((row) => ({
      orderId: row.order_id,
      orderCode: row.order_code,
      orderItemId: row.order_item_id,
      confirmedQuantity: row.quantity,
      productSnapshotJson: row.product_snapshot_json,
      events: (events.all(row.order_item_id) as EventRow[]).map(mapEvent)
    }))
  }

  /**
   * 风险报表只读取实际订单、履约和非取消排产事实。V2 订单没有取消状态；
   * 表约束已保证订单行数量为正，故不接受无效订单行进入聚合。
   */
  listRiskOrderItemSources(): RiskOrderItemSource[] {
    const rows = this.database
      .prepare(
        `SELECT items.id AS order_item_id, items.order_id, items.product_id, items.quantity,
                items.product_snapshot_json, orders.code AS order_code, orders.expected_ship_date,
                orders.reserved_days, COALESCE(products.daily_capacity, 0) AS daily_capacity,
                COALESCE(products.enabled, 0) AS product_enabled
         FROM order_items items
         INNER JOIN orders ON orders.id = items.order_id
         LEFT JOIN products ON products.id = items.product_id
         WHERE items.product_id IS NOT NULL AND items.quantity > 0
         ORDER BY orders.updated_at DESC, items.line_no ASC, items.id ASC`
      )
      .all() as Array<{
      order_item_id: string
      order_id: string
      product_id: string
      quantity: number
      product_snapshot_json: string
      order_code: string
      expected_ship_date: string | null
      reserved_days: number
      daily_capacity: number
      product_enabled: number
    }>
    const events = this.database.prepare(
      `SELECT id, order_item_id, event_type, quantity, source_stage, target_stage, source_record_type, source_record_id,
              occurred_on, note, created_at
       FROM fulfillment_events WHERE order_item_id = ? ORDER BY occurred_on ASC, created_at ASC, rowid ASC`
    )
    const tasks = this.database.prepare(
      `SELECT assignments.assigned_on, tasks.planned_quantity
       FROM process_tasks tasks
       INNER JOIN work_assignments assignments ON assignments.id = tasks.work_assignment_id
       WHERE tasks.order_item_id = ?
         AND tasks.process_type = 'making'
         AND tasks.status <> 'cancelled'
         AND assignments.status <> 'cancelled'
         AND tasks.planned_quantity IS NOT NULL
       ORDER BY assignments.assigned_on ASC, tasks.created_at ASC, tasks.id ASC`
    )
    return rows.map((row) => ({
      orderId: row.order_id,
      orderCode: row.order_code,
      orderItemId: row.order_item_id,
      productId: row.product_id,
      productSnapshotJson: row.product_snapshot_json,
      confirmedQuantity: row.quantity,
      expectedShipDate: row.expected_ship_date,
      reservedDays: row.reserved_days,
      dailyCapacity: row.product_enabled ? row.daily_capacity : 0,
      scheduledMakingTasks: (
        tasks.all(row.order_item_id) as Array<{
          assigned_on: string
          planned_quantity: number
        }>
      ).map((task) => ({ assignedOn: task.assigned_on, plannedQuantity: task.planned_quantity })),
      events: (events.all(row.order_item_id) as EventRow[]).map(mapEvent)
    }))
  }

  listConfirmedSettlements(): ConfirmedSettlementSource[] {
    return this.database
      .prepare(
        `SELECT settlements.id, settlements.worker_id, workers.name AS worker_name,
              settlements.period_start_on, settlements.period_end_on, settlements.final_paid_amount_cents,
              settlements.paid_on, settlements.manager_note
       FROM worker_settlements settlements
       INNER JOIN workers ON workers.id = settlements.worker_id
       WHERE settlements.status = 'confirmed'
         AND settlements.final_paid_amount_cents IS NOT NULL
         AND settlements.paid_on IS NOT NULL
       ORDER BY settlements.paid_on DESC, settlements.updated_at DESC, settlements.id DESC`
      )
      .all()
      .map((row) => {
        const source = row as Record<string, unknown>
        return {
          id: String(source.id),
          workerId: String(source.worker_id),
          workerName: String(source.worker_name),
          periodStartOn: String(source.period_start_on),
          periodEndOn: String(source.period_end_on),
          finalPaidAmountCents: Number(source.final_paid_amount_cents),
          paidOn: String(source.paid_on),
          managerNote: source.manager_note === null ? null : String(source.manager_note)
        }
      })
  }

  listMonthlyFinanceSources(): MonthlyFinanceSource[] {
    return this.database
      .prepare(
        'SELECT id, source_type, direction, amount_cents, occurred_on FROM financial_entries ORDER BY occurred_on ASC, created_at ASC, id ASC'
      )
      .all()
      .map((row) => {
        const source = row as Record<string, unknown>
        return {
          id: String(source.id),
          sourceType: source.source_type as V2FinanceEntrySourceType,
          direction: source.direction as 'income' | 'expense',
          amountCents: Number(source.amount_cents),
          occurredOn: String(source.occurred_on)
        }
      })
  }
}
