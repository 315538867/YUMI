import type { V2Database } from '@main/database/v2-connection'
import type {
  V2WorkTimeReview,
  V2WorkTimeReviewItem,
  V2WorkTimeReviewQuery,
  V2WorkTimeReviewSource,
  V2WorkTimeReviewStatus
} from '@shared/contracts/index'

interface ReviewRow {
  id: string
  worker_id: string
  worked_on: string
  process_type: V2WorkTimeReview['processType']
  approved_minutes: number
  hourly_wage_cents_snapshot: number | null
  source_type: V2WorkTimeReviewSource
  external_record_id: string | null
  raw_started_at: string | null
  raw_ended_at: string | null
  status: V2WorkTimeReviewStatus
  review_note: string | null
  created_at: string
  updated_at: string
}

export interface WorkTimeReviewWriteInput {
  id: string
  workerId: string
  workedOn: string
  processType: V2WorkTimeReview['processType']
  approvedMinutes: number
  hourlyWageCentsSnapshot: number | null
  sourceType: V2WorkTimeReviewSource
  externalRecordId: string | null
  rawStartedAt: string | null
  rawEndedAt: string | null
  status: V2WorkTimeReviewStatus
  reviewNote: string | null
  assignmentIds: string[]
  items: Array<{
    id: string
    processTaskId: string
    orderItemId: string | null
    completedQuantity: number
  }>
  now: string
}

export interface PenaltyFreeAssignmentCheck {
  assignmentIds: string[]
  processType: string
  workerId: string
  workedOn: string
}

export class WorkTimeReviewRepository {
  constructor(private readonly database: V2Database) {}

  get connection(): V2Database {
    return this.database
  }

  transaction<T>(run: () => T): T {
    return this.database.transaction(run)()
  }

  workerExists(workerId: string): boolean {
    return Boolean(this.database.prepare('SELECT 1 FROM workers WHERE id = ?').get(workerId))
  }

  /** 工作日期生效的员工个人时薪：取该日期或之前最近一条记录。 */
  wageEffectiveOn(workerId: string, workedOn: string): number | null {
    const row = this.database
      .prepare(
        `SELECT hourly_wage_cents FROM worker_wage_history
         WHERE worker_id = ? AND effective_on <= ?
         ORDER BY effective_on DESC, created_at DESC LIMIT 1`
      )
      .get(workerId, workedOn) as { hourly_wage_cents: number } | undefined
    return row ? row.hourly_wage_cents : null
  }

  getAssignment(assignmentId: string): {
    id: string
    workerId: string
    assignedOn: string
    processType: string
  } | null {
    const row = this.database
      .prepare('SELECT id, worker_id, assigned_on, process_type FROM work_assignments WHERE id = ?')
      .get(assignmentId) as
      { id: string; worker_id: string; assigned_on: string; process_type: string } | undefined
    return row
      ? {
          id: row.id,
          workerId: row.worker_id,
          assignedOn: row.assigned_on,
          processType: row.process_type
        }
      : null
  }

  listAssignmentTasks(assignmentId: string): Array<{
    id: string
    orderItemId: string | null
    processType: string
    status: string
  }> {
    return (
      this.database
        .prepare(
          'SELECT id, order_item_id, process_type, status FROM process_tasks WHERE work_assignment_id = ?'
        )
        .all(assignmentId) as Array<{
        id: string
        order_item_id: string | null
        process_type: string
        status: string
      }>
    ).map((row) => ({
      id: row.id,
      orderItemId: row.order_item_id,
      processType: row.process_type,
      status: row.status
    }))
  }

  getTask(taskId: string): {
    id: string
    workAssignmentId: string
    processType: string
    orderItemId: string | null
  } | null {
    const row = this.database
      .prepare(
        'SELECT id, work_assignment_id, process_type, order_item_id FROM process_tasks WHERE id = ?'
      )
      .get(taskId) as
      | {
          id: string
          work_assignment_id: string
          process_type: string
          order_item_id: string | null
        }
      | undefined
    return row
      ? {
          id: row.id,
          workAssignmentId: row.work_assignment_id,
          processType: row.process_type,
          orderItemId: row.order_item_id
        }
      : null
  }

