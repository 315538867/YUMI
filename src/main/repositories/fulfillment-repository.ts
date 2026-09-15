import type { V2Database } from '@main/database/v2-connection'
import { makingReviewLockState, timedReviewLockState } from './review-lock'
import type { V2AuditLog } from './v2-order-repository'
import type {
  V2FulfillmentEvent,
  V2MakingReviewSummary,
  V2ProcessResult,
  V2ProcessTask,
  V2ProcessTaskStatus,
  V2QualityInspection,
  V2TimedReviewSummary,
  V2WorkAssignment,
  V2WorkAssignmentQuery,
  V2WorkAssignmentScheduleMode,
  V2WorkAssignmentStatus
} from '@shared/contracts/fulfillment'
import type { V2ProductOrderSnapshot } from '@shared/contracts/products'

interface WorkAssignmentRow {
  id: string
  worker_id: string
  assigned_on: string
  process_type: V2WorkAssignment['processType']
  status: V2WorkAssignmentStatus
  schedule_mode: V2WorkAssignmentScheduleMode
  note: string | null
  created_at: string
  updated_at: string
}

interface ProcessTaskRow {
  id: string
  work_assignment_id: string
  order_item_id: string | null
  process_type: V2ProcessTask['processType']
  source_type: V2ProcessTask['sourceType']
  planned_quantity: number | null
  planned_minutes: number
  extra_minutes: number
  status: V2ProcessTaskStatus
  hourly_wage_cents: number | null
  piece_rate_cents: number | null
  glue_cost_cents: number | null
  glue_price_micro_yuan_per_gram: number | null
  glue_weight_milligrams: number | null
  rate_snapshot_json: string | null
  note: string | null
  created_at: string
  updated_at: string
}

/** 任务行与当前有效核算的左连接结果。 */
interface ProcessTaskReviewRow extends ProcessTaskRow {
  review_result_id: string | null
  review_completed_quantity: number | null
  review_supersedes_result_id: string | null
  review_result_note: string | null
  review_result_created_at: string | null
  review_inspection_id: string | null
  review_qualified_quantity: number | null
  review_unqualified_quantity: number | null
  review_inspected_on: string | null
  review_inspection_note: string | null
  review_inspection_created_at: string | null
}

interface ProcessResultRow {
  id: string
  process_task_id: string
  completed_quantity: number
  actual_minutes: number | null
  submitted_on: string
  status: V2ProcessResult['status']
  supersedes_result_id: string | null
  void_reason: string | null
  voided_at: string | null
  note: string | null
  created_at: string
}

interface QualityInspectionRow {
  id: string
  process_result_id: string
  process_task_id: string
  qualified_quantity: number
  unqualified_quantity: number
  inspected_on: string
  reason_note: string | null
  requires_rework: number
  note: string | null
  created_at: string
}

