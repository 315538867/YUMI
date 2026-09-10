/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render as renderBase, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiNotificationProvider } from '../../components/ui'
const render = (ui: Parameters<typeof renderBase>[0]) =>
  renderBase(<YumiNotificationProvider>{ui}</YumiNotificationProvider>)
import { installDomInteractionPolyfills } from '../../test/dom'
import { today } from '../../composables/v2-utils'
import { FinancePage } from './index'

const mocks = vi.hoisted(() => ({
  loadMonthlyOverview: vi.fn(),
  reimburseBatch: vi.fn(),
  state: {
    categories: [],
    advancePayers: [],
    entries: [],
    pendingReimbursements: [],
    monthlySummary: {
      incomeCents: 50_000,
      operatingExpenseCents: 20_000,
      operatingResultCents: 30_000
    },
    loading: false,
    loadError: null,
    createManualIncome: vi.fn(),
    createManualExpense: vi.fn()
  }
}))

vi.mock('../../composables/use-finance', () => ({
  useFinance: () => ({
    ...mocks.state,
    loadMonthlyOverview: mocks.loadMonthlyOverview,
    reimburseBatch: mocks.reimburseBatch
  })
}))

installDomInteractionPolyfills()
afterEach(() => {
  cleanup()
  mocks.loadMonthlyOverview.mockReset().mockResolvedValue(undefined)
  mocks.reimburseBatch.mockReset().mockResolvedValue({ entries: [], totalAmountCents: 30_000 })
  mocks.state.entries = []
  mocks.state.pendingReimbursements = []
  mocks.state.monthlySummary = {
    incomeCents: 50_000,
    operatingExpenseCents: 20_000,
    operatingResultCents: 30_000
  }
})

describe('财务负责人工作区', () => {
  it('经营结果只呈现经营收入和支出，报销付款不重复计入经营支出', async () => {
    render(<FinancePage />)

    expect(await screen.findByText('实际收入')).toBeVisible()
    expect(screen.getByText('实际收入').parentElement).toHaveTextContent('¥500.00')
    expect(screen.getByText('经营支出').parentElement).toHaveTextContent('¥200.00')
    expect(screen.getByText('经营结果').parentElement).toHaveTextContent('¥300.00')
    expect(screen.getByText(/报销付款不重复计入经营支出/)).toBeVisible()
  })

  it('负责人可在同一待报销列表选择多笔后，以单次确认原子提交', async () => {
    mocks.state.pendingReimbursements = [
      {
        financialEntryId: 'advance-1',
        amountCents: 10_000,
        occurredOn: '2026-09-02',
        categoryId: 'expense-1',
        categoryName: '包装材料',
        advancePayerId: 'payer-1',
        advancePayerName: '小林',
        note: '第一笔'
      },
      {
        financialEntryId: 'advance-2',
        amountCents: 20_000,
        occurredOn: '2026-09-03',
        categoryId: 'expense-1',
        categoryName: '包装材料',
        advancePayerId: 'payer-1',
        advancePayerName: '小林',
        note: '第二笔'
      }
    ]
    render(<FinancePage />)

    fireEvent.click(screen.getByRole('button', { name: '待报销' }))
    expect(await screen.findByText(/第一笔/)).toBeVisible()
    for (const button of screen.getAllByRole('button', { name: '选择' })) fireEvent.click(button)
    fireEvent.click(screen.getByRole('button', { name: '批量报销（已选择 2 笔）' }))

    const sheet = screen.getByRole('dialog', { name: '确认批量报销' })
    expect(sheet).toHaveTextContent(
      '本次将报销 2 笔私人垫付，合计 ¥300.00。任一记录已被报销或无效时，本次不会产生部分报销。'
    )
    fireEvent.change(screen.getByRole('textbox', { name: '报销支付方式' }), {
      target: { value: '公账转账' }
    })
    fireEvent.click(screen.getByRole('button', { name: '确认批量报销' }))

    await waitFor(() =>
      expect(mocks.reimburseBatch).toHaveBeenCalledWith({
        advanceFinancialEntryIds: ['advance-1', 'advance-2'],
        reimbursedOn: today(),
        paymentMethod: '公账转账',
        note: null
      })
    )
  })
})
