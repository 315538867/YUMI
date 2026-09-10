import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react'
import type { V2Worker, V2WorkAssignmentCreateInput } from '@shared/contracts/index'
import { today } from '../../composables/v2-utils'
import {
  getFulfillmentQueueStageSchedule,
  getWorkerWeekTasks,
  type ActionableFulfillmentQueueStage,
  type FulfillmentQueueItem,
  type FulfillmentScheduledTask
} from '../../composables/use-fulfillment'
import {
  YumiBusinessList,
  YumiBusinessListItem,
  YumiButton,
  YumiDatePicker,
  YumiField,
  YumiFieldLabel,
  YumiNumberField,
  YumiSelect,
  YumiSheet,
  YumiStatusTag,
  YumiTextArea
} from '../ui'

const dispatchStageLabels: Record<ActionableFulfillmentQueueStage, string> = {
  making: '制作',
  fluffing_bagging: '捏毛装袋',
  packing: '打包',
  ready_to_ship: '待发货'
}

const stageProcessTypes: Record<
  ActionableFulfillmentQueueStage,
  V2WorkAssignmentCreateInput['processType']
> = {
  making: 'making',
  fluffing_bagging: 'fluffing_bagging',
  packing: 'packing',
  ready_to_ship: 'shipping'
}
const stages: ActionableFulfillmentQueueStage[] = [
  'making',
  'fluffing_bagging',
  'packing',
  'ready_to_ship'
]

export interface DispatchPrefill {
  assignedOn?: string
  orderItemId?: string
  stage?: ActionableFulfillmentQueueStage
  workerId?: string
}

function stopRowOpen(event: MouseEvent) {
  event.stopPropagation()
}

function taskStatusLabel(status: FulfillmentScheduledTask['status']) {
  return status === 'pending_inspection' ? '待质检' : '待完成'
}

function stageTone(
  stage: ActionableFulfillmentQueueStage
): 'neutral' | 'info' | 'brand' | 'warning' {
  if (stage === 'fluffing_bagging') return 'info'
  if (stage === 'packing') return 'brand'
  if (stage === 'ready_to_ship') return 'warning'
  return 'neutral'
}

export function OrderDispatchBoard(props: {
  items: FulfillmentQueueItem[]
  stage: 'all' | ActionableFulfillmentQueueStage
  onOpenItem(item: FulfillmentQueueItem, stage: ActionableFulfillmentQueueStage): void
  onOpenAssignment(prefill: DispatchPrefill): void
  onOpenTask(item: FulfillmentQueueItem, task: FulfillmentScheduledTask): void
}) {
  return (
    <YumiBusinessList className="yumi-fulfillment-dispatch-list">
      {props.items.map((item) => {
        const visibleStages =
          props.stage === 'all'
            ? stages.filter((stage) => {
                const schedule = getFulfillmentQueueStageSchedule(item, stage)
                return (
                  schedule.wipQuantity > 0 ||
                  schedule.tasks.length > 0 ||
                  schedule.overassignedQuantity > 0
                )
              })
            : [props.stage]
        const primaryStage = visibleStages[0] ?? 'making'
        return (
          <YumiBusinessListItem
            className="yumi-fulfillment-dispatch-item"
            key={item.orderItemId}
            meta={`${item.orderCode} · ${item.customerName}`}
            onOpen={() => props.onOpenItem(item, primaryStage)}
            status={
              <YumiStatusTag tone={stageTone(primaryStage)}>
                {dispatchStageLabels[primaryStage]}
              </YumiStatusTag>
            }
            summary={`${item.productName} · 确认 ${item.confirmedQuantity} · 点击进入产品操作台`}
            title={item.orderCode}
          >
            <div className="yumi-fulfillment-stage-stack">
              {visibleStages.map((stage) => {
                const schedule = getFulfillmentQueueStageSchedule(item, stage)
                return (
                  <section className="yumi-fulfillment-stage" key={stage} onClick={stopRowOpen}>
                    <div className="yumi-fulfillment-stage__header">
                      <strong>
                        {dispatchStageLabels[stage]} {schedule.wipQuantity}
                      </strong>
                      {schedule.unassignedQuantity > 0 ? (
                        <YumiButton
                          aria-label={`派工${dispatchStageLabels[stage]}`}
                          onClick={(event) => {
                            stopRowOpen(event)
                            props.onOpenAssignment({ orderItemId: item.orderItemId, stage })
                          }}
                          variant="secondary"
                        >
                          + 派工
                        </YumiButton>
                      ) : null}
                    </div>
                    {schedule.unassignedQuantity > 0 ? (
                      <p className="yumi-fulfillment-stage__unassigned">
                        未派 {schedule.unassignedQuantity}
                      </p>
                    ) : null}
                    {schedule.overassignedQuantity > 0 ? (
                      <p className="yumi-fulfillment-stage__overassigned">
                        超派 {schedule.overassignedQuantity}，请核对安排
                      </p>
                    ) : null}
                    {schedule.tasks.map((task) => (
                      <YumiButton
                        aria-label={`${task.workerName} ${task.plannedQuantity} ${task.assignedOn} ${taskStatusLabel(task.status)}`}
                        className="yumi-fulfillment-task-card"
                        key={task.taskId}
                        onClick={(event) => {
                          stopRowOpen(event)
                          props.onOpenTask(item, task)
                        }}
                        variant="ghost"
                      >
                        已派 {task.workerName} {task.plannedQuantity} · {task.assignedOn} ·{' '}
                        {taskStatusLabel(task.status)}
                      </YumiButton>
                    ))}
                  </section>
                )
              })}
            </div>
          </YumiBusinessListItem>
        )
      })}
    </YumiBusinessList>
  )
}

