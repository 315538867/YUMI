/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiActionMenu } from './yumi-action-menu'

afterEach(cleanup)

describe('YumiActionMenu', () => {
  it('将低频实体级动作收纳在可访问菜单中，并在选择后关闭菜单', async () => {
    const onExport = vi.fn()
    render(
      <YumiActionMenu
        aria-label="订单详情更多操作"
        items={[
          { id: 'return', label: '返回订单列表', onSelect: vi.fn() },
          { id: 'export', label: '发货汇总', onSelect: onExport }
        ]}
      />
    )

    const trigger = screen.getByRole('button', { name: '更多操作' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')

    fireEvent.click(trigger)
    expect(await screen.findByRole('menu', { name: '订单详情更多操作' })).toBeVisible()

    fireEvent.click(screen.getByRole('menuitem', { name: '发货汇总' }))
    expect(onExport).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu', { name: '订单详情更多操作' })).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('支持触发器与菜单项的键盘导航，并在 Escape 后关闭菜单', async () => {
    render(
      <YumiActionMenu
        aria-label="订单详情更多操作"
        items={[
          { id: 'return', label: '返回订单列表', onSelect: vi.fn() },
          { id: 'summary', label: '发货汇总', onSelect: vi.fn() },
          { disabled: true, id: 'archive', label: '归档订单', onSelect: vi.fn() }
        ]}
      />
    )

    const trigger = screen.getByRole('button', { name: '更多操作' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    const menu = await screen.findByRole('menu', { name: '订单详情更多操作' })
    const returnItem = within(menu).getByRole('menuitem', { name: '返回订单列表' })
    const summaryItem = within(menu).getByRole('menuitem', { name: '发货汇总' })
    expect(returnItem).toHaveFocus()

    fireEvent.keyDown(returnItem, { key: 'ArrowDown' })
    expect(summaryItem).toHaveFocus()

    fireEvent.keyDown(summaryItem, { key: 'ArrowUp' })
    expect(returnItem).toHaveFocus()

    fireEvent.keyDown(returnItem, { key: 'End' })
    expect(summaryItem).toHaveFocus()
    fireEvent.keyDown(summaryItem, { key: 'Home' })
    expect(returnItem).toHaveFocus()

    fireEvent.keyDown(returnItem, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: '订单详情更多操作' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更多操作' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  it('支持从触发器使用上方向键定位最后一个可用动作', async () => {
    render(
      <YumiActionMenu
        aria-label="订单详情更多操作"
        items={[
          { id: 'return', label: '返回订单列表', onSelect: vi.fn() },
          { id: 'summary', label: '发货汇总', onSelect: vi.fn() },
          { disabled: true, id: 'archive', label: '归档订单', onSelect: vi.fn() }
        ]}
      />
    )

    fireEvent.keyDown(screen.getByRole('button', { name: '更多操作' }), { key: 'ArrowUp' })
    const menu = await screen.findByRole('menu', { name: '订单详情更多操作' })
    expect(within(menu).getByRole('menuitem', { name: '发货汇总' })).toHaveFocus()
  })

  it('菜单关闭后焦点恢复到触发按钮', async () => {
    render(
      <YumiActionMenu
        aria-label="订单详情更多操作"
        items={[{ id: 'export', label: '导出', onSelect: vi.fn() }]}
      />
    )

    const trigger = screen.getByRole('button', { name: '更多操作' })
    fireEvent.click(trigger)
    const menu = await screen.findByRole('menu', { name: '订单详情更多操作' })
    fireEvent.keyDown(within(menu).getByRole('menuitem', { name: '导出' }), { key: 'Escape' })

    await waitFor(() =>
      expect(screen.queryByRole('menu', { name: '订单详情更多操作' })).not.toBeInTheDocument()
    )
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
