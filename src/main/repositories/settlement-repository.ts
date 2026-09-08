import type { V2Database } from '@main/database/v2-connection'
import type {
  V2Worker,
  V2WorkerDeductionRecord,
  V2WorkerRefundQuery,
  V2WorkerRefundRecord,
  V2WorkerSettlement,
  V2WorkerSettlementDeductionAllocation,
  V2WorkerSettlementTask,
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

interface SettlementTaskSource {
  processTaskId: string
  workAssignmentId: string
  assignedOn: string
  processType: 'making' | 'fluffing_bagging' | 'packing' | 'shipping'
  plannedQuantity: number | null
  plannedMinutes: number
  extraMinutes: number
  hourlyWageCents: number | null
  pieceRateCents: number | null
  glueCostCents: number | null
  orderId: string | null
  orderItemId: string | null
  productSnapshotJson: string | null
  processResultId: string | null
  qualifiedQuantity: number
  unqualifiedQuantity: number
  qualityInspectionId: string | null
  inspectedOn: string | null
}

function nullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function mapSettlementTaskSource(row: Record<string, unknown>): SettlementTaskSource {
  return {
    processTaskId: String(row.process_task_id), workAssignmentId: String(row.work_assignment_id),
    assignedOn: String(row.assigned_on), processType: row.process_type as SettlementTaskSource['processType'],
    plannedQuantity: row.planned_quantity === null ? null : Number(row.planned_quantity),
    plannedMinutes: Number(row.planned_minutes), extraMinutes: Number(row.extra_minutes),
    hourlyWageCents: row.hourly_wage_cents === null ? null : Number(row.hourly_wage_cents),
    pieceRateCents: row.piece_rate_cents === null ? null : Number(row.piece_rate_cents),
    glueCostCents: row.glue_cost_cents === null ? null : Number(row.glue_cost_cents),
    orderId: row.order_id as string | null, orderItemId: row.order_item_id as string | null,
    productSnapshotJson: row.product_snapshot_json as string | null, processResultId: row.process_result_id as string | null,
    qualifiedQuantity: Number(row.qualified_quantity), unqualifiedQuantity: Number(row.unqualified_quantity),
    qualityInspectionId: row.quality_inspection_id as string | null, inspectedOn: row.inspected_on as string | null
  }
}

function mapWorker(row: Record<string, unknown>): V2Worker {
  return {
    id: String(row.id), name: String(row.name), enabled: Boolean(row.enabled), note: row.note as string | null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at)
  }
}

function mapWage(row: Record<string, unknown>): V2WorkerWageHistory {
  return {
    id: String(row.id), workerId: String(row.worker_id), effectiveOn: String(row.effective_on),
    hourlyWageCents: Number(row.hourly_wage_cents), createdAt: String(row.created_at)
  }
}

function mapSettlement(row: Record<string, unknown>): V2WorkerSettlement {
  return {
    id: String(row.id), workerId: String(row.worker_id), periodStartOn: String(row.period_start_on),
    periodEndOn: String(row.period_end_on), status: row.status as V2WorkerSettlement['status'],
    scheduledMinutes: Number(row.scheduled_minutes), attendanceMinutes: row.attendance_minutes === null ? null : Number(row.attendance_minutes),
    attendanceNote: row.attendance_note as string | null,
    scheduledReferenceWageCents: Number(row.scheduled_reference_wage_cents),
    attendanceReferenceWageCents: Number(row.attendance_reference_wage_cents),
    qualifiedCommissionCents: Number(row.qualified_commission_cents),
    currentDeductionCents: Number(row.current_deduction_cents), carriedDeductionCents: Number(row.carried_deduction_cents),
    actualDeductionCents: Number(row.actual_deduction_cents), continuingCarryoverCents: Number(row.continuing_carryover_cents),
    otherAdjustmentCents: Number(row.other_adjustment_cents),
    finalPaidAmountCents: row.final_paid_amount_cents === null ? null : Number(row.final_paid_amount_cents),
    paidOn: row.paid_on as string | null, managerNote: row.manager_note as string | null,
    financialEntryId: row.financial_entry_id as string | null, createdAt: String(row.created_at), updatedAt: String(row.updated_at)
  }
}

