import type { V2Database } from '@main/database/v2-connection'
import type {
  V2AdvancePayer,
  V2FinanceCategory,
  V2FinanceDirection,
  V2FinanceEntryQuery,
  V2FinancialEntry
} from '@shared/contracts/index'

export interface FinanceAuditInput {
  id: string
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
  metadata?: unknown
  createdAt: string
}

export type FinanceEntryInsert = Omit<V2FinancialEntry, 'categoryName' | 'advancePayerName'>

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T
}

function mapCategory(row: Record<string, unknown>): V2FinanceCategory {
  return {
    id: String(row.id),
    direction: row.direction as V2FinanceDirection,
    name: String(row.name),
    enabled: Boolean(row.enabled),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function mapPayer(row: Record<string, unknown>): V2AdvancePayer {
  return {
    id: String(row.id),
    name: String(row.name),
    enabled: Boolean(row.enabled),
    note: row.note as string | null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function mapEntry(row: Record<string, unknown>): V2FinancialEntry {
  return {
    id: String(row.id),
    sourceType: row.source_type as V2FinancialEntry['sourceType'],
    direction: row.direction as V2FinanceDirection,
    businessType: String(row.business_type),
    amountCents: Number(row.amount_cents),
    occurredOn: String(row.occurred_on),
    paymentMethod: row.payment_method as string | null,
    paymentSource: row.payment_source as V2FinancialEntry['paymentSource'],
    categoryId: row.category_id as string | null,
    categoryName: row.category_name as string | null,
    advancePayerId: row.advance_payer_id as string | null,
    advancePayerName: row.advance_payer_name as string | null,
    orderId: row.order_id as string | null,
    attachmentId: row.attachment_id as string | null,
    reversalOfEntryId: row.reversal_of_entry_id as string | null,
    note: row.note as string | null,
    createdAt: String(row.created_at)
  }
}

export class FinanceRepository {
  constructor(private readonly database: V2Database) {}

  get connection(): V2Database {
    return this.database
  }

  transaction<T>(operation: () => T): T {
    return this.database.transaction(operation)()
  }

  listCategories(direction?: V2FinanceDirection, includeDisabled = false): V2FinanceCategory[] {
    return (
      this.database
        .prepare(
          `SELECT * FROM finance_categories
       WHERE (? IS NULL OR direction = ?) AND (? = 1 OR enabled = 1)
       ORDER BY direction ASC, enabled DESC, name ASC`
        )
        .all(direction ?? null, direction ?? null, includeDisabled ? 1 : 0) as Array<
        Record<string, unknown>
      >
    ).map(mapCategory)
  }

  getCategory(id: string): V2FinanceCategory | null {
    const row = this.database.prepare('SELECT * FROM finance_categories WHERE id = ?').get(id) as
      Record<string, unknown> | undefined
    return row ? mapCategory(row) : null
  }

  insertCategory(category: V2FinanceCategory): void {
    this.database
      .prepare(
        `INSERT INTO finance_categories (id, direction, name, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        category.id,
        category.direction,
        category.name,
        Number(category.enabled),
        category.createdAt,
        category.updatedAt
      )
  }

  updateCategory(category: V2FinanceCategory): void {
    this.database
      .prepare('UPDATE finance_categories SET name = ?, enabled = ?, updated_at = ? WHERE id = ?')
      .run(category.name, Number(category.enabled), category.updatedAt, category.id)
  }

  isCategoryReferenced(id: string): boolean {
    return Boolean(
      this.database.prepare('SELECT 1 FROM financial_entries WHERE category_id = ? LIMIT 1').get(id)
    )
  }

  deleteCategory(id: string): void {
    this.database.prepare('DELETE FROM finance_categories WHERE id = ?').run(id)
  }

  listAdvancePayers(includeDisabled = false): V2AdvancePayer[] {
    return (
      this.database
        .prepare(
          'SELECT * FROM advance_payers WHERE (? = 1 OR enabled = 1) ORDER BY enabled DESC, name ASC'
        )
        .all(includeDisabled ? 1 : 0) as Array<Record<string, unknown>>
    ).map(mapPayer)
  }

  getAdvancePayer(id: string): V2AdvancePayer | null {
    const row = this.database.prepare('SELECT * FROM advance_payers WHERE id = ?').get(id) as
      Record<string, unknown> | undefined
    return row ? mapPayer(row) : null
  }

  insertAdvancePayer(payer: V2AdvancePayer): void {
    this.database
      .prepare(
        `INSERT INTO advance_payers (id, name, enabled, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        payer.id,
        payer.name,
        Number(payer.enabled),
        payer.note,
        payer.createdAt,
        payer.updatedAt
      )
  }

  updateAdvancePayer(payer: V2AdvancePayer): void {
    this.database
      .prepare(
        'UPDATE advance_payers SET name = ?, enabled = ?, note = ?, updated_at = ? WHERE id = ?'
      )
      .run(payer.name, Number(payer.enabled), payer.note, payer.updatedAt, payer.id)
  }

  isAdvancePayerReferenced(id: string): boolean {
    return Boolean(
      this.database
        .prepare('SELECT 1 FROM financial_entries WHERE advance_payer_id = ? LIMIT 1')
        .get(id)
    )
  }

  deleteAdvancePayer(id: string): void {
    this.database.prepare('DELETE FROM advance_payers WHERE id = ?').run(id)
  }

  listFinancialEntries(query: V2FinanceEntryQuery = {}): V2FinancialEntry[] {
    const rows = this.database
      .prepare(
        `SELECT entries.*, categories.name AS category_name, payers.name AS advance_payer_name
       FROM financial_entries entries
       LEFT JOIN finance_categories categories ON categories.id = entries.category_id
       LEFT JOIN advance_payers payers ON payers.id = entries.advance_payer_id
       WHERE (? IS NULL OR entries.direction = ?)
         AND (? IS NULL OR entries.source_type = ?)
         AND (? IS NULL OR entries.occurred_on >= ?)
         AND (? IS NULL OR entries.occurred_on <= ?)
       ORDER BY entries.occurred_on DESC, entries.created_at DESC, entries.id DESC`
      )
      .all(
        query.direction ?? null,
        query.direction ?? null,
        query.sourceType ?? null,
        query.sourceType ?? null,
        query.fromOn ?? null,
        query.fromOn ?? null,
        query.toOn ?? null,
        query.toOn ?? null
      ) as Array<Record<string, unknown>>
    return rows.map(mapEntry)
  }

  getFinancialEntry(id: string): V2FinancialEntry | null {
    const row = this.database
      .prepare(
        `SELECT entries.*, categories.name AS category_name, payers.name AS advance_payer_name
       FROM financial_entries entries
       LEFT JOIN finance_categories categories ON categories.id = entries.category_id
       LEFT JOIN advance_payers payers ON payers.id = entries.advance_payer_id
       WHERE entries.id = ?`
      )
      .get(id) as Record<string, unknown> | undefined
    return row ? mapEntry(row) : null
  }

  insertFinancialEntry(entry: FinanceEntryInsert): void {
    this.database
      .prepare(
        `INSERT INTO financial_entries (
        id, source_type, direction, business_type, amount_cents, occurred_on, payment_method, payment_source,
        category_id, advance_payer_id, order_id, attachment_id, reversal_of_entry_id, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.id,
        entry.sourceType,
        entry.direction,
        entry.businessType,
        entry.amountCents,
        entry.occurredOn,
        entry.paymentMethod,
        entry.paymentSource,
        entry.categoryId,
        entry.advancePayerId,
        entry.orderId,
        entry.attachmentId,
        entry.reversalOfEntryId,
        entry.note,
        entry.createdAt
      )
  }

  getReimbursementForAdvance(
    advanceFinancialEntryId: string
  ): { reimbursementFinancialEntryId: string; reimbursedOn: string } | null {
    const row = this.database
      .prepare(
        `SELECT links.reimbursement_financial_entry_id, entries.occurred_on
       FROM advance_reimbursements links
       JOIN financial_entries entries ON entries.id = links.reimbursement_financial_entry_id
       WHERE links.advance_financial_entry_id = ?`
      )
      .get(advanceFinancialEntryId) as
      { reimbursement_financial_entry_id: string; occurred_on: string } | undefined
    return row
      ? {
          reimbursementFinancialEntryId: row.reimbursement_financial_entry_id,
          reimbursedOn: row.occurred_on
        }
      : null
  }

  listReimbursementReferences(): Array<{ advanceFinancialEntryId: string; reimbursedOn: string }> {
    return this.database
      .prepare(
        `SELECT links.advance_financial_entry_id, entries.occurred_on
       FROM advance_reimbursements links
       JOIN financial_entries entries ON entries.id = links.reimbursement_financial_entry_id`
      )
      .all()
      .map((row) => ({
        advanceFinancialEntryId: String(
          (row as Record<string, unknown>).advance_financial_entry_id
        ),
        reimbursedOn: String((row as Record<string, unknown>).occurred_on)
      }))
  }

  insertReimbursementLink(
    id: string,
    advanceFinancialEntryId: string,
    reimbursementFinancialEntryId: string,
    createdAt: string
  ): void {
    this.database
      .prepare(
        `INSERT INTO advance_reimbursements (
        id, advance_financial_entry_id, reimbursement_financial_entry_id, created_at
      ) VALUES (?, ?, ?, ?)`
      )
      .run(id, advanceFinancialEntryId, reimbursementFinancialEntryId, createdAt)
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

  getAuditPayload(id: string): unknown | null {
    const row = this.database.prepare('SELECT after_json FROM audit_logs WHERE id = ?').get(id) as
      { after_json: string | null } | undefined
    return row?.after_json ? parseJson(row.after_json) : null
  }
}
