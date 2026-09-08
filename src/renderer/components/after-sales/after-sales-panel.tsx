import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Badge, Button, Flex, Heading, Text, TextArea, TextField } from '@radix-ui/themes'
import type { V2AfterSalesCase, V2AfterSalesStatus, V2OrderFund, V2Shipment } from '@shared/contracts/index'
import { formatCents, getErrorMessage, today, yuanToCents } from '../../composables/v2-utils'

interface AfterSalesPanelProps {
  orderId: string
  shipments: V2Shipment[]
  funds: V2OrderFund[]
  listCases: (query: { orderId: string }) => Promise<V2AfterSalesCase[]>
  createCase: (input: Parameters<Window['yumiV2']['afterSales']['createCase']>[0]) => Promise<V2AfterSalesCase>
  updateCase: (id: string, input: Parameters<Window['yumiV2']['afterSales']['updateCase']>[1]) => Promise<V2AfterSalesCase>
  linkCharge: (afterSalesCaseId: string, financialEntryId: string) => Promise<unknown>
}

export function AfterSalesPanel({ orderId, shipments, funds, listCases, createCase, updateCase, linkCharge }: AfterSalesPanelProps) {
  const [cases, setCases] = useState<V2AfterSalesCase[]>([])
  const [shipmentId, setShipmentId] = useState('')
  const [occurredOn, setOccurredOn] = useState(today())
  const [reasonDescription, setReasonDescription] = useState('')
  const [customerRequest, setCustomerRequest] = useState('')
  const [responsibilityDescription, setResponsibilityDescription] = useState('待负责人判断')
  const [handlingDescription, setHandlingDescription] = useState('')
  const [status, setStatus] = useState<V2AfterSalesStatus>('open')
  const [customerChargeNote, setCustomerChargeNote] = useState('')
  const [accountingCost, setAccountingCost] = useState('0')
  const [note, setNote] = useState('')
  const [chargeCaseId, setChargeCaseId] = useState('')
  const [chargeEntryId, setChargeEntryId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const availableCharges = useMemo(() => funds.filter((fund) => fund.businessType === 'after_sales_charge' && !fund.reversalOfEntryId), [funds])
  const reload = useCallback(async () => { const next = await listCases({ orderId }); setCases(next); return next }, [listCases, orderId])
  useEffect(() => { void reload().catch((cause) => setError(getErrorMessage(cause))) }, [reload])
  useEffect(() => { if (!chargeCaseId || cases.some((item) => item.id === chargeCaseId)) return; setChargeCaseId(cases[0]?.id ?? '') }, [cases, chargeCaseId])
  const handleCreate = async (event: FormEvent) => {
    event.preventDefault(); setError(null); setSubmitting('create')
    try { await createCase({ orderId, shipmentId: shipmentId || null, occurredOn, reasonDescription, customerRequest: customerRequest || null, responsibilityDescription, handlingDescription, status, customerChargeNote: customerChargeNote || null, accountingCostCents: yuanToCents(accountingCost), note: note || null }); setReasonDescription(''); setCustomerRequest(''); setHandlingDescription(''); setCustomerChargeNote(''); setAccountingCost('0'); setNote(''); await reload() }
    catch (cause) { setError(getErrorMessage(cause)) } finally { setSubmitting(null) }
  }
  const handleLink = async () => { setError(null); setSubmitting('link'); try { await linkCharge(chargeCaseId, chargeEntryId); await reload(); setChargeEntryId('') } catch (cause) { setError(getErrorMessage(cause)) } finally { setSubmitting(null) } }
  const updateStatus = async (item: V2AfterSalesCase, nextStatus: V2AfterSalesStatus) => { setError(null); setSubmitting(item.id); try { await updateCase(item.id, { status: nextStatus }); await reload() } catch (cause) { setError(getErrorMessage(cause)) } finally { setSubmitting(null) } }

  return <section className="panel after-sales-panel"><Flex justify="between" align="center"><div><Heading size="4">售后处理</Heading><Text size="2" color="gray">负责人自行填写原因、责任判断、处理方式、成本与收费；系统不会自动定责、收费或创建返工任务。</Text></div><Badge color="orange">弹性记录</Badge></Flex>{error && <Text as="p" color="red">{error}</Text>}
    <form className="v2-form" onSubmit={handleCreate}><div className="form-grid three"><label>发生日期<TextField.Root required type="date" value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} /></label><label>关联发货批次<select value={shipmentId} onChange={(event) => setShipmentId(event.target.value)}><option value="">不关联批次</option>{shipments.map((shipment) => <option key={shipment.id} value={shipment.id}>{shipment.shippedOn} · {shipment.trackingNumber || shipment.id}</option>)}</select></label><label>状态<select value={status} onChange={(event) => setStatus(event.target.value as V2AfterSalesStatus)}><option value="open">待处理</option><option value="processing">处理中</option><option value="resolved">已解决</option><option value="cancelled">已取消</option></select></label></div><label>问题原因<TextArea required value={reasonDescription} onChange={(event) => setReasonDescription(event.target.value)} placeholder="例如：客户不满意包装袋或产品质量问题" /></label><div className="form-grid two"><label>客户诉求<TextArea value={customerRequest} onChange={(event) => setCustomerRequest(event.target.value)} placeholder="例如：加封边、加配饰、换袋子" /></label><label>负责人责任判断<TextArea required value={responsibilityDescription} onChange={(event) => setResponsibilityDescription(event.target.value)} placeholder="可先填写待负责人判断，再由负责人更新" /></label><label>处理方式<TextArea required value={handlingDescription} onChange={(event) => setHandlingDescription(event.target.value)} placeholder="负责人自行决定是否补发、返工、重新包装等" /></label><label>售后核算成本（元）<TextField.Root required type="number" min="0" step="0.01" value={accountingCost} onChange={(event) => setAccountingCost(event.target.value)} /></label><label>向客户收费说明<TextField.Root value={customerChargeNote} onChange={(event) => setCustomerChargeNote(event.target.value)} placeholder="可为零收费，成本仍应记录" /></label><label>备注<TextField.Root value={note} onChange={(event) => setNote(event.target.value)} /></label></div><Flex justify="end"><Button type="submit" disabled={submitting === 'create'}>{submitting === 'create' ? '保存中…' : '新增售后记录'}</Button></Flex></form>
    {cases.length > 0 && <div className="after-sales-list">{cases.map((item) => <div className="after-sales-row" key={item.id}><div><Flex gap="2" align="center"><strong>{item.occurredOn}</strong><Badge color={item.status === 'resolved' ? 'green' : item.status === 'cancelled' ? 'gray' : 'orange'}>{item.status === 'open' ? '待处理' : item.status === 'processing' ? '处理中' : item.status === 'resolved' ? '已解决' : '已取消'}</Badge></Flex><Text as="p" size="2">{item.reasonDescription}</Text><Text as="p" size="1" color="gray">责任：{item.responsibilityDescription} · 核算成本 {formatCents(item.accountingCostCents)} · 已关联收费 {item.chargeFinancialEntryIds.length} 笔</Text></div><select value={item.status} onChange={(event) => void updateStatus(item, event.target.value as V2AfterSalesStatus)} disabled={submitting === item.id}><option value="open">待处理</option><option value="processing">处理中</option><option value="resolved">已解决</option><option value="cancelled">已取消</option></select></div>)}</div>}
    {cases.length > 0 && <div className="after-sales-link"><Heading size="3">关联实际售后收费</Heading><Text size="2" color="gray">先在上方“收款 / 退款”按“售后收费”登记实际到账，再手动关联；不填也不会阻止保存售后成本。</Text><div className="inline-fields"><select value={chargeCaseId} onChange={(event) => setChargeCaseId(event.target.value)}><option value="">选择售后记录</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.occurredOn} · {item.reasonDescription.slice(0, 16)}</option>)}</select><select value={chargeEntryId} onChange={(event) => setChargeEntryId(event.target.value)}><option value="">选择已登记收费</option>{availableCharges.map((item) => <option key={item.id} value={item.id}>{item.occurredOn} · {formatCents(item.amountCents)}</option>)}</select><Button size="1" onClick={() => void handleLink()} disabled={!chargeCaseId || !chargeEntryId || submitting === 'link'}>关联收费</Button></div></div>}
  </section>
}
