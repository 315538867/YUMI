/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiSplitLayout } from './yumi-split-layout'

afterEach(cleanup)

describe('YumiSplitLayout', () => {
  it('主内容与侧栏分列呈现，未提供侧栏时只渲染主内容', () => {
    const { rerender } = render(
      <YumiSplitLayout aside={<aside>侧栏</aside>}>
        <section>主内容</section>
      </YumiSplitLayout>
    )

    const main = screen.getByText('主内容').parentElement
    expect(main).toHaveClass('yumi-split-layout__main')
    expect(screen.getByText('侧栏').parentElement).toHaveClass('yumi-split-layout__aside')
    expect(main?.parentElement).toHaveClass('yumi-split-layout')

    rerender(<YumiSplitLayout>只有主内容</YumiSplitLayout>)
    expect(screen.getByText('只有主内容')).toHaveClass('yumi-split-layout__main')
    expect(document.querySelector('.yumi-split-layout__aside')).not.toBeInTheDocument()
  })
})