  /** 统计这些完成结果产出到各阶段的数量，用于判断是否已被下游消耗。 */
  sumProducedByTargetStage(resultIds: readonly string[]): Map<string, number> {
    const produced = new Map<string, number>()
    if (!resultIds.length) return produced
    const placeholders = resultIds.map(() => '?').join(', ')
    const rows = this.database
      .prepare(
        `SELECT target_stage, SUM(quantity) AS quantity
         FROM fulfillment_events
         WHERE source_record_type = 'process_result'
           AND source_record_id IN (${placeholders})
           AND target_stage IS NOT NULL
         GROUP BY target_stage`
      )
      .all(...resultIds) as Array<{ target_stage: string; quantity: number }>
    for (const row of rows) produced.set(row.target_stage, row.quantity)
    return produced
  }

  setVoided(id: string, reason: string, now: string): void {
    this.database
      .prepare(
        `UPDATE work_time_reviews SET status = 'voided', review_note = ?, updated_at = ? WHERE id = ?`
      )
      .run(reason, now, id)
  }

  /** 同一工作安排最多属于一条未作废工时核算。 */
  findActiveReviewByAssignment(assignmentId: string, excludeReviewId?: string): string | null {
    const row = this.database
      .prepare(
        `SELECT work_time_review_assignments.review_id AS review_id
         FROM work_time_review_assignments
         JOIN work_time_reviews ON work_time_reviews.id = work_time_review_assignments.review_id
         WHERE work_time_review_assignments.work_assignment_id = ?
           AND work_time_reviews.status <> 'voided'
           AND (? IS NULL OR work_time_reviews.id <> ?)
         LIMIT 1`
      )
      .get(assignmentId, excludeReviewId ?? null, excludeReviewId ?? null) as
      { review_id: string } | undefined
    return row ? row.review_id : null
  }

  insertReview(input: WorkTimeReviewWriteInput): void {
    this.database
      .prepare(
        `INSERT INTO work_time_reviews (
          id, worker_id, worked_on, process_type, approved_minutes, hourly_wage_cents_snapshot,
          source_type, external_record_id, raw_started_at, raw_ended_at, status, review_note,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.workerId,
        input.workedOn,
        input.processType,
        input.approvedMinutes,
        input.hourlyWageCentsSnapshot,
        input.sourceType,
        input.externalRecordId,
        input.rawStartedAt,
        input.rawEndedAt,
        input.status,
        input.reviewNote,
        input.now,
        input.now
      )
    this.replaceChildren(input)
  }

  updateReview(input: WorkTimeReviewWriteInput): void {
    this.database
      .prepare(
        `UPDATE work_time_reviews SET
          worker_id = ?, worked_on = ?, process_type = ?, approved_minutes = ?,
          source_type = ?, external_record_id = ?, raw_started_at = ?, raw_ended_at = ?,
          status = ?, review_note = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.workerId,
        input.workedOn,
        input.processType,
        input.approvedMinutes,
        input.sourceType,
        input.externalRecordId,
        input.rawStartedAt,
        input.rawEndedAt,
        input.status,
        input.reviewNote,
        input.now,
        input.id
      )
    this.database
      .prepare('DELETE FROM work_time_review_assignments WHERE review_id = ?')
      .run(input.id)
    this.database.prepare('DELETE FROM work_time_review_items WHERE review_id = ?').run(input.id)
    this.replaceChildren(input)
  }

