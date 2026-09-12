import type { V2Database } from '@main/database/v2-connection'
import type {
  V2AfterSalesCase,
  V2AfterSalesCaseQuery,
  V2AfterSalesChargeLink
} from '@shared/contracts/index'
import type { FinanceAuditInput } from './finance-repository'

export type AfterSalesCaseWrite = Omit<V2AfterSalesCase, 'chargeFinancialEntryIds'>

function parseChargeIds(value: unknown): string[] {
  if (typeof value !== 'string' || !value) return []
  return JSON.parse(value) as string[]
}

function mapCase(row: Record<string, unknown>): V2AfterSalesCase {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    shipmentId: row.shipment_id as string | null,
    occurredOn: String(row.occurred_on),
    reasonDescription: String(row.reason_description),
    customerRequest: row.customer_request as string | null,
    responsibilityDescription: String(row.responsibility_description),
    handlingDescription: String(row.handling_description),
    status: row.status as V2AfterSalesCase['status'],
    customerChargeNote: row.customer_charge_note as string | null,
    accountingCostCents: Number(row.accounting_cost_cents),
    note: row.note as string | null,
    chargeFinancialEntryIds: parseChargeIds(row.charge_financial_entry_ids),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export class AfterSalesRepository {
  constructor(private readonly database: V2Database) {}

  transaction<T>(operation: () => T): T {
    return this.database.transaction(operation)()
  }

  hasOrder(orderId: string): boolean {
    return Boolean(this.database.prepare('SELECT 1 FROM orders WHERE id = ?').get(orderId))
  }

  shipmentBelongsToOrder(shipmentId: string, orderId: string): boolean {
    return Boolean(
      this.database
        .prepare('SELECT 1 FROM shipments WHERE id = ? AND order_id = ?')
        .get(shipmentId, orderId)
    )
  }

  getCase(id: string): V2AfterSalesCase | null {
    const row = this.getCaseQuery('WHERE cases.id = ?', [id])[0]
    return row ?? null
  }

  listCases(query: V2AfterSalesCaseQuery = {}): V2AfterSalesCase[] {
    const clauses: string[] = []
    const values: unknown[] = []
    if (query.orderId) {
      clauses.push('cases.order_id = ?')
      values.push(query.orderId)
    }
    if (query.status) {
      clauses.push('cases.status = ?')
      values.push(query.status)
    }
    return this.getCaseQuery(clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values)
  }

  insertCase(input: AfterSalesCaseWrite): void {
    this.database
      .prepare(
        `INSERT INTO after_sales_cases (
        id, order_id, shipment_id, occurred_on, reason_description, customer_request,
        responsibility_description, handling_description, status, customer_charge_note,
        accounting_cost_cents, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.orderId,
        input.shipmentId,
        input.occurredOn,
        input.reasonDescription,
        input.customerRequest,
        input.responsibilityDescription,
        input.handlingDescription,
        input.status,
        input.customerChargeNote,
        input.accountingCostCents,
        input.note,
        input.createdAt,
        input.updatedAt
      )
  }

  updateCase(input: AfterSalesCaseWrite): void {
    this.database
      .prepare(
        `UPDATE after_sales_cases SET shipment_id = ?, occurred_on = ?, reason_description = ?, customer_request = ?,
        responsibility_description = ?, handling_description = ?, status = ?, customer_charge_note = ?,
        accounting_cost_cents = ?, note = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        input.shipmentId,
        input.occurredOn,
        input.reasonDescription,
        input.customerRequest,
        input.responsibilityDescription,
        input.handlingDescription,
        input.status,
        input.customerChargeNote,
        input.accountingCostCents,
        input.note,
        input.updatedAt,
        input.id
      )
  }

  getFinancialEntryForLink(id: string): {
    id: string
    orderId: string | null
    sourceType: string
    direction: string
    businessType: string
  } | null {
    const row = this.database
      .prepare(
        'SELECT id, order_id, source_type, direction, business_type FROM financial_entries WHERE id = ?'
      )
      .get(id) as Record<string, unknown> | undefined
    if (!row) return null
    return {
      id: String(row.id),
      orderId: row.order_id as string | null,
      sourceType: String(row.source_type),
      direction: String(row.direction),
      businessType: String(row.business_type)
    }
  }

  insertChargeLink(link: V2AfterSalesChargeLink): void {
    this.database
      .prepare(
        `INSERT INTO after_sales_charge_links (after_sales_case_id, financial_entry_id, created_at)
       VALUES (?, ?, ?)`
      )
      .run(link.afterSalesCaseId, link.financialEntryId, link.createdAt)
  }

  insertAudit(input: FinanceAuditInput): void {
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
  }

  private getCaseQuery(whereClause: string, values: unknown[]): V2AfterSalesCase[] {
    const rows = this.database
      .prepare(
        `SELECT cases.*,
        COALESCE((
          SELECT json_group_array(financial_entry_id)
          FROM after_sales_charge_links links
          WHERE links.after_sales_case_id = cases.id
        ), '[]') AS charge_financial_entry_ids
       FROM after_sales_cases cases
       ${whereClause}
       ORDER BY cases.occurred_on DESC, cases.created_at DESC, cases.id DESC`
      )
      .all(...values) as Array<Record<string, unknown>>
    return rows.map(mapCase)
  }
}
