/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiStickyActions } from './yumi-sticky-actions'

afterEach(cleanup)

describe('YumiStickyActions', () => {
  it('以底部固定操作条容器包裹保存等动作并保持 DOM 顺序', () => {
    render(
      <YumiStickyActions>
        <button>取消</button>
        <button>保存</button>
      </YumiStickyActions>
    )

    const bar = screen.getByText('取消').parentElement
    expect(bar).toHaveClass('yumi-sticky-actions')
    expect(bar?.children).toHaveLength(2)
    expect(bar?.children[0]).toHaveTextContent('取消')
    expect(bar?.children[1]).toHaveTextContent('保存')
  })
})
