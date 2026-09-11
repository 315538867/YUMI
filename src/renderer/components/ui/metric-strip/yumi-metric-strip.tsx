import type { CSSProperties, ReactNode } from 'react'

export type YumiMetricTone = 'default' | 'brand' | 'success' | 'warning' | 'danger'

export type YumiMetricItem = {
  label: ReactNode
  value: ReactNode
  tone?: YumiMetricTone
}

type YumiMetricStripProps = {
  /** 为整组指标提供名称，避免相邻指标带仅凭视觉区分。 */
  ariaLabel: string
  className?: string
  items: readonly YumiMetricItem[]
}

/**
 * 经营摘要统一使用连续指标带：列数由真实指标决定，不再以空卡片补齐网格。
 * 订单、排班、财务、报表及档案内嵌摘要共用相同的信息密度与响应式规则。
 */
export function YumiMetricStrip({ ariaLabel, className, items }: YumiMetricStripProps) {
  const metricCount = Math.max(items.length, 1)
  const classes = [
    'yumi-metric-strip',
    `yumi-metric-strip--${metricCount}`,
    className
  ].filter(Boolean).join(' ')

  return (
    <section aria-label={ariaLabel} className={classes}>
      <dl
        className="yumi-metric-strip__list"
        style={{ '--yumi-metric-count': metricCount } as CSSProperties}
      >
        {items.map((item, index) => (
          <div
            className={[
              'yumi-metric-strip__item',
              `yumi-metric-strip__item--${item.tone ?? 'default'}`
            ].join(' ')}
            key={index}
          >
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
