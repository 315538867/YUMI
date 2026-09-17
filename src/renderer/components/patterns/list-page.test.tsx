/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiEmptyState } from '../ui/empty-state/yumi-empty-state'
import { ListPage } from './list-page'

afterEach(cleanup)

describe('P2 · List Page 结构（任务 5.2）', () => {
  const header = {
    title: '订单',
    actions: {
      ariaLabel: '订单页动作',
      primaryAction: { label: '新建订单', onClick: () => {} }
    }
  }
  const toolbar = {
    ariaLabel: '订单工具条',
    countLabel: '共 16 单',
    search: <input aria-label="搜索订单" />
  }

  it('以唯一 list-page 模式根发出紧凑密度，页头/指标/表面/工具栏按固定顺序排列', () => {
    const { container } = render(
      <ListPage
        header={header}
        metrics={{ ariaLabel: '订单摘要', items: [{ label: '未收款', value: '3' }] }}
        toolbar={toolbar}
      >
        <table aria-label="订单列表" />
      </ListPage>
    )
    const root = container.querySelector('[data-page-pattern]')
    expect(root).toHaveAttribute('data-page-pattern', 'list-page')
    expect(root).toHaveAttribute('data-density', 'compact')
    expect(container.querySelectorAll('[data-page-pattern]').length).toBe(1)

    const headerEl = container.querySelector('.yumi-page-header')
    const metricsEl = container.querySelector('.yumi-metric-strip')
    const surfaceEl = container.querySelector('.yumi-list-surface')
    const toolbarEl = container.querySelector('.yumi-list-toolbar')
    expect(headerEl).not.toBeNull()
    expect(metricsEl).not.toBeNull()
    expect(surfaceEl).not.toBeNull()
    expect(toolbarEl).not.toBeNull()

    const order = [headerEl, metricsEl, surfaceEl, toolbarEl]
    for (let index = 1; index < order.length; index += 1) {
      const relation = order[index - 1]!.compareDocumentPosition(order[index]!)
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(toolbarEl!.parentElement).toBe(surfaceEl)
  })

  it('可选指标带不传时不渲染，工具条与记录区仍完整', () => {
    const { container } = render(
      <ListPage header={header} toolbar={toolbar}>
        <span>记录区</span>
      </ListPage>
    )
    expect(container.querySelector('.yumi-metric-strip')).toBeNull()
    expect(container.querySelector('.yumi-list-toolbar')).not.toBeNull()
    expect(container.querySelector('.yumi-list-surface')).toHaveTextContent('记录区')
  })

  it('记录区承载加载/筛选无结果等空态，与工具栏同属单一列表表面', () => {
    const { container } = render(
      <ListPage header={header} toolbar={toolbar}>
        <YumiEmptyState scenario="filter" title="没有匹配的订单" />
      </ListPage>
    )
    const surfaces = container.querySelectorAll('.yumi-list-surface')
    expect(surfaces.length).toBe(1)
    const empty = container.querySelector('.yumi-empty-state')
    expect(empty).toHaveAttribute('data-scenario', 'filter')
    expect(empty!.closest('.yumi-list-surface')).toBe(surfaces[0])
  })

  it('记录区可承载加载态，页面级动作仍留在页头', () => {
    const { container } = render(
      <ListPage header={header} toolbar={toolbar}>
        <YumiEmptyState scenario="loading" title="正在加载订单" />
      </ListPage>
    )
    expect(container.querySelector('.yumi-empty-state')).toHaveAttribute('data-scenario', 'loading')
    const primary = container.querySelector('.yumi-page-actions__primary')
    expect(primary).toHaveTextContent('新建订单')
  })
})
