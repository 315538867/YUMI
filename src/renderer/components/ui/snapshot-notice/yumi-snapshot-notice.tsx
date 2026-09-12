import type { ReactNode } from 'react'

type YumiSnapshotNoticeProps = {
  children: ReactNode
  className?: string
  title?: ReactNode
}

/**
 * 只读单据、历史记录和冻结成本统一使用的快照边界提示。
 */
export function YumiSnapshotNotice({
  children,
  className,
  title = '快照说明'
}: YumiSnapshotNoticeProps) {
  return (
    <aside
      aria-label="快照说明"
      className={['yumi-snapshot-notice', className].filter(Boolean).join(' ')}
      role="note"
    >
      <strong className="yumi-snapshot-notice__title">{title}</strong>
      <p className="yumi-snapshot-notice__content">{children}</p>
    </aside>
  )
}
