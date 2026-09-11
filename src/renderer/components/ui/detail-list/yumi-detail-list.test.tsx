/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiDetailList } from './yumi-detail-list'

afterEach(cleanup)

describe('YumiDetailList', () => {
  it('以共享描述列表承接详情资料，并根据列数收敛响应式布局语义', () => {
    render(
      <YumiDetailList
        ariaLabel="商品基础资料"
        className="yumi-test-detail-list"
        columns={2}
        items={[
          { label: '商品编码', value: 'YUMI-001' },
          { label: '默认售价', value: '¥99.00' }
        ]}
      />
    )

    const region = screen.getByRole('region', { name: '商品基础资料' })
    expect(region).toHaveClass('yumi-detail-list', 'yumi-detail-list--2', 'yumi-test-detail-list')

    const list = region.querySelector('dl.yumi-detail-list__list')
    expect(list).toHaveAttribute('aria-label', '商品基础资料明细')
    expect(within(list as HTMLElement).getByText('商品编码')).toHaveProperty('tagName', 'DT')
    expect(within(list as HTMLElement).getByText('YUMI-001')).toHaveProperty('tagName', 'DD')
    expect(within(list as HTMLElement).getByText('默认售价')).toBeVisible()
    expect(within(list as HTMLElement).getByText('¥99.00')).toBeVisible()
  })
})
