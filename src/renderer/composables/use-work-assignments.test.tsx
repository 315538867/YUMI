/** @vitest-environment jsdom */

import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWorkAssignments } from './use-work-assignments'

const mocks = vi.hoisted(() => ({
  listWorkAssignments: vi.fn(),
  listWorkers: vi.fn(),
  listReviews: vi.fn(),
  getFulfillmentProgress: vi.fn()
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('useWorkAssignments', () => {
  it('并行读取工作安排、兼职人员、计时核算与订单商品展示资料', async () => {
    vi.stubGlobal('yumiV2', {
      fulfillment: { listWorkAssignments: mocks.listWorkAssignments },
      workers: { list: mocks.listWorkers },
      workTimeReviews: { list: mocks.listReviews },
      reports: { getFulfillmentProgress: mocks.getFulfillmentProgress }
    })
    mocks.listWorkAssignments.mockResolvedValue([
      {
        id: 'assignment-1',
        workerId: 'worker-wang',
        assignedOn: '2026-09-10',
        processType: 'making',
        scheduleMode: 'making_task',
        status: 'scheduled',
        note: null,
        tasks: [],
        timedReview: null,
        createdAt: '2026-09-10T00:00:00.000Z',
        updatedAt: '2026-09-10T00:00:00.000Z'
      }
    ])
    mocks.listWorkers.mockResolvedValue([
      {
        id: 'worker-wang',
        name: '小王',
        enabled: true,
        note: null,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z'
      }
    ])
    mocks.listReviews.mockResolvedValue([])
    mocks.getFulfillmentProgress.mockResolvedValue({
      rows: [
        {
          orderId: 'order-1',
          orderCode: 'YD-001',
          orderItemId: 'item-1',
          productName: '草莓捏捏',
          confirmedQuantity: 10,
          stages: {
            making: 10,
            fluffingBagging: 0,
            edgeSewing: 0,
            packing: 0,
            readyToShip: 0,
            shipped: 0,
            edgeSewingRouted: 0
          }
        }
      ],
      totalConfirmedQuantity: 10,
      totalShippedQuantity: 0
    })

    const { result } = renderHook(() => useWorkAssignments())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.assignments).toHaveLength(1)
    expect(result.current.workers).toEqual([
      expect.objectContaining({ id: 'worker-wang', name: '小王', enabled: true })
    ])
    expect(result.current.itemLabels.get('item-1')?.productName).toBe('草莓捏捏')
  })

  it('缺勤或取消只调用状态更新接口，不再暴露完成与质检写入', async () => {
    const setWorkAssignmentStatus = vi.fn().mockResolvedValue({})
    vi.stubGlobal('yumiV2', {
      fulfillment: {
        listWorkAssignments: mocks.listWorkAssignments,
        setWorkAssignmentStatus
      },
      workers: { list: mocks.listWorkers },
      workTimeReviews: { list: mocks.listReviews },
      reports: { getFulfillmentProgress: mocks.getFulfillmentProgress }
    })
    mocks.listWorkAssignments.mockResolvedValue([])
    mocks.listWorkers.mockResolvedValue([])
    mocks.listReviews.mockResolvedValue([])
    mocks.getFulfillmentProgress.mockRejectedValue(new Error('报表不可用'))

    const { result } = renderHook(() => useWorkAssignments())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await result.current.setWorkAssignmentStatus('assignment-1', {
      status: 'absent',
      reason: '临时请假'
    })
    expect(setWorkAssignmentStatus).toHaveBeenCalledWith('assignment-1', {
      status: 'absent',
      reason: '临时请假'
    })
    expect(result.current).not.toHaveProperty('submitProcessResult')
    expect(result.current).not.toHaveProperty('confirmQualityInspection')
  })
})
