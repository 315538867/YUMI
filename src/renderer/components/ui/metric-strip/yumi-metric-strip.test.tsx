/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiMetricStrip } from './yumi-metric-strip'

afterEach(cleanup)

describe('YumiMetricStrip', () => {
  it('按实际指标数量生成紧凑连续指标带，并保留每项语义色调', () => {
    render(
      <YumiMetricStrip
        ariaLabel="本月经营结果指标"
        items={[
          { label: '实际收入', tone: 'success', value: '¥3,000.00' },
          { label: '经营支出', tone: 'danger', value: '¥500.00' },
          { label: '经营结果', tone: 'brand', value: '¥2,500.00' }
        ]}
      />
    )

    const region = screen.getByRole('region', { name: '本月经营结果指标' })
    expect(region).toHaveClass('yumi-metric-strip', 'yumi-metric-strip--3')
    expect(region.querySelectorAll('.yumi-metric-strip__item')).toHaveLength(3)
    expect(within(region).getByText('实际收入')).toBeVisible()
    expect(within(region).getByText('¥2,500.00')).toBeVisible()
    expect(within(region).getByText('实际收入').closest('div')).toHaveClass(
      'yumi-metric-strip__item--success'
    )
  })
})
