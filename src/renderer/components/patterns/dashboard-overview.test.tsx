/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DashboardOverview } from './dashboard-overview'

afterEach(cleanup)

describe('P2 · Dashboard Overview 结构（任务 5.5）', () => {
  const header = { title: '经营工作台' }

  it('以唯一 dashboard-overview 模式根发出标准密度，期间工具栏/指标/洞察/明细按固定顺序排列', () => {
    const { container } = render(
      <DashboardOverview
        header={header}
        toolbar={<select aria-label="选择期间" />}
        metrics={{ ariaLabel: '经营摘要', items: [{ label: '本月营收', value: '¥120,000' }] }}
        insights={<section>主要洞察</section>}
      >
        <section>下钻明细</section>
      </DashboardOverview>
    )
    const root = container.querySelector('[data-page-pattern]')
    expect(root).toHaveAttribute('data-page-pattern', 'dashboard-overview')
    expect(root).toHaveAttribute('data-density', 'standard')
    expect(container.querySelectorAll('[data-page-pattern]').length).toBe(1)

    const headerEl = container.querySelector('.yumi-page-header')
    const toolbarEl = container.querySelector('.yumi-dashboard-overview__toolbar')
    const metricsEl = container.querySelector('.yumi-metric-strip')
    const insightsEl = container.querySelector('.yumi-dashboard-overview__insights')
    const detailsEl = container.querySelector('.yumi-dashboard-overview__details')
    expect(headerEl).not.toBeNull()
    expect(toolbarEl).not.toBeNull()
    expect(metricsEl).not.toBeNull()
    expect(insightsEl).not.toBeNull()
    expect(detailsEl).toHaveTextContent('下钻明细')

    const order = [headerEl, toolbarEl, metricsEl, insightsEl, detailsEl]
    for (let index = 1; index < order.length; index += 1) {
      const relation = order[index - 1]!.compareDocumentPosition(order[index]!)
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('极端数值在指标带中原样呈现，不被截断或折叠', () => {
    const { container } = render(
      <DashboardOverview
        header={header}
        metrics={{
          ariaLabel: '经营摘要',
          items: [
            { label: '极贵商品', value: '¥9,999,999.99' },
            { label: '一分钱商品', value: '¥0.01' }
          ]
        }}
      >
        <section>下钻明细</section>
      </DashboardOverview>
    )
    const values = container.querySelectorAll('.yumi-metric-strip dd')
    expect(values[0]).toHaveTextContent('¥9,999,999.99')
    expect(values[1]).toHaveTextContent('¥0.01')
  })

  it('期间工具栏与洞察区可省略，指标与明细仍完整', () => {
    const { container } = render(
      <DashboardOverview
        header={header}
        metrics={{ ariaLabel: '经营摘要', items: [{ label: '营收', value: '¥1' }] }}
      >
        <section>下钻明细</section>
      </DashboardOverview>
    )
    expect(container.querySelector('.yumi-dashboard-overview__toolbar')).toBeNull()
    expect(container.querySelector('.yumi-dashboard-overview__insights')).toBeNull()
    expect(container.querySelector('.yumi-metric-strip')).not.toBeNull()
    expect(container.querySelector('.yumi-dashboard-overview__details')).toHaveTextContent(
      '下钻明细'
    )
  })

  it('指标带可省略（加载等无指标状态），页头与明细仍完整', () => {
    const { container } = render(
      <DashboardOverview header={header}>
        <section>加载占位</section>
      </DashboardOverview>
    )
    expect(container.querySelector('.yumi-metric-strip')).toBeNull()
    expect(container.querySelector('.yumi-dashboard-overview__toolbar')).toBeNull()
    expect(container.querySelector('.yumi-page-header')).not.toBeNull()
    expect(container.querySelector('.yumi-dashboard-overview__details')).toHaveTextContent(
      '加载占位'
    )
  })
})
