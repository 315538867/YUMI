import type { ReactNode } from 'react'
import { YumiPageHeader, type YumiPageHeaderProps } from '../ui/page-header/yumi-page-header'
import { PatternRoot } from './page-pattern'

type CalendarWorkspaceProps = {
  /** 页头：标题与页面级动作。 */
  header: YumiPageHeaderProps
  /** 日历工具栏：周/月切换、日期导航与今日。 */
  toolbar?: ReactNode
  /** 页面摘要：指标带等位于工具栏与日历滚动区之间的页面级内容。 */
  summary?: ReactNode
  /** 日历网格主体；在自身区域横向滚动，不压缩到文字重叠。 */
  children: ReactNode
  /** 详情/派工浮层挂载区。 */
  overlay?: ReactNode
}

export function CalendarWorkspace({
  children,
  header,
  overlay,
  summary,
  toolbar
}: CalendarWorkspaceProps) {
  return (
    <PatternRoot className="yumi-page yumi-calendar-workspace" pattern="calendar-workspace">
      <YumiPageHeader {...header} />
      {toolbar ? <div className="yumi-calendar-workspace__toolbar">{toolbar}</div> : null}
      {summary ? <div className="yumi-calendar-workspace__summary">{summary}</div> : null}
      <div className="yumi-calendar-workspace__scroll">
        <div className="yumi-calendar-workspace__grid">{children}</div>
      </div>
      {overlay ? <div className="yumi-calendar-workspace__overlay">{overlay}</div> : null}
    </PatternRoot>
  )
}
