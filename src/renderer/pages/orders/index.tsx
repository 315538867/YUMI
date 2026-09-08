import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type {
  V2Customer,
  V2CustomerInput,
  V2NavigationTarget,
  V2Order,
  V2OrderFundBusinessType,
  V2OrderItem,
  V2Product,
  V2ProductInput
} from '@shared/contracts/index'
import {
  centsToYuan,
  formatCents,
  getErrorMessage,
  today,
  yuanToCents
} from '../../composables/v2-utils'
import { buildShipmentItemAvailability, useOrders } from '../../composables/use-orders'
import { useFinance } from '../../composables/use-finance'
import { useCustomers } from '../../composables/use-customers'
import { useProducts } from '../../composables/use-products'
import { AfterSalesPanel } from '../../components/after-sales/after-sales-panel'
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
  YumiSearchSelect,
  YumiSection,
  YumiSheet,
  YumiSelect,
  YumiStatusTag,
  YumiTextArea,
  YumiTextField
} from '../../components/ui'

interface OrderLineDraft {
  productId: string
  quantity: string
  unitPrice: string
}

type OrderWorkspaceMode = 'list' | 'create' | 'detail'
type OrderDetailView = 'overview' | 'fulfillment' | 'funds' | 'after_sales'

interface OrdersPageProps {
  navigationTarget?: Extract<V2NavigationTarget, { view: 'orders' }> | null
  onNavigateToBaseData: (view: 'customers' | 'products') => void
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

interface QuickCustomerDraft {
  name: string
  contact: string
  defaultAddress: string
  notes: string
}

interface QuickProductDraft {
  name: string
  basePrice: string
}

type QuickCreateTarget =
  | { kind: 'customer' }
  | { kind: 'product'; lineIndex: number }
  | null

const emptyQuickCustomerDraft = (name = ''): QuickCustomerDraft => ({
  name,
  contact: '',
  defaultAddress: '',
  notes: ''
})
const emptyQuickProductDraft = (name = ''): QuickProductDraft => ({ name, basePrice: '0' })
const toQuickCustomerInput = (draft: QuickCustomerDraft): V2CustomerInput => ({
  name: draft.name,
  contact: draft.contact || null,
  defaultAddress: draft.defaultAddress || null,
  notes: draft.notes || null
})
const toQuickProductInput = (draft: QuickProductDraft): V2ProductInput => ({
  name: draft.name,
  code: null,
  category: null,
  basePriceCents: yuanToCents(draft.basePrice),
  materialCostCents: 0,
  packagingCostCents: 0,
  accessoryCostCents: 0,
  replacementBagCostCents: 0,
  edgeCostCents: 0,
  standardMakingMinutes: 0,
  makingCommissionCents: 0,
  makingGlueCostCents: 0,
  notes: null
})

function mergeById<T extends { id: string }>(base: T[], added: T[]): T[] {
  return Array.from(new Map([...base, ...added].map((item) => [item.id, item])).values())
}

function FundTypeSelect({
  ariaLabel,
  onValueChange,
  value
}: {
  ariaLabel: string
  onValueChange: (value: V2OrderFundBusinessType) => void
  value: V2OrderFundBusinessType
}) {
  return (
    <YumiSelect
      aria-label={ariaLabel}
      onValueChange={(nextValue) => onValueChange(nextValue as V2OrderFundBusinessType)}
      options={[
        { value: 'payment', label: '收款' },
        { value: 'refund', label: '退款' },
        { value: 'after_sales_charge', label: '售后收费' }
      ]}
      value={value}
    />
  )
}

export function OrdersPage({ navigationTarget = null, onNavigateToBaseData }: OrdersPageProps) {
  const {
    orders,
    customers,
    products,
    selectedOrder,
    funds,
    shipments,
    fulfillmentItems,
    contentChanges,
    loading,
    loadError,
    selectOrder,
    createOrder,
    changeContent,
    recordFund,
    correctFund,
    createShipment
  } = useOrders()
  const { createCustomer: createQuickCustomer } = useCustomers()
  const { createProduct: createQuickProduct } = useProducts()
  const { listAfterSalesCases, createAfterSalesCase, updateAfterSalesCase, linkAfterSalesCharge } =
    useFinance()
  const [workspaceMode, setWorkspaceMode] = useState<OrderWorkspaceMode>('list')
  const [detailView, setDetailView] = useState<OrderDetailView>('overview')
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
  const [shipmentSheetOpen, setShipmentSheetOpen] = useState(false)
  const [quickCustomers, setQuickCustomers] = useState<V2Customer[]>([])
  const [quickProducts, setQuickProducts] = useState<V2Product[]>([])
  const [quickCreateTarget, setQuickCreateTarget] = useState<QuickCreateTarget>(null)
  const [quickCustomerDraft, setQuickCustomerDraft] = useState<QuickCustomerDraft>(emptyQuickCustomerDraft)
  const [quickCustomerInitialDraft, setQuickCustomerInitialDraft] = useState<QuickCustomerDraft>(emptyQuickCustomerDraft)
  const [quickProductDraft, setQuickProductDraft] = useState<QuickProductDraft>(emptyQuickProductDraft)
  const [quickProductInitialDraft, setQuickProductInitialDraft] = useState<QuickProductDraft>(emptyQuickProductDraft)
  const [quickCreateError, setQuickCreateError] = useState<string | null>(null)
  const [quickSubmitting, setQuickSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)

  useEffect(() => {
    if (!navigationTarget) return
    if (navigationTarget.orderView) setDetailView(navigationTarget.orderView)
    if (!navigationTarget.orderId || selectedOrder?.id === navigationTarget.orderId) return
    void selectOrder(navigationTarget.orderId).then(() => setWorkspaceMode('detail'))
  }, [navigationTarget, selectedOrder?.id, selectOrder])

  useEffect(() => {
    if (!selectedOrder) return
    setContentLines(selectedOrder.items.map(itemToDraft))
    setContentDescription('')
    setAdjustmentAmount('')
    setAdjustmentReason('')
    setCorrectionOriginalId('')
    setShipmentLines(Object.fromEntries(selectedOrder.items.map((item) => [item.id, '0'])))
  }, [selectedOrder])

  const availableCustomers = useMemo(() => mergeById(customers, quickCustomers), [customers, quickCustomers])
  const availableProducts = useMemo(() => mergeById(products, quickProducts), [products, quickProducts])

  const shipmentAvailability = useMemo(
    () =>
      selectedOrder
        ? buildShipmentItemAvailability(selectedOrder, shipments, fulfillmentItems)
        : [],
    [selectedOrder, shipments, fulfillmentItems]
  )

  const updateLine = (
    lines: OrderLineDraft[],
    setLines: (next: OrderLineDraft[]) => void,
    index: number,
    key: keyof OrderLineDraft,
    value: string
  ) => {
    const nextLines = [...lines]
    nextLines[index] = { ...nextLines[index], [key]: value }
    if (key === 'productId') {
      const product = availableProducts.find((candidate) => candidate.id === value)
      if (product) nextLines[index].unitPrice = centsToYuan(product.basePriceCents)
    }
    setLines(nextLines)
  }

  const toItems = (lines: OrderLineDraft[]) =>
    lines.map((line) => ({
      productId: line.productId,
      quantity: Math.round(Number(line.quantity)),
      unitPriceCents: yuanToCents(line.unitPrice)
    }))

  const validateLines = (lines: OrderLineDraft[]) => {
    if (
      !lines.length ||
      lines.some(
        (line) => !line.productId || Number(line.quantity) < 1 || Number(line.unitPrice) < 0
      )
    ) {
      throw new Error('请完整填写每一行商品、数量和单价')
    }
  }

  const handleCreateOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting('create')
    try {
      const customer = availableCustomers.find((candidate) => candidate.id === createCustomerId)
      if (!customer) throw new Error('请先选择已有客户')
      validateLines(createLines)
      await createOrder({
        customerId: customer.id,
        customer: {
          name: customer.name,
          contact: customer.contact,
          defaultAddress: customer.defaultAddress,
          notes: customer.notes
        },
        items: toItems(createLines),
        initialConfirmedAmountCents: yuanToCents(initialAmount),
        expectedShipDate: expectedShipDate || null,
        notes: createNotes || null
      })
      setCreateCustomerId('')
      setCreateLines([createLine(availableProducts[0])])
      setInitialAmount('0')
      setExpectedShipDate('')
      setCreateNotes('')
      setWorkspaceMode('detail')
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
      validateLines(contentLines)
      await changeContent(selectedOrder.id, {
        occurredOn: contentDate,
        description: contentDescription,
        items: toItems(contentLines),
        amountAdjustment: adjustmentAmount
          ? {
              amountCents: yuanToCents(adjustmentAmount),
              occurredOn: contentDate,
              reason: adjustmentReason
            }
          : null
      })
      setContentDescription('')
      setAdjustmentAmount('')
      setAdjustmentReason('')
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setSubmitting(null)
    }
  }

