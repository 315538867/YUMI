import { useMemo, useState, type FormEvent } from 'react'
import type {
  V2ProcessTask,
  V2ProcessType,
  V2WorkAssignment,
  V2WorkTimeReview
} from '@shared/contracts/index'
import { getErrorMessage, today } from '../../composables/v2-utils'
import { useWorkAssignments } from '../../composables/use-work-assignments'
import {
  YumiButton,
  YumiDataTable,
  YumiDatePicker,
  YumiDetailList,
  YumiDialog,
  YumiEmptyState,
  YumiField,
  YumiFieldLabel,
  YumiListSurface,
  YumiListToolbar,
  YumiRecordActionBar,
  YumiSection,
  YumiSelect,
  YumiStatusTag,
  YumiTextArea,
  useYumiNotificationMessage
} from '../../components/ui'

const processLabels: Record<V2ProcessType, string> = {
  making: '制作',
  fluffing_bagging: '捏毛装袋',
  edge_sewing: '缝边',
  packing: '打包发货'
}

const processOptions = Object.entries(processLabels).map(([value, label]) => ({ value, label }))

function assignmentStatus(status: V2WorkAssignment['status']) {
  if (status === 'completed') return { label: '已完成', tone: 'success' as const }
  if (status === 'cancelled') return { label: '已取消', tone: 'danger' as const }
  if (status === 'absent') return { label: '缺勤', tone: 'warning' as const }
  if (status === 'draft') return { label: '草稿', tone: 'neutral' as const }
  return { label: '已安排', tone: 'brand' as const }
}

function scheduleModeLabel(assignment: V2WorkAssignment): string {
  if (assignment.scheduleMode === 'timed_shift') return '计时班次'
  if (assignment.scheduleMode === 'legacy_task') return '历史安排'
  return '制作排班'
}

function taskStatusMeta(status: V2ProcessTask['status']) {
  if (status === 'pending_inspection') return { label: '待核算', tone: 'warning' as const }
  if (status === 'confirmed') return { label: '已核算', tone: 'success' as const }
  if (status === 'cancelled') return { label: '已取消', tone: 'danger' as const }
  return { label: '待完成', tone: 'neutral' as const }
}

function reviewOf(
  assignment: V2WorkAssignment,
  reviews: V2WorkTimeReview[]
): V2WorkTimeReview | null {
  if (!assignment.timedReview) return null
  return (
    reviews.find(
      (review) =>
        review.id === assignment.timedReview?.reviewId && review.workAssignmentId === assignment.id
    ) ??
    reviews.find(
      (review) =>
        review.workAssignmentId === assignment.id || review.assignmentIds.includes(assignment.id)
    ) ??
    null
  )
}

/**
 * 工作安排记录：只保留查询筛选、列表、详情与适用状态操作。
 * 新增安排只能在排班人员周历日期格完成；实际产出与计时数据统一在待核算登记，
 * 这里只读展示制作任务的当前有效核算摘要与计时班次的核算明细。
 */
