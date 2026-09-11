/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import {
  cleanup,
  fireEvent,
  render as renderBase,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiNotificationProvider } from '../../components/ui'
const render = (ui: Parameters<typeof renderBase>[0]) =>
  renderBase(<YumiNotificationProvider>{ui}</YumiNotificationProvider>)
import { installDomInteractionPolyfills } from '../../test/dom'
import { FulfillmentPage } from './index'

const mocks = vi.hoisted(() => {
  const emptySchedule = {
    wipQuantity: 0,
    reservedQuantity: 0,
    unassignedQuantity: 0,
    overassignedQuantity: 0,
    tasks: []
  }
  const makingSchedule = {
    wipQuantity: 20,
    reservedQuantity: 12,
    unassignedQuantity: 8,
    overassignedQuantity: 0,
    tasks: [
      {
        assignmentId: 'assignment-1',
        taskId: 'task-making',
        workerId: 'worker-wang',
        workerName: '小王',
        assignedOn: '2026-09-10',
        processType: 'making',
        stage: 'making',
        plannedQuantity: 12,
        status: 'pending'
      }
    ]
  }
  return {
    selectOrder: vi.fn().mockResolvedValue(undefined),
    createWorkAssignment: vi.fn().mockResolvedValue(undefined),
    queueItems: [
      {
        orderId: 'order-1',
        orderCode: 'YD-001',
        customerName: '小满',
        orderItemId: 'item-making',
        productName: '草莓捏捏',
        confirmedQuantity: 20,
        outstandingQuantity: 20,
        stages: { making: 20, fluffingBagging: 0, packing: 0, readyToShip: 0, shipped: 0 },
        stageSchedules: {
          making: makingSchedule,
          fluffing_bagging: emptySchedule,
          packing: emptySchedule,
          ready_to_ship: emptySchedule
        }
      },
      {
        orderId: 'order-1',
        orderCode: 'YD-001',
        customerName: '小满',
        orderItemId: 'item-ready',
        productName: '奶油捏捏',
        confirmedQuantity: 12,
        outstandingQuantity: 4,
        stages: { making: 0, fluffingBagging: 0, packing: 0, readyToShip: 4, shipped: 8 },
        stageSchedules: {
          making: emptySchedule,
          fluffing_bagging: emptySchedule,
          packing: emptySchedule,
          ready_to_ship: {
            wipQuantity: 4,
            reservedQuantity: 0,
            unassignedQuantity: 4,
            overassignedQuantity: 0,
            tasks: []
          }
        }
      }
    ]
  }
})

vi.mock('../../composables/use-fulfillment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../composables/use-fulfillment')>()
  return {
    ...actual,
    useFulfillment: () => ({
      queueItems: mocks.queueItems,
      workers: [{ id: 'worker-wang', name: '小王', enabled: true }],
      selectedOrder: null,
      items: [],
      loading: false,
      loadError: null,
      selectOrder: mocks.selectOrder,
      createWorkAssignment: mocks.createWorkAssignment,
      recordOpeningWip: vi.fn(),
      adjustStageQuantity: vi.fn()
    })
  }
})

installDomInteractionPolyfills()
afterEach(() => {
  cleanup()
  mocks.selectOrder.mockClear()
  mocks.createWorkAssignment.mockClear()
})

