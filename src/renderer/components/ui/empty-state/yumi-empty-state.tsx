import { CircleAlert, Inbox, ListFilter, LoaderCircle, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'

export type YumiEmptyStateScenario = 'default' | 'filter' | 'first-use' | 'prerequisite' | 'loading'

type YumiEmptyStateProps = {
  action?: ReactNode
  description?: ReactNode
  icon?: ReactNode
  scenario?: YumiEmptyStateScenario
  title: ReactNode
}

const scenarioLabels: Record<YumiEmptyStateScenario, string> = {
  default: '暂无内容',
  'first-use': '首次使用',
  prerequisite: '缺少前置资料',
  filter: '筛选无结果',
  loading: '正在加载'
}

const scenarioIcons: Record<YumiEmptyStateScenario, ReactNode> = {
  default: <Inbox size={22} />,
  'first-use': <Sparkles size={22} />,
  prerequisite: <CircleAlert size={22} />,
  filter: <ListFilter size={22} />,
  loading: <LoaderCircle className="yumi-empty-state__loading-icon" size={22} />
}

/**
 * 统一承载加载、首次使用、缺少前置资料、筛选无结果和普通空记录等页面反馈。
 * loading 仅表示数据仍在读取；默认状态仅用于读取完成但没有额外业务语义的只读空列表。
 */
export function YumiEmptyState({ action, description, icon, scenario = 'default', title }: YumiEmptyStateProps) {
  return (
    <section
      aria-busy={scenario === 'loading' ? true : undefined}
      aria-label={scenarioLabels[scenario]}
      aria-live="polite"
      className="yumi-empty-state"
      data-scenario={scenario}
      role="status"
    >
      <div aria-hidden="true" className="yumi-empty-state__icon">{icon ?? scenarioIcons[scenario]}</div>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div className="yumi-empty-state__action">{action}</div> : null}
    </section>
  )
}