function dateParts(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfWeek(date = today()): string {
  const current = new Date(`${date}T00:00:00`)
  const day = current.getDay() || 7
  current.setDate(current.getDate() - day + 1)
  return dateParts(current)
}

function addDays(date: string, count: number): string {
  const next = new Date(`${date}T00:00:00`)
  next.setDate(next.getDate() + count)
  return dateParts(next)
}

export function WorkerWeekSchedule(props: {
  items: FulfillmentQueueItem[]
  workers: V2Worker[]
  onOpenAssignment(prefill: DispatchPrefill): void
  onOpenTask(item: FulfillmentQueueItem, task: FulfillmentScheduledTask): void
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek())
  const dates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart]
  )
  const tasks = useMemo(() => getWorkerWeekTasks(props.items, weekStart), [props.items, weekStart])
  const itemById = useMemo(
    () => new Map(props.items.map((item) => [item.orderItemId, item])),
    [props.items]
  )
  const workerRows = useMemo(() => {
    const knownWorkers = props.workers.filter((worker) => worker.enabled)
    const knownIds = new Set(knownWorkers.map((worker) => worker.id))
    const missingWorkers = tasks
      .filter((task) => !knownIds.has(task.workerId))
      .reduce<V2Worker[]>(
        (rows, task) =>
          rows.some((worker) => worker.id === task.workerId)
            ? rows
            : [...rows, { id: task.workerId, name: task.workerName, enabled: false } as V2Worker],
        []
      )
    return [...knownWorkers, ...missingWorkers]
  }, [props.workers, tasks])

  return (
    <section className="yumi-worker-week" aria-label="人员周历">
      <div className="yumi-worker-week__header">
        <div>
          <h2>人员周历</h2>
          <p>
            {weekStart} 至 {dates[6]} · 仅显示待完成与待质检任务
          </p>
        </div>
        <div className="yumi-page-tabs">
          <YumiButton
            onClick={() => setWeekStart((current) => addDays(current, -7))}
            variant="ghost"
          >
            上一周
          </YumiButton>
          <YumiButton onClick={() => setWeekStart(startOfWeek())} variant="secondary">
            本周
          </YumiButton>
          <YumiButton
            onClick={() => setWeekStart((current) => addDays(current, 7))}
            variant="ghost"
          >
            下一周
          </YumiButton>
        </div>
      </div>
      <div className="yumi-worker-week__scroller">
        <div
          className="yumi-worker-week__grid"
          style={{ gridTemplateColumns: '160px repeat(7, minmax(150px, 1fr))' }}
        >
          <strong className="yumi-worker-week__corner">人员</strong>
          {dates.map((date, index) => (
            <strong className="yumi-worker-week__date" key={date}>
              {['周一', '周二', '周三', '周四', '周五', '周六', '周日'][index]}
              <small>{date.slice(5)}</small>
            </strong>
          ))}
          {workerRows.map((worker) => (
            <div className="yumi-worker-week__row" key={worker.id}>
              <strong className="yumi-worker-week__worker">{worker.name}</strong>
              {dates.map((date) => {
                const cellTasks = tasks.filter(
                  (task) => task.workerId === worker.id && task.assignedOn === date
                )
                return (
                  <div className="yumi-worker-week__cell" key={date}>
                    {cellTasks.map((task) => {
                      const item = itemById.get(task.orderItemId)
                      if (!item) return null
                      return (
                        <YumiButton
                          aria-label={`${task.productName} ${dispatchStageLabels[task.stage]} ${task.plannedQuantity} ${taskStatusLabel(task.status)}`}
                          className="yumi-worker-week__task"
                          key={task.taskId}
                          onClick={() => props.onOpenTask(item, task)}
                          variant="ghost"
                        >
                          {task.productName} · {dispatchStageLabels[task.stage]} ·{' '}
                          {task.plannedQuantity} · {taskStatusLabel(task.status)}
                        </YumiButton>
                      )
                    })}
                    <YumiButton
                      aria-label={`为${worker.name}${date}派工`}
                      className="yumi-worker-week__add"
                      onClick={() =>
                        props.onOpenAssignment({ workerId: worker.id, assignedOn: date })
                      }
                      variant="ghost"
                    >
                      + 派工
                    </YumiButton>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function WorkAssignmentSheet(props: {
  items: FulfillmentQueueItem[]
  open: boolean
  prefill: DispatchPrefill | null
  workers: V2Worker[]
  onOpenChange(open: boolean): void
  onSubmit(input: V2WorkAssignmentCreateInput): Promise<unknown>
}) {
  const [workerId, setWorkerId] = useState('')
  const [assignedOn, setAssignedOn] = useState(today())
  const [orderItemId, setOrderItemId] = useState('')
  const [stage, setStage] = useState<ActionableFulfillmentQueueStage>('making')
  const [quantity, setQuantity] = useState('')
  const [plannedMinutes, setPlannedMinutes] = useState('')
  const [extraMinutes, setExtraMinutes] = useState('0')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!props.open) return
    setWorkerId(props.prefill?.workerId ?? '')
    setAssignedOn(props.prefill?.assignedOn ?? today())
    setOrderItemId(props.prefill?.orderItemId ?? '')
    setStage(props.prefill?.stage ?? 'making')
    setQuantity('')
    setPlannedMinutes('')
    setExtraMinutes('0')
    setNote('')
    setError(null)
  }, [props.open, props.prefill])

  const selectedItem = props.items.find((item) => item.orderItemId === orderItemId)
  const schedule = selectedItem ? getFulfillmentQueueStageSchedule(selectedItem, stage) : null
  const workerOptions = props.workers
    .filter((worker) => worker.enabled)
    .map((worker) => ({ value: worker.id, label: worker.name }))
  const itemOptions = props.items.map((item) => ({
    value: item.orderItemId,
    label: `${item.orderCode} · ${item.productName}`
  }))
  const isMaking = stage === 'making'

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const parsedQuantity = Number(quantity)
    const parsedMinutes = Number(plannedMinutes)
    const parsedExtraMinutes = Number(extraMinutes || '0')
    if (
      !orderItemId ||
      !selectedItem ||
      !workerId ||
      !assignedOn ||
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity <= 0
    ) {
      setError('请完整填写人员、日期、订单商品和正整数数量。')
      return
    }
    if (!schedule || parsedQuantity > schedule.unassignedQuantity) {
      setError(`计划数量不能超过当前待派上限 ${schedule?.unassignedQuantity ?? 0} 件。`)
      return
    }
    if (!isMaking && (!Number.isInteger(parsedMinutes) || parsedMinutes <= 0)) {
      setError('非制作工序必须填写正整数计划分钟。')
      return
    }
    if (isMaking && (!Number.isInteger(parsedExtraMinutes) || parsedExtraMinutes < 0)) {
      setError('额外预留分钟必须是非负整数。')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await props.onSubmit({
        workerId,
        assignedOn,
        processType: stageProcessTypes[stage],
        note: note || undefined,
        tasks: [
          {
            orderItemId,
            sourceType: 'normal_production',
            plannedQuantity: parsedQuantity,
            plannedMinutes: isMaking ? null : parsedMinutes,
            extraMinutes: isMaking ? parsedExtraMinutes : 0,
            note: note || undefined
          }
        ]
      })
      props.onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '派工保存失败，请稍后重试。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <YumiSheet
      description="保存后会立即刷新订单视角和人员周历。"
      onOpenChange={props.onOpenChange}
      open={props.open}
      title={`派工：${dispatchStageLabels[stage]}`}
    >
      <form className="yumi-form-panel yumi-sheet-form" onSubmit={handleSubmit}>
        {error ? (
          <p className="yumi-form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="yumi-form-grid yumi-form-grid--two">
          <YumiField>
            <YumiFieldLabel required>兼职人员</YumiFieldLabel>
            <YumiSelect
              aria-label="派工人员"
              onValueChange={setWorkerId}
              options={workerOptions}
              placeholder="选择人员"
              value={workerId}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel required>日期</YumiFieldLabel>
            <YumiDatePicker
              aria-label="派工日期"
              onValueChange={setAssignedOn}
              value={assignedOn}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel required>订单商品</YumiFieldLabel>
            <YumiSelect
              aria-label="派工订单商品"
              onValueChange={setOrderItemId}
              options={itemOptions}
              placeholder="选择订单商品"
              value={orderItemId}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel required>工序</YumiFieldLabel>
            <YumiSelect
              aria-label="派工工序"
              onValueChange={(value) => setStage(value as ActionableFulfillmentQueueStage)}
              options={stages.map((value) => ({ value, label: dispatchStageLabels[value] }))}
              value={stage}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel required>数量</YumiFieldLabel>
            <YumiNumberField
              aria-label="派工数量"
              max={schedule?.unassignedQuantity ?? undefined}
              min="1"
              onChange={(event) => setQuantity(event.target.value)}
              required
              value={quantity}
            />
            {schedule ? (
              <p className="yumi-form-hint">待派上限：{schedule.unassignedQuantity} 件</p>
            ) : null}
          </YumiField>
          {isMaking ? (
            <YumiField>
              <YumiFieldLabel>额外预留分钟</YumiFieldLabel>
              <YumiNumberField
                aria-label="额外预留分钟"
                min="0"
                onChange={(event) => setExtraMinutes(event.target.value)}
                value={extraMinutes}
              />
            </YumiField>
          ) : (
            <YumiField>
              <YumiFieldLabel required>计划分钟</YumiFieldLabel>
              <YumiNumberField
                aria-label="计划分钟"
                min="1"
                onChange={(event) => setPlannedMinutes(event.target.value)}
                value={plannedMinutes}
              />
            </YumiField>
          )}
        </div>
        <YumiField>
          <YumiFieldLabel>备注</YumiFieldLabel>
          <YumiTextArea onChange={(event) => setNote(event.target.value)} value={note} />
        </YumiField>
        <div className="yumi-form-actions">
          <YumiButton loading={submitting} type="submit" variant="primary">
            保存派工
          </YumiButton>
        </div>
      </form>
    </YumiSheet>
  )
}
