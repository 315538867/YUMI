import {
  formatCents as formatMoneyCents,
  parseSignedYuanToCents as parseSignedMoneyYuanToCents,
  parseYuanToCents as parseMoneyYuanToCents
} from '@shared/money'

/** 所有前端元金额输入统一交给 Decimal 精度内核转换，禁止浮点乘除。 */
export const yuanToCents = parseMoneyYuanToCents
/** 仅用于可正可负的负责人调整，其他金额仍使用 yuanToCents。 */
export const signedYuanToCents = parseSignedMoneyYuanToCents

export function centsToYuan(cents: number): string {
  return formatMoneyCents(cents)
}

export function formatCents(cents: number): string {
  return `¥${formatMoneyCents(cents)}`
}

export function today(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}
