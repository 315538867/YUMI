import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { V2FulfillmentStage, V2NavigationTarget } from '@shared/contracts/index'
import { getErrorMessage, today } from '../../composables/v2-utils'
import {
  filterFulfillmentQueue,
  getFulfillmentQueueStageQuantity,
  useFulfillment,
  type FulfillmentQueueItem,
  type FulfillmentQueueStage
} from '../../composables/use-fulfillment'
import { WorkAssignmentsPage } from '../work-assignments'
import {
  YumiBusinessList,
  YumiBusinessListItem,
  YumiButton,
  YumiDatePicker,
  YumiEmptyState,
  YumiField,
  YumiFieldLabel,
  YumiNumberField,
  YumiPageHeader,
  YumiSelect,
  YumiStatusTag,
  YumiTextArea,
  YumiNotification
} from '../../components/ui'

type FulfillmentWorkspaceMode = 'queue' | 'processing'
type ProcessingView = 'assignments' | 'opening_wip' | 'adjustment'
type ActionableQueueStage = Exclude<FulfillmentQueueStage, 'all'>

const queueFilters: Array<{ id: FulfillmentQueueStage; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'making', label: '制作' },
  { id: 'fluffing_bagging', label: '捏毛装袋' },
  { id: 'packing', label: '打包' },
  { id: 'ready_to_ship', label: '待发货' }
]
const queueStageLabels: Record<ActionableQueueStage, string> = {
  making: '待制作',
  fluffing_bagging: '待捏毛装袋',
  packing: '待打包',
  ready_to_ship: '待发货'
}
const adjustmentStages: Array<{ value: V2FulfillmentStage; label: string }> = [
  { value: 'making', label: '制作中' }, { value: 'fluffing_bagging', label: '捏毛装袋' },
  { value: 'packing', label: '待打包' }, { value: 'ready_to_ship', label: '待发货' }, { value: 'shipped', label: '已发货' }
]

function getQueueFocus(item: FulfillmentQueueItem): { stage: ActionableQueueStage; tone: 'warning' | 'brand' | 'info' | 'neutral' } {
  if (item.stages.readyToShip > 0) return { stage: 'ready_to_ship', tone: 'warning' }
  if (item.stages.packing > 0) return { stage: 'packing', tone: 'brand' }
  if (item.stages.fluffingBagging > 0) return { stage: 'fluffing_bagging', tone: 'info' }
  return { stage: 'making', tone: 'neutral' }
}

function getStageTone(stage: ActionableQueueStage): 'warning' | 'brand' | 'info' | 'neutral' {
  if (stage === 'ready_to_ship') return 'warning'
  if (stage === 'packing') return 'brand'
  if (stage === 'fluffing_bagging') return 'info'
  return 'neutral'
}

interface FulfillmentPageProps {
  navigationTarget?: Extract<V2NavigationTarget, { view: 'fulfillment' }> | null
  onNavigate?(target: V2NavigationTarget): void
}

