import { Component, type ReactNode } from 'react'
import { YumiButton, YumiEmptyState } from './ui'

type AppRuntimeGuardProps = {
  children: ReactNode
  hasDesktopApi: boolean
}

type AppPageErrorBoundaryState = {
  hasError: boolean
  message: string | null
}

/**
 * 任一业务页面渲染异常时，不能让 Electron 只留下浏览器窗口底色。
 * 保留可执行的重新加载入口，避免用户只能强制退出应用。
 */
class AppPageErrorBoundary extends Component<{ children: ReactNode }, AppPageErrorBoundaryState> {
  state: AppPageErrorBoundaryState = { hasError: false, message: null }

  static getDerivedStateFromError(): AppPageErrorBoundaryState {
    return { hasError: true, message: null }
  }

  componentDidCatch(error: Error) {
    this.setState({ message: error.message.trim() || '未提供错误详情' })
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="yumi-page">
          <YumiEmptyState
            action={
              <YumiButton onClick={() => window.location.reload()} variant="primary">
                重新加载
              </YumiButton>
            }
            description={
              <>
                页面未能正常加载。请重新加载；如果问题持续出现，请重启 YUMI Studio 后再试。
                <br />
                <span>诊断信息：{this.state.message ?? '正在收集错误详情…'}</span>
              </>
            }
            scenario="prerequisite"
            title="页面加载异常"
          />
        </main>
      )
    }

    return this.props.children
  }
}

/**
 * 浏览器直接访问 Vite 地址时不存在 Electron preload 桥接。
 * 在调用任一业务 IPC 前阻断渲染，避免每个页面分别抛出 window.yumiV2 未定义错误。
 */
export function AppRuntimeGuard({ children, hasDesktopApi }: AppRuntimeGuardProps) {
  if (!hasDesktopApi) {
    return (
      <main className="yumi-page">
        <YumiEmptyState
          description="当前页面未获得桌面端预加载桥接，无法访问本地订单、附件和工作室数据。请从 YUMI Studio 桌面窗口打开；若已在桌面端，请重启应用。"
          title="请在 YUMI Studio 桌面窗口中使用"
        />
      </main>
    )
  }

  return <AppPageErrorBoundary>{children}</AppPageErrorBoundary>
}
