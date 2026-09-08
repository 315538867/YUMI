import type { V2Database } from '@main/database/v2-connection'
import type { V2FulfillmentEvent } from '@shared/contracts/fulfillment'
import type { V2FinanceEntrySourceType } from '@shared/contracts/finance'

export interface OrderBusinessSource {
  id: string
  code: string
  customerSnapshotJson: string
  initialConfirmedAmountCents: number
  adjustmentsCents: number[]
  itemSnapshots: Array<{ quantity: number; productSnapshotJson: string }>
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
    occurredOn: row.occurred_on,
    note: row.note,
    createdAt: row.created_at
  }
}

/** 只读取 V2 独立 schema 中已经落库的事实，不访问任何 V1 表。 */
export class ReportRepository {
  constructor(private readonly database: V2Database) {}

  listOrderBusinessSources(): OrderBusinessSource[] {
    const orders = this.database.prepare(
      `SELECT id, code, customer_snapshot_json, initial_confirmed_amount_cents
       FROM orders ORDER BY updated_at DESC, created_at DESC, id DESC`
    ).all() as Array<{
      id: string
      code: string
      customer_snapshot_json: string
      initial_confirmed_amount_cents: number
    }>
    const adjustments = this.database.prepare(
      'SELECT amount_cents FROM order_amount_adjustments WHERE order_id = ? ORDER BY created_at ASC, id ASC'
    )
    const items = this.database.prepare(
      'SELECT quantity, product_snapshot_json FROM order_items WHERE order_id = ? ORDER BY line_no ASC, id ASC'
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
      customerSnapshotJson: order.customer_snapshot_json,
      initialConfirmedAmountCents: order.initial_confirmed_amount_cents,
      adjustmentsCents: (adjustments.all(order.id) as Array<{ amount_cents: number }>).map((item) => item.amount_cents),
      itemSnapshots: (items.all(order.id) as Array<{ quantity: number; product_snapshot_json: string }>).map((item) => ({
        quantity: item.quantity,
        productSnapshotJson: item.product_snapshot_json
      })),
      funds: (funds.all(order.id) as Array<{
        id: string
        direction: 'income' | 'expense'
        business_type: 'payment' | 'refund' | 'after_sales_charge'
        amount_cents: number
        reversal_of_entry_id: string | null
      }>).map((fund) => ({
        id: fund.id,
        direction: fund.direction,
        businessType: fund.business_type,
        amountCents: fund.amount_cents,
        reversalOfEntryId: fund.reversal_of_entry_id
      })),
      afterSalesCostCents: (afterSalesCost.get(order.id) as { total: number }).total
    }))
  }

  listFulfillmentProgressSources(): FulfillmentProgressSource[] {
    const rows = this.database.prepare(
      `SELECT items.id AS order_item_id, items.order_id, items.quantity, items.product_snapshot_json, orders.code AS order_code
       FROM order_items items INNER JOIN orders ON orders.id = items.order_id
       ORDER BY orders.updated_at DESC, items.line_no ASC, items.id ASC`
    ).all() as Array<{
      order_item_id: string
      order_id: string
      quantity: number
      product_snapshot_json: string
      order_code: string
    }>
    const events = this.database.prepare(
      `SELECT id, order_item_id, event_type, quantity, source_stage, target_stage, source_record_type, source_record_id,
              occurred_on, note, created_at
       FROM fulfillment_events WHERE order_item_id = ? ORDER BY occurred_on ASC, created_at ASC, id ASC`
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

  listConfirmedSettlements(): ConfirmedSettlementSource[] {
    return this.database.prepare(
      `SELECT settlements.id, settlements.worker_id, workers.name AS worker_name,
              settlements.period_start_on, settlements.period_end_on, settlements.final_paid_amount_cents,
              settlements.paid_on, settlements.manager_note
       FROM worker_settlements settlements
       INNER JOIN workers ON workers.id = settlements.worker_id
       WHERE settlements.status = 'confirmed'
         AND settlements.final_paid_amount_cents IS NOT NULL
         AND settlements.paid_on IS NOT NULL
       ORDER BY settlements.paid_on DESC, settlements.updated_at DESC, settlements.id DESC`
    ).all().map((row) => {
      const source = row as Record<string, unknown>
      return {
        id: String(source.id), workerId: String(source.worker_id), workerName: String(source.worker_name),
        periodStartOn: String(source.period_start_on), periodEndOn: String(source.period_end_on),
        finalPaidAmountCents: Number(source.final_paid_amount_cents), paidOn: String(source.paid_on),
        managerNote: source.manager_note === null ? null : String(source.manager_note)
      }
    })
  }

  listMonthlyFinanceSources(): MonthlyFinanceSource[] {
    return this.database.prepare(
      'SELECT source_type, direction, amount_cents, occurred_on FROM financial_entries ORDER BY occurred_on ASC, created_at ASC, id ASC'
    ).all().map((row) => {
      const source = row as Record<string, unknown>
      return {
        sourceType: source.source_type as V2FinanceEntrySourceType,
        direction: source.direction as 'income' | 'expense',
        amountCents: Number(source.amount_cents),
        occurredOn: String(source.occurred_on)
      }
    })
  }
}
