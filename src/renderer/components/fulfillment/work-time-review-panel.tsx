import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type {
  V2WorkTimeReview,
  V2WorkTimeReviewProcessType,
  V2Worker
} from '@shared/contracts/index'
import { calculateWorkTimeComparison } from '@shared/calculations'
import type {
  FulfillmentQueueItem,
  FulfillmentScheduledTask
} from '../../composables/use-fulfillment'
import { formatCents, getErrorMessage } from '../../composables/v2-utils'
import {
  useWorkTimeReviews,
  type WorkTimeReviewGroup
} from '../../composables/use-work-time-reviews'
import {
  YumiButton,
  YumiCalculatedAmount,
  YumiDataTable,
  YumiDetailList,
  YumiDialog,
  YumiField,
  YumiFieldLabel,
  YumiFormMessage,
  YumiNumberField,
  YumiSection,
  YumiStatusTag,
  YumiTextArea,
  useYumiNotificationMessage
} from '../ui'

const processLabels: Record<V2WorkTimeReviewProcessType, string> = {
  fluffing_bagging: '捏毛装袋',
  edge_sewing: '缝边',
  packing: '打包发货'
}

const statusMeta: Record<
  V2WorkTimeReview['status'],
  { label: string; tone: 'neutral' | 'success' | 'danger' }
> = {
  draft: { label: '草稿', tone: 'neutral' },
  confirmed: { label: '已确认', tone: 'success' },
  voided: { label: '已作废', tone: 'danger' }
}

export interface MakingReviewEntry {
  item: FulfillmentQueueItem
  task: FulfillmentScheduledTask
  workerName: string
  assignedOn: string
  productName: string
  plannedQuantity: number
}

type PendingRow =
  | {
      kind: 'making'
      key: string
      assignedOn: string
      workerName: string
      entry: MakingReviewEntry
    }
  | {
      kind: 'timed'
      key: string
      assignedOn: string
      workerName: string
      group: WorkTimeReviewGroup
    }

function groupSummary(group: WorkTimeReviewGroup): string {
  const products = group.candidates
    .flatMap((candidate) => candidate.tasks)
    .map((task) =>
      task.plannedQuantity === null
        ? task.productName
        : `${task.productName} ${task.plannedQuantity} 件`
    )
    .join(' + ')
  return `${group.candidates.length} 个安排 · ${products}`
}

/**
 * 待核算工作区：制作结果待确认与计时工序待核算统一列表，用类型标签区分制品（制作）与非制品（计时工序）。
 * 制作事项进入完成数量与质量确认流程；计时事项按员工、日期、工序归组，在弹窗内登记整段时长与多商品完成数量。
 */
