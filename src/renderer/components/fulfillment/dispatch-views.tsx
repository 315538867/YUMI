import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type {
  V2MakingTaskInput,
  V2ProcessTask,
  V2ProcessTaskSource,
  V2ProcessType,
  V2Worker,
  V2WorkAssignment,
  V2WorkAssignmentCreateInput
} from '@shared/contracts/index'
import { getErrorMessage, today } from '../../composables/v2-utils'
import {
  addBusinessDays,
  buildWorkerWeekCards,
  getFulfillmentQueueStageSchedule,
  type ActionableFulfillmentQueueStage,
  type FulfillmentQueueItem,
  type WorkerWeekCard
} from '../../composables/use-fulfillment'
import {
  YumiButton,
  YumiDataTable,
  YumiDatePicker,
  YumiDetailList,
  YumiDialog,
  YumiEmptyState,
  YumiField,
  YumiFieldLabel,
  YumiFormMessage,
  YumiNumberField,
  YumiSection,
  YumiSelect,
  YumiSheet,
  YumiStatusTag,
  YumiTextArea,
  useYumiNotificationMessage
} from '../ui'

const processLabels: Record<V2ProcessType, string> = {
  making: '制作',
  fluffing_bagging: '捏毛装袋',
  edge_sewing: '缝边',
  packing: '打包发货'
}

const processTypes: V2ProcessType[] = ['making', 'fluffing_bagging', 'edge_sewing', 'packing']

const sourceLabels: Record<V2ProcessTaskSource, string> = {
  normal_production: '正常生产',
  rework: '返工',
  after_sales_replacement: '售后补发',
  manager_arrangement: '负责人安排'
}

const sourceTypes = Object.keys(sourceLabels) as V2ProcessTaskSource[]

const assignmentStatusLabels: Record<V2WorkAssignment['status'], string> = {
  draft: '待确认',
  scheduled: '已安排',
  completed: '已完成',
  cancelled: '已取消',
  absent: '缺勤'
}

export interface DispatchPrefill {
  assignedOn?: string
  workerId?: string
}

/** 周历卡片点击目标：待核算进入核算，已核算进入只读记录。 */
export interface WeekScheduleReviewTarget {
  card: WorkerWeekCard
  workerName: string
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
  return addBusinessDays(date, count)
}

function reviewStatusLabel(reviewed: boolean): string {
  return reviewed ? '已核算' : '待核算'
}

const workerToneCount = 12

function cardLabel(card: WorkerWeekCard, itemLabels: ReadonlyMap<string, string>): string {
  const stage = processLabels[card.assignment.processType]
  if (card.kind === 'timed') return `${stage} ${reviewStatusLabel(card.reviewed)}`
  const productName = itemLabels.get(card.task?.orderItemId ?? '') ?? '订单商品'
  return `${productName} ${stage} 计划 ${card.task?.plannedQuantity ?? 0} 件 ${reviewStatusLabel(card.reviewed)}`
}

/**
 * 人员周历：按周一至周日分列，按人员成框聚合当天安排，
 * 制作卡展示订单商品、工序、计划数量与核算状态；计时卡只展示“工序 · 待核算/已核算”。
 */
