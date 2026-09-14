import { useMemo, useState, type FormEvent } from 'react'
import type {
  V2Order,
  V2ProcessTaskInput,
  V2ProcessType,
  V2WorkAssignmentStatus
} from '@shared/contracts/index'
import { getErrorMessage, today } from '../../composables/v2-utils'
import { useWorkAssignments } from '../../composables/use-work-assignments'
import {
  YumiDataTable,
  YumiListSurface,
  YumiListToolbar,
  YumiButton,
  YumiDatePicker,
  YumiEmptyState,
  YumiField,
  YumiFieldLabel,
  YumiFormMessage,
  YumiNumberField,
  YumiSection,
  YumiSelect,
  YumiSheet,
  YumiStatusTag,
  YumiTaskRateSummary,
  YumiTextField,
  useYumiNotificationMessage
} from '../../components/ui'

interface TaskDraft {
  orderItemId: string
  sourceType: V2ProcessTaskInput['sourceType']
  plannedQuantity: string
  plannedMinutes: string
  extraMinutes: string
  note: string
}

const processLabels: Record<V2ProcessType, string> = {
  making: '制作',
  fluffing_bagging: '捏毛装袋',
  edge_sewing: '缝边',
  packing: '打包发货'
}
const sourceOptions: Array<{ value: TaskDraft['sourceType']; label: string }> = [
  { value: 'normal_production', label: '正常生产' },
  { value: 'rework', label: '返工' },
  { value: 'after_sales_replacement', label: '售后补发' },
  { value: 'manager_arrangement', label: '负责人安排' }
]

function createTaskDraft(order?: V2Order): TaskDraft {
  return {
    orderItemId: order?.items[0]?.id ?? '',
    sourceType: 'normal_production',
    plannedQuantity: '1',
    plannedMinutes: '0',
    extraMinutes: '0',
    note: ''
  }
}

function taskStatus(taskStatus: string) {
  if (taskStatus === 'pending_inspection') return { label: '待质量确认', tone: 'warning' as const }
  if (taskStatus === 'confirmed' || taskStatus === 'completed') {
    return { label: '已完成', tone: 'success' as const }
  }
  if (taskStatus === 'cancelled') return { label: '已取消', tone: 'danger' as const }
  return { label: '待完成', tone: 'neutral' as const }
}

function assignmentStatus(status: V2WorkAssignmentStatus) {
  if (status === 'completed') return { label: '已完成', tone: 'success' as const }
  if (status === 'cancelled') return { label: '已取消', tone: 'danger' as const }
  if (status === 'draft') return { label: '草稿', tone: 'neutral' as const }
  return { label: '已安排', tone: 'brand' as const }
}

