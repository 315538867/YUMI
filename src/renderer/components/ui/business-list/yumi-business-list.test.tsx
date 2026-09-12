/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiBusinessList, YumiBusinessListItem } from './yumi-business-list'

afterEach(cleanup)

describe('YumiBusinessList', () => {
  it('将点击、回车和空格统一为打开详情操作', () => {
    const onOpen = vi.fn()
    render(
      <YumiBusinessList>
        <YumiBusinessListItem
          meta="更新于 2026-09-08"
          onOpen={onOpen}
          status="待发货"
          summary="星云兔 · 200 件"
          title="YM-20260908-001"
        />
      </YumiBusinessList>
    )

    const item = screen.getByRole('button', { name: /YM-20260908-001/ })
    fireEvent.click(item)
    fireEvent.keyDown(item, { key: 'Enter' })
    fireEvent.keyDown(item, { key: ' ' })

    expect(onOpen).toHaveBeenCalledTimes(3)
  })
})
