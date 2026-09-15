import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  V2TimedProcessType,
  V2WorkTimeReview,
  V2WorkTimeReviewCandidate,
  V2WorkTimeReviewCandidateQuery,
  V2WorkTimeReviewItem,
  V2WorkTimeReviewItemInput
} from '@shared/contracts/index'
import { calculateReviewTimeRange, calculateWorkTimeComparison } from '@shared/calculations'
import {
  buildTimedCandidateRows,
  parseWholeNumber,
  validateMakingReviewQuantities,
  workTimeProcessLabels,
  type TimedCandidateRow
} from './work-time-review-helpers'
import { getErrorMessage } from '../../composables/v2-utils'
import type { WorkTimeReviewItemLabel } from '../../composables/use-work-time-reviews'
import {
  YumiButton,
  YumiCalculatedAmount,
  YumiCheckbox,
  YumiDataTable,
  YumiDateTimeRangePicker,
  YumiDetailList,
  YumiDialog,
  YumiField,
  YumiFieldLabel,
  YumiFormMessage,
  YumiNumberField,
  YumiTextArea,
  YumiTextField,
  type YumiDateRangeValue
} from '../ui'

export interface MakingReviewDialogTarget {
  mode: 'create' | 'correct'
  taskId: string
  resultId: string | null
  workerName: string
  assignedOn: string
  productName: string
  plannedQuantity: number
  reviewedOn: string
  note: string | null
  completedQuantity: number | null
  qualifiedQuantity: number | null
}

export interface MakingReviewValues {
  completedQuantity: number
  qualifiedQuantity: number
  note: string | null
  reason: string | null
}

/** 制作一次核算表单：实际产出与合格数量，系统实时计算不合格与未完成。 */
export function MakingReviewDialog({
  onClose,
  onSubmit,
  target
}: {
  onClose(): void
  onSubmit(values: MakingReviewValues): Promise<void>
  target: MakingReviewDialogTarget
}) {
  const [completed, setCompleted] = useState(
    target.completedQuantity === null ? '' : String(target.completedQuantity)
  )
  const [qualified, setQualified] = useState(
    target.qualifiedQuantity === null ? '' : String(target.qualifiedQuantity)
  )
  const [note, setNote] = useState(target.note ?? '')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)

  const validation = validateMakingReviewQuantities({
    plannedQuantity: target.plannedQuantity,
    completedQuantity: parseWholeNumber(completed),
    qualifiedQuantity: parseWholeNumber(qualified)
  })
  const { quantities } = validation
  const completedError = touched || completed !== '' ? validation.completedError : null
  const qualifiedError =
    touched || qualified !== '' || completed !== '' ? validation.qualifiedError : null

  const submit = async () => {
    if (busy) return
    setTouched(true)
    const completedQuantity = parseWholeNumber(completed)
    const qualifiedQuantity = parseWholeNumber(qualified)
    const current = validateMakingReviewQuantities({
      plannedQuantity: target.plannedQuantity,
      completedQuantity,
      qualifiedQuantity
    })
    if (current.completedError || current.qualifiedError) {
      setError(current.completedError ?? current.qualifiedError)
      return
    }
    if (completedQuantity === null || qualifiedQuantity === null) {
      setError('请检查实际产出与合格数量')
      return
    }
    if (target.mode === 'correct' && !reason.trim()) {
      setError('请填写更正原因')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        completedQuantity,
        qualifiedQuantity,
        note: note.trim() ? note.trim() : null,
        reason: target.mode === 'correct' ? reason.trim() : null
      })
    } catch (submitError) {
      setError(getErrorMessage(submitError))
      setBusy(false)
    }
  }

  return (
    <YumiDialog
      description={
        target.mode === 'correct'
          ? '更正会保留旧版本并直接生成新的有效核算版本；填写原因后才能提交。'
          : '一次提交实际产出与合格数量，系统自动计算不合格与未完成数量并直接完成核算。'
      }
      footer={
        <>
          <YumiButton disabled={busy} onClick={onClose} variant="ghost">
            取消
          </YumiButton>
          <YumiButton
            disabled={Boolean(validation.completedError || validation.qualifiedError) || busy}
            loading={busy}
            onClick={() => void submit()}
            variant="primary"
          >
            {target.mode === 'correct' ? '提交更正' : '确认核算'}
          </YumiButton>
        </>
      }
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      open
      title={target.mode === 'correct' ? '更正制作核算' : '制作核算'}
    >
      <p className="yumi-work-time-review__dialog-meta">
        {`${target.workerName} · ${target.assignedOn} · ${target.productName} · 本次计划 ${target.plannedQuantity} 件 · 核算日期 ${target.reviewedOn}`}
      </p>
      <div className="yumi-form-grid yumi-form-grid--two">
        <YumiField
          error={completedError ?? undefined}
          hint="允许零产出；不得超过本次制作排班计划。"
        >
          <YumiFieldLabel htmlFor="making-review-completed" required>
            实际产出数量
          </YumiFieldLabel>
          <YumiNumberField
            id="making-review-completed"
            onChange={(event) => {
              setTouched(true)
              setCompleted(event.target.value)
            }}
            value={completed}
          />
        </YumiField>
        <YumiField error={qualifiedError ?? undefined} hint="合格数量不能大于实际产出数量。">
          <YumiFieldLabel htmlFor="making-review-qualified" required>
            合格数量
          </YumiFieldLabel>
          <YumiNumberField
            id="making-review-qualified"
            onChange={(event) => {
              setTouched(true)
              setQualified(event.target.value)
            }}
            value={qualified}
          />
        </YumiField>
      </div>
      <YumiDetailList
        ariaLabel="系统计算的数量"
        items={[
          {
            label: '不合格数量',
            value: quantities ? `${quantities.unqualifiedQuantity} 件` : '—'
          },
          {
            label: '未完成数量',
            value: quantities ? `${quantities.unfinishedQuantity} 件` : '—'
          }
        ]}
      />
      {target.mode === 'correct' ? (
        <YumiField>
          <YumiFieldLabel htmlFor="making-review-reason" required>
            更正原因
          </YumiFieldLabel>
          <YumiTextArea
            id="making-review-reason"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </YumiField>
      ) : null}
      <YumiField>
        <YumiFieldLabel htmlFor="making-review-note">备注</YumiFieldLabel>
        <YumiTextArea
          id="making-review-note"
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </YumiField>
      {error ? <YumiFormMessage tone="error">{error}</YumiFormMessage> : null}
    </YumiDialog>
  )
}

