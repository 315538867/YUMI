import type { FinancialStatus, ProductionStatus, ShiftStatus } from '@shared/contracts'

export type StatusPresentationColor = 'gray' | 'green' | 'amber' | 'red'

export interface StatusPresentation {
  label: string
  color: StatusPresentationColor
}

export const knownProductionStatuses: readonly ProductionStatus[] = [
  'pending_confirmation',
  'pending_schedule',
  'in_production',
  'pending_shipment',
  'completed',
  'cancelled'
]

export const knownShiftStatuses: readonly ShiftStatus[] = [
  'scheduled',
  'leave',
  'absent',
  'late',
  'cancelled',
  'completed'
]

const productionStatusPresentations: Record<ProductionStatus, StatusPresentation> = {
  pending_confirmation: { label: '待确认', color: 'amber' },
  pending_schedule: { label: '待排班', color: 'amber' },
  in_production: { label: '制作中', color: 'gray' },
  pending_shipment: { label: '待发货', color: 'amber' },
  completed: { label: '已完成', color: 'green' },
  cancelled: { label: '已取消', color: 'red' }
}

const financialStatusPresentations: Record<FinancialStatus, StatusPresentation> = {
  unpaid: { label: '未收款', color: 'red' },
  partial: { label: '部分收款', color: 'amber' },
  paid: { label: '已结清', color: 'green' },
  refunding: { label: '退款中', color: 'amber' },
  refunded: { label: '已退款', color: 'gray' },
  overpaid: { label: '超收', color: 'amber' }
}

const shiftStatusPresentations: Record<ShiftStatus, StatusPresentation> = {
  scheduled: { label: '已排班', color: 'gray' },
  leave: { label: '请假', color: 'red' },
  absent: { label: '缺勤', color: 'red' },
  late: { label: '迟到', color: 'amber' },
  cancelled: { label: '已取消', color: 'red' },
  completed: { label: '已完成', color: 'green' }
}

const unknownStatusPresentation = (status: string | null | undefined): StatusPresentation => ({
  label: `未知状态（${status || '空值'}）`,
  color: 'gray'
})

function resolveStatusPresentation<T extends string>(
  status: string | null | undefined,
  presentations: Record<T, StatusPresentation>
): StatusPresentation {
  if (status && status in presentations) return presentations[status as T]
  return unknownStatusPresentation(status)
}

export function getProductionStatusPresentation(status: string | null | undefined): StatusPresentation {
  return resolveStatusPresentation(status, productionStatusPresentations)
}

export function getFinancialStatusPresentation(status: string | null | undefined): StatusPresentation {
  return resolveStatusPresentation(status, financialStatusPresentations)
}

export function getShiftStatusPresentation(status: string | null | undefined): StatusPresentation {
  return resolveStatusPresentation(status, shiftStatusPresentations)
}
