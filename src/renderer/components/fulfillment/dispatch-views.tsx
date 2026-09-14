import { useEffect, useMemo, useState, type FormEvent } from 'react'
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
  YumiButton,
  YumiDataTable,
  YumiEmptyState,
  YumiListSurface,
  YumiListToolbar,
  YumiDatePicker,
  YumiField,
  YumiFieldLabel,
  YumiFormMessage,
  YumiNumberField,
  YumiSelect,
  YumiSection,
  YumiSheet,
  YumiStatusTag,
  YumiTextArea
} from '../ui'

const dispatchStageLabels: Record<ActionableFulfillmentQueueStage, string> = {
  making: '制作',
  fluffing_bagging: '捏毛装袋',
  edge_sewing: '缝边',
  packing: '打包发货'
}

const stages: ActionableFulfillmentQueueStage[] = [
  'making',
  'fluffing_bagging',
  'edge_sewing',
  'packing'
]

export interface DispatchPrefill {
  assignedOn?: string
  orderItemId?: string
  stage?: ActionableFulfillmentQueueStage
  workerId?: string
}

function taskStatusLabel(status: FulfillmentScheduledTask['status']) {
  return status === 'pending_inspection' ? '待质检' : '待完成'
}

function stageTone(
  stage: ActionableFulfillmentQueueStage
): 'neutral' | 'info' | 'brand' | 'warning' {
  if (stage === 'fluffing_bagging') return 'info'
  if (stage === 'edge_sewing') return 'warning'
  if (stage === 'packing') return 'brand'
  return 'neutral'
}

