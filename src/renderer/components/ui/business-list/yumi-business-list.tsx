import { ChevronRight } from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'

type YumiBusinessListProps = {
  children: ReactNode
  className?: string
}

export function YumiBusinessList({ children, className }: YumiBusinessListProps) {
  return <div className={['yumi-business-list', className].filter(Boolean).join(' ')}>{children}</div>
}

export type YumiBusinessMetric = { label: ReactNode; value: ReactNode }

type YumiBusinessListItemProps = {
  children?: ReactNode
  className?: string
  actions?: ReactNode
  meta?: ReactNode
  metrics?: YumiBusinessMetric[]
  onOpen?(): void
  status?: ReactNode
  summary?: ReactNode
  title: ReactNode
}

export function YumiBusinessListItem({
  actions,
  children,
  className,
  meta,
  metrics = [],
  onOpen,
  status,
  summary,
  title
}: YumiBusinessListItemProps) {
  const interactive = Boolean(onOpen)
  const triggerOpen = () => onOpen?.()
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    triggerOpen()
  }

  return (
    <div
      aria-label={`${title}${summary ? `，${summary}` : ''}`}
      className={['yumi-business-list__item', interactive ? 'yumi-business-list__item--interactive' : '', className].filter(Boolean).join(' ')}
      onClick={interactive ? triggerOpen : undefined}
      onKeyDown={handleKeyDown}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <div className="yumi-business-list__main">
        <div className="yumi-business-list__title-line">
          <strong className="yumi-business-list__title">{title}</strong>
          {status ? <span>{status}</span> : null}
        </div>
        {summary ? <p className="yumi-business-list__summary">{summary}</p> : null}
        {children ? <div className="yumi-business-list__details">{children}</div> : null}
      </div>
      {metrics.length ? (
        <div className="yumi-business-list__metrics">
          {metrics.map((metric, index) => <div key={index}><span>{metric.label}</span><strong>{metric.value}</strong></div>)}
        </div>
      ) : null}
      {actions ? <div className="yumi-business-list__actions">{actions}</div> : null}
      <div className="yumi-business-list__meta">
        {meta ? <span>{meta}</span> : null}
        {interactive ? <ChevronRight aria-hidden="true" size={18} /> : null}
      </div>
    </div>
  )
}
