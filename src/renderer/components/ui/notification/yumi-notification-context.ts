import { createContext, useContext, useEffect, useRef } from 'react'
import type { YumiNotificationOptions } from './yumi-notification'

type YumiNotificationMessageOptions = Omit<YumiNotificationOptions, 'message'>

type YumiNotificationContextValue = {
  notify(options: YumiNotificationOptions): number
  dismiss(id: number): void
}

export const YumiNotificationContext = createContext<YumiNotificationContextValue | null>(null)

export function getYumiNotificationTimeout(
  tone: 'success' | 'danger' | 'warning' | 'info',
  timeout?: number
): number {
  if (timeout !== undefined) return timeout
  if (tone === 'danger') return 0
  if (tone === 'warning') return 5000
  return 3000
}

export function useYumiNotification(): YumiNotificationContextValue {
  const context = useContext(YumiNotificationContext)
  if (!context) throw new Error('useYumiNotification 必须在 YumiNotificationProvider 内使用')
  return context
}

/** 将页面状态产生的一次性业务反馈发送到全局通知浮层。 */
export function useYumiNotificationMessage(
  message: string | null | undefined,
  options: YumiNotificationMessageOptions = {}
): void {
  const { notify } = useYumiNotification()
  const previousMessage = useRef<string | null>(null)
  const { tone, timeout } = options

  useEffect(() => {
    if (!message) {
      previousMessage.current = null
      return
    }
    if (previousMessage.current === message) return

    previousMessage.current = message
    notify({ message, tone, timeout })
  }, [message, notify, timeout, tone])
}
