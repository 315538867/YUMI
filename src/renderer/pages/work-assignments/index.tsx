import { useMemo, useState, type FormEvent } from 'react'
import type { V2Order, V2ProcessTaskInput, V2ProcessType } from '@shared/contracts/index'
import { getErrorMessage, today } from '../../composables/v2-utils'
import { useWorkAssignments } from '../../composables/use-work-assignments'
import {
  YumiBusinessList,
  YumiBusinessListItem,
  YumiButton,
  YumiDatePicker,
  YumiEmptyState,
  YumiField,
  YumiFieldLabel,
  YumiNumberField,
  YumiSection,
  YumiSelect,
  YumiStatusTag,
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
  packing: '打包',
  shipping: '发货'
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
  if (taskStatus === 'pending_inspection') return { label: '待次日质检', tone: 'warning' as const }
  if (taskStatus === 'completed') return { label: '已完成', tone: 'success' as const }
  return { label: '待完成', tone: 'neutral' as const }
}

export function WorkAssignmentsPage(props: {
  order: V2Order | null
  focusedTaskId?: string
  onChanged(): void
}) {
  const {
    assignments,
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
  useYumiNotificationMessage(loadError)
  useYumiNotificationMessage(error)

  const itemNames = useMemo(
    () => new Map(props.order?.items.map((item) => [item.id, item.productSnapshot.name]) ?? []),
    [props.order]
  )
  const orderItemOptions =
    props.order?.items.map((item) => ({ value: item.id, label: item.productSnapshot.name })) ?? []
  const visibleAssignments = props.focusedTaskId
    ? assignments.filter((assignment) =>
        assignment.tasks.some((task) => task.id === props.focusedTaskId)
      )
    : assignments
  const updateTask = (index: number, patch: Partial<TaskDraft>) =>
    setTasks((current) =>
      current.map((task, taskIndex) => (taskIndex === index ? { ...task, ...patch } : task))
    )

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
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
      setWorkerId('')
      setNote('')
      setTasks([createTaskDraft(props.order)])
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

  return (
    <section className="yumi-work-assignments">
      <form className="yumi-form-panel" onSubmit={handleCreate}>
        <h2 className="yumi-form-panel__title">新增工作安排</h2>
        <p className="yumi-form-hint">
          同一安排对应一位兼职人员、一天和一道固定工序，可包含多个订单产品任务。
        </p>
        <div className="yumi-form-grid yumi-form-grid--three">
          <YumiField>
            <YumiFieldLabel required>兼职人员标识</YumiFieldLabel>
            <YumiTextField
              onChange={(event) => setWorkerId(event.target.value)}
              placeholder="阶段 C 建立人员主数据前填写标识"
              required
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
                  options={[
                    {
                      value: '',
                      label: processType === 'shipping' ? '不关联订单产品' : '请选择订单产品'
                    },
                    ...orderItemOptions
                  ]}
                  placeholder={processType === 'shipping' ? '不关联订单产品' : '请选择订单产品'}
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
                    onChange={(event) => updateTask(index, { plannedMinutes: event.target.value })}
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
        <div className="yumi-form-actions yumi-form-actions--between">
          <YumiButton
            onClick={() => setTasks((current) => [...current, createTaskDraft(props.order)])}
            variant="secondary"
          >
            增加任务
          </YumiButton>
          <YumiButton loading={submitting === 'assignment'} type="submit" variant="primary">
            {submitting === 'assignment' ? '保存中…' : '保存工作安排'}
          </YumiButton>
        </div>
      </form>

      <YumiSection
        title="工作安排与次日质检"
        description={
          props.focusedTaskId
            ? '已定位到当前待处理任务，仅展示这项任务所在的工作安排。'
            : '完成记录提交后，负责人可以在次日质检中填写合格与不合格数量。'
        }
      >
        {loading ? (
          <YumiEmptyState description="工作安排正在读取，请稍候。" title="加载中…" />
        ) : visibleAssignments.length === 0 ? (
          <YumiEmptyState
            description={
              props.focusedTaskId
                ? '该任务可能已完成或已发生变化，请返回履约队列刷新后继续处理。'
                : '负责人新建安排后，任务和质检入口会出现在这里。'
            }
            title={props.focusedTaskId ? '未找到当前任务' : '暂时没有工作安排'}
          />
        ) : (
          <YumiBusinessList>
            {visibleAssignments.map((assignment) => (
              <YumiBusinessListItem
                key={assignment.id}
                meta={assignment.assignedOn}
                metrics={[{ label: '任务数', value: assignment.tasks.length }]}
                status={
                  <YumiStatusTag tone={assignment.status === 'completed' ? 'success' : 'brand'}>
                    {assignment.status}
                  </YumiStatusTag>
                }
                summary={`${processLabels[assignment.processType]} · ${assignment.workerId}`}
                title={`${processLabels[assignment.processType]} 工作安排`}
              >
                <div className="yumi-assignment-task-list">
                  {assignment.tasks.map((task) => {
                    const result = resultByTaskId[task.id]
                    const resultDraft = resultDrafts[task.id] ?? {
                      quantity: '',
                      minutes: '',
                      note: ''
                    }
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
                        {task.status === 'pending_inspection' && result && (
                          <form
                            className="yumi-inline-form"
                            onSubmit={(event) => handleInspection(event, task.id, result.id)}
                          >
                            <strong>次日质检</strong>
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
                              确认质检
                            </YumiButton>
                          </form>
                        )}
                        {task.status === 'pending_inspection' && !result && (
                          <p className="yumi-form-hint">正在读取待质检完成记录…</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </YumiBusinessListItem>
            ))}
          </YumiBusinessList>
        )}
      </YumiSection>
    </section>
  )
}
