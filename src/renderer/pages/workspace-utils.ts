import { addDays, format, parseISO, startOfWeek } from 'date-fns'

export interface DraftPriceLine {
  quantity: number
  unitPriceCents: number
  edgeEnabled: boolean
  edgeQuantity: number
  edgePriceCents: number
  discountCents: number
}

export interface DraftTotals {
  itemSubtotalCents: number
  itemDiscountCents: number
  orderDiscountCents: number
  receivableCents: number
}

export function calculateDraftTotals(
  lines: DraftPriceLine[],
  orderDiscountCents: number
): DraftTotals {
  const itemSubtotalCents = lines.reduce(
    (total, line) =>
      total +
      Math.max(0, line.quantity) * Math.max(0, line.unitPriceCents) +
      (line.edgeEnabled ? Math.max(0, line.edgeQuantity) * Math.max(0, line.edgePriceCents) : 0),
    0
  )
  const itemDiscountCents = lines.reduce(
    (total, line) => total + Math.max(0, line.discountCents),
    0
  )
  const applicableOrderDiscountCents = Math.min(
    Math.max(0, orderDiscountCents),
    Math.max(0, itemSubtotalCents - itemDiscountCents)
  )

  return {
    itemSubtotalCents,
    itemDiscountCents,
    orderDiscountCents: applicableOrderDiscountCents,
    receivableCents: Math.max(
      0,
      itemSubtotalCents - itemDiscountCents - applicableOrderDiscountCents
    )
  }
}

export function getWeekDates(anchorDate: string): string[] {
  const weekStart = startOfWeek(parseISO(anchorDate), { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, index) => format(addDays(weekStart, index), 'yyyy-MM-dd'))
}

export function getErrorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message.trim() ? reason.message : fallback
}
