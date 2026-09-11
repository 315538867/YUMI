import { useMemo, useState } from 'react'
import type { V2NavigationTarget, V2WorkbenchItem } from '@shared/contracts/index'
import { useWorkbench } from '../../composables/use-workbench'
import { formatCents } from '../../composables/v2-utils'
import {
  YumiDataTable,
  YumiListSurface,
  YumiListToolbar,
  YumiButton,
  YumiEmptyState,
  YumiPageHeader,
  YumiPrimaryTabs,
  YumiSection,
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
        description="只显示由订单、排班、售后、工资和财务事实生成的当前处理入口。"
        title="工作台"
        actions={{
          ariaLabel: '工作台页面动作',
          secondaryAction: {
            label: '刷新',
            onClick: () => void reload()
          }
        }}
      />
      {loading ? (
        <YumiEmptyState
          description="正在汇总当前需要处理的业务事实。"
          scenario="loading"
          title="读取工作台中…"
        />
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
          <YumiPrimaryTabs
            ariaLabel="工作台事项视图"
            items={[
              { id: 'decision', label: `${viewLabels.decision}（${decisionCount}）` },
              { id: 'advance', label: `${viewLabels.advance}（${advanceCount}）` }
            ]}
            onValueChange={chooseView}
            value={activeView}
          />
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
            <YumiSection
              ariaLabel="工作台事项"
              description="按当前视图集中处理由业务事实生成的待办事项。"
              title={viewLabels[activeView]}
            >
              <YumiListSurface>
                <YumiListToolbar
                  ariaLabel="工作台事项列表工具"
                  countLabel={`共 ${items.length} 项待处理事项`}
                />
                <YumiDataTable
                  ariaLabel="工作台事项列表"
                  columns={[
                    {
                      key: 'subject',
                      label: '待处理事项',
                      render: (item) => (
                        <div className="yumi-list-cell">
                          <strong>{item.subject.title}</strong>
                          <span>{item.subject.description ?? '进入实际处理区继续处理'}</span>
                        </div>
                      )
                    },
                    {
                      key: 'priority',
                      label: '优先级',
                      render: (item) => {
                        const status = statusFor(item.priority)
                        return <YumiStatusTag tone={status.tone}>{status.label}</YumiStatusTag>
                      }
                    },
                    {
                      key: 'amountOrQuantity',
                      label: '金额 / 数量',
                      render: (item) => formatAmountOrQuantity(item) ?? '—'
                    },
                    {
                      key: 'dueHint',
                      label: '处理时点',
                      render: (item) => item.dueHint ?? '进入实际处理区'
                    },
                    {
                      align: 'right',
                      key: 'actions',
                      label: '操作',
                      render: (item) => (
                        <YumiButton
                          aria-label={`处理事项：${item.subject.title}`}
                          onClick={() => onNavigate(item.navigationTarget)}
                          variant="secondary"
                        >
                          进入处理
                        </YumiButton>
                      )
                    }
                  ]}
                  getRowKey={(item) => item.id}
                  rows={items}
                />
              </YumiListSurface>
            </YumiSection>
          )}
        </>
      ) : null}
    </section>
  )
}
