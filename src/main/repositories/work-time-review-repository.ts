import type { V2Database } from '@main/database/v2-connection'
import { timedReviewLockState } from './review-lock'
import type {
  V2TimedProcessType,
  V2WorkTimeReview,
  V2WorkTimeReviewCandidate,
  V2WorkTimeReviewItem,
  V2WorkTimeReviewQuery
} from '@shared/contracts/index'

interface ReviewRow {
  id: string
  worker_id: string
  worked_on: string
  process_type: V2TimedProcessType
  approved_minutes: number
  hourly_wage_cents_snapshot: number | null
  source_type: 'manual_review' | 'attendance_device'
  external_record_id: string | null
  raw_started_at: string | null
  raw_ended_at: string | null
  status: 'draft' | 'confirmed' | 'voided'
  work_assignment_id: string | null
  supersedes_review_id: string | null
  void_reason: string | null
  voided_at: string | null
  review_note: string | null
  created_at: string
  updated_at: string
}

interface CandidateRow {
  order_item_id: string
  order_id: string
  order_code: string
  customer_snapshot_json: string
  product_snapshot_json: string
  expected_ship_date: string | null
  order_created_at: string
  edge_enabled: number
  edge_quantity: number
  fluffing_delta: number | null
  edge_delta: number | null
  edge_routed: number | null
  packing_delta: number | null
}

export interface WorkTimeReviewItemWriteInput {
  id: string
  orderItemId: string
  completedQuantity: number
  pieceRateCentsSnapshot: number
  expectedUnitMinutesSnapshot: number | null
}

export interface WorkTimeReviewWriteInput {
  id: string
  workerId: string
  workedOn: string
  processType: V2TimedProcessType
  approvedMinutes: number
  hourlyWageCentsSnapshot: number
  workAssignmentId: string
  rawStartedAt: string
  rawEndedAt: string
  status: 'confirmed'
  supersedesReviewId: string | null
  reviewNote: string | null
  items: WorkTimeReviewItemWriteInput[]
  now: string
}

export interface WorkTimeReviewAssignmentInfo {
  id: string
  workerId: string
  assignedOn: string
  processType: string
  scheduleMode: string
  status: string
}

