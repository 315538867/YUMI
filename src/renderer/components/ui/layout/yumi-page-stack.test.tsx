/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiPageStack } from './yumi-page-stack'

afterEach(cleanup)

describe('YumiPageStack', () => {
  it('以页面骨架容器包裹页头、区块与主工作区并保持 DOM 顺序', () => {
    render(
      <YumiPageStack>
        <header>页头</header>
        <section>区块</section>
        <main>主工作区</main>
      </YumiPageStack>
    )

    const stack = screen.getByText('页头').parentElement
    expect(stack).toHaveClass('yumi-page-stack')
    expect(stack?.children).toHaveLength(3)
    expect(stack?.children[0]).toHaveTextContent('页头')
    expect(stack?.children[1]).toHaveTextContent('区块')
    expect(stack?.children[2]).toHaveTextContent('主工作区')
  })
})
