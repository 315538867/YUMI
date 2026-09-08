import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Badge, Button, Flex, Heading, Text, TextArea, TextField } from '@radix-ui/themes'
import type { V2Order, V2OrderFundBusinessType, V2OrderItem, V2Product } from '@shared/contracts/index'
import { centsToYuan, formatCents, getErrorMessage, today, yuanToCents } from '../../composables/v2-utils'
import { useOrders } from '../../composables/use-orders'
import { useFinance } from '../../composables/use-finance'
import { AfterSalesPanel } from '../../components/after-sales/after-sales-panel'

interface OrderLineDraft {
  productId: string
  quantity: string
  unitPrice: string
}

const createLine = (product?: V2Product): OrderLineDraft => ({
  productId: product?.id ?? '',
  quantity: '1',
  unitPrice: product ? centsToYuan(product.basePriceCents) : '0'
})
const itemToDraft = (item: V2OrderItem): OrderLineDraft => ({
  productId: item.productId ?? '',
  quantity: String(item.quantity),
  unitPrice: centsToYuan(item.unitPriceCents)
})

export function OrdersPage() {
  const {
    orders, customers, products, selectedOrder, funds, shipments, contentChanges,
    loading, loadError, selectOrder, createOrder, changeContent, recordFund, correctFund, createShipment
  } = useOrders()
  const { listAfterSalesCases, createAfterSalesCase, updateAfterSalesCase, linkAfterSalesCharge } = useFinance()
  const [createCustomerId, setCreateCustomerId] = useState('')
  const [createLines, setCreateLines] = useState<OrderLineDraft[]>([createLine()])
  const [initialAmount, setInitialAmount] = useState('0')
  const [expectedShipDate, setExpectedShipDate] = useState('')
  const [createNotes, setCreateNotes] = useState('')
  const [contentLines, setContentLines] = useState<OrderLineDraft[]>([])
  const [contentDescription, setContentDescription] = useState('')
  const [contentDate, setContentDate] = useState(today())
  const [adjustmentAmount, setAdjustmentAmount] = useState('')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [fundType, setFundType] = useState<V2OrderFundBusinessType>('payment')
  const [fundAmount, setFundAmount] = useState('')
  const [fundDate, setFundDate] = useState(today())
  const [fundMethod, setFundMethod] = useState('')
  const [fundNote, setFundNote] = useState('')
  const [correctionOriginalId, setCorrectionOriginalId] = useState('')
  const [correctionAmount, setCorrectionAmount] = useState('')
  const [correctionDate, setCorrectionDate] = useState(today())
  const [correctionType, setCorrectionType] = useState<V2OrderFundBusinessType>('payment')
  const [shipmentDate, setShipmentDate] = useState(today())
  const [shipmentLines, setShipmentLines] = useState<Record<string, string>>({})
  const [shipmentCarrier, setShipmentCarrier] = useState('')
  const [shipmentTrackingNumber, setShipmentTrackingNumber] = useState('')
  const [shipmentNote, setShipmentNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedOrder) return
    setContentLines(selectedOrder.items.map(itemToDraft))
    setContentDescription('')
    setAdjustmentAmount('')
    setAdjustmentReason('')
    setCorrectionOriginalId('')
    setShipmentLines(Object.fromEntries(selectedOrder.items.map((item) => [item.id, '0'])))
  }, [selectedOrder])

  const shipmentQuantities = useMemo(() => {
    const quantities = new Map<string, number>()
    for (const shipment of shipments) {
      for (const line of shipment.items) {
        quantities.set(line.orderItemId, (quantities.get(line.orderItemId) ?? 0) + line.quantity)
      }
    }
    return quantities
  }, [shipments])

  const updateLine = (lines: OrderLineDraft[], setLines: (next: OrderLineDraft[]) => void, index: number, key: keyof OrderLineDraft, value: string) => {
    const nextLines = [...lines]
    nextLines[index] = { ...nextLines[index], [key]: value }
    if (key === 'productId') {
      const product = products.find((candidate) => candidate.id === value)
      if (product) nextLines[index].unitPrice = centsToYuan(product.basePriceCents)
    }
    setLines(nextLines)
  }

  const toItems = (lines: OrderLineDraft[]) => lines.map((line) => ({
    productId: line.productId,
    quantity: Math.round(Number(line.quantity)),
    unitPriceCents: yuanToCents(line.unitPrice)
  }))

  const handleCreateOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting('create')
    try {
      const customer = customers.find((candidate) => candidate.id === createCustomerId)
      if (!customer) throw new Error('请先选择已有客户')
      await createOrder({
        customerId: customer.id,
        customer: { name: customer.name, contact: customer.contact, defaultAddress: customer.defaultAddress, notes: customer.notes },
        items: toItems(createLines),
        initialConfirmedAmountCents: yuanToCents(initialAmount),
        expectedShipDate: expectedShipDate || null,
        notes: createNotes || null
      })
      setCreateCustomerId('')
      setCreateLines([createLine(products[0])])
      setInitialAmount('0')
      setExpectedShipDate('')
      setCreateNotes('')
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setSubmitting(null)
    }
  }

  const handleContentChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedOrder) return
    setError(null)
    setSubmitting('content')
    try {
      await changeContent(selectedOrder.id, {
        occurredOn: contentDate,
        description: contentDescription,
        items: toItems(contentLines),
        amountAdjustment: adjustmentAmount ? {
          amountCents: yuanToCents(adjustmentAmount), occurredOn: contentDate, reason: adjustmentReason
        } : null
      })
      setContentDescription('')
      setAdjustmentAmount('')
      setAdjustmentReason('')
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally { setSubmitting(null) }
  }

  const handleRecordFund = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedOrder) return
    setError(null)
    setSubmitting('fund')
    try {
      await recordFund(selectedOrder.id, {
        businessType: fundType, amountCents: yuanToCents(fundAmount), occurredOn: fundDate,
        paymentMethod: fundMethod || null, note: fundNote || null
      })
      setFundAmount(''); setFundMethod(''); setFundNote('')
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally { setSubmitting(null) }
  }

  const handleCorrection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedOrder) return
    setError(null)
    setSubmitting('correction')
    try {
      if (!correctionOriginalId) throw new Error('请选择需要冲正的原资金流水')
      await correctFund(selectedOrder.id, {
        originalEntryId: correctionOriginalId,
        reversalOccurredOn: correctionDate,
        replacement: { businessType: correctionType, amountCents: yuanToCents(correctionAmount), occurredOn: correctionDate }
      })
      setCorrectionOriginalId(''); setCorrectionAmount('')
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally { setSubmitting(null) }
  }

  const handleCreateShipment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedOrder) return
    setError(null)
    setSubmitting('shipment')
    try {
      await createShipment(selectedOrder.id, {
        shippedOn: shipmentDate,
        items: selectedOrder.items.map((item) => ({ orderItemId: item.id, quantity: Math.round(Number(shipmentLines[item.id] ?? 0)) })).filter((line) => line.quantity > 0),
        carrier: shipmentCarrier || null, trackingNumber: shipmentTrackingNumber || null, note: shipmentNote || null
      })
      setShipmentLines(Object.fromEntries(selectedOrder.items.map((item) => [item.id, '0'])))
      setShipmentCarrier(''); setShipmentTrackingNumber(''); setShipmentNote('')
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally { setSubmitting(null) }
  }

  return (
    <section className="v2-page">
      <Flex justify="between" align="center" gap="4" className="page-title-row">
        <div><Heading size="6">订单</Heading><Text as="p" color="gray">以订单为核心记录多商品、金额调整、资金流水与分批发货。</Text></div>
        <Badge color="orange">V2 订单账本</Badge>
      </Flex>
      {error && <p className="form-error global-error">{error}</p>}
      {loadError && <p className="form-error global-error">{loadError}</p>}
      <div className="orders-layout">
        <aside className="panel order-list"><Heading size="4">订单列表</Heading>
          {loading ? <p className="empty">正在加载订单…</p> : <div className="data-list">
            {orders.map((order) => <button type="button" className={`data-list-row ${selectedOrder?.id === order.id ? 'selected' : ''}`} key={order.id} onClick={() => void selectOrder(order.id)}>
              <span><strong>{order.code}</strong><small>{order.customerName} · 应收 {formatCents(order.currentAmountCents)}</small></span>
              <Badge color={order.outstandingCents > 0 ? 'orange' : 'green'}>{order.outstandingCents > 0 ? `待收 ${formatCents(order.outstandingCents)}` : '已收齐'}</Badge>
            </button>)}
            {!orders.length && <p className="empty">还没有订单。</p>}
          </div>}
        </aside>
        <div className="orders-workspace">
          <form className="panel v2-form" onSubmit={handleCreateOrder}>
            <Heading size="4">新建订单</Heading>
            <div className="form-grid two"><label>客户<select required value={createCustomerId} onChange={(event) => setCreateCustomerId(event.target.value)}><option value="">请选择已有客户</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><label>预计发货日期<TextField.Root type="date" value={expectedShipDate} onChange={(event) => setExpectedShipDate(event.target.value)} /></label><label>初始确认金额（元）<TextField.Root required type="number" min="0" step="0.01" value={initialAmount} onChange={(event) => setInitialAmount(event.target.value)} /></label></div>
            <OrderLines title="订单商品" lines={createLines} products={products} onChange={(index, key, value) => updateLine(createLines, setCreateLines, index, key, value)} onAdd={() => setCreateLines([...createLines, createLine(products[0])])} onRemove={(index) => setCreateLines(createLines.filter((_, lineIndex) => lineIndex !== index))} />
            <label>订单备注<TextArea value={createNotes} onChange={(event) => setCreateNotes(event.target.value)} /></label>
            <Flex justify="end"><Button type="submit" disabled={submitting === 'create'}>{submitting === 'create' ? '创建中…' : '创建订单'}</Button></Flex>
          </form>
          {selectedOrder ? <OrderDetail
            order={selectedOrder} funds={funds} shipments={shipments} contentChanges={contentChanges} products={products}
            contentLines={contentLines} setContentLines={setContentLines} contentDescription={contentDescription} setContentDescription={setContentDescription} contentDate={contentDate} setContentDate={setContentDate}
            adjustmentAmount={adjustmentAmount} setAdjustmentAmount={setAdjustmentAmount} adjustmentReason={adjustmentReason} setAdjustmentReason={setAdjustmentReason}
            fundType={fundType} setFundType={setFundType} fundAmount={fundAmount} setFundAmount={setFundAmount} fundDate={fundDate} setFundDate={setFundDate} fundMethod={fundMethod} setFundMethod={setFundMethod} fundNote={fundNote} setFundNote={setFundNote}
            correctionOriginalId={correctionOriginalId} setCorrectionOriginalId={setCorrectionOriginalId} correctionAmount={correctionAmount} setCorrectionAmount={setCorrectionAmount} correctionDate={correctionDate} setCorrectionDate={setCorrectionDate} correctionType={correctionType} setCorrectionType={setCorrectionType}
            shipmentDate={shipmentDate} setShipmentDate={setShipmentDate} shipmentLines={shipmentLines} setShipmentLines={setShipmentLines} shipmentCarrier={shipmentCarrier} setShipmentCarrier={setShipmentCarrier} shipmentTrackingNumber={shipmentTrackingNumber} setShipmentTrackingNumber={setShipmentTrackingNumber} shipmentNote={shipmentNote} setShipmentNote={setShipmentNote}
            shipmentQuantities={shipmentQuantities} submitting={submitting}
            updateContentLine={(index, key, value) => updateLine(contentLines, setContentLines, index, key, value)}
            onAddContentLine={() => setContentLines([...contentLines, createLine(products[0])])}
            onRemoveContentLine={(index) => setContentLines(contentLines.filter((_, lineIndex) => lineIndex !== index))}
            onContentChange={handleContentChange} onRecordFund={handleRecordFund} onCorrection={handleCorrection} onShipment={handleCreateShipment}
            listAfterSalesCases={listAfterSalesCases} createAfterSalesCase={createAfterSalesCase} updateAfterSalesCase={updateAfterSalesCase} linkAfterSalesCharge={linkAfterSalesCharge}
          /> : <div className="panel empty"><Heading size="4">请选择订单</Heading><Text as="p" color="gray">创建订单后，选择它即可登记内容变更、资金与分批发货。</Text></div>}
        </div>
      </div>
    </section>
  )
}

