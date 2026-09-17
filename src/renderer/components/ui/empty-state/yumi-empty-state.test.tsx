/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { YumiEmptyState } from './yumi-empty-state'

describe('YumiEmptyState', () => {
  it('将加载状态与空记录区分，并向辅助技术声明正在读取', () => {
    render(
      <YumiEmptyState description="正在汇总数据，请稍候。" scenario="loading" title="订单加载中" />
    )

    expect(screen.getByRole('status', { name: '正在加载' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status', { name: '正在加载' })).toHaveAttribute(
      'data-scenario',
      'loading'
    )
    expect(screen.getByText('订单加载中')).toBeVisible()
  })

  it('以明确的语义区分首次使用、缺少前置资料、筛选无结果和空数据', () => {
    const { rerender } = render(
      <YumiEmptyState
        description="先建立首个客户后再继续。"
        scenario="first-use"
        title="还没有客户资料"
      />
    )

    expect(screen.getByRole('status', { name: '首次使用' })).toHaveAttribute(
      'data-scenario',
      'first-use'
    )
    expect(screen.getByText('还没有客户资料')).toBeVisible()

    rerender(
      <YumiEmptyState
        description="创建订单前，需要至少有一位客户和一个商品。"
        scenario="prerequisite"
        title="先完成基础资料"
      />
    )
    expect(screen.getByRole('status', { name: '缺少前置资料' })).toHaveAttribute(
      'data-scenario',
      'prerequisite'
    )

    rerender(
      <YumiEmptyState description="可切换查看其他阶段。" scenario="filter" title="此阶段暂无待办" />
    )
    expect(screen.getByRole('status', { name: '筛选无结果' })).toHaveAttribute(
      'data-scenario',
      'filter'
    )

    rerender(
      <YumiEmptyState
        description="选择其他统计月份，或先登记实际收付款。"
        scenario="empty"
        title="本月暂无经营数据"
      />
    )
    expect(screen.getByRole('status', { name: '暂无数据' })).toHaveAttribute(
      'data-scenario',
      'empty'
    )
  })
})
