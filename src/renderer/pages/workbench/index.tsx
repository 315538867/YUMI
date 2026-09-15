import { useMemo, useState, type CSSProperties } from 'react'
import type { V2NavigationTarget, V2WorkbenchItem } from '@shared/contracts/index'
import { useWorkbench } from '../../composables/use-workbench'
import { formatCents } from '../../composables/v2-utils'
import {
  YumiDataTable,
  YumiListSurface,
  YumiListToolbar,
  YumiMetricStrip,
  YumiButton,
  YumiEmptyState,
  YumiPageHeader,
  YumiPrimaryTabs,
  YumiSection,
  YumiStatusTag,
  useYumiNotificationMessage
} from '../../components/ui'

type WorkbenchView = 'overview' | 'decision' | 'advance'

type WorkbenchPageProps = {
  initialView?: WorkbenchView
  onNavigate(target: V2NavigationTarget): void
  onViewChange?(view: WorkbenchView): void
}

const viewLabels: Record<WorkbenchView, string> = {
  overview: '总览',
  decision: '需要我决定',
  advance: '可以推进'
}

/** 仅展示工作台快照中已有的履约类待办；不是生产数量、预测或自动派工。 */
const workbenchDistributionDefinitions = [
  { kinds: ['process_task', 'work_time_review'] as const, label: '排班与核算' },
  { kinds: ['shipment', 'after_sales_handling'] as const, label: '订单履约' },
  { kinds: ['settlement_confirmation', 'refund'] as const, label: '工资结算' },
  { kinds: ['reimbursement'] as const, label: '财务报销' }
] satisfies ReadonlyArray<{
  kind?: never
  kinds: readonly V2WorkbenchItem['kind'][]
  label: string
}>

const fulfillmentStageDefinitions = [
  { kind: 'process_task', label: '待执行' },
  { kind: 'work_time_review', label: '待核算' },
  { kind: 'shipment', label: '待发货' }
] as const satisfies ReadonlyArray<{ kind: V2WorkbenchItem['kind']; label: string }>