export function FulfillmentPage({ navigationTarget = null, onNavigate }: FulfillmentPageProps) {
  const { queueItems, selectedOrder, items, loading, loadError, selectOrder, recordOpeningWip, adjustStageQuantity } = useFulfillment()
  const [workspaceMode, setWorkspaceMode] = useState<FulfillmentWorkspaceMode>('queue')
  const [queueStage, setQueueStage] = useState<FulfillmentQueueStage>('all')
  const [processingView, setProcessingView] = useState<ProcessingView>('assignments')
  const [focusedOrderItemId, setFocusedOrderItemId] = useState('')
  const [openingStage, setOpeningStage] = useState<'fluffing_bagging' | 'packing' | 'ready_to_ship'>('ready_to_ship')
  const [openingQuantity, setOpeningQuantity] = useState('')
  const [openingOccurredOn, setOpeningOccurredOn] = useState(today())
  const [openingNote, setOpeningNote] = useState('')
  const [adjustmentSource, setAdjustmentSource] = useState('')
  const [adjustmentTarget, setAdjustmentTarget] = useState('')
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('')
  const [adjustmentOccurredOn, setAdjustmentOccurredOn] = useState(today())
  const [adjustmentNote, setAdjustmentNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)

  const navigationOrderId = navigationTarget?.orderId
    ?? queueItems.find((item) => item.orderItemId === navigationTarget?.orderItemId)?.orderId

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
    setProcessingView('assignments')
    setWorkspaceMode('processing')
    void selectOrder(navigationOrderId)
  }, [navigationOrderId, navigationTarget, onNavigate, selectOrder])

  const focusedItemId = useMemo(() => {
    if (!selectedOrder) return ''
    return selectedOrder.items.some((item) => item.id === focusedOrderItemId)
      ? focusedOrderItemId
      : selectedOrder.items[0]?.id ?? ''
  }, [focusedOrderItemId, selectedOrder])

  useEffect(() => {
    if (!focusedItemId) return
    setFocusedOrderItemId((current) => current === focusedItemId ? current : focusedItemId)
  }, [focusedItemId])

  const focusedOrderItem = selectedOrder?.items.find((item) => item.id === focusedItemId) ?? null
  const focusedFulfillment = items.find((item) => item.orderItemId === focusedItemId) ?? null
  const focusedOrder = useMemo(() => {
    if (!selectedOrder || !focusedOrderItem) return selectedOrder
    return { ...selectedOrder, items: [focusedOrderItem] }
  }, [focusedOrderItem, selectedOrder])
  const filteredQueueItems = useMemo(() => filterFulfillmentQueue(queueItems, queueStage), [queueItems, queueStage])
  const filterCounts = useMemo(() => new Map(queueFilters.map((filter) => [filter.id, filterFulfillmentQueue(queueItems, filter.id).length])), [queueItems])

  const openQueueItem = (item: FulfillmentQueueItem, stage: ActionableQueueStage) => {
    if (stage === 'ready_to_ship') {
      onNavigate?.({ view: 'orders', orderId: item.orderId, orderView: 'fulfillment' })
      return
    }
    setError(null)
    setFocusedOrderItemId(item.orderItemId)
    setProcessingView('assignments')
    setWorkspaceMode('processing')
    void selectOrder(item.orderId)
  }

  const returnToQueue = () => {
    setError(null)
    setWorkspaceMode('queue')
    setFocusedOrderItemId('')
    void selectOrder('')
  }

  const handleOpeningWip = async (event: FormEvent) => {
    event.preventDefault()
    if (!focusedItemId) return
    setError(null)
    setSubmitting('opening')
    try {
      await recordOpeningWip({ orderItemId: focusedItemId, targetStage: openingStage, quantity: Number(openingQuantity), occurredOn: openingOccurredOn, note: openingNote })
      setOpeningQuantity('')
      setOpeningNote('')
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(null)
    }
  }

  const handleAdjustment = async (event: FormEvent) => {
    event.preventDefault()
    if (!focusedItemId) return
    setError(null)
    setSubmitting('adjustment')
    try {
      await adjustStageQuantity({
        orderItemId: focusedItemId,
        quantity: Number(adjustmentQuantity),
        sourceStage: adjustmentSource as V2FulfillmentStage || null,
        targetStage: adjustmentTarget as V2FulfillmentStage || null,
        occurredOn: adjustmentOccurredOn,
        note: adjustmentNote
      })
      setAdjustmentQuantity('')
      setAdjustmentNote('')
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(null)
    }
  }

  if (workspaceMode === 'processing' && selectedOrder && focusedOrderItem) {
    return (
      <section className="yumi-page fulfillment-workspace">
        <YumiPageHeader
          actions={<YumiButton onClick={returnToQueue} variant="ghost">返回履约队列</YumiButton>}
          description={`${selectedOrder.code} · ${selectedOrder.customerSnapshot.name}`}
          title={`${focusedOrderItem.productSnapshot.name} · 履约处理`}
        />
        {loadError && <YumiNotification key={loadError} message={loadError} />}
        {error && <YumiNotification key={error} message={error} />}
        <div className="yumi-order-summary">
          <div><h2>当前产品</h2><p>确认数量 {focusedOrderItem.quantity} · 仅处理此产品的履约事项</p></div>
          {focusedFulfillment ? <div className="yumi-order-stat-grid"><span>制作<strong>{focusedFulfillment.stages.making}</strong></span><span>捏毛装袋<strong>{focusedFulfillment.stages.fluffingBagging}</strong></span><span>打包<strong>{focusedFulfillment.stages.packing}</strong></span><span>待发货<strong>{focusedFulfillment.stages.readyToShip}</strong></span></div> : null}
        </div>
        <nav aria-label="履约处理操作" className="yumi-page-tabs">
          <YumiButton aria-pressed={processingView === 'assignments'} onClick={() => setProcessingView('assignments')} variant={processingView === 'assignments' ? 'primary' : 'ghost'}>工作安排与质检</YumiButton>
          <YumiButton aria-pressed={processingView === 'opening_wip'} onClick={() => setProcessingView('opening_wip')} variant={processingView === 'opening_wip' ? 'primary' : 'ghost'}>补录期初在制品</YumiButton>
          <YumiButton aria-pressed={processingView === 'adjustment'} onClick={() => setProcessingView('adjustment')} variant={processingView === 'adjustment' ? 'primary' : 'ghost'}>负责人调整</YumiButton>
        </nav>
        {processingView === 'assignments' && <WorkAssignmentsPage focusedTaskId={navigationTarget?.processTaskId} order={focusedOrder} onChanged={() => void selectOrder(selectedOrder.id)} />}
        {processingView === 'opening_wip' && <form className="yumi-form-panel" onSubmit={handleOpeningWip}>
          <h2 className="yumi-form-panel__title">期初在制品</h2>
          <p className="yumi-form-hint">系统中途启用时，将当前产品已完成但尚未走完流程的数量，一次性登记到实际阶段。</p>
          <div className="yumi-form-grid yumi-form-grid--two">
            <YumiField><YumiFieldLabel>当前产品</YumiFieldLabel><p className="yumi-field__static">{focusedOrderItem.productSnapshot.name}</p></YumiField>
            <YumiField><YumiFieldLabel required>目标阶段</YumiFieldLabel><YumiSelect aria-label="期初在制品目标阶段" onValueChange={(value) => setOpeningStage(value as typeof openingStage)} options={[{ value: 'fluffing_bagging', label: '捏毛装袋' }, { value: 'packing', label: '待打包' }, { value: 'ready_to_ship', label: '待发货' }]} value={openingStage} /></YumiField>
            <YumiField><YumiFieldLabel required>数量</YumiFieldLabel><YumiNumberField min="1" onChange={(event) => setOpeningQuantity(event.target.value)} required value={openingQuantity} /></YumiField>
            <YumiField><YumiFieldLabel required>登记日期</YumiFieldLabel><YumiDatePicker aria-label="期初在制品登记日期" onValueChange={setOpeningOccurredOn} value={openingOccurredOn} /></YumiField>
          </div>
          <YumiField><YumiFieldLabel>备注</YumiFieldLabel><YumiTextArea onChange={(event) => setOpeningNote(event.target.value)} value={openingNote} /></YumiField>
          <div className="yumi-form-actions"><YumiButton loading={submitting === 'opening'} type="submit" variant="primary">{submitting === 'opening' ? '登记中…' : '登记期初在制品'}</YumiButton></div>
        </form>}
        {processingView === 'adjustment' && <form className="yumi-form-panel" onSubmit={handleAdjustment}>
          <h2 className="yumi-form-panel__title">负责人数量调整</h2>
          <p className="yumi-form-hint">用于售后退回、盘点修正等无法预先穷尽的情况，必须留下说明。</p>
          <div className="yumi-form-grid yumi-form-grid--two">
            <YumiField><YumiFieldLabel>当前产品</YumiFieldLabel><p className="yumi-field__static">{focusedOrderItem.productSnapshot.name}</p></YumiField>
            <YumiField><YumiFieldLabel>来源阶段</YumiFieldLabel><YumiSelect aria-label="来源阶段" onValueChange={setAdjustmentSource} options={[{ value: '', label: '无（增加）' }, ...adjustmentStages]} placeholder="无（增加）" value={adjustmentSource} /></YumiField>
            <YumiField><YumiFieldLabel>目标阶段</YumiFieldLabel><YumiSelect aria-label="目标阶段" onValueChange={setAdjustmentTarget} options={[{ value: '', label: '无（减少）' }, ...adjustmentStages]} placeholder="无（减少）" value={adjustmentTarget} /></YumiField>
            <YumiField><YumiFieldLabel required>数量</YumiFieldLabel><YumiNumberField min="1" onChange={(event) => setAdjustmentQuantity(event.target.value)} required value={adjustmentQuantity} /></YumiField>
            <YumiField><YumiFieldLabel required>调整日期</YumiFieldLabel><YumiDatePicker aria-label="负责人调整日期" onValueChange={setAdjustmentOccurredOn} value={adjustmentOccurredOn} /></YumiField>
          </div>
          <YumiField><YumiFieldLabel required>调整说明</YumiFieldLabel><YumiTextArea onChange={(event) => setAdjustmentNote(event.target.value)} required value={adjustmentNote} /></YumiField>
          <div className="yumi-form-actions"><YumiButton loading={submitting === 'adjustment'} type="submit" variant="primary">{submitting === 'adjustment' ? '调整中…' : '保存负责人调整'}</YumiButton></div>
        </form>}
      </section>
    )
  }

  return (
    <section className="yumi-page fulfillment-workspace">
      <YumiPageHeader description="跨订单查看当前待办；先按实际阶段筛选，再进入一个产品的处理上下文。" title="履约" />
      {loadError && <YumiNotification key={loadError} message={loadError} />}
      {loading ? <YumiEmptyState description="履约资料正在读取，请稍候。" title="加载履约待办中…" /> : <>
        <nav aria-label="阶段筛选" className="yumi-page-tabs">
          {queueFilters.map((filter) => <YumiButton aria-pressed={queueStage === filter.id} key={filter.id} onClick={() => setQueueStage(filter.id)} variant={queueStage === filter.id ? 'primary' : 'ghost'}>{filter.label} {filterCounts.get(filter.id) ?? 0}</YumiButton>)}
        </nav>
        {filteredQueueItems.length === 0 ? <YumiEmptyState
          action={queueStage === 'all' ? undefined : <YumiButton onClick={() => setQueueStage('all')} variant="secondary">查看全部待办</YumiButton>}
          description={queueStage === 'all' ? '创建订单后，待处理产品会自动出现在这里。' : `当前没有${queueFilters.find((filter) => filter.id === queueStage)?.label ?? ''}阶段的待办，可切换查看其他阶段。`}
          scenario={queueStage === 'all' ? 'first-use' : 'filter'}
          title={queueStage === 'all' ? '暂无待处理履约产品' : '此阶段暂无待办'}
        /> : <YumiBusinessList>{filteredQueueItems.map((item) => {
          const focusedStage = queueStage === 'all' ? getQueueFocus(item).stage : queueStage
          const stageQuantity = getFulfillmentQueueStageQuantity(item, focusedStage)
          const entersShipment = focusedStage === 'ready_to_ship'
          return <YumiBusinessListItem
            key={item.orderItemId}
            meta={`${item.orderCode} · ${item.customerName}`}
            metrics={[{ label: queueStageLabels[focusedStage], value: stageQuantity }]}
            onOpen={() => openQueueItem(item, focusedStage)}
            status={<YumiStatusTag tone={getStageTone(focusedStage)}>{queueStageLabels[focusedStage]}</YumiStatusTag>}
            summary={`${item.productName} · 确认 ${item.confirmedQuantity} · ${entersShipment ? '点击进入发货处理' : '点击进入处理'}`}
            title={item.orderCode}
          />
        })}</YumiBusinessList>}
      </>}
    </section>
  )
}