describe('履约排班双视角交互', () => {
  it('订单视角以具名工具条和固定列排班队列表承载待派与已派任务', () => {
    render(<FulfillmentPage />)

    expect(screen.getByRole('region', { name: '订单排班队列' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '订单排班队列' })).toBeVisible()
    expect(screen.getByRole('toolbar', { name: '排班队列列表工具' })).toBeVisible()
    expect(screen.getByRole('table', { name: '排班队列列表' })).toBeVisible()
    expect(screen.getByRole('button', { name: '制作 8' })).toBeVisible()
    expect(screen.getByText('未派 8')).toBeVisible()
    expect(screen.getByRole('button', { name: /小王 12.*待完成/ })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '进入处理：草莓捏捏' }))
    expect(mocks.selectOrder).toHaveBeenCalledWith('order-1')

    fireEvent.click(screen.getByRole('button', { name: '派工制作' }))
    expect(screen.getByRole('dialog', { name: '派工：制作' })).toBeVisible()
    expect(screen.getByText('待派上限：8 件')).toBeVisible()
  })

  it('行内派工会限制待派数量，并提交到既有创建工作安排接口', async () => {
    render(<FulfillmentPage />)

    fireEvent.click(screen.getByRole('button', { name: '派工制作' }))
    const workerSelect = screen.getByRole('combobox', { name: '派工人员' })
    fireEvent.keyDown(workerSelect, { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('option', { name: '小王' }), { key: 'Enter' })
    fireEvent.change(screen.getByRole('textbox', { name: '派工数量' }), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: '保存派工' }))
    expect(screen.getByRole('alert')).toHaveTextContent('计划数量不能超过当前待派上限 8 件。')

    fireEvent.change(screen.getByRole('textbox', { name: '派工数量' }), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: '保存派工' }))
    await waitFor(() =>
      expect(mocks.createWorkAssignment).toHaveBeenCalledWith(
        expect.objectContaining({
          workerId: 'worker-wang',
          processType: 'making',
          tasks: [
            expect.objectContaining({
              orderItemId: 'item-making',
              plannedQuantity: 8,
              plannedMinutes: null,
              extraMinutes: 0
            })
          ]
        })
      )
    )
  })

  it('非制作工序未填写计划分钟时不能保存派工', () => {
    render(<FulfillmentPage />)

    fireEvent.click(screen.getByRole('button', { name: '待发货 4' }))
    fireEvent.click(screen.getByRole('button', { name: '派工待发货' }))
    const workerSelect = screen.getByRole('combobox', { name: '派工人员' })
    fireEvent.keyDown(workerSelect, { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('option', { name: '小王' }), { key: 'Enter' })
    fireEvent.change(screen.getByRole('textbox', { name: '派工数量' }), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: '保存派工' }))

    expect(screen.getByRole('alert')).toHaveTextContent('非制作工序必须填写正整数计划分钟。')
  })

  it('人员周历按人员和日期展示任务，并能从任务卡进入精确处理上下文', () => {
    render(<FulfillmentPage />)

    fireEvent.click(screen.getByRole('button', { name: '人员周历' }))
    const weekCalendar = screen.getByRole('region', { name: '人员周历' })
    expect(weekCalendar).toHaveClass('yumi-section', 'yumi-worker-week')
    expect(within(weekCalendar).getByRole('group', { name: '人员周历日期导航' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '人员周历' })).toBeVisible()
    expect(screen.getByText('小王')).toBeVisible()
    expect(screen.getByRole('button', { name: /草莓捏捏.*制作.*12.*待完成/ })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: /草莓捏捏.*制作.*12.*待完成/ }))
    expect(mocks.selectOrder).toHaveBeenCalledWith('order-1')
  })

  it('人员周历支持自然周切换，并为人员日期空白格预填派工抽屉', () => {
    render(<FulfillmentPage />)

    fireEvent.click(screen.getByRole('button', { name: '人员周历' }))
    expect(screen.getByText('2026-09-07 至 2026-09-13 · 仅显示待完成与待质检任务')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '上一周' }))
    expect(screen.getByText('2026-08-31 至 2026-09-06 · 仅显示待完成与待质检任务')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '本周' }))

    fireEvent.click(screen.getByRole('button', { name: '为小王2026-09-11派工' }))
    expect(screen.getByRole('dialog', { name: '派工：制作' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: '派工人员' })).toHaveTextContent('小王')
    expect(screen.getByRole('button', { name: '派工日期' })).toHaveTextContent('2026/9/11')
  })
})
