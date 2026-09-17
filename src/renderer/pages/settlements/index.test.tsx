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
import { installDomInteractionPolyfills } from '../../test/dom'
import { SettlementsPage } from './index'

const render = (ui: Parameters<typeof renderBase>[0]) =>
  renderBase(<YumiNotificationProvider>{ui}</YumiNotificationProvider>)

const mocks = vi.hoisted(() => ({
  resolveRefund: vi.fn().mockResolvedValue(undefined),
  settlements: [
    {
      id: 'settlement-1',
      workerId: 'worker-1',
      periodStartOn: '2026-09-01',
      periodEndOn: '2026-09-07',
      status: 'draft' as const,
      timedWageCents: 0,
      commissionCents: 2_500,
      materialDeductionCents: 1_750,
      adjustmentCents: 0,
      candidateWageCents: 750,
      currentDeductionCents: 1_750,
      carriedDeductionCents: 0,
      actualDeductionCents: 1_500,
      continuingCarryoverCents: 250,
      otherAdjustmentCents: 0,
      finalPaidAmountCents: null,
      paidOn: null,
      managerNote: null,
      financialEntryId: null,
      createdAt: '2026-09-08T00:00:00.000Z',
      updatedAt: '2026-09-08T00:00:00.000Z',
      makingSources: [
        {
          id: 'making-source-1',
          processTaskId: 'task-making-1',
          qualityInspectionId: 'inspection-1',
          orderId: 'order-1',
          orderItemId: 'item-1',
          occurredOn: '2026-09-03',
          qualifiedQuantity: 2,
          unqualifiedQuantity: 1,
          pieceRateCents: 1_250,
          qualifiedCommissionCents: 2_500,
          materialDeductionCents: 1_750,
          status: 'draft' as const,
          createdAt: '2026-09-08T00:00:00.000Z'
        }
      ],
      timedSources: [],
      adjustments: [],
      deductions: [
        {
          id: 'deduction-1',
          workerId: 'worker-1',
          workAssignmentId: 'assignment-1',
          processTaskId: 'task-making-1',
          processType: 'making' as const,
          pieceRateCents: 1_250,
          processResultId: 'result-1',
          qualityInspectionId: 'inspection-1',
          orderId: 'order-1',
          orderItemId: 'item-1',
          unqualifiedQuantity: 1,
          materialDeductionCents: 1_750,
          totalDeductionCents: 1_750,
          deductedCents: 0,
          remainingCarryoverCents: 1_750,
          status: 'pending' as const,
          occurredOn: '2026-09-07',
          createdAt: '2026-09-08T00:00:00.000Z',
          updatedAt: '2026-09-08T00:00:00.000Z'
        }
      ],
      deductionAllocations: [
        {
          id: 'allocation-1',
          deductionRecordId: 'deduction-1',
          allocatedCents: 1_500,
          status: 'draft' as const,
          createdAt: '2026-09-08T00:00:00.000Z'
        }
      ]
    },
    {
      id: 'settlement-2',
      workerId: 'worker-2',
      periodStartOn: '2026-09-08',
      periodEndOn: '2026-09-09',
      status: 'confirmed' as const,
      timedWageCents: 8_000,
      commissionCents: 1_000,
      materialDeductionCents: 0,
      adjustmentCents: 0,
      candidateWageCents: 9_000,
      currentDeductionCents: 0,
      carriedDeductionCents: 0,
      actualDeductionCents: 0,
      continuingCarryoverCents: 0,
      otherAdjustmentCents: 0,
      finalPaidAmountCents: 9_000,
      paidOn: '2026-09-10',
      managerNote: null,
      financialEntryId: 'entry-1',
      createdAt: '2026-09-10T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
      makingSources: [],
      timedSources: [],
      adjustments: [],
      deductions: [],
      deductionAllocations: []
    }
  ],
  refunds: [
    {
      id: 'refund-1',
      workerId: 'worker-1',
      originalSettlementId: 'settlement-1',
      processTaskId: 'task-1',
      processResultId: null,
      qualityInspectionId: 'inspection-1',
      orderId: null,
      orderItemId: null,
      unqualifiedQuantity: 2,
      materialRefundCents: 1_000,
      actualRefundCents: null,
      refundedOn: null,
      managerNote: null,
      status: 'pending' as const,
      createdAt: '2026-09-10T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z'
    }
  ]
}))