  const handleRecordFund = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedOrder) return
    setError(null)
    setSubmitting('fund')
    try {
      await recordFund(selectedOrder.id, {
        businessType: fundType,
        amountCents: yuanToCents(fundAmount),
        occurredOn: fundDate,
        paymentMethod: fundMethod || null,
        note: fundNote || null
      })
      setFundAmount('')
      setFundMethod('')
      setFundNote('')
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setSubmitting(null)
    }
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
        replacement: {
          businessType: correctionType,
          amountCents: yuanToCents(correctionAmount),
          occurredOn: correctionDate
        }
      })
      setCorrectionOriginalId('')
      setCorrectionAmount('')
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setSubmitting(null)
    }
  }

  const handleCreateShipment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedOrder) return
    setError(null)
    setSubmitting('shipment')
    try {
      const availabilityByOrderItem = new Map(
        shipmentAvailability.map((item) => [item.orderItemId, item])
      )
      const items = selectedOrder.items
        .map((item) => {
          const quantity = Number(shipmentLines[item.id] ?? 0)
          const availability = availabilityByOrderItem.get(item.id)
          if (!Number.isInteger(quantity) || quantity < 0)
            throw new Error(`${item.productSnapshot.name} 的发货数量必须是非负整数`)
          if (quantity > (availability?.availableQuantity ?? 0)) {
            throw new Error(
              `${item.productSnapshot.name} 本批最多可发 ${availability?.availableQuantity ?? 0} 件`
            )
          }
          return { orderItemId: item.id, quantity }
        })
        .filter((line) => line.quantity > 0)
      if (!items.length) throw new Error('请至少填写一项本批发货数量')
      await createShipment(selectedOrder.id, {
        shippedOn: shipmentDate,
        items,
        carrier: shipmentCarrier || null,
        trackingNumber: shipmentTrackingNumber || null,
        note: shipmentNote || null
      })
      setShipmentLines(Object.fromEntries(selectedOrder.items.map((item) => [item.id, '0'])))
      setShipmentCarrier('')
      setShipmentTrackingNumber('')
      setShipmentNote('')
      setShipmentSheetOpen(false)
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setSubmitting(null)
    }
  }

  const closeQuickCreate = () => {
    const emptyCustomer = emptyQuickCustomerDraft()
    const emptyProduct = emptyQuickProductDraft()
    setQuickCreateTarget(null)
    setQuickCreateError(null)
    setQuickCustomerDraft(emptyCustomer)
    setQuickCustomerInitialDraft(emptyCustomer)
    setQuickProductDraft(emptyProduct)
    setQuickProductInitialDraft(emptyProduct)
  }

  const openQuickCustomer = (name: string) => {
    const initialDraft = emptyQuickCustomerDraft(name)
    setQuickCreateError(null)
    setQuickCustomerDraft(initialDraft)
    setQuickCustomerInitialDraft(initialDraft)
    setQuickCreateTarget({ kind: 'customer' })
  }

  const openQuickProduct = (lineIndex: number, name: string) => {
    const initialDraft = emptyQuickProductDraft(name)
    setQuickCreateError(null)
    setQuickProductDraft(initialDraft)
    setQuickProductInitialDraft(initialDraft)
    setQuickCreateTarget({ kind: 'product', lineIndex })
  }

  const handleQuickCustomerCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setQuickSubmitting(true)
    setQuickCreateError(null)
    try {
      const customer = await createQuickCustomer(toQuickCustomerInput(quickCustomerDraft))
      setQuickCustomers((current) => mergeById(current, [customer]))
      setCreateCustomerId(customer.id)
      closeQuickCreate()
    } catch (submitError) {
      setQuickCreateError(getErrorMessage(submitError))
    } finally {
      setQuickSubmitting(false)
    }
  }

  const handleQuickProductCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (quickCreateTarget?.kind !== 'product') return
    setQuickSubmitting(true)
    setQuickCreateError(null)
    try {
      const product = await createQuickProduct(toQuickProductInput(quickProductDraft))
      setQuickProducts((current) => mergeById(current, [product]))
      setCreateLines((current) => current.map((line, index) => index === quickCreateTarget.lineIndex
        ? { ...line, productId: product.id, unitPrice: centsToYuan(product.basePriceCents) }
        : line))
      closeQuickCreate()
    } catch (submitError) {
      setQuickCreateError(getErrorMessage(submitError))
    } finally {
      setQuickSubmitting(false)
    }
  }

  const openOrderDetail = async (orderId: string) => {
    await selectOrder(orderId)
    setDetailView('overview')
    setWorkspaceMode('detail')
  }

  const openCreateWorkspace = () => {
    setError(null)
    setCreateLines([createLine(availableProducts[0])])
    setWorkspaceMode('create')
  }

  const returnToOrderList = () => {
    setError(null)
    setWorkspaceMode('list')
  }

  const baseDataReady = availableCustomers.length > 0 && availableProducts.length > 0

  return (
    <section className="yumi-page order-workspace-page">
      {workspaceMode === 'list' && (
        <>
          <YumiPageHeader
            actions={
              <YumiButton onClick={openCreateWorkspace} variant="primary">
                新建订单
              </YumiButton>
            }
            description="查看已有订单，并进入订单详情处理资金、分批发货与售后。"
            title="订单"
          />
          {error && <p className="yumi-form-error">{error}</p>}
          {loadError && <p className="yumi-form-error">{loadError}</p>}
          <div aria-label={`订单列表，共 ${orders.length} 张`} className="yumi-primary-list">
            {loading ? (
              <YumiEmptyState description="订单资料正在读取，请稍候。" title="正在加载订单…" />
            ) : orders.length ? (
              <YumiBusinessList>
                {orders.map((order) => (
                  <YumiBusinessListItem
                    key={order.id}
                    meta={`更新于 ${order.updatedAt.slice(0, 10)}`}
                    metrics={[
                      { label: '确认金额', value: formatCents(order.currentAmountCents) },
                      { label: '待收', value: formatCents(order.outstandingCents) }
                    ]}
                    onOpen={() => void openOrderDetail(order.id)}
                    status={
                      <YumiStatusTag tone={order.outstandingCents > 0 ? 'warning' : 'success'}>
                        {order.outstandingCents > 0 ? '待收款' : '已收齐'}
                      </YumiStatusTag>
                    }
                    summary={`${order.customerName} · 应收 ${formatCents(order.currentAmountCents)}`}
                    title={order.code}
                  />
                ))}
              </YumiBusinessList>
            ) : baseDataReady ? (
              <YumiEmptyState
                description="客户与商品已就绪；点击右上角“新建订单”后即可在这里继续处理。"
                scenario="first-use"
                title="还没有订单"
              />
            ) : (
              <OrderSetupGuide
                customersReady={availableCustomers.length > 0}
                productsReady={availableProducts.length > 0}
                onNavigateToBaseData={onNavigateToBaseData}
              />
            )}
          </div>
        </>
      )}

      {workspaceMode === 'create' && (
        <>
          <YumiPageHeader
            actions={
              <YumiButton onClick={returnToOrderList} variant="ghost">
                返回订单列表
              </YumiButton>
            }
            description="录入客户、多个商品行和确认金额；保存后直接进入订单详情。"
            title="新建订单"
          />
          {error && <p className="yumi-form-error">{error}</p>}
          {loadError && <p className="yumi-form-error">{loadError}</p>}
          {!baseDataReady ? (
            <OrderSetupGuide
              customersReady={availableCustomers.length > 0}
              productsReady={availableProducts.length > 0}
              onNavigateToBaseData={onNavigateToBaseData}
            />
          ) : (
            <form className="yumi-form-panel order-create-form" onSubmit={handleCreateOrder}>
              <div className="yumi-form-grid yumi-form-grid--two">
                <YumiField>
                  <YumiFieldLabel required>客户</YumiFieldLabel>
                  <YumiSearchSelect
                    aria-label="客户"
                    onValueChange={setCreateCustomerId}
                    options={availableCustomers.map((customer) => ({
                      value: customer.id,
                      label: customer.name,
                      searchText: `${customer.contact ?? ''}${customer.defaultAddress ?? ''}`
                    }))}
                    onCreate={openQuickCustomer}
                    placeholder="搜索或选择已有客户"
                    value={createCustomerId}
                  />
                </YumiField>
                <YumiField>
                  <YumiFieldLabel>预计发货日期</YumiFieldLabel>
                  <YumiDatePicker
                    aria-label="预计发货日期"
                    onValueChange={setExpectedShipDate}
                    value={expectedShipDate}
                  />
                </YumiField>
                <YumiField>
                  <YumiFieldLabel required>初始确认金额（元）</YumiFieldLabel>
                  <YumiNumberField
                    allowDecimal
                    aria-label="初始确认金额（元）"
                    min="0"
                    onChange={(event) => setInitialAmount(event.target.value)}
                    required
                    value={initialAmount}
                  />
                </YumiField>
              </div>
              <OrderLines
                title="订单商品"
                lines={createLines}
                onCreateProduct={openQuickProduct}
                products={availableProducts}
                onChange={(index, key, value) =>
                  updateLine(createLines, setCreateLines, index, key, value)
                }
                onAdd={() => setCreateLines([...createLines, createLine(availableProducts[0])])}
                onRemove={(index) =>
                  setCreateLines(createLines.filter((_, lineIndex) => lineIndex !== index))
                }
              />
              <YumiField>
                <YumiFieldLabel>订单备注</YumiFieldLabel>
                <YumiTextArea
                  aria-label="订单备注"
                  onChange={(event) => setCreateNotes(event.target.value)}
                  value={createNotes}
                />
              </YumiField>
              <div className="yumi-form-actions">
                <YumiButton loading={submitting === 'create'} type="submit" variant="primary">
                  {submitting === 'create' ? '创建中…' : '创建订单'}
                </YumiButton>
              </div>
            </form>
          )}
        </>
      )}

      {workspaceMode === 'detail' && selectedOrder && (
        <>
          <YumiPageHeader
            actions={
              <YumiButton onClick={returnToOrderList} variant="ghost">
                返回订单列表
              </YumiButton>
            }
            description="处理订单内容、资金、售后和分批发货。"
            title={selectedOrder.code}
          />
          {error && <p className="yumi-form-error">{error}</p>}
          {loadError && <p className="yumi-form-error">{loadError}</p>}
          <OrderDetail
            activeView={detailView}
            onViewChange={setDetailView}
            order={selectedOrder}
            funds={funds}
            shipments={shipments}
            contentChanges={contentChanges}
            products={availableProducts}
            contentLines={contentLines}
            setContentLines={setContentLines}
            contentDescription={contentDescription}
            setContentDescription={setContentDescription}
            contentDate={contentDate}
            setContentDate={setContentDate}
            adjustmentAmount={adjustmentAmount}
            setAdjustmentAmount={setAdjustmentAmount}
            adjustmentReason={adjustmentReason}
            setAdjustmentReason={setAdjustmentReason}
            fundType={fundType}
            setFundType={setFundType}
            fundAmount={fundAmount}
            setFundAmount={setFundAmount}
            fundDate={fundDate}
            setFundDate={setFundDate}
            fundMethod={fundMethod}
            setFundMethod={setFundMethod}
            fundNote={fundNote}
            setFundNote={setFundNote}
            correctionOriginalId={correctionOriginalId}
            setCorrectionOriginalId={setCorrectionOriginalId}
            correctionAmount={correctionAmount}
            setCorrectionAmount={setCorrectionAmount}
            correctionDate={correctionDate}
            setCorrectionDate={setCorrectionDate}
            correctionType={correctionType}
            setCorrectionType={setCorrectionType}
            shipmentDate={shipmentDate}
            setShipmentDate={setShipmentDate}
            shipmentLines={shipmentLines}
            setShipmentLines={setShipmentLines}
            shipmentCarrier={shipmentCarrier}
            setShipmentCarrier={setShipmentCarrier}
            shipmentTrackingNumber={shipmentTrackingNumber}
            setShipmentTrackingNumber={setShipmentTrackingNumber}
            shipmentNote={shipmentNote}
            setShipmentNote={setShipmentNote}
            shipmentSheetOpen={shipmentSheetOpen}
            setShipmentSheetOpen={setShipmentSheetOpen}
            shipmentAvailability={shipmentAvailability}
            submitting={submitting}
            updateContentLine={(index, key, value) =>
              updateLine(contentLines, setContentLines, index, key, value)
            }
            onAddContentLine={() => setContentLines([...contentLines, createLine(availableProducts[0])])}
            onRemoveContentLine={(index) =>
              setContentLines(contentLines.filter((_, lineIndex) => lineIndex !== index))
            }
            onContentChange={handleContentChange}
            onRecordFund={handleRecordFund}
            onCorrection={handleCorrection}
            onShipment={handleCreateShipment}
            listAfterSalesCases={listAfterSalesCases}
            createAfterSalesCase={createAfterSalesCase}
            updateCase={updateAfterSalesCase}
            linkCharge={linkAfterSalesCharge}
          />
        </>
      )}

      <YumiSheet
        description="建立后会自动选入当前订单草稿；关闭或保存失败都不会清空已填写的订单内容。"
        dirty={JSON.stringify(quickCustomerDraft) !== JSON.stringify(quickCustomerInitialDraft)}
        footer={<><YumiButton onClick={closeQuickCreate} variant="ghost">取消</YumiButton><YumiButton form="quick-customer-form" loading={quickSubmitting} type="submit" variant="primary">创建并选中客户</YumiButton></>}
        onOpenChange={(open) => { if (!open) closeQuickCreate() }}
        open={quickCreateTarget?.kind === 'customer'}
        title="新建客户"
      >
        <form className="yumi-form-panel yumi-sheet-form" id="quick-customer-form" onSubmit={handleQuickCustomerCreate}>
          <YumiField><YumiFieldLabel htmlFor="quick-customer-name" required>客户名称</YumiFieldLabel><YumiTextField id="quick-customer-name" onChange={(event) => setQuickCustomerDraft((current) => ({ ...current, name: event.target.value }))} required value={quickCustomerDraft.name} /></YumiField>
          <YumiField><YumiFieldLabel htmlFor="quick-customer-contact">联系人</YumiFieldLabel><YumiTextField id="quick-customer-contact" onChange={(event) => setQuickCustomerDraft((current) => ({ ...current, contact: event.target.value }))} value={quickCustomerDraft.contact} /></YumiField>
          <YumiField><YumiFieldLabel htmlFor="quick-customer-address">默认收货地址</YumiFieldLabel><YumiTextArea id="quick-customer-address" onChange={(event) => setQuickCustomerDraft((current) => ({ ...current, defaultAddress: event.target.value }))} value={quickCustomerDraft.defaultAddress} /></YumiField>
          <YumiField><YumiFieldLabel htmlFor="quick-customer-notes">备注</YumiFieldLabel><YumiTextArea id="quick-customer-notes" onChange={(event) => setQuickCustomerDraft((current) => ({ ...current, notes: event.target.value }))} value={quickCustomerDraft.notes} /></YumiField>
          {quickCreateError && <p className="yumi-feedback yumi-feedback--danger" role="alert">{quickCreateError}</p>}
        </form>
      </YumiSheet>

      <YumiSheet
        description="快捷建档只填写名称与本次订单的基础售价；其余成本和制作参数可在商品资料中继续维护。保存后会自动回填当前商品行。"
        dirty={JSON.stringify(quickProductDraft) !== JSON.stringify(quickProductInitialDraft)}
        footer={<><YumiButton onClick={closeQuickCreate} variant="ghost">取消</YumiButton><YumiButton form="quick-product-form" loading={quickSubmitting} type="submit" variant="primary">创建并选中商品</YumiButton></>}
        onOpenChange={(open) => { if (!open) closeQuickCreate() }}
        open={quickCreateTarget?.kind === 'product'}
        title="新建商品"
      >
        <form className="yumi-form-panel yumi-sheet-form" id="quick-product-form" onSubmit={handleQuickProductCreate}>
          <YumiField><YumiFieldLabel htmlFor="quick-product-name" required>商品名称</YumiFieldLabel><YumiTextField id="quick-product-name" onChange={(event) => setQuickProductDraft((current) => ({ ...current, name: event.target.value }))} required value={quickProductDraft.name} /></YumiField>
          <YumiField><YumiFieldLabel htmlFor="quick-product-base-price" required>基础售价（元）</YumiFieldLabel><YumiNumberField allowDecimal id="quick-product-base-price" min="0" onChange={(event) => setQuickProductDraft((current) => ({ ...current, basePrice: event.target.value }))} required value={quickProductDraft.basePrice} /></YumiField>
          {quickCreateError && <p className="yumi-feedback yumi-feedback--danger" role="alert">{quickCreateError}</p>}
        </form>
      </YumiSheet>

      {workspaceMode === 'detail' && !selectedOrder && (
        <YumiEmptyState description="订单详情正在读取，请稍候。" title="正在加载订单详情…" />
      )}
    </section>
  )
}

