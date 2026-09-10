/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render as renderBase, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiNotificationProvider } from '../ui'
const render = (ui: Parameters<typeof renderBase>[0]) =>
  renderBase(<YumiNotificationProvider>{ui}</YumiNotificationProvider>)
import type { V2WorkerSettlementDetail } from '@shared/contracts/index'
import { installDomInteractionPolyfills } from '../../test/dom'
import { SettlementDetail } from './settlement-detail'

const iso = '2026-09-08T10:00:00.000Z'

function settlement(overrides: Partial<V2WorkerSettlementDetail> = {}): V2WorkerSettlementDetail {
  return {
    id: 'settlement-1',
    workerId: 'worker-1',
    periodStartOn: '2026-09-01',
    periodEndOn: '2026-09-07',
    status: 'draft',
    scheduledMinutes: 360,
    attendanceMinutes: 420,
    attendanceNote: '考勤机记录供参考',
    scheduledReferenceWageCents: 12_000,
    attendanceReferenceWageCents: 14_000,
    qualifiedCommissionCents: 1_200,
    currentDeductionCents: 0,
    carriedDeductionCents: 0,
    actualDeductionCents: 0,
    continuingCarryoverCents: 0,
    otherAdjustmentCents: 0,
    finalPaidAmountCents: null,
    paidOn: '2026-09-08',
    managerNote: null,
    financialEntryId: null,
    createdAt: iso,
    updatedAt: iso,
    tasks: [],
    deductions: [],
    deductionAllocations: [],
    ...overrides
  }
}

installDomInteractionPolyfills()
afterEach(cleanup)

describe('工资负责人确认', () => {
  it('仅在负责人填入实发金额和付款日期后允许确认，并先保存草稿再确认记账', async () => {
    const detail = settlement()
    const updateDraft = vi.fn().mockResolvedValue(detail)
    const confirmSettlement = vi
      .fn()
      .mockResolvedValue({
        ...detail,
        status: 'confirmed',
        finalPaidAmountCents: 13_500,
        financialEntryId: 'finance-1'
      })

    render(
      <SettlementDetail
        confirmSettlement={confirmSettlement}
        settlement={detail}
        updateDraft={updateDraft}
        workerName="小林"
      />
    )

    const confirmButton = screen.getByRole('button', { name: '确认并记账' })
    expect(confirmButton).toBeDisabled()
    expect(screen.getByRole('button', { name: '实际付款日期' })).toHaveTextContent('2026/9/8')

    fireEvent.change(screen.getByRole('textbox', { name: '最终实发（元）' }), {
      target: { value: '135' }
    })

    expect(confirmButton).toBeEnabled()
    fireEvent.click(confirmButton)
    expect(screen.getByRole('heading', { name: '确认工资结算并记账？' })).toBeVisible()
    expect(updateDraft).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '确认记账' }))

    await waitFor(() =>
      expect(updateDraft).toHaveBeenCalledWith(
        'settlement-1',
        expect.objectContaining({
          finalPaidAmountCents: 13_500,
          paidOn: '2026-09-08'
        })
      )
    )
    await waitFor(() => expect(confirmSettlement).toHaveBeenCalledWith('settlement-1'))
  })

  it('其他调整允许负责人输入负金额，但其它实发金额仍保持非负校验', async () => {
    const detail = settlement()
    const updateDraft = vi.fn().mockResolvedValue(detail)
    render(
      <SettlementDetail
        confirmSettlement={vi.fn()}
        settlement={detail}
        updateDraft={updateDraft}
        workerName="小林"
      />
    )

    fireEvent.change(screen.getByRole('textbox', { name: '其他调整（元）' }), {
      target: { value: '-12.34' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))

    await waitFor(() =>
      expect(updateDraft).toHaveBeenCalledWith(
        'settlement-1',
        expect.objectContaining({
          otherAdjustmentCents: -1_234
        })
      )
    )
  })

  it('将排班与考勤工资分别作为参考展示，已确认结算只展示负责人实发和实际工资流水', () => {
    render(
      <SettlementDetail
        confirmSettlement={vi.fn()}
        settlement={settlement({
          status: 'confirmed',
          finalPaidAmountCents: 13_500,
          financialEntryId: 'finance-wage-1'
        })}
        updateDraft={vi.fn()}
        workerName="小林"
      />
    )

    expect(screen.getByText('排班口径').closest('article')).toHaveTextContent('360 分钟¥120.00')
    expect(screen.getByText('考勤口径').closest('article')).toHaveTextContent('420 分钟¥140.00')
    expect(screen.getByRole('textbox', { name: '最终实发（元）' })).toHaveValue('135.00')
    expect(screen.getByText('实际工资流水：finance-wage-1')).toBeVisible()
    expect(screen.queryByRole('button', { name: '确认并记账' })).not.toBeInTheDocument()
    expect(screen.queryByText('¥260.00')).not.toBeInTheDocument()
  })
})
