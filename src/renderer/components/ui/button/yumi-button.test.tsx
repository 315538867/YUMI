/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiButton, YumiIconButton } from './yumi-button'

afterEach(cleanup)

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

  it('加载中通过 aria-busy 与非颜色旋钮暴露等待状态', () => {
    render(
      <YumiButton loading variant="primary">
        保存中
      </YumiButton>
    )

    const button = screen.getByRole('button', { name: '保存中' })
    expect(button).toHaveAttribute('data-loading', 'true')
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()

    const spinner = button.querySelector('.yumi-button__spinner')
    expect(spinner).toHaveAttribute('aria-hidden', 'true')
  })

  it('危险操作呈现为独立变体，不与品牌主色混淆', () => {
    render(<YumiButton variant="danger">删除记录</YumiButton>)

    expect(screen.getByRole('button', { name: '删除记录' })).toHaveAttribute(
      'data-variant',
      'danger'
    )
  })

  it('禁用按钮不响应点击', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <YumiButton disabled onClick={onClick}>
        不可用
      </YumiButton>
    )

    const button = screen.getByRole('button', { name: '不可用' })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('YumiIconButton · 适用状态（任务 3.5）', () => {
  it('以 label 提供可访问名称并转发点击', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <YumiIconButton label="关闭弹窗" onClick={onClick}>
        <span aria-hidden="true">×</span>
      </YumiIconButton>
    )

    const button = screen.getByRole('button', { name: '关闭弹窗' })
    expect(button).toHaveAttribute('aria-label', '关闭弹窗')
    expect(button).toHaveClass('yumi-button--icon')
    await user.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