function requireNonNegativeIntegerOrNull(value: number | null): number | null {
  return value === null ? null : Math.max(value, 0)
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

  getOrderItemEdgeInfo(orderItemId: string): {
    edgeEnabled: boolean
    edgeQuantity: number
  } | null {
    const row = this.database
      .prepare('SELECT edge_enabled, edge_quantity FROM order_items WHERE id = ?')
      .get(orderItemId) as { edge_enabled: number; edge_quantity: number } | undefined
    return row ? { edgeEnabled: Boolean(row.edge_enabled), edgeQuantity: row.edge_quantity } : null
  }

  getAssignment(assignmentId: string): WorkTimeReviewAssignmentInfo | null {
    const row = this.database
      .prepare(
        'SELECT id, worker_id, assigned_on, process_type, schedule_mode, status FROM work_assignments WHERE id = ?'
      )
      .get(assignmentId) as
      | {
          id: string
          worker_id: string
          assigned_on: string
          process_type: string
          schedule_mode: string
          status: string
        }
      | undefined
    return row
      ? {
          id: row.id,
          workerId: row.worker_id,
          assignedOn: row.assigned_on,
          processType: row.process_type,
          scheduleMode: row.schedule_mode,
          status: row.status
        }
      : null
  }

  /**
   * 计时商品候选：直接从订单商品履约事实计算当前工序可处理数量，
   * 不依赖排班任务；历史订单商品也会出现在候选中。
   */
  listCandidates(processType: V2TimedProcessType): V2WorkTimeReviewCandidate[] {
    const rows = this.database
      .prepare(
        `SELECT
           items.id AS order_item_id,
           items.order_id,
           orders.code AS order_code,
           orders.customer_snapshot_json,
           items.product_snapshot_json,
           orders.expected_ship_date,
           orders.created_at AS order_created_at,
           items.edge_enabled,
           items.edge_quantity,
           events.fluffing_delta,
           events.edge_delta,
           events.edge_routed,
           events.packing_delta
         FROM order_items items
         JOIN orders ON orders.id = items.order_id
         LEFT JOIN (
           SELECT order_item_id,
             SUM(CASE WHEN target_stage = 'fluffing_bagging' THEN quantity ELSE 0 END)
               - SUM(CASE WHEN source_stage = 'fluffing_bagging' THEN quantity ELSE 0 END) AS fluffing_delta,
             SUM(CASE WHEN target_stage = 'edge_sewing' THEN quantity ELSE 0 END)
               - SUM(CASE WHEN source_stage = 'edge_sewing' THEN quantity ELSE 0 END) AS edge_delta,
             SUM(CASE WHEN target_stage = 'edge_sewing' THEN quantity ELSE 0 END) AS edge_routed,
             SUM(CASE WHEN target_stage = 'packing' THEN quantity ELSE 0 END)
               - SUM(CASE WHEN source_stage = 'packing' THEN quantity ELSE 0 END) AS packing_delta
           FROM fulfillment_events
           WHERE event_type <> 'after_sales_return'
           GROUP BY order_item_id
         ) events ON events.order_item_id = items.id`
      )
      .all() as CandidateRow[]

    return rows
      .map((row) => this.toCandidate(row, processType))
      .filter((candidate): candidate is V2WorkTimeReviewCandidate => candidate !== null)
  }

  private toCandidate(
    row: CandidateRow,
    processType: V2TimedProcessType
  ): V2WorkTimeReviewCandidate | null {
    const snapshot = JSON.parse(row.product_snapshot_json) as {
      name?: string
      unitWeightMilligrams?: number
      expectedFluffingBaggingMinutes?: number
      expectedEdgeSewingMinutes?: number
      expectedPackingMinutes?: number
      fluffingBaggingCommissionCents?: number
      edgeSewingCommissionCents?: number
    }
    const fluffingBalance = row.fluffing_delta ?? 0
    const edgeBalance = row.edge_delta ?? 0
    const packingBalance = row.packing_delta ?? 0
    const edgeRouted = row.edge_routed ?? 0
    // 缝边剩余需求 = 订单缝边数量 − 已完成缝边数量（分流 − 当前待缝边余额）。
    const edgeDemandRemaining = Math.max(row.edge_quantity - (edgeRouted - edgeBalance), 0)

    let processableQuantity: number
    let expectedUnitMinutes: number | null
    let pieceRateCents: number
    if (processType === 'fluffing_bagging') {
      processableQuantity = fluffingBalance
      expectedUnitMinutes = snapshot.expectedFluffingBaggingMinutes ?? null
      pieceRateCents = snapshot.fluffingBaggingCommissionCents ?? 0
    } else if (processType === 'edge_sewing') {
      if (!row.edge_enabled || row.edge_quantity <= 0) return null
      processableQuantity = Math.min(edgeBalance, edgeDemandRemaining)
      expectedUnitMinutes = snapshot.expectedEdgeSewingMinutes ?? null
      pieceRateCents = snapshot.edgeSewingCommissionCents ?? 0
    } else {
      processableQuantity = packingBalance
      expectedUnitMinutes = snapshot.expectedPackingMinutes ?? null
      pieceRateCents = 0
    }
    if (processableQuantity <= 0) return null

    const customer = JSON.parse(row.customer_snapshot_json) as { name?: string }
    return {
      orderItemId: row.order_item_id,
      orderId: row.order_id,
      orderCode: row.order_code,
      customerName: customer.name ?? '未命名客户',
      productName: snapshot.name ?? '未命名商品',
      deliveryDate: row.expected_ship_date,
      orderCreatedAt: row.order_created_at,
      processableQuantity,
      expectedUnitMinutes,
      pieceRateCents
    }
  }

  /** 该安排的当前有效核算（版本替换时必须仍是它）。 */
  getCurrentConfirmedReviewForAssignment(assignmentId: string): ReviewRow | null {
    const row = this.database
      .prepare(
        `SELECT * FROM work_time_reviews
         WHERE work_assignment_id = ? AND status = 'confirmed'
         ORDER BY created_at DESC, rowid DESC LIMIT 1`
      )
      .get(assignmentId) as ReviewRow | undefined
    return row ?? null
  }

  getReview(id: string): ReviewRow | null {
    const row = this.database.prepare('SELECT * FROM work_time_reviews WHERE id = ?').get(id) as
      ReviewRow | undefined
    return row ?? null
  }

  listReviews(query: V2WorkTimeReviewQuery = {}): ReviewRow[] {
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
    if (query.workAssignmentId) {
      conditions.push('work_assignment_id = ?')
      params.push(query.workAssignmentId)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    return this.database
      .prepare(`SELECT * FROM work_time_reviews ${where} ORDER BY worked_on DESC, created_at DESC`)
      .all(...params) as ReviewRow[]
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
        process_task_id: string | null
        order_item_id: string | null
        completed_quantity: number
        piece_rate_cents_snapshot: number | null
        expected_unit_minutes_snapshot: number | null
      }>
    ).map((row) => ({
      id: row.id,
      orderItemId: row.order_item_id,
      processTaskId: row.process_task_id,
      completedQuantity: row.completed_quantity,
      pieceRateCentsSnapshot: requireNonNegativeIntegerOrNull(row.piece_rate_cents_snapshot),
      expectedUnitMinutesSnapshot: requireNonNegativeIntegerOrNull(
        row.expected_unit_minutes_snapshot
      )
    }))
  }

  /** 组装完整读取模型并计算当前锁定状态。 */
  toReadModel(row: ReviewRow): V2WorkTimeReview {
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
      workAssignmentId: row.work_assignment_id,
      assignmentIds: this.listAssignmentIds(row.id),
      supersedesReviewId: row.supersedes_review_id,
      voidReason: row.void_reason,
      voidedAt: row.voided_at,
      reviewNote: row.review_note,
      lock:
        row.status === 'confirmed'
          ? timedReviewLockState(this.database, row.id)
          : { locked: false, reason: null, message: null },
      items: this.listItems(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  insertReview(input: WorkTimeReviewWriteInput): void {
    this.database
      .prepare(
        `INSERT INTO work_time_reviews (
          id, worker_id, worked_on, process_type, approved_minutes, hourly_wage_cents_snapshot,
          source_type, external_record_id, raw_started_at, raw_ended_at, status,
          work_assignment_id, supersedes_review_id, review_note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'manual_review', NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.workerId,
        input.workedOn,
        input.processType,
        input.approvedMinutes,
        input.hourlyWageCentsSnapshot,
        input.rawStartedAt,
        input.rawEndedAt,
        input.status,
        input.workAssignmentId,
        input.supersedesReviewId,
        input.reviewNote,
        input.now,
        input.now
      )
    // 兼容查询继续维护关联表，便于历史与新记录统一按安排读取。
    this.database
      .prepare(
        'INSERT INTO work_time_review_assignments (review_id, work_assignment_id, created_at) VALUES (?, ?, ?)'
      )
      .run(input.id, input.workAssignmentId, input.now)
    const insertItem = this.database.prepare(
      `INSERT INTO work_time_review_items (
        id, review_id, order_item_id, process_task_id, completed_quantity,
        piece_rate_cents_snapshot, expected_unit_minutes_snapshot, created_at
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`
    )
    for (const item of input.items) {
      insertItem.run(
        item.id,
        input.id,
        item.orderItemId,
        item.completedQuantity,
        item.pieceRateCentsSnapshot,
        item.expectedUnitMinutesSnapshot,
        input.now
      )
    }
  }

  voidReview(id: string, reason: string, now: string): void {
    this.database
      .prepare(
        `UPDATE work_time_reviews
         SET status = 'voided', void_reason = ?, voided_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(reason, now, now, id)
  }

  deleteFulfillmentEventsForItems(itemIds: readonly string[]): void {
    if (!itemIds.length) return
    const placeholders = itemIds.map(() => '?').join(', ')
    this.database
      .prepare(
        `DELETE FROM fulfillment_events
         WHERE source_record_type = 'work_time_review_item' AND source_record_id IN (${placeholders})`
      )
      .run(...itemIds)
  }

  setAssignmentCompleted(assignmentId: string, now: string): void {
    this.database
      .prepare(
        "UPDATE work_assignments SET status = 'completed', updated_at = ? WHERE id = ? AND status <> 'completed'"
      )
      .run(now, assignmentId)
  }

  /** 核算更正或作废后安排回到进行中，重新出现在待核算列表。 */
  setAssignmentScheduled(assignmentId: string, now: string): void {
    this.database
      .prepare(
        "UPDATE work_assignments SET status = 'scheduled', updated_at = ? WHERE id = ? AND status = 'completed'"
      )
      .run(now, assignmentId)
  }
}

export type { ReviewRow }