export function WorkerWeekSchedule(props: {
  assignments: V2WorkAssignment[]
  itemLabels: ReadonlyMap<string, string>
  workers: V2Worker[]
  onOpenAssignment(prefill: DispatchPrefill): void
  onOpenAssignmentDetail(assignment: V2WorkAssignment, workerName: string): void
  onOpenReview(target: WeekScheduleReviewTarget): void
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek())
  const dates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart]
  )
  const cards = useMemo(
    () => buildWorkerWeekCards(props.assignments, weekStart),
    [props.assignments, weekStart]
  )
  const workerNames = useMemo(
    () => new Map(props.workers.map((worker) => [worker.id, worker.name])),
    [props.workers]
  )
  const orderedWorkers = useMemo(() => {
    const sorted = [...props.workers].sort((left, right) =>
      (left.createdAt ?? '').localeCompare(right.createdAt ?? '')
    )
    const knownIds = new Set(sorted.map((worker) => worker.id))
    const extras = cards.reduce<V2Worker[]>(
      (rows, card) =>
        knownIds.has(card.workerId) || rows.some((worker) => worker.id === card.workerId)
          ? rows
          : [...rows, { id: card.workerId, name: '已删除人员', enabled: false } as V2Worker],
      []
    )
    return [...sorted, ...extras]
  }, [props.workers, cards])
  const toneByWorker = useMemo(() => {
    const tones = new Map<string, number>()
    orderedWorkers.forEach((worker, index) => tones.set(worker.id, (index % workerToneCount) + 1))
    return tones
  }, [orderedWorkers])
  const scheduledWorkerIds = useMemo(() => new Set(cards.map((card) => card.workerId)), [cards])
  const hasSchedulableWorkers = orderedWorkers.some(
    (worker) => worker.enabled || scheduledWorkerIds.has(worker.id)
  )

  const openCard = (card: WorkerWeekCard) => {
    const workerName = workerNames.get(card.workerId) ?? '已删除人员'
    if (card.assignment.assignedOn > today()) {
      props.onOpenAssignmentDetail(card.assignment, workerName)
      return
    }
    props.onOpenReview({ card, workerName })
  }

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
      description={`${weekStart} 至 ${dates[6]} · 按人员聚合当天排班；制作显示商品与数量，计时只显示工序与核算状态`}
      title="人员周历"
    >
      {!hasSchedulableWorkers ? (
        <YumiEmptyState
          description="先到「工资」页的「人员与时薪」新增兼职人员并设置生效时薪；这里会按日期分列展示每位人员的排班，并提供每天列底部的「＋ 派工」入口。"
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
              const dayCards = cards.filter((card) => card.assignedOn === date)
              const groups = orderedWorkers
                .map((worker) => ({
                  worker,
                  cards: dayCards.filter((card) => card.workerId === worker.id)
                }))
                .filter((group) => group.cards.length > 0)
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
                          {group.cards.length} 条
                        </span>
                      </div>
                      {group.cards.map((card) => (
                        <YumiButton
                          aria-label={cardLabel(card, props.itemLabels)}
                          className={
                            card.kind === 'timed'
                              ? 'yumi-worker-week__task yumi-worker-week__task--timed'
                              : 'yumi-worker-week__task'
                          }
                          key={card.key}
                          onClick={() => openCard(card)}
                          variant="ghost"
                        >
                          {card.kind === 'making' ? (
                            <>
                              <span className="yumi-worker-week__task-head">
                                <span className="yumi-worker-week__task-product">
                                  {props.itemLabels.get(card.task?.orderItemId ?? '') ?? '订单商品'}
                                </span>
                                <YumiStatusTag tone={card.reviewed ? 'success' : 'warning'}>
                                  {reviewStatusLabel(card.reviewed)}
                                </YumiStatusTag>
                              </span>
                              <span className="yumi-worker-week__task-meta">
                                制作 · 计划 {card.task?.plannedQuantity ?? 0} 件
                              </span>
                            </>
                          ) : (
                            <span className="yumi-worker-week__task-meta">
                              {processLabels[card.assignment.processType]} ·{' '}
                              {reviewStatusLabel(card.reviewed)}
                            </span>
                          )}
                        </YumiButton>
                      ))}
                    </div>
                  ))}
                  <YumiButton
                    aria-label={`为${date}派工`}
                    className={
                      groups.length === 0 ? 'yumi-worker-week__empty' : 'yumi-worker-week__add'
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

function assignmentModeLabel(assignment: V2WorkAssignment): string {
  if (assignment.scheduleMode === 'timed_shift') return '计时班次'
  if (assignment.scheduleMode === 'legacy_task') return '历史安排'
  return '制作排班'
}

function taskStatusLabel(status: V2ProcessTask['status']): string {
  if (status === 'pending_inspection') return '待核算'
  if (status === 'confirmed') return '已核算'
  if (status === 'cancelled') return '已取消'
  return '待完成'
}

/** 未来日期排班的只读详情：只展示安排字段与核算状态，不提供新建或核算表单。 */
export function WorkAssignmentDetailDialog(props: {
  assignment: V2WorkAssignment | null
  itemLabels: ReadonlyMap<string, string>
  onClose(): void
  workerName: string
}) {
  const assignment = props.assignment
  if (!assignment) return null
  const reviewed = assignment.timedReview !== null
  return (
    <YumiDialog
      footer={
        <YumiButton onClick={props.onClose} variant="secondary">
          关闭
        </YumiButton>
      }
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      open
      title="工作安排详情"
    >
      <YumiDetailList
        ariaLabel="工作安排详情"
        items={[
          { label: '兼职人员', value: props.workerName },
          { label: '安排日期', value: assignment.assignedOn },
          { label: '工序', value: processLabels[assignment.processType] },
          { label: '排班模式', value: assignmentModeLabel(assignment) },
          {
            label: '安排状态',
            value: assignmentStatusLabels[assignment.status] ?? assignment.status
          },
          {
            label: '核算状态',
            value:
              assignment.processType === 'making'
                ? assignment.tasks.some((task) => task.reviewSummary)
                  ? '部分或全部已核算'
                  : '待核算'
                : reviewStatusLabel(reviewed)
          },
          { label: '备注', value: assignment.note ?? '—' }
        ]}
      />
      {assignment.processType === 'making' && assignment.tasks.length > 0 ? (
        <YumiDataTable
          ariaLabel="安排中的制作任务"
          columns={[
            {
              key: 'product',
              label: '订单商品',
              render: (task) => props.itemLabels.get(task.orderItemId ?? '') ?? '订单商品'
            },
            {
              key: 'quantity',
              label: '计划数量',
              align: 'right',
              render: (task) => `${task.plannedQuantity ?? 0} 件`
            },
            { key: 'status', label: '任务状态', render: (task) => taskStatusLabel(task.status) },
            {
              key: 'review',
              label: '核算状态',
              render: (task) => (task.reviewSummary ? '已核算' : '待核算')
            }
          ]}
          getRowKey={(task) => task.id}
          rows={assignment.tasks}
        />
      ) : null}
      {assignment.processType !== 'making' && assignment.timedReview ? (
        <YumiDetailList
          ariaLabel="计时核算摘要"
          items={[
            { label: '核算日期', value: assignment.timedReview.reviewedOn },
            { label: '核算分钟', value: `${assignment.timedReview.approvedMinutes} 分钟` },
            {
              label: '锁定',
              value: assignment.timedReview.lock.message ?? '未锁定'
            }
          ]}
        />
      ) : null}
    </YumiDialog>
  )
}

/**
 * 派工抽屉：按工序类型切换表单。
 * 制作排班要求订单商品、数量、来源并执行超排校验；计时班次只登记人员、日期、工序与备注。
 */
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
  const [processType, setProcessType] = useState<V2ProcessType>('making')
  const [orderItemId, setOrderItemId] = useState('')
  const [sourceType, setSourceType] = useState<V2ProcessTaskSource>('normal_production')
  const [quantity, setQuantity] = useState('')
  const [extraMinutes, setExtraMinutes] = useState('0')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  useYumiNotificationMessage(error)

  useEffect(() => {
    if (!props.open) return
    setWorkerId(props.prefill?.workerId ?? '')
    setAssignedOn(props.prefill?.assignedOn ?? today())
    setProcessType('making')
    setOrderItemId('')
    setSourceType('normal_production')
    setQuantity('')
    setExtraMinutes('0')
    setNote('')
    setError(null)
  }, [props.open, props.prefill])

  const selectedItem = props.items.find((item) => item.orderItemId === orderItemId)
  const schedule = selectedItem
    ? getFulfillmentQueueStageSchedule(selectedItem, processType as ActionableFulfillmentQueueStage)
    : null
  const workerOptions = props.workers
    .filter((worker) => worker.enabled)
    .map((worker) => ({ value: worker.id, label: worker.name }))
  const itemOptions = props.items.map((item) => ({
    value: item.orderItemId,
    label: `${item.orderCode} · ${item.productName}`
  }))
  const isMaking = processType === 'making'
  const parsedQuantity = Number(quantity)
  const parsedExtraMinutes = Number(extraMinutes || '0')
  const workerError = submitAttempted && !workerId ? '请选择人员' : undefined
  const assignedOnError = submitAttempted && !assignedOn ? '请选择日期' : undefined
  const itemError = submitAttempted && isMaking && !orderItemId ? '请选择订单商品' : undefined
  const quantityError =
    submitAttempted && isMaking && (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0)
      ? '请输入大于 0 的整数'
      : submitAttempted && isMaking && (!schedule || parsedQuantity > schedule.unassignedQuantity)
        ? `计划数量不能超过当前待派上限 ${schedule?.unassignedQuantity ?? 0} 件。`
        : undefined
  const extraMinutesError =
    submitAttempted && isMaking && (!Number.isInteger(parsedExtraMinutes) || parsedExtraMinutes < 0)
      ? '额外预留分钟必须是非负整数。'
      : undefined

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitAttempted(true)
    if (!workerId || !assignedOn) return
    if (!isMaking) {
      setSubmitting(true)
      setError(null)
      try {
        await props.onSubmit({
          scheduleMode: 'timed_shift',
          workerId,
          assignedOn,
          processType,
          note: note || undefined
        })
        props.onOpenChange(false)
      } catch (cause) {
        setError(getErrorMessage(cause))
      } finally {
        setSubmitting(false)
      }
      return
    }

    if (!orderItemId || !selectedItem || !Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      return
    }
    if (!schedule || parsedQuantity > schedule.unassignedQuantity) {
      return
    }
    if (!Number.isInteger(parsedExtraMinutes) || parsedExtraMinutes < 0) {
      return
    }
    const task: V2MakingTaskInput = {
      orderItemId,
      sourceType,
      plannedQuantity: parsedQuantity,
      extraMinutes: parsedExtraMinutes,
      note: note || undefined
    }
    setSubmitting(true)
    setError(null)
    try {
      await props.onSubmit({
        scheduleMode: 'making_task',
        workerId,
        assignedOn,
        processType: 'making',
        note: note || undefined,
        tasks: [task]
      })
      props.onOpenChange(false)
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <YumiSheet
      description="保存后立即刷新人员周历；实际时间与完成数量统一在排班页的「待核算」页签登记。"
      onOpenChange={props.onOpenChange}
      open={props.open}
      title={`派工：${processLabels[processType]}`}
    >
      <form className="yumi-form-panel yumi-sheet-form" onSubmit={handleSubmit}>
        <div className="yumi-form-grid yumi-form-grid--two">
          <YumiField error={workerError}>
            <YumiFieldLabel required>兼职人员</YumiFieldLabel>
            <YumiSelect
              aria-label="派工人员"
              onValueChange={setWorkerId}
              options={workerOptions}
              placeholder="选择人员"
              value={workerId}
            />
          </YumiField>
          <YumiField error={assignedOnError}>
            <YumiFieldLabel required>日期</YumiFieldLabel>
            <YumiDatePicker
              aria-label="派工日期"
              onValueChange={setAssignedOn}
              value={assignedOn}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel required>工序</YumiFieldLabel>
            <YumiSelect
              aria-label="派工工序"
              onValueChange={(value) => setProcessType(value as V2ProcessType)}
              options={processTypes.map((value) => ({ value, label: processLabels[value] }))}
              value={processType}
            />
          </YumiField>
          {isMaking ? (
            <YumiField error={itemError}>
              <YumiFieldLabel required>订单商品</YumiFieldLabel>
              <YumiSelect
                aria-label="派工订单商品"
                onValueChange={setOrderItemId}
                options={itemOptions}
                placeholder="选择订单商品"
                value={orderItemId}
              />
            </YumiField>
          ) : null}
          {isMaking ? (
            <YumiField error={quantityError}>
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
          ) : null}
          {isMaking ? (
            <YumiField>
              <YumiFieldLabel required>任务来源</YumiFieldLabel>
              <YumiSelect
                aria-label="任务来源"
                onValueChange={(value) => setSourceType(value as V2ProcessTaskSource)}
                options={sourceTypes.map((value) => ({ value, label: sourceLabels[value] }))}
                value={sourceType}
              />
            </YumiField>
          ) : null}
          {isMaking ? (
            <YumiField error={extraMinutesError}>
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
          {isMaking
            ? '计划数量不得超过当前待派上限；实际工作时长与合格数量由负责人在待核算中一次登记。'
            : '计时班次只安排人员、日期与工序；实际时间范围与跨订单商品完成数量在待核算中登记。'}
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