function mapSettlementTask(row: Record<string, unknown>): V2WorkerSettlementTask {
  return {
    id: String(row.id), processTaskId: String(row.process_task_id), scheduledMinutes: Number(row.scheduled_minutes),
    qualifiedQuantity: Number(row.qualified_quantity), qualifiedCommissionCents: Number(row.qualified_commission_cents),
    status: row.status as V2WorkerSettlementTask['status'], createdAt: String(row.created_at)
  }
}

function mapDeduction(row: Record<string, unknown>): V2WorkerDeductionRecord {
  return {
    id: String(row.id), workerId: String(row.worker_id), workAssignmentId: row.work_assignment_id as string | null,
    processTaskId: String(row.process_task_id), processResultId: row.process_result_id as string | null,
    qualityInspectionId: row.quality_inspection_id as string | null, orderId: row.order_id as string | null,
    orderItemId: row.order_item_id as string | null, unqualifiedQuantity: Number(row.unqualified_quantity),
    commissionDeductionCents: Number(row.commission_deduction_cents), wageDeductionCents: Number(row.wage_deduction_cents),
    glueDeductionCents: Number(row.glue_deduction_cents), totalDeductionCents: Number(row.total_deduction_cents),
    deductedCents: Number(row.deducted_cents), remainingCarryoverCents: Number(row.remaining_carryover_cents),
    status: row.status as V2WorkerDeductionRecord['status'],
    occurredOn: row.inspected_on ? String(row.inspected_on) : String(row.created_at).slice(0, 10),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at)
  }
}

function mapAllocation(row: Record<string, unknown>): V2WorkerSettlementDeductionAllocation {
  return {
    id: String(row.id), deductionRecordId: String(row.deduction_record_id), allocatedCents: Number(row.allocated_cents),
    status: row.status as V2WorkerSettlementDeductionAllocation['status'],
    createdAt: String(row.created_at)
  }
}

function mapRefund(row: Record<string, unknown>): V2WorkerRefundRecord {
  return {
    id: String(row.id), workerId: String(row.worker_id), originalSettlementId: String(row.original_settlement_id),
    processTaskId: String(row.process_task_id), processResultId: row.process_result_id as string | null,
    qualityInspectionId: String(row.quality_inspection_id), orderId: row.order_id as string | null,
    orderItemId: row.order_item_id as string | null, unqualifiedQuantity: Number(row.unqualified_quantity),
    commissionDeductionCents: Number(row.commission_deduction_cents), wageDeductionCents: Number(row.wage_deduction_cents),
    glueDeductionCents: Number(row.glue_deduction_cents), requestedRefundCents: Number(row.requested_refund_cents),
    actualRefundCents: row.actual_refund_cents === null ? null : Number(row.actual_refund_cents),
    refundedOn: row.refunded_on as string | null, managerNote: row.manager_note as string | null,
    status: row.status as V2WorkerRefundRecord['status'], createdAt: String(row.created_at), updatedAt: String(row.updated_at)
  }
}

export class SettlementRepository {
  constructor(private readonly database: V2Database) {}

  transaction<T>(operation: () => T): T { return this.database.transaction(operation)() }

