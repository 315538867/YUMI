import { useMemo, useState } from 'react'
import type { V2Worker, V2WorkTimeReview } from '@shared/contracts/index'
import { getErrorMessage } from '../../composables/v2-utils'
import {
  buildPendingRows,
  buildRecordRows,
  buildWorkerNames,
  currentBusinessDate,
  recordLockOf,
  useWorkTimeReviews,
  type PendingMakingRow,
  type PendingTimedRow,
  type WorkTimeReviewItemLabel,
  type WorkTimeReviewRecordRow
} from '../../composables/use-work-time-reviews'
import {
  MakingReviewDialog,
  TimedReviewDialog,
  type MakingReviewDialogTarget,
  type MakingReviewValues,
  type TimedReviewDialogTarget,
  type TimedReviewValues
} from './work-time-review-forms'
import { workTimeProcessLabels } from './work-time-review-helpers'
import {
  YumiButton,
  YumiDataTable,
  YumiDetailList,
  YumiDialog,
  YumiField,
  YumiFieldLabel,
  YumiFormMessage,
  YumiRecordActionBar,
  type YumiRecordAction,
  YumiSection,
  YumiStatusTag,
  YumiTextArea,
  useYumiNotificationMessage
} from '../ui'

function timedRecordTotal(row: Extract<WorkTimeReviewRecordRow, { kind: 'timed' }>): number {
  return row.review.items.reduce((total, item) => total + item.completedQuantity, 0)
}

function reviewStatusMeta(review: V2WorkTimeReview): {
  label: string
  tone: 'success' | 'neutral'
} {
  if (review.status === 'draft') return { label: '历史草稿', tone: 'neutral' }
  return { label: '已核算', tone: 'success' }
}

/**
 * 单次核算工作区：待核算只提供“核算”入口，一次提交完成制作或计时核算；
 * 已核算区域提供查看、更正与作废，锁定记录展示不可操作原因与调整指引。
 */
