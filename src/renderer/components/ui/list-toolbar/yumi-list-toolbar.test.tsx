/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiListToolbar } from './yumi-list-toolbar'

afterEach(cleanup)

describe('YumiListToolbar', () => {
  it('将检索、筛选和结果统计固定在同一列表工具条中', () => {
    render(
      <YumiListToolbar
        ariaLabel="客户列表工具"
        countLabel="共 2 位客户"
        filters={<button type="button">全部状态</button>}
        search={<input aria-label="搜索客户" />}
      />
    )

    expect(screen.getByRole('toolbar', { name: '客户列表工具' })).toHaveClass('yumi-list-toolbar')
    expect(screen.getByRole('textbox', { name: '搜索客户' })).toBeVisible()
    expect(screen.getByRole('button', { name: '全部状态' })).toBeVisible()
    expect(screen.getByText('共 2 位客户')).toBeVisible()
  })

  it('将多个筛选条件保持为独立且可控的筛选项，避免桌面端错位堆叠', () => {
    render(
      <YumiListToolbar
        ariaLabel="订单列表工具"
        filters={
          <>
            <button type="button">全部资金状态</button>
            <button type="button">全部交付排班</button>
          </>
        }
        search={<input aria-label="搜索订单" />}
      />
    )

    const toolbar = screen.getByRole('toolbar', { name: '订单列表工具' })
    const filters = toolbar.querySelectorAll('.yumi-list-toolbar__filter')
    expect(filters).toHaveLength(2)
    expect(
      within(filters[0] as HTMLElement).getByRole('button', { name: '全部资金状态' })
    ).toBeVisible()
    expect(
      within(filters[1] as HTMLElement).getByRole('button', { name: '全部交付排班' })
    ).toBeVisible()
  })

  it('将数组形式的多筛选递归展开为独立槽位，不嵌套成单个控件', () => {
    render(
      <YumiListToolbar
        ariaLabel="工资列表工具"
        filters={[
          <button key="status" type="button">
            全部状态
          </button>,
          <>
            <button key="worker" type="button">
              全部人员
            </button>
            <button key="period" type="button">
              全部结算期
            </button>
          </>
        ]}
        search={<input aria-label="搜索工资" />}
      />
    )

    const toolbar = screen.getByRole('toolbar', { name: '工资列表工具' })
    const filters = toolbar.querySelectorAll('.yumi-list-toolbar__filter')
    expect(filters).toHaveLength(3)
    expect(
      within(filters[2] as HTMLElement).getByRole('button', { name: '全部结算期' })
    ).toBeVisible()
  })

  it('搜索、筛选与统计拥有稳定 class 与语义，统计独立于筛选控件不被挤压', () => {
    render(
      <YumiListToolbar
        ariaLabel="订单列表工具"
        countLabel="共 1 张订单"
        filters={<button type="button">全部状态</button>}
        search={<input aria-label="搜索订单" />}
      />
    )

    const toolbar = screen.getByRole('toolbar', { name: '订单列表工具' })
    const controls = toolbar.querySelector('.yumi-list-toolbar__controls')
    const search = toolbar.querySelector('.yumi-list-toolbar__search')
    const filter = toolbar.querySelector('.yumi-list-toolbar__filter')
    const count = toolbar.querySelector('.yumi-list-toolbar__count')

    expect(search).not.toBeNull()
    expect(filter).not.toBeNull()
    expect(controls).not.toBeNull()
    expect(controls).toContainElement(search as HTMLElement)
    expect(controls).toContainElement(filter as HTMLElement)
    expect(count).not.toBeNull()
    expect(controls).not.toContainElement(count as HTMLElement)
    expect(count).toHaveAttribute('aria-live', 'polite')
  })
})