  getWorker(id: string): V2Worker | null {
    const row = this.database.prepare('SELECT * FROM workers WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? mapWorker(row) : null
  }

  listWorkers(): V2Worker[] {
    const rows = this.database.prepare(
      'SELECT * FROM workers ORDER BY enabled DESC, name COLLATE NOCASE ASC, created_at ASC'
    ).all() as Array<Record<string, unknown>>
    return rows.map(mapWorker)
  }

  insertWorker(worker: V2Worker): void {
    this.database.prepare(
      'INSERT INTO workers (id, name, enabled, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(worker.id, worker.name, Number(worker.enabled), worker.note, worker.createdAt, worker.updatedAt)
  }

  insertWageHistory(wage: V2WorkerWageHistory): void {
    this.database.prepare(
      'INSERT INTO worker_wage_history (id, worker_id, effective_on, hourly_wage_cents, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(wage.id, wage.workerId, wage.effectiveOn, wage.hourlyWageCents, wage.createdAt)
  }

  listWageHistory(workerId: string): V2WorkerWageHistory[] {
    const rows = this.database.prepare(
      'SELECT * FROM worker_wage_history WHERE worker_id = ? ORDER BY effective_on DESC, created_at DESC'
    ).all(workerId) as Array<Record<string, unknown>>
    return rows.map(mapWage)
  }

  getHourlyWage(workerId: string, effectiveOn: string): number | null {
    const row = this.database.prepare(
      `SELECT hourly_wage_cents FROM worker_wage_history
       WHERE worker_id = ? AND effective_on <= ? ORDER BY effective_on DESC LIMIT 1`
    ).get(workerId, effectiveOn) as { hourly_wage_cents: number } | undefined
    return row?.hourly_wage_cents ?? null
  }

  listEligibleTaskSources(workerId: string, periodStartOn: string, periodEndOn: string): SettlementTaskSource[] {
    const rows = this.database.prepare(
      `SELECT
        process_tasks.id AS process_task_id, work_assignments.id AS work_assignment_id, work_assignments.assigned_on,
        process_tasks.process_type, process_tasks.planned_quantity, process_tasks.planned_minutes, process_tasks.extra_minutes,
        process_tasks.hourly_wage_cents, process_tasks.piece_rate_cents, process_tasks.glue_cost_cents,
        order_items.order_id, process_tasks.order_item_id, order_items.product_snapshot_json,
        process_results.id AS process_result_id, COALESCE(quality_inspections.qualified_quantity, 0) AS qualified_quantity,
        COALESCE(quality_inspections.unqualified_quantity, 0) AS unqualified_quantity,
        quality_inspections.id AS quality_inspection_id, quality_inspections.inspected_on
       FROM work_assignments
       JOIN process_tasks ON process_tasks.work_assignment_id = work_assignments.id
       LEFT JOIN process_results ON process_results.process_task_id = process_tasks.id
       LEFT JOIN quality_inspections ON quality_inspections.process_result_id = process_results.id
       LEFT JOIN order_items ON order_items.id = process_tasks.order_item_id
       WHERE work_assignments.worker_id = ?
         AND work_assignments.assigned_on BETWEEN ? AND ?
         AND process_tasks.status = 'confirmed'
         AND NOT EXISTS (
           SELECT 1 FROM worker_settlement_tasks joined_tasks
           JOIN worker_settlements joined_settlements ON joined_settlements.id = joined_tasks.settlement_id
           WHERE joined_tasks.process_task_id = process_tasks.id AND joined_tasks.status = 'confirmed'
         )
       ORDER BY work_assignments.assigned_on ASC, process_tasks.created_at ASC, process_tasks.id ASC`
    ).all(workerId, periodStartOn, periodEndOn) as Array<Record<string, unknown>>
    return rows.map(mapSettlementTaskSource)
  }

  hasConfirmedSettlementTask(workerId: string, periodStartOn: string, periodEndOn: string): boolean {
    const row = this.database.prepare(
      `SELECT 1
       FROM worker_settlement_tasks settlement_tasks
       JOIN worker_settlements settlements ON settlements.id = settlement_tasks.settlement_id
       JOIN process_tasks ON process_tasks.id = settlement_tasks.process_task_id
       JOIN work_assignments ON work_assignments.id = process_tasks.work_assignment_id
       WHERE work_assignments.worker_id = ?
         AND work_assignments.assigned_on BETWEEN ? AND ?
         AND settlement_tasks.status = 'confirmed'
       LIMIT 1`
    ).get(workerId, periodStartOn, periodEndOn)
    return Boolean(row)
  }

  getConfirmedSettlementForTask(processTaskId: string): V2WorkerSettlement | null {
    const row = this.database.prepare(
      `SELECT settlements.*
       FROM worker_settlement_tasks settlement_tasks
       JOIN worker_settlements settlements ON settlements.id = settlement_tasks.settlement_id
       WHERE settlement_tasks.process_task_id = ?
         AND settlement_tasks.status = 'confirmed'
         AND settlements.status = 'confirmed'
       LIMIT 1`
    ).get(processTaskId) as Record<string, unknown> | undefined
    return row ? mapSettlement(row) : null
  }

  listUnrecordedDefectSources(workerId: string): SettlementTaskSource[] {
    const rows = this.database.prepare(
      `SELECT
        process_tasks.id AS process_task_id, work_assignments.id AS work_assignment_id, work_assignments.assigned_on,
        process_tasks.process_type, process_tasks.planned_quantity, process_tasks.planned_minutes, process_tasks.extra_minutes,
        process_tasks.hourly_wage_cents, process_tasks.piece_rate_cents, process_tasks.glue_cost_cents,
        order_items.order_id, process_tasks.order_item_id, order_items.product_snapshot_json,
        process_results.id AS process_result_id, quality_inspections.qualified_quantity, quality_inspections.unqualified_quantity,
        quality_inspections.id AS quality_inspection_id, quality_inspections.inspected_on
       FROM quality_inspections
       JOIN process_tasks ON process_tasks.id = quality_inspections.process_task_id
       JOIN work_assignments ON work_assignments.id = process_tasks.work_assignment_id
       JOIN process_results ON process_results.id = quality_inspections.process_result_id
       LEFT JOIN order_items ON order_items.id = process_tasks.order_item_id
       LEFT JOIN worker_deduction_records ON worker_deduction_records.quality_inspection_id = quality_inspections.id
       LEFT JOIN worker_refund_records ON worker_refund_records.quality_inspection_id = quality_inspections.id
       WHERE work_assignments.worker_id = ?
         AND quality_inspections.unqualified_quantity > 0
         AND worker_deduction_records.id IS NULL
         AND worker_refund_records.id IS NULL
       ORDER BY quality_inspections.inspected_on ASC, quality_inspections.created_at ASC, quality_inspections.id ASC`
    ).all(workerId) as Array<Record<string, unknown>>
    return rows.map(mapSettlementTaskSource)
  }

  insertDeduction(record: V2WorkerDeductionRecord): void {
    this.database.prepare(
      `INSERT INTO worker_deduction_records (
        id, worker_id, work_assignment_id, process_task_id, process_result_id, quality_inspection_id, order_id, order_item_id,
        unqualified_quantity, commission_deduction_cents, wage_deduction_cents, glue_deduction_cents, total_deduction_cents,
        deducted_cents, remaining_carryover_cents, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      record.id, record.workerId, record.workAssignmentId, record.processTaskId, record.processResultId, record.qualityInspectionId,
      record.orderId, record.orderItemId, record.unqualifiedQuantity, record.commissionDeductionCents, record.wageDeductionCents,
      record.glueDeductionCents, record.totalDeductionCents, record.deductedCents, record.remainingCarryoverCents, record.status,
      record.createdAt, record.updatedAt
    )
  }

  listOpenDeductions(workerId: string): V2WorkerDeductionRecord[] {
    const rows = this.database.prepare(
      `SELECT deductions.*, quality_inspections.inspected_on,
         COALESCE(balances.remaining_cents, deductions.total_deduction_cents - deductions.deducted_cents) AS remaining_carryover_cents
       FROM worker_deduction_records deductions
       LEFT JOIN worker_deduction_balances balances ON balances.deduction_record_id = deductions.id AND balances.status = 'open'
       LEFT JOIN quality_inspections ON quality_inspections.id = deductions.quality_inspection_id
       WHERE deductions.worker_id = ? AND deductions.deducted_cents < deductions.total_deduction_cents
       ORDER BY COALESCE(quality_inspections.inspected_on, substr(deductions.created_at, 1, 10)) ASC, deductions.created_at ASC, deductions.id ASC`
    ).all(workerId) as Array<Record<string, unknown>>
    return rows.map(mapDeduction)
  }

  getRefund(id: string): V2WorkerRefundRecord | null {
    const row = this.database.prepare('SELECT * FROM worker_refund_records WHERE id = ?').get(id) as Record<string, unknown> | undefined
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
    const rows = this.database.prepare(
      `SELECT * FROM worker_refund_records${where} ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC, id DESC`
    ).all(...values) as Array<Record<string, unknown>>
    return rows.map(mapRefund)
  }

  insertRefund(record: V2WorkerRefundRecord): void {
    this.database.prepare(
      `INSERT INTO worker_refund_records (
        id, worker_id, original_settlement_id, process_task_id, process_result_id, quality_inspection_id, order_id, order_item_id,
        unqualified_quantity, commission_deduction_cents, wage_deduction_cents, glue_deduction_cents, requested_refund_cents,
        actual_refund_cents, refunded_on, manager_note, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      record.id, record.workerId, record.originalSettlementId, record.processTaskId, record.processResultId,
      record.qualityInspectionId, record.orderId, record.orderItemId, record.unqualifiedQuantity,
      record.commissionDeductionCents, record.wageDeductionCents, record.glueDeductionCents, record.requestedRefundCents,
      record.actualRefundCents, record.refundedOn, record.managerNote, record.status, record.createdAt, record.updatedAt
    )
  }

  updateRefund(record: V2WorkerRefundRecord): void {
    this.database.prepare(
      `UPDATE worker_refund_records SET actual_refund_cents = ?, refunded_on = ?, manager_note = ?, status = ?, updated_at = ?
       WHERE id = ?`
    ).run(record.actualRefundCents, record.refundedOn, record.managerNote, record.status, record.updatedAt, record.id)
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
    const rows = this.database.prepare(
      `SELECT * FROM worker_settlements${where} ORDER BY period_end_on DESC, created_at DESC, id DESC`
    ).all(...values) as Array<Record<string, unknown>>
    return rows.map(mapSettlement)
  }

  getSettlement(id: string): V2WorkerSettlement | null {
    const row = this.database.prepare('SELECT * FROM worker_settlements WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? mapSettlement(row) : null
  }

  insertSettlement(settlement: V2WorkerSettlement): void {
    this.database.prepare(
      `INSERT INTO worker_settlements (
        id, worker_id, period_start_on, period_end_on, status, scheduled_minutes, attendance_minutes, attendance_note,
        scheduled_reference_wage_cents, attendance_reference_wage_cents, qualified_commission_cents, current_deduction_cents,
        carried_deduction_cents, actual_deduction_cents, continuing_carryover_cents, other_adjustment_cents,
        final_paid_amount_cents, paid_on, manager_note, financial_entry_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      settlement.id, settlement.workerId, settlement.periodStartOn, settlement.periodEndOn, settlement.status,
      settlement.scheduledMinutes, settlement.attendanceMinutes, settlement.attendanceNote, settlement.scheduledReferenceWageCents,
      settlement.attendanceReferenceWageCents, settlement.qualifiedCommissionCents, settlement.currentDeductionCents,
      settlement.carriedDeductionCents, settlement.actualDeductionCents, settlement.continuingCarryoverCents,
      settlement.otherAdjustmentCents, settlement.finalPaidAmountCents, settlement.paidOn, settlement.managerNote,
      settlement.financialEntryId, settlement.createdAt, settlement.updatedAt
    )
  }

  insertWagePaymentFinancialEntry(entry: WagePaymentFinancialEntry): void {
    this.database.prepare(
      `INSERT INTO financial_entries (
        id, source_type, direction, business_type, amount_cents, occurred_on, note, created_at
      ) VALUES (?, 'worker_settlement', 'expense', 'wage_payment', ?, ?, ?, ?)`
    ).run(entry.id, entry.amountCents, entry.occurredOn, entry.note, entry.createdAt)
  }

  updateSettlement(settlement: V2WorkerSettlement): void {
    this.database.prepare(
      `UPDATE worker_settlements SET status = ?, attendance_minutes = ?, attendance_note = ?, scheduled_reference_wage_cents = ?,
        attendance_reference_wage_cents = ?, qualified_commission_cents = ?, current_deduction_cents = ?, carried_deduction_cents = ?,
        actual_deduction_cents = ?, continuing_carryover_cents = ?, other_adjustment_cents = ?, final_paid_amount_cents = ?, paid_on = ?,
        manager_note = ?, financial_entry_id = ?, updated_at = ? WHERE id = ?`
    ).run(
      settlement.status, settlement.attendanceMinutes, settlement.attendanceNote, settlement.scheduledReferenceWageCents,
      settlement.attendanceReferenceWageCents, settlement.qualifiedCommissionCents, settlement.currentDeductionCents,
      settlement.carriedDeductionCents, settlement.actualDeductionCents, settlement.continuingCarryoverCents,
      settlement.otherAdjustmentCents, settlement.finalPaidAmountCents, settlement.paidOn, settlement.managerNote,
      settlement.financialEntryId, settlement.updatedAt, settlement.id
    )
  }

  insertSettlementTask(task: V2WorkerSettlementTask & { settlementId: string }): void {
    this.database.prepare(
      `INSERT INTO worker_settlement_tasks (id, settlement_id, process_task_id, scheduled_minutes, qualified_quantity, qualified_commission_cents, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(task.id, task.settlementId, task.processTaskId, task.scheduledMinutes, task.qualifiedQuantity, task.qualifiedCommissionCents, task.status, task.createdAt)
  }

  listSettlementTasks(settlementId: string): V2WorkerSettlementTask[] {
    return (this.database.prepare('SELECT * FROM worker_settlement_tasks WHERE settlement_id = ? ORDER BY created_at ASC, id ASC').all(settlementId) as Array<Record<string, unknown>>).map(mapSettlementTask)
  }

  replaceDraftAllocations(settlementId: string, allocations: Array<V2WorkerSettlementDeductionAllocation & { settlementId: string }>): void {
    this.database.prepare("DELETE FROM worker_settlement_deduction_allocations WHERE settlement_id = ? AND status = 'draft'").run(settlementId)
    const insert = this.database.prepare(
      `INSERT INTO worker_settlement_deduction_allocations (id, settlement_id, deduction_record_id, allocated_cents, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    allocations.forEach((allocation) => insert.run(
      allocation.id, allocation.settlementId, allocation.deductionRecordId, allocation.allocatedCents,
      allocation.status, allocation.createdAt
    ))
  }

  listSettlementAllocations(settlementId: string): V2WorkerSettlementDeductionAllocation[] {
    return (this.database.prepare(
      'SELECT * FROM worker_settlement_deduction_allocations WHERE settlement_id = ? ORDER BY created_at ASC, id ASC'
    ).all(settlementId) as Array<Record<string, unknown>>).map(mapAllocation)
  }

  listSettlementDeductions(settlementId: string): V2WorkerDeductionRecord[] {
    return (this.database.prepare(
      `SELECT deductions.*, quality_inspections.inspected_on
       FROM worker_deduction_records deductions
       JOIN worker_settlement_deduction_allocations allocations ON allocations.deduction_record_id = deductions.id
       LEFT JOIN quality_inspections ON quality_inspections.id = deductions.quality_inspection_id
       WHERE allocations.settlement_id = ?
       ORDER BY COALESCE(quality_inspections.inspected_on, substr(deductions.created_at, 1, 10)) ASC, deductions.created_at ASC, deductions.id ASC`
    ).all(settlementId) as Array<Record<string, unknown>>).map(mapDeduction)
  }

  confirmSettlementArtifacts(settlementId: string, now: string): void {
    const allocations = this.database.prepare(
      "SELECT deduction_record_id, allocated_cents FROM worker_settlement_deduction_allocations WHERE settlement_id = ? AND status = 'draft'"
    ).all(settlementId) as Array<{ deduction_record_id: string; allocated_cents: number }>
    this.database.prepare("UPDATE worker_settlement_tasks SET status = 'confirmed' WHERE settlement_id = ? AND status = 'draft'").run(settlementId)
    this.database.prepare("UPDATE worker_settlement_deduction_allocations SET status = 'confirmed' WHERE settlement_id = ? AND status = 'draft'").run(settlementId)
    const getRecord = this.database.prepare('SELECT worker_id, total_deduction_cents, deducted_cents FROM worker_deduction_records WHERE id = ?')
    const updateRecord = this.database.prepare(
      'UPDATE worker_deduction_records SET deducted_cents = ?, remaining_carryover_cents = ?, status = ?, updated_at = ? WHERE id = ?'
    )
    const deleteBalance = this.database.prepare('DELETE FROM worker_deduction_balances WHERE deduction_record_id = ?')
    const insertBalance = this.database.prepare(
      `INSERT INTO worker_deduction_balances (id, worker_id, deduction_record_id, remaining_cents, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'open', ?, ?)`
    )
    allocations.forEach((allocation) => {
      const record = getRecord.get(allocation.deduction_record_id) as { worker_id: string; total_deduction_cents: number; deducted_cents: number }
      const deductedCents = record.deducted_cents + allocation.allocated_cents
      const remainingCents = record.total_deduction_cents - deductedCents
      const status = remainingCents === 0 ? 'settled' : 'partially_deducted'
      updateRecord.run(deductedCents, remainingCents, status, now, allocation.deduction_record_id)
      deleteBalance.run(allocation.deduction_record_id)
      if (remainingCents > 0) insertBalance.run(`${settlementId}:${allocation.deduction_record_id}`, record.worker_id, allocation.deduction_record_id, remainingCents, now, now)
    })
  }

  createWorkerRecord(input: { id: string; name: string; note?: string | null; now: string }): V2Worker {
    const worker: V2Worker = { id: input.id, name: input.name.trim(), enabled: true, note: nullableText(input.note), createdAt: input.now, updatedAt: input.now }
    this.insertWorker(worker)
    return worker
  }
}

export type { SettlementTaskSource }