export interface TimedReviewDialogTarget {
  mode: 'create' | 'correct'
  assignmentId: string
  reviewId: string | null
  workerName: string
  assignedOn: string
  processType: V2TimedProcessType
  review: V2WorkTimeReview | null
}

export interface TimedReviewValues {
  startedAt: string
  endedAt: string
  items: V2WorkTimeReviewItemInput[]
  note: string | null
  reason: string | null
}

function localMinuteNow(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}`
}

function formatDeliveryDate(value: string | null): ReactNode {
  if (!value) return '—'
  const due = new Date(`${value}T00:00:00`)
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const overdue = due.getTime() < startOfToday.getTime()
  return overdue ? `${value}（已逾期）` : value
}

/**
 * 计时一次核算表单：单一连续时间范围、候选订单商品完成数量与只读效率指标。
 * 分钟由系统按时间范围计算，界面不提供手工分钟输入。
 */
export function TimedReviewDialog({
  itemLabels,
  listCandidates,
  onClose,
  onSubmit,
  target
}: {
  itemLabels: ReadonlyMap<string, WorkTimeReviewItemLabel>
  listCandidates(
    assignmentId: string,
    query?: V2WorkTimeReviewCandidateQuery
  ): Promise<V2WorkTimeReviewCandidate[]>
  onClose(): void
  onSubmit(values: TimedReviewValues): Promise<void>
  target: TimedReviewDialogTarget
}) {
  const [range, setRange] = useState<YumiDateRangeValue | null>(
    target.review?.rawStartedAt && target.review.rawEndedAt
      ? { start: target.review.rawStartedAt, end: target.review.rawEndedAt }
      : null
  )
  const [candidates, setCandidates] = useState<V2WorkTimeReviewCandidate[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(true)
  const [candidateError, setCandidateError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [entries, setEntries] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (target.review?.items ?? [])
        .filter((item): item is V2WorkTimeReviewItem & { orderItemId: string } =>
          Boolean(item.orderItemId)
        )
        .map((item) => [item.orderItemId, String(item.completedQuantity)])
    )
  )
  const [note, setNote] = useState(target.review?.reviewNote ?? '')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const requestIdRef = useRef(0)

  const loadCandidates = useCallback(
    async (nextSearch: string) => {
      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId
      setCandidatesLoading(true)
      setCandidateError(null)
      try {
        const next = await listCandidates(target.assignmentId, {
          search: nextSearch.trim() ? nextSearch.trim() : null
        })
        if (requestIdRef.current !== requestId) return
        setCandidates(next)
      } catch (loadError) {
        if (requestIdRef.current !== requestId) return
        setCandidateError(getErrorMessage(loadError))
      } finally {
        if (requestIdRef.current === requestId) setCandidatesLoading(false)
      }
    },
    [listCandidates, target.assignmentId]
  )

  useEffect(() => {
    void loadCandidates('')
  }, [loadCandidates])

  const rows = useMemo(
    () => buildTimedCandidateRows(candidates, target.review, itemLabels),
    [candidates, itemLabels, target.review]
  )

  const parsedRange = range ? calculateReviewTimeRange(range.start, range.end) : null
  const rangeError = !range
    ? null
    : !parsedRange
      ? '结束时间必须晚于开始时间'
      : range.start.slice(0, 10) !== target.assignedOn
        ? `开始日期必须与排班日期一致（${target.assignedOn}）`
        : range.end > localMinuteNow()
          ? '核算必须在实际结束时间之后进行'
          : null

  const selectedRows = rows.filter(
    (row) => row.orderItemId && entries[row.orderItemId] !== undefined
  )
  const itemErrors = new Map<string, string>()
  for (const row of selectedRows) {
    const quantity = parseWholeNumber(entries[row.orderItemId] ?? '')
    if (quantity === null || quantity <= 0) {
      itemErrors.set(row.orderItemId, '必须是大于 0 的整数')
    } else if (quantity > row.processableQuantity) {
      itemErrors.set(row.orderItemId, `不能超过当前可处理数量 ${row.processableQuantity} 件`)
    }
  }

  const approvedMinutes = parsedRange?.minutes ?? 0
  const comparisonItems = selectedRows.map((row) => ({
    label: row.productName,
    completedQuantity: parseWholeNumber(entries[row.orderItemId] ?? '') ?? 0,
    expectedMinutesPerUnit: row.expectedUnitMinutes ?? 0
  }))
  const missingExpectedMinutes = selectedRows.some((row) => row.expectedUnitMinutes === null)
  const comparison = calculateWorkTimeComparison({
    approvedMinutes,
    items: comparisonItems
  })

  const toggleRow = (row: TimedCandidateRow, checked: boolean) => {
    setEntries((current) => {
      const next = { ...current }
      if (checked) next[row.orderItemId] = String(row.processableQuantity)
      else delete next[row.orderItemId]
      return next
    })
  }

  const submit = async () => {
    if (busy) return
    const parsed = range ? calculateReviewTimeRange(range.start, range.end) : null
    const problems: string[] = []
    if (!range) problems.push('请选择核算时间范围')
    else if (!parsed) problems.push('结束时间必须晚于开始时间')
    else if (range.start.slice(0, 10) !== target.assignedOn)
      problems.push(`开始日期必须与排班日期一致（${target.assignedOn}）`)
    else if (range.end > localMinuteNow()) problems.push('核算必须在实际结束时间之后进行')
    if (!selectedRows.length) problems.push('请至少选择一个订单商品并填写完成数量')
    for (const row of selectedRows) {
      const message = itemErrors.get(row.orderItemId)
      if (message) problems.push(`${row.productName} 完成数量${message}`)
    }
    if (target.mode === 'correct' && !reason.trim()) problems.push('请填写更正原因')
    if (problems.length || !range || !parsed) {
      setError(problems[0] ?? '请检查核算内容')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        startedAt: range.start,
        endedAt: range.end,
        items: selectedRows.map((row) => ({
          orderItemId: row.orderItemId,
          completedQuantity: parseWholeNumber(entries[row.orderItemId] ?? '') ?? 0
        })),
        note: note.trim() ? note.trim() : null,
        reason: target.mode === 'correct' ? reason.trim() : null
      })
    } catch (submitError) {
      setError(getErrorMessage(submitError))
      setBusy(false)
    }
  }

  return (
    <YumiDialog
      description={
        target.mode === 'correct'
          ? '更正会保留旧版本并直接生成新的有效核算版本；填写原因后才能提交。'
          : '一次填写实际时间范围与跨订单商品完成数量，确认后直接形成已核算记录。'
      }
      footer={
        <>
          <YumiButton disabled={busy} onClick={onClose} variant="ghost">
            取消
          </YumiButton>
          <YumiButton loading={busy} onClick={() => void submit()} variant="primary">
            {target.mode === 'correct' ? '提交更正' : '确认核算'}
          </YumiButton>
        </>
      }
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      open
      title={target.mode === 'correct' ? '更正计时核算' : '计时核算'}
    >
      <p className="yumi-work-time-review__dialog-meta">
        {`${target.workerName} · 排班日期 ${target.assignedOn} · ${
          workTimeProcessLabels[target.processType]
        }`}
      </p>
      <YumiField
        error={rangeError ?? undefined}
        hint={`开始日期固定为排班日期 ${target.assignedOn}；可跨日，跨日核算按开始日期归属。`}
      >
        <YumiFieldLabel required>实际开始与结束时间</YumiFieldLabel>
        <YumiDateTimeRangePicker aria-label="核算时间范围" onValueChange={setRange} value={range} />
      </YumiField>
      <YumiDetailList
        ariaLabel="系统计算的核算分钟"
        items={[
          {
            label: '核算分钟',
            value: parsedRange ? `${parsedRange.minutes} 分钟` : '—'
          },
          {
            label: '归属日期',
            value: parsedRange
              ? `${parsedRange.workedOn}${parsedRange.crossesDay ? '（跨日核算按开始日期归属）' : ''}`
              : '—'
          }
        ]}
      />
      <YumiField hint="按客户、订单号或商品名检索；候选按逾期、交期与订单时间由服务端排序。">
        <YumiFieldLabel htmlFor="timed-review-search">搜索可核算的订单商品</YumiFieldLabel>
        <YumiTextField
          id="timed-review-search"
          onChange={(event) => {
            setSearch(event.target.value)
            void loadCandidates(event.target.value)
          }}
          placeholder="输入客户、订单号或商品名"
          value={search}
        />
      </YumiField>
      {candidateError ? <YumiFormMessage tone="error">{candidateError}</YumiFormMessage> : null}
      {candidatesLoading ? (
        <YumiFormMessage tone="hint">正在读取可核算的订单商品…</YumiFormMessage>
      ) : rows.length ? (
        <YumiDataTable
          ariaLabel="可核算订单商品"
          columns={[
            {
              key: 'select',
              label: '选择',
              render: (row) => (
                <YumiCheckbox
                  aria-label={`选择 ${row.orderCode} ${row.productName}`}
                  checked={entries[row.orderItemId] !== undefined}
                  onChange={(event) => toggleRow(row, event.target.checked)}
                >
                  {row.fromOriginalReview ? '原明细' : ''}
                </YumiCheckbox>
              )
            },
            { key: 'customerName', label: '客户', render: (row) => row.customerName },
            { key: 'orderCode', label: '订单号', render: (row) => row.orderCode },
            { key: 'productName', label: '商品', render: (row) => row.productName },
            {
              key: 'deliveryDate',
              label: '交期',
              render: (row) => formatDeliveryDate(row.deliveryDate)
            },
            {
              key: 'processable',
              label: '可处理数量',
              align: 'right',
              render: (row) => `${row.processableQuantity} 件`
            },
            {
              key: 'completed',
              label: '完成数量',
              render: (row) =>
                entries[row.orderItemId] === undefined ? (
                  <span className="yumi-work-time-review__muted">勾选后默认填满</span>
                ) : (
                  <YumiField error={itemErrors.get(row.orderItemId)}>
                    <YumiNumberField
                      aria-label={`${row.orderCode} ${row.productName} 完成数量`}
                      onChange={(event) =>
                        setEntries((current) => ({
                          ...current,
                          [row.orderItemId]: event.target.value
                        }))
                      }
                      value={entries[row.orderItemId] ?? ''}
                    />
                  </YumiField>
                )
            }
          ]}
          emptyText="没有匹配的可核算订单商品。"
          getRowKey={(row) => row.orderItemId}
          rows={rows}
        />
      ) : (
        <YumiFormMessage tone="hint">当前工序没有可核算的订单商品。</YumiFormMessage>
      )}
      <div className="yumi-work-time-review__comparison">
        <YumiDetailList
          ariaLabel="效率核对"
          items={[
            {
              label: '预计总分钟',
              value: `${comparison.expectedMinutes.minutes} 分钟`
            },
            { label: '时间差', value: `${comparison.differenceMinutes} 分钟` }
          ]}
        />
        <YumiCalculatedAmount calculation={comparison.efficiency} />
        <p className="yumi-work-time-review__formula">
          只读参考：不影响提交、工资与履约数量。
          {missingExpectedMinutes ? '部分商品缺少预计单件分钟快照，预计指标不含该项。' : ''}
        </p>
        {comparison.attentionMessage ? (
          <YumiFormMessage tone="hint">{comparison.attentionMessage}</YumiFormMessage>
        ) : null}
      </div>
      {target.mode === 'correct' ? (
        <YumiField>
          <YumiFieldLabel htmlFor="timed-review-reason" required>
            更正原因
          </YumiFieldLabel>
          <YumiTextArea
            id="timed-review-reason"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </YumiField>
      ) : null}
      <YumiField>
        <YumiFieldLabel htmlFor="timed-review-note">备注</YumiFieldLabel>
        <YumiTextArea
          id="timed-review-note"
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </YumiField>
      {error ? <YumiFormMessage tone="error">{error}</YumiFormMessage> : null}
    </YumiDialog>
  )
}
