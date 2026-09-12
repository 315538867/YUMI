import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { V2NavigationTarget } from '@shared/contracts/index'
import { getErrorMessage, today } from '../../composables/v2-utils'
import {
  useFulfillment,
  type FulfillmentQueueItem,
  type FulfillmentScheduledTask
} from '../../composables/use-fulfillment'
import { WorkAssignmentsPage } from '../work-assignments'
import {
  OrderDispatchBoard,
  WorkerWeekSchedule,
  WorkAssignmentSheet,
  type DispatchPrefill
} from '../../components/fulfillment/dispatch-views'
import {
  YumiButton,
  YumiDatePicker,
  YumiEmptyState,
  YumiField,
  YumiFieldLabel,
  YumiFormSection,
  YumiMetricStrip,
  YumiNumberField,
  YumiPageHeader,
  YumiPrimaryTabs,
  YumiRecordSummary,
  YumiSegmentedTabs,
  YumiSection,
  YumiSelect,
  YumiTextArea,
  YumiTextField,
  useYumiNotificationMessage
} from '../../components/ui'

type FulfillmentWorkspaceMode = 'queue' | 'processing' | 'opening_wip'
type FulfillmentOverview = 'orders' | 'workers'
type ProcessingView = 'assignments' | 'adjustment'

interface FulfillmentPageProps {
  navigationTarget?: Extract<V2NavigationTarget, { view: 'fulfillment' }> | null
  onNavigate?(target: V2NavigationTarget): void
}

