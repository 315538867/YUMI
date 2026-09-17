/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiDivider } from './yumi-divider'

afterEach(cleanup)

describe('YumiDivider', () => {
  it('默认输出水平分隔线，支持垂直方向并保持装饰语义', () => {
    const { container, rerender } = render(<YumiDivider />)
    const horizontal = container.querySelector('hr')
    expect(horizontal).toHaveClass('yumi-divider')
    expect(horizontal).not.toHaveClass('yumi-divider--vertical')
    expect(horizontal).toHaveAttribute('aria-hidden', 'true')

    rerender(<YumiDivider orientation="vertical" />)
    expect(container.querySelector('hr')).toHaveClass('yumi-divider', 'yumi-divider--vertical')
  })
})
