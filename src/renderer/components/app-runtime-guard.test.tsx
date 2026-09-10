/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppRuntimeGuard } from './app-runtime-guard'

describe('AppRuntimeGuard', () => {
  it('在浏览器直接打开时展示桌面端使用提示，而不是渲染依赖 IPC 的业务页面', () => {
    render(
      <AppRuntimeGuard hasDesktopApi={false}>
        <p>不应渲染的业务内容</p>
      </AppRuntimeGuard>
    )

    expect(screen.getByText('请在 YUMI Studio 桌面窗口中使用')).toBeVisible()
    expect(
      screen.getByText(
        '当前页面未获得桌面端预加载桥接，无法访问本地订单、附件和工作室数据。请从 YUMI Studio 桌面窗口打开；若已在桌面端，请重启应用。'
      )
    ).toBeVisible()
    expect(screen.queryByText('不应渲染的业务内容')).not.toBeInTheDocument()
  })

  it('在桌面预加载桥接可用时渲染业务页面', () => {
    render(
      <AppRuntimeGuard hasDesktopApi>
        <p>业务内容</p>
      </AppRuntimeGuard>
    )

    expect(screen.getByText('业务内容')).toBeVisible()
  })

  it('业务页面渲染异常时展示可恢复提示，而不是留下空白窗口', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    function BrokenFinancePage(): never {
      throw new Error('财务页面渲染失败')
    }

    render(
      <AppRuntimeGuard hasDesktopApi>
        <BrokenFinancePage />
      </AppRuntimeGuard>
    )

    expect(screen.getByText('页面加载异常')).toBeVisible()
    expect(
      screen.getByText(
        '页面未能正常加载。请重新加载；如果问题持续出现，请重启 YUMI Studio 后再试。'
      )
    ).toBeVisible()
    expect(screen.getByText('诊断信息：财务页面渲染失败')).toBeVisible()
    consoleError.mockRestore()
  })
})