export function WorkAssignmentsPage(props: {
  focusedTaskId?: string
  onChanged?(): void
  onNavigateToReviews?(): void
}) {
  const {
    assignments,
    workers,
    reviews,
    itemLabels,
    loading,
    loadError,
    setWorkAssignmentStatus,
    reassignProcessTask
  } = useWorkAssignments()
  const [workerFilter, setWorkerFilter] = useState('')
  const [processFilter, setProcessFilter] = useState('')
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null)
  const [statusTarget, setStatusTarget] = useState<{
    assignment: V2WorkAssignment
    status: 'absent' | 'cancelled'
  } | null>(null)
  const [statusReason, setStatusReason] = useState('')
  const [statusError, setStatusError] = useState<string | null>(null)
  const [statusSubmitting, setStatusSubmitting] = useState(false)
  const [reassignTarget, setReassignTarget] = useState<{
    assignment: V2WorkAssignment
    task: V2ProcessTask
  } | null>(null)
  const [reassignWorkerId, setReassignWorkerId] = useState('')
  const [reassignEffectiveOn, setReassignEffectiveOn] = useState(today())
  const [reassignReason, setReassignReason] = useState('')
  const [reassignError, setReassignError] = useState<string | null>(null)
  const [reassignSubmitting, setReassignSubmitting] = useState(false)
  const [reassignSubmitted, setReassignSubmitted] = useState(false)
  useYumiNotificationMessage(loadError)
  useYumiNotificationMessage(statusError)
  useYumiNotificationMessage(reassignError)

  const workerNames = useMemo(
    () => new Map(workers.map((worker) => [worker.id, worker.name])),
    [workers]
  )
  const workerLabel = (workerId: string) => workerNames.get(workerId) ?? '未知人员'
  const itemLabel = (orderItemId: string | null) =>
    (orderItemId ? itemLabels.get(orderItemId)?.productName : null) ?? '订单商品'

  const visibleAssignments = useMemo(
    () =>
      assignments
        .filter((assignment) =>
          props.focusedTaskId
            ? assignment.tasks.some((task) => task.id === props.focusedTaskId)
            : true
        )
        .filter((assignment) => !workerFilter || assignment.workerId === workerFilter)
        .filter((assignment) => !processFilter || assignment.processType === processFilter),
    [assignments, processFilter, props.focusedTaskId, workerFilter]
  )
  const selectedAssignment =
    visibleAssignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null
  const selectedReview = selectedAssignment ? reviewOf(selectedAssignment, reviews) : null

  const closeDetail = () => {
    setStatusTarget(null)
    setReassignTarget(null)
    setSelectedAssignmentId(null)
  }

  const submitStatus = async (event: FormEvent) => {
    event.preventDefault()
    const target = statusTarget
    if (!target) return
    setStatusSubmitting(true)
    setStatusError(null)
    try {
      await setWorkAssignmentStatus(target.assignment.id, {
        status: target.status,
        reason: statusReason || undefined
      })
      setStatusTarget(null)
      setStatusReason('')
      props.onChanged?.()
    } catch (cause) {
      setStatusError(getErrorMessage(cause))
    } finally {
      setStatusSubmitting(false)
    }
  }

  const submitReassign = async (event: FormEvent) => {
    event.preventDefault()
    const target = reassignTarget
    if (!target) return
    setReassignSubmitted(true)
    if (!reassignWorkerId) return
    if (!reassignReason.trim()) return
    setReassignSubmitting(true)
    setReassignError(null)
    try {
      await reassignProcessTask(target.task.id, {
        workerId: reassignWorkerId,
        effectiveOn: reassignEffectiveOn,
        reason: reassignReason.trim()
      })
      setReassignTarget(null)
      setReassignWorkerId('')
      setReassignReason('')
      props.onChanged?.()
    } catch (cause) {
      setReassignError(getErrorMessage(cause))
    } finally {
      setReassignSubmitting(false)
    }
  }

  if (selectedAssignment) {
    const status = assignmentStatus(selectedAssignment.status)
    const editable =
      selectedAssignment.status === 'scheduled' || selectedAssignment.status === 'draft'
    return (
      <section className="yumi-work-assignments">
        <YumiSection
          actions={
            <YumiRecordActionBar
              actions={[
                ...(props.onNavigateToReviews
                  ? [
                      {
                        label: '前往核算',
                        onClick: props.onNavigateToReviews,
                        variant: 'ghost' as const
                      }
                    ]
                  : []),
                { label: '返回工作安排列表', onClick: closeDetail, variant: 'secondary' as const }
              ]}
              ariaLabel="工作安排详情动作"
            />
          }
          description={`${processLabels[selectedAssignment.processType]} · ${workerLabel(
            selectedAssignment.workerId
          )} · ${selectedAssignment.assignedOn} · ${scheduleModeLabel(selectedAssignment)}`}
          title="工作安排详情"
        >
          <YumiDetailList
            ariaLabel="工作安排详情"
            items={[
              { label: '兼职人员', value: workerLabel(selectedAssignment.workerId) },
              { label: '安排日期', value: selectedAssignment.assignedOn },
              { label: '工序', value: processLabels[selectedAssignment.processType] },
              { label: '排班模式', value: scheduleModeLabel(selectedAssignment) },
              {
                label: '安排状态',
                value: <YumiStatusTag tone={status.tone}>{status.label}</YumiStatusTag>
              },
              {
                label: '核算状态',
                value:
                  selectedAssignment.processType === 'making'
                    ? selectedAssignment.tasks.some((task) => task.reviewSummary)
                      ? '已核算'
                      : '待核算'
                    : selectedAssignment.timedReview
                      ? `已核算（${selectedAssignment.timedReview.approvedMinutes} 分钟）`
                      : '待核算'
              },
              { label: '备注', value: selectedAssignment.note ?? '—' }
            ]}
          />

          {selectedAssignment.processType === 'making' ? (
            <YumiDataTable
              ariaLabel="制作任务与核算摘要"
              columns={[
                {
                  key: 'product',
                  label: '订单商品',
                  render: (task) => itemLabel(task.orderItemId)
                },
                {
                  key: 'quantity',
                  label: '计划数量',
                  align: 'right',
                  render: (task) => `${task.plannedQuantity ?? 0} 件`
                },
                {
                  key: 'status',
                  label: '任务状态',
                  render: (task) => {
                    const meta = taskStatusMeta(task.status)
                    return <YumiStatusTag tone={meta.tone}>{meta.label}</YumiStatusTag>
                  }
                },
                {
                  key: 'review',
                  label: '核算摘要',
                  render: (task) =>
                    task.reviewSummary ? (
                      <div className="yumi-list-cell">
                        <strong>
                          合格 {task.reviewSummary.qualifiedQuantity} 件 · 不合格{' '}
                          {task.reviewSummary.unqualifiedQuantity} 件
                        </strong>
                        <span>
                          实际产出 {task.reviewSummary.completedQuantity} 件 · 核算日期{' '}
                          {task.reviewSummary.reviewedOn}
                        </span>
                      </div>
                    ) : (
                      '待核算'
                    )
                },
                {
                  align: 'right',
                  key: 'actions',
                  label: '操作',
                  render: (task) =>
                    task.processType === 'making' && task.status === 'pending' ? (
                      <YumiButton
                        aria-label={`转派${itemLabel(task.orderItemId)}`}
                        onClick={() => {
                          setReassignError(null)
                          setReassignWorkerId('')
                          setReassignEffectiveOn(today())
                          setReassignReason('')
                          setReassignTarget({ assignment: selectedAssignment, task })
                        }}
                        variant="secondary"
                      >
                        转派
                      </YumiButton>
                    ) : (
                      '—'
                    )
                }
              ]}
              getRowKey={(task) => task.id}
              rows={selectedAssignment.tasks}
            />
          ) : (
            <>
              <YumiDetailList
                ariaLabel="计时核算摘要"
                items={
                  selectedAssignment.timedReview
                    ? [
                        {
                          label: '核算日期',
                          value: selectedAssignment.timedReview.reviewedOn
                        },
                        {
                          label: '核算分钟',
                          value: `${selectedAssignment.timedReview.approvedMinutes} 分钟`
                        },
                        {
                          label: '锁定与指引',
                          value: selectedAssignment.timedReview.lock.message ?? '未锁定'
                        }
                      ]
                    : [{ label: '核算状态', value: '待核算：实际时间与完成数量在待核算中登记' }]
                }
              />
              {selectedReview ? (
                <YumiDataTable
                  ariaLabel="核算商品明细"
                  columns={[
                    {
                      key: 'product',
                      label: '商品',
                      render: (item) => itemLabel(item.orderItemId)
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
                  rows={selectedReview.items}
                />
              ) : null}
            </>
          )}

          {editable ? (
            <div className="yumi-form-actions">
              <YumiButton
                onClick={() => {
                  setStatusError(null)
                  setStatusReason('')
                  setStatusTarget({ assignment: selectedAssignment, status: 'absent' })
                }}
                variant="secondary"
              >
                标记缺勤
              </YumiButton>
              <YumiButton
                onClick={() => {
                  setStatusError(null)
                  setStatusReason('')
                  setStatusTarget({ assignment: selectedAssignment, status: 'cancelled' })
                }}
                variant="danger"
              >
                取消安排
              </YumiButton>
            </div>
          ) : null}
        </YumiSection>

        {statusTarget ? (
          <YumiDialog
            description="缺勤或取消会释放尚未核算的制作计划数量；已有有效核算的安排会被拒绝。"
            footer={
              <>
                <YumiButton
                  disabled={statusSubmitting}
                  onClick={() => setStatusTarget(null)}
                  variant="ghost"
                >
                  返回
                </YumiButton>
                <YumiButton
                  form="work-assignment-status-form"
                  loading={statusSubmitting}
                  type="submit"
                  variant={statusTarget.status === 'cancelled' ? 'danger' : 'primary'}
                >
                  确认{statusTarget.status === 'absent' ? '标记缺勤' : '取消安排'}
                </YumiButton>
              </>
            }
            onOpenChange={(open) => {
              if (!open) setStatusTarget(null)
            }}
            open
            title={statusTarget.status === 'absent' ? '标记为缺勤？' : '取消这项安排？'}
          >
            <form id="work-assignment-status-form" onSubmit={submitStatus}>
              <YumiField>
                <YumiFieldLabel htmlFor="work-assignment-status-reason">
                  原因（可选）
                </YumiFieldLabel>
                <YumiTextArea
                  id="work-assignment-status-reason"
                  onChange={(event) => setStatusReason(event.target.value)}
                  value={statusReason}
                />
              </YumiField>
            </form>
          </YumiDialog>
        ) : null}

        {reassignTarget ? (
          <YumiDialog
            description="仅未完成制作任务可以转派；原任务保留并标记为已取消。"
            footer={
              <>
                <YumiButton
                  disabled={reassignSubmitting}
                  onClick={() => setReassignTarget(null)}
                  variant="ghost"
                >
                  返回
                </YumiButton>
                <YumiButton
                  form="work-assignment-reassign-form"
                  loading={reassignSubmitting}
                  type="submit"
                  variant="primary"
                >
                  确认转派
                </YumiButton>
              </>
            }
            onOpenChange={(open) => {
              if (!open) setReassignTarget(null)
            }}
            open
            title="转派制作任务"
          >
            <form id="work-assignment-reassign-form" onSubmit={submitReassign}>
              <YumiDetailList
                ariaLabel="待转派任务"
                items={[
                  { label: '订单商品', value: itemLabel(reassignTarget.task.orderItemId) },
                  { label: '原负责人', value: workerLabel(reassignTarget.assignment.workerId) },
                  {
                    label: '计划数量',
                    value: `${reassignTarget.task.plannedQuantity ?? 0} 件`
                  }
                ]}
              />
              <div className="yumi-form-grid yumi-form-grid--two">
                <YumiField
                  error={reassignSubmitted && !reassignWorkerId ? '请选择新的负责人' : undefined}
                >
                  <YumiFieldLabel required>新负责人</YumiFieldLabel>
                  <YumiSelect
                    aria-label="新负责人"
                    onValueChange={setReassignWorkerId}
                    options={workers
                      .filter(
                        (worker) =>
                          worker.enabled && worker.id !== reassignTarget.assignment.workerId
                      )
                      .map((worker) => ({ value: worker.id, label: worker.name }))}
                    placeholder="选择负责人"
                    value={reassignWorkerId}
                  />
                </YumiField>
                <YumiField>
                  <YumiFieldLabel required>生效日期</YumiFieldLabel>
                  <YumiDatePicker
                    aria-label="转派生效日期"
                    onValueChange={setReassignEffectiveOn}
                    value={reassignEffectiveOn}
                  />
                </YumiField>
              </div>
              <YumiField
                error={reassignSubmitted && !reassignReason.trim() ? '请填写调整原因' : undefined}
              >
                <YumiFieldLabel required>调整原因</YumiFieldLabel>
                <YumiTextArea
                  aria-label="调整原因"
                  onChange={(event) => setReassignReason(event.target.value)}
                  value={reassignReason}
                />
              </YumiField>
            </form>
          </YumiDialog>
        ) : null}
      </section>
    )
  }

  return (
    <section className="yumi-work-assignments">
      <YumiSection
        description={
          props.focusedTaskId
            ? '已定位到当前排班任务，仅展示这项任务所在的工作安排；新增排班请回到人员周历日期格。'
            : '只读查看既有工作安排、状态与核算摘要；新增排班只能在排班人员周历的日期格完成。'
        }
        title="工作安排记录"
      >
        {loading ? (
          <YumiEmptyState
            description="工作安排正在读取，请稍候。"
            scenario="loading"
            title="加载中…"
          />
        ) : visibleAssignments.length === 0 ? (
          <YumiEmptyState
            description={
              props.focusedTaskId
                ? '该任务可能已完成或已发生变化，请返回排班周历刷新后继续查看。'
                : '负责人在人员周历日期格派工后，安排、状态与核算摘要会出现在这里。'
            }
            title={props.focusedTaskId ? '未找到当前排班任务' : '暂时没有工作安排'}
          />
        ) : (
          <YumiListSurface>
            <YumiListToolbar
              ariaLabel="工作安排列表工具"
              countLabel={`共 ${visibleAssignments.length} 项安排`}
              filters={
                <>
                  <YumiSelect
                    aria-label="筛选兼职人员"
                    onValueChange={setWorkerFilter}
                    options={[
                      { value: '', label: '全部人员' },
                      ...workers.map((worker) => ({ value: worker.id, label: worker.name }))
                    ]}
                    value={workerFilter}
                  />
                  <YumiSelect
                    aria-label="筛选工序"
                    onValueChange={setProcessFilter}
                    options={[{ value: '', label: '全部工序' }, ...processOptions]}
                    value={processFilter}
                  />
                </>
              }
            />
            <YumiDataTable
              ariaLabel="工作安排列表"
              columns={[
                {
                  key: 'arrangement',
                  label: '工作安排',
                  render: (assignment) => (
                    <div className="yumi-list-cell">
                      <strong>{processLabels[assignment.processType]}安排</strong>
                      <span>
                        {assignment.assignedOn} · {scheduleModeLabel(assignment)}
                      </span>
                    </div>
                  )
                },
                {
                  key: 'worker',
                  label: '兼职人员',
                  render: (assignment) => workerLabel(assignment.workerId)
                },
                {
                  key: 'review',
                  label: '核算摘要',
                  render: (assignment) => {
                    if (assignment.processType === 'making') {
                      const reviewedCount = assignment.tasks.filter(
                        (task) => task.reviewSummary
                      ).length
                      return (
                        <div className="yumi-list-cell">
                          <strong>
                            {reviewedCount === assignment.tasks.length && reviewedCount > 0
                              ? '已核算'
                              : '待核算'}
                          </strong>
                          <span>
                            {assignment.tasks.length} 项制作任务 · {reviewedCount} 项已核算
                          </span>
                        </div>
                      )
                    }
                    return (
                      <div className="yumi-list-cell">
                        <strong>{assignment.timedReview ? '已核算' : '待核算'}</strong>
                        <span>
                          {assignment.timedReview
                            ? `${assignment.timedReview.approvedMinutes} 分钟 · 核算日期 ${assignment.timedReview.reviewedOn}`
                            : '实际时间与完成数量在待核算中登记'}
                        </span>
                      </div>
                    )
                  }
                },
                {
                  key: 'status',
                  label: '安排状态',
                  render: (assignment) => {
                    const status = assignmentStatus(assignment.status)
                    return <YumiStatusTag tone={status.tone}>{status.label}</YumiStatusTag>
                  }
                },
                {
                  align: 'right',
                  key: 'actions',
                  label: '操作',
                  render: (assignment) => (
                    <YumiButton
                      onClick={() => setSelectedAssignmentId(assignment.id)}
                      variant="secondary"
                    >
                      查看详情
                    </YumiButton>
                  )
                }
              ]}
              getRowKey={(assignment) => assignment.id}
              rows={visibleAssignments}
            />
          </YumiListSurface>
        )}
      </YumiSection>
    </section>
  )
}
