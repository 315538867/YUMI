import { describe, expect, it } from 'vitest'
import { formatIsoDate, isValidDateRange, parseIsoDate } from './iso-date'

describe('ISO 日期辅助', () => {
  it('以本地日历日解析和格式化 YYYY-MM-DD', () => {
    const date = parseIsoDate('2026-09-08')
    expect(date?.getFullYear()).toBe(2026)
    expect(date?.getMonth()).toBe(8)
    expect(date?.getDate()).toBe(8)
    expect(formatIsoDate(date!)).toBe('2026-09-08')
  })

  it('拒绝空值、无效日期与结束不晚于开始的范围', () => {
    expect(parseIsoDate('2026-02-30')).toBeUndefined()
    expect(isValidDateRange({ end: '2026-09-08', start: '2026-09-08' })).toBe(false)
    expect(isValidDateRange({ end: '2026-09-09', start: '2026-09-08' })).toBe(true)
  })
})
