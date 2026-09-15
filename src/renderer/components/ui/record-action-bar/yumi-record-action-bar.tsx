import type { MouseEventHandler, ReactNode } from 'react'
import { YumiButton, type YumiButtonVariant } from '../button/yumi-button'

export type YumiRecordAction = {
  disabled?: boolean
  label: ReactNode
  loading?: boolean
  onClick: MouseEventHandler<HTMLButtonElement>
  /** 禁用原因等悬停提示，透传给按钮。 */
  title?: string
  variant?: YumiButtonVariant
}

type YumiRecordActionBarProps = {
  actions: readonly YumiRecordAction[]
  ariaLabel: string
  className?: string
}

/**
 * 记录行内的关键操作条。明确呈现全部具名动作，不能为节省宽度折叠成“更多”。
 */
export function YumiRecordActionBar({ actions, ariaLabel, className }: YumiRecordActionBarProps) {
  return (
    <div
      aria-label={ariaLabel}
      className={['yumi-record-action-bar', className].filter(Boolean).join(' ')}
      role="group"
    >
      {actions.map((action, index) => (
        <YumiButton
          disabled={action.disabled}
          key={`${String(action.label)}-${index}`}
          loading={action.loading}
          onClick={action.onClick}
          title={action.title}
          variant={action.variant ?? 'ghost'}
        >
          {action.label}
        </YumiButton>
      ))}
    </div>
  )
}
