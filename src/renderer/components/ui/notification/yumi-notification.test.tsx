/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiNotification } from './yumi-notification'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('YumiNotification', () => {
  it('默认在右上角通知并自动关闭', () => {
    vi.useFakeTimers()
    render(<YumiNotification message="保存成功" tone="success" />)

    expect(screen.getByRole('status')).toHaveTextContent('保存成功')
    act(() => { vi.advanceTimersByTime(2999) })
    expect(screen.getByRole('status')).toBeVisible()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('允许用户提前关闭并通知调用方', () => {
    const onClose = vi.fn()
    render(<YumiNotification message="保存失败" onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: '关闭通知' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('YumiNotificationProvider', () => {
  it('支持全局通知堆叠并在自动关闭后移除记录', async () => {
    vi.useFakeTimers()
    const { YumiNotificationProvider } = await import('./yumi-notification')
    const { useYumiNotification } = await import('./yumi-notification-context')
    function Trigger() {
      const { notify } = useYumiNotification()
      return <button onClick={() => notify({ message: '导出成功', tone: 'success', timeout: 5000 })}>发送通知</button>
    }
    render(<YumiNotificationProvider><Trigger /></YumiNotificationProvider>)

    fireEvent.click(screen.getByRole('button', { name: '发送通知' }))
    expect(screen.getByRole('status')).toHaveTextContent('导出成功')
    act(() => { vi.advanceTimersByTime(4999) })
    expect(screen.getByRole('status')).toBeVisible()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
