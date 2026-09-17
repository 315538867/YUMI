/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReviewWorkspace } from './review-workspace'

afterEach(cleanup)

describe('P2 · Review Workspace 结构（任务 5.6）', () => {
  const header = { title: '待核算' }

  it('以唯一 review-workspace 模式根发出紧凑密度，选择摘要/队列/处理入口按固定顺序排列', () => {
    const { container } = render(
      <ReviewWorkspace
        header={header}
        selectionSummary={<span>已选 2 条</span>}
        queue={<section>统一队列</section>}
      >
        <section>处理入口</section>
      </ReviewWorkspace>
    )
    const root = container.querySelector('[data-page-pattern]')
    expect(root).toHaveAttribute('data-page-pattern', 'review-workspace')
    expect(root).toHaveAttribute('data-density', 'compact')
    expect(container.querySelectorAll('[data-page-pattern]').length).toBe(1)

    const headerEl = container.querySelector('.yumi-page-header')
    const selectionEl = container.querySelector('.yumi-review-workspace__selection')
    const queueEl = container.querySelector('.yumi-review-workspace__queue')
    const processingEl = container.querySelector('.yumi-review-workspace__processing')
    expect(headerEl).not.toBeNull()
    expect(selectionEl).toHaveTextContent('已选 2 条')
    expect(queueEl).toHaveTextContent('统一队列')
    expect(processingEl).toHaveTextContent('处理入口')

    const order = [headerEl, selectionEl, queueEl, processingEl]
    for (let index = 1; index < order.length; index += 1) {
      const relation = order[index - 1]!.compareDocumentPosition(order[index]!)
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('处理入口承载短任务/长任务分流，两个面板同属处理区域', () => {
    const { container } = render(
      <ReviewWorkspace header={header} queue={<section>统一队列</section>}>
        <section aria-label="短任务核对">短任务</section>
        <section aria-label="长任务核算">长任务</section>
      </ReviewWorkspace>
    )
    const processing = container.querySelector('.yumi-review-workspace__processing')
    expect(processing).toHaveTextContent('短任务')
    expect(processing).toHaveTextContent('长任务')
  })

  it('选择摘要可省略，队列与处理入口仍完整', () => {
    const { container } = render(
      <ReviewWorkspace header={header} queue={<section>统一队列</section>}>
        <section>处理入口</section>
      </ReviewWorkspace>
    )
    expect(container.querySelector('.yumi-review-workspace__selection')).toBeNull()
    expect(container.querySelector('.yumi-review-workspace__queue')).toHaveTextContent('统一队列')
    expect(container.querySelector('.yumi-review-workspace__processing')).toHaveTextContent(
      '处理入口'
    )
  })
})