export function WorkTimeReviewPanel({
  onChanged,
  workers
}: {
  onChanged(): void
  workers: V2Worker[]
}) {
  const {
    assignments,
    reviews,
    itemLabels,
    loading,
    loadError,
    listCandidates,
    reviewMaking,
    correctMakingReview,
    voidMakingReview,
    reviewTimed,
    correctTimed,
    voidTimed
  } = useWorkTimeReviews()
  const [makingTarget, setMakingTarget] = useState<MakingReviewDialogTarget | null>(null)
  const [timedTarget, setTimedTarget] = useState<TimedReviewDialogTarget | null>(null)
  const [detailRow, setDetailRow] = useState<WorkTimeReviewRecordRow | null>(null)
  const [voidRow, setVoidRow] = useState<WorkTimeReviewRecordRow | null>(null)
  useYumiNotificationMessage(loadError)

  const workerNames = useMemo(() => buildWorkerNames(workers), [workers])
  const pendingRows = useMemo(
    () => buildPendingRows(assignments, workerNames, itemLabels, currentBusinessDate()),
    [assignments, itemLabels, workerNames]
  )
  const recordRows = useMemo(
    () => buildRecordRows(assignments, reviews, workerNames, itemLabels),
    [assignments, itemLabels, reviews, workerNames]
  )

  const openMakingReview = (row: PendingMakingRow) => {
    setMakingTarget({
      mode: 'create',
      taskId: row.taskId,
      resultId: null,
      workerName: row.workerName,
      assignedOn: row.assignedOn,
      productName: row.productName,
      plannedQuantity: row.plannedQuantity,
      reviewedOn: currentBusinessDate(),
      note: null,
      completedQuantity: null,
      qualifiedQuantity: null
    })
  }

  const openTimedReview = (row: PendingTimedRow) => {
    setTimedTarget({
      mode: 'create',
      assignmentId: row.assignmentId,
      reviewId: null,
      workerName: row.workerName,
      assignedOn: row.assignedOn,
      processType: row.processType,
      review: null
    })
  }

  const openCorrection = (row: WorkTimeReviewRecordRow) => {
    if (row.kind === 'making') {
      setMakingTarget({
        mode: 'correct',
        taskId: row.taskId,
        resultId: row.summary.resultId,
        workerName: row.workerName,
        assignedOn: row.assignedOn,
        productName: row.productName,
        plannedQuantity: row.plannedQuantity,
        reviewedOn: row.summary.reviewedOn,
        note: row.summary.note,
        completedQuantity: row.summary.completedQuantity,
        qualifiedQuantity: row.summary.qualifiedQuantity
      })
      return
    }
    if (!row.review.workAssignmentId) return
    setTimedTarget({
      mode: 'correct',
      assignmentId: row.review.workAssignmentId,
      reviewId: row.review.id,
      workerName: row.workerName,
      assignedOn: row.review.workedOn,
      processType: row.review.processType,
      review: row.review
    })
  }

  const submitMaking = async (values: MakingReviewValues) => {
    const target = makingTarget
    if (!target) return
    if (target.mode === 'correct' && target.resultId) {
      await correctMakingReview({
        resultId: target.resultId,
        completedQuantity: values.completedQuantity,
        qualifiedQuantity: values.qualifiedQuantity,
        reviewedOn: target.reviewedOn,
        reason: values.reason ?? '',
        note: values.note
      })
    } else {
      await reviewMaking({
        processTaskId: target.taskId,
        completedQuantity: values.completedQuantity,
        qualifiedQuantity: values.qualifiedQuantity,
        reviewedOn: target.reviewedOn,
        note: values.note
      })
    }
    setMakingTarget(null)
    onChanged()
  }

  const submitTimed = async (values: TimedReviewValues) => {
    const target = timedTarget
    if (!target) return
    if (target.mode === 'correct' && target.reviewId) {
      await correctTimed({
        id: target.reviewId,
        startedAt: values.startedAt,
        endedAt: values.endedAt,
        items: values.items,
        reason: values.reason ?? '',
        reviewNote: values.note
      })
    } else {
      await reviewTimed({
        workAssignmentId: target.assignmentId,
        startedAt: values.startedAt,
        endedAt: values.endedAt,
        items: values.items,
        reviewNote: values.note
      })
    }
    setTimedTarget(null)
    onChanged()
  }

  const submitVoid = async (reason: string) => {
    const row = voidRow
    if (!row) return
    if (row.kind === 'making') {
      await voidMakingReview({ resultId: row.summary.resultId, reason })
    } else {
      await voidTimed(row.review.id, { reason })
    }
    setVoidRow(null)
    onChanged()
  }

  return (
    <>
      <YumiSection
        description={`制作任务与计时班次都在这里一次完成核算；共 ${pendingRows.length} 项待核算。`}
        title="待核算"
      >
        {loading && !pendingRows.length ? (
          <YumiFormMessage tone="hint">正在读取待核算事项…</YumiFormMessage>
        ) : pendingRows.length ? (
          <YumiDataTable
            ariaLabel="待核算事项"
            columns={[
              {
                key: 'processType',
                label: '工序',
                render: (row) =>
                  row.kind === 'making' ? (
                    <YumiStatusTag tone="brand">制作</YumiStatusTag>
                  ) : (
                    <YumiStatusTag tone="neutral">
                      {workTimeProcessLabels[row.processType]}
                    </YumiStatusTag>
                  )
              },
              { key: 'workerName', label: '人员', render: (row) => row.workerName },
              { key: 'assignedOn', label: '排班日期', render: (row) => row.assignedOn },
              {
                key: 'content',
                label: '待核算内容',
                render: (row) =>
                  row.kind === 'making'
                    ? `${row.productName} · 计划 ${row.plannedQuantity} 件`
                    : '实际时间范围与跨订单商品完成数量（核算时填写）'
              },
              {
                align: 'right',
                key: 'actions',
                label: '操作',
                render: (row) => (
                  <YumiButton
                    onClick={() =>
                      row.kind === 'making' ? openMakingReview(row) : openTimedReview(row)
                    }
                    variant="secondary"
                  >
                    核算
                  </YumiButton>
                )
              }
            ]}
            getRowKey={(row) => row.key}
            rows={pendingRows}
          />
        ) : (
          <YumiFormMessage tone="hint">
            暂无待核算事项；制作排班与计时班次会在这里等待一次核算。
          </YumiFormMessage>
        )}
      </YumiSection>

      <YumiSection
        description="列出当前有效核算记录；更正与作废需要填写原因，锁定记录只能走履约调整或后续结算调整。"
        title="已核算记录"
      >
        {loading && !recordRows.length ? (
          <YumiFormMessage tone="hint">正在读取已核算记录…</YumiFormMessage>
        ) : recordRows.length ? (
          <YumiDataTable
            ariaLabel="已核算记录"
            columns={[
              {
                key: 'processType',
                label: '工序',
                render: (row) =>
                  row.kind === 'making' ? (
                    <YumiStatusTag tone="brand">制作</YumiStatusTag>
                  ) : (
                    <YumiStatusTag tone="neutral">
                      {workTimeProcessLabels[row.review.processType]}
                    </YumiStatusTag>
                  )
              },
              { key: 'workerName', label: '人员', render: (row) => row.workerName },
              {
                key: 'reviewedOn',
                label: '核算日期',
                render: (row) =>
                  row.kind === 'making' ? row.summary.reviewedOn : row.review.workedOn
              },
              {
                key: 'content',
                label: '核算内容',
                render: (row) =>
                  row.kind === 'making'
                    ? `${row.productName} · 实际产出 ${row.summary.completedQuantity} 件 · 合格 ${row.summary.qualifiedQuantity} 件`
                    : `${row.review.items.length} 个商品 · 合计 ${timedRecordTotal(row)} 件 · ${row.review.approvedMinutes} 分钟`
              },
              {
                key: 'status',
                label: '状态',
                render: (row) =>
                  row.kind === 'making' ? (
                    <YumiStatusTag tone="success">已核算</YumiStatusTag>
                  ) : (
                    <YumiStatusTag tone={reviewStatusMeta(row.review).tone}>
                      {reviewStatusMeta(row.review).label}
                    </YumiStatusTag>
                  )
              },
              {
                key: 'lock',
                label: '锁定与指引',
                render: (row) => {
                  const lock = recordLockOf(row)
                  return lock.locked ? (
                    <span className="yumi-work-time-review__lock">{lock.message}</span>
                  ) : (
                    '—'
                  )
                }
              },
              {
                align: 'right',
                key: 'actions',
                label: '操作',
                render: (row) => {
                  const lock = recordLockOf(row)
                  const readOnly =
                    row.kind === 'timed' &&
                    (row.review.status === 'draft' || !row.review.workAssignmentId)
                  const actions: YumiRecordAction[] = [
                    { label: '查看', onClick: () => setDetailRow(row), variant: 'ghost' }
                  ]
                  if (!readOnly) {
                    actions.push(
                      {
                        disabled: lock.locked,
                        label: '更正',
                        onClick: () => openCorrection(row),
                        title: lock.message ?? undefined,
                        variant: 'secondary'
                      },
                      {
                        disabled: lock.locked,
                        label: '作废',
                        onClick: () => setVoidRow(row),
                        title: lock.message ?? undefined,
                        variant: 'ghost'
                      }
                    )
                  }
                  return (
                    <>
                      <YumiRecordActionBar ariaLabel="核算记录操作" actions={actions} />
                      {readOnly ? (
                        <span className="yumi-work-time-review__muted">只读历史</span>
                      ) : null}
                    </>
                  )
                }
              }
            ]}
            getRowKey={(row) => row.key}
            rows={recordRows}
          />
        ) : (
          <YumiFormMessage tone="hint">还没有已核算记录。</YumiFormMessage>
        )}
      </YumiSection>

      {makingTarget ? (
        <MakingReviewDialog
          onClose={() => setMakingTarget(null)}
          onSubmit={submitMaking}
          target={makingTarget}
        />
      ) : null}

      {timedTarget ? (
        <TimedReviewDialog
          itemLabels={itemLabels}
          listCandidates={listCandidates}
          onClose={() => setTimedTarget(null)}
          onSubmit={submitTimed}
          target={timedTarget}
        />
      ) : null}

      {detailRow ? (
        <ReviewDetailDialog
          itemLabels={itemLabels}
          onClose={() => setDetailRow(null)}
          row={detailRow}
        />
      ) : null}

      {voidRow ? (
        <VoidReviewDialog onClose={() => setVoidRow(null)} onSubmit={submitVoid} row={voidRow} />
      ) : null}
    </>
  )
}

