/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { YumiButton } from './yumi-button'

describe('YumiButton', () => {
  it('以语义按钮呈现层级、禁用和加载状态', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    const { rerender } = render(
      <YumiButton onClick={onClick} variant="primary">
        保存订单
      </YumiButton>
    )

    const button = screen.getByRole('button', { name: '保存订单' })
    expect(button.dataset.variant).toBe('primary')
    await user.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(
      <YumiButton disabled loading variant="danger">
        删除记录
      </YumiButton>
    )

    const loadingButton = screen.getByRole('button', { name: '删除记录' })
    expect(loadingButton).toBeDisabled()
    expect(loadingButton.dataset.loading).toBe('true')
  })
})
