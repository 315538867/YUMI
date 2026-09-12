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
    recordOpeningWip: vi.fn().mockResolvedValue(undefined),
    reassignProcessTask: vi.fn().mockResolvedValue(undefined),
    showSelectedOrder: false,
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
      workers: [
        { id: 'worker-wang', name: '小王', enabled: true },
        { id: 'worker-li', name: '小李', enabled: true }
      ],
      selectedOrder: mocks.showSelectedOrder
        ? {
            id: 'order-1',
            code: 'YD-001',
            customerSnapshot: { name: '小满' },
            items: [{ id: 'item-making', quantity: 20, productSnapshot: { name: '草莓捏捏' } }]
          }
        : null,
      items: [
        {
          orderItemId: 'item-making',
          stages: { making: 20, fluffingBagging: 0, packing: 0, readyToShip: 0, shipped: 0 }
        }
      ],
      loading: false,
      loadError: null,
      selectOrder: mocks.selectOrder,
      createWorkAssignment: mocks.createWorkAssignment,
      recordOpeningWip: mocks.recordOpeningWip,
      reassignProcessTask: mocks.reassignProcessTask,
      adjustStageQuantity: vi.fn()
    })
  }
})

installDomInteractionPolyfills()
afterEach(() => {
  cleanup()
  mocks.selectOrder.mockClear()
  mocks.createWorkAssignment.mockClear()
  mocks.recordOpeningWip.mockClear()
  mocks.reassignProcessTask.mockClear()
  mocks.showSelectedOrder = false
})

describe('履约排班双视角交互', () => {
  it('订单视角以具名工具条和固定列排班队列表承载待派与已派任务', () => {
    render(<FulfillmentPage />)

    const viewSwitch = screen.getByRole('navigation', { name: '排班视角' })
    expect(viewSwitch).toHaveClass('yumi-segmented-tabs')
    expect(within(viewSwitch).getByRole('button', { name: '订单视角' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('region', { name: '订单排班队列' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '订单排班队列' })).toBeVisible()
    expect(screen.getByRole('toolbar', { name: '排班队列列表工具' })).toBeVisible()
    expect(screen.getByRole('table', { name: '排班队列列表' })).toBeVisible()
    expect(
      within(screen.getByRole('table', { name: '排班队列列表' })).getByText('制作')
    ).toBeVisible()
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

  it('负责人调整转派当前待处理任务，并保留历史安排的说明边界', async () => {
    mocks.showSelectedOrder = true
    render(<FulfillmentPage />)

    fireEvent.click(screen.getByRole('button', { name: '小王 12 2026-09-10 待完成' }))
    expect(await screen.findByRole('heading', { name: '任务处理' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '负责人调整' }))

    expect(screen.getByText('当前安排')).toBeVisible()
    expect(screen.getByText('调整负责人')).toBeVisible()
    expect(screen.getByText('调整只影响未结算的后续处理；历史处理记录继续保留。')).toBeVisible()
    const workerSelect = screen.getByRole('combobox', { name: '新负责人' })
    fireEvent.keyDown(workerSelect, { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('option', { name: '小李' }), { key: 'Enter' })
    fireEvent.change(screen.getByRole('textbox', { name: '调整原因' }), {
      target: { value: '原负责人临时请假' }
    })
    fireEvent.submit(screen.getByRole('button', { name: '确认调整' }).closest('form')!)

    await waitFor(() =>
      expect(mocks.reassignProcessTask).toHaveBeenCalledWith('task-making', {
        workerId: 'worker-li',
        effectiveOn: '2026-09-12',
        reason: '原负责人临时请假'
      })
    )
  }, 20_000)

  it('按设计图在排班页头显示完整入口、阶段总量，并从工作室级入口补录期初在制品', async () => {
    render(<FulfillmentPage />)

    expect(screen.getByRole('button', { name: '导出排班' })).toBeVisible()
    expect(screen.getByRole('button', { name: '补录期初在制品' })).toBeVisible()
    expect(screen.getByRole('region', { name: '排班阶段总量' })).toBeVisible()
    expect(screen.getByText('订单总量')).toBeVisible()
    expect(screen.getByText('已发货')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '补录期初在制品' }))

    expect(screen.getByRole('heading', { name: '补录期初在制品' })).toBeVisible()
    expect(screen.getByText('1. 选择对应订单商品')).toBeVisible()
    expect(screen.getByText('2. 登记当前实际阶段')).toBeVisible()
    expect(screen.queryByRole('tab', { name: '补录期初在制品' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择：草莓捏捏' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '选择：草莓捏捏' }))
    expect(screen.getByText('小满 / 草莓捏捏')).toBeVisible()
    fireEvent.change(screen.getByRole('textbox', { name: '期初数量' }), {
      target: { value: '5' }
    })
    fireEvent.submit(screen.getByRole('button', { name: '登记期初在制品' }).closest('form')!)

    await Promise.resolve()
    expect(mocks.recordOpeningWip).toHaveBeenCalledWith({
      orderItemId: 'item-making',
      targetStage: 'ready_to_ship',
      quantity: 5,
      occurredOn: '2026-09-12',
      note: undefined
    })
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