interface FulfillmentEventRow {
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

export interface V2OrderItemFulfillmentSource {
  id: string
  orderId: string
  quantity: number
  edgeEnabled: boolean
  edgeQuantity: number
  productSnapshot: V2ProductOrderSnapshot
}

function parseJson<T>(value: string | null): T | null {
  return value ? (JSON.parse(value) as T) : null
}

const taskReviewSelect = `
  SELECT tasks.*,
         results.id AS review_result_id,
         results.completed_quantity AS review_completed_quantity,
         results.supersedes_result_id AS review_supersedes_result_id,
         results.note AS review_result_note,
         results.created_at AS review_result_created_at,
         inspections.id AS review_inspection_id,
         inspections.qualified_quantity AS review_qualified_quantity,
         inspections.unqualified_quantity AS review_unqualified_quantity,
         inspections.inspected_on AS review_inspected_on,
         inspections.note AS review_inspection_note,
         inspections.created_at AS review_inspection_created_at
  FROM process_tasks AS tasks
  LEFT JOIN process_results AS results
    ON results.process_task_id = tasks.id AND results.status = 'confirmed'
  LEFT JOIN quality_inspections AS inspections
    ON inspections.process_result_id = results.id`

function mapTaskReviewSummary(
  database: V2Database,
  row: ProcessTaskReviewRow
): V2MakingReviewSummary | null {
  if (
    !row.review_result_id ||
    !row.review_inspection_id ||
    row.review_completed_quantity === null ||
    row.review_qualified_quantity === null ||
    row.review_unqualified_quantity === null ||
    !row.review_inspected_on ||
    !row.review_result_created_at ||
    !row.review_inspection_created_at
  ) {
    return null
  }
  const plannedQuantity = row.planned_quantity ?? 0
  return {
    resultId: row.review_result_id,
    completedQuantity: row.review_completed_quantity,
    qualifiedQuantity: row.review_qualified_quantity,
    unqualifiedQuantity: row.review_unqualified_quantity,
    unfinishedQuantity: Math.max(plannedQuantity - row.review_completed_quantity, 0),
    reviewedOn: row.review_inspected_on,
    note: row.review_inspection_note ?? row.review_result_note,
    supersedesResultId: row.review_supersedes_result_id,
    lock: makingReviewLockState(database, {
      resultId: row.review_result_id,
      inspectionId: row.review_inspection_id
    }),
    createdAt: row.review_inspection_created_at
  }
}

function mapTask(database: V2Database, row: ProcessTaskReviewRow): V2ProcessTask {
  const reviewSummary = mapTaskReviewSummary(database, row)
  return {
    id: row.id,
    workAssignmentId: row.work_assignment_id,
    orderItemId: row.order_item_id,
    processType: row.process_type,
    sourceType: row.source_type,
    plannedQuantity: row.planned_quantity,
    plannedMinutes: row.planned_minutes,
    extraMinutes: row.extra_minutes,
    scheduledMinutes: row.planned_minutes + row.extra_minutes,
    status: row.status,
    hourlyWageCents: row.hourly_wage_cents,
    pieceRateCents: row.piece_rate_cents,
    glueCostCents: row.glue_cost_cents,
    materialPriceMicroYuanPerGram: row.glue_price_micro_yuan_per_gram,
    glueWeightMilligrams: row.glue_weight_milligrams,
    rateSnapshot: parseJson<Record<string, unknown>>(row.rate_snapshot_json),
    note: row.note,
    reviewSummary,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapResult(row: ProcessResultRow): V2ProcessResult {
  return {
    id: row.id,
    processTaskId: row.process_task_id,
    completedQuantity: row.completed_quantity,
    actualMinutes: row.actual_minutes,
    submittedOn: row.submitted_on,
    status: row.status,
    supersedesResultId: row.supersedes_result_id,
    voidReason: row.void_reason,
    voidedAt: row.voided_at,
    note: row.note,
    createdAt: row.created_at
  }
}

function mapInspection(row: QualityInspectionRow): V2QualityInspection {
  return {
    id: row.id,
    processResultId: row.process_result_id,
    processTaskId: row.process_task_id,
    qualifiedQuantity: row.qualified_quantity,
    unqualifiedQuantity: row.unqualified_quantity,
    inspectedOn: row.inspected_on,
    reasonNote: row.reason_note,
    requiresRework: Boolean(row.requires_rework),
    note: row.note,
    createdAt: row.created_at
  }
}

function mapEvent(row: FulfillmentEventRow): V2FulfillmentEvent {
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

export class V2FulfillmentRepository {
  constructor(private readonly database: V2Database) {}

  get connection(): V2Database {
    return this.database
  }

  transaction<T>(operation: () => T): T {
    return this.database.transaction(operation)()
  }

  getOrderItemSource(orderItemId: string): V2OrderItemFulfillmentSource | null {
    const row = this.database
      .prepare(
        'SELECT id, order_id, quantity, edge_enabled, edge_quantity, product_snapshot_json FROM order_items WHERE id = ?'
      )
      .get(orderItemId) as
      | {
          id: string
          order_id: string
          quantity: number
          edge_enabled: number
          edge_quantity: number
          product_snapshot_json: string
        }
      | undefined
    if (!row) return null
    return {
      id: row.id,
      orderId: row.order_id,
      quantity: row.quantity,
      edgeEnabled: Boolean(row.edge_enabled),
      edgeQuantity: row.edge_quantity,
      productSnapshot: JSON.parse(row.product_snapshot_json) as V2ProductOrderSnapshot
    }
  }

  workerExists(workerId: string): boolean {
    const row = this.database.prepare('SELECT 1 AS found FROM workers WHERE id = ?').get(workerId)
    return row !== undefined
  }

  insertWorkAssignment(input: Omit<V2WorkAssignment, 'tasks' | 'timedReview'>): void {
    this.database
      .prepare(
        `INSERT INTO work_assignments (
          id, worker_id, assigned_on, process_type, status, schedule_mode, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.workerId,
        input.assignedOn,
        input.processType,
        input.status,
        input.scheduleMode,
        input.note,
        input.createdAt,
        input.updatedAt
      )
  }

  updateWorkAssignmentStatus(id: string, status: V2WorkAssignmentStatus, now: string): void {
    this.database
      .prepare('UPDATE work_assignments SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, now, id)
  }

  /** 同一人员、日期、工序的未取消计时班次最多一条。 */
  findActiveTimedShift(workerId: string, assignedOn: string, processType: string): string | null {
    const row = this.database
      .prepare(
        `SELECT id FROM work_assignments
         WHERE worker_id = ? AND assigned_on = ? AND process_type = ?
           AND schedule_mode = 'timed_shift' AND status NOT IN ('cancelled', 'absent')
         LIMIT 1`
      )
      .get(workerId, assignedOn, processType) as { id: string } | undefined
    return row ? row.id : null
  }

  getAssignmentWorkerId(assignmentId: string): string | null {
    const row = this.database
      .prepare('SELECT worker_id FROM work_assignments WHERE id = ?')
      .get(assignmentId) as { worker_id: string } | undefined
    return row ? row.worker_id : null
  }

  getWorkAssignment(id: string): V2WorkAssignment | null {
    const row = this.database.prepare('SELECT * FROM work_assignments WHERE id = ?').get(id) as
      WorkAssignmentRow | undefined
    if (!row) return null
    return {
      id: row.id,
      workerId: row.worker_id,
      assignedOn: row.assigned_on,
      processType: row.process_type,
      scheduleMode: row.schedule_mode,
      status: row.status,
      note: row.note,
      tasks: this.listTasksByAssignment(row.id),
      timedReview: this.getTimedReviewSummary(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  listWorkAssignments(query: V2WorkAssignmentQuery = {}): V2WorkAssignment[] {
    const rows = this.database
      .prepare(
        `SELECT DISTINCT work_assignments.id
       FROM work_assignments
       LEFT JOIN process_tasks ON process_tasks.work_assignment_id = work_assignments.id
       WHERE (? IS NULL OR work_assignments.worker_id = ?)
         AND (? IS NULL OR work_assignments.assigned_on = ?)
         AND (? IS NULL OR process_tasks.order_item_id = ?)
       ORDER BY work_assignments.assigned_on DESC, work_assignments.created_at DESC`
      )
      .all(
        query.workerId ?? null,
        query.workerId ?? null,
        query.assignedOn ?? null,
        query.assignedOn ?? null,
        query.orderItemId ?? null,
        query.orderItemId ?? null
      ) as Array<{ id: string }>
    return rows.map((row) => this.getWorkAssignment(row.id)!).filter(Boolean)
  }

  /**
   * 计时班次当前有效核算：新记录按直接安排关联读取，
   * 历史聚合记录继续通过关联表读取，保证旧数据仍显示已核算。
   */
  getTimedReviewSummary(assignmentId: string): V2TimedReviewSummary | null {
    const row = this.database
      .prepare(
        `SELECT reviews.id, reviews.approved_minutes, reviews.worked_on
         FROM work_time_reviews AS reviews
         WHERE reviews.status = 'confirmed'
           AND (
             reviews.work_assignment_id = ?
             OR EXISTS (
               SELECT 1 FROM work_time_review_assignments AS links
               WHERE links.review_id = reviews.id AND links.work_assignment_id = ?
             )
           )
         ORDER BY reviews.created_at DESC, reviews.rowid DESC
         LIMIT 1`
      )
      .get(assignmentId, assignmentId) as
      { id: string; approved_minutes: number; worked_on: string } | undefined
    if (!row) return null
    return {
      reviewId: row.id,
      approvedMinutes: row.approved_minutes,
      reviewedOn: row.worked_on,
      lock: timedReviewLockState(this.database, row.id)
    }
  }

  insertTask(task: V2ProcessTask): void {
    this.database
      .prepare(
        `INSERT INTO process_tasks (
        id, work_assignment_id, order_item_id, process_type, source_type, planned_quantity,
        planned_minutes, extra_minutes, status, hourly_wage_cents, piece_rate_cents,
        glue_cost_cents, glue_price_micro_yuan_per_gram, glue_weight_milligrams, rate_snapshot_json, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        task.id,
        task.workAssignmentId,
        task.orderItemId,
        task.processType,
        task.sourceType,
        task.plannedQuantity,
        task.plannedMinutes,
        task.extraMinutes,
        task.status,
        task.hourlyWageCents,
        task.pieceRateCents,
        task.glueCostCents,
        task.materialPriceMicroYuanPerGram,
        task.glueWeightMilligrams,
        task.rateSnapshot ? JSON.stringify(task.rateSnapshot) : null,
        task.note,
        task.createdAt,
        task.updatedAt
      )
  }

  getTask(id: string): V2ProcessTask | null {
    const row = this.database.prepare(`${taskReviewSelect} WHERE tasks.id = ?`).get(id) as
      ProcessTaskReviewRow | undefined
    return row ? mapTask(this.database, row) : null
  }

  listTasksByOrderItem(orderItemId: string): V2ProcessTask[] {
    return (
      this.database
        .prepare(
          `${taskReviewSelect} WHERE tasks.order_item_id = ? ORDER BY tasks.created_at ASC, tasks.rowid ASC`
        )
        .all(orderItemId) as ProcessTaskReviewRow[]
    ).map((row) => mapTask(this.database, row))
  }

  listTasksByAssignment(workAssignmentId: string): V2ProcessTask[] {
    return (
      this.database
        .prepare(`${taskReviewSelect} WHERE tasks.work_assignment_id = ? ORDER BY tasks.rowid ASC`)
        .all(workAssignmentId) as ProcessTaskReviewRow[]
    ).map((row) => mapTask(this.database, row))
  }

  updateTaskStatus(id: string, status: V2ProcessTaskStatus, now: string): void {
    this.database
      .prepare('UPDATE process_tasks SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, now, id)
  }

  completeWorkAssignmentWhenResolved(workAssignmentId: string, now: string): void {
    const unresolved = this.database
      .prepare(
        `SELECT COUNT(*) AS count FROM process_tasks
       WHERE work_assignment_id = ? AND status NOT IN ('confirmed', 'cancelled')`
      )
      .get(workAssignmentId) as { count: number }
    if (unresolved.count === 0) {
      this.database
        .prepare("UPDATE work_assignments SET status = 'completed', updated_at = ? WHERE id = ?")
        .run(now, workAssignmentId)
    }
  }

  insertProcessResult(result: V2ProcessResult): void {
    this.database
      .prepare(
        `INSERT INTO process_results (
          id, process_task_id, completed_quantity, actual_minutes, submitted_on,
          status, supersedes_result_id, void_reason, voided_at, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        result.id,
        result.processTaskId,
        result.completedQuantity,
        result.actualMinutes,
        result.submittedOn,
        result.status,
        result.supersedesResultId,
        result.voidReason,
        result.voidedAt,
        result.note,
        result.createdAt
      )
  }

  getProcessResult(id: string): V2ProcessResult | null {
    const row = this.database.prepare('SELECT * FROM process_results WHERE id = ?').get(id) as
      ProcessResultRow | undefined
    return row ? mapResult(row) : null
  }

  getProcessResultForTask(processTaskId: string): V2ProcessResult | null {
    const row = this.database
      .prepare(
        'SELECT * FROM process_results WHERE process_task_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'
      )
      .get(processTaskId) as ProcessResultRow | undefined
    return row ? mapResult(row) : null
  }

  /** 仅用于作废不具备核算事实的历史结果（例如未质检的中间态或版本替换）。 */
  voidProcessResult(id: string, reason: string, now: string): void {
    this.database
      .prepare(
        `UPDATE process_results SET status = 'voided', void_reason = ?, voided_at = ? WHERE id = ?`
      )
      .run(reason, now, id)
  }

  /** 回退核算时删除该质检产生的履约事件（按质量事实来源）。 */
  deleteFulfillmentEventsForInspection(inspectionId: string): void {
    this.database
      .prepare(
        "DELETE FROM fulfillment_events WHERE source_record_type = 'quality_inspection' AND source_record_id = ?"
      )
      .run(inspectionId)
  }

  /** 核算被更正或作废后任务重新变为待核算，已完成的制作安排回到进行中。 */
  resetTaskToPending(processTaskId: string, now: string): void {
    this.database
      .prepare("UPDATE process_tasks SET status = 'pending', updated_at = ? WHERE id = ?")
      .run(now, processTaskId)
    this.database
      .prepare(
        `UPDATE work_assignments SET status = 'scheduled', updated_at = ?
         WHERE status = 'completed'
           AND id = (SELECT work_assignment_id FROM process_tasks WHERE id = ?)`
      )
      .run(now, processTaskId)
  }

  getQualityInspectionByResult(processResultId: string): V2QualityInspection | null {
    const row = this.database
      .prepare('SELECT * FROM quality_inspections WHERE process_result_id = ?')
      .get(processResultId) as QualityInspectionRow | undefined
    return row ? mapInspection(row) : null
  }

  insertQualityInspection(inspection: V2QualityInspection): void {
    this.database
      .prepare(
        `INSERT INTO quality_inspections (
        id, process_result_id, process_task_id, qualified_quantity, unqualified_quantity,
        inspected_on, reason_note, requires_rework, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        inspection.id,
        inspection.processResultId,
        inspection.processTaskId,
        inspection.qualifiedQuantity,
        inspection.unqualifiedQuantity,
        inspection.inspectedOn,
        inspection.reasonNote,
        Number(inspection.requiresRework),
        inspection.note,
        inspection.createdAt
      )
  }

  insertFulfillmentEvent(event: V2FulfillmentEvent): void {
    this.database
      .prepare(
        `INSERT INTO fulfillment_events (
        id, order_item_id, event_type, quantity, source_stage, target_stage,
        source_record_type, source_record_id, source_event_key, occurred_on, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.id,
        event.orderItemId,
        event.eventType,
        event.quantity,
        event.sourceStage,
        event.targetStage,
        event.sourceRecordType,
        event.sourceRecordId,
        event.sourceEventKey,
        event.occurredOn,
        event.note,
        event.createdAt
      )
  }

  listFulfillmentEvents(orderItemId: string): V2FulfillmentEvent[] {
    return (
      this.database
        .prepare(
          'SELECT * FROM fulfillment_events WHERE order_item_id = ? ORDER BY occurred_on ASC, created_at ASC, rowid ASC'
        )
        .all(orderItemId) as FulfillmentEventRow[]
    ).map(mapEvent)
  }

  insertAudit(
    input: Omit<V2AuditLog, 'before' | 'after' | 'metadata'> & {
      before?: unknown
      after?: unknown
      metadata?: unknown
    }
  ): V2AuditLog {
    const audit: V2AuditLog = {
      id: input.id,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before ?? null,
      after: input.after ?? null,
      metadata: input.metadata ?? null,
      createdAt: input.createdAt
    }
    this.database
      .prepare(
        `INSERT INTO audit_logs (id, action, entity_type, entity_id, before_json, after_json, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        audit.id,
        audit.action,
        audit.entityType,
        audit.entityId,
        audit.before === null ? null : JSON.stringify(audit.before),
        audit.after === null ? null : JSON.stringify(audit.after),
        audit.metadata === null ? null : JSON.stringify(audit.metadata),
        audit.createdAt
      )
    return audit
  }
}
