import type { V2Database } from '@main/database/v2-connection'
import type { V2ReviewLockReason, V2ReviewLockState } from '@shared/contracts/index'

export const unlockedReviewState: V2ReviewLockState = {
  locked: false,
  reason: null,
  message: null
}

function lockedState(reason: V2ReviewLockReason, message: string): V2ReviewLockState {
  return { locked: true, reason, message }
}

const settlementLockMessage =
  '该核算已进入已确认工资结算，不能直接更正或作废；差异请通过后续结算调整处理'
const consumedLockMessage =
  '产出已被下游工序或发货消耗，不能直接更正或作废；请先处理下游履约或使用履约调整'

const stageColumns = [
  'making',
  'fluffing_bagging',
  'edge_sewing',
  'packing',
  'ready_to_ship',
  'shipped'
] as const

/**
 * 来源记录产生的履约产出是否已被下游消耗：
 * 按目标阶段汇总产出量，与订单商品当前阶段余额比较，任一阶段余额不足即为已消耗。
 */
export function isProducedQuantityConsumed(
  database: V2Database,
  sourceRecordType: string,
  sourceRecordIds: readonly string[]
): boolean {
  if (!sourceRecordIds.length) return false
  const producedPlaceholders = sourceRecordIds.map(() => '?').join(', ')
  const produced = database
    .prepare(
      `SELECT order_item_id, target_stage, SUM(quantity) AS quantity
       FROM fulfillment_events
       WHERE source_record_type = ? AND source_record_id IN (${producedPlaceholders})
         AND target_stage IS NOT NULL
       GROUP BY order_item_id, target_stage`
    )
    .all(sourceRecordType, ...sourceRecordIds) as Array<{
    order_item_id: string
    target_stage: (typeof stageColumns)[number]
    quantity: number
  }>
  if (!produced.length) return false

  const orderItemIds = [...new Set(produced.map((row) => row.order_item_id))]
  const itemPlaceholders = orderItemIds.map(() => '?').join(', ')
  const deltaSelect = stageColumns
    .map(
      (stage) =>
        `SUM(CASE WHEN target_stage = '${stage}' THEN quantity ELSE 0 END) - SUM(CASE WHEN source_stage = '${stage}' THEN quantity ELSE 0 END) AS ${stage}`
    )
    .join(',\n         ')
  const deltas = database
    .prepare(
      `SELECT order_item_id, ${deltaSelect}
       FROM fulfillment_events
       WHERE order_item_id IN (${itemPlaceholders})
       GROUP BY order_item_id`
    )
    .all(...orderItemIds) as Array<
    Record<(typeof stageColumns)[number], number> & { order_item_id: string }
  >
  const quantities = database
    .prepare(`SELECT id, quantity FROM order_items WHERE id IN (${itemPlaceholders})`)
    .all(...orderItemIds) as Array<{ id: string; quantity: number }>

  const deltaByItem = new Map(deltas.map((row) => [row.order_item_id, row]))
  const quantityByItem = new Map(quantities.map((row) => [row.id, row.quantity]))
  for (const row of produced) {
    const delta = deltaByItem.get(row.order_item_id)
    const initial = row.target_stage === 'making' ? (quantityByItem.get(row.order_item_id) ?? 0) : 0
    const balance = initial + (delta?.[row.target_stage] ?? 0)
    if (balance < row.quantity) return true
  }
  return false
}

/** 制作核算的更正/作废锁定：已确认结算或产出被下游消耗后不得直接改写。 */
export function makingReviewLockState(
  database: V2Database,
  input: { resultId: string | null; inspectionId: string | null }
): V2ReviewLockState {
  if (!input.resultId || !input.inspectionId) return unlockedReviewState
  const inConfirmedSettlement = database
    .prepare(
      `SELECT 1 AS found
       FROM worker_settlement_making_sources AS sources
       JOIN worker_settlements AS settlements ON settlements.id = sources.settlement_id
       WHERE sources.quality_inspection_id = ?
         AND sources.status = 'confirmed'
         AND settlements.status = 'confirmed'
       LIMIT 1`
    )
    .get(input.inspectionId)
  if (inConfirmedSettlement) return lockedState('settlement_confirmed', settlementLockMessage)

  const deducted = database
    .prepare(
      `SELECT 1 AS found FROM worker_deduction_records
       WHERE quality_inspection_id = ? AND deducted_cents > 0
       LIMIT 1`
    )
    .get(input.inspectionId)
  if (deducted) return lockedState('settlement_confirmed', settlementLockMessage)

  const refunded = database
    .prepare('SELECT 1 AS found FROM worker_refund_records WHERE quality_inspection_id = ? LIMIT 1')
    .get(input.inspectionId)
  if (refunded) return lockedState('settlement_confirmed', settlementLockMessage)

  if (isProducedQuantityConsumed(database, 'quality_inspection', [input.inspectionId])) {
    return lockedState('downstream_consumed', consumedLockMessage)
  }
  return unlockedReviewState
}

/** 计时核算的更正/作废锁定：已确认结算或产出被下游消耗后不得直接改写。 */
export function timedReviewLockState(database: V2Database, reviewId: string): V2ReviewLockState {
  const inConfirmedSettlement = database
    .prepare(
      `SELECT 1 AS found
       FROM worker_settlement_timed_sources AS sources
       JOIN worker_settlements AS settlements ON settlements.id = sources.settlement_id
       WHERE sources.work_time_review_id = ?
         AND sources.status = 'confirmed'
         AND settlements.status = 'confirmed'
       LIMIT 1`
    )
    .get(reviewId)
  if (inConfirmedSettlement) return lockedState('settlement_confirmed', settlementLockMessage)

  const itemIds = (
    database
      .prepare('SELECT id FROM work_time_review_items WHERE review_id = ?')
      .all(reviewId) as Array<{ id: string }>
  ).map((row) => row.id)
  if (isProducedQuantityConsumed(database, 'work_time_review_item', itemIds)) {
    return lockedState('downstream_consumed', consumedLockMessage)
  }
  return unlockedReviewState
}
