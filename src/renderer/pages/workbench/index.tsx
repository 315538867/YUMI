import { useMemo, useState } from 'react'
import type { V2NavigationTarget, V2WorkbenchItem } from '@shared/contracts/index'
import { useWorkbench } from '../../composables/use-workbench'
import { formatCents } from '../../composables/v2-utils'
import {
  YumiBusinessList,
  YumiBusinessListItem,
  YumiButton,
  YumiEmptyState,
  YumiPageHeader,
  YumiStatusTag,
  useYumiNotificationMessage
} from '../../components/ui'

type WorkbenchView = 'decision' | 'advance'

type WorkbenchPageProps = {
  initialView?: WorkbenchView
  onNavigate(target: V2NavigationTarget): void
  onViewChange?(view: WorkbenchView): void
}

const viewLabels: Record<WorkbenchView, string> = {
  decision: '需要我决定',
  advance: '可以推进'
}

function formatAmountOrQuantity(item: V2WorkbenchItem): string | null {
  if (!item.quantityOrAmount) return null
  if (item.quantityOrAmount.kind === 'amount') return formatCents(item.quantityOrAmount.value)
  return `${item.quantityOrAmount.value}${item.quantityOrAmount.unit}`
}

function statusFor(priority: V2WorkbenchItem['priority']) {
  if (priority === 'urgent') return { tone: 'danger' as const, label: '优先处理' }
  if (priority === 'high') return { tone: 'warning' as const, label: '请跟进' }
  return { tone: 'neutral' as const, label: '待处理' }
}

/** 负责人默认入口：任意时刻只显示一个基于真实业务事实的任务列表。 */
export function WorkbenchPage({
  initialView = 'decision',
  onNavigate,
  onViewChange
}: WorkbenchPageProps) {
  const { snapshot, loading, loadError, reload } = useWorkbench()
  const [activeView, setActiveView] = useState<WorkbenchView>(initialView)
  useYumiNotificationMessage(loadError)
  const chooseView = (view: WorkbenchView) => {
    setActiveView(view)
    onViewChange?.(view)
  }
  const items = useMemo(
    () =>
      activeView === 'decision' ? (snapshot?.decisionItems ?? []) : (snapshot?.advanceItems ?? []),
    [activeView, snapshot]
  )
  const decisionCount = snapshot?.decisionItems.length ?? 0
  const advanceCount = snapshot?.advanceItems.length ?? 0

  return (
    <section className="yumi-page yumi-workbench-page">
      <YumiPageHeader
        description="只显示由订单、履约、售后、工资和财务事实生成的当前处理入口。"
        title="工作台"
        actions={
          <YumiButton onClick={() => void reload()} variant="secondary">
            刷新
          </YumiButton>
        }
      />
      {loading ? (
        <YumiEmptyState description="正在汇总当前需要处理的业务事实。" title="读取工作台中…" />
      ) : null}
      {!loading && snapshot?.firstUseGuide ? (
        <YumiEmptyState
          action={
            <YumiButton
              onClick={() => onNavigate(snapshot.firstUseGuide!.navigationTarget)}
              variant="primary"
            >
              {snapshot.firstUseGuide.actionLabel}
            </YumiButton>
          }
          scenario="first-use"
          description={snapshot.firstUseGuide.description}
          title={snapshot.firstUseGuide.title}
        />
      ) : null}
      {!loading && !snapshot?.firstUseGuide ? (
        <>
          <nav aria-label="工作台事项视图" className="yumi-page-tabs">
            {(['decision', 'advance'] as WorkbenchView[]).map((view) => (
              <YumiButton
                aria-pressed={activeView === view}
                key={view}
                onClick={() => chooseView(view)}
                variant={activeView === view ? 'secondary' : 'ghost'}
              >
                {viewLabels[view]}（{view === 'decision' ? decisionCount : advanceCount}）
              </YumiButton>
            ))}
          </nav>
          {items.length === 0 ? (
            <YumiEmptyState
              description={
                activeView === 'decision'
                  ? '当前没有需要负责人确认的事项。'
                  : '当前没有可以直接推进的事项。'
              }
              title={activeView === 'decision' ? '暂时不需要你决定' : '暂时没有待推进事项'}
            />
          ) : (
            <YumiBusinessList>
              {items.map((item) => {
                const status = statusFor(item.priority)
                const amountOrQuantity = formatAmountOrQuantity(item)
                return (
                  <YumiBusinessListItem
                    key={item.id}
                    meta={item.dueHint ?? '进入实际处理区'}
                    metrics={
                      amountOrQuantity
                        ? [
                            {
                              label: item.quantityOrAmount?.kind === 'amount' ? '金额' : '数量',
                              value: amountOrQuantity
                            }
                          ]
                        : []
                    }
                    onOpen={() => onNavigate(item.navigationTarget)}
                    status={<YumiStatusTag tone={status.tone}>{status.label}</YumiStatusTag>}
                    summary={item.subject.description ?? '进入实际处理区继续处理'}
                    title={item.subject.title}
                  />
                )
              })}
            </YumiBusinessList>
          )}
        </>
      ) : null}
    </section>
  )
}