export function OrderDispatchBoard(props: {
  items: FulfillmentQueueItem[]
  stage: 'all' | ActionableFulfillmentQueueStage
  onOpenItem(item: FulfillmentQueueItem, stage: ActionableFulfillmentQueueStage): void
  onOpenAssignment(prefill: DispatchPrefill): void
  onOpenTask(item: FulfillmentQueueItem, task: FulfillmentScheduledTask): void
}) {
  const visibleStagesFor = (item: FulfillmentQueueItem) =>
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

  return (
    <YumiSection
      ariaLabel="订单排班队列"
      description="按订单查看待派与已派任务，进入处理区登记实际进度。"
      title="订单排班队列"
    >
      <YumiListSurface className="yumi-fulfillment-dispatch-surface">
        <YumiListToolbar
          ariaLabel="排班队列列表工具"
          countLabel={`共 ${props.items.length} 个待处理产品`}
        />
        <YumiDataTable
          ariaLabel="排班队列列表"
          columns={[
            {
              key: 'order',
              label: '订单 / 客户',
              render: (item) => (
                <div className="yumi-fulfillment-order-cell">
                  <strong>{item.orderCode}</strong>
                  <span>{item.customerName}</span>
                </div>
              )
            },
            {
              key: 'product',
              label: '产品 / 确认数量',
              render: (item) => (
                <div className="yumi-fulfillment-product-cell">
                  <strong>{item.productName}</strong>
                  <span>确认 {item.confirmedQuantity} 件</span>
                </div>
              )
            },
            {
              key: 'stage',
              label: '排班阶段',
              render: (item) => (
                <div className="yumi-fulfillment-stage-tags">
                  {visibleStagesFor(item).map((stage) => (
                    <YumiStatusTag key={stage} tone={stageTone(stage)}>
                      {dispatchStageLabels[stage]}
                    </YumiStatusTag>
                  ))}
                </div>
              )
            },
            {
              key: 'schedule',
              label: '任务分配',
              render: (item) => (
                <div className="yumi-fulfillment-stage-stack">
                  {visibleStagesFor(item).map((stage) => {
                    const schedule = getFulfillmentQueueStageSchedule(item, stage)
                    const assignedQuantity = schedule.tasks.reduce(
                      (total, task) => total + task.plannedQuantity,
                      0
                    )
                    const assignedSummary =
                      schedule.tasks.length === 1
                        ? `已指派：${schedule.tasks[0].workerName} ${assignedQuantity} 件`
                        : schedule.tasks.length > 1
                          ? `已指派：${schedule.tasks.length} 人 ${assignedQuantity} 件`
                          : '已指派：0 件'
                    return (
                      <section className="yumi-fulfillment-stage" key={stage}>
                        <div className="yumi-fulfillment-stage__row">
                          <strong>{dispatchStageLabels[stage]}</strong>
                          <span className="yumi-fulfillment-stage__assigned">
                            {assignedSummary}
                          </span>
                          <span className="yumi-fulfillment-stage__unassigned">
                            未指派：{schedule.unassignedQuantity} 件
                          </span>
                          {schedule.overassignedQuantity > 0 ? (
                            <span className="yumi-fulfillment-stage__overassigned">
                              超派：{schedule.overassignedQuantity} 件
                            </span>
                          ) : null}
                          <div className="yumi-fulfillment-stage__actions">
                            {schedule.tasks.length > 0 ? (
                              <YumiButton
                                aria-label={`查看${dispatchStageLabels[stage]}任务`}
                                onClick={() => props.onOpenTask(item, schedule.tasks[0])}
                                variant="ghost"
                              >
                                查看任务
                              </YumiButton>
                            ) : null}
                            {schedule.unassignedQuantity > 0 ? (
                              <YumiButton
                                aria-label={`派工${dispatchStageLabels[stage]}`}
                                onClick={() =>
                                  props.onOpenAssignment({ orderItemId: item.orderItemId, stage })
                                }
                                variant="secondary"
                              >
                                派工
                              </YumiButton>
                            ) : null}
                          </div>
                        </div>
                      </section>
                    )
                  })}
                </div>
              )
            },
            {
              key: 'action',
              label: '操作',
              align: 'right',
              render: (item) => {
                const primaryStage = visibleStagesFor(item)[0] ?? 'making'
                return (
                  <YumiButton
                    aria-label={`进入处理：${item.productName}`}
                    onClick={() => props.onOpenItem(item, primaryStage)}
                    variant="secondary"
                  >
                    进入处理
                  </YumiButton>
                )
              }
            }
          ]}
          getRowKey={(item) => item.orderItemId}
          rows={props.items}
        />
      </YumiListSurface>
    </YumiSection>
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

const workerToneCount = 12

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
  const orderedWorkers = useMemo(() => {
    const sorted = [...props.workers].sort((left, right) =>
      (left.createdAt ?? '').localeCompare(right.createdAt ?? '')
    )
    const knownIds = new Set(sorted.map((worker) => worker.id))
    const extras = tasks.reduce<V2Worker[]>(
      (rows, task) =>
        knownIds.has(task.workerId) || rows.some((worker) => worker.id === task.workerId)
          ? rows
          : [...rows, { id: task.workerId, name: task.workerName, enabled: false } as V2Worker],
      []
    )
    return [...sorted, ...extras]
  }, [props.workers, tasks])
  const toneByWorker = useMemo(() => {
    const tones = new Map<string, number>()
    orderedWorkers.forEach((worker, index) => tones.set(worker.id, (index % workerToneCount) + 1))
    return tones
  }, [orderedWorkers])
  const workersWithTasks = useMemo(
    () => new Set(tasks.map((task) => task.workerId)),
    [tasks]
  )
  const hasSchedulableWorkers = orderedWorkers.some(
    (worker) => worker.enabled || workersWithTasks.has(worker.id)
  )

  return (
    <YumiSection
      actions={
        <div aria-label="人员周历日期导航" className="yumi-worker-week__actions" role="group">
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
      }
      ariaLabel="人员周历"
      className="yumi-worker-week"
      description={`${weekStart} 至 ${dates[6]} · 仅显示待完成与待质检任务`}
      title="人员周历"
    >
      {!hasSchedulableWorkers ? (
        <YumiEmptyState
          description="先到「工资」页的「人员与时薪」新增兼职人员并设置生效时薪；这里会按日期分列展示每位人员的待处理任务，并提供每天列底部的「＋ 派工」入口。"
          scenario="first-use"
          title="还没有可排班的兼职人员"
        />
      ) : (
        <div className="yumi-worker-week__scroller">
          <div
            className="yumi-worker-week__grid"
            style={{ gridTemplateColumns: 'repeat(7, minmax(150px, 1fr))' }}
          >
            {dates.map((date, index) => {
              const dayTasks = tasks.filter((task) => task.assignedOn === date)
              const groups = orderedWorkers
                .map((worker) => ({
                  worker,
                  tasks: dayTasks.filter((task) => task.workerId === worker.id)
                }))
                .filter((group) => group.tasks.length > 0)
              return (
                <div className="yumi-worker-week__column" key={date}>
                  <strong className="yumi-worker-week__date">
                    {['周一', '周二', '周三', '周四', '周五', '周六', '周日'][index]}
                    <small>{date.slice(5)}</small>
                  </strong>
                  {groups.map((group) => (
                    <div
                      className="yumi-worker-week__person"
                      data-tone={toneByWorker.get(group.worker.id) ?? 1}
                      key={group.worker.id}
                    >
                      <div className="yumi-worker-week__person-head">
                        <strong className="yumi-worker-week__person-name">
                          <span aria-hidden="true" className="yumi-worker-week__person-dot" />
                          {group.worker.name}
                        </strong>
                        <span className="yumi-worker-week__person-count">
                          {group.tasks.length} 条
                        </span>
                      </div>
                      {group.tasks.map((task) => {
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
                            <span className="yumi-worker-week__task-head">
                              <span className="yumi-worker-week__task-product">
                                {task.productName}
                              </span>
                              <YumiStatusTag
                                tone={task.status === 'pending_inspection' ? 'warning' : 'info'}
                              >
                                {taskStatusLabel(task.status)}
                              </YumiStatusTag>
                            </span>
                            <span className="yumi-worker-week__task-meta">
                              {dispatchStageLabels[task.stage]} · {task.plannedQuantity} 件
                            </span>
                          </YumiButton>
                        )
                      })}
                    </div>
                  ))}
                  <YumiButton
                    aria-label={`为${date}派工`}
                    className={
                      groups.length === 0
                        ? 'yumi-worker-week__empty'
                        : 'yumi-worker-week__add'
                    }
                    onClick={() => props.onOpenAssignment({ assignedOn: date })}
                    variant="ghost"
                  >
                    ＋ 派工
                  </YumiButton>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </YumiSection>
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
        processType: stage,
        note: note || undefined,
        tasks: [
          {
            orderItemId,
            sourceType: 'normal_production',
            plannedQuantity: parsedQuantity,
            plannedMinutes: null,
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
        {error ? <YumiFormMessage tone="error">{error}</YumiFormMessage> : null}
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
              <YumiFormMessage>待派上限：{schedule.unassignedQuantity} 件</YumiFormMessage>
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
          ) : null}
        </div>
        <YumiFormMessage tone="hint">
          最终工作时长与完成数量由负责人次日核算，排班只安排人员、日期与工序。
        </YumiFormMessage>
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
