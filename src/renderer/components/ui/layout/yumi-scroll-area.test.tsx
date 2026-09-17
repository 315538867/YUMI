/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiScrollArea } from './yumi-scroll-area'

afterEach(cleanup)

describe('YumiScrollArea', () => {
  it('在给定最大高度时输出滚动容器，未给定时不注入高度样式', () => {
    const { rerender } = render(
      <YumiScrollArea maxHeight={320}>
        <p>内容</p>
      </YumiScrollArea>
    )

    const area = screen.getByText('内容').parentElement
    expect(area).toHaveClass('yumi-scroll-area')
    expect(area).toHaveStyle({ 'max-height': '320px' })

    rerender(<YumiScrollArea>自由高度</YumiScrollArea>)
    expect(screen.getByText('自由高度').parentElement).not.toHaveAttribute('style')
  })
})
