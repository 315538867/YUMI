import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type {
  V2Customer,
  V2CustomerInput,
  V2NavigationTarget,
  V2Order,
  V2OrderFundBusinessType,
  V2AttachmentReference,
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
import { useStudioSettings } from '../../composables/use-studio-settings'
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
  YumiTextField,
  useYumiNotificationMessage
} from '../../components/ui'

interface OrderLineDraft {
  productId: string
  quantity: string
  unitPrice: string
  edgeEnabled: boolean
  edgeQuantity: string
  edgeUnitPrice: string
  itemDiscount: string
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
  unitPrice: product ? centsToYuan(product.basePriceCents) : '0',
  edgeEnabled: false,
  edgeQuantity: '0',
  edgeUnitPrice: '0',
  itemDiscount: '0'
})
const itemToDraft = (item: V2OrderItem): OrderLineDraft => ({
  productId: item.productId ?? '',
  quantity: String(item.quantity),
  unitPrice: centsToYuan(item.unitPriceCents),
  edgeEnabled: item.edgeEnabled ?? false,
  edgeQuantity: String(item.edgeQuantity ?? 0),
  edgeUnitPrice: centsToYuan(item.edgeUnitPriceCents ?? 0),
  itemDiscount: centsToYuan(item.itemDiscountCents ?? 0)
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

type QuickCreateTarget = { kind: 'customer' } | { kind: 'product'; lineIndex: number } | null

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
  internalEdgeCostCents: 0,
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
    pickFundProof,
    discardPreparedFundProof,
    attachFundProof,
    openFundProof,
    createShipment,
    exportOrderTable,
    exportOrderDocuments,
    exportShippingList
  } = useOrders()
  const { createCustomer: createQuickCustomer } = useCustomers()
  const { createProduct: createQuickProduct } = useProducts()
  const { listAfterSalesCases, createAfterSalesCase, updateAfterSalesCase, linkAfterSalesCharge } =
    useFinance()
  const studio = useStudioSettings()
  const [workspaceMode, setWorkspaceMode] = useState<OrderWorkspaceMode>('list')
  const [detailView, setDetailView] = useState<OrderDetailView>('overview')
  const [createCustomerId, setCreateCustomerId] = useState('')
  const [createLines, setCreateLines] = useState<OrderLineDraft[]>([createLine()])
  const [createOrderDiscount, setCreateOrderDiscount] = useState('0')
  const [expectedShipDate, setExpectedShipDate] = useState('')
  const [createReservedDays, setCreateReservedDays] = useState('2')
  const [createNotes, setCreateNotes] = useState('')
  const [contentLines, setContentLines] = useState<OrderLineDraft[]>([])
  const [contentDescription, setContentDescription] = useState('')
  const [contentOrderDiscount, setContentOrderDiscount] = useState('0')
  const [contentEditorOpen, setContentEditorOpen] = useState(false)
  const [contentDate, setContentDate] = useState(today())
  const [adjustmentAmount, setAdjustmentAmount] = useState('')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [fundType, setFundType] = useState<V2OrderFundBusinessType>('payment')
  const [fundAmount, setFundAmount] = useState('')
  const [fundDate, setFundDate] = useState(today())
  const [fundMethod, setFundMethod] = useState('')
  const [fundNote, setFundNote] = useState('')
  const [pendingFundProof, setPendingFundProof] = useState<V2AttachmentReference | null>(null)
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
  const [quickCustomerDraft, setQuickCustomerDraft] =
    useState<QuickCustomerDraft>(emptyQuickCustomerDraft)
  const [quickCustomerInitialDraft, setQuickCustomerInitialDraft] =
    useState<QuickCustomerDraft>(emptyQuickCustomerDraft)
  const [quickProductDraft, setQuickProductDraft] =
    useState<QuickProductDraft>(emptyQuickProductDraft)
  const [quickProductInitialDraft, setQuickProductInitialDraft] =
    useState<QuickProductDraft>(emptyQuickProductDraft)
  const [quickCreateError, setQuickCreateError] = useState<string | null>(null)
  const [quickSubmitting, setQuickSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [submitting, setSubmitting] = useState<string | null>(null)
  useYumiNotificationMessage(loadError)
  useYumiNotificationMessage(error)
  useYumiNotificationMessage(quickCreateError)
  useYumiNotificationMessage(exportMessage, {
    tone: exportMessage?.startsWith('已导出')
      ? 'success'
      : exportMessage?.startsWith('已取消')
        ? 'info'
        : 'danger',
    timeout: exportMessage?.startsWith('已导出')
      ? 5000
      : exportMessage?.startsWith('已取消')
        ? 3000
        : undefined
  })

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
    setContentEditorOpen(false)
    setContentOrderDiscount(centsToYuan(selectedOrder.amount.orderDiscountCents ?? 0))
    setAdjustmentAmount('')
    setAdjustmentReason('')
    setCorrectionOriginalId('')
    setShipmentLines(Object.fromEntries(selectedOrder.items.map((item) => [item.id, '0'])))
  }, [selectedOrder])

  const availableCustomers = useMemo(
    () => mergeById(customers, quickCustomers),
    [customers, quickCustomers]
  )
  const availableProducts = useMemo(
    () => mergeById(products, quickProducts),
    [products, quickProducts]
  )

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
    const previousLine = nextLines[index]
    nextLines[index] = { ...previousLine, [key]: value }
    if (key === 'productId') {
      const product = availableProducts.find((candidate) => candidate.id === value)
      if (product) nextLines[index].unitPrice = centsToYuan(product.basePriceCents)
    }
    if (key === 'edgeEnabled') {
      nextLines[index].edgeEnabled = value === 'true'
      nextLines[index].edgeQuantity = value === 'true' ? nextLines[index].quantity : '0'
      if (value !== 'true') nextLines[index].edgeUnitPrice = '0'
    }
    if (
      key === 'quantity' &&
      previousLine.edgeEnabled &&
      previousLine.edgeQuantity === previousLine.quantity
    ) {
      nextLines[index].edgeQuantity = value
    }
    setLines(nextLines)
  }

  const toItems = (lines: OrderLineDraft[]) =>
    lines.map((line) => ({
      productId: line.productId,
      quantity: Math.round(Number(line.quantity)),
      unitPriceCents: yuanToCents(line.unitPrice),
      edge: {
        enabled: line.edgeEnabled,
        quantity: Math.round(Number(line.edgeQuantity)),
        unitPriceCents: yuanToCents(line.edgeUnitPrice)
      },
      itemDiscountCents: yuanToCents(line.itemDiscount)
    }))

  const validateLines = (lines: OrderLineDraft[]) => {
    if (
      !lines.length ||
      lines.some(
        (line) =>
          !line.productId ||
          Number(line.quantity) < 1 ||
          Number(line.unitPrice) < 0 ||
          Number(line.edgeQuantity) < 0 ||
          Number(line.edgeUnitPrice) < 0 ||
          Number(line.itemDiscount) < 0
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
        orderDiscountCents: yuanToCents(createOrderDiscount),
        expectedShipDate: expectedShipDate || null,
        reservedDays: Number(createReservedDays),
        notes: createNotes || null
      })
      setCreateCustomerId('')
      setCreateLines([createLine(availableProducts[0])])
      setCreateOrderDiscount('0')
      setExpectedShipDate('')
      setCreateReservedDays(String(studio.settings?.orderReservedDays ?? 2))
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
        orderDiscountCents: yuanToCents(contentOrderDiscount),
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
      setContentEditorOpen(false)
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setSubmitting(null)
    }
  }

  const handlePickFundProof = async () => {
    try {
      const proof = await pickFundProof()
      if (proof) setPendingFundProof(proof)
    } catch (pickError) {
      setError(getErrorMessage(pickError))
    }
  }

  const handleOpenFundProof = async (fundId: string) => {
    try {
      const result = await openFundProof(fundId)
      if (result.status === 'missing') setError('收款凭证文件已缺失，请重新关联凭证')
      else if (result.status === 'failed') setError(result.message ?? '收款凭证打开失败')
      else if (result.status === 'none') setError('该资金流水尚未关联凭证')
    } catch (openError) {
      setError(getErrorMessage(openError))
    }
  }

  const handleReplaceFundProof = async (fundId: string) => {
    try {
      const proof = await pickFundProof()
      if (proof) {
        await attachFundProof(fundId, proof.id)
        await selectOrder(selectedOrder!.id)
      }
    } catch (replaceError) {
      setError(getErrorMessage(replaceError))
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
        attachmentId: fundType === 'payment' ? (pendingFundProof?.id ?? null) : null,
        note: fundNote || null
      })
      setFundAmount('')
      setFundMethod('')
      setFundNote('')
      setPendingFundProof(null)
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
      setCreateLines((current) =>
        current.map((line, index) =>
          index === quickCreateTarget.lineIndex
            ? { ...line, productId: product.id, unitPrice: centsToYuan(product.basePriceCents) }
            : line
        )
      )
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
    setCreateReservedDays(String(studio.settings?.orderReservedDays ?? 2))
    setWorkspaceMode('create')
  }

  const returnToOrderList = () => {
    setError(null)
    setWorkspaceMode('list')
  }

  const exportOrderFile = async (
    kind: 'order-table' | 'shipping-list' | 'combined',
    shipmentId?: string
  ) => {
    setExporting(true)
    setExportMessage(null)
    try {
      const result =
        kind === 'order-table'
          ? await exportOrderTable(selectedOrder?.id)
          : kind === 'combined'
            ? selectedOrder
              ? await exportOrderDocuments(selectedOrder.id, shipmentId)
              : await Promise.reject(new Error('订单详情尚未加载完成'))
            : await exportShippingList(selectedOrder?.id, shipmentId)
      const label =
        kind === 'order-table'
          ? '订单表'
          : kind === 'shipping-list'
            ? '发货清单'
            : '订单表与发货清单'
      setExportMessage(result.savedPath ? `已导出${label}：${result.savedPath}` : '已取消导出。')
    } catch (cause) {
      setExportMessage(getErrorMessage(cause))
    } finally {
      setExporting(false)
    }
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
                      { label: '订单金额', value: formatCents(order.currentAmountCents) },
                      { label: '待收', value: formatCents(order.outstandingCents) }
                    ]}
                    onOpen={() => void openOrderDetail(order.id)}
                    status={
                      <YumiStatusTag tone={order.outstandingCents > 0 ? 'warning' : 'success'}>
                        {order.outstandingCents > 0 ? '待收款' : '已收齐'}
                      </YumiStatusTag>
                    }
                    summary={`${order.customerName} · 订单金额 ${formatCents(order.currentAmountCents)}`}
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
            description="录入客户、多个商品行和订单金额组成项；保存后进入订单详情。"
            title="新建订单"
          />
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
                  <YumiFieldLabel>预留制作天数</YumiFieldLabel>
                  <YumiNumberField
                    aria-label="预留制作天数"
                    hint="默认来自工作室参数；可按本订单实际情况修改。"
                    min="0"
                    onChange={(event) => setCreateReservedDays(event.target.value)}
                    step="1"
                    value={createReservedDays}
                  />
                </YumiField>
                <YumiField>
                  <YumiFieldLabel>订单优惠（元）</YumiFieldLabel>
                  <YumiNumberField
                    allowDecimal
                    aria-label="订单优惠（元）"
                    min="0"
                    onChange={(event) => setCreateOrderDiscount(event.target.value)}
                    value={createOrderDiscount}
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
            contentEditorOpen={contentEditorOpen}
            setContentEditorOpen={setContentEditorOpen}
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
            pendingFundProof={pendingFundProof}
            onPickFundProof={() => void handlePickFundProof()}
            onClearFundProof={() => {
              if (pendingFundProof) void discardPreparedFundProof(pendingFundProof.id)
              setPendingFundProof(null)
            }}
            onOpenFundProof={(fundId) => void handleOpenFundProof(fundId)}
            onReplaceFundProof={(fundId) => void handleReplaceFundProof(fundId)}
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
            onAddContentLine={() =>
              setContentLines([...contentLines, createLine(availableProducts[0])])
            }
            onRemoveContentLine={(index) =>
              setContentLines(contentLines.filter((_, lineIndex) => lineIndex !== index))
            }
            onContentChange={handleContentChange}
            onRecordFund={handleRecordFund}
            onCorrection={handleCorrection}
            onShipment={handleCreateShipment}
            exporting={exporting}
            onExportOrderTable={() => void exportOrderFile('order-table')}
            onExportOrderDocuments={() => void exportOrderFile('combined')}
            onExportShippingList={(shipmentId) => void exportOrderFile('shipping-list', shipmentId)}
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
        footer={
          <>
            <YumiButton onClick={closeQuickCreate} variant="ghost">
              取消
            </YumiButton>
            <YumiButton
              form="quick-customer-form"
              loading={quickSubmitting}
              type="submit"
              variant="primary"
            >
              创建并选中客户
            </YumiButton>
          </>
        }
        onOpenChange={(open) => {
          if (!open) closeQuickCreate()
        }}
        open={quickCreateTarget?.kind === 'customer'}
        title="新建客户"
      >
        <form
          className="yumi-form-panel yumi-sheet-form"
          id="quick-customer-form"
          onSubmit={handleQuickCustomerCreate}
        >
          <YumiField>
            <YumiFieldLabel htmlFor="quick-customer-name" required>
              客户名称
            </YumiFieldLabel>
            <YumiTextField
              id="quick-customer-name"
              onChange={(event) =>
                setQuickCustomerDraft((current) => ({ ...current, name: event.target.value }))
              }
              required
              value={quickCustomerDraft.name}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel htmlFor="quick-customer-contact">联系人</YumiFieldLabel>
            <YumiTextField
              id="quick-customer-contact"
              onChange={(event) =>
                setQuickCustomerDraft((current) => ({ ...current, contact: event.target.value }))
              }
              value={quickCustomerDraft.contact}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel htmlFor="quick-customer-address">默认收货地址</YumiFieldLabel>
            <YumiTextArea
              id="quick-customer-address"
              onChange={(event) =>
                setQuickCustomerDraft((current) => ({
                  ...current,
                  defaultAddress: event.target.value
                }))
              }
              value={quickCustomerDraft.defaultAddress}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel htmlFor="quick-customer-notes">备注</YumiFieldLabel>
            <YumiTextArea
              id="quick-customer-notes"
              onChange={(event) =>
                setQuickCustomerDraft((current) => ({ ...current, notes: event.target.value }))
              }
              value={quickCustomerDraft.notes}
            />
          </YumiField>
        </form>
      </YumiSheet>

      <YumiSheet
        description="快捷建档只填写名称与本次订单的基础售价；其余成本和制作参数可在商品资料中继续维护。保存后会自动回填当前商品行。"
        dirty={JSON.stringify(quickProductDraft) !== JSON.stringify(quickProductInitialDraft)}
        footer={
          <>
            <YumiButton onClick={closeQuickCreate} variant="ghost">
              取消
            </YumiButton>
            <YumiButton
              form="quick-product-form"
              loading={quickSubmitting}
              type="submit"
              variant="primary"
            >
              创建并选中商品
            </YumiButton>
          </>
        }
        onOpenChange={(open) => {
          if (!open) closeQuickCreate()
        }}
        open={quickCreateTarget?.kind === 'product'}
        title="新建商品"
      >
        <form
          className="yumi-form-panel yumi-sheet-form"
          id="quick-product-form"
          onSubmit={handleQuickProductCreate}
        >
          <YumiField>
            <YumiFieldLabel htmlFor="quick-product-name" required>
              商品名称
            </YumiFieldLabel>
            <YumiTextField
              id="quick-product-name"
              onChange={(event) =>
                setQuickProductDraft((current) => ({ ...current, name: event.target.value }))
              }
              required
              value={quickProductDraft.name}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel htmlFor="quick-product-base-price" required>
              基础售价（元）
            </YumiFieldLabel>
            <YumiNumberField
              allowDecimal
              id="quick-product-base-price"
              min="0"
              onChange={(event) =>
                setQuickProductDraft((current) => ({ ...current, basePrice: event.target.value }))
              }
              required
              value={quickProductDraft.basePrice}
            />
          </YumiField>
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
          <YumiField>
            <YumiFieldLabel>缝边</YumiFieldLabel>
            <label>
              <input
                aria-label={`第 ${index + 1} 行缝边`}
                checked={line.edgeEnabled}
                onChange={(event) => onChange(index, 'edgeEnabled', String(event.target.checked))}
                type="checkbox"
              />
              启用缝边
            </label>
          </YumiField>
          {line.edgeEnabled && (
            <>
              <YumiField>
                <YumiFieldLabel>缝边数量</YumiFieldLabel>
                <YumiNumberField
                  aria-label={`第 ${index + 1} 行缝边数量`}
                  max={line.quantity}
                  min="1"
                  onChange={(event) => onChange(index, 'edgeQuantity', event.target.value)}
                  required
                  value={line.edgeQuantity}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel>缝边单价（元）</YumiFieldLabel>
                <YumiNumberField
                  allowDecimal
                  aria-label={`第 ${index + 1} 行缝边单价`}
                  min="0"
                  onChange={(event) => onChange(index, 'edgeUnitPrice', event.target.value)}
                  value={line.edgeUnitPrice}
                />
              </YumiField>
            </>
          )}
          <YumiField>
            <YumiFieldLabel>明细优惠（元）</YumiFieldLabel>
            <YumiNumberField
              allowDecimal
              aria-label={`第 ${index + 1} 行明细优惠`}
              min="0"
              onChange={(event) => onChange(index, 'itemDiscount', event.target.value)}
              value={line.itemDiscount}
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
  contentEditorOpen: boolean
  setContentEditorOpen: (open: boolean) => void
  contentOrderDiscount: string
  setContentOrderDiscount: (value: string) => void
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
  pendingFundProof: V2AttachmentReference | null
  onPickFundProof: () => void
  onClearFundProof: () => void
  onOpenFundProof: (fundId: string) => void
  onReplaceFundProof: (fundId: string) => void
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
  exporting: boolean
  onExportOrderTable: () => void
  onExportOrderDocuments: () => void
  onExportShippingList: (shipmentId?: string) => void
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
            {order.expectedShipDate
              ? `预计 ${order.expectedShipDate} 发货 · 制作截止 ${order.productionDeadline ?? '未计算'}`
              : '未设预计发货日期'}
          </p>
        </div>
        <YumiStatusTag tone={order.funds.outstandingCents > 0 ? 'warning' : 'success'}>
          {order.funds.outstandingCents > 0
            ? `待收 ${formatCents(order.funds.outstandingCents)}`
            : '已收齐'}
        </YumiStatusTag>
        <div className="yumi-order-stat-grid">
          <span>
            预留制作<strong>{order.reservedDays} 天</strong>
          </span>
          <span>
            订单金额
            <strong>
              {formatCents(order.amount.orderAmountCents ?? order.amount.currentAmountCents)}
            </strong>
          </span>
          <span>
            累计收款<strong>{formatCents(order.funds.netReceivedCents)}</strong>
          </span>
          <span>
            调整后应收<strong>{formatCents(order.amount.currentAmountCents)}</strong>
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
          <div className="yumi-form-actions yumi-form-actions--end">
            <YumiButton
              disabled={props.exporting}
              onClick={props.onExportOrderTable}
              variant="secondary"
            >
              导出订单表
            </YumiButton>
            <YumiButton
              disabled={props.exporting}
              onClick={() => props.onExportShippingList()}
              variant="secondary"
            >
              导出发货清单
            </YumiButton>
            <YumiButton
              disabled={props.exporting}
              onClick={props.onExportOrderDocuments}
              variant="secondary"
            >
              合并导出
            </YumiButton>
            <YumiButton onClick={() => props.setContentEditorOpen(true)} variant="secondary">
              编辑订单内容
            </YumiButton>
          </div>
          {props.contentEditorOpen && (
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
                  <YumiFieldLabel>订单优惠（元）</YumiFieldLabel>
                  <YumiNumberField
                    allowDecimal
                    aria-label="订单优惠（元）"
                    min="0"
                    onChange={(event) => props.setContentOrderDiscount(event.target.value)}
                    value={props.contentOrderDiscount}
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
                <YumiButton
                  loading={props.submitting === 'content'}
                  type="submit"
                  variant="primary"
                >
                  保存内容变更
                </YumiButton>
              </div>
              {contentChanges.length > 0 && (
                <p className="yumi-form-hint">
                  已记录 {contentChanges.length} 次内容变更，历史不会被覆盖。
                </p>
              )}
            </form>
          )}
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
                  >
                    <YumiButton
                      disabled={props.exporting}
                      onClick={() => props.onExportShippingList(shipment.id)}
                      variant="secondary"
                    >
                      导出本批清单
                    </YumiButton>
                  </YumiBusinessListItem>
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
                        label: fund.direction === 'income' ? '流入' : '流出',
                        value: formatCents(fund.amountCents)
                      }
                    ]}
                    status={
                      <YumiStatusTag
                        tone={
                          fund.reversalOfEntryId
                            ? 'neutral'
                            : fund.direction === 'income'
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
                    actions={
                      fund.attachmentId ? (
                        <>
                          <YumiButton
                            onClick={() => props.onOpenFundProof(fund.id)}
                            size="small"
                            variant="secondary"
                          >
                            查看凭证
                          </YumiButton>
                          {fund.direction === 'income' && (
                            <YumiButton
                              onClick={() => props.onReplaceFundProof(fund.id)}
                              size="small"
                              variant="ghost"
                            >
                              替换凭证
                            </YumiButton>
                          )}
                        </>
                      ) : fund.direction === 'income' ? (
                        <YumiButton
                          onClick={() => props.onReplaceFundProof(fund.id)}
                          size="small"
                          variant="ghost"
                        >
                          关联凭证
                        </YumiButton>
                      ) : undefined
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
              {props.fundType === 'payment' && (
                <YumiField>
                  <YumiFieldLabel>收款凭证（可选）</YumiFieldLabel>
                  <div className="yumi-form-actions">
                    <YumiButton onClick={props.onPickFundProof} type="button" variant="secondary">
                      {props.pendingFundProof ? '重新选择凭证' : '选择收款凭证'}
                    </YumiButton>
                    {props.pendingFundProof && (
                      <YumiButton onClick={props.onClearFundProof} type="button" variant="ghost">
                        移除
                      </YumiButton>
                    )}
                  </div>
                  {props.pendingFundProof && (
                    <p className="yumi-form-hint">已选择：{props.pendingFundProof.originalName}</p>
                  )}
                </YumiField>
              )}
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
