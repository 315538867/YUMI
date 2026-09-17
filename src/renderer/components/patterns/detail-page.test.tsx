/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DetailPage } from './detail-page'

afterEach(cleanup)

describe('P2 · Detail Page 结构（任务 5.3）', () => {
  const header = {
    title: '订单 #SO-2026-0001',
    navigation: { ariaLabel: '返回订单列表', label: '返回订单列表', onClick: () => {} }
  }

  it('以唯一 detail-page 模式根发出标准密度，页头/摘要/指标/导航/区块按固定顺序排列', () => {
    const { container } = render(
      <DetailPage
        header={header}
        summary={{
          ariaLabel: '客户摘要',
          eyebrow: '客户',
          title: '捏捏工作室',
          metadata: [{ label: '编号', value: 'C-001' }]
        }}
        metrics={{ ariaLabel: '订单经营摘要', items: [{ label: '未收款', value: '¥12,000' }] }}
        tabs={{
          ariaLabel: '订单视图',
          items: [
            { id: 'overview', label: '概览' },
            { id: 'funds', label: '资金' }
          ],
          onValueChange: () => {},
          value: 'overview'
        }}
      >
        <section>概览区块</section>
      </DetailPage>
    )
    const root = container.querySelector('[data-page-pattern]')
    expect(root).toHaveAttribute('data-page-pattern', 'detail-page')
    expect(root).toHaveAttribute('data-density', 'standard')
    expect(container.querySelectorAll('[data-page-pattern]').length).toBe(1)

    const headerEl = container.querySelector('.yumi-page-header')
    const summaryEl = container.querySelector('.yumi-entity-summary')
    const metricsEl = container.querySelector('.yumi-metric-strip')
    const tabsEl = container.querySelector('.yumi-primary-tabs')
    const bodyEl = container.querySelector('.yumi-detail-page__body')
    expect(headerEl).not.toBeNull()
    expect(summaryEl).not.toBeNull()
    expect(metricsEl).not.toBeNull()
    expect(tabsEl).not.toBeNull()
    expect(bodyEl).toHaveTextContent('概览区块')

    const order = [headerEl, summaryEl, metricsEl, tabsEl, bodyEl]
    for (let index = 1; index < order.length; index += 1) {
      const relation = order[index - 1]!.compareDocumentPosition(order[index]!)
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('返回上下文：页头导航动作渲染为返回按钮，点击触发回调', () => {
    const onNavigate = vi.fn()
    const { getByRole } = render(
      <DetailPage header={{ ...header, navigation: { ...header.navigation, onClick: onNavigate } }}>
        <section>详情</section>
      </DetailPage>
    )
    fireEvent.click(getByRole('button', { name: '返回订单列表' }))
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })

  it('主要导航切换：点击 Tab 触发 onValueChange', () => {
    const onValueChange = vi.fn()
    const { getByRole } = render(
      <DetailPage
        header={header}
        tabs={{
          ariaLabel: '订单视图',
          items: [
            { id: 'overview', label: '概览' },
            { id: 'funds', label: '资金' }
          ],
          onValueChange,
          value: 'overview'
        }}
      >
        <section>详情</section>
      </DetailPage>
    )
    fireEvent.click(getByRole('button', { name: '资金' }))
    expect(onValueChange).toHaveBeenCalledWith('funds')
  })

  it('摘要与指标可省略，页头与详情区块仍完整', () => {
    const { container } = render(
      <DetailPage header={header}>
        <section>详情</section>
      </DetailPage>
    )
    expect(container.querySelector('.yumi-entity-summary')).toBeNull()
    expect(container.querySelector('.yumi-metric-strip')).toBeNull()
    expect(container.querySelector('.yumi-detail-page__body')).toHaveTextContent('详情')
  })
})