function ReviewDetailDialog({
  itemLabels,
  onClose,
  row
}: {
  itemLabels: ReadonlyMap<string, WorkTimeReviewItemLabel>
  onClose(): void
  row: WorkTimeReviewRecordRow
}) {
  const lock = recordLockOf(row)
  const lockItems = lock.locked ? [{ label: '锁定原因与调整指引', value: lock.message }] : []
  if (row.kind === 'making') {
    return (
      <YumiDialog
        footer={
          <YumiButton onClick={onClose} variant="secondary">
            关闭
          </YumiButton>
        }
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        open
        title="制作核算详情"
      >
        <YumiDetailList
          ariaLabel="制作核算详情"
          items={[
            { label: '人员', value: row.workerName },
            { label: '排班日期', value: row.assignedOn },
            { label: '订单商品', value: row.productName },
            { label: '本次计划', value: `${row.plannedQuantity} 件` },
            { label: '实际产出', value: `${row.summary.completedQuantity} 件` },
            { label: '合格数量', value: `${row.summary.qualifiedQuantity} 件` },
            { label: '不合格数量', value: `${row.summary.unqualifiedQuantity} 件` },
            { label: '未完成数量', value: `${row.summary.unfinishedQuantity} 件` },
            { label: '核算日期', value: row.summary.reviewedOn },
            { label: '备注', value: row.summary.note ?? '—' },
            {
              label: '版本',
              value: row.summary.supersedesResultId ? '更正后的新版本' : '原始版本'
            },
            ...lockItems
          ]}
        />
      </YumiDialog>
    )
  }
  return (
    <YumiDialog
      footer={
        <YumiButton onClick={onClose} variant="secondary">
          关闭
        </YumiButton>
      }
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      open
      title="计时核算详情"
    >
      <YumiDetailList
        ariaLabel="计时核算详情"
        items={[
          { label: '人员', value: row.workerName },
          { label: '工序', value: workTimeProcessLabels[row.review.processType] },
          { label: '归属日期', value: row.review.workedOn },
          {
            label: '实际时间范围',
            value:
              row.review.rawStartedAt && row.review.rawEndedAt
                ? `${row.review.rawStartedAt} 至 ${row.review.rawEndedAt}`
                : '历史记录未保存时间范围'
          },
          { label: '核算分钟', value: `${row.review.approvedMinutes} 分钟` },
          {
            label: '冻结时薪',
            value:
              row.review.hourlyWageCentsSnapshot === null
                ? '—'
                : `¥${(row.review.hourlyWageCentsSnapshot / 100).toFixed(2)} / 小时`
          },
          { label: '备注', value: row.review.reviewNote ?? '—' },
          { label: '版本', value: row.review.supersedesReviewId ? '更正后的新版本' : '原始版本' },
          ...lockItems
        ]}
      />
      <YumiDataTable
        ariaLabel="核算商品明细"
        columns={[
          {
            key: 'productName',
            label: '商品',
            render: (item) =>
              (item.orderItemId && itemLabels.get(item.orderItemId)?.productName) || '订单商品'
          },
          {
            key: 'orderCode',
            label: '订单号',
            render: (item) =>
              (item.orderItemId && itemLabels.get(item.orderItemId)?.orderCode) || '—'
          },
          {
            key: 'completedQuantity',
            label: '完成数量',
            align: 'right',
            render: (item) => `${item.completedQuantity} 件`
          },
          {
            key: 'pieceRate',
            label: '提成快照',
            align: 'right',
            render: (item) =>
              item.pieceRateCentsSnapshot === null
                ? '—'
                : `¥${(item.pieceRateCentsSnapshot / 100).toFixed(2)} / 件`
          },
          {
            key: 'expectedUnitMinutes',
            label: '预计单件分钟',
            align: 'right',
            render: (item) =>
              item.expectedUnitMinutesSnapshot === null
                ? '—'
                : `${item.expectedUnitMinutesSnapshot} 分钟`
          }
        ]}
        getRowKey={(item) => item.id}
        rows={row.review.items}
      />
    </YumiDialog>
  )
}

