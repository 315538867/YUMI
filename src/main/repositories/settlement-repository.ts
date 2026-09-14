import type { V2Database } from '@main/database/v2-connection'
import type {
  V2WorkerSettlementMakingSource,
  V2WorkerSettlementTimedItem,
  V2WorkerSettlementTimedSource,
  V2WorkerSettlementWorkTimeAdjustment,
  V2Worker,
  V2WorkerDeductionRecord,
  V2WorkerRefundQuery,
  V2WorkerRefundRecord,
  V2WorkerSettlement,
  V2WorkerSettlementDeductionAllocation,
  V2WorkerSettlementQuery,
  V2WorkerWageHistory
} from '@shared/contracts/settlements'

interface WagePaymentFinancialEntry {
  id: string
  amountCents: number
  occurredOn: string
  note: string | null
  createdAt: string
}

export interface MakingSourceRow {
  processTaskId: string
  workAssignmentId: string
  assignedOn: string
  pieceRateCents: number | null
  materialPriceMicroYuanPerGram: number | null
  unitWeightMilligrams: number | null
  orderId: string | null
  orderItemId: string | null
  processResultId: string | null
  qualifiedQuantity: number
  unqualifiedQuantity: number
  qualityInspectionId: string
  inspectedOn: string
}

export interface TimedReviewRow {
  id: string
  processType: 'fluffing_bagging' | 'edge_sewing' | 'packing'
  workedOn: string
  approvedMinutes: number
  hourlyWageCentsSnapshot: number
  items: Array<{
    id: string
    processTaskId: string
    orderItemId: string | null
    completedQuantity: number
    pieceRateCents: number | null
  }>
}

function nullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function mapMakingSourceRow(row: Record<string, unknown>): MakingSourceRow {
  return {
    processTaskId: String(row.process_task_id),
    workAssignmentId: String(row.work_assignment_id),
    assignedOn: String(row.assigned_on),
    pieceRateCents: row.piece_rate_cents === null ? null : Number(row.piece_rate_cents),
    materialPriceMicroYuanPerGram:
      row.glue_price_micro_yuan_per_gram === null
        ? null
        : Number(row.glue_price_micro_yuan_per_gram),
    unitWeightMilligrams:
      row.glue_weight_milligrams === null ? null : Number(row.glue_weight_milligrams),
    orderId: row.order_id as string | null,
    orderItemId: row.order_item_id as string | null,
    processResultId: row.process_result_id === null ? null : String(row.process_result_id),
    qualifiedQuantity: Number(row.qualified_quantity),
    unqualifiedQuantity: Number(row.unqualified_quantity),
    qualityInspectionId: String(row.quality_inspection_id),
    inspectedOn: String(row.inspected_on)
  }
}

