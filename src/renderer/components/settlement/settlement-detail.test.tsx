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
    timedWageCents: 12_000,
    commissionCents: 7_700,
    materialDeductionCents: 17,
    adjustmentCents: -1_500,
    otherAdjustmentCents: 0,
    candidateWageCents: 18_183,
    currentDeductionCents: 17,
    carriedDeductionCents: 0,
    actualDeductionCents: 17,
    continuingCarryoverCents: 0,
    finalPaidAmountCents: null,
    paidOn: '2026-09-08',
    managerNote: null,
    financialEntryId: null,
    createdAt: iso,
    updatedAt: iso,
    makingSources: [
      {
        id: 'making-1',
        processTaskId: 'task-making',
        qualityInspectionId: 'inspection-1',
        orderId: 'order-1',
        orderItemId: 'item-1',
        occurredOn: '2026-09-03',
        qualifiedQuantity: 20,
        unqualifiedQuantity: 2,
        pieceRateCents: 300,
        qualifiedCommissionCents: 6_000,
        materialDeductionCents: 17,
        status: 'draft',
        createdAt: iso
      }
    ],
    timedSources: [
      {
        id: 'timed-1',
        workTimeReviewId: 'review-1',
        processType: 'fluffing_bagging',
        occurredOn: '2026-09-04',
        approvedMinutes: 240,
        hourlyWageCentsSnapshot: 3_000,
        timedWageCents: 12_000,
        commissionCents: 1_700,
        status: 'draft',
        items: [
          {
            id: 'timed-item-1',
            workTimeReviewItemId: 'review-item-1',
            processTaskId: 'task-fluffing',
            orderItemId: 'item-1',
            completedQuantity: 20,
            pieceRateCents: 85,
            commissionCents: 1_700
          }
        ],
        createdAt: iso
      }
    ],
    adjustments: [
      {
        id: 'adjustment-1',
        workTimeReviewId: 'review-original',
        originalSettlementId: 'settlement-original',
        processType: 'packing',
        originalMinutes: 240,
        correctedMinutes: 210,
        hourlyWageCentsSnapshot: 3_000,
        amountCents: -1_500,
        reason: '时长录错',
        note: null,
        status: 'draft',
        createdAt: iso
      }
    ],
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
    const confirmSettlement = vi.fn().mockResolvedValue({
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
    // 页面不再要求负责人填写整周期考勤分钟。
    expect(screen.queryByRole('textbox', { name: '考勤总分钟' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('考勤备注')).not.toBeInTheDocument()
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

  it('按工序展示核算分钟、时薪快照、计时工资与提成，并展示材料扣款与来源调整', () => {
    render(
      <SettlementDetail
        confirmSettlement={vi.fn()}
        settlement={settlement()}
        updateDraft={vi.fn()}
        workerName="小林"
      />
    )

    const summary = screen.getByRole('region', { name: '工资结算经营摘要' })
    expect(summary).toHaveTextContent('计时工资')
    expect(summary).toHaveTextContent('¥120.00')
    expect(summary).toHaveTextContent('计件提成')
    expect(summary).toHaveTextContent('¥77.00')
    expect(summary).toHaveTextContent('¥0.17')
    expect(summary).toHaveTextContent('-¥15.00')
    expect(summary).toHaveTextContent('¥181.83')

    const makingTable = screen.getByRole('table', { name: '制作结果来源记录' })
    expect(makingTable).toHaveTextContent('2026-09-03 · 合格 20 件 · 不合格 2 件')
    expect(makingTable).toHaveTextContent('冻结提成 ¥3.00 / 件')
    expect(makingTable).toHaveTextContent('制作提成 ¥60.00')
    expect(makingTable).toHaveTextContent('材料成本扣款 ¥0.17')

    const timedTable = screen.getByRole('table', { name: '计时来源记录' })
    expect(timedTable).toHaveTextContent('捏毛装袋')
    expect(timedTable).toHaveTextContent('核算 240 分钟')
    expect(timedTable).toHaveTextContent('冻结时薪 ¥30.00 / 小时')
    expect(timedTable).toHaveTextContent('计时工资 ¥120.00')
    expect(timedTable).toHaveTextContent('商品完成明细：¥0.85 / 件 × 20 件 = ¥17.00')

    const adjustmentTable = screen.getByRole('table', { name: '来源关联调整记录' })
    expect(adjustmentTable).toHaveTextContent('原核算 240 分钟 → 更正 210 分钟')
    expect(adjustmentTable).toHaveTextContent('调整金额 -¥15.00')
    expect(adjustmentTable).toHaveTextContent('原因：时长录错')
  })

  it('已确认结算只读展示负责人实发与实际工资流水，且不提供工时更正入口', () => {
    render(
      <SettlementDetail
        addWorkTimeAdjustment={vi.fn()}
        adjustableReviews={[{ id: 'review-1', label: '2026-09-04 · 捏毛装袋 · 240 分钟' }]}
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

    expect(screen.getByRole('textbox', { name: '最终实发（元）' })).toHaveValue('135.00')
    expect(screen.getByText('实际工资流水：finance-wage-1')).toBeVisible()
    expect(screen.queryByRole('button', { name: '确认并记账' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '建立来源调整' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '原已结算工时' })).not.toBeInTheDocument()
  })

  it('草稿结算中可对已结算工时建立来源关联的正负调整', async () => {
    const detail = settlement()
    const updateDraft = vi.fn().mockResolvedValue(detail)
    const addWorkTimeAdjustment = vi.fn().mockResolvedValue(detail)
    render(
      <SettlementDetail
        addWorkTimeAdjustment={addWorkTimeAdjustment}
        adjustableReviews={[{ id: 'review-original', label: '2026-09-04 · 打包发货 · 240 分钟' }]}
        confirmSettlement={vi.fn()}
        settlement={detail}
        updateDraft={updateDraft}
        workerName="小林"
      />
    )

    fireEvent.click(screen.getByRole('combobox', { name: '原已结算工时' }))
    fireEvent.click(await screen.findByRole('option', { name: '2026-09-04 · 打包发货 · 240 分钟' }))
    fireEvent.change(screen.getByRole('textbox', { name: '更正核算分钟' }), {
      target: { value: '210' }
    })
    fireEvent.change(screen.getByRole('textbox', { name: '更正原因' }), {
      target: { value: '按打卡更正' }
    })
    fireEvent.click(screen.getByRole('button', { name: '建立来源调整' }))

    await waitFor(() =>
      expect(addWorkTimeAdjustment).toHaveBeenCalledWith('settlement-1', {
        workTimeReviewId: 'review-original',
        correctedMinutes: 210,
        reason: '按打卡更正',
        note: null
      })
    )
  })
})
