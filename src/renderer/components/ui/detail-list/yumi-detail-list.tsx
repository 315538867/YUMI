import type { ReactNode } from 'react'
import type { YumiDensity } from '../tabs/yumi-tabs'

export type YumiDetailListItem = {
  label: ReactNode
  value: ReactNode
}

type YumiDetailListProps = {
  ariaLabel: string
  className?: string
  columns?: 1 | 2
  density?: YumiDensity
  items: readonly YumiDetailListItem[]
}

/**
 * 只读详情资料的共享描述列表。
 *
 * 用于实体详情中的基础资料、成本参数等信息，避免页面各自拼装标签和值的栅格。
 */
export function YumiDetailList({
  ariaLabel,
  className,
  columns = 2,
  density = 'compact',
  items
}: YumiDetailListProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={[
        'yumi-detail-list',
        `yumi-detail-list--${columns}`,
        `yumi-detail-list--${density}`,
        className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <dl aria-label={`${ariaLabel}明细`} className="yumi-detail-list__list">
        {items.map((item, index) => (
          <div className="yumi-detail-list__item" key={index}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
