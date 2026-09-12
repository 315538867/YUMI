/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiEntitySummary } from './yumi-entity-summary'

afterEach(cleanup)

describe('YumiEntitySummary', () => {
  it('以业务主体优先、次级编号和紧凑元数据承接详情页抬头', () => {
    render(
      <YumiEntitySummary
        ariaLabel="订单主体信息"
        eyebrow="订单"
        metadata={[
          { label: '订单编号', value: 'YD-001' },
          { label: '交付日期', value: '2026-09-12' }
        ]}
        title="小满"
      />
    )

    const region = screen.getByRole('region', { name: '订单主体信息' })
    expect(within(region).getByText('订单')).toBeVisible()
    expect(within(region).getByRole('heading', { name: '小满' })).toBeVisible()
    expect(within(region).getByText('订单编号')).toBeVisible()
    expect(within(region).getByText('YD-001')).toBeVisible()
    expect(within(region).getByText('交付日期')).toBeVisible()
  })
})