export function FulfillmentPage({ navigationTarget = null, onNavigate }: FulfillmentPageProps) {
  const {
    queueItems,
    workers,
    selectedOrder,
    items,
    loading,
    loadError,
    reload,
    selectOrder,
    createWorkAssignment,
    recordOpeningWip,
    reassignProcessTask
  } = useFulfillment()
  const [workspaceMode, setWorkspaceMode] = useState<FulfillmentWorkspaceMode>('queue')
  const [overview, setOverview] = useState<FulfillmentOverview>('orders')
  const [assignmentPrefill, setAssignmentPrefill] = useState<DispatchPrefill | null>(null)
  const [focusedProcessTaskId, setFocusedProcessTaskId] = useState('')
  const [processingView, setProcessingView] = useState<ProcessingView>('assignments')
  const [focusedOrderItemId, setFocusedOrderItemId] = useState('')
  const [openingOrderItemId, setOpeningOrderItemId] = useState('')
  const [openingSearch, setOpeningSearch] = useState('')
  const [openingStage, setOpeningStage] = useState<
    'fluffing_bagging' | 'packing' | 'ready_to_ship'
  >('ready_to_ship')
  const [openingQuantity, setOpeningQuantity] = useState('')
  const [openingOccurredOn, setOpeningOccurredOn] = useState(today())
  const [openingNote, setOpeningNote] = useState('')
  const [reassignmentTaskId, setReassignmentTaskId] = useState('')
  const [reassignmentWorkerId, setReassignmentWorkerId] = useState('')
  const [reassignmentEffectiveOn, setReassignmentEffectiveOn] = useState(today())
  const [reassignmentReason, setReassignmentReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  useYumiNotificationMessage(loadError)
  useYumiNotificationMessage(error)
  const [submitting, setSubmitting] = useState<string | null>(null)

  const navigationOrderId =
    navigationTarget?.orderId ??
    queueItems.find((item) => item.orderItemId === navigationTarget?.orderItemId)?.orderId

  useEffect(() => {
    if (!navigationTarget) return
    if (navigationTarget.focus === 'shipment' && navigationOrderId) {
      onNavigate?.({ view: 'orders', orderId: navigationOrderId, orderView: 'fulfillment' })
      return
    }
    if (!navigationOrderId) {
      setWorkspaceMode('queue')
      return
    }
    setFocusedOrderItemId(navigationTarget.orderItemId ?? '')
    setFocusedProcessTaskId(navigationTarget.processTaskId ?? '')
    setProcessingView('assignments')
    setWorkspaceMode('processing')
    void selectOrder(navigationOrderId)
  }, [navigationOrderId, navigationTarget, onNavigate, selectOrder])

  const focusedItemId = useMemo(() => {
    if (!selectedOrder) return ''
    return selectedOrder.items.some((item) => item.id === focusedOrderItemId)
      ? focusedOrderItemId
      : (selectedOrder.items[0]?.id ?? '')
  }, [focusedOrderItemId, selectedOrder])

  useEffect(() => {
    if (!focusedItemId) return
    setFocusedOrderItemId((current) => (current === focusedItemId ? current : focusedItemId))
  }, [focusedItemId])

  const focusedOrderItem = selectedOrder?.items.find((item) => item.id === focusedItemId) ?? null
  const focusedFulfillment = items.find((item) => item.orderItemId === focusedItemId) ?? null
  const focusedOrder = useMemo(() => {
    if (!selectedOrder || !focusedOrderItem) return selectedOrder
    return { ...selectedOrder, items: [focusedOrderItem] }
  }, [focusedOrderItem, selectedOrder])
  const scheduleTotals = useMemo(
    () =>
      queueItems.reduce(
        (totals, item) => ({
          confirmed: totals.confirmed + item.confirmedQuantity,
          making: totals.making + item.stages.making,
          packing: totals.packing + item.stages.packing,
          readyToShip: totals.readyToShip + item.stages.readyToShip,
          shipped: totals.shipped + item.stages.shipped
        }),
        { confirmed: 0, making: 0, packing: 0, readyToShip: 0, shipped: 0 }
      ),
    [queueItems]
  )
  const openingOrderItem =
    queueItems.find((item) => item.orderItemId === openingOrderItemId) ?? null
  const openingCandidates = useMemo(() => {
    const keyword = openingSearch.trim().toLowerCase()
    if (!keyword) return queueItems
    return queueItems.filter((item) =>
      [item.orderCode, item.customerName, item.productName].some((value) =>
        value.toLowerCase().includes(keyword)
      )
    )
  }, [openingSearch, queueItems])

  const openQueueItem = (item: FulfillmentQueueItem, stage: FulfillmentScheduledTask['stage']) => {
    if (stage === 'ready_to_ship') {
      onNavigate?.({ view: 'orders', orderId: item.orderId, orderView: 'fulfillment' })
      return
    }
    setError(null)
    setFocusedOrderItemId(item.orderItemId)
    setFocusedProcessTaskId('')
    setProcessingView('assignments')
    setWorkspaceMode('processing')
    void selectOrder(item.orderId)
  }

  const returnToQueue = () => {
    setError(null)
    setWorkspaceMode('queue')
    setFocusedOrderItemId('')
    setFocusedProcessTaskId('')
    setOpeningOrderItemId('')
    setOpeningSearch('')
    void selectOrder('')
  }

  const openOpeningWip = () => {
    setError(null)
    setWorkspaceMode('opening_wip')
    setOpeningOrderItemId('')
    setOpeningSearch('')
  }

  const openTask = (item: FulfillmentQueueItem, task: FulfillmentScheduledTask) => {
    setError(null)
    setFocusedOrderItemId(item.orderItemId)
    setFocusedProcessTaskId(task.taskId)
    setProcessingView('assignments')
    setWorkspaceMode('processing')
    void selectOrder(item.orderId)
  }

  const openAssignment = (prefill: DispatchPrefill) => {
    setError(null)
    setAssignmentPrefill(prefill)
  }

  const handleOpeningWip = async (event: FormEvent) => {
    event.preventDefault()
    if (!openingOrderItem) {
      setError('请先选择需要承接期初在制品的订单商品。')
      return
    }
    setError(null)
    setSubmitting('opening')
    try {
      await recordOpeningWip({
        orderItemId: openingOrderItem.orderItemId,
        targetStage: openingStage,
        quantity: Number(openingQuantity),
        occurredOn: openingOccurredOn,
        note: openingNote || undefined
      })
      setOpeningQuantity('')
      setOpeningNote('')
      returnToQueue()
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(null)
    }
  }

  const reassignableTasks = useMemo(
    () =>
      queueItems
        .flatMap((item) =>
          Object.values(item.stageSchedules).flatMap((schedule) =>
            schedule.tasks
              .filter((task) => task.status === 'pending')
              .map((task) => ({ ...task, item }))
          )
        )
        .filter((entry) => entry.item.orderItemId === focusedItemId),
    [focusedItemId, queueItems]
  )
  const focusedReassignmentTask =
    reassignableTasks.find((entry) => entry.taskId === reassignmentTaskId) ??
    reassignableTasks.find((entry) => entry.taskId === focusedProcessTaskId) ??
    reassignableTasks[0] ??
    null
  const reassignmentWorkers = workers.filter(
    (worker) => worker.enabled && worker.id !== focusedReassignmentTask?.workerId
  )

  const handleReassignment = async (event: FormEvent) => {
    event.preventDefault()
    if (!focusedReassignmentTask) {
      setError('当前订单商品没有可调整负责人的待处理任务。')
      return
    }
    setError(null)
    setSubmitting('reassignment')
    try {
      await reassignProcessTask(focusedReassignmentTask.taskId, {
        workerId: reassignmentWorkerId,
        effectiveOn: reassignmentEffectiveOn,
        reason: reassignmentReason
      })
      setReassignmentTaskId('')
      setReassignmentWorkerId('')
      setReassignmentReason('')
      await selectOrder(focusedReassignmentTask.item.orderId)
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(null)
    }
  }

  if (workspaceMode === 'opening_wip') {
    return (
      <section className="yumi-page fulfillment-workspace">
        <YumiPageHeader
          actions={{
            ariaLabel: '期初在制品页面动作',
            secondaryAction: {
              label: '返回排班队列',
              onClick: returnToQueue,
              variant: 'ghost'
            }
          }}
          description="系统中途启用时，将已经开始生产、但尚未走完流程的订单商品一次性登记到实际阶段。"
          title="补录期初在制品"
        />
        <YumiSection
          ariaLabel="选择对应订单商品"
          description="先搜索并选择需要承接这批在制品的订单商品；不是从当前订单详情继承上下文。"
          title="1. 选择对应订单商品"
        >
          <YumiField>
            <YumiFieldLabel>搜索订单号、客户或商品</YumiFieldLabel>
            <YumiTextField
              aria-label="搜索订单号、客户或商品"
              onChange={(event) => setOpeningSearch(event.target.value)}
              placeholder="搜索订单号、客户或商品"
              value={openingSearch}
            />
          </YumiField>
          <div className="yumi-opening-wip__candidates" role="list">
            {openingCandidates.map((item) => {
              const selected = item.orderItemId === openingOrderItemId
              return (
                <article
                  className="yumi-opening-wip__candidate"
                  key={item.orderItemId}
                  role="listitem"
                >
                  <div>
                    <strong>{item.orderCode}</strong>
                    <span>{item.customerName}</span>
                  </div>
                  <div>
                    <strong>{item.productName}</strong>
                    <span>确认 {item.confirmedQuantity} 件</span>
                  </div>
                  <YumiButton
                    aria-pressed={selected}
                    onClick={() => setOpeningOrderItemId(item.orderItemId)}
                    variant={selected ? 'primary' : 'secondary'}
                  >
                    {selected ? '已选择' : `选择：${item.productName}`}
                  </YumiButton>
                </article>
              )
            })}
          </div>
          <p className="yumi-section__hint">
            订单商品仅用于归属和后续交期、发货闭环；入口本身是工作室级的初始化工具。
          </p>
        </YumiSection>
        <form className="yumi-form-panel" onSubmit={handleOpeningWip}>
          <YumiFormSection
            description="只登记期初状态；正常派工、质检与发货仍通过后续排班任务和订单详情处理。"
            title="2. 登记当前实际阶段"
          >
            <div className="yumi-form-grid yumi-form-grid--two">
              <YumiField>
                <YumiFieldLabel>已选订单商品</YumiFieldLabel>
                <p className="yumi-field__static">
                  {openingOrderItem
                    ? `${openingOrderItem.customerName} / ${openingOrderItem.productName}`
                    : '请先选择订单商品'}
                </p>
              </YumiField>
              <YumiField>
                <YumiFieldLabel required>目标阶段</YumiFieldLabel>
                <YumiSelect
                  aria-label="期初在制品目标阶段"
                  onValueChange={(value) => setOpeningStage(value as typeof openingStage)}
                  options={[
                    { value: 'fluffing_bagging', label: '捏毛装袋' },
                    { value: 'packing', label: '待打包' },
                    { value: 'ready_to_ship', label: '待发货' }
                  ]}
                  value={openingStage}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel required>期初数量</YumiFieldLabel>
                <YumiNumberField
                  aria-label="期初数量"
                  min="1"
                  onChange={(event) => setOpeningQuantity(event.target.value)}
                  required
                  value={openingQuantity}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel required>登记日期</YumiFieldLabel>
                <YumiDatePicker
                  aria-label="期初在制品登记日期"
                  onValueChange={setOpeningOccurredOn}
                  value={openingOccurredOn}
                />
              </YumiField>
            </div>
            <YumiField>
              <YumiFieldLabel>备注</YumiFieldLabel>
              <YumiTextArea
                onChange={(event) => setOpeningNote(event.target.value)}
                placeholder="例如：系统启用前已完成制作，现处于捏毛装袋阶段"
                value={openingNote}
              />
            </YumiField>
            <p className="yumi-section__hint">
              登记成功后，数量会回到该订单商品的排班队列；不会被当作新的订单商品或独立库存。
            </p>
            <div className="yumi-form-actions">
              <YumiButton loading={submitting === 'opening'} type="submit" variant="primary">
                {submitting === 'opening' ? '登记中…' : '登记期初在制品'}
              </YumiButton>
            </div>
          </YumiFormSection>
        </form>
      </section>
    )
  }

  if (workspaceMode === 'processing' && selectedOrder && focusedOrderItem) {
    return (
      <section className="yumi-page fulfillment-workspace">
        <YumiPageHeader
          actions={{
            ariaLabel: '排班处理页面动作',
            secondaryAction: {
              label: '返回排班队列',
              onClick: returnToQueue,
              variant: 'ghost'
            }
          }}
          description={`${selectedOrder.code} · ${focusedOrderItem.productSnapshot.name} · ${
            focusedReassignmentTask?.stage === 'making'
              ? '制作'
              : focusedReassignmentTask?.stage === 'fluffing_bagging'
                ? '捏毛装袋'
                : focusedReassignmentTask?.stage === 'packing'
                  ? '打包'
                  : focusedReassignmentTask?.stage === 'ready_to_ship'
                    ? '发货'
                    : '订单商品'
          } · ${focusedReassignmentTask?.plannedQuantity ?? focusedOrderItem.quantity} 件`}
          title="任务处理"
        />
        <YumiRecordSummary
          ariaLabel="当前产品排班摘要"
          description={`确认数量 ${focusedOrderItem.quantity} · 仅处理此产品的排班事项`}
          title="当前产品"
        >
          {focusedFulfillment ? (
            <YumiMetricStrip
              ariaLabel="当前产品排班进度"
              items={[
                { label: '制作', value: focusedFulfillment.stages.making },
                { label: '捏毛装袋', value: focusedFulfillment.stages.fluffingBagging },
                { label: '打包', value: focusedFulfillment.stages.packing },
                { label: '待发货', tone: 'brand', value: focusedFulfillment.stages.readyToShip }
              ]}
            />
          ) : null}
        </YumiRecordSummary>
        <YumiPrimaryTabs
          ariaLabel="排班处理操作"
          items={[
            { id: 'assignments', label: '工作安排与质检' },
            { id: 'adjustment', label: '负责人调整' }
          ]}
          onValueChange={setProcessingView}
          value={processingView}
        />
        {processingView === 'assignments' && (
          <WorkAssignmentsPage
            focusedTaskId={focusedProcessTaskId || navigationTarget?.processTaskId}
            order={focusedOrder}
            onChanged={() => {
              void selectOrder(selectedOrder.id)
              void reload(selectedOrder.id)
            }}
          />
        )}
        {processingView === 'adjustment' && (
          <form className="yumi-form-panel" onSubmit={handleReassignment}>
            <YumiFormSection
              title="当前安排"
              description="调整只影响未结算的后续处理；历史处理记录继续保留。"
            >
              {focusedReassignmentTask ? (
                <div className="yumi-form-grid yumi-form-grid--two">
                  <YumiField>
                    <YumiFieldLabel>原负责人</YumiFieldLabel>
                    <p className="yumi-field__static">{focusedReassignmentTask.workerName}</p>
                  </YumiField>
                  <YumiField>
                    <YumiFieldLabel>待处理数量</YumiFieldLabel>
                    <p className="yumi-field__static">
                      {focusedReassignmentTask.plannedQuantity} 件
                    </p>
                  </YumiField>
                  <YumiField>
                    <YumiFieldLabel>已确认完成</YumiFieldLabel>
                    <p className="yumi-field__static">0 件</p>
                  </YumiField>
                  <YumiField>
                    <YumiFieldLabel>当前状态</YumiFieldLabel>
                    <p className="yumi-field__static">待处理</p>
                  </YumiField>
                </div>
              ) : (
                <YumiEmptyState
                  description="请从订单队列或人员周历进入一项尚未提交完成结果的任务。"
                  title="没有可调整的待处理任务"
                />
              )}
            </YumiFormSection>
            {focusedReassignmentTask ? (
              <YumiFormSection
                title="调整负责人"
                description="选择新的负责人并写明原因；系统会校验任务状态并保留原安排。"
              >
                <div className="yumi-form-grid yumi-form-grid--two">
                  <YumiField>
                    <YumiFieldLabel required>待调整任务</YumiFieldLabel>
                    <YumiSelect
                      aria-label="待调整任务"
                      onValueChange={setReassignmentTaskId}
                      options={reassignableTasks.map((entry) => ({
                        value: entry.taskId,
                        label: `${entry.item.productName} · ${entry.workerName} · ${entry.plannedQuantity} 件`
                      }))}
                      value={focusedReassignmentTask.taskId}
                    />
                  </YumiField>
                  <YumiField>
                    <YumiFieldLabel required>新负责人</YumiFieldLabel>
                    <YumiSelect
                      aria-label="新负责人"
                      onValueChange={setReassignmentWorkerId}
                      options={reassignmentWorkers.map((worker) => ({
                        value: worker.id,
                        label: worker.name
                      }))}
                      placeholder="选择负责人"
                      value={reassignmentWorkerId}
                    />
                  </YumiField>
                  <YumiField>
                    <YumiFieldLabel required>生效日期</YumiFieldLabel>
                    <YumiDatePicker
                      aria-label="负责人调整生效日期"
                      onValueChange={setReassignmentEffectiveOn}
                      value={reassignmentEffectiveOn}
                    />
                  </YumiField>
                </div>
                <YumiField>
                  <YumiFieldLabel required>调整原因</YumiFieldLabel>
                  <YumiTextArea
                    aria-label="调整原因"
                    onChange={(event) => setReassignmentReason(event.target.value)}
                    required
                    value={reassignmentReason}
                  />
                </YumiField>
                <div className="yumi-form-actions">
                  <YumiButton
                    loading={submitting === 'reassignment'}
                    type="submit"
                    variant="primary"
                  >
                    {submitting === 'reassignment' ? '调整中…' : '确认调整'}
                  </YumiButton>
                </div>
              </YumiFormSection>
            ) : null}
          </form>
        )}
      </section>
    )
  }

  return (
    <section className="yumi-page fulfillment-workspace">
      <YumiPageHeader
        actions={{
          ariaLabel: '排班页面动作',
          visibleActions: [{ label: '导出排班', onClick: () => undefined }],
          primaryAction: { label: '补录期初在制品', onClick: openOpeningWip }
        }}
        description={
          overview === 'workers'
            ? '人员周视图与订单队列共用同一批任务；点击任务进入该任务的处理上下文。'
            : '按订单查看待派与已派，或按人员横向查看本周任务。'
        }
        title="排班"
      />
      <YumiMetricStrip
        ariaLabel="排班阶段总量"
        items={[
          { label: '订单总量', value: `${scheduleTotals.confirmed} 件` },
          { label: '制作', value: `${scheduleTotals.making} 件` },
          { label: '已发货', value: `${scheduleTotals.shipped} 件` },
          { label: '打包', value: `${scheduleTotals.packing} 件` },
          { label: '待发货', tone: 'brand', value: `${scheduleTotals.readyToShip} 件` }
        ]}
      />
      {loading ? (
        <YumiEmptyState
          description="排班资料正在读取，请稍候。"
          scenario="loading"
          title="加载排班待办中…"
        />
      ) : (
        <>
          <YumiSegmentedTabs
            ariaLabel="排班视角"
            items={[
              { id: 'orders', label: '订单视角' },
              { id: 'workers', label: '人员周历' }
            ]}
            onValueChange={setOverview}
            value={overview}
          />
          {overview === 'orders' ? (
            <>
              {queueItems.length === 0 ? (
                <YumiEmptyState
                  description="创建订单后，待处理产品会自动出现在这里。"
                  scenario="first-use"
                  title="暂无待处理排班产品"
                />
              ) : (
                <OrderDispatchBoard
                  items={queueItems}
                  onOpenAssignment={openAssignment}
                  onOpenItem={openQueueItem}
                  onOpenTask={openTask}
                  stage="all"
                />
              )}
            </>
          ) : (
            <WorkerWeekSchedule
              items={queueItems}
              onOpenAssignment={openAssignment}
              onOpenTask={openTask}
              workers={workers}
            />
          )}
        </>
      )}
      <WorkAssignmentSheet
        items={queueItems}
        onOpenChange={(open) => {
          if (!open) setAssignmentPrefill(null)
        }}
        onSubmit={createWorkAssignment}
        open={assignmentPrefill !== null}
        prefill={assignmentPrefill}
        workers={workers}
      />
    </section>
  )
}
