/** @vitest-environment jsdom */

import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWorkAssignments } from './use-work-assignments'

const mocks = vi.hoisted(() => ({
  getProcessResultForTask: vi.fn(),
  listWorkAssignments: vi.fn(),
  listWorkers: vi.fn()
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useWorkAssignments', () => {
  it('加载工作安排时并行读取兼职人员列表', async () => {
    Object.assign(window, {
      yumiV2: {
        fulfillment: {
          getProcessResultForTask: mocks.getProcessResultForTask,
          listWorkAssignments: mocks.listWorkAssignments
        },
        workers: { list: mocks.listWorkers }
      }
    })
    mocks.listWorkAssignments.mockResolvedValue([])
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

    const { result } = renderHook(() => useWorkAssignments())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mocks.listWorkers).toHaveBeenCalledTimes(1)
    expect(result.current.workers).toEqual([
      expect.objectContaining({ id: 'worker-wang', name: '小王', enabled: true })
    ])
  })
})
