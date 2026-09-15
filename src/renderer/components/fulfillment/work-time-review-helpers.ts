import type {
  V2TimedProcessType,
  V2WorkTimeReview,
  V2WorkTimeReviewCandidate,
  V2WorkTimeReviewItem
} from '@shared/contracts/index'
import type { WorkTimeReviewItemLabel } from '../../composables/use-work-time-reviews'

export const workTimeProcessLabels: Record<'making' | V2TimedProcessType, string> = {
  making: '制作',
  fluffing_bagging: '捏毛装袋',
  edge_sewing: '缝边',
  packing: '打包发货'
}

/** 解析非负整数输入；空串、小数、负数与非法字符都返回 null。 */
export function parseWholeNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export interface MakingReviewQuantities {
  unqualifiedQuantity: number
  unfinishedQuantity: number
}

export interface MakingReviewValidation {
  quantities: MakingReviewQuantities | null
  completedError: string | null
  qualifiedError: string | null
}

/**
 * 制作一次核算的界面校验：0 ≤ 合格 ≤ 实际产出 ≤ 本次计划；
 * 不合格与未完成数量由系统计算，界面只读展示。
 */
export function validateMakingReviewQuantities(input: {
  plannedQuantity: number
  completedQuantity: number | null
  qualifiedQuantity: number | null
}): MakingReviewValidation {
  const { plannedQuantity, completedQuantity, qualifiedQuantity } = input
  const completedError =
    completedQuantity === null
      ? '请填写实际产出数量（非负整数）'
      : completedQuantity > plannedQuantity
        ? `实际产出不能超过本次计划 ${plannedQuantity} 件，请先调整制作计划`
        : null
  const qualifiedError =
    qualifiedQuantity === null
      ? '请填写合格数量（非负整数）'
      : completedQuantity !== null && qualifiedQuantity > completedQuantity
        ? '合格数量不能大于实际产出数量'
        : null
  if (
    completedError ||
    qualifiedError ||
    completedQuantity === null ||
    qualifiedQuantity === null
  ) {
    return { quantities: null, completedError, qualifiedError }
  }
  return {
    quantities: {
      unqualifiedQuantity: completedQuantity - qualifiedQuantity,
      unfinishedQuantity: plannedQuantity - completedQuantity
    },
    completedError: null,
    qualifiedError: null
  }
}

export interface TimedCandidateRow {
  orderItemId: string
  productName: string
  orderCode: string
  customerName: string
  deliveryDate: string | null
  /** 本次核算最多可登记的数量；更正时包含原版本已登记的占用。 */
  processableQuantity: number
  expectedUnitMinutes: number | null
  pieceRateCents: number
  fromOriginalReview: boolean
}

/**
 * 候选行：服务端顺序保持不变；更正时把原版本明细合并为可再次登记的数量，
 * 已被原版本占用的部分在回退后重新可处理。
 */
export function buildTimedCandidateRows(
  candidates: readonly V2WorkTimeReviewCandidate[],
  review: V2WorkTimeReview | null,
  itemLabels: ReadonlyMap<string, WorkTimeReviewItemLabel>
): TimedCandidateRow[] {
  const originalByItem = new Map<string, V2WorkTimeReviewItem>()
  for (const item of review?.items ?? []) {
    if (item.orderItemId) originalByItem.set(item.orderItemId, item)
  }
  const rows = candidates.map<TimedCandidateRow>((candidate) => {
    const original = originalByItem.get(candidate.orderItemId)
    originalByItem.delete(candidate.orderItemId)
    return {
      orderItemId: candidate.orderItemId,
      productName: candidate.productName,
      orderCode: candidate.orderCode,
      customerName: candidate.customerName,
      deliveryDate: candidate.deliveryDate,
      processableQuantity: candidate.processableQuantity + (original?.completedQuantity ?? 0),
      expectedUnitMinutes: candidate.expectedUnitMinutes,
      pieceRateCents: candidate.pieceRateCents,
      fromOriginalReview: Boolean(original)
    }
  })
  for (const item of originalByItem.values()) {
    const label = item.orderItemId ? itemLabels.get(item.orderItemId) : undefined
    rows.push({
      orderItemId: item.orderItemId ?? '',
      productName: label?.productName ?? '订单商品',
      orderCode: label?.orderCode ?? '—',
      customerName: '—',
      deliveryDate: null,
      processableQuantity: item.completedQuantity,
      expectedUnitMinutes: item.expectedUnitMinutesSnapshot,
      pieceRateCents: item.pieceRateCentsSnapshot ?? 0,
      fromOriginalReview: true
    })
  }
  return rows
}
