/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiGrid } from './yumi-grid'

afterEach(cleanup)

describe('YumiGrid', () => {
  it('默认以 220px 最小列宽输出响应式网格，并允许覆盖最小列宽', () => {
    const { rerender } = render(
      <YumiGrid>
        <div>卡片 A</div>
        <div>卡片 B</div>
      </YumiGrid>
    )

    const grid = screen.getByText('卡片 A').parentElement
    expect(grid).toHaveClass('yumi-grid')
    expect(grid).toHaveStyle({
      'grid-template-columns': 'repeat(auto-fill, minmax(220px, 1fr))'
    })

    rerender(
      <YumiGrid minColumnWidth={300}>
        <div>卡片 A</div>
      </YumiGrid>
    )
    expect(screen.getByText('卡片 A').parentElement).toHaveStyle({
      'grid-template-columns': 'repeat(auto-fill, minmax(300px, 1fr))'
    })
  })
})
