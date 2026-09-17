import type { ReactNode } from 'react'

type YumiStickyActionsProps = {
  children: ReactNode
}

/** 表单/工作区底部的固定操作条：吸附在视口底部，保持页面内容层之上的同一层叠面。 */
export function YumiStickyActions({ children }: YumiStickyActionsProps) {
  return <div className="yumi-sticky-actions">{children}</div>
}
