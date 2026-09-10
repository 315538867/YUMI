import type { BusinessDate } from '@shared/contracts/index'
import { DomainValidationError } from './errors'

export const DEFAULT_ORDER_RESERVED_DAYS = 2

export interface OrderScheduleInput {
  expectedShipDate?: BusinessDate | null
  reservedDays?: number | null
  defaultReservedDays?: number
}

export interface OrderSchedule {
  reservedDays: number
  productionDeadline: BusinessDate | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function requireBusinessDate(value: string, label: string): BusinessDate {
  if (!ISO_DATE.test(value)) throw new DomainValidationError(`${label}格式必须为 YYYY-MM-DD`)
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new DomainValidationError(`${label}无效`)
  }
  return value
}

function requireReservedDays(value: number, label = '预留天数'): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainValidationError(`${label}必须是非负整数`)
  }
  return value
}

export function validateOrderScheduleInput(input: Pick<OrderScheduleInput, 'reservedDays' | 'defaultReservedDays'>): void {
  if (input.defaultReservedDays !== undefined) requireReservedDays(input.defaultReservedDays, '工作室默认预留天数')
  if (input.reservedDays !== undefined && input.reservedDays !== null) requireReservedDays(input.reservedDays)
}

export function calculateOrderSchedule(input: OrderScheduleInput): OrderSchedule {
  const defaultReservedDays = input.defaultReservedDays ?? DEFAULT_ORDER_RESERVED_DAYS
  validateOrderScheduleInput(input)
  const reservedDays = input.reservedDays ?? defaultReservedDays
  if (!input.expectedShipDate) return { reservedDays, productionDeadline: null }
  const expectedShipDate = requireBusinessDate(input.expectedShipDate, '预计发货日期')
  const deadline = new Date(`${expectedShipDate}T00:00:00Z`)
  deadline.setUTCDate(deadline.getUTCDate() - reservedDays)
  return { reservedDays, productionDeadline: deadline.toISOString().slice(0, 10) }
}
