import type { ReactNode } from 'react'
import type { YumiDensity } from '../tabs/yumi-tabs'

export type YumiStatusTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

type YumiStatusTagProps = {
  children: ReactNode
  density?: YumiDensity
  dot?: boolean
  tone?: YumiStatusTone
}

export function YumiStatusTag({
  children,
  density = 'compact',
  dot = false,
  tone = 'neutral'
}: YumiStatusTagProps) {
  return (
    <span className={`yumi-status-tag yumi-status-tag--${tone} yumi-status-tag--${density}`}>
      {dot ? <span aria-hidden="true" className="yumi-status-tag__dot" /> : null}
      {children}
    </span>
  )
}
