import type { ReactNode } from 'react'
import { YumiMetricStrip, type YumiMetricItem } from '../ui/metric-strip/yumi-metric-strip'
import { YumiPageHeader, type YumiPageHeaderProps } from '../ui/page-header/yumi-page-header'
import { PatternRoot } from './page-pattern'

type DashboardOverviewProps = {
  /** 页头：标题与页面级动作（导出等）。 */
  header: YumiPageHeaderProps
  /** 期间工具栏：日期/期间筛选与刷新控件。 */
  toolbar?: ReactNode
  /** 核心指标带；加载等无指标可用的状态下可省略。 */
  metrics?: { ariaLabel: string; items: readonly YumiMetricItem[] }
  /** 主要洞察区。 */
  insights?: ReactNode
  /** 下钻明细区；总览仅展示指标与洞察时省略。 */
  children?: ReactNode
}

export function DashboardOverview({
  children,
  header,
  insights,
  metrics,
  toolbar
}: DashboardOverviewProps) {
  return (
    <PatternRoot className="yumi-page yumi-dashboard-overview" pattern="dashboard-overview">
      <YumiPageHeader {...header} />
      {toolbar ? <div className="yumi-dashboard-overview__toolbar">{toolbar}</div> : null}
      {metrics ? <YumiMetricStrip {...metrics} /> : null}
      {insights ? <div className="yumi-dashboard-overview__insights">{insights}</div> : null}
      <div className="yumi-dashboard-overview__details">{children}</div>
    </PatternRoot>
  )
}
