/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiButton } from '../button/yumi-button'
import { YumiPageActions, YumiPageHeader, YumiRecordSummary, YumiSection } from './yumi-page-header'

afterEach(cleanup)

describe('YumiSection', () => {
  it('将区块级动作与标题和说明置于同一上下文头部', () => {
    render(
      <YumiSection
        actions={<YumiButton>新建工作安排</YumiButton>}
        ariaLabel="工作安排记录区块"
        className="yumi-test-section"
        description="按日期查看和处理已有工作安排。"
        status={<span>共 12 条记录</span>}
        title="工作安排记录"
      >
        <p>记录主体</p>
      </YumiSection>
    )

    const section = screen.getByRole('region', { name: '工作安排记录区块' })
    expect(section).toHaveClass('yumi-section', 'yumi-test-section')
    expect(screen.getByRole('heading', { name: '工作安排记录' })).toBeVisible()
    expect(screen.getByText('按日期查看和处理已有工作安排。')).toBeVisible()
    expect(screen.getByText('共 12 条记录').parentElement).toHaveClass('yumi-section__status')
    expect(screen.getByRole('button', { name: '新建工作安排' })).toBeVisible()
    expect(screen.getByText('记录主体')).toBeVisible()
  })
})

describe('YumiRecordSummary', () => {
  it('将实体状态置于摘要头部，并让经营指标占据完整摘要宽度', () => {
    render(
      <YumiRecordSummary
        ariaLabel="订单经营摘要"
        className="yumi-test-record-summary"
        description="罗小雨 · 预计 2026-09-26 发货"
        status={<span>待收 ¥6,900.00</span>}
        title="YUMI-20260909-40DA4997"
      >
        <div data-testid="record-summary-metrics">经营指标</div>
      </YumiRecordSummary>
    )

    const summary = screen.getByRole('region', { name: '订单经营摘要' })
    expect(summary).toHaveClass('yumi-record-summary', 'yumi-test-record-summary')
    expect(within(summary).getByRole('heading', { name: 'YUMI-20260909-40DA4997' })).toBeVisible()
    expect(within(summary).getByText('罗小雨 · 预计 2026-09-26 发货')).toBeVisible()
    expect(within(summary).getByText('待收 ¥6,900.00')).toBeVisible()
    expect(within(summary).getByTestId('record-summary-metrics').parentElement).toHaveClass(
      'yumi-record-summary__metrics'
    )
  })
})

describe('YumiPageActions', () => {
  it('将上下文、可见次操作、更多操作和唯一主操作固定为页面右侧动作层级', async () => {
    const onExport = vi.fn()
    const onArchive = vi.fn()
    const onEdit = vi.fn()

    render(
      <YumiPageActions
        ariaLabel="订单详情页面动作"
        context={<span>待收款</span>}
        menu={{
          ariaLabel: '订单详情更多操作',
          items: [{ id: 'archive', label: '归档订单', onSelect: onArchive }]
        }}
        primaryAction={{ label: '编辑订单', onClick: onEdit }}
        secondaryAction={{ label: '导出订单表', onClick: onExport }}
        visibleActions={[
          { label: '返回订单列表', onClick: vi.fn(), variant: 'ghost' },
          { label: '导出发货汇总', onClick: vi.fn() }
        ]}
      />
    )

    const group = screen.getByRole('group', { name: '订单详情页面动作' })
    expect(within(group).getByText('待收款')).toBeVisible()
    expect(
      within(group)
        .getAllByRole('button')
        .map((button) => button.textContent)
    ).toEqual(['导出订单表', '返回订单列表', '导出发货汇总', '更多操作', '编辑订单'])
    expect(within(group).getByRole('button', { name: '返回订单列表' })).toBeVisible()
    expect(within(group).getByRole('button', { name: '导出发货汇总' })).toBeVisible()

    const editButton = within(group).getByRole('button', { name: '编辑订单' })
    expect(editButton).toHaveAttribute('data-variant', 'primary')

    fireEvent.click(within(group).getByRole('button', { name: '导出订单表' }))
    expect(onExport).toHaveBeenCalledTimes(1)
    fireEvent.click(editButton)
    expect(onEdit).toHaveBeenCalledTimes(1)

    fireEvent.click(within(group).getByRole('button', { name: '更多操作' }))
    const menu = await screen.findByRole('menu', { name: '订单详情更多操作' })
    fireEvent.click(within(menu).getByRole('menuitem', { name: '归档订单' }))
    expect(onArchive).toHaveBeenCalledTimes(1)
  })
})

describe('YumiPageHeader', () => {
  it('将页头操作约束为共享动作配置，而非自由拼接的按钮节点', () => {
    render(
      <YumiPageHeader
        actions={{
          ariaLabel: '客户页面动作',
          primaryAction: { label: '新建客户', onClick: vi.fn() }
        }}
        description="维护客户资料与历史订单。"
        title="客户"
      />
    )

    expect(screen.getByRole('heading', { name: '客户' })).toBeVisible()
    expect(screen.getByRole('group', { name: '客户页面动作' })).toBeVisible()
    expect(screen.getByRole('button', { name: '新建客户' })).toBeVisible()
  })

  it('将实体编号作为标题旁的次级元数据，不挤占页头主信息', () => {
    render(
      <YumiPageHeader
        description="罗小雨 · 查看订单内容、排班、发货、资金、盈利与售后记录。"
        meta="订单编号 YUMI-20260909-40DA4997"
        title="订单详情"
      />
    )

    expect(screen.getByRole('heading', { name: '订单详情' })).toBeVisible()
    expect(screen.getByText('订单编号 YUMI-20260909-40DA4997')).toHaveClass(
      'yumi-page-header__meta'
    )
    expect(
      screen.getByText('罗小雨 · 查看订单内容、排班、发货、资金、盈利与售后记录。')
    ).toBeVisible()
  })
})
