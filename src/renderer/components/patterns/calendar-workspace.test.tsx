/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CalendarWorkspace } from './calendar-workspace'

afterEach(cleanup)

describe('P2 · Calendar Workspace 结构（任务 5.7）', () => {
  const header = { title: '排班' }

  it('以唯一 calendar-workspace 模式根发出紧凑密度，工具栏/日历网格/浮层按固定顺序排列', () => {
    const { container } = render(
      <CalendarWorkspace
        header={header}
        toolbar={<select aria-label="切换周" />}
        overlay={<dialog>派工浮层</dialog>}
      >
        <section aria-label="一周日历网格">七日网格</section>
      </CalendarWorkspace>
    )
    const root = container.querySelector('[data-page-pattern]')
    expect(root).toHaveAttribute('data-page-pattern', 'calendar-workspace')
    expect(root).toHaveAttribute('data-density', 'compact')
    expect(container.querySelectorAll('[data-page-pattern]').length).toBe(1)

    const headerEl = container.querySelector('.yumi-page-header')
    const toolbarEl = container.querySelector('.yumi-calendar-workspace__toolbar')
    const gridEl = container.querySelector('.yumi-calendar-workspace__grid')
    const overlayEl = container.querySelector('.yumi-calendar-workspace__overlay')
    expect(headerEl).not.toBeNull()
    expect(toolbarEl).not.toBeNull()
    expect(gridEl).toHaveTextContent('七日网格')
    expect(overlayEl).toHaveTextContent('派工浮层')

    const order = [headerEl, toolbarEl, gridEl, overlayEl]
    for (let index = 1; index < order.length; index += 1) {
      const relation = order[index - 1]!.compareDocumentPosition(order[index]!)
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('日历网格位于局部滚动区域内，页面不整体横向滚动', () => {
    const { container } = render(
      <CalendarWorkspace header={header}>
        <section aria-label="一周日历网格">七日网格</section>
      </CalendarWorkspace>
    )
    const scrollWrap = container.querySelector('.yumi-calendar-workspace__scroll')
    expect(scrollWrap).not.toBeNull()
    expect(scrollWrap!.querySelector('.yumi-calendar-workspace__grid')).not.toBeNull()
  })

  it('工具栏与浮层可省略，日历网格仍完整', () => {
    const { container } = render(
      <CalendarWorkspace header={header}>
        <section aria-label="一周日历网格">七日网格</section>
      </CalendarWorkspace>
    )
    expect(container.querySelector('.yumi-calendar-workspace__toolbar')).toBeNull()
    expect(container.querySelector('.yumi-calendar-workspace__overlay')).toBeNull()
    expect(container.querySelector('.yumi-calendar-workspace__grid')).toHaveTextContent('七日网格')
  })
})
