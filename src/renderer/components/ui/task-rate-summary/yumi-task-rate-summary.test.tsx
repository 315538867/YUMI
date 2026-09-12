/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { YumiTaskRateSummary } from './yumi-task-rate-summary'

describe('YumiTaskRateSummary', () => {
  it('将制作和捏毛装袋的任务冻结计件提成与后续商品改价边界明确展示', () => {
    const { rerender } = render(<YumiTaskRateSummary pieceRateCents={1_250} processType="making" />)

    const making = screen.getByRole('note', { name: '制作任务冻结计件提成' })
    expect(making).toHaveTextContent('¥12.50')
    expect(making).toHaveTextContent('后续商品改价不影响本任务结算')

    rerender(<YumiTaskRateSummary pieceRateCents={888} processType="fluffing_bagging" />)
    const fluffing = screen.getByRole('note', { name: '捏毛装袋任务冻结计件提成' })
    expect(fluffing).toHaveTextContent('¥8.88')
    expect(fluffing).toHaveTextContent('后续商品改价不影响本任务结算')
  })

  it('明确包装成本是物料成本，不被误呈现为打包任务的计件工资', () => {
    render(<YumiTaskRateSummary pieceRateCents={null} processType="packing" />)

    const packing = screen.getByRole('note', { name: '打包任务计件提成' })
    expect(packing).toHaveTextContent('未设置计件提成')
    expect(packing).toHaveTextContent('商品包装成本属于物料成本')
    expect(packing).toHaveTextContent('不是打包计件工资')
  })
})
