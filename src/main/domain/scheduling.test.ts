import { describe, expect, it } from 'vitest'
import { previewShiftRisks } from './scheduling'

describe('排班风险预览', () => {
  it('同时识别超出工时、模具日产能和交期风险', () => {
    const result = previewShiftRisks({
      date: '2026-09-16',
      startTime: '10:00',
      endTime: '14:00',
      existingWorkerShifts: [{ startTime: '13:00', endTime: '16:00' }],
      tasks: [
        {
          productId: 'p1',
          orderItemId: 'oi1',
          plannedQuantity: 20,
          standardMinutesPerUnit: 15,
          completedQuantity: 0,
          dueDate: '2026-09-15',
          dailyCapacity: 40,
          otherPlannedQuantityForDay: 25
        }
      ]
    })

    expect(result.totalPlannedMinutes).toBe(300)
    expect(result.risks.map((risk) => risk.code)).toEqual([
      'WORKER_TIME_OVERLAP',
      'SHIFT_OVER_CAPACITY',
      'MOLD_DAILY_CAPACITY_EXCEEDED',
      'DEADLINE_RISK'
    ])
    expect(result.canSaveWithConfirmation).toBe(true)
  })
})