vi.mock('../../composables/use-settlements', () => ({
  useSettlements: () => ({
    workers: [
      {
        id: 'worker-1',
        name: '小林',
        enabled: true,
        note: null,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z'
      },
      {
        id: 'worker-2',
        name: '小夏',
        enabled: true,
        note: null,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z'
      }
    ],
    settlements: mocks.settlements,
    refunds: mocks.refunds,
    loading: false,
    loadError: null,
    createWorker: vi.fn(),
    listWageHistory: vi.fn(),
    recordWageHistory: vi.fn(),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    confirmSettlement: vi.fn(),
    resolveRefund: mocks.resolveRefund
  })
}))

installDomInteractionPolyfills()
afterEach(() => {
  cleanup()
  mocks.resolveRefund.mockClear()
})

describe('P3 · 工资 Pattern 根契约（任务 10.1）', () => {
  it('工资结算页签由唯一 list-page 紧凑根承接，列表表面承载结算记录表', () => {
    render(<SettlementsPage />)

    expect(screen.getByText('2 位人员')).toBeVisible()
    expect(screen.getByRole('table', { name: '工资结算列表' })).toBeVisible()
    const roots = document.querySelectorAll('[data-page-pattern]')
    expect(roots).toHaveLength(1)
    const root = roots[0] as HTMLElement
    expect(root).toHaveAttribute('data-page-pattern', 'list-page')
    expect(root).toHaveAttribute('data-density', 'compact')
    expect(root).toHaveClass('yumi-page')
    expect(within(root).getByRole('toolbar', { name: '工资结算列表工具' })).toBeVisible()
    expect(within(root).getByRole('table', { name: '工资结算列表' })).toBeVisible()
    expect(within(root).getByRole('heading', { name: '工资' })).toBeVisible()
  })

  it('查看结算后由唯一 detail-page 标准根承接，返回导航回到结算列表', async () => {
    render(<SettlementsPage />)

    fireEvent.click(screen.getByRole('button', { name: '查看结算详情：小林' }))
    await screen.findByRole('region', { name: '工资结算摘要' })

    const roots = document.querySelectorAll('[data-page-pattern]')
    expect(roots).toHaveLength(1)
    const root = roots[0] as HTMLElement
    expect(root).toHaveAttribute('data-page-pattern', 'detail-page')
    expect(root).toHaveAttribute('data-density', 'standard')
    expect(root).toHaveClass('yumi-page')
    expect(within(root).getByRole('button', { name: '返回工资结算列表' })).toBeVisible()
    expect(within(root).getByRole('table', { name: '制作结果来源记录' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '返回工资结算列表' }))
    expect(screen.getByRole('table', { name: '工资结算列表' })).toBeVisible()
    expect(document.querySelectorAll('[data-page-pattern]')).toHaveLength(1)
    expect(
      (document.querySelector('[data-page-pattern]') as HTMLElement).getAttribute(
        'data-page-pattern'
      )
    ).toBe('list-page')
  })

  it('待退款页签由唯一 list-page 紧凑根承接，人员时薪页签保持嵌入不创建模式根', () => {
    render(<SettlementsPage />)

    fireEvent.click(screen.getByRole('button', { name: /待退款/ }))
    expect(screen.getByRole('table', { name: '兼职待退款列表' })).toBeVisible()
    expect(document.querySelectorAll('[data-page-pattern]')).toHaveLength(1)
    expect(
      (document.querySelector('[data-page-pattern]') as HTMLElement).getAttribute(
        'data-page-pattern'
      )
    ).toBe('list-page')

    fireEvent.click(screen.getByRole('button', { name: '人员与时薪' }))
    expect(screen.getByRole('heading', { level: 2, name: '兼职人员' })).toBeVisible()
    expect(screen.getByRole('toolbar', { name: '兼职人员列表工具' })).toBeVisible()
    expect(document.querySelectorAll('[data-page-pattern]')).toHaveLength(0)
  })
})

