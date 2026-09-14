/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createMoneyCalculationResult,
  groupNode,
  subtractNode,
  sumNode,
  variableNode
} from '@shared/calculations'
import { YumiCalculatedAmount } from './yumi-calculated-amount'

afterEach(cleanup)

function buildProfitCalculation(profitCents: number) {
  return createMoneyCalculationResult({
    formulaId: 'product.expected_profit',
    formulaVersion: 1,
    label: '预计单件利润',
    node: subtractNode(
      variableNode({ key: 'price', label: '默认售价', unit: 'cents', value: 3_500 }),
      variableNode({
        key: 'cost',
        label: '预计单件成本',
        unit: 'cents',
        value: 3_500 - profitCents
      })
    )
  })
}

describe('YumiCalculatedAmount', () => {
  it('展示业务名称、金额结果、公式主干与代入值，并提供完整可访问名称', () => {
    render(<YumiCalculatedAmount calculation={buildProfitCalculation(1_342)} density="compact" />)

    const region = screen.getByRole('group', { name: /预计单件利润/ })
    expect(within(region).getByText('预计单件利润')).toBeVisible()
    expect(within(region).getByText('¥13.42')).toBeVisible()
    expect(within(region).getByText('默认售价 − 预计单件成本')).toBeVisible()
    expect(within(region).getByText('35.00 − 21.58 = 13.42')).toBeVisible()
    expect(region).toHaveAttribute(
      'aria-label',
      '预计单件利润：¥13.42；公式：默认售价 − 预计单件成本；代入：35.00 − 21.58 = 13.42'
    )
    expect(region).toHaveClass('yumi-calculated-amount', 'yumi-calculated-amount--compact')
  })

  it('利润语义下负利润使用危险色调并保留负号文本', () => {
    render(<YumiCalculatedAmount calculation={buildProfitCalculation(-658)} tone="profit" />)

    const value = screen.getByText('-¥6.58')
    expect(value).toBeVisible()
    expect(value).toHaveClass('yumi-calculated-amount__value--loss')
    expect(screen.getByRole('group', { name: /预计单件利润：-¥6.58/ })).toBeVisible()
  })

  it('利润语义下正利润使用成功色调', () => {
    render(<YumiCalculatedAmount calculation={buildProfitCalculation(1_342)} tone="profit" />)

    expect(screen.getByText('¥13.42')).toHaveClass('yumi-calculated-amount__value--profit')
  })

  it('金额结果默认不使用盈亏色调，仅保留等宽金额文本', () => {
    render(<YumiCalculatedAmount calculation={buildProfitCalculation(-658)} />)

    const value = screen.getByText('-¥6.58')
    expect(value).toHaveClass('yumi-calculated-amount__value--default')
  })

  it('不可计算比例显示占位符并说明原因，不产生 Infinity 或 NaN', () => {
    render(
      <YumiCalculatedAmount
        calculation={{
          formulaId: 'product.expected_profit_rate',
          formulaVersion: 1,
          label: '预计利润率',
          status: 'not_computable',
          basisPoints: null,
          display: '—',
          expression: '预计单件利润 ÷ 默认售价',
          substitutedExpression: '13.42 ÷ 0.00 = —',
          notes: ['默认售价为零，无法计算利润率']
        }}
      />
    )

    const region = screen.getByRole('group', { name: /预计利润率/ })
    expect(within(region).getByText('—')).toBeVisible()
    expect(within(region).getByText('默认售价为零，无法计算利润率')).toBeVisible()
    expect(region).toHaveAttribute(
      'aria-label',
      '预计利润率：—；公式：预计单件利润 ÷ 默认售价；默认售价为零，无法计算利润率'
    )
    expect(region.textContent).not.toContain('Infinity')
    expect(region.textContent).not.toContain('NaN')
  })

  it('按需展开组成明细，且明细金额与公式来自计算结果本身', () => {
    const calculation = createMoneyCalculationResult({
      formulaId: 'product.expected_cost',
      formulaVersion: 1,
      label: '预计单件成本',
      node: sumNode([
        groupNode(
          '预计单件材料成本',
          variableNode({ key: 'material', label: '材料成本', unit: 'cents', value: 850 })
        ),
        variableNode({ key: 'packaging', label: '包装成本', unit: 'cents', value: 20 })
      ])
    })

    const { rerender } = render(<YumiCalculatedAmount calculation={calculation} />)
    expect(screen.queryByText('预计单件材料成本')).not.toBeInTheDocument()

    rerender(<YumiCalculatedAmount calculation={calculation} showBreakdown />)
    const breakdownLabel = screen.getByText('预计单件材料成本')
    const breakdownItem = breakdownLabel.closest('.yumi-calculated-amount__breakdown-item')
    expect(breakdownItem).not.toBeNull()
    expect(within(breakdownItem as HTMLElement).getByText('材料成本')).toBeVisible()
    expect(within(breakdownItem as HTMLElement).getByText('8.50 = 8.50')).toBeVisible()
    expect(screen.getByText('¥8.70')).toBeVisible()
  })
})
