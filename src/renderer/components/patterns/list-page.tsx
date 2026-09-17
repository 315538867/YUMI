import type { ReactNode } from 'react'
import { YumiListSurface } from '../ui/list-surface/yumi-list-surface'
import { YumiListToolbar, type YumiListToolbarProps } from '../ui/list-toolbar/yumi-list-toolbar'
import { YumiMetricStrip, type YumiMetricItem } from '../ui/metric-strip/yumi-metric-strip'
import { YumiPageHeader, type YumiPageHeaderProps } from '../ui/page-header/yumi-page-header'
import { PatternRoot } from './page-pattern'

type ListPageProps = {
  /** 页头：标题/元信息/返回导航与页面级动作（新建、导出）。 */
  header: YumiPageHeaderProps
  /** 可选经营摘要指标带，位于页头之下、列表表面之上；列表页默认紧凑密度。 */
  metrics?: { ariaLabel: string; items: readonly YumiMetricItem[] }
  /** 工具栏：检索、筛选与结果统计，统一编排在列表表面顶部。 */
  toolbar: YumiListToolbarProps
  /** 记录区：数据表或空态，是单一列表表面内的唯一内容主体。 */
  children: ReactNode
}

export function ListPage({ header, metrics, toolbar, children }: ListPageProps) {
  return (
    <PatternRoot className="yumi-page yumi-list-page" pattern="list-page">
      <YumiPageHeader {...header} />
      {metrics ? <YumiMetricStrip {...metrics} /> : null}
      <YumiListSurface>
        <YumiListToolbar {...toolbar} />
        {children}
      </YumiListSurface>
    </PatternRoot>
  )
}