function OrderLines({ title, lines, products, onChange, onAdd, onRemove }: {
  title: string; lines: OrderLineDraft[]; products: V2Product[]; onChange: (index: number, key: keyof OrderLineDraft, value: string) => void; onAdd: () => void; onRemove: (index: number) => void
}) {
  return <fieldset className="line-editor"><legend>{title}</legend>{lines.map((line, index) => <div className="order-line" key={`${line.productId}-${index}`}>
    <label>商品<select required value={line.productId} onChange={(event) => onChange(index, 'productId', event.target.value)}><option value="">选择商品</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
    <label>数量<TextField.Root required type="number" min="1" step="1" value={line.quantity} onChange={(event) => onChange(index, 'quantity', event.target.value)} /></label>
    <label>单价（元）<TextField.Root required type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => onChange(index, 'unitPrice', event.target.value)} /></label>
    <Button type="button" color="gray" variant="soft" disabled={lines.length === 1} onClick={() => onRemove(index)}>移除</Button>
  </div>)}<Button type="button" variant="soft" onClick={onAdd}>添加商品行</Button></fieldset>
}

function OrderDetail(props: {
  order: V2Order; funds: ReturnType<typeof useOrders>['funds']; shipments: ReturnType<typeof useOrders>['shipments']; contentChanges: ReturnType<typeof useOrders>['contentChanges']; products: V2Product[];
  contentLines: OrderLineDraft[]; setContentLines: (value: OrderLineDraft[]) => void; contentDescription: string; setContentDescription: (value: string) => void; contentDate: string; setContentDate: (value: string) => void;
  adjustmentAmount: string; setAdjustmentAmount: (value: string) => void; adjustmentReason: string; setAdjustmentReason: (value: string) => void;
  fundType: V2OrderFundBusinessType; setFundType: (value: V2OrderFundBusinessType) => void; fundAmount: string; setFundAmount: (value: string) => void; fundDate: string; setFundDate: (value: string) => void; fundMethod: string; setFundMethod: (value: string) => void; fundNote: string; setFundNote: (value: string) => void;
  correctionOriginalId: string; setCorrectionOriginalId: (value: string) => void; correctionAmount: string; setCorrectionAmount: (value: string) => void; correctionDate: string; setCorrectionDate: (value: string) => void; correctionType: V2OrderFundBusinessType; setCorrectionType: (value: V2OrderFundBusinessType) => void;
  shipmentDate: string; setShipmentDate: (value: string) => void; shipmentLines: Record<string, string>; setShipmentLines: (value: Record<string, string>) => void; shipmentCarrier: string; setShipmentCarrier: (value: string) => void; shipmentTrackingNumber: string; setShipmentTrackingNumber: (value: string) => void; shipmentNote: string; setShipmentNote: (value: string) => void;
  shipmentQuantities: Map<string, number>; submitting: string | null; listAfterSalesCases: ReturnType<typeof useFinance>['listAfterSalesCases']; createAfterSalesCase: ReturnType<typeof useFinance>['createAfterSalesCase']; updateAfterSalesCase: ReturnType<typeof useFinance>['updateAfterSalesCase']; linkAfterSalesCharge: ReturnType<typeof useFinance>['linkAfterSalesCharge']; updateContentLine: (index: number, key: keyof OrderLineDraft, value: string) => void; onAddContentLine: () => void; onRemoveContentLine: (index: number) => void; onContentChange: (event: FormEvent<HTMLFormElement>) => void; onRecordFund: (event: FormEvent<HTMLFormElement>) => void; onCorrection: (event: FormEvent<HTMLFormElement>) => void; onShipment: (event: FormEvent<HTMLFormElement>) => void
}) {
  const { order, funds, shipments, contentChanges, products, shipmentQuantities } = props
  return <div className="order-detail-stack">
    <div className="panel"><Flex justify="between" align="start" gap="4"><div><Heading size="5">{order.code}</Heading><Text as="p" color="gray">{order.customerSnapshot.name} · {order.expectedShipDate ? `预计 ${order.expectedShipDate} 发货` : '未设预计发货日期'}</Text></div><Badge color={order.funds.outstandingCents > 0 ? 'orange' : 'green'}>{order.funds.outstandingCents > 0 ? `待收 ${formatCents(order.funds.outstandingCents)}` : '已收齐'}</Badge></Flex>
      <div className="order-stats"><span>当前确认金额<strong>{formatCents(order.amount.currentAmountCents)}</strong></span><span>累计收款<strong>{formatCents(order.funds.netReceivedCents)}</strong></span><span>金额调整<strong>{formatCents(order.amount.adjustmentsCents)}</strong></span></div>
      <div className="simple-lines">{order.items.map((item) => <p key={item.id}>{item.productSnapshot.name} × {item.quantity} · {formatCents(item.unitPriceCents)}</p>)}</div>
    </div>
    <form className="panel v2-form" onSubmit={props.onContentChange}><Heading size="4">订单内容变更</Heading><div className="form-grid two"><label>变更日期<TextField.Root type="date" value={props.contentDate} onChange={(event) => props.setContentDate(event.target.value)} /></label><label>变更说明<TextField.Root required value={props.contentDescription} onChange={(event) => props.setContentDescription(event.target.value)} placeholder="例如：加封边、换袋子" /></label></div><OrderLines title="变更后的商品明细" lines={props.contentLines} products={products} onChange={props.updateContentLine} onAdd={props.onAddContentLine} onRemove={props.onRemoveContentLine} /><div className="form-grid two"><label>金额调整（元，可正可负）<TextField.Root type="number" step="0.01" value={props.adjustmentAmount} onChange={(event) => props.setAdjustmentAmount(event.target.value)} /></label><label>金额调整原因<TextField.Root required={Boolean(props.adjustmentAmount)} value={props.adjustmentReason} onChange={(event) => props.setAdjustmentReason(event.target.value)} /></label></div><Flex justify="end"><Button type="submit" disabled={props.submitting === 'content'}>{props.submitting === 'content' ? '保存中…' : '保存内容变更'}</Button></Flex>
      {contentChanges.length > 0 && <Text size="2" color="gray">已记录 {contentChanges.length} 次内容变更，历史不会被覆盖。</Text>}</form>
    <div className="v2-detail-grid"><form className="panel v2-form" onSubmit={props.onRecordFund}><Heading size="4">收款 / 退款</Heading><label>业务类型<select value={props.fundType} onChange={(event) => props.setFundType(event.target.value as V2OrderFundBusinessType)}><option value="payment">收款</option><option value="refund">退款</option><option value="after_sales_charge">售后收费</option></select></label><label>金额（元）<TextField.Root required type="number" min="0.01" step="0.01" value={props.fundAmount} onChange={(event) => props.setFundAmount(event.target.value)} /></label><label>发生日期<TextField.Root type="date" value={props.fundDate} onChange={(event) => props.setFundDate(event.target.value)} /></label><label>支付方式<TextField.Root value={props.fundMethod} onChange={(event) => props.setFundMethod(event.target.value)} /></label><label>备注<TextArea value={props.fundNote} onChange={(event) => props.setFundNote(event.target.value)} /></label><Flex justify="end"><Button type="submit" disabled={props.submitting === 'fund'}>登记资金</Button></Flex></form>
      <form className="panel v2-form" onSubmit={props.onCorrection}><Heading size="4">冲正并更正</Heading><label>原资金流水<select required value={props.correctionOriginalId} onChange={(event) => props.setCorrectionOriginalId(event.target.value)}><option value="">请选择</option>{funds.filter((fund) => !fund.reversalOfEntryId).map((fund) => <option key={fund.id} value={fund.id}>{fund.businessType} · {formatCents(fund.amountCents)} · {fund.occurredOn}</option>)}</select></label><label>替代类型<select value={props.correctionType} onChange={(event) => props.setCorrectionType(event.target.value as V2OrderFundBusinessType)}><option value="payment">收款</option><option value="refund">退款</option><option value="after_sales_charge">售后收费</option></select></label><label>替代金额（元）<TextField.Root required type="number" min="0.01" step="0.01" value={props.correctionAmount} onChange={(event) => props.setCorrectionAmount(event.target.value)} /></label><label>冲正日期<TextField.Root type="date" value={props.correctionDate} onChange={(event) => props.setCorrectionDate(event.target.value)} /></label><Flex justify="end"><Button type="submit" color="orange" disabled={props.submitting === 'correction'}>冲正并更正</Button></Flex></form></div>
    <AfterSalesPanel orderId={order.id} shipments={shipments} funds={funds} listCases={props.listAfterSalesCases} createCase={props.createAfterSalesCase} updateCase={props.updateAfterSalesCase} linkCharge={props.linkAfterSalesCharge} />
    <form className="panel v2-form" onSubmit={props.onShipment}><Heading size="4">新增发货</Heading><div className="form-grid three"><label>发货日期<TextField.Root type="date" value={props.shipmentDate} onChange={(event) => props.setShipmentDate(event.target.value)} /></label><label>承运商<TextField.Root value={props.shipmentCarrier} onChange={(event) => props.setShipmentCarrier(event.target.value)} /></label><label>运单号<TextField.Root value={props.shipmentTrackingNumber} onChange={(event) => props.setShipmentTrackingNumber(event.target.value)} /></label></div><div className="shipment-lines">{order.items.map((item) => { const shipped = shipmentQuantities.get(item.id) ?? 0; const remaining = item.quantity - shipped; return <div key={item.id}><span>{item.productSnapshot.name} · 订单 {item.quantity}</span><span>累计已发 {shipped}</span><span>待发 {remaining}</span><TextField.Root aria-label={`${item.productSnapshot.name} 本次发货数量`} type="number" min="0" max={remaining} step="1" value={props.shipmentLines[item.id] ?? '0'} onChange={(event) => props.setShipmentLines({ ...props.shipmentLines, [item.id]: event.target.value })} /></div>})}</div><label>发货备注<TextArea value={props.shipmentNote} onChange={(event) => props.setShipmentNote(event.target.value)} /></label><Flex justify="between" align="center"><Text size="2" color="gray">已有 {shipments.length} 批发货记录；系统会校验累计发货不能超出确认数量。</Text><Button type="submit" disabled={props.submitting === 'shipment'}>{props.submitting === 'shipment' ? '登记中…' : '新增发货'}</Button></Flex></form>
  </div>
}