describe('工资页面级骨架', () => {
  it('工资结算页签由 list-page 根自载页头、Tab 与首个内容区', () => {
    render(<SettlementsPage />)

    const root = document.querySelector('[data-page-pattern]') as HTMLElement
    expect(root).not.toBeNull()
    const header = within(root).getByRole('heading', { level: 1, name: '工资' }).closest('header')
    const tabs = within(root).getByRole('navigation', { name: '工资工作视图' })
    const table = within(root).getByRole('table', { name: '工资结算列表' })

    expect(header).not.toBeNull()
    expect(within(header!).getByRole('group', { name: '工资页面动作' })).toBeVisible()
    expect(header!.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(tabs.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('工资页保持统一页头说明与页面级 Tab，列表内容区不重复二级区块标题', () => {
    render(<SettlementsPage />)

    const root = document.querySelector('[data-page-pattern]') as HTMLElement
    const header = within(root).getByRole('heading', { level: 1, name: '工资' }).closest('header')
    expect(screen.getByText('2 位人员')).toBeVisible()
    expect(
      screen.getByText(
        '负责人确认实际工资；已确认工资后发现的不合格，不回写历史实发，改由负责人单独处理退款。'
      )
    ).toBeVisible()
    expect(within(header!).getByRole('group', { name: '工资页面动作' })).toBeVisible()
    expect(within(root).getByRole('navigation', { name: '工资工作视图' })).toBeVisible()
    expect(
      screen.queryByRole('heading', { level: 2, name: '工资结算记录' })
    ).not.toBeInTheDocument()
  })

  it('切换工资工作视图后重挂载唯一 Pattern 根或嵌入区，可往返回到结算列表', () => {
    render(<SettlementsPage />)

    fireEvent.click(screen.getByRole('button', { name: '人员与时薪' }))
    expect(screen.getByRole('heading', { level: 2, name: '兼职人员' })).toBeVisible()
    expect(document.querySelectorAll('[data-page-pattern]')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: '工资结算' }))
    expect(screen.getByRole('table', { name: '工资结算列表' })).toBeVisible()
    expect(document.querySelectorAll('[data-page-pattern]')).toHaveLength(1)
    expect(
      (document.querySelector('[data-page-pattern]') as HTMLElement).getAttribute(
        'data-page-pattern'
      )
    ).toBe('list-page')
  })
})

describe('工资列表页面', () => {
  it('使用统一工具条、具名记录表和状态筛选，不以编辑表单作为列表首屏', () => {
    render(<SettlementsPage />)

    expect(screen.getByRole('toolbar', { name: '工资结算列表工具' })).toBeVisible()
    expect(screen.getByRole('table', { name: '工资结算列表' })).toBeVisible()
    expect(screen.getByText('共 2 笔结算')).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: '搜索工资结算' }), {
      target: { value: '小夏' }
    })
    expect(screen.queryByText('小林')).not.toBeInTheDocument()
    expect(screen.getByText('小夏')).toBeVisible()
    expect(screen.getByText('共 1 笔结算')).toBeVisible()
  })

  it('工资结算为空时仍保留工具条、统计与具名空表状态', () => {
    const originalSettlements = mocks.settlements
    mocks.settlements = []

    try {
      render(<SettlementsPage />)

      const toolbar = screen.getByRole('toolbar', { name: '工资结算列表工具' })
      expect(within(toolbar).getByText('共 0 笔结算')).toBeVisible()
      expect(screen.getByRole('table', { name: '工资结算列表' })).toBeVisible()
      expect(screen.getByText('尚未建立工资结算。')).toBeVisible()
    } finally {
      mocks.settlements = originalSettlements
    }
  })

  it('结算详情使用共享经营摘要与具名来源表，不保留结算私有指标卡片和来源列表', async () => {
    render(<SettlementsPage />)

    fireEvent.click(screen.getByRole('button', { name: '查看结算详情：小林' }))

    expect(await screen.findByRole('region', { name: '工资结算摘要' })).toHaveClass(
      'yumi-record-summary'
    )
    expect(screen.getByRole('region', { name: '工资结算经营摘要' })).toHaveClass(
      'yumi-metric-strip'
    )
    expect(screen.getByRole('table', { name: '制作结果来源记录' })).toBeVisible()
    expect(screen.getByRole('table', { name: '计时来源记录' })).toBeVisible()
    expect(screen.getByRole('table', { name: '扣款来源记录' })).toBeVisible()
    expect(document.querySelector('.yumi-settlement-detail__header')).not.toBeInTheDocument()
    expect(screen.getByRole('table', { name: '制作结果来源记录' })).toHaveTextContent(
      '2026-09-03 · 合格 2 件 · 不合格 1 件 · 冻结提成 ¥12.50 / 件 · 制作提成 ¥25.00 · 材料成本扣款 ¥17.50'
    )
    expect(screen.getByRole('table', { name: '扣款来源记录' })).toHaveTextContent(
      '制作不合格 1 件 · 材料成本扣款 ¥17.50 · 本期抵扣 ¥15.00'
    )
    expect(screen.queryByText('本期无已确认制作结果。')).not.toBeInTheDocument()
    expect(screen.queryByText('本期无不合格材料扣款。')).not.toBeInTheDocument()
    // 页面不再要求负责人填写整周期考勤分钟，也不展示排班/考勤两套参考。
    expect(screen.queryByRole('textbox', { name: '考勤总分钟' })).not.toBeInTheDocument()
    expect(screen.queryByText('排班口径')).not.toBeInTheDocument()
    expect(screen.queryByText('考勤口径')).not.toBeInTheDocument()
    expect(document.querySelector('.yumi-settlement-reference-grid')).not.toBeInTheDocument()
    expect(document.querySelector('.yumi-source-list')).not.toBeInTheDocument()
  })

  it('人员与时薪作为工资下的嵌入记录区，不重复渲染二级页面头', () => {
    render(<SettlementsPage />)

    fireEvent.click(screen.getByRole('button', { name: '人员与时薪' }))

    expect(screen.getByRole('heading', { level: 1, name: '工资' })).toBeVisible()
    expect(screen.getByRole('heading', { level: 2, name: '兼职人员' })).toBeVisible()
    expect(screen.queryByRole('heading', { level: 1, name: '兼职人员' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增人员' })).toBeVisible()
    expect(screen.getByRole('toolbar', { name: '兼职人员列表工具' })).toBeVisible()
  })

  it('登记兼职退款先说明会改变的记录，最终确认后才写入退款', async () => {
    render(<SettlementsPage />)

    fireEvent.click(screen.getByRole('button', { name: '待退款 1' }))
    expect(
      screen.getByText(
        '只列出已确认工资后才发现的不合格；负责人登记实际收到的退款，原工资记录保持不变。'
      )
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '处理退款：小林' }))
    expect(screen.getByRole('dialog', { name: '登记兼职退款' })).toHaveTextContent(
      '原结算不会被改写'
    )

    fireEvent.change(screen.getByRole('textbox', { name: '实际退款金额（元）' }), {
      target: { value: '8' }
    })
    fireEvent.click(screen.getByRole('button', { name: '确认退款' }))

    expect(
      await screen.findByRole('alertdialog', { name: '确认登记兼职退款？' })
    ).toHaveTextContent('会将本笔待退款标为已退款，原工资结算保持不变')
    expect(mocks.resolveRefund).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '确认登记退款' }))
    await waitFor(() =>
      expect(mocks.resolveRefund).toHaveBeenCalledWith('refund-1', {
        actualRefundCents: 800,
        refundedOn: expect.any(String),
        managerNote: null
      })
    )
  })
})

