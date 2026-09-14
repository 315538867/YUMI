import { useState, type FormEvent } from 'react'
import type {
  V2WorkTimeReview,
  V2WorkTimeReviewProcessType,
  V2Worker
} from '@shared/contracts/index'
import { calculateWorkTimeComparison } from '@shared/calculations'
import { formatCents, getErrorMessage, today } from '../../composables/v2-utils'
import {
  useWorkTimeReviews,
  type WorkTimeReviewCandidate
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
  YumiSelect,
  YumiStatusTag,
  YumiTextArea,
  YumiTextField,
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

/**
 * 负责人次日核算计时工序工时：选择员工与日期，录入整段核算时长与多商品完成明细，
 * 并展示预计总分钟、时间差与预计效率供人工核对。
 */
export function WorkTimeReviewPanel({ workers }: { workers: V2Worker[] }) {
  const { reviews, loading, loadError, createDraft, confirm, voidReview, loadCandidates } =
    useWorkTimeReviews()
  const [workerId, setWorkerId] = useState('')
  const [workedOn, setWorkedOn] = useState(today())
  const [candidates, setCandidates] = useState<WorkTimeReviewCandidate[]>([])
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([])
  const [approvedMinutes, setApprovedMinutes] = useState('0')
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [voidTarget, setVoidTarget] = useState<V2WorkTimeReview | null>(null)
  const [voidReason, setVoidReason] = useState('')
  useYumiNotificationMessage(loadError)

  const selectedCandidates = candidates.filter((candidate) =>
    selectedAssignmentIds.includes(candidate.assignmentId)
  )
  const processType = selectedCandidates[0]?.processType ?? null
  const selectedTasks = selectedCandidates.flatMap((candidate) => candidate.tasks)
  const completedItems = selectedTasks.map((task) => ({
    label: task.productName,
    completedQuantity: Number(quantities[task.taskId] || '0') || 0,
    expectedMinutesPerUnit: task.expectedMinutesPerUnit
  }))
  const comparison = calculateWorkTimeComparison({
    approvedMinutes: Number(approvedMinutes) || 0,
    items: completedItems
  })

  const workerOptions = workers
    .filter((worker) => worker.enabled)
    .map((worker) => ({ value: worker.id, label: worker.name }))

  const search = async () => {
    setBusy(true)
    setError(null)
    setSelectedAssignmentIds([])
    setQuantities({})
    try {
      const next = await loadCandidates(workerId, workedOn)
      setCandidates(next)
      setSearched(true)
    } catch (searchError) {
      setError(getErrorMessage(searchError))
    } finally {
      setBusy(false)
    }
  }

  const toggleAssignment = (candidate: WorkTimeReviewCandidate) => {
    setError(null)
    setSelectedAssignmentIds((current) => {
      if (current.includes(candidate.assignmentId)) {
        return current.filter((id) => id !== candidate.assignmentId)
      }
      const currentProcess = candidates.find((entry) =>
        current.includes(entry.assignmentId)
      )?.processType
      if (currentProcess && currentProcess !== candidate.processType) {
        setError('一条工时核算只能包含同一道工序的工作安排。')
        return current
      }
      return [...current, candidate.assignmentId]
    })
  }

  const submit = async (confirmAfterSave: boolean) => {
    if (!processType || !selectedAssignmentIds.length || !selectedTasks.length) {
      setError('请先选择员工、日期并勾选待核算的工作安排。')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const draft = await createDraft({
        workerId,
        workedOn,
        processType,
        approvedMinutes: Number(approvedMinutes) || 0,
        assignmentIds: selectedAssignmentIds,
        items: selectedTasks.map((task) => ({
          processTaskId: task.taskId,
          completedQuantity: Number(quantities[task.taskId] || '0') || 0
        })),
        reviewNote: notes || null
      })
      if (confirmAfterSave) await confirm(draft.id)
      setCandidates((current) =>
        current.filter((candidate) => !selectedAssignmentIds.includes(candidate.assignmentId))
      )
      setSelectedAssignmentIds([])
      setQuantities({})
      setApprovedMinutes('0')
      setNotes('')
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
    } catch (voidError) {
      setError(getErrorMessage(voidError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <YumiSection
        description="排班只安排人员、日期、工序与数量；最终工作时长与完成数量在第二天由负责人核算。"
        title="计时工序待核算"
      >
        <div className="yumi-form-grid yumi-form-grid--two">
          <YumiField>
            <YumiFieldLabel htmlFor="review-worker" required>
              兼职人员
            </YumiFieldLabel>
            <YumiSelect
              aria-label="兼职人员"
              onValueChange={setWorkerId}
              options={workerOptions}
              placeholder="请选择兼职人员"
              value={workerId}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel htmlFor="review-worked-on">工作日期</YumiFieldLabel>
            <YumiTextField
              id="review-worked-on"
              onChange={(event) => setWorkedOn(event.target.value)}
              value={workedOn}
            />
          </YumiField>
        </div>
        <YumiButton loading={busy} onClick={() => void search()} variant="secondary">
          查找待核算安排
        </YumiButton>

        {searched && !candidates.length ? (
          <YumiFormMessage tone="hint">
            该员工当天没有可核算的计时工序安排；已核算或已作废的安排不会重复出现。
          </YumiFormMessage>
        ) : null}

        {candidates.length ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void submit(false)
            }}
          >
            <ul aria-label="待核算工作安排" className="yumi-work-time-review__candidates">
              {candidates.map((candidate) => (
                <li key={candidate.assignmentId}>
                  <label>
                    <input
                      checked={selectedAssignmentIds.includes(candidate.assignmentId)}
                      onChange={() => toggleAssignment(candidate)}
                      type="checkbox"
                    />
                    {processLabels[candidate.processType]} · {candidate.tasks.length} 个商品
                  </label>
                </li>
              ))}
            </ul>
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
            <YumiField>
              <YumiFieldLabel htmlFor="review-note">核算备注</YumiFieldLabel>
              <YumiTextArea
                id="review-note"
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
            </YumiField>
            {selectedTasks.length ? (
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
            ) : null}
            {error ? <YumiFormMessage tone="error">{error}</YumiFormMessage> : null}
            <div className="yumi-form-actions">
              <YumiButton loading={busy} type="submit" variant="secondary">
                保存草稿
              </YumiButton>
              <YumiButton loading={busy} onClick={() => void submit(true)} variant="primary">
                保存并确认
              </YumiButton>
            </div>
          </form>
        ) : null}
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
