import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Badge, Button, Flex, Heading, Text, TextArea, TextField } from '@radix-ui/themes'
import type { V2FulfillmentStage, V2OrderItemFulfillment } from '@shared/contracts/index'
import { getErrorMessage, today } from '../../composables/v2-utils'
import { useFulfillment } from '../../composables/use-fulfillment'
import { WorkAssignmentsPage } from '../work-assignments'

const stages: Array<{ key: keyof V2OrderItemFulfillment['stages']; label: string }> = [
  { key: 'making', label: '制作中' }, { key: 'fluffingBagging', label: '捏毛装袋' },
  { key: 'packing', label: '待打包' }, { key: 'readyToShip', label: '待发货' }, { key: 'shipped', label: '已发货' }
]
const adjustmentStages: Array<{ value: V2FulfillmentStage; label: string }> = [
  { value: 'making', label: '制作中' }, { value: 'fluffing_bagging', label: '捏毛装袋' },
  { value: 'packing', label: '待打包' }, { value: 'ready_to_ship', label: '待发货' }, { value: 'shipped', label: '已发货' }
]

export function FulfillmentPage() {
  const { orders, selectedOrder, items, loading, loadError, selectOrder, recordOpeningWip, adjustStageQuantity } = useFulfillment()
  const [openingItemId, setOpeningItemId] = useState('')
  const [openingStage, setOpeningStage] = useState<'fluffing_bagging' | 'packing' | 'ready_to_ship'>('ready_to_ship')
  const [openingQuantity, setOpeningQuantity] = useState('')
  const [openingNote, setOpeningNote] = useState('')
  const [adjustmentItemId, setAdjustmentItemId] = useState('')
  const [adjustmentSource, setAdjustmentSource] = useState('')
  const [adjustmentTarget, setAdjustmentTarget] = useState('')
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('')
  const [adjustmentNote, setAdjustmentNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)

  useEffect(() => { if (selectedOrder) { setOpeningItemId(selectedOrder.items[0]?.id ?? ''); setAdjustmentItemId(selectedOrder.items[0]?.id ?? '') } }, [selectedOrder])
  const itemNames = useMemo(() => new Map(selectedOrder?.items.map((item) => [item.id, item.productSnapshot.name]) ?? []), [selectedOrder])

  const handleOpeningWip = async (event: FormEvent) => {
    event.preventDefault(); setError(null); setSubmitting('opening')
    try { await recordOpeningWip({ orderItemId: openingItemId, targetStage: openingStage, quantity: Number(openingQuantity), occurredOn: today(), note: openingNote }); setOpeningQuantity(''); setOpeningNote('') } catch (cause) { setError(getErrorMessage(cause)) } finally { setSubmitting(null) }
  }
  const handleAdjustment = async (event: FormEvent) => {
    event.preventDefault(); setError(null); setSubmitting('adjustment')
    try { await adjustStageQuantity({ orderItemId: adjustmentItemId, quantity: Number(adjustmentQuantity), sourceStage: adjustmentSource as V2FulfillmentStage || null, targetStage: adjustmentTarget as V2FulfillmentStage || null, occurredOn: today(), note: adjustmentNote }); setAdjustmentQuantity(''); setAdjustmentNote('') } catch (cause) { setError(getErrorMessage(cause)) } finally { setSubmitting(null) }
  }

  return <div className="fulfillment-workspace"><div className="page-heading"><div><Text size="2" color="gray">订单履约</Text><Heading size="7">订单产品履约</Heading></div><select aria-label="选择订单" value={selectedOrder?.id ?? ''} onChange={(event) => void selectOrder(event.target.value)}><option value="">选择订单</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.code} · {order.customerSnapshot.name}</option>)}</select></div>{loadError && <div className="panel"><Text color="red">{loadError}</Text></div>}{error && <div className="panel"><Text color="red">{error}</Text></div>}{loading ? <div className="panel empty">加载履约数据中…</div> : !selectedOrder ? <div className="panel empty">先创建或选择一张订单，再录入现存生产进度。</div> : <><div className="fulfillment-items">{items.map((item) => <article className="panel" key={item.orderItemId}><Flex justify="between"><div><Heading size="4">{itemNames.get(item.orderItemId)}</Heading><Text size="2" color="gray">确认数量 {item.confirmedQuantity}</Text></div><Badge color="orange">待发货 {item.stages.readyToShip}</Badge></Flex><div className="stage-grid">{stages.map((stage) => <div key={stage.key}><Text size="1" color="gray">{stage.label}</Text><Heading size="5">{item.stages[stage.key]}</Heading></div>)}</div></article>)}</div><div className="two-column"><div className="panel"><Heading size="5">期初在制品</Heading><Text size="2" color="gray">系统中途启用时，将已完成但尚未走完流程的数量一次性登记到实际阶段。</Text><form className="editor-form" onSubmit={handleOpeningWip}><label>订单产品<select value={openingItemId} onChange={(event) => setOpeningItemId(event.target.value)}>{selectedOrder.items.map((item) => <option key={item.id} value={item.id}>{item.productSnapshot.name}</option>)}</select></label><div className="form-grid"><label>目标阶段<select value={openingStage} onChange={(event) => setOpeningStage(event.target.value as typeof openingStage)}><option value="fluffing_bagging">捏毛装袋</option><option value="packing">待打包</option><option value="ready_to_ship">待发货</option></select></label><label>数量<TextField.Root type="number" min="1" value={openingQuantity} onChange={(event) => setOpeningQuantity(event.target.value)} /></label></div><label>备注<TextArea value={openingNote} onChange={(event) => setOpeningNote(event.target.value)} /></label><Button type="submit" disabled={submitting === 'opening'}>{submitting === 'opening' ? '登记中…' : '登记期初在制品'}</Button></form></div><div className="panel"><Heading size="5">负责人数量调整</Heading><Text size="2" color="gray">用于售后退回、盘点修正等无法预先穷尽的情况，必须留下说明。</Text><form className="editor-form" onSubmit={handleAdjustment}><label>订单产品<select value={adjustmentItemId} onChange={(event) => setAdjustmentItemId(event.target.value)}>{selectedOrder.items.map((item) => <option key={item.id} value={item.id}>{item.productSnapshot.name}</option>)}</select></label><div className="form-grid"><label>来源阶段<select value={adjustmentSource} onChange={(event) => setAdjustmentSource(event.target.value)}><option value="">无（增加）</option>{adjustmentStages.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select></label><label>目标阶段<select value={adjustmentTarget} onChange={(event) => setAdjustmentTarget(event.target.value)}><option value="">无（减少）</option>{adjustmentStages.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select></label><label>数量<TextField.Root type="number" min="1" value={adjustmentQuantity} onChange={(event) => setAdjustmentQuantity(event.target.value)} /></label></div><label>调整说明<TextArea value={adjustmentNote} onChange={(event) => setAdjustmentNote(event.target.value)} /></label><Button type="submit" disabled={submitting === 'adjustment'}>{submitting === 'adjustment' ? '调整中…' : '保存负责人调整'}</Button></form></div></div><WorkAssignmentsPage order={selectedOrder} onChanged={() => void selectOrder(selectedOrder.id)} /></>}</div>
}