export function WorkAssignmentsPage(props: {
  order: V2Order | null
  focusedTaskId?: string
  onChanged(): void
}) {
  const {
    assignments,
    workers,
    resultByTaskId,
    loading,
    loadError,
    createWorkAssignment,
    submitProcessResult,
    confirmQualityInspection
  } = useWorkAssignments()
  const [workerId, setWorkerId] = useState('')
  const [assignedOn, setAssignedOn] = useState(today())
  const [processType, setProcessType] = useState<V2ProcessType>('making')
  const [note, setNote] = useState('')
  const [tasks, setTasks] = useState<TaskDraft[]>([createTaskDraft(props.order)])
  const [resultDrafts, setResultDrafts] = useState<
    Record<string, { quantity: string; minutes: string; note: string }>
  >({})
  const [inspectionDrafts, setInspectionDrafts] = useState<
    Record<string, { qualified: string; unqualified: string; note: string }>
  >({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [createSheetOpen, setCreateSheetOpen] = useState(false)
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null)
  useYumiNotificationMessage(loadError)
  useYumiNotificationMessage(error)

  const itemNames = useMemo(
    () => new Map(props.order?.items.map((item) => [item.id, item.productSnapshot.name]) ?? []),
    [props.order]
  )
  const workerNames = useMemo(
    () => new Map(workers.map((worker) => [worker.id, worker.name])),
    [workers]
  )
  const workerLabel = (workerId: string) => workerNames.get(workerId) ?? '未知人员'
  const orderItemOptions =
    props.order?.items.map((item) => ({ value: item.id, label: item.productSnapshot.name })) ?? []
  const workerOptions = workers
    .filter((worker) => worker.enabled)
    .map((worker) => ({ value: worker.id, label: worker.name }))
  const visibleAssignments = props.focusedTaskId
    ? assignments.filter((assignment) =>
        assignment.tasks.some((task) => task.id === props.focusedTaskId)
      )
    : assignments
  const selectedAssignment =
    visibleAssignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null
  const detailDraftDirty = Boolean(
    selectedAssignment?.tasks.some((task) => {
      const resultDraft = resultDrafts[task.id]
      const inspectionDraft = inspectionDrafts[task.id]
      return Boolean(
        resultDraft?.quantity ||
        resultDraft?.minutes ||
        resultDraft?.note ||
        inspectionDraft?.qualified ||
        inspectionDraft?.unqualified ||
        inspectionDraft?.note
      )
    })
  )
  const updateTask = (index: number, patch: Partial<TaskDraft>) =>
    setTasks((current) =>
      current.map((task, taskIndex) => (taskIndex === index ? { ...task, ...patch } : task))
    )
  const createDraftDirty =
    workerId !== '' ||
    note !== '' ||
    processType !== 'making' ||
    assignedOn !== today() ||
    tasks.length !== 1 ||
    JSON.stringify(tasks[0]) !== JSON.stringify(createTaskDraft(props.order))
  const resetCreateDraft = () => {
    setWorkerId('')
    setAssignedOn(today())
    setProcessType('making')
    setNote('')
    setTasks([createTaskDraft(props.order)])
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!workerId) {
      setError('请选择兼职人员')
      return
    }
    setSubmitting('assignment')
    try {
      await createWorkAssignment({
        workerId,
        assignedOn,
        processType,
        note,
        tasks: tasks.map((task) => ({
          orderItemId: task.orderItemId || null,
          sourceType: task.sourceType,
          plannedQuantity: task.plannedQuantity === '' ? null : Number(task.plannedQuantity),
          plannedMinutes: processType === 'making' ? null : Number(task.plannedMinutes),
          extraMinutes: processType === 'making' ? Number(task.extraMinutes) : 0,
          note: task.note
        }))
      })
      resetCreateDraft()
      setCreateSheetOpen(false)
      props.onChanged()
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(null)
    }
  }

  const handleSubmitResult = async (event: FormEvent, taskId: string) => {
    event.preventDefault()
    const draft = resultDrafts[taskId] ?? { quantity: '', minutes: '', note: '' }
    setError(null)
    setSubmitting(`result:${taskId}`)
    try {
      await submitProcessResult(taskId, {
        completedQuantity: Number(draft.quantity),
        actualMinutes: draft.minutes === '' ? null : Number(draft.minutes),
        submittedOn: today(),
        note: draft.note
      })
      setResultDrafts((current) => ({
        ...current,
        [taskId]: { quantity: '', minutes: '', note: '' }
      }))
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(null)
    }
  }

  const handleInspection = async (event: FormEvent, taskId: string, resultId: string) => {
    event.preventDefault()
    const draft = inspectionDrafts[taskId] ?? { qualified: '', unqualified: '', note: '' }
    setError(null)
    setSubmitting(`inspection:${taskId}`)
    try {
      await confirmQualityInspection(resultId, {
        qualifiedQuantity: Number(draft.qualified),
        unqualifiedQuantity: Number(draft.unqualified),
        inspectedOn: today(),
        requiresRework: Number(draft.unqualified) > 0,
        note: draft.note
      })
      setInspectionDrafts((current) => ({
        ...current,
        [taskId]: { qualified: '', unqualified: '', note: '' }
      }))
      props.onChanged()
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(null)
    }
  }

  const closeAssignmentDetail = () => {
    const taskIds = new Set(selectedAssignment?.tasks.map((task) => task.id) ?? [])
    setResultDrafts((current) =>
      Object.fromEntries(Object.entries(current).filter(([taskId]) => !taskIds.has(taskId)))
    )
    setInspectionDrafts((current) =>
      Object.fromEntries(Object.entries(current).filter(([taskId]) => !taskIds.has(taskId)))
    )
    setSelectedAssignmentId(null)
  }

  return (
    <section className="yumi-work-assignments">
      <YumiSection
        actions={
          <YumiButton
            aria-label="打开新建工作安排"
            onClick={() => {
              setError(null)
              setCreateSheetOpen(true)
            }}
            variant="primary"
          >
            新建工作安排
          </YumiButton>
        }
        title="工作安排记录"
        description={
          props.focusedTaskId
            ? '已定位到当前待处理任务，仅展示这项任务所在的工作安排。'
            : '完成记录提交后，负责人可以在质量确认中填写合格与不合格数量；其他工序只登记完成数量。'
        }
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
                ? '该任务可能已完成或已发生变化，请返回排班队列刷新后继续处理。'
                : '负责人新建安排后，任务与结果确认入口会出现在这里。'
            }
            title={props.focusedTaskId ? '未找到当前任务' : '暂时没有工作安排'}
          />
        ) : (
          <YumiListSurface>
            <YumiListToolbar
              ariaLabel="工作安排列表工具"
              countLabel={`共 ${visibleAssignments.length} 项安排`}
            />
            <YumiDataTable
              ariaLabel="工作安排列表"
              columns={[
                {
                  key: 'arrangement',
                  label: '工作安排',
                  render: (assignment) => (
                    <div className="yumi-list-cell">
                      <strong>{processLabels[assignment.processType]}工作安排</strong>
                      <span>{assignment.assignedOn}</span>
                    </div>
                  )
                },
                {
                  key: 'worker',
                  label: '兼职人员',
                  render: (assignment) => workerLabel(assignment.workerId)
                },
                {
                  key: 'tasks',
                  label: '任务摘要',
                  render: (assignment) => (
                    <div className="yumi-list-cell">
                      <strong>共 {assignment.tasks.length} 项任务</strong>
                      <span>
                        {assignment.tasks
                          .map((task) => {
                            const itemLabel = task.orderItemId
                              ? (itemNames.get(task.orderItemId) ?? '未知商品')
                              : '未关联订单产品'
                            return `${itemLabel} · 计划 ${task.scheduledMinutes} 分钟`
                          })
                          .join('；')}
                      </span>
                    </div>
                  )
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

      <YumiSheet
        description={
          selectedAssignment
            ? `${processLabels[selectedAssignment.processType]} · ${workerLabel(selectedAssignment.workerId)} · ${selectedAssignment.assignedOn}`
            : undefined
        }
        dirty={detailDraftDirty}
        onOpenChange={(open) => {
          if (!open) closeAssignmentDetail()
        }}
        open={selectedAssignment !== null}
        title="工作安排详情"
      >
        {selectedAssignment ? (
          <div className="yumi-assignment-task-list">
            {selectedAssignment.tasks.map((task) => {
              const result = resultByTaskId[task.id]
              const resultDraft = resultDrafts[task.id] ?? { quantity: '', minutes: '', note: '' }
              const inspectionDraft = inspectionDrafts[task.id] ?? {
                qualified: '',
                unqualified: '',
                note: ''
              }
              const status = taskStatus(task.status)
              return (
                <div className="yumi-assignment-task" key={task.id}>
                  <div className="yumi-assignment-task__summary">
                    <span>
                      {itemNames.get(task.orderItemId ?? '') ??
                        task.orderItemId ??
                        '未关联订单产品'}{' '}
                      · {task.sourceType} · 计划 {task.scheduledMinutes} 分钟
                    </span>
                    <YumiStatusTag tone={status.tone}>{status.label}</YumiStatusTag>
                  </div>
                  <YumiTaskRateSummary
                    pieceRateCents={task.pieceRateCents}
                    processType={task.processType}
                  />
                  {task.status === 'pending' && (
                    <form
                      className="yumi-inline-form"
                      onSubmit={(event) => handleSubmitResult(event, task.id)}
                    >
                      <YumiNumberField
                        aria-label="完成数量"
                        min="1"
                        onChange={(event) =>
                          setResultDrafts((current) => ({
                            ...current,
                            [task.id]: { ...resultDraft, quantity: event.target.value }
                          }))
                        }
                        placeholder="完成数量"
                        required
                        value={resultDraft.quantity}
                      />
                      <YumiNumberField
                        aria-label="实际分钟"
                        min="0"
                        onChange={(event) =>
                          setResultDrafts((current) => ({
                            ...current,
                            [task.id]: { ...resultDraft, minutes: event.target.value }
                          }))
                        }
                        placeholder="实际分钟（可选）"
                        value={resultDraft.minutes}
                      />
                      <YumiButton
                        loading={submitting === `result:${task.id}`}
                        type="submit"
                        variant="secondary"
                      >
                        提交完成
                      </YumiButton>
                    </form>
                  )}
                  {task.processType === 'making' &&
                    task.status === 'pending_inspection' &&
                    result && (
                      <form
                        className="yumi-inline-form"
                        onSubmit={(event) => handleInspection(event, task.id, result.id)}
                      >
                        <strong>质量确认</strong>
                        <YumiNumberField
                          aria-label="合格数量"
                          min="0"
                          onChange={(event) =>
                            setInspectionDrafts((current) => ({
                              ...current,
                              [task.id]: { ...inspectionDraft, qualified: event.target.value }
                            }))
                          }
                          placeholder="合格"
                          required
                          value={inspectionDraft.qualified}
                        />
                        <YumiNumberField
                          aria-label="不合格数量"
                          min="0"
                          onChange={(event) =>
                            setInspectionDrafts((current) => ({
                              ...current,
                              [task.id]: { ...inspectionDraft, unqualified: event.target.value }
                            }))
                          }
                          placeholder="不合格"
                          required
                          value={inspectionDraft.unqualified}
                        />
                        <YumiButton
                          loading={submitting === `inspection:${task.id}`}
                          type="submit"
                          variant="primary"
                        >
                          确认质量结果
                        </YumiButton>
                      </form>
                    )}
                  {task.processType === 'making' &&
                    task.status === 'pending_inspection' &&
                    !result && <YumiFormMessage>正在读取待确认的完成记录…</YumiFormMessage>}
                </div>
              )
            })}
          </div>
        ) : null}
      </YumiSheet>

      <YumiSheet
        description="同一安排对应一位兼职人员、一天和一道固定工序；录入完成后会回到工作安排记录。"
        dirty={createDraftDirty}
        footer={
          <YumiButton
            form="work-assignment-create-form"
            loading={submitting === 'assignment'}
            type="submit"
            variant="primary"
          >
            保存工作安排
          </YumiButton>
        }
        onOpenChange={setCreateSheetOpen}
        open={createSheetOpen}
        title="新增工作安排"
      >
        <form className="yumi-form-panel" id="work-assignment-create-form" onSubmit={handleCreate}>
          <YumiFormMessage>
            同一安排对应一位兼职人员、一天和一道固定工序，可包含多个订单产品任务。
          </YumiFormMessage>
          <div className="yumi-form-grid yumi-form-grid--three">
            <YumiField>
              <YumiFieldLabel required>兼职人员</YumiFieldLabel>
              <YumiSelect
                aria-label="兼职人员"
                onValueChange={setWorkerId}
                options={workerOptions}
                placeholder="选择人员"
                value={workerId}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel required>安排日期</YumiFieldLabel>
              <YumiDatePicker
                aria-label="安排日期"
                onValueChange={setAssignedOn}
                value={assignedOn}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel required>工序</YumiFieldLabel>
              <YumiSelect
                aria-label="工序"
                onValueChange={(value) => setProcessType(value as V2ProcessType)}
                options={Object.entries(processLabels).map(([value, label]) => ({ value, label }))}
                value={processType}
              />
            </YumiField>
          </div>
          {tasks.map((task, index) => (
            <div className="yumi-task-draft" key={index}>
              <div className="yumi-task-draft__heading">
                <strong>任务 {index + 1}</strong>
                {tasks.length > 1 && (
                  <YumiButton
                    onClick={() =>
                      setTasks((current) => current.filter((_, taskIndex) => taskIndex !== index))
                    }
                    variant="danger"
                  >
                    移除
                  </YumiButton>
                )}
              </div>
              <div className="yumi-form-grid yumi-form-grid--two">
                <YumiField>
                  <YumiFieldLabel>订单产品</YumiFieldLabel>
                  <YumiSelect
                    aria-label={`任务 ${index + 1} 订单产品`}
                    onValueChange={(value) => updateTask(index, { orderItemId: value })}
                    options={[{ value: '', label: '请选择订单产品' }, ...orderItemOptions]}
                    placeholder="请选择订单产品"
                    value={task.orderItemId}
                  />
                </YumiField>
                <YumiField>
                  <YumiFieldLabel required>任务来源</YumiFieldLabel>
                  <YumiSelect
                    aria-label={`任务 ${index + 1} 来源`}
                    onValueChange={(value) =>
                      updateTask(index, { sourceType: value as TaskDraft['sourceType'] })
                    }
                    options={sourceOptions}
                    value={task.sourceType}
                  />
                </YumiField>
                <YumiField>
                  <YumiFieldLabel>计划数量</YumiFieldLabel>
                  <YumiNumberField
                    min="0"
                    onChange={(event) => updateTask(index, { plannedQuantity: event.target.value })}
                    value={task.plannedQuantity}
                  />
                </YumiField>
                {processType === 'making' ? (
                  <YumiField>
                    <YumiFieldLabel>额外预留分钟</YumiFieldLabel>
                    <YumiNumberField
                      min="0"
                      onChange={(event) => updateTask(index, { extraMinutes: event.target.value })}
                      value={task.extraMinutes}
                    />
                  </YumiField>
                ) : (
                  <YumiField>
                    <YumiFieldLabel>计划分钟</YumiFieldLabel>
                    <YumiNumberField
                      min="0"
                      onChange={(event) =>
                        updateTask(index, { plannedMinutes: event.target.value })
                      }
                      value={task.plannedMinutes}
                    />
                  </YumiField>
                )}
              </div>
              <YumiField>
                <YumiFieldLabel>任务备注</YumiFieldLabel>
                <YumiTextField
                  onChange={(event) => updateTask(index, { note: event.target.value })}
                  value={task.note}
                />
              </YumiField>
            </div>
          ))}
          <div className="yumi-form-actions">
            <YumiButton
              onClick={() => setTasks((current) => [...current, createTaskDraft(props.order)])}
              variant="secondary"
            >
              增加任务
            </YumiButton>
          </div>
        </form>
      </YumiSheet>
    </section>
  )
}
