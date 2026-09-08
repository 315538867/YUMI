import type { ReactNode } from 'react'

export type YumiStatusTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

type YumiStatusTagProps = {
  children: ReactNode
  dot?: boolean
  tone?: YumiStatusTone
}

export function YumiStatusTag({ children, dot = false, tone = 'neutral' }: YumiStatusTagProps) {
  return (
    <span className={`yumi-status-tag yumi-status-tag--${tone}`}>
      {dot ? <span aria-hidden="true" className="yumi-status-tag__dot" /> : null}
      {children}
    </span>
  )
}
