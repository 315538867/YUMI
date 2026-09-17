/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FormWorkspace } from './form-workspace'

afterEach(cleanup)

describe('P2 · Form Workspace 结构（任务 5.4）', () => {
  const header = {
    title: '新建订单',
    actions: {
      ariaLabel: '新建订单动作',
      primaryAction: { label: '保存草稿', onClick: () => {} }
    }
  }

  it('以唯一 form-workspace 模式根发出标准密度，步骤/表单/预览/固定操作按固定顺序排列', () => {
    const { container } = render(
      <FormWorkspace
        actions={<button type="submit">提交</button>}
        header={header}
        preview={<aside>订单预览</aside>}
        steps={{
          ariaLabel: '新建订单步骤',
          items: [
            { id: 'customer', label: '选择客户' },
            { id: 'lines', label: '录入商品' }
          ],
          value: 'customer'
        }}
      >
        <section>表单主区</section>
      </FormWorkspace>
    )
    const root = container.querySelector('[data-page-pattern]')
    expect(root).toHaveAttribute('data-page-pattern', 'form-workspace')
    expect(root).toHaveAttribute('data-density', 'standard')
    expect(container.querySelectorAll('[data-page-pattern]').length).toBe(1)

    const headerEl = container.querySelector('.yumi-page-header')
    const stepsEl = container.querySelector('.yumi-form-steps')
    const splitEl = container.querySelector('.yumi-split-layout')
    const asideEl = container.querySelector('.yumi-split-layout__aside')
    const actionsEl = container.querySelector('.yumi-sticky-actions')
    expect(headerEl).not.toBeNull()
    expect(stepsEl).not.toBeNull()
    expect(splitEl).not.toBeNull()
    expect(asideEl).toHaveTextContent('订单预览')
    expect(actionsEl).toHaveTextContent('提交')

    const order = [headerEl, stepsEl, splitEl, actionsEl]
    for (let index = 1; index < order.length; index += 1) {
      const relation = order[index - 1]!.compareDocumentPosition(order[index]!)
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('编号步骤：当前步骤标记 aria-current="step"，其余步骤不标记', () => {
    const { container } = render(
      <FormWorkspace
        actions={<button type="submit">提交</button>}
        header={header}
        steps={{
          ariaLabel: '新建订单步骤',
          items: [
            { id: 'customer', label: '选择客户' },
            { id: 'lines', label: '录入商品' },
            { id: 'confirm', label: '确认' }
          ],
          value: 'lines'
        }}
      >
        <section>表单主区</section>
      </FormWorkspace>
    )
    const items = container.querySelectorAll('.yumi-form-steps li')
    expect(items.length).toBe(3)
    expect(items[0]).not.toHaveAttribute('aria-current')
    expect(items[1]).toHaveAttribute('aria-current', 'step')
  })

  it('单步流程不渲染步骤指示，固定操作条仍在', () => {
    const { container } = render(
      <FormWorkspace actions={<button type="submit">保存</button>} header={header}>
        <section>表单主区</section>
      </FormWorkspace>
    )
    expect(container.querySelector('.yumi-form-steps')).toBeNull()
    expect(container.querySelector('.yumi-sticky-actions')).toHaveTextContent('保存')
  })

  it('长流程变体可由模式根统一指定舒适密度', () => {
    const { container } = render(
      <FormWorkspace
        actions={<button type="submit">提交</button>}
        density="comfortable"
        header={header}
      >
        <section>表单主区</section>
      </FormWorkspace>
    )
    expect(container.querySelector('[data-page-pattern]')).toHaveAttribute(
      'data-density',
      'comfortable'
    )
  })
})
