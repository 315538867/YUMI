/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YumiNotification, YumiNotificationProvider } from './yumi-notification'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('YumiNotification', () => {
  it('默认在右上角通知并自动关闭', () => {
    vi.useFakeTimers()
    render(<YumiNotification message="保存成功" tone="success" />)

    expect(screen.getByRole('status')).toHaveTextContent('保存成功')
    act(() => {
      vi.advanceTimersByTime(2999)
    })
    expect(screen.getByRole('status')).toBeVisible()
    act(() => {
      vi.advanceTimersByTime(1)
    })
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
      return (
        <button onClick={() => notify({ message: '导出成功', tone: 'success', timeout: 5000 })}>
          发送通知
        </button>
      )
    }
    render(
      <YumiNotificationProvider>
        <Trigger />
      </YumiNotificationProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: '发送通知' }))
    expect(screen.getByRole('status')).toHaveTextContent('导出成功')
    act(() => {
      vi.advanceTimersByTime(4999)
    })
    expect(screen.getByRole('status')).toBeVisible()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('useYumiNotificationMessage', () => {
  it('将业务反馈发送至全局浮层而不插入页面内容流', async () => {
    const notificationContext =
      (await import('./yumi-notification-context')) as typeof import('./yumi-notification-context') & {
        useYumiNotificationMessage?: (
          message: string | null,
          options?: { tone?: 'success' | 'danger' | 'warning' | 'info'; timeout?: number }
        ) => void
      }

    function PageContent() {
      notificationContext.useYumiNotificationMessage?.('已取消导出。', { tone: 'info' })
      return <main data-testid="page-content">订单详情内容</main>
    }

    render(
      <YumiNotificationProvider>
        <PageContent />
      </YumiNotificationProvider>
    )

    const host = screen.getByLabelText('全局通知')
    expect(within(host).getByText('已取消导出。')).toBeInTheDocument()
    expect(screen.getByTestId('page-content')).not.toContainElement(
      within(host).getByText('已取消导出。')
    )
  })
})

describe('通知接入约束', () => {
  it('仅允许全局通知宿主直接渲染通知组件', async () => {
    const { readdir, readFile } = await import('node:fs/promises')
    const { join, relative } = await import('node:path')
    const root = join(process.cwd(), 'src/renderer')
    const allowedFile = join(root, 'components/ui/notification/yumi-notification.tsx')
    const files: string[] = []

    const collect = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const target = join(directory, entry.name)
        if (entry.isDirectory()) await collect(target)
        else if (
          entry.isFile() &&
          /\.(?:ts|tsx)$/.test(entry.name) &&
          !/\.test\.(?:ts|tsx)$/.test(entry.name)
        )
          files.push(target)
      }
    }

    await collect(root)
    const violations = (
      await Promise.all(
        files.map(async (file) => ({
          file,
          source: await readFile(file, 'utf8')
        }))
      )
    )
      .filter(
        ({ file, source }) => file !== allowedFile && /<YumiNotification(?:\s|\/)/.test(source)
      )
      .map(({ file }) => relative(root, file))

    expect(violations).toEqual([])
  })
})