  private replaceChildren(input: WorkTimeReviewWriteInput): void {
    const insertAssignment = this.database.prepare(
      'INSERT INTO work_time_review_assignments (review_id, work_assignment_id, created_at) VALUES (?, ?, ?)'
    )
    for (const assignmentId of input.assignmentIds) {
      insertAssignment.run(input.id, assignmentId, input.now)
    }
    const insertItem = this.database.prepare(
      `INSERT INTO work_time_review_items (
        id, review_id, process_task_id, order_item_id, completed_quantity, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    for (const item of input.items) {
      insertItem.run(
        item.id,
        input.id,
        item.processTaskId,
        item.orderItemId,
        item.completedQuantity,
        input.now
      )
    }
  }

  setStatus(id: string, status: V2WorkTimeReviewStatus, now: string): void {
    this.database
      .prepare('UPDATE work_time_reviews SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, now, id)
  }

  confirmReview(id: string, hourlyWageCentsSnapshot: number, now: string): void {
    this.database
      .prepare(
        `UPDATE work_time_reviews
         SET status = 'confirmed', hourly_wage_cents_snapshot = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(hourlyWageCentsSnapshot, now, id)
  }

  getReview(id: string): V2WorkTimeReview | null {
    const row = this.database.prepare('SELECT * FROM work_time_reviews WHERE id = ?').get(id) as
      ReviewRow | undefined
    if (!row) return null
    return this.mapReview(row)
  }

  listReviews(query: V2WorkTimeReviewQuery = {}): V2WorkTimeReview[] {
    const conditions: string[] = []
    const params: unknown[] = []
    if (query.workerId) {
      conditions.push('worker_id = ?')
      params.push(query.workerId)
    }
    if (query.workedOn) {
      conditions.push('worked_on = ?')
      params.push(query.workedOn)
    }
    if (query.status) {
      conditions.push('status = ?')
      params.push(query.status)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    return (
      this.database
        .prepare(
          `SELECT * FROM work_time_reviews ${where} ORDER BY worked_on DESC, created_at DESC`
        )
        .all(...params) as ReviewRow[]
    ).map((row) => this.mapReview(row))
  }

  listAssignmentIds(reviewId: string): string[] {
    return (
      this.database
        .prepare(
          'SELECT work_assignment_id FROM work_time_review_assignments WHERE review_id = ? ORDER BY rowid ASC'
        )
        .all(reviewId) as Array<{ work_assignment_id: string }>
    ).map((row) => row.work_assignment_id)
  }

  listItems(reviewId: string): V2WorkTimeReviewItem[] {
    return (
      this.database
        .prepare('SELECT * FROM work_time_review_items WHERE review_id = ? ORDER BY rowid ASC')
        .all(reviewId) as Array<{
        id: string
        process_task_id: string
        order_item_id: string | null
        completed_quantity: number
      }>
    ).map((row) => ({
      id: row.id,
      processTaskId: row.process_task_id,
      orderItemId: row.order_item_id,
      completedQuantity: row.completed_quantity
    }))
  }

  /** 该工时核算是否已进入确认结算；已进入时不得直接作废。 */
  isReviewInConfirmedSettlement(reviewId: string): boolean {
    const row = this.database
      .prepare(
        `SELECT 1 AS found
         FROM worker_settlement_timed_sources sources
         JOIN worker_settlements ON worker_settlements.id = sources.settlement_id
         WHERE sources.work_time_review_id = ?
           AND sources.status = 'confirmed'
           AND worker_settlements.status = 'confirmed'
         LIMIT 1`
      )
      .get(reviewId) as { found: number } | undefined
    return Boolean(row)
  }

  listResultIdsForTask(processTaskId: string): string[] {
    return (
      this.database
        .prepare('SELECT id FROM process_results WHERE process_task_id = ? ORDER BY rowid ASC')
        .all(processTaskId) as Array<{ id: string }>
    ).map((row) => row.id)
  }

  deleteResultsForTask(processTaskId: string): void {
    this.database
      .prepare('DELETE FROM process_results WHERE process_task_id = ?')
      .run(processTaskId)
  }

  deleteFulfillmentEventsForResults(resultIds: readonly string[]): void {
    const statement = this.database.prepare(
      "DELETE FROM fulfillment_events WHERE source_record_type = 'process_result' AND source_record_id = ?"
    )
    for (const resultId of resultIds) statement.run(resultId)
  }

  resetTaskToPending(processTaskId: string, now: string): void {
    this.database
      .prepare("UPDATE process_tasks SET status = 'pending', updated_at = ? WHERE id = ?")
      .run(now, processTaskId)
  }

  private mapReview(row: ReviewRow): V2WorkTimeReview {
    return {
      id: row.id,
      workerId: row.worker_id,
      workedOn: row.worked_on,
      processType: row.process_type,
      approvedMinutes: row.approved_minutes,
      hourlyWageCentsSnapshot: row.hourly_wage_cents_snapshot,
      sourceType: row.source_type,
      externalRecordId: row.external_record_id,
      rawStartedAt: row.raw_started_at,
      rawEndedAt: row.raw_ended_at,
      status: row.status,
      reviewNote: row.review_note,
      assignmentIds: this.listAssignmentIds(row.id),
      items: this.listItems(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}
