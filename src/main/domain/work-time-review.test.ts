import { describe, expect, it } from 'vitest'
import {
  assertReviewCanCorrect,
  assertReviewCanVoid,
  assertReviewTimeRange,
  assertWorkTimeReviewInput,
  requireWorkTimeProcessType
} from './work-time-review'

function localNow(year: number, month: number, day: number, hour: number, minute: number): string {
  return new Date(year, month - 1, day, hour, minute).toISOString()
}

describe('工时核算时间范围校验', () => {
  it('按分钟精度计算同日核算分钟并归属开始日期', () => {
    const range = assertReviewTimeRange({
      startedAt: '2026-09-10T09:00:00',
      endedAt: '2026-09-10T17:30:00',
      assignedOn: '2026-09-10',
      now: localNow(2026, 9, 10, 18, 0)
    })
    expect(range).toEqual({
      startedAt: '2026-09-10T09:00:00',
      endedAt: '2026-09-10T17:30:00',
      minutes: 510,
      workedOn: '2026-09-10'
    })
  })

  it('跨日时间范围不拆单并按开始日期归属', () => {
    const range = assertReviewTimeRange({
      startedAt: '2026-09-10T22:00',
      endedAt: '2026-09-11T02:00',
      assignedOn: '2026-09-10',
      now: localNow(2026, 9, 11, 8, 0)
    })
    expect(range.minutes).toBe(240)
    expect(range.workedOn).toBe('2026-09-10')
  })

  it('拒绝秒级或毫秒级时间输入', () => {
    expect(() =>
      assertReviewTimeRange({
        startedAt: '2026-09-10T09:00:30',
        endedAt: '2026-09-10T17:00',
        assignedOn: '2026-09-10',
        now: localNow(2026, 9, 10, 18, 0)
      })
    ).toThrow('实际开始时间必须精确到分钟')
    expect(() =>
      assertReviewTimeRange({
        startedAt: '2026-09-10T09:00',
        endedAt: '2026-09-10T17:00:00.500',
        assignedOn: '2026-09-10',
        now: localNow(2026, 9, 10, 18, 0)
      })
    ).toThrow('实际结束时间必须精确到分钟')
  })

  it('结束时间必须晚于开始时间且不得晚于当前时间', () => {
    expect(() =>
      assertReviewTimeRange({
        startedAt: '2026-09-10T17:00',
        endedAt: '2026-09-10T09:00',
        assignedOn: '2026-09-10',
        now: localNow(2026, 9, 10, 18, 0)
      })
    ).toThrow('必须晚于实际开始时间')
    expect(() =>
      assertReviewTimeRange({
        startedAt: '2026-09-10T09:00',
        endedAt: '2026-09-10T09:00',
        assignedOn: '2026-09-10',
        now: localNow(2026, 9, 10, 18, 0)
      })
    ).toThrow('必须晚于实际开始时间')
    expect(() =>
      assertReviewTimeRange({
        startedAt: '2026-09-10T09:00',
        endedAt: '2026-09-10T20:00',
        assignedOn: '2026-09-10',
        now: localNow(2026, 9, 10, 18, 0)
      })
    ).toThrow('尚未到达')
  })

  it('开始时间的日期必须与排班日期一致', () => {
    expect(() =>
      assertReviewTimeRange({
        startedAt: '2026-09-11T09:00',
        endedAt: '2026-09-11T17:00',
        assignedOn: '2026-09-10',
        now: localNow(2026, 9, 11, 18, 0)
      })
    ).toThrow('必须与排班日期一致')
  })
})

describe('工时核算输入校验', () => {
  it('只接受三道计时工序', () => {
    expect(requireWorkTimeProcessType('edge_sewing')).toBe('edge_sewing')
    expect(() => requireWorkTimeProcessType('making')).toThrow(
      '工时核算只适用于捏毛装袋、缝边和打包发货工序'
    )
  })

  it('只接受单项安排、正数量且同一订单商品不重复', () => {
    expect(() =>
      assertWorkTimeReviewInput({
        processType: 'edge_sewing',
        workAssignmentId: '',
        items: [{ orderItemId: 'item-1', completedQuantity: 1 }]
      })
    ).toThrow('必须关联一条计时工作安排')
    expect(() =>
      assertWorkTimeReviewInput({
        processType: 'edge_sewing',
        workAssignmentId: 'assignment-1',
        items: []
      })
    ).toThrow('至少需要一条商品完成明细')
    expect(() =>
      assertWorkTimeReviewInput({
        processType: 'edge_sewing',
        workAssignmentId: 'assignment-1',
        items: [{ orderItemId: 'item-1', completedQuantity: 0 }]
      })
    ).toThrow('必须是正整数')
    expect(() =>
      assertWorkTimeReviewInput({
        processType: 'edge_sewing',
        workAssignmentId: 'assignment-1',
        items: [
          { orderItemId: 'item-1', completedQuantity: 1 },
          { orderItemId: 'item-1', completedQuantity: 2 }
        ]
      })
    ).toThrow('不能重复登记')
    expect(() =>
      assertWorkTimeReviewInput({
        processType: 'edge_sewing',
        workAssignmentId: 'assignment-1',
        items: [{ orderItemId: '', completedQuantity: 1 }]
      })
    ).toThrow('完成明细必须关联订单商品')
  })

  it('只有当前有效核算可以更正或作废', () => {
    expect(() => assertReviewCanCorrect('confirmed')).not.toThrow()
    expect(() => assertReviewCanVoid('confirmed')).not.toThrow()
    expect(() => assertReviewCanCorrect('draft')).toThrow('只有已核算记录可以更正')
    expect(() => assertReviewCanCorrect('voided')).toThrow('只有已核算记录可以更正')
    expect(() => assertReviewCanVoid('draft')).toThrow('只有已核算记录可以作废')
    expect(() => assertReviewCanVoid('voided')).toThrow('只有已核算记录可以作废')
  })
})