function mapWorker(row: Record<string, unknown>): V2Worker {
  return {
    id: String(row.id),
    name: String(row.name),
    enabled: Boolean(row.enabled),
    note: row.note as string | null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function mapWage(row: Record<string, unknown>): V2WorkerWageHistory {
  return {
    id: String(row.id),
    workerId: String(row.worker_id),
    effectiveOn: String(row.effective_on),
    hourlyWageCents: Number(row.hourly_wage_cents),
    createdAt: String(row.created_at)
  }
}

function mapSettlement(row: Record<string, unknown>): V2WorkerSettlement {
  return {
    id: String(row.id),
    workerId: String(row.worker_id),
    periodStartOn: String(row.period_start_on),
    periodEndOn: String(row.period_end_on),
    status: row.status as V2WorkerSettlement['status'],
    timedWageCents: Number(row.timed_wage_cents),
    commissionCents: Number(row.commission_cents),
    materialDeductionCents: Number(row.material_deduction_cents),
    adjustmentCents: Number(row.adjustment_cents),
    otherAdjustmentCents: Number(row.other_adjustment_cents),
    candidateWageCents: Number(row.candidate_wage_cents),
    currentDeductionCents: Number(row.current_deduction_cents),
    carriedDeductionCents: Number(row.carried_deduction_cents),
    actualDeductionCents: Number(row.actual_deduction_cents),
    continuingCarryoverCents: Number(row.continuing_carryover_cents),
    finalPaidAmountCents:
      row.final_paid_amount_cents === null ? null : Number(row.final_paid_amount_cents),
    paidOn: row.paid_on as string | null,
    managerNote: row.manager_note as string | null,
    financialEntryId: row.financial_entry_id as string | null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function mapMakingSource(row: Record<string, unknown>): V2WorkerSettlementMakingSource {
  return {
    id: String(row.id),
    processTaskId: String(row.process_task_id),
    qualityInspectionId: String(row.quality_inspection_id),
    orderId: row.order_id as string | null,
    orderItemId: row.order_item_id as string | null,
    occurredOn: String(row.occurred_on),
    qualifiedQuantity: Number(row.qualified_quantity),
    unqualifiedQuantity: Number(row.unqualified_quantity),
    pieceRateCents: row.piece_rate_cents === null ? null : Number(row.piece_rate_cents),
    qualifiedCommissionCents: Number(row.qualified_commission_cents),
    materialDeductionCents: Number(row.material_deduction_cents),
    status: row.status as V2WorkerSettlementMakingSource['status'],
    createdAt: String(row.created_at)
  }
}

function mapTimedSource(row: Record<string, unknown>): V2WorkerSettlementTimedSource {
  return {
    id: String(row.id),
    workTimeReviewId: String(row.work_time_review_id),
    processType: row.process_type as V2WorkerSettlementTimedSource['processType'],
    occurredOn: String(row.occurred_on),
    approvedMinutes: Number(row.approved_minutes),
    hourlyWageCentsSnapshot: Number(row.hourly_wage_cents_snapshot),
    timedWageCents: Number(row.timed_wage_cents),
    commissionCents: Number(row.commission_cents),
    status: row.status as V2WorkerSettlementTimedSource['status'],
    items: [],
    createdAt: String(row.created_at)
  }
}

function mapTimedItem(row: Record<string, unknown>): V2WorkerSettlementTimedItem {
  return {
    id: String(row.id),
    processTaskId: String(row.process_task_id),
    orderItemId: row.order_item_id as string | null,
    completedQuantity: Number(row.completed_quantity),
    pieceRateCents: row.piece_rate_cents === null ? null : Number(row.piece_rate_cents),
    commissionCents: Number(row.commission_cents)
  }
}

function mapAdjustment(row: Record<string, unknown>): V2WorkerSettlementWorkTimeAdjustment {
  return {
    id: String(row.id),
    workTimeReviewId: String(row.work_time_review_id),
    originalSettlementId: String(row.original_settlement_id),
    processType: row.process_type as V2WorkerSettlementWorkTimeAdjustment['processType'],
    originalMinutes: Number(row.original_minutes),
    correctedMinutes: Number(row.corrected_minutes),
    hourlyWageCentsSnapshot: Number(row.hourly_wage_cents_snapshot),
    amountCents: Number(row.amount_cents),
    reason: String(row.reason),
    note: row.note as string | null,
    status: row.status as V2WorkerSettlementWorkTimeAdjustment['status'],
    createdAt: String(row.created_at)
  }
}

function mapDeduction(row: Record<string, unknown>): V2WorkerDeductionRecord {
  return {
    id: String(row.id),
    workerId: String(row.worker_id),
    workAssignmentId: row.work_assignment_id as string | null,
    processTaskId: String(row.process_task_id),
    processResultId: row.process_result_id as string | null,
    qualityInspectionId: row.quality_inspection_id as string | null,
    orderId: row.order_id as string | null,
    orderItemId: row.order_item_id as string | null,
    unqualifiedQuantity: Number(row.unqualified_quantity),
    materialDeductionCents: Number(row.material_deduction_cents),
    totalDeductionCents: Number(row.total_deduction_cents),
    deductedCents: Number(row.deducted_cents),
    remainingCarryoverCents: Number(row.remaining_carryover_cents),
    status: row.status as V2WorkerDeductionRecord['status'],
    occurredOn: row.inspected_on ? String(row.inspected_on) : String(row.created_at).slice(0, 10),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function mapAllocation(row: Record<string, unknown>): V2WorkerSettlementDeductionAllocation {
  return {
    id: String(row.id),
    deductionRecordId: String(row.deduction_record_id),
    allocatedCents: Number(row.allocated_cents),
    status: row.status as V2WorkerSettlementDeductionAllocation['status'],
    createdAt: String(row.created_at)
  }
}

function mapRefund(row: Record<string, unknown>): V2WorkerRefundRecord {
  return {
    id: String(row.id),
    workerId: String(row.worker_id),
    originalSettlementId: String(row.original_settlement_id),
    processTaskId: String(row.process_task_id),
    processResultId: row.process_result_id as string | null,
    qualityInspectionId: String(row.quality_inspection_id),
    orderId: row.order_id as string | null,
    orderItemId: row.order_item_id as string | null,
    unqualifiedQuantity: Number(row.unqualified_quantity),
    materialRefundCents: Number(row.material_refund_cents),
    actualRefundCents: row.actual_refund_cents === null ? null : Number(row.actual_refund_cents),
    refundedOn: row.refunded_on as string | null,
    managerNote: row.manager_note as string | null,
    status: row.status as V2WorkerRefundRecord['status'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export class SettlementRepository {
  constructor(private readonly database: V2Database) {}

  transaction<T>(operation: () => T): T {
    return this.database.transaction(operation)()
  }

  getWorker(id: string): V2Worker | null {
    const row = this.database.prepare('SELECT * FROM workers WHERE id = ?').get(id) as
      Record<string, unknown> | undefined
    return row ? mapWorker(row) : null
  }

  listWorkers(): V2Worker[] {
    const rows = this.database
      .prepare(
        'SELECT * FROM workers ORDER BY enabled DESC, name COLLATE NOCASE ASC, created_at ASC'
      )
      .all() as Array<Record<string, unknown>>
    return rows.map(mapWorker)
  }

  insertWorker(worker: V2Worker): void {
    this.database
      .prepare(
        'INSERT INTO workers (id, name, enabled, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        worker.id,
        worker.name,
        Number(worker.enabled),
        worker.note,
        worker.createdAt,
        worker.updatedAt
      )
  }

  insertWageHistory(wage: V2WorkerWageHistory): void {
    this.database
      .prepare(
        'INSERT INTO worker_wage_history (id, worker_id, effective_on, hourly_wage_cents, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(wage.id, wage.workerId, wage.effectiveOn, wage.hourlyWageCents, wage.createdAt)
  }

  listWageHistory(workerId: string): V2WorkerWageHistory[] {
    const rows = this.database
      .prepare(
        'SELECT * FROM worker_wage_history WHERE worker_id = ? ORDER BY effective_on DESC, created_at DESC'
      )
      .all(workerId) as Array<Record<string, unknown>>
    return rows.map(mapWage)
  }

  getHourlyWage(workerId: string, effectiveOn: string): number | null {
    const row = this.database
      .prepare(
        `SELECT hourly_wage_cents FROM worker_wage_history
       WHERE worker_id = ? AND effective_on <= ? ORDER BY effective_on DESC LIMIT 1`
      )
      .get(workerId, effectiveOn) as { hourly_wage_cents: number } | undefined
    return row?.hourly_wage_cents ?? null
  }

  /** 制作结果来源：工作安排日期落在期间内、已完成且尚未进入有效结算的制作质检。 */
  listEligibleMakingSources(
    workerId: string,
    periodStartOn: string,
    periodEndOn: string
  ): MakingSourceRow[] {
    const rows = this.database
      .prepare(
        `SELECT
        process_tasks.id AS process_task_id, work_assignments.id AS work_assignment_id, work_assignments.assigned_on,
        process_tasks.piece_rate_cents,
        process_tasks.glue_price_micro_yuan_per_gram, process_tasks.glue_weight_milligrams,
        order_items.order_id, process_tasks.order_item_id,
        process_results.id AS process_result_id,
        quality_inspections.qualified_quantity, quality_inspections.unqualified_quantity,
        quality_inspections.id AS quality_inspection_id, quality_inspections.inspected_on
       FROM quality_inspections
       JOIN process_tasks ON process_tasks.id = quality_inspections.process_task_id
       JOIN work_assignments ON work_assignments.id = process_tasks.work_assignment_id
       JOIN process_results ON process_results.id = quality_inspections.process_result_id
       LEFT JOIN order_items ON order_items.id = process_tasks.order_item_id
       WHERE work_assignments.worker_id = ?
         AND work_assignments.assigned_on BETWEEN ? AND ?
         AND process_tasks.process_type = 'making'
         AND process_tasks.status = 'confirmed'
         AND NOT EXISTS (
           SELECT 1 FROM worker_settlement_making_sources sources
           WHERE sources.quality_inspection_id = quality_inspections.id AND sources.status <> 'cancelled'
         )
       ORDER BY work_assignments.assigned_on ASC, quality_inspections.created_at ASC, quality_inspections.id ASC`
      )
      .all(workerId, periodStartOn, periodEndOn) as Array<Record<string, unknown>>
    return rows.map(mapMakingSourceRow)
  }

  /** 计时来源：工作日期落在期间内、已确认且尚未进入有效结算的工时核算。 */
  listEligibleTimedReviews(
    workerId: string,
    periodStartOn: string,
    periodEndOn: string
  ): TimedReviewRow[] {
    const rows = this.database
      .prepare(
        `SELECT reviews.*
       FROM work_time_reviews reviews
       WHERE reviews.worker_id = ?
         AND reviews.worked_on BETWEEN ? AND ?
         AND reviews.status = 'confirmed'
         AND NOT EXISTS (
           SELECT 1 FROM worker_settlement_timed_sources sources
           WHERE sources.work_time_review_id = reviews.id AND sources.status <> 'cancelled'
         )
       ORDER BY reviews.worked_on ASC, reviews.created_at ASC, reviews.id ASC`
      )
      .all(workerId, periodStartOn, periodEndOn) as Array<Record<string, unknown>>
    return rows.map((row) => ({
      id: String(row.id),
      processType: row.process_type as TimedReviewRow['processType'],
      workedOn: String(row.worked_on),
      approvedMinutes: Number(row.approved_minutes),
      hourlyWageCentsSnapshot: Number(row.hourly_wage_cents_snapshot),
      items: this.listReviewItems(String(row.id))
    }))
  }

  listReviewItems(reviewId: string): TimedReviewRow['items'] {
    return (
      this.database
        .prepare(
          `SELECT items.id, items.process_task_id, items.order_item_id, items.completed_quantity,
             process_tasks.piece_rate_cents
           FROM work_time_review_items items
           JOIN process_tasks ON process_tasks.id = items.process_task_id
           WHERE items.review_id = ?
           ORDER BY items.rowid ASC`
        )
        .all(reviewId) as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      processTaskId: String(row.process_task_id),
      orderItemId: row.order_item_id as string | null,
      completedQuantity: Number(row.completed_quantity),
      pieceRateCents: row.piece_rate_cents === null ? null : Number(row.piece_rate_cents)
    }))
  }

  hasConfirmedMakingSource(workerId: string, periodStartOn: string, periodEndOn: string): boolean {
    const row = this.database
      .prepare(
        `SELECT 1
       FROM worker_settlement_making_sources sources
       JOIN worker_settlements settlements ON settlements.id = sources.settlement_id
       WHERE settlements.worker_id = ?
         AND sources.occurred_on BETWEEN ? AND ?
         AND sources.status = 'confirmed'
       LIMIT 1`
      )
      .get(workerId, periodStartOn, periodEndOn)
    return Boolean(row)
  }

  hasConfirmedTimedSource(workerId: string, periodStartOn: string, periodEndOn: string): boolean {
    const row = this.database
      .prepare(
        `SELECT 1
       FROM worker_settlement_timed_sources sources
       JOIN worker_settlements settlements ON settlements.id = sources.settlement_id
       WHERE settlements.worker_id = ?
         AND sources.occurred_on BETWEEN ? AND ?
         AND sources.status = 'confirmed'
       LIMIT 1`
      )
      .get(workerId, periodStartOn, periodEndOn)
    return Boolean(row)
  }

  getConfirmedSettlementForInspection(qualityInspectionId: string): V2WorkerSettlement | null {
    const row = this.database
      .prepare(
        `SELECT settlements.*
       FROM worker_settlement_making_sources sources
       JOIN worker_settlements settlements ON settlements.id = sources.settlement_id
       WHERE sources.quality_inspection_id = ?
         AND sources.status = 'confirmed'
         AND settlements.status = 'confirmed'
       LIMIT 1`
      )
      .get(qualityInspectionId) as Record<string, unknown> | undefined
    return row ? mapSettlement(row) : null
  }

  /** 读取工时核算的关键事实，用于在后续结算中建立差异调整。 */
  getReviewForAdjustment(reviewId: string): {
    id: string
    workerId: string
    processType: 'fluffing_bagging' | 'edge_sewing' | 'packing'
    workedOn: string
    approvedMinutes: number
    hourlyWageCentsSnapshot: number
    status: 'draft' | 'confirmed' | 'voided'
  } | null {
    const row = this.database
      .prepare('SELECT * FROM work_time_reviews WHERE id = ?')
      .get(reviewId) as Record<string, unknown> | undefined
    if (!row) return null
    return {
      id: String(row.id),
      workerId: String(row.worker_id),
      processType: row.process_type as 'fluffing_bagging' | 'edge_sewing' | 'packing',
      workedOn: String(row.worked_on),
      approvedMinutes: Number(row.approved_minutes),
      hourlyWageCentsSnapshot: Number(row.hourly_wage_cents_snapshot),
      status: row.status as 'draft' | 'confirmed' | 'voided'
    }
  }

  /** 已确认结算引用的工时核算，用于判定工时更正走调整而不是作废。 */
  getConfirmedSettlementForReview(reviewId: string): V2WorkerSettlement | null {
    const row = this.database
      .prepare(
        `SELECT settlements.*
       FROM worker_settlement_timed_sources sources
       JOIN worker_settlements settlements ON settlements.id = sources.settlement_id
       WHERE sources.work_time_review_id = ?
         AND sources.status = 'confirmed'
         AND settlements.status = 'confirmed'
       LIMIT 1`
      )
      .get(reviewId) as Record<string, unknown> | undefined
    return row ? mapSettlement(row) : null
  }

  /** 尚未建立材料扣款或待退款的制作不合格质检。 */
  listUnrecordedDefectSources(workerId: string): MakingSourceRow[] {
    const rows = this.database
      .prepare(
        `SELECT
        process_tasks.id AS process_task_id, work_assignments.id AS work_assignment_id, work_assignments.assigned_on,
        process_tasks.piece_rate_cents,
        process_tasks.glue_price_micro_yuan_per_gram, process_tasks.glue_weight_milligrams,
        order_items.order_id, process_tasks.order_item_id,
        process_results.id AS process_result_id,
        quality_inspections.qualified_quantity, quality_inspections.unqualified_quantity,
        quality_inspections.id AS quality_inspection_id, quality_inspections.inspected_on
       FROM quality_inspections
       JOIN process_tasks ON process_tasks.id = quality_inspections.process_task_id
       JOIN work_assignments ON work_assignments.id = process_tasks.work_assignment_id
       JOIN process_results ON process_results.id = quality_inspections.process_result_id
       LEFT JOIN order_items ON order_items.id = process_tasks.order_item_id
       LEFT JOIN worker_deduction_records ON worker_deduction_records.quality_inspection_id = quality_inspections.id
       LEFT JOIN worker_refund_records ON worker_refund_records.quality_inspection_id = quality_inspections.id
       WHERE work_assignments.worker_id = ?
         AND process_tasks.process_type = 'making'
         AND quality_inspections.unqualified_quantity > 0
         AND worker_deduction_records.id IS NULL
         AND worker_refund_records.id IS NULL
       ORDER BY quality_inspections.inspected_on ASC, quality_inspections.created_at ASC, quality_inspections.id ASC`
      )
      .all(workerId) as Array<Record<string, unknown>>
    return rows.map(mapMakingSourceRow)
  }

  insertDeduction(record: V2WorkerDeductionRecord): void {
    this.database
      .prepare(
        `INSERT INTO worker_deduction_records (
        id, worker_id, work_assignment_id, process_task_id, process_result_id, quality_inspection_id, order_id, order_item_id,
        unqualified_quantity, material_deduction_cents, total_deduction_cents,
        deducted_cents, remaining_carryover_cents, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.workerId,
        record.workAssignmentId,
        record.processTaskId,
        record.processResultId,
        record.qualityInspectionId,
        record.orderId,
        record.orderItemId,
        record.unqualifiedQuantity,
        record.materialDeductionCents,
        record.totalDeductionCents,
        record.deductedCents,
        record.remainingCarryoverCents,
        record.status,
        record.createdAt,
        record.updatedAt
      )
  }

  listOpenDeductions(workerId: string): V2WorkerDeductionRecord[] {
    const rows = this.database
      .prepare(
        `SELECT deductions.*, quality_inspections.inspected_on,
         COALESCE(balances.remaining_cents, deductions.total_deduction_cents - deductions.deducted_cents) AS remaining_carryover_cents
       FROM worker_deduction_records deductions
       LEFT JOIN worker_deduction_balances balances ON balances.deduction_record_id = deductions.id AND balances.status = 'open'
       LEFT JOIN quality_inspections ON quality_inspections.id = deductions.quality_inspection_id
       WHERE deductions.worker_id = ? AND deductions.deducted_cents < deductions.total_deduction_cents
       ORDER BY COALESCE(quality_inspections.inspected_on, substr(deductions.created_at, 1, 10)) ASC, deductions.created_at ASC, deductions.id ASC`
      )
      .all(workerId) as Array<Record<string, unknown>>
    return rows.map(mapDeduction)
  }

  getRefund(id: string): V2WorkerRefundRecord | null {
    const row = this.database
      .prepare('SELECT * FROM worker_refund_records WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined
    return row ? mapRefund(row) : null
  }

  listRefunds(query: V2WorkerRefundQuery = {}): V2WorkerRefundRecord[] {
    const clauses: string[] = []
    const values: string[] = []
    if (query.workerId) {
      clauses.push('worker_id = ?')
      values.push(query.workerId)
    }
    if (query.status) {
      clauses.push('status = ?')
      values.push(query.status)
    }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''
    const rows = this.database
      .prepare(
        `SELECT * FROM worker_refund_records${where} ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC, id DESC`
      )
      .all(...values) as Array<Record<string, unknown>>
    return rows.map(mapRefund)
  }

  insertRefund(record: V2WorkerRefundRecord): void {
    this.database
      .prepare(
        `INSERT INTO worker_refund_records (
        id, worker_id, original_settlement_id, process_task_id, process_result_id, quality_inspection_id, order_id, order_item_id,
        unqualified_quantity, material_refund_cents,
        actual_refund_cents, refunded_on, manager_note, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.workerId,
        record.originalSettlementId,
        record.processTaskId,
        record.processResultId,
        record.qualityInspectionId,
        record.orderId,
        record.orderItemId,
        record.unqualifiedQuantity,
        record.materialRefundCents,
        record.actualRefundCents,
        record.refundedOn,
        record.managerNote,
        record.status,
        record.createdAt,
        record.updatedAt
      )
  }

  updateRefund(record: V2WorkerRefundRecord): void {
    this.database
      .prepare(
        `UPDATE worker_refund_records SET actual_refund_cents = ?, refunded_on = ?, manager_note = ?, status = ?, updated_at = ?
       WHERE id = ?`
      )
      .run(
        record.actualRefundCents,
        record.refundedOn,
        record.managerNote,
        record.status,
        record.updatedAt,
        record.id
      )
  }

  listSettlements(query: V2WorkerSettlementQuery = {}): V2WorkerSettlement[] {
    const clauses: string[] = []
    const values: string[] = []
    if (query.workerId) {
      clauses.push('worker_id = ?')
      values.push(query.workerId)
    }
    if (query.status) {
      clauses.push('status = ?')
      values.push(query.status)
    }
    if (query.periodStartOn) {
      clauses.push('period_end_on >= ?')
      values.push(query.periodStartOn)
    }
    if (query.periodEndOn) {
      clauses.push('period_start_on <= ?')
      values.push(query.periodEndOn)
    }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''
    const rows = this.database
      .prepare(
        `SELECT * FROM worker_settlements${where} ORDER BY period_end_on DESC, created_at DESC, id DESC`
      )
      .all(...values) as Array<Record<string, unknown>>
    return rows.map(mapSettlement)
  }

  getSettlement(id: string): V2WorkerSettlement | null {
    const row = this.database.prepare('SELECT * FROM worker_settlements WHERE id = ?').get(id) as
      Record<string, unknown> | undefined
    return row ? mapSettlement(row) : null
  }

  insertSettlement(settlement: V2WorkerSettlement): void {
    this.database
      .prepare(
        `INSERT INTO worker_settlements (
        id, worker_id, period_start_on, period_end_on, status, timed_wage_cents, commission_cents,
        material_deduction_cents, adjustment_cents, candidate_wage_cents, current_deduction_cents,
        carried_deduction_cents, actual_deduction_cents, continuing_carryover_cents, other_adjustment_cents,
        final_paid_amount_cents, paid_on, manager_note, financial_entry_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        settlement.id,
        settlement.workerId,
        settlement.periodStartOn,
        settlement.periodEndOn,
        settlement.status,
        settlement.timedWageCents,
        settlement.commissionCents,
        settlement.materialDeductionCents,
        settlement.adjustmentCents,
        settlement.candidateWageCents,
        settlement.currentDeductionCents,
        settlement.carriedDeductionCents,
        settlement.actualDeductionCents,
        settlement.continuingCarryoverCents,
        settlement.otherAdjustmentCents,
        settlement.finalPaidAmountCents,
        settlement.paidOn,
        settlement.managerNote,
        settlement.financialEntryId,
        settlement.createdAt,
        settlement.updatedAt
      )
  }

  insertWagePaymentFinancialEntry(entry: WagePaymentFinancialEntry): void {
    this.database
      .prepare(
        `INSERT INTO financial_entries (
        id, source_type, direction, business_type, amount_cents, occurred_on, note, created_at
      ) VALUES (?, 'worker_settlement', 'expense', 'wage_payment', ?, ?, ?, ?)`
      )
      .run(entry.id, entry.amountCents, entry.occurredOn, entry.note, entry.createdAt)
  }

  updateSettlement(settlement: V2WorkerSettlement): void {
    this.database
      .prepare(
        `UPDATE worker_settlements SET status = ?, timed_wage_cents = ?, commission_cents = ?,
        material_deduction_cents = ?, adjustment_cents = ?, candidate_wage_cents = ?,
        current_deduction_cents = ?, carried_deduction_cents = ?,
        actual_deduction_cents = ?, continuing_carryover_cents = ?, other_adjustment_cents = ?, final_paid_amount_cents = ?, paid_on = ?,
        manager_note = ?, financial_entry_id = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        settlement.status,
        settlement.timedWageCents,
        settlement.commissionCents,
        settlement.materialDeductionCents,
        settlement.adjustmentCents,
        settlement.candidateWageCents,
        settlement.currentDeductionCents,
        settlement.carriedDeductionCents,
        settlement.actualDeductionCents,
        settlement.continuingCarryoverCents,
        settlement.otherAdjustmentCents,
        settlement.finalPaidAmountCents,
        settlement.paidOn,
        settlement.managerNote,
        settlement.financialEntryId,
        settlement.updatedAt,
        settlement.id
      )
  }

  insertMakingSource(source: V2WorkerSettlementMakingSource & { settlementId: string }): void {
    this.database
      .prepare(
        `INSERT INTO worker_settlement_making_sources (
        id, settlement_id, process_task_id, quality_inspection_id, order_id, order_item_id, occurred_on,
        qualified_quantity, unqualified_quantity, piece_rate_cents, qualified_commission_cents,
        material_deduction_cents, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        source.id,
        source.settlementId,
        source.processTaskId,
        source.qualityInspectionId,
        source.orderId,
        source.orderItemId,
        source.occurredOn,
        source.qualifiedQuantity,
        source.unqualifiedQuantity,
        source.pieceRateCents,
        source.qualifiedCommissionCents,
        source.materialDeductionCents,
        source.status,
        source.createdAt
      )
  }

  listMakingSources(settlementId: string): V2WorkerSettlementMakingSource[] {
    return (
      this.database
        .prepare(
          'SELECT * FROM worker_settlement_making_sources WHERE settlement_id = ? ORDER BY occurred_on ASC, created_at ASC, id ASC'
        )
        .all(settlementId) as Array<Record<string, unknown>>
    ).map(mapMakingSource)
  }

  insertTimedSource(source: V2WorkerSettlementTimedSource & { settlementId: string }): void {
    this.database
      .prepare(
        `INSERT INTO worker_settlement_timed_sources (
        id, settlement_id, work_time_review_id, process_type, occurred_on, approved_minutes,
        hourly_wage_cents_snapshot, timed_wage_cents, commission_cents, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        source.id,
        source.settlementId,
        source.workTimeReviewId,
        source.processType,
        source.occurredOn,
        source.approvedMinutes,
        source.hourlyWageCentsSnapshot,
        source.timedWageCents,
        source.commissionCents,
        source.status,
        source.createdAt
      )
    const insertItem = this.database.prepare(
      `INSERT INTO worker_settlement_timed_items (
        id, timed_source_id, process_task_id, order_item_id, completed_quantity, piece_rate_cents, commission_cents, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const item of source.items) {
      insertItem.run(
        item.id,
        source.id,
        item.processTaskId,
        item.orderItemId,
        item.completedQuantity,
        item.pieceRateCents,
        item.commissionCents,
        source.createdAt
      )
    }
  }

  listTimedSources(settlementId: string): V2WorkerSettlementTimedSource[] {
    const sources = (
      this.database
        .prepare(
          'SELECT * FROM worker_settlement_timed_sources WHERE settlement_id = ? ORDER BY occurred_on ASC, created_at ASC, id ASC'
        )
        .all(settlementId) as Array<Record<string, unknown>>
    ).map(mapTimedSource)
    const listItems = this.database.prepare(
      'SELECT * FROM worker_settlement_timed_items WHERE timed_source_id = ? ORDER BY rowid ASC'
    )
    return sources.map((source) => ({
      ...source,
      items: (listItems.all(source.id) as Array<Record<string, unknown>>).map(mapTimedItem)
    }))
  }

  insertAdjustment(
    adjustment: V2WorkerSettlementWorkTimeAdjustment & { settlementId: string }
  ): void {
    this.database
      .prepare(
        `INSERT INTO worker_settlement_adjustments (
        id, settlement_id, work_time_review_id, original_settlement_id, process_type, original_minutes,
        corrected_minutes, hourly_wage_cents_snapshot, amount_cents, reason, note, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        adjustment.id,
        adjustment.settlementId,
        adjustment.workTimeReviewId,
        adjustment.originalSettlementId,
        adjustment.processType,
        adjustment.originalMinutes,
        adjustment.correctedMinutes,
        adjustment.hourlyWageCentsSnapshot,
        adjustment.amountCents,
        adjustment.reason,
        adjustment.note,
        adjustment.status,
        adjustment.createdAt
      )
  }

  listAdjustments(settlementId: string): V2WorkerSettlementWorkTimeAdjustment[] {
    return (
      this.database
        .prepare(
          'SELECT * FROM worker_settlement_adjustments WHERE settlement_id = ? ORDER BY created_at ASC, id ASC'
        )
        .all(settlementId) as Array<Record<string, unknown>>
    ).map(mapAdjustment)
  }

  replaceDraftAllocations(
    settlementId: string,
    allocations: Array<V2WorkerSettlementDeductionAllocation & { settlementId: string }>
  ): void {
    this.database
      .prepare(
        "DELETE FROM worker_settlement_deduction_allocations WHERE settlement_id = ? AND status = 'draft'"
      )
      .run(settlementId)
    const insert = this.database.prepare(
      `INSERT INTO worker_settlement_deduction_allocations (id, settlement_id, deduction_record_id, allocated_cents, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    allocations.forEach((allocation) =>
      insert.run(
        allocation.id,
        allocation.settlementId,
        allocation.deductionRecordId,
        allocation.allocatedCents,
        allocation.status,
        allocation.createdAt
      )
    )
  }

  listSettlementAllocations(settlementId: string): V2WorkerSettlementDeductionAllocation[] {
    return (
      this.database
        .prepare(
          'SELECT * FROM worker_settlement_deduction_allocations WHERE settlement_id = ? ORDER BY created_at ASC, id ASC'
        )
        .all(settlementId) as Array<Record<string, unknown>>
    ).map(mapAllocation)
  }

  listSettlementDeductions(settlementId: string): V2WorkerDeductionRecord[] {
    return (
      this.database
        .prepare(
          `SELECT deductions.*, quality_inspections.inspected_on
       FROM worker_deduction_records deductions
       JOIN worker_settlement_deduction_allocations allocations ON allocations.deduction_record_id = deductions.id
       LEFT JOIN quality_inspections ON quality_inspections.id = deductions.quality_inspection_id
       WHERE allocations.settlement_id = ?
       ORDER BY COALESCE(quality_inspections.inspected_on, substr(deductions.created_at, 1, 10)) ASC, deductions.created_at ASC, deductions.id ASC`
        )
        .all(settlementId) as Array<Record<string, unknown>>
    ).map(mapDeduction)
  }

  confirmSettlementArtifacts(settlementId: string, now: string): void {
    const allocations = this.database
      .prepare(
        "SELECT deduction_record_id, allocated_cents FROM worker_settlement_deduction_allocations WHERE settlement_id = ? AND status = 'draft'"
      )
      .all(settlementId) as Array<{ deduction_record_id: string; allocated_cents: number }>
    for (const table of [
      'worker_settlement_making_sources',
      'worker_settlement_timed_sources',
      'worker_settlement_adjustments'
    ]) {
      this.database
        .prepare(
          `UPDATE ${table} SET status = 'confirmed' WHERE settlement_id = ? AND status = 'draft'`
        )
        .run(settlementId)
    }
    this.database
      .prepare(
        "UPDATE worker_settlement_deduction_allocations SET status = 'confirmed' WHERE settlement_id = ? AND status = 'draft'"
      )
      .run(settlementId)
    const getRecord = this.database.prepare(
      'SELECT worker_id, total_deduction_cents, deducted_cents FROM worker_deduction_records WHERE id = ?'
    )
    const updateRecord = this.database.prepare(
      'UPDATE worker_deduction_records SET deducted_cents = ?, remaining_carryover_cents = ?, status = ?, updated_at = ? WHERE id = ?'
    )
    const deleteBalance = this.database.prepare(
      'DELETE FROM worker_deduction_balances WHERE deduction_record_id = ?'
    )
    const insertBalance = this.database.prepare(
      `INSERT INTO worker_deduction_balances (id, worker_id, deduction_record_id, remaining_cents, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'open', ?, ?)`
    )
    allocations.forEach((allocation) => {
      const record = getRecord.get(allocation.deduction_record_id) as {
        worker_id: string
        total_deduction_cents: number
        deducted_cents: number
      }
      const deductedCents = record.deducted_cents + allocation.allocated_cents
      const remainingCents = record.total_deduction_cents - deductedCents
      const status = remainingCents === 0 ? 'settled' : 'partially_deducted'
      updateRecord.run(deductedCents, remainingCents, status, now, allocation.deduction_record_id)
      deleteBalance.run(allocation.deduction_record_id)
      if (remainingCents > 0)
        insertBalance.run(
          `${settlementId}:${allocation.deduction_record_id}`,
          record.worker_id,
          allocation.deduction_record_id,
          remainingCents,
          now,
          now
        )
    })
  }

  createWorkerRecord(input: {
    id: string
    name: string
    note?: string | null
    now: string
  }): V2Worker {
    const worker: V2Worker = {
      id: input.id,
      name: input.name.trim(),
      enabled: true,
      note: nullableText(input.note),
      createdAt: input.now,
      updatedAt: input.now
    }
    this.insertWorker(worker)
    return worker
  }
}
