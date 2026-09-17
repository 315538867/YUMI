import type { ReactNode } from 'react'

type YumiSplitLayoutProps = {
  aside?: ReactNode
  children: ReactNode
}

/** 主从分栏：主内容与固定宽度侧栏并排，窄窗口折叠由上层 Pattern 决定。 */
export function YumiSplitLayout({ aside, children }: YumiSplitLayoutProps) {
  return (
    <div className="yumi-split-layout">
      <div className="yumi-split-layout__main">{children}</div>
      {aside ? <aside className="yumi-split-layout__aside">{aside}</aside> : null}
    </div>
  )
}
