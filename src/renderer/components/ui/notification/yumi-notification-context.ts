import { createContext, useContext } from 'react'
import type { YumiNotificationOptions } from './yumi-notification'

type YumiNotificationContextValue = {
  notify(options: YumiNotificationOptions): number
  dismiss(id: number): void
}

export const YumiNotificationContext = createContext<YumiNotificationContextValue | null>(null)

export function getYumiNotificationTimeout(tone: 'success' | 'danger' | 'warning' | 'info', timeout?: number): number {
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
