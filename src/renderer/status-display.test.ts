import { describe, expect, it } from 'vitest'
import {
  getFinancialStatusPresentation,
  getProductionStatusPresentation,
  getShiftStatusPresentation,
  knownProductionStatuses,
  knownShiftStatuses
} from './status-display'

describe('用户可见状态中文展示', () => {
  it('为全部已知生产状态提供中文名称与状态色', () => {
    expect(knownProductionStatuses).toEqual([
      'pending_confirmation',
      'pending_schedule',
      'in_production',
      'pending_shipment',
      'completed',
      'cancelled'
    ])
    expect(getProductionStatusPresentation('pending_confirmation')).toEqual({ label: '待确认', color: 'amber' })
    expect(getProductionStatusPresentation('pending_schedule')).toEqual({ label: '待排班', color: 'amber' })
    expect(getProductionStatusPresentation('in_production')).toEqual({ label: '制作中', color: 'gray' })
    expect(getProductionStatusPresentation('pending_shipment')).toEqual({ label: '待发货', color: 'amber' })
    expect(getProductionStatusPresentation('completed')).toEqual({ label: '已完成', color: 'green' })
    expect(getProductionStatusPresentation('cancelled')).toEqual({ label: '已取消', color: 'red' })
  })

  it('为全部已知收付款状态提供中文名称与状态色', () => {
    expect(getFinancialStatusPresentation('unpaid')).toEqual({ label: '未收款', color: 'red' })
    expect(getFinancialStatusPresentation('partial')).toEqual({ label: '部分收款', color: 'amber' })
    expect(getFinancialStatusPresentation('paid')).toEqual({ label: '已结清', color: 'green' })
    expect(getFinancialStatusPresentation('refunding')).toEqual({ label: '退款中', color: 'amber' })
    expect(getFinancialStatusPresentation('refunded')).toEqual({ label: '已退款', color: 'gray' })
    expect(getFinancialStatusPresentation('overpaid')).toEqual({ label: '超收', color: 'amber' })
  })

  it('为全部已知排班状态提供中文名称与状态色', () => {
    expect(knownShiftStatuses).toEqual(['scheduled', 'leave', 'absent', 'late', 'cancelled', 'completed'])
    expect(getShiftStatusPresentation('scheduled')).toEqual({ label: '已排班', color: 'gray' })
    expect(getShiftStatusPresentation('leave')).toEqual({ label: '请假', color: 'red' })
    expect(getShiftStatusPresentation('absent')).toEqual({ label: '缺勤', color: 'red' })
    expect(getShiftStatusPresentation('late')).toEqual({ label: '迟到', color: 'amber' })
    expect(getShiftStatusPresentation('cancelled')).toEqual({ label: '已取消', color: 'red' })
    expect(getShiftStatusPresentation('completed')).toEqual({ label: '已完成', color: 'green' })
  })

  it('以中文兜底显示未识别状态并保留原始值', () => {
    expect(getProductionStatusPresentation('legacy_waiting')).toEqual({
      label: '未知状态（legacy_waiting）',
      color: 'gray'
    })
    expect(getFinancialStatusPresentation('')).toEqual({ label: '未知状态（空值）', color: 'gray' })
    expect(getShiftStatusPresentation('on_hold')).toEqual({ label: '未知状态（on_hold）', color: 'gray' })
  })
})
