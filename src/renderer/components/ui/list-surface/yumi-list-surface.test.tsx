/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiListSurface } from './yumi-list-surface'

afterEach(cleanup)

describe('YumiListSurface', () => {
  it('统一渲染列表业务容器并保留可访问名称与领域 class', () => {
    render(
      <YumiListSurface ariaLabel="订单列表" className="yumi-order-list-surface">
        <div>订单内容</div>
      </YumiListSurface>
    )

    const surface = screen.getByLabelText('订单列表')
    expect(surface).toHaveClass('yumi-list-surface', 'yumi-order-list-surface')
    expect(surface).toHaveTextContent('订单内容')
  })

  it('没有 ariaLabel 时不生成空的 aria-label 属性', () => {
    const { container } = render(<YumiListSurface>列表内容</YumiListSurface>)

    expect(container.firstElementChild).not.toHaveAttribute('aria-label')
  })
})
