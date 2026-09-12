import type { ReactNode } from 'react'
import { YumiDetailList, type YumiDetailListItem } from '../detail-list/yumi-detail-list'

type YumiEntitySummaryProps = {
  ariaLabel: string
  className?: string
  eyebrow?: ReactNode
  metadata?: readonly YumiDetailListItem[]
  title: ReactNode
}

/**
 * 实体详情顶部的紧凑主体信息。先表达客户、商品等经营主体，编号降级为元数据，
 * 避免只有一条编号的大摘要占据页面首屏。
 */
export function YumiEntitySummary({
  ariaLabel,
  className,
  eyebrow,
  metadata = [],
  title
}: YumiEntitySummaryProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={['yumi-entity-summary', className].filter(Boolean).join(' ')}
    >
      {eyebrow ? <p className="yumi-entity-summary__eyebrow">{eyebrow}</p> : null}
      <h2 className="yumi-entity-summary__title">{title}</h2>
      {metadata.length ? (
        <YumiDetailList
          ariaLabel={`${ariaLabel}元数据`}
          className="yumi-entity-summary__metadata"
          columns={2}
          items={metadata}
        />
      ) : null}
    </section>
  )
}
