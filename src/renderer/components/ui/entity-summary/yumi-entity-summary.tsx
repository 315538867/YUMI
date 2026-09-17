import type { ReactNode } from 'react'
import { YumiDetailList, type YumiDetailListItem } from '../detail-list/yumi-detail-list'

/** 实体身份属性：编号、联系人、日期、地址等上下文；不得承载金额、进度等经营指标。 */
export type YumiEntitySummaryMetadataItem = YumiDetailListItem

type YumiEntitySummaryProps = {
  ariaLabel: string
  className?: string
  eyebrow?: ReactNode
  metadata?: readonly YumiEntitySummaryMetadataItem[]
  title: ReactNode
}

export type { YumiEntitySummaryProps }

/**
 * 实体详情顶部的紧凑身份块。只表达「这是什么主体」——眉题、名称与身份属性；
 * 经营指标由经营摘要（YumiRecordSummary + YumiMetricStrip）另行承载，本组件不重复完整 Tab 内容。
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