export function WorkTimeReviewPanel(props: {
  workers: V2Worker[]
  makingEntries: MakingReviewEntry[]
  onOpenMakingTask(item: FulfillmentQueueItem, task: FulfillmentScheduledTask): void
  onChanged(): void
}) {
  const { reviews, loading, loadError, createDraft, confirm, voidReview, loadPendingGroups } =
    useWorkTimeReviews()
  const [groups, setGroups] = useState<WorkTimeReviewGroup[]>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [reviewingGroup, setReviewingGroup] = useState<WorkTimeReviewGroup | null>(null)
  const [approvedMinutes, setApprovedMinutes] = useState('0')
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<V2WorkTimeReview | null>(null)
  const [voidReason, setVoidReason] = useState('')
  useYumiNotificationMessage(loadError)

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true)
    try {
      setGroups(await loadPendingGroups())
      setListError(null)
    } catch (groupsError) {
      setListError(getErrorMessage(groupsError))
    } finally {
      setGroupsLoading(false)
    }
  }, [loadPendingGroups])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  const workerNameOf = useCallback(
    (workerId: string) =>
      props.workers.find((worker) => worker.id === workerId)?.name ?? '已删除人员',
    [props.workers]
  )

  const rows = useMemo<PendingRow[]>(() => {
    const makingRows: PendingRow[] = props.makingEntries.map((entry) => ({
      kind: 'making',
      key: `making-${entry.task.taskId}`,
      assignedOn: entry.assignedOn,
      workerName: entry.workerName,
      entry
    }))
    const timedRows: PendingRow[] = groups.map((group) => ({
      kind: 'timed',
      key: group.key,
      assignedOn: group.assignedOn,
      workerName: workerNameOf(group.workerId),
      group
    }))
    return [...makingRows, ...timedRows].sort(
      (left, right) =>
        right.assignedOn.localeCompare(left.assignedOn) ||
        left.workerName.localeCompare(right.workerName) ||
        left.kind.localeCompare(right.kind)
    )
  }, [groups, props.makingEntries, workerNameOf])

  const selectedTasks = reviewingGroup
    ? reviewingGroup.candidates.flatMap((candidate) => candidate.tasks)
    : []
  const completedItems = selectedTasks.map((task) => ({
    label: task.productName,
    completedQuantity: Number(quantities[task.taskId] || '0') || 0,
    expectedMinutesPerUnit: task.expectedMinutesPerUnit
  }))
  const comparison = calculateWorkTimeComparison({
    approvedMinutes: Number(approvedMinutes) || 0,
    items: completedItems
  })

  const openReviewDialog = (group: WorkTimeReviewGroup) => {
    setReviewingGroup(group)
    setApprovedMinutes('0')
    setQuantities({})
    setNotes('')
    setError(null)
  }

  const submitReview = async (confirmAfterSave: boolean) => {
    if (!reviewingGroup) return
    setBusy(true)
    setError(null)
    try {
      const draft = await createDraft({
        workerId: reviewingGroup.workerId,
        workedOn: reviewingGroup.assignedOn,
        processType: reviewingGroup.processType,
        approvedMinutes: Number(approvedMinutes) || 0,
        assignmentIds: reviewingGroup.candidates.map((candidate) => candidate.assignmentId),
        items: selectedTasks.map((task) => ({
          processTaskId: task.taskId,
          completedQuantity: Number(quantities[task.taskId] || '0') || 0
        })),
        reviewNote: notes || null
      })
      if (confirmAfterSave) await confirm(draft.id)
      setReviewingGroup(null)
      await loadGroups()
      props.onChanged()
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setBusy(false)
    }
  }

  const submitVoid = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!voidTarget) return
    setBusy(true)
    setError(null)
    try {
      await voidReview(voidTarget.id, { reason: voidReason })
      setVoidTarget(null)
      setVoidReason('')
      await loadGroups()
      props.onChanged()
    } catch (voidError) {
      setError(getErrorMessage(voidError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <YumiSection
        description={`制作（制品）与计时工序（非制品）待核算事项统一列出；共 ${rows.length} 项待处理。`}
        title="待核算"
      >
        {listError ? <YumiFormMessage tone="error">{listError}</YumiFormMessage> : null}
        {groupsLoading && !rows.length ? (
          <YumiFormMessage tone="hint">正在读取待核算事项…</YumiFormMessage>
        ) : rows.length ? (
          <YumiDataTable
            ariaLabel="待核算事项"
            columns={[
              {
                key: 'type',
                label: '类型',
                render: (row) =>
                  row.kind === 'making' ? (
                    <YumiStatusTag tone="brand">制作</YumiStatusTag>
                  ) : (
                    <YumiStatusTag tone="neutral">
                      {processLabels[row.group.processType]}
                    </YumiStatusTag>
                  )
              },
              { key: 'workerName', label: '人员', render: (row) => row.workerName },
              { key: 'assignedOn', label: '工作日期', render: (row) => row.assignedOn },
              {
                key: 'content',
                label: '待核算内容',
                render: (row) =>
                  row.kind === 'making'
                    ? `${row.entry.productName} · 计划 ${row.entry.plannedQuantity} 件`
                    : groupSummary(row.group)
              },
              {
                align: 'right',
                key: 'actions',
                label: '操作',
                render: (row) =>
                  row.kind === 'making' ? (
                    <YumiButton
                      onClick={() => props.onOpenMakingTask(row.entry.item, row.entry.task)}
                      variant="secondary"
                    >
                      确认结果
                    </YumiButton>
                  ) : (
                    <YumiButton onClick={() => openReviewDialog(row.group)} variant="secondary">
                      登记核算
                    </YumiButton>
                  )
              }
            ]}
            getRowKey={(row) => row.key}
            rows={rows}
          />
        ) : (
          <YumiFormMessage tone="hint">
            暂无待核算事项；制作完成申报或计时工序安排完成后会在这里等待核算。
          </YumiFormMessage>
        )}
      </YumiSection>

      <YumiSection
        description="确认后冻结工作日期生效的个人时薪并提交商品完成结果；重复确认不会重复增加工资来源。"
        title="已登记工时核算"
      >
        {reviews.length ? (
          <YumiDataTable
            ariaLabel="工时核算记录"
            columns={[
              { key: 'workedOn', label: '工作日期', render: (review) => review.workedOn },
              {
                key: 'processType',
                label: '工序',
                render: (review) => processLabels[review.processType]
              },
              {
                key: 'approvedMinutes',
                label: '核算分钟',
                align: 'right',
                render: (review) => `${review.approvedMinutes} 分钟`
              },
              {
                key: 'hourlyWage',
                label: '冻结时薪',
                align: 'right',
                render: (review) =>
                  review.hourlyWageCentsSnapshot === null
                    ? '待确认'
                    : `${formatCents(review.hourlyWageCentsSnapshot)} / 小时`
              },
              {
                key: 'items',
                label: '完成明细',
                render: (review) =>
                  `${review.items.length} 个商品 · ${review.items.reduce(
                    (total, item) => total + item.completedQuantity,
                    0
                  )} 件`
              },
              {
                key: 'status',
                label: '状态',
                render: (review) => (
                  <YumiStatusTag tone={statusMeta[review.status].tone}>
                    {statusMeta[review.status].label}
                  </YumiStatusTag>
                )
              },
              {
                align: 'right',
                key: 'actions',
                label: '操作',
                render: (review) => (
                  <div className="yumi-record-action-bar">
                    {review.status === 'draft' ? (
                      <YumiButton
                        loading={busy}
                        onClick={() => void confirm(review.id).catch(() => undefined)}
                        variant="primary"
                      >
                        确认工时
                      </YumiButton>
                    ) : null}
                    {review.status === 'confirmed' ? (
                      <YumiButton onClick={() => setVoidTarget(review)} variant="ghost">
                        作废重录
                      </YumiButton>
                    ) : null}
                  </div>
                )
              }
            ]}
            getRowKey={(review) => review.id}
            rows={reviews}
          />
        ) : loading ? (
          <YumiFormMessage tone="hint">正在读取工时核算记录…</YumiFormMessage>
        ) : (
          <YumiFormMessage tone="hint">还没有工时核算记录。</YumiFormMessage>
        )}
      </YumiSection>

      <YumiDialog
        description="整段时长与各商品完成数量会在确认后写入工资来源；核对提示仅供人工参考。"
        footer={
          <>
            <YumiButton
              disabled={busy}
              onClick={() => setReviewingGroup(null)}
              variant="ghost"
            >
              取消
            </YumiButton>
            <YumiButton
              loading={busy}
              onClick={() => void submitReview(false)}
              variant="secondary"
            >
              保存草稿
            </YumiButton>
            <YumiButton
              form="work-time-review-form"
              loading={busy}
              type="submit"
              variant="primary"
            >
              保存并确认
            </YumiButton>
          </>
        }
        onOpenChange={(open) => {
          if (!open) setReviewingGroup(null)
        }}
        open={reviewingGroup !== null}
        title="登记工时核算"
      >
        {reviewingGroup ? (
          <form
            id="work-time-review-form"
            onSubmit={(event) => {
              event.preventDefault()
              void submitReview(true)
            }}
          >
            <p className="yumi-work-time-review__dialog-meta">
              {`${workerNameOf(reviewingGroup.workerId)} · ${reviewingGroup.assignedOn} · ${
                processLabels[reviewingGroup.processType]
              } · 含 ${reviewingGroup.candidates.length} 个安排`}
            </p>
            <div className="yumi-form-grid yumi-form-grid--two">
              <YumiField hint="录入整段核算时长；同一时段的提成按各商品完成数量计算。">
                <YumiFieldLabel htmlFor="review-approved-minutes" required>
                  负责人核算时长（分钟）
                </YumiFieldLabel>
                <YumiNumberField
                  id="review-approved-minutes"
                  onChange={(event) => setApprovedMinutes(event.target.value)}
                  required
                  value={approvedMinutes}
                />
              </YumiField>
              {selectedTasks.map((task) => (
                <YumiField key={task.taskId}>
                  <YumiFieldLabel htmlFor={`review-quantity-${task.taskId}`}>
                    {task.productName} 完成数量（件）
                  </YumiFieldLabel>
                  <YumiNumberField
                    id={`review-quantity-${task.taskId}`}
                    onChange={(event) =>
                      setQuantities((current) => ({
                        ...current,
                        [task.taskId]: event.target.value
                      }))
                    }
                    value={quantities[task.taskId] ?? ''}
                  />
                </YumiField>
              ))}
            </div>
            <div className="yumi-work-time-review__comparison">
              <YumiDetailList
                ariaLabel="工时核对"
                items={[
                  {
                    label: '预计总分钟',
                    value: `${comparison.expectedMinutes.minutes} 分钟`
                  },
                  { label: '时间差', value: `${comparison.differenceMinutes} 分钟` }
                ]}
              />
              <p className="yumi-work-time-review__formula">
                {comparison.expectedMinutes.expression}：
                {comparison.expectedMinutes.substitutedExpression}
              </p>
              <YumiCalculatedAmount calculation={comparison.efficiency} />
              {comparison.attentionMessage ? (
                <YumiFormMessage tone="hint">{comparison.attentionMessage}</YumiFormMessage>
              ) : null}
            </div>
            <YumiField>
              <YumiFieldLabel htmlFor="review-note">核算备注</YumiFieldLabel>
              <YumiTextArea
                id="review-note"
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
            </YumiField>
            {error ? <YumiFormMessage tone="error">{error}</YumiFormMessage> : null}
          </form>
        ) : null}
      </YumiDialog>

      <YumiDialog
        description="仅当完成结果未被下游工序消耗且工时未进入已确认结算时才可作废。"
        footer={
          <>
            <YumiButton onClick={() => setVoidTarget(null)} variant="ghost">
              取消
            </YumiButton>
            <YumiButton
              form="work-time-review-void-form"
              loading={busy}
              type="submit"
              variant="primary"
            >
              确认作废
            </YumiButton>
          </>
        }
        onOpenChange={(open) => {
          if (!open) setVoidTarget(null)
        }}
        open={voidTarget !== null}
        title="作废工时核算？"
      >
        <form id="work-time-review-void-form" onSubmit={submitVoid}>
          <YumiField>
            <YumiFieldLabel htmlFor="review-void-reason" required>
              作废原因
            </YumiFieldLabel>
            <YumiTextArea
              id="review-void-reason"
              onChange={(event) => setVoidReason(event.target.value)}
              required
              value={voidReason}
            />
          </YumiField>
          {error ? <YumiFormMessage tone="error">{error}</YumiFormMessage> : null}
        </form>
      </YumiDialog>
    </>
  )
}