function OrderSetupGuide({
  customersReady,
  productsReady,
  onNavigateToBaseData
}: {
  customersReady: boolean
  productsReady: boolean
  onNavigateToBaseData: (view: 'customers' | 'products') => void
}) {
  return (
    <YumiEmptyState
      action={
        <div className="yumi-inline-actions">
          {!customersReady && (
            <YumiButton onClick={() => onNavigateToBaseData('customers')} variant="primary">
              先建立客户
            </YumiButton>
          )}
          {!productsReady && (
            <YumiButton onClick={() => onNavigateToBaseData('products')} variant="secondary">
              建立商品
            </YumiButton>
          )}
        </div>
      }
      description="创建订单前，需要至少有一位客户和一个商品。"
      scenario="prerequisite"
      title="先完成基础资料"
    />
  )
}

function OrderLines({
  title,
  lines,
  products,
  onChange,
  onAdd,
  onRemove,
  onCreateProduct
}: {
  title: string
  lines: OrderLineDraft[]
  products: V2Product[]
  onChange: (index: number, key: keyof OrderLineDraft, value: string) => void
  onAdd: () => void
  onRemove: (index: number) => void
  onCreateProduct?: (index: number, name: string) => void
}) {
  const options = products.map((product) => ({ value: product.id, label: product.name }))
  return (
    <fieldset className="yumi-line-editor">
      <legend>{title}</legend>
      {lines.map((line, index) => (
        <div className="yumi-order-line" key={`${line.productId}-${index}`}>
          <YumiField>
            <YumiFieldLabel required>商品</YumiFieldLabel>
            <YumiSearchSelect
              aria-label={`第 ${index + 1} 行商品`}
              onCreate={onCreateProduct ? (name) => onCreateProduct(index, name) : undefined}
              onValueChange={(value) => onChange(index, 'productId', value)}
              options={options}
              placeholder="选择商品"
              value={line.productId}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel required>数量</YumiFieldLabel>
            <YumiNumberField
              aria-label={`第 ${index + 1} 行数量`}
              min="1"
              onChange={(event) => onChange(index, 'quantity', event.target.value)}
              required
              value={line.quantity}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel required>单价（元）</YumiFieldLabel>
            <YumiNumberField
              allowDecimal
              aria-label={`第 ${index + 1} 行单价`}
              min="0"
              onChange={(event) => onChange(index, 'unitPrice', event.target.value)}
              required
              value={line.unitPrice}
            />
          </YumiField>
          <YumiButton disabled={lines.length === 1} onClick={() => onRemove(index)} variant="ghost">
            移除
          </YumiButton>
        </div>
      ))}
      <YumiButton onClick={onAdd} variant="secondary">
        添加商品行
      </YumiButton>
    </fieldset>
  )
}


