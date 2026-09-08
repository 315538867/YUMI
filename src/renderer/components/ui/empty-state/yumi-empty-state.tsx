import { CircleAlert, Inbox, ListFilter, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'

export type YumiEmptyStateScenario = 'default' | 'filter' | 'first-use' | 'prerequisite'

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
  filter: '筛选无结果'
}

const scenarioIcons: Record<YumiEmptyStateScenario, ReactNode> = {
  default: <Inbox size={22} />,
  'first-use': <Sparkles size={22} />,
  prerequisite: <CircleAlert size={22} />,
  filter: <ListFilter size={22} />
}

/**
 * 统一承载三类有后续动作的业务空状态：首次使用、缺少前置资料、筛选无结果。
 * 默认状态仅用于加载完成但没有额外业务语义的只读空列表。
 */
export function YumiEmptyState({ action, description, icon, scenario = 'default', title }: YumiEmptyStateProps) {
  return (
    <section aria-label={scenarioLabels[scenario]} aria-live="polite" className="yumi-empty-state" data-scenario={scenario} role="status">
      <div aria-hidden="true" className="yumi-empty-state__icon">{icon ?? scenarioIcons[scenario]}</div>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div className="yumi-empty-state__action">{action}</div> : null}
    </section>
  )
}
