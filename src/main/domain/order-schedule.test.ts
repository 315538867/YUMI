import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ORDER_RESERVED_DAYS,
  calculateOrderSchedule,
  validateOrderScheduleInput
} from './order-schedule'

describe('订单预留与制作截止日期', () => {
  it('新建订单带入工作室默认预留天数，并按预计发货日期跨日计算制作截止日期', () => {
    expect(
      calculateOrderSchedule({ expectedShipDate: '2026-09-15', defaultReservedDays: 2 })
    ).toEqual({
      reservedDays: 2,
      productionDeadline: '2026-09-13'
    })
    expect(
      calculateOrderSchedule({
        expectedShipDate: '2026-09-01',
        reservedDays: 3,
        defaultReservedDays: 2
      })
    ).toEqual({
      reservedDays: 3,
      productionDeadline: '2026-08-29'
    })
  })

  it('日期缺失时保留预留天数但不伪造制作截止日期', () => {
    expect(
      calculateOrderSchedule({
        expectedShipDate: null,
        defaultReservedDays: DEFAULT_ORDER_RESERVED_DAYS
      })
    ).toEqual({
      reservedDays: DEFAULT_ORDER_RESERVED_DAYS,
      productionDeadline: null
    })
  })

  it('拒绝负数、小数和无效日期', () => {
    expect(() => validateOrderScheduleInput({ reservedDays: -1 })).toThrow('预留天数必须是非负整数')
    expect(() => validateOrderScheduleInput({ reservedDays: 1.5 })).toThrow(
      '预留天数必须是非负整数'
    )
    expect(() =>
      calculateOrderSchedule({ expectedShipDate: '2026-02-30', defaultReservedDays: 2 })
    ).toThrow('预计发货日期无效')
  })
})