function summarizeFulfillmentStages(items: readonly V2WorkbenchItem[]) {
  return fulfillmentStageDefinitions
    .map((stage) => ({
      ...stage,
      count: items.filter((item) => item.kind === stage.kind).length
    }))
    .filter((stage) => stage.count > 0)
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
  initialView = 'overview',
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
  const allItems = useMemo(
    () => [...(snapshot?.decisionItems ?? []), ...(snapshot?.advanceItems ?? [])],
    [snapshot]
  )
  const items = useMemo(
    () =>
      activeView === 'decision' ? (snapshot?.decisionItems ?? []) : (snapshot?.advanceItems ?? []),
    [activeView, snapshot]
  )
  const decisionCount = snapshot?.decisionItems.length ?? 0
  const advanceCount = snapshot?.advanceItems.length ?? 0
  const fulfillmentStages = useMemo(() => summarizeFulfillmentStages(allItems), [allItems])
  const largestFulfillmentStageCount = Math.max(...fulfillmentStages.map((stage) => stage.count), 1)
  const priorityItems = useMemo(
    () =>
      [...allItems]
        .sort((left, right) => {
          const priorityOrder = { urgent: 0, high: 1, normal: 2 } as const
          return priorityOrder[left.priority] - priorityOrder[right.priority]
        })
        .slice(0, 3),
    [allItems]
  )
  const priorityCount = allItems.filter((item) => item.priority !== 'normal').length
  const itemDistribution = useMemo(
    () =>
      workbenchDistributionDefinitions
        .map((group) => {
          const groupItems = allItems.filter((item) => group.kinds.includes(item.kind))
          return {
            ...group,
            count: groupItems.length,
            target: groupItems[0]?.navigationTarget ?? null
          }
        })
        .filter((group) => group.count > 0),
    [allItems]
  )

  return (
    <section className="yumi-page yumi-workbench-page">
      <YumiPageHeader
        description="只显示由订单、排班、售后、工资和财务事实生成的当前处理入口。"
        title="工作台"
        actions={{
          ariaLabel: '工作台页面动作',
          visibleActions: [
            {
              label: '刷新',
              onClick: () => void reload()
            }
          ]
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
          <YumiMetricStrip
            ariaLabel="工作台概览"
            items={[
              {
                label: '需要我决定',
                tone: decisionCount > 0 ? 'warning' : 'default',
                value: `${decisionCount} 项`
              },
              {
                label: '可以推进',
                tone: advanceCount > 0 ? 'brand' : 'default',
                value: `${advanceCount} 项`
              },
              {
                label: '优先处理',
                tone: priorityCount > 0 ? 'warning' : 'default',
                value: `${priorityCount} 项`
              },
              {
                label: '数据截至',
                value: snapshot?.generatedOn ?? '—'
              }
            ]}
          />
          <YumiPrimaryTabs
            ariaLabel="工作台事项视图"
            items={[
              { id: 'overview', label: viewLabels.overview },
              { id: 'decision', label: `${viewLabels.decision}（${decisionCount}）` },
              { id: 'advance', label: `${viewLabels.advance}（${advanceCount}）` }
            ]}
            onValueChange={chooseView}
            value={activeView}
          />
          {activeView === 'overview' ? (
            <div className="yumi-workbench-overview">
              <section aria-label="订单履约阶段分布" className="yumi-workbench-stage-chart">
                <div className="yumi-workbench-stage-chart__header">
                  <div>
                    <h2>订单履约阶段分布</h2>
                    <p>读取当前工作台中的履约待办，用来判断先处理哪个阶段。</p>
                  </div>
                </div>
                {fulfillmentStages.length > 0 ? (
                  <ul className="yumi-workbench-stage-chart__list">
                    {fulfillmentStages.map((stage) => (
                      <li key={stage.kind}>
                        <div>
                          <span>{stage.label}</span>
                          <strong>{stage.count} 项</strong>
                        </div>
                        <span
                          aria-hidden="true"
                          className="yumi-workbench-stage-chart__track"
                          style={
                            {
                              '--yumi-workbench-stage-ratio': `${Math.round((stage.count / largestFulfillmentStageCount) * 100)}%`
                            } as CSSProperties
                          }
                        >
                          <i />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="yumi-workbench-stage-chart__empty">当前没有履约待办。</p>
                )}
              </section>
              <section aria-label="当前事项结构" className="yumi-workbench-item-structure">
                <div>
                  <h2>当前事项结构</h2>
                  <p>按负责人是否需要决策归类，不新增手工待办或预测指标。</p>
                </div>
                <div className="yumi-workbench-item-structure__body">
                  <strong aria-label={`当前共 ${allItems.length} 项事项`}>{allItems.length}</strong>
                  <span>当前事项</span>
                  <dl>
                    <div>
                      <dt>可以推进</dt>
                      <dd>{advanceCount} 项</dd>
                    </div>
                    <div>
                      <dt>需要我决定</dt>
                      <dd>{decisionCount} 项</dd>
                    </div>
                    <div>
                      <dt>优先处理</dt>
                      <dd>{priorityCount} 项</dd>
                    </div>
                  </dl>
                </div>
              </section>
              <section aria-label="现在优先处理" className="yumi-workbench-priority-list">
                <div className="yumi-workbench-priority-list__header">
                  <div>
                    <h2>现在优先处理</h2>
                    <p>按紧急程度排在最前，只保留最需要负责人关注的事项。</p>
                  </div>
                  <YumiButton onClick={() => chooseView('decision')} variant="secondary">
                    查看全部事项
                  </YumiButton>
                </div>
                {priorityItems.length > 0 ? (
                  <ol>
                    {priorityItems.map((item, index) => (
                      <li key={item.id}>
                        <span className="yumi-workbench-priority-list__index">{index + 1}</span>
                        <div>
                          <strong>{item.subject.title}</strong>
                          <span>
                            {item.subject.description ?? item.dueHint ?? '进入实际处理区继续处理'}
                          </span>
                        </div>
                        <YumiButton
                          aria-label={`处理事项：${item.subject.title}`}
                          onClick={() => onNavigate(item.navigationTarget)}
                          variant="secondary"
                        >
                          进入处理
                        </YumiButton>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="yumi-workbench-priority-list__empty">当前没有待处理事项。</p>
                )}
              </section>
              <section aria-label="事项分布" className="yumi-workbench-distribution">
                <div>
                  <h2>事项分布</h2>
                  <p>按已有事项类型归类，点击后进入对应业务区继续处理。</p>
                </div>
                {itemDistribution.length > 0 ? (
                  <ul>
                    {itemDistribution.map((group) => (
                      <li key={group.label}>
                        <div>
                          <strong>{group.label}</strong>
                          <span>{group.count} 项待处理</span>
                        </div>
                        {group.target ? (
                          <YumiButton onClick={() => onNavigate(group.target!)} variant="secondary">
                            查看处理
                          </YumiButton>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="yumi-workbench-distribution__empty">当前没有待分派的业务事项。</p>
                )}
              </section>
            </div>
          ) : items.length === 0 ? (
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
