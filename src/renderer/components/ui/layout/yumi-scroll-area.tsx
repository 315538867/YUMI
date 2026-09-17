import type { ReactNode } from 'react'

type YumiScrollAreaProps = {
  children: ReactNode
  /** 最大高度（px），内容超出时在容器内滚动而不是撑开页面。 */
  maxHeight?: number
}

export function YumiScrollArea({ children, maxHeight }: YumiScrollAreaProps) {
  return (
    <div className="yumi-scroll-area" style={maxHeight ? { maxHeight } : undefined}>
      {children}
    </div>
  )
}
