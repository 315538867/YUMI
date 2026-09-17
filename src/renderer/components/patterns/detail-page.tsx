import type { ReactNode } from 'react'
import {
  YumiEntitySummary,
  type YumiEntitySummaryProps
} from '../ui/entity-summary/yumi-entity-summary'
import { YumiMetricStrip, type YumiMetricItem } from '../ui/metric-strip/yumi-metric-strip'
import { YumiPageHeader, type YumiPageHeaderProps } from '../ui/page-header/yumi-page-header'
import { YumiPrimaryTabs, type YumiTabsProps } from '../ui/tabs/yumi-tabs'
import { PatternRoot } from './page-pattern'

type DetailPageProps<T extends string> = {
  /** 页头：标题/元信息/返回上下文与页面级动作。 */
  header: YumiPageHeaderProps
  /** 实体身份摘要，只表达主体身份，不重复当前详情视图的完整内容。 */
  summary?: YumiEntitySummaryProps
  /** 可选经营指标带，位于摘要与主要导航之间。 */
  metrics?: { ariaLabel: string; items: readonly YumiMetricItem[] }
  /** 主要视图切换（一级 Tab）。 */
  tabs?: YumiTabsProps<T>
  /** 当前详情区块：概览/资金/排班等 Tab 内容，由页面传入区块级区域。 */
  children: ReactNode
}

export function DetailPage<T extends string>({
  header,
  metrics,
  summary,
  tabs,
  children
}: DetailPageProps<T>) {
  return (
    <PatternRoot className="yumi-page yumi-detail-page" pattern="detail-page">
      <YumiPageHeader {...header} />
      {summary ? <YumiEntitySummary {...summary} /> : null}
      {metrics ? <YumiMetricStrip {...metrics} /> : null}
      {tabs ? <YumiPrimaryTabs {...tabs} /> : null}
      <div className="yumi-detail-page__body">{children}</div>
    </PatternRoot>
  )
}
