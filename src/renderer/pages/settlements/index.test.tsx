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

describe('工资页面级骨架', () => {
  it('工资页使用统一页面容器承接页头、Tab 与首个内容区', () => {
    render(<SettlementsPage />)

    const header = screen.getByRole('heading', { level: 1, name: '工资' }).closest('header')
    expect(screen.getByText('2 位人员')).toBeVisible()
    const workspace = header?.closest('.yumi-page')
    const tabs = screen.getByRole('navigation', { name: '工资工作视图' })
    const firstSection = screen.getByRole('heading', { level: 2, name: '工资结算记录' })

    expect(workspace).toBeInTheDocument()
    expect(workspace).toHaveClass('yumi-settlements-workspace')
    expect(workspace?.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      tabs.compareDocumentPosition(firstSection) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('工资页保持统一页头说明与页面级 Tab，内容区不重复渲染二级页头', () => {
    render(<SettlementsPage />)

    const header = screen.getByRole('heading', { level: 1, name: '工资' }).closest('header')
    expect(screen.getByText('2 位人员')).toBeVisible()
    const tabs = screen.getByRole('navigation', { name: '工资工作视图' })
    const firstSection = screen.getByRole('heading', { level: 2, name: '工资结算记录' })
    expect(header).not.toBeNull()
    expect(
      screen.getByText(
        '负责人确认实际工资；已确认工资后发现的不合格，不回写历史实发，改由负责人单独处理退款。'
      )
    ).toBeVisible()
    expect(within(header!).getByRole('group', { name: '工资页面动作' })).toBeVisible()
    expect(header!.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      tabs.compareDocumentPosition(firstSection) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('切换工资工作视图后页头动作组仍固定在页头，Tab 不进入内容区', () => {
    render(<SettlementsPage />)

    const header = screen.getByRole('heading', { level: 1, name: '工资' }).closest('header')
    expect(screen.getByText('2 位人员')).toBeVisible()
    const tabs = screen.getByRole('navigation', { name: '工资工作视图' })
    const actionGroup = within(header!).getByRole('group', { name: '工资页面动作' })

    fireEvent.click(within(tabs).getByRole('button', { name: '人员与时薪' }))

    const contentHeading = screen.getByRole('heading', { level: 2, name: '兼职人员' })
    expect(within(header!).getByRole('group', { name: '工资页面动作' })).toBe(actionGroup)
    expect(header!.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      tabs.compareDocumentPosition(contentHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(within(tabs).getByRole('button', { name: '人员与时薪' })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })
})

describe('工资列表页面', () => {
  it('使用统一工具条、具名记录表和状态筛选，不以编辑表单作为列表首屏', () => {
    render(<SettlementsPage />)

    expect(screen.getByRole('heading', { level: 2, name: '工资结算记录' })).toBeVisible()
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
    expect(screen.getByRole('heading', { level: 2, name: '待退款记录' })).toBeVisible()
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