describe('工资退款与嵌入边界（Task 4）', () => {
  it('登记退款金额非法时错误落在字段消息槽，不弹出确认也不进入横幅', async () => {
    render(<SettlementsPage />)

    fireEvent.click(screen.getByRole('button', { name: '待退款 1' }))
    fireEvent.click(screen.getByRole('button', { name: '处理退款：小林' }))

    fireEvent.change(screen.getByRole('textbox', { name: '实际退款金额（元）' }), {
      target: { value: '0' }
    })
    fireEvent.click(screen.getByRole('button', { name: '确认退款' }))
    expect(screen.getByText('请填写实际退款金额。')).toBeVisible()

    fireEvent.change(screen.getByRole('textbox', { name: '实际退款金额（元）' }), {
      target: { value: '15' }
    })
    fireEvent.click(screen.getByRole('button', { name: '确认退款' }))
    expect(screen.getByText('实际退款不能超过待退款金额。')).toBeVisible()
    expect(
      screen.queryByRole('alertdialog', { name: '确认登记兼职退款？' })
    ).not.toBeInTheDocument()
    expect(mocks.resolveRefund).not.toHaveBeenCalled()
  })

  it('人员与时薪嵌入工资页没有第二页面表面，仅保留唯一的页面根', () => {
    render(<SettlementsPage />)

    fireEvent.click(screen.getByRole('button', { name: '人员与时薪' }))
    expect(screen.getByRole('heading', { level: 2, name: '兼职人员' })).toBeVisible()

    const pages = document.querySelectorAll('.yumi-page')
    expect(pages).toHaveLength(1)
    expect(document.querySelector('[data-page-pattern]')).toBeNull()
    expect(document.querySelector('.yumi-workers-workspace')).not.toHaveClass('yumi-page')
    expect(document.querySelector('.yumi-workers-workspace > .yumi-page-header')).toBeNull()
  })
})
