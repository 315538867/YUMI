import { useMemo, useState, type FormEvent } from 'react'
import { Badge, Button, Flex, Heading, Text, TextField } from '@radix-ui/themes'
import type { V2Order, V2ProcessTaskInput, V2ProcessType } from '@shared/contracts'
import { getErrorMessage, today } from '../../composables/v2-utils'
import { useWorkAssignments } from '../../composables/use-work-assignments'

interface TaskDraft {
  orderItemId: string
  sourceType: V2ProcessTaskInput['sourceType']
  plannedQuantity: string
  plannedMinutes: string
  extraMinutes: string
  note: string
}

const processLabels: Record<V2ProcessType, string> = {
  making: '制作', fluffing_bagging: '捏毛装袋', packing: '打包', shipping: '发货'
}

function createTaskDraft(order?: V2Order): TaskDraft {
  return {
    orderItemId: order?.items[0]?.id ?? '', sourceType: 'normal_production',
    plannedQuantity: '1', plannedMinutes: '0', extraMinutes: '0', note: ''
  }
}

export function WorkAssignmentsPage(props: { order: V2Order | null; onChanged(): void }) {
  const { assignments, resultByTaskId, loading, loadError, createWorkAssignment, submitProcessResult, confirmQualityInspection } = useWorkAssignments()
  const [workerId, setWorkerId] = useState('')
  const [assignedOn, setAssignedOn] = useState(today())
  const [processType, setProcessType] = useState<V2ProcessType>('making')
  const [note, setNote] = useState('')
  const [tasks, setTasks] = useState<TaskDraft[]>([createTaskDraft(props.order)])
  const [resultDrafts, setResultDrafts] = useState<Record<string, { quantity: string; minutes: string; note: string }>>({})
  const [inspectionDrafts, setInspectionDrafts] = useState<Record<string, { qualified: string; unqualified: string; note: string }>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)

  const itemNames = useMemo(() => new Map(props.order?.items.map((item) => [item.id, item.productSnapshot.name]) ?? []), [props.order])
  const updateTask = (index: number, patch: Partial<TaskDraft>) => setTasks((current) => current.map((task, taskIndex) => taskIndex === index ? { ...task, ...patch } : task))

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting('assignment')
    try {
      await createWorkAssignment({
        workerId, assignedOn, processType, note,
        tasks: tasks.map((task) => ({
          orderItemId: task.orderItemId || null, sourceType: task.sourceType,
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
    } catch (cause) { setError(getErrorMessage(cause)) } finally { setSubmitting(null) }
  }

  const handleSubmitResult = async (event: FormEvent, taskId: string) => {
    event.preventDefault()
    const draft = resultDrafts[taskId] ?? { quantity: '', minutes: '', note: '' }
    setError(null)
    setSubmitting(`result:${taskId}`)
    try {
      await submitProcessResult(taskId, {
        completedQuantity: Number(draft.quantity), actualMinutes: draft.minutes === '' ? null : Number(draft.minutes),
        submittedOn: today(), note: draft.note
      })
      setResultDrafts((current) => ({ ...current, [taskId]: { quantity: '', minutes: '', note: '' } }))
    } catch (cause) { setError(getErrorMessage(cause)) } finally { setSubmitting(null) }
  }

  const handleInspection = async (event: FormEvent, taskId: string, resultId: string) => {
    event.preventDefault()
    const draft = inspectionDrafts[taskId] ?? { qualified: '', unqualified: '', note: '' }
    setError(null)
    setSubmitting(`inspection:${taskId}`)
    try {
      await confirmQualityInspection(resultId, {
        qualifiedQuantity: Number(draft.qualified), unqualifiedQuantity: Number(draft.unqualified),
        inspectedOn: today(), requiresRework: Number(draft.unqualified) > 0, note: draft.note
      })
      setInspectionDrafts((current) => ({ ...current, [taskId]: { qualified: '', unqualified: '', note: '' } }))
      props.onChanged()
    } catch (cause) { setError(getErrorMessage(cause)) } finally { setSubmitting(null) }
  }

  return <section className="fulfillment-section">
    <div className="panel"><Heading size="5">新增工作安排</Heading><Text size="2" color="gray">同一安排对应一位兼职人员、一天和一道固定工序，可包含多个订单产品任务。</Text>
      <form className="editor-form" onSubmit={handleCreate}>
        <div className="form-grid"><label>兼职人员标识<TextField.Root value={workerId} onChange={(event) => setWorkerId(event.target.value)} placeholder="阶段 C 建立人员主数据前填写标识" /></label><label>安排日期<TextField.Root type="date" value={assignedOn} onChange={(event) => setAssignedOn(event.target.value)} /></label><label>工序<select value={processType} onChange={(event) => setProcessType(event.target.value as V2ProcessType)}>{Object.entries(processLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        {tasks.map((task, index) => <div className="task-draft" key={index}><Flex justify="between" align="center"><Text weight="bold">任务 {index + 1}</Text>{tasks.length > 1 && <Button type="button" variant="ghost" color="red" onClick={() => setTasks((current) => current.filter((_, taskIndex) => taskIndex !== index))}>移除</Button>}</Flex><div className="form-grid"><label>订单产品<select value={task.orderItemId} onChange={(event) => updateTask(index, { orderItemId: event.target.value })}><option value="">{processType === 'shipping' ? '不关联订单产品' : '请选择订单产品'}</option>{props.order?.items.map((item) => <option key={item.id} value={item.id}>{item.productSnapshot.name}</option>)}</select></label><label>任务来源<select value={task.sourceType} onChange={(event) => updateTask(index, { sourceType: event.target.value as TaskDraft['sourceType'] })}><option value="normal_production">正常生产</option><option value="rework">返工</option><option value="after_sales_replacement">售后补发</option><option value="manager_arrangement">负责人安排</option></select></label><label>计划数量<TextField.Root type="number" min="0" value={task.plannedQuantity} onChange={(event) => updateTask(index, { plannedQuantity: event.target.value })} /></label>{processType === 'making' ? <label>额外预留分钟<TextField.Root type="number" min="0" value={task.extraMinutes} onChange={(event) => updateTask(index, { extraMinutes: event.target.value })} /></label> : <label>计划分钟<TextField.Root type="number" min="0" value={task.plannedMinutes} onChange={(event) => updateTask(index, { plannedMinutes: event.target.value })} /></label>}</div><label>任务备注<TextField.Root value={task.note} onChange={(event) => updateTask(index, { note: event.target.value })} /></label></div>)}
        <Flex justify="between"><Button type="button" variant="soft" color="gray" onClick={() => setTasks((current) => [...current, createTaskDraft(props.order)])}>增加任务</Button><Button type="submit" disabled={submitting === 'assignment'}>{submitting === 'assignment' ? '保存中…' : '保存工作安排'}</Button></Flex>
      </form>
    </div>
    <div className="panel"><Heading size="5">工作安排与次日质检</Heading>{loadError && <Text color="red">{loadError}</Text>}{error && <Text color="red">{error}</Text>}{loading ? <div className="empty">加载中…</div> : assignments.length === 0 ? <div className="empty">暂时没有工作安排。</div> : <div className="assignment-list">{assignments.map((assignment) => <article key={assignment.id} className="assignment-card"><Flex justify="between"><div><Text weight="bold">{processLabels[assignment.processType]} · {assignment.workerId}</Text><Text size="2" color="gray">{assignment.assignedOn} · {assignment.status}</Text></div><Badge>{assignment.tasks.length} 项任务</Badge></Flex>{assignment.tasks.map((task) => { const result = resultByTaskId[task.id]; const resultDraft = resultDrafts[task.id] ?? { quantity: '', minutes: '', note: '' }; const inspectionDraft = inspectionDrafts[task.id] ?? { qualified: '', unqualified: '', note: '' }; return <div className="assignment-task" key={task.id}><Text>{itemNames.get(task.orderItemId ?? '') ?? task.orderItemId ?? '未关联订单产品'} · {task.sourceType} · 计划 {task.scheduledMinutes} 分钟 · {task.status}</Text>{task.status === 'pending' && <form className="inline-form" onSubmit={(event) => handleSubmitResult(event, task.id)}><TextField.Root aria-label="完成数量" type="number" min="1" placeholder="完成数量" value={resultDraft.quantity} onChange={(event) => setResultDrafts((current) => ({ ...current, [task.id]: { ...resultDraft, quantity: event.target.value } }))} /><TextField.Root aria-label="实际分钟" type="number" min="0" placeholder="实际分钟（可选）" value={resultDraft.minutes} onChange={(event) => setResultDrafts((current) => ({ ...current, [task.id]: { ...resultDraft, minutes: event.target.value } }))} /><Button type="submit" disabled={submitting === `result:${task.id}`}>提交完成</Button></form>}{task.status === 'pending_inspection' && result && <form className="inline-form" onSubmit={(event) => handleInspection(event, task.id, result.id)}><Text weight="bold">次日质检</Text><TextField.Root aria-label="合格数量" type="number" min="0" placeholder="合格" value={inspectionDraft.qualified} onChange={(event) => setInspectionDrafts((current) => ({ ...current, [task.id]: { ...inspectionDraft, qualified: event.target.value } }))} /><TextField.Root aria-label="不合格数量" type="number" min="0" placeholder="不合格" value={inspectionDraft.unqualified} onChange={(event) => setInspectionDrafts((current) => ({ ...current, [task.id]: { ...inspectionDraft, unqualified: event.target.value } }))} /><Button type="submit" disabled={submitting === `inspection:${task.id}`}>确认质检</Button></form>}{task.status === 'pending_inspection' && !result && <Text size="2" color="gray">正在读取待质检完成记录…</Text>}</div>})}</article>)}</div>}</div>
  </section>
}