function VoidReviewDialog({
  onClose,
  onSubmit,
  row
}: {
  onClose(): void
  onSubmit(reason: string): Promise<void>
  row: WorkTimeReviewRecordRow
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  useYumiNotificationMessage(error)
  const lock = recordLockOf(row)

  const submit = async () => {
    if (busy) return
    setSubmitAttempted(true)
    if (!reason.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(reason.trim())
    } catch (submitError) {
      setError(getErrorMessage(submitError))
      setBusy(false)
    }
  }

  return (
    <YumiDialog
      description={
        lock.locked
          ? lock.message
          : '作废会回退未锁定的履约与工资来源，保留审计记录，并让对应排班重新回到待核算。'
      }
      footer={
        <>
          <YumiButton disabled={busy} onClick={onClose} variant="ghost">
            取消
          </YumiButton>
          <YumiButton loading={busy} onClick={() => void submit()} variant="danger">
            确认作废
          </YumiButton>
        </>
      }
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      open
      title="作废核算记录？"
    >
      <YumiField error={submitAttempted && !reason.trim() ? '请填写作废原因' : undefined}>
        <YumiFieldLabel htmlFor="work-time-review-void-reason" required>
          作废原因
        </YumiFieldLabel>
        <YumiTextArea
          id="work-time-review-void-reason"
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </YumiField>
    </YumiDialog>
  )
}
