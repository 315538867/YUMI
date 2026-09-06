import { describe, expect, it } from 'vitest'
import { previewShiftRisks } from './scheduling'

describe('排班风险预览', () => {
  it('按任务向上取整并将全局预留时长计入最终总时长，仅保留产能与交期风险', () => {
    const result = previewShiftRisks({
      date: '2026-09-16',
      extraMinutes: 30,
      tasks: [
        { productId: 'p1', orderItemId: 'oi1', plannedQuantity: 2, standardMinutesPerUnit: 14.2, completedQuantity: 0, dueDate: '2026-09-15', dailyCapacity: 2, otherPlannedQuantityForDay: 1 },
        { productId: 'p2', orderItemId: 'oi2', plannedQuantity: 3, standardMinutesPerUnit: 15, completedQuantity: 0, dueDate: '2026-09-20', dailyCapacity: 20, otherPlannedQuantityForDay: 0 }
      ]
    })
    expect(result.taskBaseMinutes).toEqual([{ orderItemId: 'oi1', baseMinutes: 29 }, { orderItemId: 'oi2', baseMinutes: 45 }])
    expect(result).toMatchObject({ baseTaskMinutes: 74, extraMinutes: 30, totalMinutes: 104 })
    expect(result.risks.map((risk) => risk.code)).toEqual(['MOLD_DAILY_CAPACITY_EXCEEDED', 'DEADLINE_RISK'])
  })

  it('拒绝非整数或负数的全局预留时长', () => {
    const input = { date: '2026-09-10', tasks: [{ productId: 'p', orderItemId: 'oi', plannedQuantity: 1, standardMinutesPerUnit: 1, completedQuantity: 0, dueDate: '2026-09-11', dailyCapacity: 2, otherPlannedQuantityForDay: 0 }] }
    expect(() => previewShiftRisks({ ...input, extraMinutes: -1 })).toThrow('额外预留时长必须为非负整数')
    expect(() => previewShiftRisks({ ...input, extraMinutes: 1.5 })).toThrow('额外预留时长必须为非负整数')
  })
})