function OrderDetail(props: {
  activeView: OrderDetailView
  onViewChange: (view: OrderDetailView) => void
  order: V2Order
  funds: ReturnType<typeof useOrders>['funds']
  shipments: ReturnType<typeof useOrders>['shipments']
  contentChanges: ReturnType<typeof useOrders>['contentChanges']
  products: V2Product[]
  contentLines: OrderLineDraft[]
  setContentLines: (value: OrderLineDraft[]) => void
  contentDescription: string
  setContentDescription: (value: string) => void
  contentDate: string
  setContentDate: (value: string) => void
  adjustmentAmount: string
  setAdjustmentAmount: (value: string) => void
  adjustmentReason: string
  setAdjustmentReason: (value: string) => void
  fundType: V2OrderFundBusinessType
  setFundType: (value: V2OrderFundBusinessType) => void
  fundAmount: string
  setFundAmount: (value: string) => void
  fundDate: string
  setFundDate: (value: string) => void
  fundMethod: string
  setFundMethod: (value: string) => void
  fundNote: string
  setFundNote: (value: string) => void
  correctionOriginalId: string
  setCorrectionOriginalId: (value: string) => void
  correctionAmount: string
  setCorrectionAmount: (value: string) => void
  correctionDate: string
  setCorrectionDate: (value: string) => void
  correctionType: V2OrderFundBusinessType
  setCorrectionType: (value: V2OrderFundBusinessType) => void
  shipmentDate: string
  setShipmentDate: (value: string) => void
  shipmentLines: Record<string, string>
  setShipmentLines: (value: Record<string, string>) => void
  shipmentCarrier: string
  setShipmentCarrier: (value: string) => void
  shipmentTrackingNumber: string
  setShipmentTrackingNumber: (value: string) => void
  shipmentNote: string
  setShipmentNote: (value: string) => void
  shipmentSheetOpen: boolean
  setShipmentSheetOpen: (open: boolean) => void
  shipmentAvailability: ReturnType<typeof buildShipmentItemAvailability>
  submitting: string | null
  listAfterSalesCases: ReturnType<typeof useFinance>['listAfterSalesCases']
  createAfterSalesCase: ReturnType<typeof useFinance>['createAfterSalesCase']
  updateCase: ReturnType<typeof useFinance>['updateAfterSalesCase']
  linkCharge: ReturnType<typeof useFinance>['linkAfterSalesCharge']
  updateContentLine: (index: number, key: keyof OrderLineDraft, value: string) => void
  onAddContentLine: () => void
  onRemoveContentLine: (index: number) => void
  onContentChange: (event: FormEvent<HTMLFormElement>) => void
  onRecordFund: (event: FormEvent<HTMLFormElement>) => void
  onCorrection: (event: FormEvent<HTMLFormElement>) => void
  onShipment: (event: FormEvent<HTMLFormElement>) => void
}) {
  const { activeView, order, funds, shipments, contentChanges, products, shipmentAvailability } =
    props
  const detailViews: Array<{ id: OrderDetailView; label: string }> = [
    { id: 'overview', label: '概览' },
    { id: 'fulfillment', label: '履约' },
    { id: 'funds', label: '资金' },
    { id: 'after_sales', label: '售后' }
  ]
  const getShipmentSummary = (shipment: (typeof shipments)[number]) =>
    shipment.items
      .map((line) => {
        const item = order.items.find((candidate) => candidate.id === line.orderItemId)
        return `${item?.productSnapshot.name ?? '商品'} × ${line.quantity}`
      })
      .join('、')

  return (
    <div className="yumi-order-detail-stack">
      <section className="yumi-order-summary">
        <div>
          <h2>{order.code}</h2>
          <p>
            {order.customerSnapshot.name} ·{' '}
            {order.expectedShipDate ? `预计 ${order.expectedShipDate} 发货` : '未设预计发货日期'}
          </p>
        </div>
        <YumiStatusTag tone={order.funds.outstandingCents > 0 ? 'warning' : 'success'}>
          {order.funds.outstandingCents > 0
            ? `待收 ${formatCents(order.funds.outstandingCents)}`
            : '已收齐'}
        </YumiStatusTag>
        <div className="yumi-order-stat-grid">
          <span>
            当前确认金额<strong>{formatCents(order.amount.currentAmountCents)}</strong>
          </span>
          <span>
            累计收款<strong>{formatCents(order.funds.netReceivedCents)}</strong>
          </span>
          <span>
            金额调整<strong>{formatCents(order.amount.adjustmentsCents)}</strong>
          </span>
        </div>
      </section>

      <nav aria-label="订单详情工作视图" className="yumi-page-tabs">
        {detailViews.map((view) => (
          <YumiButton
            aria-pressed={activeView === view.id}
            key={view.id}
            onClick={() => props.onViewChange(view.id)}
            variant={activeView === view.id ? 'primary' : 'ghost'}
          >
            {view.label}
          </YumiButton>
        ))}
      </nav>

      {activeView === 'overview' && (
        <>
          <YumiSection
            description="订单基础信息与内容变更只在这里处理，不与发货、资金和售后表单同时出现。"
            title="订单内容"
          >
            <div className="yumi-order-simple-lines">
              {order.items.map((item) => (
                <p key={item.id}>
                  {item.productSnapshot.name} × {item.quantity} · {formatCents(item.unitPriceCents)}
                </p>
              ))}
            </div>
          </YumiSection>
          <form className="yumi-form-panel" onSubmit={props.onContentChange}>
            <h2 className="yumi-form-panel__title">订单内容变更</h2>
            <div className="yumi-form-grid yumi-form-grid--two">
              <YumiField>
                <YumiFieldLabel required>变更日期</YumiFieldLabel>
                <YumiDatePicker
                  aria-label="变更日期"
                  onValueChange={props.setContentDate}
                  value={props.contentDate}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel required>变更说明</YumiFieldLabel>
                <YumiTextField
                  onChange={(event) => props.setContentDescription(event.target.value)}
                  required
                  value={props.contentDescription}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel>金额调整（元，可正可负）</YumiFieldLabel>
                <YumiNumberField
                  allowDecimal
                  onChange={(event) => props.setAdjustmentAmount(event.target.value)}
                  value={props.adjustmentAmount}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel required={Boolean(props.adjustmentAmount)}>
                  金额调整原因
                </YumiFieldLabel>
                <YumiTextField
                  onChange={(event) => props.setAdjustmentReason(event.target.value)}
                  required={Boolean(props.adjustmentAmount)}
                  value={props.adjustmentReason}
                />
              </YumiField>
            </div>
            <OrderLines
              title="变更后的商品"
              lines={props.contentLines}
              products={products}
              onChange={props.updateContentLine}
              onAdd={props.onAddContentLine}
              onRemove={props.onRemoveContentLine}
            />
            <div className="yumi-form-actions">
              <YumiButton loading={props.submitting === 'content'} type="submit" variant="primary">
                保存内容变更
              </YumiButton>
            </div>
            {contentChanges.length > 0 && (
              <p className="yumi-form-hint">
                已记录 {contentChanges.length} 次内容变更，历史不会被覆盖。
              </p>
            )}
          </form>
        </>
      )}

      {activeView === 'fulfillment' && (
        <>
          <YumiSection
            description="每次发货只登记这一批；订单未发完时，后续可继续新增批次。历史批次只读。"
            title="发货批次"
          >
            <div className="yumi-form-actions yumi-form-actions--between">
              <p className="yumi-form-hint">
                同一批可选择多个商品；系统会按每个商品当前可发数量校验。
              </p>
              <YumiButton onClick={() => props.setShipmentSheetOpen(true)} variant="primary">
                新增发货
              </YumiButton>
            </div>
            {shipments.length === 0 ? (
              <div className="yumi-empty">尚未登记发货批次。</div>
            ) : (
              <YumiBusinessList>
                {shipments.map((shipment) => (
                  <YumiBusinessListItem
                    key={shipment.id}
                    meta={shipment.trackingNumber ?? '未填写运单号'}
                    metrics={[
                      {
                        label: '本批商品',
                        value: shipment.items.reduce((sum, item) => sum + item.quantity, 0)
                      }
                    ]}
                    status={<YumiStatusTag tone="success">已发货</YumiStatusTag>}
                    summary={getShipmentSummary(shipment)}
                    title={`${shipment.shippedOn} · ${shipment.carrier ?? '未填写承运商'}`}
                  />
                ))}
              </YumiBusinessList>
            )}
          </YumiSection>
          <YumiSheet
            description="选择本批要发的商品和数量；只有已完成打包、进入待发货的数量可以登记发货。"
            dirty={
              Object.values(props.shipmentLines).some((value) => Number(value) > 0) ||
              Boolean(props.shipmentCarrier || props.shipmentTrackingNumber || props.shipmentNote)
            }
            onOpenChange={props.setShipmentSheetOpen}
            open={props.shipmentSheetOpen}
            title="登记分批发货"
          >
            <form className="yumi-form-panel" onSubmit={props.onShipment}>
              <div className="yumi-form-grid yumi-form-grid--three">
                <YumiField>
                  <YumiFieldLabel required>发货日期</YumiFieldLabel>
                  <YumiDatePicker
                    aria-label="发货日期"
                    onValueChange={props.setShipmentDate}
                    value={props.shipmentDate}
                  />
                </YumiField>
                <YumiField>
                  <YumiFieldLabel>承运商</YumiFieldLabel>
                  <YumiTextField
                    onChange={(event) => props.setShipmentCarrier(event.target.value)}
                    value={props.shipmentCarrier}
                  />
                </YumiField>
                <YumiField>
                  <YumiFieldLabel>运单号</YumiFieldLabel>
                  <YumiTextField
                    onChange={(event) => props.setShipmentTrackingNumber(event.target.value)}
                    value={props.shipmentTrackingNumber}
                  />
                </YumiField>
              </div>
              <div className="yumi-shipment-lines">
                {order.items.map((item) => {
                  const availability = shipmentAvailability.find(
                    (candidate) => candidate.orderItemId === item.id
                  )
                  const availableQuantity = availability?.availableQuantity ?? 0
                  return (
                    <div key={item.id}>
                      <strong>{item.productSnapshot.name}</strong>
                      <span>确认 {availability?.confirmedQuantity ?? item.quantity}</span>
                      <span>累计已发 {availability?.shippedQuantity ?? 0}</span>
                      <span>待发 {availability?.remainingQuantity ?? item.quantity}</span>
                      <span>当前可发 {availableQuantity}</span>
                      <YumiNumberField
                        aria-label={`${item.productSnapshot.name} 本次发货数量`}
                        max={availableQuantity}
                        min="0"
                        onChange={(event) =>
                          props.setShipmentLines({
                            ...props.shipmentLines,
                            [item.id]: event.target.value
                          })
                        }
                        value={props.shipmentLines[item.id] ?? '0'}
                      />
                    </div>
                  )
                })}
              </div>
              <YumiField>
                <YumiFieldLabel>发货备注</YumiFieldLabel>
                <YumiTextArea
                  onChange={(event) => props.setShipmentNote(event.target.value)}
                  value={props.shipmentNote}
                />
              </YumiField>
              <div className="yumi-form-actions yumi-form-actions--between">
                <p className="yumi-form-hint">
                  同一批可选择多个商品；提交后会保留为只读的历史批次。
                </p>
                <YumiButton
                  loading={props.submitting === 'shipment'}
                  type="submit"
                  variant="primary"
                >
                  {props.submitting === 'shipment' ? '登记中…' : '确认登记发货'}
                </YumiButton>
              </div>
            </form>
          </YumiSheet>
        </>
      )}

      {activeView === 'funds' && (
        <>
          <YumiSection
            description="资金登记与冲正都只在资金视图处理，订单金额与已登记流水会保留历史。"
            title="订单资金"
          >
            {funds.length === 0 ? (
              <div className="yumi-empty">尚未登记订单资金流水。</div>
            ) : (
              <YumiBusinessList>
                {funds.map((fund) => (
                  <YumiBusinessListItem
                    key={fund.id}
                    meta={fund.paymentMethod ?? '未填写支付方式'}
                    metrics={[
                      {
                        label: fund.direction === 'in' ? '流入' : '流出',
                        value: formatCents(fund.amountCents)
                      }
                    ]}
                    status={
                      <YumiStatusTag
                        tone={
                          fund.reversalOfEntryId
                            ? 'neutral'
                            : fund.direction === 'in'
                              ? 'success'
                              : 'warning'
                        }
                      >
                        {fund.reversalOfEntryId
                          ? '冲正记录'
                          : fund.businessType === 'payment'
                            ? '收款'
                            : fund.businessType === 'refund'
                              ? '退款'
                              : '售后收费'}
                      </YumiStatusTag>
                    }
                    summary={fund.note ?? '无备注'}
                    title={fund.occurredOn}
                  />
                ))}
              </YumiBusinessList>
            )}
          </YumiSection>
          <div className="yumi-detail-grid">
            <form className="yumi-form-panel" onSubmit={props.onRecordFund}>
              <h2 className="yumi-form-panel__title">收款 / 退款</h2>
              <YumiField>
                <YumiFieldLabel>业务类型</YumiFieldLabel>
                <FundTypeSelect
                  ariaLabel="业务类型"
                  onValueChange={props.setFundType}
                  value={props.fundType}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel required>金额（元）</YumiFieldLabel>
                <YumiNumberField
                  allowDecimal
                  min="0.01"
                  onChange={(event) => props.setFundAmount(event.target.value)}
                  required
                  value={props.fundAmount}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel required>发生日期</YumiFieldLabel>
                <YumiDatePicker
                  aria-label="发生日期"
                  onValueChange={props.setFundDate}
                  value={props.fundDate}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel>支付方式</YumiFieldLabel>
                <YumiTextField
                  onChange={(event) => props.setFundMethod(event.target.value)}
                  value={props.fundMethod}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel>备注</YumiFieldLabel>
                <YumiTextArea
                  onChange={(event) => props.setFundNote(event.target.value)}
                  value={props.fundNote}
                />
              </YumiField>
              <div className="yumi-form-actions">
                <YumiButton loading={props.submitting === 'fund'} type="submit" variant="primary">
                  登记资金
                </YumiButton>
              </div>
            </form>
            <form className="yumi-form-panel" onSubmit={props.onCorrection}>
              <h2 className="yumi-form-panel__title">冲正并更正</h2>
              <YumiField>
                <YumiFieldLabel required>原资金流水</YumiFieldLabel>
                <YumiSelect
                  aria-label="原资金流水"
                  onValueChange={props.setCorrectionOriginalId}
                  options={funds
                    .filter((fund) => !fund.reversalOfEntryId)
                    .map((fund) => ({
                      value: fund.id,
                      label: `${fund.businessType} · ${formatCents(fund.amountCents)} · ${fund.occurredOn}`
                    }))}
                  placeholder="请选择"
                  value={props.correctionOriginalId}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel>替代类型</YumiFieldLabel>
                <FundTypeSelect
                  ariaLabel="替代类型"
                  onValueChange={props.setCorrectionType}
                  value={props.correctionType}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel required>替代金额（元）</YumiFieldLabel>
                <YumiNumberField
                  allowDecimal
                  min="0.01"
                  onChange={(event) => props.setCorrectionAmount(event.target.value)}
                  required
                  value={props.correctionAmount}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel required>冲正日期</YumiFieldLabel>
                <YumiDatePicker
                  aria-label="冲正日期"
                  onValueChange={props.setCorrectionDate}
                  value={props.correctionDate}
                />
              </YumiField>
              <div className="yumi-form-actions">
                <YumiButton
                  loading={props.submitting === 'correction'}
                  type="submit"
                  variant="danger"
                >
                  冲正并更正
                </YumiButton>
              </div>
            </form>
          </div>
        </>
      )}

      {activeView === 'after_sales' && (
        <AfterSalesPanel
          orderId={order.id}
          shipments={shipments}
          funds={funds}
          listCases={props.listAfterSalesCases}
          createCase={props.createAfterSalesCase}
          updateCase={props.updateCase}
          linkCharge={props.linkCharge}
        />
      )}
    </div>
  )
}
