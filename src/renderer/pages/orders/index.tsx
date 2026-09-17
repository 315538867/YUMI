import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import type {
  V2Customer,
  V2CustomerInput,
  V2NavigationTarget,
  V2Order,
  V2Worker,
  V2WorkAssignment,
  V2OrderFundBusinessType,
  V2AttachmentReference,
  V2OrderItem,
  V2OrderItemFulfillment,
  V2Product,
  V2ProductInput,
  V2ShippingListDocument,
  V2OrderBusinessDetail,
  V2OrderBusinessItemReportRow
} from '@shared/contracts/index'
import {
  calculateOrderItemAmounts,
  createOrderAmountCalculation,
  type OrderAmountSummaryInput,
  type OrderItemAmountInput
} from '@shared/calculations'
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
import { DetailPage } from '../../components/patterns/detail-page'
import { FormWorkspace } from '../../components/patterns/form-workspace'
import { ListPage } from '../../components/patterns/list-page'
import {
  YumiButton,
  YumiCheckbox,
  YumiConfirmDialog,
  YumiDataTable,
  YumiDocumentPreview,
  YumiDatePicker,
  YumiEmptyState,
  YumiField,
  YumiFieldLabel,
  YumiFormMessage,
  YumiFormSection,
  YumiListSurface,
  YumiListToolbar,
  YumiMetricStrip,
  YumiNumberField,
  YumiRecordActionBar,
  YumiSnapshotNotice,
  YumiSearchSelect,
  YumiSection,
  YumiSheet,
  YumiSelect,
  YumiStatusTag,
  YumiTextArea,
  YumiTextField,
  type YumiPageHeaderProps,
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
type OrderDetailView = 'overview' | 'schedule' | 'fulfillment' | 'funds' | 'profit' | 'after_sales'
type OrderFundFilter = 'all' | 'outstanding' | 'settled'
type OrderScheduleFilter = 'all' | 'scheduled' | 'unscheduled'

interface OrdersPageProps {
  navigationTarget?: Extract<V2NavigationTarget, { view: 'orders' }> | null
  onNavigateToBaseData: (view: 'customers' | 'products') => void
  onNavigate?: (target: V2NavigationTarget) => void
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

/**
 * 编辑过程允许暂存未完成的输入；预览只在输入可解析时参与计算，最终金额仍由主进程领域校验确认。
 * 预览本身不重复求和：行金额与订单金额一律委托共享订单公式。
 */
function previewCents(value: string): number {
  if (!value.trim()) return 0
  try {
    return yuanToCents(value)
  } catch {
    return 0
  }
}

function previewQuantity(value: string): number {
  const quantity = Number(value)
  return Number.isFinite(quantity) ? Math.max(Math.round(quantity), 0) : 0
}

/** 将可含未完成输入的草稿裁剪成共享公式可接受的原始字段。 */
function toDraftAmountInput(
  lines: readonly OrderLineDraft[],
  orderDiscount: string
): OrderAmountSummaryInput | null {
  const items: OrderItemAmountInput[] = []
  let lineTotalCents = 0
  for (const line of lines) {
    const quantity = previewQuantity(line.quantity)
    if (quantity <= 0) continue
    const unitPriceCents = previewCents(line.unitPrice)
    const edgeQuantity = line.edgeEnabled
      ? Math.min(previewQuantity(line.edgeQuantity), quantity)
      : 0
    const edge: OrderItemAmountInput['edge'] =
      edgeQuantity > 0
        ? {
            enabled: true,
            quantity: edgeQuantity,
            unitPriceCents: previewCents(line.edgeUnitPrice)
          }
        : undefined
    const lineSummary = calculateOrderItemAmounts({ quantity, unitPriceCents, edge })
    const grossCents = lineSummary.itemAmountCents + lineSummary.edgeAmountCents
    const itemDiscountCents = Math.min(previewCents(line.itemDiscount), grossCents)
    items.push({ quantity, unitPriceCents, edge, itemDiscountCents })
    lineTotalCents += grossCents - itemDiscountCents
  }
  if (!items.length) return null
  return {
    items,
    orderDiscountCents: Math.min(previewCents(orderDiscount), lineTotalCents)
  }
}

function formatDiscountCents(cents: number): string {
  return cents > 0 ? `−${formatCents(cents)}` : formatCents(0)
}

function OrderAmountPreview({
  lines,
  orderDiscount
}: {
  lines: readonly OrderLineDraft[]
  orderDiscount: string
}) {
  const input = toDraftAmountInput(lines, orderDiscount)
  const calculation = input ? createOrderAmountCalculation(input) : null
  return (
    <YumiMetricStrip
      ariaLabel="订单金额预览"
      items={[
        {
          label: '商品与缝边小计',
          note: calculation?.itemAndEdge.expression,
          value: formatCents(calculation?.itemAndEdge.amountCents ?? 0)
        },
        {
          label: '明细优惠',
          note: calculation?.itemDiscount.expression,
          tone: 'warning',
          value: formatDiscountCents(calculation?.itemDiscount.amountCents ?? 0)
        },
        {
          label: '订单优惠',
          note: calculation?.orderDiscount.expression,
          tone: 'warning',
          value: formatDiscountCents(calculation?.orderDiscount.amountCents ?? 0)
        },
        {
          label: '预计订单金额',
          note: calculation?.orderAmount.expression,
          tone: 'brand',
          value: formatCents(calculation?.orderAmount.amountCents ?? 0)
        }
      ]}
    />
  )
}

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
  basePriceCents: yuanToCents(draft.basePrice),
  packagingCostCents: 0,
  accessoryCostCents: 0,
  replacementBagCostCents: 0,
  edgeConsumableCostCents: 0,
  standardMakingMinutes: 0,
  makingCommissionCents: 0,
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

export function OrdersPage({
  navigationTarget = null,
  onNavigateToBaseData,
  onNavigate
}: OrdersPageProps) {
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
    voidShipment,
    exportOrderTable,
    exportShippingList,
    getShippingListPreview,
    getOrderSchedule,
    getOrderBusinessDetail
  } = useOrders()
  const { createCustomer: createQuickCustomer } = useCustomers()
  const { createProduct: createQuickProduct } = useProducts()
  const { listAfterSalesCases, createAfterSalesCase, updateAfterSalesCase, linkAfterSalesCharge } =
    useFinance()
  const studio = useStudioSettings()
  const [workspaceMode, setWorkspaceMode] = useState<OrderWorkspaceMode>('list')
  const [detailView, setDetailView] = useState<OrderDetailView>('overview')
  const [orderSearchQuery, setOrderSearchQuery] = useState('')
  const [orderFundFilter, setOrderFundFilter] = useState<OrderFundFilter>('all')
  const [orderScheduleFilter, setOrderScheduleFilter] = useState<OrderScheduleFilter>('all')
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
  const [fundSheet, setFundSheet] = useState<'record' | 'correction' | null>(null)
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
  const [correctionConfirmOpen, setCorrectionConfirmOpen] = useState(false)
  const [shipmentDate, setShipmentDate] = useState(today())
  const [shipmentLines, setShipmentLines] = useState<Record<string, string>>({})
  const [shipmentCarrier, setShipmentCarrier] = useState('')
  const [shipmentTrackingNumber, setShipmentTrackingNumber] = useState('')
  const [shipmentNote, setShipmentNote] = useState('')
  const [shipmentSheetOpen, setShipmentSheetOpen] = useState(false)
  const [shipmentVoidSheetOpen, setShipmentVoidSheetOpen] = useState(false)
  const [shipmentVoidConfirmOpen, setShipmentVoidConfirmOpen] = useState(false)
  const [shipmentToVoid, setShipmentToVoid] = useState<string | null>(null)
  const [shipmentVoidDate, setShipmentVoidDate] = useState(today())
  const [shipmentVoidReason, setShipmentVoidReason] = useState('')
  const [shippingListPreview, setShippingListPreview] = useState<V2ShippingListDocument | null>(
    null
  )
  const [shippingPreviewOpen, setShippingPreviewOpen] = useState(false)
  const [shippingPreviewLoading, setShippingPreviewLoading] = useState(false)
  const [orderBusinessDetail, setOrderBusinessDetail] = useState<V2OrderBusinessDetail | null>(null)
  const [orderBusinessLoading, setOrderBusinessLoading] = useState(false)
  const [orderBusinessError, setOrderBusinessError] = useState<string | null>(null)
  const [orderSchedule, setOrderSchedule] = useState<{
    assignments: V2WorkAssignment[]
    workers: V2Worker[]
  } | null>(null)
  const [orderScheduleLoading, setOrderScheduleLoading] = useState(false)
  const [orderScheduleError, setOrderScheduleError] = useState<string | null>(null)
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
  const createFormRef = useRef<HTMLFormElement>(null)
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
    if (!selectedOrder || detailView !== 'profit') return
    let cancelled = false
    setOrderBusinessLoading(true)
    setOrderBusinessError(null)
    void getOrderBusinessDetail(selectedOrder.id)
      .then((detail) => {
        if (!cancelled) setOrderBusinessDetail(detail)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setOrderBusinessDetail(null)
          setOrderBusinessError(getErrorMessage(cause))
        }
      })
      .finally(() => {
        if (!cancelled) setOrderBusinessLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailView, getOrderBusinessDetail, selectedOrder])

  useEffect(() => {
    if (!selectedOrder || detailView !== 'schedule') return
    let cancelled = false
    setOrderScheduleLoading(true)
    setOrderScheduleError(null)
    void getOrderSchedule(selectedOrder.items.map((item) => item.id))
      .then((schedule) => {
        if (!cancelled) setOrderSchedule(schedule)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setOrderSchedule(null)
          setOrderScheduleError(getErrorMessage(cause))
        }
      })
      .finally(() => {
        if (!cancelled) setOrderScheduleLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailView, getOrderSchedule, selectedOrder])

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
      setFundSheet(null)
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setSubmitting(null)
    }
  }

  const requestCorrectionConfirmation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedOrder) return
    setError(null)
    if (!correctionOriginalId) {
      setError('请选择需要冲正的原资金流水')
      return
    }
    setCorrectionConfirmOpen(true)
  }

  const confirmCorrection = async () => {
    if (!selectedOrder || !correctionOriginalId) return
    setCorrectionConfirmOpen(false)
    setError(null)
    setSubmitting('correction')
    try {
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
      setFundSheet(null)
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

  const requestVoidShipmentConfirmation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedOrder || !shipmentToVoid) return
    setError(null)
    setShipmentVoidConfirmOpen(true)
  }

  const confirmVoidShipment = async () => {
    if (!selectedOrder || !shipmentToVoid) return
    setShipmentVoidConfirmOpen(false)
    setError(null)
    setSubmitting('shipment-void')
    try {
      await voidShipment(selectedOrder.id, shipmentToVoid, {
        voidedOn: shipmentVoidDate,
        reason: shipmentVoidReason
      })
      setShipmentVoidSheetOpen(false)
      setShipmentToVoid(null)
      setShipmentVoidReason('')
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setSubmitting(null)
    }
  }

  const openShippingListPreview = async (shipmentId: string) => {
    if (!selectedOrder) return
    setShippingPreviewLoading(true)
    setError(null)
    try {
      setShippingListPreview(await getShippingListPreview(selectedOrder.id, shipmentId))
      setShippingPreviewOpen(true)
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setShippingPreviewLoading(false)
    }
  }

  const exportOrderFile = async (kind: 'order-table' | 'shipping-list', shipmentId?: string) => {
    setExporting(true)
    setExportMessage(null)
    try {
      const result =
        kind === 'order-table'
          ? await exportOrderTable(selectedOrder?.id)
          : await exportShippingList(selectedOrder?.id, shipmentId)
      const label = kind === 'order-table' ? '订单表' : shipmentId ? '本批发货清单' : '发货汇总'
      setExportMessage(result.savedPath ? `已导出${label}：${result.savedPath}` : '已取消导出。')
    } catch (cause) {
      setExportMessage(getErrorMessage(cause))
    } finally {
      setExporting(false)
    }
  }

  const visibleOrders = useMemo(() => {
    const query = orderSearchQuery.trim().toLocaleLowerCase()
    return orders.filter((order) => {
      const matchesQuery =
        !query || `${order.code} ${order.customerName}`.toLocaleLowerCase().includes(query)
      const matchesFunds =
        orderFundFilter === 'all' ||
        (orderFundFilter === 'outstanding'
          ? order.outstandingCents > 0
          : order.outstandingCents <= 0)
      const matchesSchedule =
        orderScheduleFilter === 'all' ||
        (orderScheduleFilter === 'scheduled'
          ? Boolean(order.expectedShipDate)
          : !order.expectedShipDate)
      return matchesQuery && matchesFunds && matchesSchedule
    })
  }, [orderFundFilter, orderScheduleFilter, orderSearchQuery, orders])

  const baseDataReady = availableCustomers.length > 0 && availableProducts.length > 0

  return (
    <>
      {workspaceMode === 'list' && (
        <ListPage
          header={{
            actions: {
              ariaLabel: '订单页面动作',
              primaryAction: { label: '新建订单', onClick: openCreateWorkspace }
            },
            description: '查看已有订单，并进入订单详情处理资金、分批发货与售后。',
            title: '订单'
          }}
          toolbar={{
            ariaLabel: '订单列表工具',
            countLabel: `共 ${visibleOrders.length} 张订单`,
            filters: (
              <>
                <YumiSelect
                  aria-label="资金状态筛选"
                  onValueChange={(value) => setOrderFundFilter(value as OrderFundFilter)}
                  options={[
                    { label: '全部资金状态', value: 'all' },
                    { label: '待收款', value: 'outstanding' },
                    { label: '已收齐', value: 'settled' }
                  ]}
                  value={orderFundFilter}
                />
                <YumiSelect
                  aria-label="交付排班筛选"
                  onValueChange={(value) => setOrderScheduleFilter(value as OrderScheduleFilter)}
                  options={[
                    { label: '全部交付排班', value: 'all' },
                    { label: '已设置交付', value: 'scheduled' },
                    { label: '未设置交付', value: 'unscheduled' }
                  ]}
                  value={orderScheduleFilter}
                />
              </>
            ),
            search: (
              <YumiTextField
                aria-label="搜索订单"
                onChange={(event) => setOrderSearchQuery(event.target.value)}
                placeholder="搜索订单号、客户"
                value={orderSearchQuery}
              />
            )
          }}
        >
          {loading ? (
            <YumiEmptyState
              description="订单资料正在读取，请稍候。"
              scenario="loading"
              title="正在加载订单…"
            />
          ) : orders.length ? (
            visibleOrders.length ? (
              <YumiDataTable
                ariaLabel="订单列表"
                columns={[
                  {
                    key: 'order',
                    label: '订单号 / 客户',
                    render: (order) => (
                      <div className="yumi-list-cell">
                        <strong>{order.code}</strong>
                        <span>
                          {order.customerName} · 共 {order.itemCount} 款
                        </span>
                      </div>
                    )
                  },
                  {
                    key: 'createdAt',
                    label: '下单日期',
                    render: (order) => (order.createdAt ?? order.updatedAt).slice(0, 10)
                  },
                  {
                    key: 'amount',
                    label: '订单金额',
                    align: 'right',
                    render: (order) => <strong>{formatCents(order.currentAmountCents)}</strong>
                  },
                  {
                    key: 'funds',
                    label: '资金状态',
                    render: (order) => (
                      <YumiStatusTag tone={order.outstandingCents > 0 ? 'warning' : 'success'}>
                        {order.outstandingCents > 0
                          ? `待收 ${formatCents(order.outstandingCents)}`
                          : '已收齐'}
                      </YumiStatusTag>
                    )
                  },
                  {
                    key: 'schedule',
                    label: '排班进度',
                    render: (order) => {
                      const total = order.totalQuantity ?? 0
                      const shipped = Math.min(order.shippedQuantity ?? 0, total)
                      const progress = total ? Math.round((shipped / total) * 100) : 0
                      return (
                        <div className="yumi-order-progress">
                          <span className="yumi-order-progress__track">
                            <i
                              style={{ '--yumi-order-progress': `${progress}%` } as CSSProperties}
                            />
                          </span>
                          <span>{total ? `已发 ${shipped} / ${total} 件` : '待排班'}</span>
                        </div>
                      )
                    }
                  },
                  {
                    key: 'shipDate',
                    label: '预计交付',
                    render: (order) => order.expectedShipDate ?? '未设置'
                  },
                  {
                    key: 'actions',
                    label: '操作',
                    align: 'right',
                    render: (order) => (
                      <YumiButton
                        aria-label="查看详情"
                        onClick={() => void openOrderDetail(order.id)}
                        variant="ghost"
                      >
                        查看详情
                      </YumiButton>
                    )
                  }
                ]}
                getRowKey={(order) => order.id}
                rows={visibleOrders}
              />
            ) : (
              <YumiEmptyState
                description="请调整搜索内容或筛选条件后重试。"
                title="没有符合筛选条件的订单。"
              />
            )
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
        </ListPage>
      )}

      {workspaceMode === 'create' && (
        <FormWorkspace
          header={{
            description:
              '客户、商品、订单优惠和本次成交条件会冻结为订单快照；缝边只作用于本订单商品行。',
            navigation: {
              ariaLabel: '新建订单导航',
              label: '返回订单列表',
              onClick: returnToOrderList
            },
            title: '新建订单'
          }}
          actions={
            baseDataReady ? (
              <YumiButton
                form="order-create-form"
                loading={submitting === 'create'}
                type="submit"
                variant="primary"
              >
                保存并进入详情
              </YumiButton>
            ) : undefined
          }
        >
          {!baseDataReady ? (
            <OrderSetupGuide
              customersReady={availableCustomers.length > 0}
              productsReady={availableProducts.length > 0}
              onNavigateToBaseData={onNavigateToBaseData}
            />
          ) : (
            <form
              className="yumi-form-panel order-create-form"
              id="order-create-form"
              onSubmit={handleCreateOrder}
              ref={createFormRef}
            >
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
                <YumiField hint="默认来自工作室参数；可按本订单实际情况修改。">
                  <YumiFieldLabel>预留制作天数</YumiFieldLabel>
                  <YumiNumberField
                    aria-label="预留制作天数"
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
              <OrderAmountPreview lines={createLines} orderDiscount={createOrderDiscount} />
              <YumiFormMessage>
                金额预览按当前草稿计算；保存时仍以订单金额校验结果为准。
              </YumiFormMessage>
              <YumiField>
                <YumiFieldLabel>订单备注</YumiFieldLabel>
                <YumiTextArea
                  aria-label="订单备注"
                  onChange={(event) => setCreateNotes(event.target.value)}
                  value={createNotes}
                />
              </YumiField>
            </form>
          )}
        </FormWorkspace>
      )}

      {workspaceMode === 'detail' && selectedOrder && (
        <OrderDetail
          header={{
            actions: {
              ariaLabel: '订单详情页面动作',
              visibleActions: [
                {
                  disabled: exporting,
                  label: '导出订单表',
                  onClick: () => void exportOrderFile('order-table')
                },
                {
                  disabled: exporting,
                  label: '发货汇总',
                  onClick: () => void exportOrderFile('shipping-list')
                }
              ],
              primaryAction: {
                label: '编辑订单',
                onClick: () => {
                  setDetailView('overview')
                  setContentEditorOpen(true)
                }
              }
            },
            navigation: {
              ariaLabel: '订单详情导航',
              label: '返回订单列表',
              onClick: returnToOrderList
            },
            description: [
              selectedOrder.expectedShipDate
                ? `预计 ${selectedOrder.expectedShipDate} 发货`
                : '预计发货待确认',
              selectedOrder.productionDeadline
                ? `制作截止 ${selectedOrder.productionDeadline}`
                : '制作截止待确认',
              `预留制作 ${selectedOrder.reservedDays} 天`
            ].join(' · '),
            meta: `订单编号 · ${selectedOrder.code}`,
            title: '订单详情'
          }}
          activeView={detailView}
          onViewChange={setDetailView}
          order={selectedOrder}
          funds={funds}
          shipments={shipments}
          fulfillmentItems={fulfillmentItems}
          contentChanges={contentChanges}
          products={availableProducts}
          contentLines={contentLines}
          setContentLines={setContentLines}
          contentDescription={contentDescription}
          setContentDescription={setContentDescription}
          contentEditorOpen={contentEditorOpen}
          setContentEditorOpen={setContentEditorOpen}
          contentOrderDiscount={contentOrderDiscount}
          setContentOrderDiscount={setContentOrderDiscount}
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
          onCorrection={requestCorrectionConfirmation}
          onConfirmCorrection={() => void confirmCorrection()}
          onCorrectionConfirmChange={setCorrectionConfirmOpen}
          correctionConfirmOpen={correctionConfirmOpen}
          onShipment={handleCreateShipment}
          exporting={exporting}
          fundSheet={fundSheet}
          onFundSheetChange={setFundSheet}
          onShipmentVoidSheetChange={(open) => {
            setShipmentVoidSheetOpen(open)
            if (!open) setShipmentVoidConfirmOpen(false)
          }}
          onShipmentVoidStart={(shipmentId) => {
            setShipmentToVoid(shipmentId)
            setShipmentVoidDate(today())
            setShipmentVoidReason('')
            setShipmentVoidConfirmOpen(false)
            setShipmentVoidSheetOpen(true)
          }}
          onConfirmVoidShipment={() => void confirmVoidShipment()}
          onVoidShipment={requestVoidShipmentConfirmation}
          shipmentToVoid={shipmentToVoid}
          shipmentVoidDate={shipmentVoidDate}
          shipmentVoidReason={shipmentVoidReason}
          shipmentVoidSheetOpen={shipmentVoidSheetOpen}
          shipmentVoidConfirmOpen={shipmentVoidConfirmOpen}
          onShipmentVoidConfirmChange={setShipmentVoidConfirmOpen}
          setShipmentVoidDate={setShipmentVoidDate}
          setShipmentVoidReason={setShipmentVoidReason}
          onExportShippingList={(shipmentId) => void exportOrderFile('shipping-list', shipmentId)}
          onPreviewShippingList={(shipmentId) => void openShippingListPreview(shipmentId)}
          orderBusinessDetail={orderBusinessDetail}
          orderBusinessLoading={orderBusinessLoading}
          orderBusinessError={orderBusinessError}
          orderSchedule={orderSchedule}
          orderScheduleLoading={orderScheduleLoading}
          orderScheduleError={orderScheduleError}
          onNavigateToFulfillment={(target) => onNavigate?.(target)}
          listAfterSalesCases={listAfterSalesCases}
          createAfterSalesCase={createAfterSalesCase}
          updateCase={updateAfterSalesCase}
          linkCharge={linkAfterSalesCharge}
        />
      )}

      <YumiSheet
        description="以下内容只读取该批次创建时冻结的订单、客户、物流与商品快照；后续修改资料不会影响它。"
        onOpenChange={(open) => {
          setShippingPreviewOpen(open)
          if (!open) setShippingListPreview(null)
        }}
        open={shippingPreviewOpen}
        title="发货清单"
      >
        {shippingPreviewLoading || !shippingListPreview ? (
          <YumiEmptyState
            description="正在读取本批发货清单快照。"
            scenario="loading"
            title="清单加载中"
          />
        ) : (
          <YumiDocumentPreview
            ariaLabel="发货清单预览"
            description={`订单 ${shippingListPreview.orderCode} · 生成于 ${shippingListPreview.generatedAt.slice(0, 16).replace('T', ' ')}`}
            facts={[
              { label: '客户', value: shippingListPreview.customerName },
              { label: '发货日期', value: shippingListPreview.shippedOn ?? '—' },
              {
                label: '物流',
                value: `${shippingListPreview.carrier ?? '未填写'}${shippingListPreview.trackingNumber ? ` · ${shippingListPreview.trackingNumber}` : ''}`
              }
            ]}
            title="发货清单"
          >
            <div className="yumi-shipping-list-preview">
              <YumiSnapshotNotice>
                本清单仅读取该批发货时保存的订单、客户、物流与商品快照；后续资料变更不会影响本批。
              </YumiSnapshotNotice>
              <YumiDataTable
                ariaLabel="发货清单商品快照"
                columns={[
                  { key: 'product', label: '商品', render: (item) => item.productName },
                  {
                    key: 'quantity',
                    label: '本批数量',
                    align: 'right',
                    render: (item) => item.thisShipmentQuantity ?? 0
                  },
                  {
                    key: 'ordered',
                    label: '订单数量',
                    align: 'right',
                    render: (item) => item.orderedQuantity
                  },
                  { key: 'note', label: '商品备注', render: (item) => item.notes ?? '—' }
                ]}
                getRowKey={(item) => `${item.productName}-${item.thisShipmentQuantity ?? 0}`}
                rows={shippingListPreview.items}
              />
            </div>
          </YumiDocumentPreview>
        )}
      </YumiSheet>

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
        <YumiEmptyState
          description="订单详情正在读取，请稍候。"
          scenario="loading"
          title="正在加载订单详情…"
        />
      )}
    </>
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
  onNavigate?: (target: V2NavigationTarget) => void
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

function OrderProfitPanel({
  error,
  loading,
  detail
}: {
  detail: V2OrderBusinessDetail | null
  error: string | null
  loading: boolean
}) {
  if (loading) {
    return (
      <YumiEmptyState
        description="正在读取已确认的订单经营事实。"
        scenario="loading"
        title="订单盈利加载中"
      />
    )
  }
  if (error) {
    return <YumiEmptyState description={error} scenario="filter" title="订单盈利暂不可用" />
  }
  if (!detail) {
    return (
      <YumiEmptyState
        description="当前订单尚未形成可核算的经营报表行。"
        scenario="filter"
        title="暂无订单盈利数据"
      />
    )
  }
  const { summary } = detail
  const orderLevelChanges = [
    detail.orderDiscountCents > 0 ? `订单优惠 ${formatCents(detail.orderDiscountCents)}` : null,
    detail.adjustmentsCents !== 0
      ? `金额调整 ${detail.adjustmentsCents > 0 ? '+' : ''}${formatCents(detail.adjustmentsCents)}`
      : null
  ].filter(Boolean)
  return (
    <div className="yumi-order-profit-stack">
      <section aria-label="订单盈利摘要" className="yumi-order-profit-summary">
        <div className="yumi-order-profit-summary__main">
          <span>已知经营结余</span>
          <strong
            className={
              summary.knownMarginCents >= 0
                ? 'yumi-order-profit-summary__positive'
                : 'yumi-order-profit-summary__negative'
            }
          >
            {formatCents(summary.knownMarginCents)}
          </strong>
          <small>
            实际净收款 {formatCents(summary.netReceivedCents)} − 已知核算成本{' '}
            {formatCents(summary.knownAccountingCostCents)}
          </small>
        </div>
        <dl className="yumi-order-profit-summary__stats">
          <div>
            <dt>当前订单金额</dt>
            <dd>{formatCents(summary.currentAmountCents)}</dd>
            <small>订单已确认金额</small>
          </div>
          <div>
            <dt>实际净收款</dt>
            <dd className="yumi-order-profit-summary__received">
              {formatCents(summary.netReceivedCents)}
            </dd>
            <small>仅按已登记收款计算</small>
          </div>
          <div>
            <dt>待收款</dt>
            <dd>{formatCents(summary.outstandingCents)}</dd>
            <small>当前订单金额 − 实际净收款</small>
          </div>
        </dl>
      </section>

      <YumiSnapshotNotice title="核算边界">
        仅呈现订单冻结商品快照、订单资金和已确认售后成本；同一工序时段可处理多个商品，系统不把实际计时工资按数量或预计分钟分摊为订单实际成本，因此这里只展示预计口径和明确可归属金额。
      </YumiSnapshotNotice>

      <YumiSection
        description="按订单商品快照展示预计直接成本与已确认售后成本；实际计时工资无法唯一归属到单个订单商品，不作分摊。"
        title="预计成本构成"
      >
        <dl aria-label="预计成本构成明细" className="yumi-order-profit-costs">
          <div>
            <dt>预计商品直接成本</dt>
            <dd>{formatCents(summary.productCostCents)}</dd>
            <small>按订单冻结商品快照与当前预计基准时薪计算</small>
          </div>
          <div>
            <dt>售后成本</dt>
            <dd>{formatCents(summary.afterSalesCostCents)}</dd>
            <small>已确认售后核算成本</small>
          </div>
          <div>
            <dt>实际计时人工</dt>
            <dd className="yumi-order-profit-costs__pending">不分摊</dd>
            <small>同一工时处理多个商品时无法唯一归属</small>
          </div>
        </dl>
      </YumiSection>

      <YumiSection
        description="按商品行展示订单收入、快照预计成本与已知毛利，并展示每件缝边预计增量利润；订单级优惠与金额调整不强行分摊到商品行。"
        title="商品预计盈利明细"
      >
        <YumiDataTable<V2OrderBusinessItemReportRow>
          ariaLabel="商品盈利明细"
          columns={[
            { key: 'productName', label: '商品', render: (item) => item.productName },
            { key: 'quantity', label: '数量', align: 'right', render: (item) => item.quantity },
            {
              key: 'orderRevenueCents',
              label: '订单收入',
              align: 'right',
              render: (item) => formatCents(item.orderRevenueCents)
            },
            {
              key: 'productCostCents',
              label: '预计直接成本',
              align: 'right',
              render: (item) => formatCents(item.productCostCents)
            },
            {
              key: 'expectedEdgeIncrementalProfitCents',
              label: '缝边预计增量利润 / 件',
              align: 'right',
              render: (item) =>
                item.expectedEdgeIncrementalProfitCents === 0
                  ? '—'
                  : formatCents(item.expectedEdgeIncrementalProfitCents)
            },
            {
              key: 'knownGrossMarginCents',
              label: '已知毛利',
              align: 'right',
              render: (item) => (
                <strong
                  className={
                    item.knownGrossMarginCents >= 0
                      ? 'yumi-order-profit-table__positive'
                      : 'yumi-order-profit-table__negative'
                  }
                >
                  {formatCents(item.knownGrossMarginCents)}
                </strong>
              )
            },
            {
              key: 'knownGrossMarginRateBasisPoints',
              label: '毛利率',
              align: 'right',
              render: (item) =>
                item.knownGrossMarginRateBasisPoints === null
                  ? '—'
                  : `${(item.knownGrossMarginRateBasisPoints / 100).toFixed(1)}%`
            }
          ]}
          getRowKey={(item) => item.orderItemId}
          rows={detail.items}
        />
        <p className="yumi-order-profit-reconciliation">
          商品直接成本取订单冻结快照；已确认售后成本按订单层级单独计入已知核算成本。订单级优惠与金额调整不在商品行分摊
          {orderLevelChanges.length ? `；当前已确认：${orderLevelChanges.join('，')}。` : '。'}
        </p>
      </YumiSection>
    </div>
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
            <YumiFieldLabel>定制服务</YumiFieldLabel>
            <YumiCheckbox
              aria-label={`第 ${index + 1} 行缝边`}
              checked={line.edgeEnabled}
              onChange={(event) => onChange(index, 'edgeEnabled', String(event.target.checked))}
            >
              缝边
            </YumiCheckbox>
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
  header: YumiPageHeaderProps
  activeView: OrderDetailView
  onViewChange: (view: OrderDetailView) => void
  order: V2Order
  funds: ReturnType<typeof useOrders>['funds']
  shipments: ReturnType<typeof useOrders>['shipments']
  fulfillmentItems: V2OrderItemFulfillment[]
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
  correctionConfirmOpen: boolean
  onCorrectionConfirmChange: (open: boolean) => void
  onConfirmCorrection: () => void
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
  fundSheet: 'record' | 'correction' | null
  onFundSheetChange: (value: 'record' | 'correction' | null) => void
  shipmentVoidSheetOpen: boolean
  shipmentVoidConfirmOpen: boolean
  onShipmentVoidSheetChange: (open: boolean) => void
  onShipmentVoidConfirmChange: (open: boolean) => void
  shipmentToVoid: string | null
  shipmentVoidDate: string
  setShipmentVoidDate: (value: string) => void
  shipmentVoidReason: string
  setShipmentVoidReason: (value: string) => void
  onShipmentVoidStart: (shipmentId: string) => void
  onConfirmVoidShipment: () => void
  onVoidShipment: (event: FormEvent<HTMLFormElement>) => void
  onExportShippingList: (shipmentId?: string) => void
  onPreviewShippingList: (shipmentId: string) => void
  orderBusinessDetail: V2OrderBusinessDetail | null
  orderBusinessLoading: boolean
  orderBusinessError: string | null
  orderSchedule: { assignments: V2WorkAssignment[]; workers: V2Worker[] } | null
  orderScheduleLoading: boolean
  orderScheduleError: string | null
  onNavigateToFulfillment: (target: Extract<V2NavigationTarget, { view: 'fulfillment' }>) => void
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
  const {
    activeView,
    order,
    funds,
    shipments,
    fulfillmentItems,
    contentChanges,
    products,
    shipmentAvailability
  } = props
  const detailViews: Array<{ id: OrderDetailView; label: string }> = [
    { id: 'overview', label: '概览' },
    { id: 'schedule', label: '排班' },
    { id: 'fulfillment', label: '发货' },
    { id: 'funds', label: '资金' },
    { id: 'profit', label: '盈利' },
    { id: 'after_sales', label: '售后' }
  ]
  const sortedShipments = [...shipments].sort((left, right) =>
    right.shippedOn.localeCompare(left.shippedOn)
  )
  const activeShipments = sortedShipments.filter((shipment) => shipment.status !== 'voided')
  const sortedFunds = [...funds].sort((left, right) =>
    right.occurredOn.localeCompare(left.occurredOn)
  )
  const itemTotalCents = order.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCents,
    0
  )
  const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0)
  const shippedQuantity = activeShipments.reduce(
    (sum, shipment) => sum + shipment.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0
  )
  const getShipmentSummary = (shipment: (typeof shipments)[number]) =>
    shipment.items
      .map((line) => {
        const item = order.items.find((candidate) => candidate.id === line.orderItemId)
        return `${item?.productSnapshot.name ?? '商品'} × ${line.quantity}`
      })
      .join('、')

  const orderItemIds = new Set(order.items.map((item) => item.id))
  const productNameByItemId = new Map(
    order.items.map((item) => [item.id, item.productSnapshot.name])
  )
  const workerNameById = new Map(
    (props.orderSchedule?.workers ?? []).map((worker) => [worker.id, worker.name])
  )
  const scheduleStages = [
    { stage: 'making', label: '制作', fulfillmentKey: 'making' },
    { stage: 'fluffing_bagging', label: '捏毛装袋', fulfillmentKey: 'fluffingBagging' },
    { stage: 'edge_sewing', label: '缝边', fulfillmentKey: 'edgeSewing' },
    { stage: 'packing', label: '打包发货', fulfillmentKey: 'packing' },
    { stage: 'ready_to_ship', label: '待发货', fulfillmentKey: 'readyToShip' }
  ] as const
  const assignedTaskRows = (props.orderSchedule?.assignments ?? [])
    .filter((assignment) => assignment.status !== 'cancelled')
    .flatMap((assignment) =>
      assignment.tasks
        .filter(
          (task) =>
            task.orderItemId &&
            orderItemIds.has(task.orderItemId) &&
            task.status !== 'cancelled' &&
            task.status !== 'confirmed'
        )
        .map((task) => ({
          kind: 'assigned' as const,
          assignmentId: assignment.id,
          taskId: task.id,
          orderItemId: task.orderItemId as string,
          processType: task.processType,
          productName: productNameByItemId.get(task.orderItemId as string) ?? '商品',
          quantity: task.plannedQuantity ?? 0,
          workerName: workerNameById.get(assignment.workerId) ?? '未命名人员',
          status: task.status
        }))
    )
  const reservedQuantityByStage = new Map<string, number>()
  for (const task of assignedTaskRows) {
    const key = `${task.orderItemId}:${task.processType}`
    reservedQuantityByStage.set(key, (reservedQuantityByStage.get(key) ?? 0) + task.quantity)
  }
  const unassignedTaskRows = fulfillmentItems.flatMap((item) =>
    scheduleStages.flatMap(({ stage, label, fulfillmentKey }) => {
      const stageQuantity = item.stages[fulfillmentKey]
      const reservedQuantity = reservedQuantityByStage.get(`${item.orderItemId}:${stage}`) ?? 0
      const quantity = Math.max(stageQuantity - reservedQuantity, 0)
      if (!quantity) return []
      return [
        {
          kind: 'unassigned' as const,
          orderItemId: item.orderItemId,
          processType: stage,
          productName: productNameByItemId.get(item.orderItemId) ?? '商品',
          stageLabel: label,
          quantity
        }
      ]
    })
  )
  const pendingInspectionQuantity = assignedTaskRows
    .filter((task) => task.status === 'pending_inspection')
    .reduce((sum, task) => sum + task.quantity, 0)
  const inProgressQuantity = assignedTaskRows
    .filter((task) => task.status === 'pending')
    .reduce((sum, task) => sum + task.quantity, 0)
  const completedQuantity = fulfillmentItems.reduce((sum, item) => sum + item.stages.shipped, 0)
  const processLabel = (processType: string) =>
    scheduleStages.find((stage) => stage.stage === processType)?.label ?? '任务'
  const taskStatus = (status: string) => {
    if (status === 'pending_inspection') return { label: '待质检', tone: 'warning' as const }
    return { label: '制作中', tone: 'brand' as const }
  }

  return (
    <DetailPage
      header={props.header}
      summary={{
        ariaLabel: '订单主体信息',
        eyebrow: '客户与交付',
        metadata: [
          { label: '订单号', value: order.code },
          { label: '联系人', value: order.customerSnapshot.contact || '未填写' },
          {
            label: '交付安排',
            value: order.expectedShipDate ? `预计 ${order.expectedShipDate} 发货` : '预计发货待确认'
          },
          { label: '收货地址', value: order.customerSnapshot.defaultAddress || '未填写' }
        ],
        title: order.customerSnapshot.name
      }}
      metrics={{
        ariaLabel: '订单关键指标',
        items: [
          {
            label: '订单金额',
            value: formatCents(order.amount.orderAmountCents ?? order.amount.currentAmountCents)
          },
          { label: '累计收款', tone: 'success', value: formatCents(order.funds.netReceivedCents) },
          {
            label: '待收款',
            tone: order.funds.outstandingCents > 0 ? 'warning' : 'success',
            value:
              order.funds.outstandingCents > 0
                ? formatCents(order.funds.outstandingCents)
                : '已收齐'
          },
          {
            label: '发货进度',
            value: totalQuantity
              ? `${Math.min(shippedQuantity, totalQuantity)} / ${totalQuantity} 件`
              : '—'
          }
        ]
      }}
      tabs={{
        ariaLabel: '订单详情工作视图',
        items: detailViews,
        onValueChange: props.onViewChange,
        value: activeView
      }}
    >
      {activeView === 'overview' && (
        <>
          <YumiSection
            description="确认订单内容；变更仅通过右上角“编辑订单”进入编辑态。"
            title="订单商品"
          >
            <YumiDataTable
              ariaLabel="订单商品列表"
              columns={[
                { key: 'product', label: '商品', render: (item) => item.productSnapshot.name },
                { key: 'quantity', label: '数量', align: 'right', render: (item) => item.quantity },
                {
                  key: 'price',
                  label: '单价',
                  align: 'right',
                  render: (item) => formatCents(item.unitPriceCents)
                },
                {
                  key: 'subtotal',
                  label: '小计',
                  align: 'right',
                  render: (item) => formatCents(item.quantity * item.unitPriceCents)
                }
              ]}
              emptyText="订单暂未包含商品。"
              getRowKey={(item) => item.id}
              rows={order.items}
            />
            <div className="yumi-order-items-total">
              <span>商品合计</span>
              <strong>{formatCents(itemTotalCents)}</strong>
            </div>
          </YumiSection>
          <YumiSection
            actions={
              <YumiButton onClick={() => props.onViewChange('schedule')} variant="ghost">
                查看排班明细
              </YumiButton>
            }
            description="概览只显示各生产阶段当前总量；人员、派工与处理操作进入“排班”标签。"
            title="排班概览"
          >
            <YumiMetricStrip
              ariaLabel="订单排班概览"
              items={[
                {
                  label: '待制作',
                  value: `${fulfillmentItems.reduce((sum, item) => sum + item.stages.making, 0)} 件`
                },
                {
                  label: '待捏毛装袋',
                  value: `${fulfillmentItems.reduce((sum, item) => sum + item.stages.fluffingBagging, 0)} 件`
                },
                {
                  label: '待打包',
                  value: `${fulfillmentItems.reduce((sum, item) => sum + item.stages.packing, 0)} 件`
                },
                {
                  label: '待发货',
                  tone: 'brand',
                  value: `${fulfillmentItems.reduce((sum, item) => sum + item.stages.readyToShip, 0)} 件`
                }
              ]}
            />
          </YumiSection>
          <YumiSheet
            description="订单内容的修改将保留历史记录，不会覆盖原始内容。"
            onOpenChange={props.setContentEditorOpen}
            open={props.contentEditorOpen}
            title="编辑订单"
          >
            <form className="yumi-form-panel yumi-sheet-form" onSubmit={props.onContentChange}>
              <YumiFormSection title="订单内容变更">
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
                <OrderAmountPreview
                  lines={props.contentLines}
                  orderDiscount={props.contentOrderDiscount}
                />
                <YumiFormMessage>
                  金额预览按当前草稿计算；保存时仍以订单金额校验结果为准。
                </YumiFormMessage>
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
                  <YumiFormMessage>
                    已记录 {contentChanges.length} 次内容变更，历史不会被覆盖。
                  </YumiFormMessage>
                )}
              </YumiFormSection>
            </form>
          </YumiSheet>
        </>
      )}

      {activeView === 'schedule' && (
        <div className="yumi-order-schedule-stack">
          <YumiMetricStrip
            ariaLabel="订单排班阶段摘要"
            items={[
              {
                label: '待排班',
                note: '已发货部分不再进入排班',
                value: `${unassignedTaskRows.reduce((sum, task) => sum + task.quantity, 0)} 件`
              },
              {
                label: '制作中',
                note: '已进入制作阶段',
                tone: 'brand',
                value: `${inProgressQuantity} 件`
              },
              {
                label: '待质检',
                note: '当前无待确认结果',
                value: `${pendingInspectionQuantity} 件`
              },
              {
                label: '已完成',
                note: `已完成发货 ${completedQuantity} 件`,
                value: `${completedQuantity} 件`
              }
            ]}
          />
          <YumiSection
            actions={
              <YumiButton
                onClick={() =>
                  props.onNavigateToFulfillment({
                    view: 'fulfillment',
                    orderId: order.id,
                    focus: 'queue'
                  })
                }
                variant="primary"
              >
                进入排班工作区
              </YumiButton>
            }
            description="每个阶段独立进入任务处理；派工与质检在排班工作区完成。"
            title="本订单任务"
          >
            {props.orderScheduleLoading && !props.orderSchedule ? (
              <YumiEmptyState
                description="正在读取本订单已有派工与人员信息。"
                scenario="loading"
                title="排班信息加载中"
              />
            ) : props.orderScheduleError ? (
              <YumiEmptyState
                description={props.orderScheduleError}
                scenario="filter"
                title="无法读取订单排班"
              />
            ) : (
              <YumiDataTable
                ariaLabel="本订单任务列表"
                columns={[
                  {
                    key: 'product-stage',
                    label: '商品 / 阶段',
                    render: (task) => (
                      <div className="yumi-list-cell">
                        <strong>{task.productName}</strong>
                        <span>
                          {task.kind === 'assigned'
                            ? processLabel(task.processType)
                            : task.stageLabel}
                        </span>
                      </div>
                    )
                  },
                  {
                    key: 'quantity',
                    label: '数量',
                    align: 'right',
                    render: (task) => `${task.quantity} 件`
                  },
                  {
                    key: 'worker',
                    label: '负责人',
                    render: (task) => (task.kind === 'assigned' ? task.workerName : '待派工')
                  },
                  {
                    key: 'status',
                    label: '状态',
                    render: (task) => {
                      const status =
                        task.kind === 'assigned'
                          ? taskStatus(task.status)
                          : { label: '待排班', tone: 'neutral' as const }
                      return <YumiStatusTag tone={status.tone}>{status.label}</YumiStatusTag>
                    }
                  },
                  {
                    key: 'action',
                    label: '处理',
                    align: 'right',
                    render: (task) => (
                      <YumiButton
                        onClick={() =>
                          props.onNavigateToFulfillment({
                            view: 'fulfillment',
                            orderId: order.id,
                            orderItemId: task.orderItemId,
                            focus: 'queue'
                          })
                        }
                        variant="ghost"
                      >
                        前往排班
                      </YumiButton>
                    )
                  }
                ]}
                emptyText="当前订单暂没有待处理的排班任务。"
                getRowKey={(task) =>
                  task.kind === 'assigned'
                    ? `assigned-${task.taskId}`
                    : `unassigned-${task.orderItemId}-${task.processType}`
                }
                rows={[...unassignedTaskRows, ...assignedTaskRows]}
              />
            )}
          </YumiSection>
          <YumiSnapshotNotice title="排班信息只在这里展开">
            订单概览只保留阶段总量，避免商品、客户信息与排班细节相互抢占空间。排班工作区也可以按人员周视图处理同一批任务。
          </YumiSnapshotNotice>
        </div>
      )}

      {activeView === 'fulfillment' && (
        <>
          <YumiMetricStrip
            ariaLabel="发货进度摘要"
            items={[
              { label: '已发货批次', value: `${activeShipments.length} 笔` },
              {
                label: '已发 / 总数量',
                tone: 'brand',
                value: totalQuantity
                  ? `${Math.min(shippedQuantity, totalQuantity)} / ${totalQuantity} 件`
                  : '—'
              },
              {
                label: '待发数量',
                value: totalQuantity ? `${Math.max(totalQuantity - shippedQuantity, 0)} 件` : '—'
              },
              { label: '最近发货', value: activeShipments[0]?.shippedOn ?? '暂无' }
            ]}
          />
          <YumiSection
            actions={
              <YumiButton onClick={() => props.setShipmentSheetOpen(true)} variant="primary">
                新增发货
              </YumiButton>
            }
            description="每次分批发货单独留痕；历史批次只读，可查看、导出或作废指定批次的清单快照。"
            title="发货记录"
          >
            <YumiListSurface ariaLabel="发货批次记录">
              <YumiListToolbar
                ariaLabel="发货批次列表工具"
                countLabel={`共 ${sortedShipments.length} 个批次`}
              />
              <YumiDataTable
                ariaLabel="发货批次列表"
                columns={[
                  {
                    key: 'batch',
                    label: '发货批次',
                    render: (shipment) => (
                      <div className="yumi-list-cell">
                        <strong>批次 {shipment.id}</strong>
                        <span>创建于 {shipment.createdAt.slice(0, 16).replace('T', ' ')}</span>
                      </div>
                    )
                  },
                  {
                    key: 'shipment-logistics',
                    label: '发货日期 / 物流',
                    render: (shipment) => (
                      <div className="yumi-list-cell">
                        <strong>{shipment.shippedOn}</strong>
                        <span>
                          {shipment.carrier ?? '未填写承运商'}
                          {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ''}
                        </span>
                      </div>
                    )
                  },
                  {
                    key: 'items',
                    label: '本批商品与数量',
                    render: (shipment) => (
                      <div className="yumi-list-cell">
                        <strong>{getShipmentSummary(shipment)}</strong>
                        <span>
                          本批合计 {shipment.items.reduce((sum, item) => sum + item.quantity, 0)} 件
                        </span>
                      </div>
                    )
                  },
                  {
                    key: 'status',
                    label: '批次状态',
                    render: (shipment) => (
                      <YumiStatusTag tone={shipment.status === 'voided' ? 'neutral' : 'success'}>
                        {shipment.status === 'voided' ? '已作废' : '已发货'}
                      </YumiStatusTag>
                    )
                  },
                  {
                    align: 'right',
                    key: 'actions',
                    label: '操作',
                    render: (shipment) => (
                      <YumiRecordActionBar
                        ariaLabel={`批次 ${shipment.id} 操作`}
                        actions={[
                          {
                            label: '查看发货清单',
                            onClick: () => props.onPreviewShippingList(shipment.id)
                          },
                          {
                            disabled: props.exporting,
                            label: '导出本批清单',
                            onClick: () => props.onExportShippingList(shipment.id),
                            variant: 'secondary'
                          },
                          ...(shipment.status !== 'voided'
                            ? [
                                {
                                  label: '作废批次',
                                  onClick: () => props.onShipmentVoidStart(shipment.id)
                                }
                              ]
                            : [])
                        ]}
                      />
                    )
                  }
                ]}
                emptyText="尚未登记发货批次。"
                getRowKey={(shipment) => shipment.id}
                rows={sortedShipments}
              />
            </YumiListSurface>
          </YumiSection>
          <YumiSnapshotNotice title="发货清单快照">
            下载本批清单时，固定使用该批次的订单号、客户收件信息、订单商品资料与本次数量快照；后续修改客户或商品资料、再次发货，均不改写已经生成的本批清单。
          </YumiSnapshotNotice>
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
                <YumiFormMessage>
                  同一批可选择多个商品；提交后会保留为只读的历史批次。
                </YumiFormMessage>
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
          <YumiSheet
            description="作废后会回退本批发货数量，并在历史中保留作废原因。"
            onOpenChange={props.onShipmentVoidSheetChange}
            open={props.shipmentVoidSheetOpen}
            title="作废发货批次"
          >
            <form className="yumi-form-panel yumi-sheet-form" onSubmit={props.onVoidShipment}>
              <YumiField>
                <YumiFieldLabel required>作废日期</YumiFieldLabel>
                <YumiDatePicker
                  aria-label="作废日期"
                  onValueChange={props.setShipmentVoidDate}
                  value={props.shipmentVoidDate}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel required>作废原因</YumiFieldLabel>
                <YumiTextArea
                  aria-label="作废原因"
                  onChange={(event) => props.setShipmentVoidReason(event.target.value)}
                  required
                  value={props.shipmentVoidReason}
                />
              </YumiField>
              <div className="yumi-form-actions">
                <YumiButton
                  loading={props.submitting === 'shipment-void'}
                  type="submit"
                  variant="danger"
                >
                  确认作废
                </YumiButton>
              </div>
            </form>
          </YumiSheet>
          <YumiConfirmDialog
            cancelLabel="继续修改"
            confirmLabel="确认作废批次"
            description="确认后会回退本批发货数量，并保留本次作废原因和历史留痕；如信息有误，请继续修改。"
            onConfirm={props.onConfirmVoidShipment}
            onOpenChange={props.onShipmentVoidConfirmChange}
            open={props.shipmentVoidConfirmOpen}
            title="确认作废发货批次？"
          />
        </>
      )}

      {activeView === 'funds' && (
        <>
          <YumiSection
            actions={
              <YumiButton onClick={() => props.onFundSheetChange('record')} variant="primary">
                登记收款或退款
              </YumiButton>
            }
            description="收款、退款和调整按发生顺序留痕；不在订单摘要中重复填报。"
            title="资金记录"
          >
            <YumiListSurface ariaLabel="订单资金流水">
              <YumiListToolbar
                ariaLabel="订单资金列表工具"
                countLabel={`共 ${sortedFunds.length} 笔流水`}
              />
              <YumiDataTable
                ariaLabel="订单资金流水列表"
                columns={[
                  {
                    key: 'occurred-on',
                    label: '发生日期',
                    render: (fund) => fund.occurredOn
                  },
                  {
                    key: 'business-type',
                    label: '业务类型 / 说明',
                    render: (fund) => (
                      <div className="yumi-list-cell">
                        <strong>
                          {fund.reversalOfEntryId
                            ? '冲正记录'
                            : fund.businessType === 'payment'
                              ? '收款'
                              : fund.businessType === 'refund'
                                ? '退款'
                                : '售后收费'}
                        </strong>
                        <span>{fund.note ?? '无备注'}</span>
                      </div>
                    )
                  },
                  {
                    align: 'right',
                    key: 'amount',
                    label: '金额',
                    render: (fund) => (
                      <strong>
                        {fund.direction === 'income' ? '+ ' : '− '}
                        {formatCents(Math.abs(fund.amountCents))}
                      </strong>
                    )
                  },
                  {
                    key: 'payment-method',
                    label: '支付方式',
                    render: (fund) => fund.paymentMethod ?? '—'
                  },
                  {
                    key: 'status',
                    label: '状态',
                    render: (fund) => (
                      <YumiStatusTag
                        tone={
                          fund.reversalOfEntryId
                            ? 'neutral'
                            : fund.direction === 'income'
                              ? 'success'
                              : 'warning'
                        }
                      >
                        {fund.reversalOfEntryId ? '已冲正' : '已生效'}
                      </YumiStatusTag>
                    )
                  },
                  {
                    align: 'right',
                    key: 'actions',
                    label: '操作',
                    render: (fund) => (
                      <div className="yumi-list-cell yumi-list-cell--actions">
                        {!fund.reversalOfEntryId && (
                          <YumiButton
                            onClick={() => {
                              props.setCorrectionOriginalId(fund.id)
                              props.setCorrectionType(fund.businessType)
                              props.setCorrectionAmount(centsToYuan(Math.abs(fund.amountCents)))
                              props.onFundSheetChange('correction')
                            }}
                            variant="ghost"
                          >
                            更正
                          </YumiButton>
                        )}
                        {fund.attachmentId ? (
                          <YumiButton
                            onClick={() => props.onOpenFundProof(fund.id)}
                            variant="secondary"
                          >
                            查看凭证
                          </YumiButton>
                        ) : fund.direction === 'income' ? (
                          <YumiButton
                            onClick={() => props.onReplaceFundProof(fund.id)}
                            variant="ghost"
                          >
                            关联凭证
                          </YumiButton>
                        ) : null}
                      </div>
                    )
                  }
                ]}
                emptyText="尚未登记订单资金流水。"
                getRowKey={(fund) => fund.id}
                rows={sortedFunds}
              />
            </YumiListSurface>
          </YumiSection>

          <YumiSheet
            description="本次收款会写入订单资金流水，并影响订单的实际收款与回款利润；如需登记退款或售后收费，可在业务类型中选择。"
            onOpenChange={(open) => props.onFundSheetChange(open ? 'record' : null)}
            open={props.fundSheet === 'record'}
            title="登记收款或退款"
          >
            <form className="yumi-form-panel yumi-sheet-form" onSubmit={props.onRecordFund}>
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
                    <YumiFormMessage>已选择：{props.pendingFundProof.originalName}</YumiFormMessage>
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
                  确认登记
                </YumiButton>
              </div>
            </form>
          </YumiSheet>

          <YumiSheet
            description="选择原流水后，将自动新增一条冲正记录和一条替代记录。"
            onOpenChange={(open) => props.onFundSheetChange(open ? 'correction' : null)}
            open={props.fundSheet === 'correction'}
            title="冲正并更正"
          >
            <form className="yumi-form-panel yumi-sheet-form" onSubmit={props.onCorrection}>
              <YumiField>
                <YumiFieldLabel required>原资金流水</YumiFieldLabel>
                <YumiSelect
                  aria-label="原资金流水"
                  onValueChange={props.setCorrectionOriginalId}
                  options={sortedFunds
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
                  aria-label="替代金额（元）"
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
          </YumiSheet>
          <YumiConfirmDialog
            cancelLabel="继续修改"
            confirmLabel="确认冲正并更正"
            description="确认后会新增一条冲正记录和一条替代记录，原流水会保留并建立关联；如金额或日期有误，请继续修改。"
            onConfirm={props.onConfirmCorrection}
            onOpenChange={props.onCorrectionConfirmChange}
            open={props.correctionConfirmOpen}
            title="确认冲正并更正？"
          />
        </>
      )}

      {activeView === 'profit' && (
        <OrderProfitPanel
          error={props.orderBusinessError}
          loading={props.orderBusinessLoading}
          detail={props.orderBusinessDetail}
        />
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
    </DetailPage>
  )
}
