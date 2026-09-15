import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { YumiIconButton } from '../button/yumi-button'
import { YumiNotificationContext, getYumiNotificationTimeout } from './yumi-notification-context'

type YumiNotificationTone = 'success' | 'danger' | 'warning' | 'info'

export type YumiNotificationOptions = {
  message: string
  tone?: YumiNotificationTone
  timeout?: number
}

type NotificationRecord = YumiNotificationOptions & { id: number }

export function YumiNotification({
  message,
  onClose,
  tone = 'danger',
  timeout
}: {
  message: string
  onClose?: () => void
  tone?: YumiNotificationTone
  timeout?: number
}) {
  const [visible, setVisible] = useState(true)
  const resolvedTimeout = getYumiNotificationTimeout(tone, timeout)

  useEffect(() => {
    setVisible(true)
    if (!resolvedTimeout) return
    const timer = window.setTimeout(() => {
      setVisible(false)
      onClose?.()
    }, resolvedTimeout)
    return () => window.clearTimeout(timer)
  }, [message, onClose, resolvedTimeout])

  if (!visible) return null
  const close = () => {
    setVisible(false)
    onClose?.()
  }

  return (
    <div
      aria-live="polite"
      className={`yumi-notification yumi-notification--${tone}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <span>{message}</span>
      <YumiIconButton label="关闭通知" onClick={close} variant="ghost">
        <X aria-hidden="true" size={17} />
      </YumiIconButton>
    </div>
  )
}

export function YumiNotificationHost({
  notifications,
  onDismiss
}: {
  notifications: NotificationRecord[]
  onDismiss(id: number): void
}) {
  return (
    <div aria-label="全局通知" className="yumi-notification-host">
      {notifications.map((notification) => (
        <YumiNotification
          key={notification.id}
          message={notification.message}
          onClose={() => onDismiss(notification.id)}
          timeout={notification.timeout}
          tone={notification.tone}
        />
      ))}
    </div>
  )
}

export function YumiNotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const nextId = useRef(0)
  const dismiss = useCallback((id: number) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id))
  }, [])
  const notify = useCallback((options: YumiNotificationOptions) => {
    const id = ++nextId.current
    setNotifications((current) => [...current, { ...options, id }])
    return id
  }, [])

  return (
    <YumiNotificationContext.Provider value={{ dismiss, notify }}>
      {children}
      <YumiNotificationHost notifications={notifications} onDismiss={dismiss} />
    </YumiNotificationContext.Provider>
  )
}
