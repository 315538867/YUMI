/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiFormSection } from './yumi-form-section'

afterEach(cleanup)

describe('YumiFormSection', () => {
  it('以具名三级标题统一详情与编辑中的资料分组', () => {
    render(
      <YumiFormSection
        className="yumi-test-form-section"
        density="comfortable"
        description="仅在订单中维护对客价格。"
        title="制作与成本参数"
      >
        <p>成本字段主体</p>
      </YumiFormSection>
    )

    const section = screen.getByRole('region', { name: '制作与成本参数' })
    expect(section).toHaveClass(
      'yumi-form-section',
      'yumi-form-section--comfortable',
      'yumi-test-form-section'
    )
    expect(within(section).getByRole('heading', { level: 3, name: '制作与成本参数' })).toBeVisible()
    expect(within(section).getByText('仅在订单中维护对客价格。')).toBeVisible()
    expect(within(section).getByText('成本字段主体')).toBeVisible()
  })
})
