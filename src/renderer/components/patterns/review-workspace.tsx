import type { ReactNode } from 'react'
import { YumiPageHeader, type YumiPageHeaderProps } from '../ui/page-header/yumi-page-header'
import { PatternRoot } from './page-pattern'

type ReviewWorkspaceProps = {
  /** 页头：标题与页面级动作。 */
  header: YumiPageHeaderProps
  /** 选择摘要：已选记录数与批量操作入口。 */
  selectionSummary?: ReactNode
  /** 统一队列：待核算记录列表。 */
  queue: ReactNode
  /** 处理入口：短任务核对与长任务核算的分流内容；置于队列时省略。 */
  children?: ReactNode
}

export function ReviewWorkspace({
  children,
  header,
  queue,
  selectionSummary
}: ReviewWorkspaceProps) {
  return (
    <PatternRoot className="yumi-page yumi-review-workspace" pattern="review-workspace">
      <YumiPageHeader {...header} />
      {selectionSummary ? (
        <div className="yumi-review-workspace__selection">{selectionSummary}</div>
      ) : null}
      <div className="yumi-review-workspace__queue">{queue}</div>
      {children ? <div className="yumi-review-workspace__processing">{children}</div> : null}
    </PatternRoot>
  )
}
