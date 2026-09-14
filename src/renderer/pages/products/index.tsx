import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type {
  V2NavigationTarget,
  V2Product,
  V2ProductExpectedProfit,
  V2ProductInput,
  V2StudioSettings
} from '@shared/contracts/index'
import { calculateProductProfit, type ProductProfitInput } from '@shared/calculations'
import {
  formatMaterialPriceYuanPerGram,
  formatMilligramsAsGrams,
  parseGramsToMilligrams
} from '@shared/money'
import { centsToYuan, formatCents, getErrorMessage, yuanToCents } from '../../composables/v2-utils'
import { ProductInventoryPanel } from '../../components/product/product-inventory-panel'
import { useProducts } from '../../composables/use-products'
import { useStudioSettings } from '../../composables/use-studio-settings'
import {
  YumiButton,
  YumiCalculatedAmount,
  YumiDataTable,
  YumiDetailList,
  YumiEmptyState,
  YumiField,
  YumiFieldLabel,
  YumiFormMessage,
  YumiFormSection,
  YumiListSurface,
  YumiListToolbar,
  YumiNumberField,
  YumiPageHeader,
  YumiPrimaryTabs,
  YumiSection,
  YumiSelect,
  YumiStatusTag,
  YumiTextArea,
  YumiTextField,
  useYumiNotificationMessage
} from '../../components/ui'

interface ProductDraft {
  name: string
  basePrice: string
  unitWeight: string
  packagingCost: string
  accessoryCost: string
  replacementBagCost: string
  edgeConsumableCost: string
  fixedCost: string
  standardMakingMinutes: string
  expectedFluffingBaggingMinutes: string
  expectedEdgeSewingMinutes: string
  expectedPackingMinutes: string
  makingCommission: string
  fluffingBaggingCommission: string
  edgeSewingCommission: string
  moldCount: string
  outputPerMoldPerBatch: string
  maxBatchesPerDay: string
  notes: string
}

const emptyDraft = (): ProductDraft => ({
  name: '',
  basePrice: '0',
  unitWeight: '0',
  packagingCost: '0',
  accessoryCost: '0',
  replacementBagCost: '0',
  edgeConsumableCost: '0',
  fixedCost: '0',
  standardMakingMinutes: '0',
  expectedFluffingBaggingMinutes: '0',
  expectedEdgeSewingMinutes: '0',
  expectedPackingMinutes: '0',
  makingCommission: '0',
  fluffingBaggingCommission: '0',
  edgeSewingCommission: '0',
  moldCount: '0',
  outputPerMoldPerBatch: '0',
  maxBatchesPerDay: '0',
  notes: ''
})

const toDraft = (product: V2Product): ProductDraft => ({
  name: product.name,
  basePrice: centsToYuan(product.basePriceCents),
  unitWeight: formatMilligramsAsGrams(product.unitWeightMilligrams),
  packagingCost: centsToYuan(product.packagingCostCents),
  accessoryCost: centsToYuan(product.accessoryCostCents),
  replacementBagCost: centsToYuan(product.replacementBagCostCents),
  edgeConsumableCost: centsToYuan(product.edgeConsumableCostCents),
  fixedCost: centsToYuan(product.fixedCostCents),
  standardMakingMinutes: String(product.standardMakingMinutes),
  expectedFluffingBaggingMinutes: String(product.expectedFluffingBaggingMinutes),
  expectedEdgeSewingMinutes: String(product.expectedEdgeSewingMinutes),
  expectedPackingMinutes: String(product.expectedPackingMinutes),
  makingCommission: centsToYuan(product.makingCommissionCents),
  fluffingBaggingCommission: centsToYuan(product.fluffingBaggingCommissionCents),
  edgeSewingCommission: centsToYuan(product.edgeSewingCommissionCents),
  moldCount: String(product.moldCount),
  outputPerMoldPerBatch: String(product.outputPerMoldPerBatch),
  maxBatchesPerDay: String(product.maxBatchesPerDay),
  notes: product.notes ?? ''
})

/** 编辑过程允许暂存未完成的输入；预览只在输入可解析时参与计算，保存时仍由主进程校验。 */
function previewCents(value: string): number {
  if (!value.trim()) return 0
  try {
    return yuanToCents(value)
  } catch {
    return 0
  }
}

function previewMilligrams(value: string): number {
  if (!value.trim()) return 0
  try {
    return parseGramsToMilligrams(value)
  } catch {
    return 0
  }
}

function previewMinutes(value: string): number {
  const minutes = Number(value)
  return Number.isFinite(minutes) ? Math.max(Math.round(minutes), 0) : 0
}

function toInput(draft: ProductDraft): V2ProductInput {
  return {
    name: draft.name,
    basePriceCents: previewCents(draft.basePrice),
    packagingCostCents: previewCents(draft.packagingCost),
    accessoryCostCents: previewCents(draft.accessoryCost),
    replacementBagCostCents: previewCents(draft.replacementBagCost),
    edgeConsumableCostCents: previewCents(draft.edgeConsumableCost),
    fixedCostCents: previewCents(draft.fixedCost),
    unitWeightMilligrams: previewMilligrams(draft.unitWeight),
    standardMakingMinutes: previewMinutes(draft.standardMakingMinutes),
    expectedFluffingBaggingMinutes: previewMinutes(draft.expectedFluffingBaggingMinutes),
    expectedEdgeSewingMinutes: previewMinutes(draft.expectedEdgeSewingMinutes),
    expectedPackingMinutes: previewMinutes(draft.expectedPackingMinutes),
    makingCommissionCents: previewCents(draft.makingCommission),
    fluffingBaggingCommissionCents: previewCents(draft.fluffingBaggingCommission),
    edgeSewingCommissionCents: previewCents(draft.edgeSewingCommission),
    moldCount: previewMinutes(draft.moldCount),
    outputPerMoldPerBatch: previewMinutes(draft.outputPerMoldPerBatch),
    maxBatchesPerDay: previewMinutes(draft.maxBatchesPerDay),
    notes: draft.notes || null
  }
}

function toProfitInput(draft: ProductDraft, settings: V2StudioSettings | null): ProductProfitInput {
  const input = toInput(draft)
  return {
    basePriceCents: input.basePriceCents,
    unitWeightMilligrams: input.unitWeightMilligrams ?? 0,
    materialPriceMicroYuanPerGram: settings?.materialPriceMicroYuanPerGram ?? 0,
    packagingCostCents: input.packagingCostCents,
    accessoryCostCents: input.accessoryCostCents,
    replacementBagCostCents: input.replacementBagCostCents,
    fixedCostCents: input.fixedCostCents ?? 0,
    makingCommissionCents: input.makingCommissionCents,
    fluffingBaggingCommissionCents: input.fluffingBaggingCommissionCents ?? 0,
    expectedFluffingBaggingMinutes: input.expectedFluffingBaggingMinutes ?? 0,
    expectedEdgeSewingMinutes: input.expectedEdgeSewingMinutes ?? 0,
    expectedPackingMinutes: input.expectedPackingMinutes ?? 0,
    fluffingBaggingExpectedHourlyWageCents: settings?.fluffingBaggingExpectedHourlyWageCents ?? 0,
    edgeSewingExpectedHourlyWageCents: settings?.edgeSewingExpectedHourlyWageCents ?? 0,
    packingExpectedHourlyWageCents: settings?.packingExpectedHourlyWageCents ?? 0,
    edgeConsumableCostCents: input.edgeConsumableCostCents,
    edgeSewingCommissionCents: input.edgeSewingCommissionCents ?? 0
  }
}

function toProductProfitInput(
  product: V2Product,
  settings: V2StudioSettings | null
): ProductProfitInput {
  return {
    basePriceCents: product.basePriceCents,
    unitWeightMilligrams: product.unitWeightMilligrams,
    materialPriceMicroYuanPerGram: settings?.materialPriceMicroYuanPerGram ?? 0,
    packagingCostCents: product.packagingCostCents,
    accessoryCostCents: product.accessoryCostCents,
    replacementBagCostCents: product.replacementBagCostCents,
    fixedCostCents: product.fixedCostCents,
    makingCommissionCents: product.makingCommissionCents,
    fluffingBaggingCommissionCents: product.fluffingBaggingCommissionCents,
    expectedFluffingBaggingMinutes: product.expectedFluffingBaggingMinutes,
    expectedEdgeSewingMinutes: product.expectedEdgeSewingMinutes,
    expectedPackingMinutes: product.expectedPackingMinutes,
    fluffingBaggingExpectedHourlyWageCents: settings?.fluffingBaggingExpectedHourlyWageCents ?? 0,
    edgeSewingExpectedHourlyWageCents: settings?.edgeSewingExpectedHourlyWageCents ?? 0,
    packingExpectedHourlyWageCents: settings?.packingExpectedHourlyWageCents ?? 0,
    edgeConsumableCostCents: product.edgeConsumableCostCents,
    edgeSewingCommissionCents: product.edgeSewingCommissionCents
  }
}

function profitCalculationOf(profit: V2ProductExpectedProfit) {
  return profit
}

type ProductsWorkspaceMode = 'list' | 'create' | 'edit' | 'detail'
type ProductDetailTab = 'overview' | 'profit' | 'capacity' | 'inventory'

const detailTabs: ReadonlyArray<{ id: ProductDetailTab; label: string }> = [
  { id: 'overview', label: '商品概览' },
  { id: 'profit', label: '成本与预计盈利' },
  { id: 'capacity', label: '制作产能' },
  { id: 'inventory', label: '商品存量' }
]

type ProductsPageProps = {
  navigationTarget?: Extract<V2NavigationTarget, { view: 'products' }> | null
}

export function ProductsPage({ navigationTarget }: ProductsPageProps) {
  const { products, loading, loadError, createProduct, updateProduct, getExpectedProfit } =
    useProducts()
  const { settings, loading: settingsLoading, loadError: settingsError } = useStudioSettings()
  const [mode, setMode] = useState<ProductsWorkspaceMode>('list')
  const [selected, setSelected] = useState<V2Product | null>(null)
  const [detailTab, setDetailTab] = useState<ProductDetailTab>('overview')
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [expectedProfit, setExpectedProfit] = useState<V2ProductExpectedProfit | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [profitLoading, setProfitLoading] = useState(false)
  const [profitError, setProfitError] = useState<string | null>(null)
  useYumiNotificationMessage(loadError)
  useYumiNotificationMessage(settingsError)
  useYumiNotificationMessage(error)

  const visibleProducts = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase()
    return products.filter((product) => {
      const matchesStatus =
        statusFilter === 'all' || (statusFilter === 'enabled' ? product.enabled : !product.enabled)
      const matchesQuery =
        !query ||
        [product.name, product.code, product.notes]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase()
          .includes(query)
      return matchesStatus && matchesQuery
    })
  }, [products, searchQuery, statusFilter])

  const formProfitPreview = useMemo(
    () => calculateProductProfit(toProfitInput(draft, settings)),
    [draft, settings]
  )
  const detailProfit = useMemo(
    () => (selected ? calculateProductProfit(toProductProfitInput(selected, settings)) : null),
    [selected, settings]
  )

  const updateDraft = (key: keyof ProductDraft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const backToList = useCallback(() => {
    setMode('list')
    setSelected(null)
    setDetailTab('overview')
    setError(null)
    setDraft(emptyDraft())
  }, [])

  const openDetail = useCallback((product: V2Product) => {
    setSelected(product)
    setDetailTab('overview')
    setMode('detail')
    setError(null)
  }, [])

  const openCreate = () => {
    setSelected(null)
    setDraft(emptyDraft())
    setDetailTab('overview')
    setError(null)
    setMode('create')
  }

  const openEdit = (product: V2Product) => {
    setSelected(product)
    setDraft(toDraft(product))
    setError(null)
    setMode('edit')
  }

  useEffect(() => {
    const productId = navigationTarget?.productId
    if (!productId) return
    const product = products.find((item) => item.id === productId)
    if (product) openDetail(product)
  }, [navigationTarget?.productId, products, openDetail])

  useEffect(() => {
    if (mode !== 'detail' || detailTab !== 'profit' || !selected) return
    let cancelled = false
    setProfitLoading(true)
    setProfitError(null)
    getExpectedProfit(selected.id)
      .then((result) => {
        if (!cancelled) setExpectedProfit(result)
      })
      .catch((loadProfitError) => {
        if (!cancelled) setProfitError(getErrorMessage(loadProfitError))
      })
      .finally(() => {
        if (!cancelled) setProfitLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, detailTab, selected, getExpectedProfit])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      if (mode === 'edit' && selected) {
        const saved = await updateProduct({
          ...toInput(draft),
          id: selected.id,
          enabled: selected.enabled
        })
        setSelected(saved)
        setMode('detail')
        setDetailTab('overview')
      } else {
        const saved = await createProduct(toInput(draft))
        setSelected(saved)
        setMode('detail')
        setDetailTab('overview')
      }
      setDraft(emptyDraft())
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  const materialPriceLabel = settings
    ? `${formatMaterialPriceYuanPerGram(settings.materialPriceMicroYuanPerGram)} 元/克`
    : '正在读取工作室参数…'

  if (mode === 'list') {
    return (
      <div className="yumi-page yumi-reference-workspace">
        <YumiPageHeader
          actions={{
            ariaLabel: '商品页面动作',
            primaryAction: { label: '新建商品', onClick: openCreate }
          }}
          description="商品、提成与预计盈利维护在当前商品资料中；材料克单价和预计基准时薪由工作室统一维护。"
          meta={`共 ${visibleProducts.length} 款`}
          title="商品"
        />
        <YumiListSurface ariaLabel={`商品列表，共 ${visibleProducts.length} 款`}>
          <YumiListToolbar
            ariaLabel="商品列表工具"
            countLabel={`共 ${visibleProducts.length} 款商品`}
            filters={
              <YumiSelect
                aria-label="商品状态筛选"
                onValueChange={(value) => setStatusFilter(value as 'all' | 'enabled' | 'disabled')}
                options={[
                  { label: '全部状态', value: 'all' },
                  { label: '已启用', value: 'enabled' },
                  { label: '已停用', value: 'disabled' }
                ]}
                value={statusFilter}
              />
            }
            search={
              <YumiTextField
                aria-label="搜索商品"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索商品、编码或分类"
                value={searchQuery}
              />
            }
          />
          {loading ? (
            <YumiEmptyState
              description="正在读取商品资料，请稍候。"
              scenario="loading"
              title="商品资料加载中"
            />
          ) : products.length === 0 ? (
            <YumiEmptyState
              description="点击右上角“新建商品”后，负责人即可在新增订单时主动选择。"
              scenario="first-use"
              title="还没有商品资料"
            />
          ) : visibleProducts.length ? (
            <YumiDataTable
              ariaLabel="商品列表"
              columns={[
                {
                  key: 'product',
                  label: '商品 / 编码',
                  render: (product) => (
                    <div className="yumi-list-cell">
                      <strong>{product.name}</strong>
                      <span>{product.code}</span>
                      <span>材料 {formatMilligramsAsGrams(product.unitWeightMilligrams)} 克</span>
                    </div>
                  )
                },
                {
                  key: 'price',
                  label: '默认售价',
                  align: 'right',
                  render: (product) => <strong>{formatCents(product.basePriceCents)}</strong>
                },
                {
                  key: 'making',
                  label: '预计制作',
                  render: (product) => `${product.standardMakingMinutes} 分钟`
                },
                {
                  key: 'capacity',
                  label: '日产能',
                  render: (product) =>
                    product.dailyCapacity > 0 ? `${product.dailyCapacity} 件` : '未维护'
                },
                {
                  key: 'status',
                  label: '状态',
                  render: (product) => (
                    <YumiStatusTag tone={product.enabled ? 'success' : 'neutral'}>
                      {product.enabled ? '启用' : '停用'}
                    </YumiStatusTag>
                  )
                },
                {
                  key: 'updatedAt',
                  label: '最近更新',
                  render: (product) => product.updatedAt.slice(0, 10)
                },
                {
                  align: 'right',
                  key: 'actions',
                  label: '操作',
                  render: (product) => (
                    <YumiButton
                      aria-label={`查看商品资料：${product.name}`}
                      onClick={() => openDetail(product)}
                      variant="ghost"
                    >
                      查看详情
                    </YumiButton>
                  )
                }
              ]}
              getRowKey={(product) => product.id}
              rows={visibleProducts}
            />
          ) : (
            <YumiEmptyState
              description="请调整搜索内容或状态筛选后重试。"
              title="没有符合筛选条件的商品。"
            />
          )}
        </YumiListSurface>
      </div>
    )
  }

  if (mode === 'create' || mode === 'edit') {
    return (
      <div className="yumi-page yumi-reference-workspace">
        <YumiPageHeader
          actions={{
            ariaLabel: '商品编辑动作',
            primaryAction: {
              label: mode === 'edit' ? '保存商品' : '创建商品',
              loading: submitting,
              onClick: () => formRef.current?.requestSubmit()
            }
          }}
          description="保存后只影响后续新建订单；已建立订单会保留当时的商品与材料单价快照。"
          navigation={{ ariaLabel: '返回商品列表', label: '返回商品列表', onClick: backToList }}
          title={mode === 'edit' && selected ? `编辑商品：${selected.name}` : '新建商品'}
        />
        <div className="yumi-product-workspace">
          <form
            className="yumi-form-panel yumi-product-workspace__form"
            id="product-workspace-form"
            onSubmit={submit}
            ref={formRef}
          >
            <YumiFormSection title="基础资料">
              <div className="yumi-form-grid yumi-form-grid--two">
                <YumiField>
                  <YumiFieldLabel htmlFor="product-name" required>
                    商品名称
                  </YumiFieldLabel>
                  <YumiTextField
                    id="product-name"
                    onChange={(event) => updateDraft('name', event.target.value)}
                    required
                    value={draft.name}
                  />
                </YumiField>
                <MoneyField
                  id="product-base-price"
                  label="默认销售单价（元）"
                  onChange={(value) => updateDraft('basePrice', value)}
                  value={draft.basePrice}
                />
              </div>
            </YumiFormSection>
            <YumiFormSection
              description={`全局材料克单价：${settingsLoading ? '正在读取…' : materialPriceLabel}。此处只维护单件材料重量，使用量与成品材料重量一致。`}
              title="材料与单件成本"
            >
              <div className="yumi-form-grid yumi-form-grid--two">
                <YumiField>
                  <YumiFieldLabel htmlFor="product-unit-weight">单件材料重量（克）</YumiFieldLabel>
                  <YumiNumberField
                    allowDecimal
                    id="product-unit-weight"
                    onChange={(event) => updateDraft('unitWeight', event.target.value)}
                    value={draft.unitWeight}
                  />
                </YumiField>
                <MoneyField
                  id="product-fixed-cost"
                  label="单件固定成本（元）"
                  onChange={(value) => updateDraft('fixedCost', value)}
                  value={draft.fixedCost}
                />
                <MoneyField
                  id="product-packaging-cost"
                  label="包装成本（元）"
                  onChange={(value) => updateDraft('packagingCost', value)}
                  value={draft.packagingCost}
                />
                <MoneyField
                  id="product-accessory-cost"
                  label="配饰成本（元）"
                  onChange={(value) => updateDraft('accessoryCost', value)}
                  value={draft.accessoryCost}
                />
                <MoneyField
                  id="product-replacement-bag-cost"
                  label="替换袋成本（元）"
                  onChange={(value) => updateDraft('replacementBagCost', value)}
                  value={draft.replacementBagCost}
                />
                <MoneyField
                  id="product-edge-consumable-cost"
                  label="缝边耗材成本（元）"
                  onChange={(value) => updateDraft('edgeConsumableCost', value)}
                  value={draft.edgeConsumableCost}
                />
              </div>
            </YumiFormSection>
            <YumiFormSection
              description="制作按合格数量计件；捏毛装袋与缝边按完成数量计件；打包发货不产生计件提成。"
              title="提成"
            >
              <div className="yumi-form-grid yumi-form-grid--two">
                <MoneyField
                  id="product-making-commission"
                  label="制作提成（元/件）"
                  onChange={(value) => updateDraft('makingCommission', value)}
                  value={draft.makingCommission}
                />
                <MoneyField
                  id="product-fluffing-bagging-commission"
                  label="捏毛装袋提成（元/件）"
                  onChange={(value) => updateDraft('fluffingBaggingCommission', value)}
                  value={draft.fluffingBaggingCommission}
                />
                <MoneyField
                  id="product-edge-sewing-commission"
                  label="缝边提成（元/件）"
                  onChange={(value) => updateDraft('edgeSewingCommission', value)}
                  value={draft.edgeSewingCommission}
                />
              </div>
            </YumiFormSection>
            <YumiFormSection
              description="预计单件制作时长只服务排产和产能参考，不进入制作工资或预计计时人工。"
              title="预计时长与产能"
            >
              <div className="yumi-form-grid yumi-form-grid--two">
                <MinutesField
                  id="product-standard-making-minutes"
                  label="预计单件制作时长（分钟）"
                  onChange={(value) => updateDraft('standardMakingMinutes', value)}
                  value={draft.standardMakingMinutes}
                />
                <MinutesField
                  id="product-expected-fluffing-bagging-minutes"
                  label="预计单件捏毛装袋时长（分钟）"
                  onChange={(value) => updateDraft('expectedFluffingBaggingMinutes', value)}
                  value={draft.expectedFluffingBaggingMinutes}
                />
                <MinutesField
                  id="product-expected-edge-sewing-minutes"
                  label="预计单件缝边时长（分钟）"
                  onChange={(value) => updateDraft('expectedEdgeSewingMinutes', value)}
                  value={draft.expectedEdgeSewingMinutes}
                />
                <MinutesField
                  id="product-expected-packing-minutes"
                  label="预计单件打包发货时长（分钟）"
                  onChange={(value) => updateDraft('expectedPackingMinutes', value)}
                  value={draft.expectedPackingMinutes}
                />
                <MinutesField
                  id="product-mold-count"
                  label="模具数量"
                  onChange={(value) => updateDraft('moldCount', value)}
                  value={draft.moldCount}
                />
                <MinutesField
                  id="product-output-per-mold"
                  label="每模每批产出（件）"
                  onChange={(value) => updateDraft('outputPerMoldPerBatch', value)}
                  value={draft.outputPerMoldPerBatch}
                />
                <MinutesField
                  id="product-max-batches"
                  label="每日最大批次数"
                  onChange={(value) => updateDraft('maxBatchesPerDay', value)}
                  value={draft.maxBatchesPerDay}
                />
                <YumiField>
                  <YumiFieldLabel>计算日产能</YumiFieldLabel>
                  <YumiFormMessage tone="hint">
                    {previewMinutes(draft.moldCount) > 0 &&
                    previewMinutes(draft.outputPerMoldPerBatch) > 0 &&
                    previewMinutes(draft.maxBatchesPerDay) > 0
                      ? `${previewMinutes(draft.moldCount) * previewMinutes(draft.outputPerMoldPerBatch) * previewMinutes(draft.maxBatchesPerDay)} 件/日`
                      : '填写完整模具参数后计算'}
                  </YumiFormMessage>
                </YumiField>
              </div>
            </YumiFormSection>
            <YumiField>
              <YumiFieldLabel htmlFor="product-notes">备注</YumiFieldLabel>
              <YumiTextArea
                id="product-notes"
                onChange={(event) => updateDraft('notes', event.target.value)}
                value={draft.notes}
              />
            </YumiField>
          </form>
          <aside aria-label="预计盈利预览" className="yumi-product-workspace__aside">
            <YumiSection
              description="任一售价、重量、成本、提成或预计时长变化都会立即重算；保存时仍以主进程校验为准。"
              title="预计盈利预览"
            >
              <div className="yumi-product-profit-preview">
                <div className="yumi-product-profit-preview__price">
                  <span>默认售价</span>
                  <strong>{formatCents(previewCents(draft.basePrice))}</strong>
                </div>
                <YumiCalculatedAmount calculation={formProfitPreview.unitCost} showBreakdown />
                <YumiCalculatedAmount calculation={formProfitPreview.unitProfit} tone="profit" />
                <YumiCalculatedAmount calculation={formProfitPreview.profitRate} />
                <YumiCalculatedAmount
                  calculation={formProfitPreview.edgeIncrementalCost}
                  showBreakdown
                />
              </div>
            </YumiSection>
          </aside>
        </div>
      </div>
    )
  }

  return (
    <div className="yumi-page yumi-reference-workspace">
      <YumiPageHeader
        actions={{
          ariaLabel: '商品详情动作',
          primaryAction: selected
            ? { label: '编辑商品', onClick: () => openEdit(selected) }
            : undefined
        }}
        description="商品资料在订单创建时冻结；修改商品不改写已创建订单的快照。"
        meta={selected ? (selected.enabled ? '启用中' : '已停用') : undefined}
        navigation={{ ariaLabel: '返回商品列表', label: '返回商品列表', onClick: backToList }}
        title={selected ? selected.name : '商品详情'}
      />
      {selected ? (
        <>
          <YumiPrimaryTabs
            ariaLabel="商品详情标签"
            items={detailTabs.map((tab) => ({ id: tab.id, label: tab.label }))}
            onValueChange={setDetailTab}
            value={detailTab}
          />
          {detailTab === 'overview' ? (
            <div className="yumi-reference-workspace__sections">
              <YumiSection title="商品概览">
                <YumiDetailList
                  ariaLabel="商品基础资料"
                  items={[
                    { label: '商品名称', value: selected.name },
                    { label: '商品编码', value: selected.code },
                    { label: '默认售价', value: formatCents(selected.basePriceCents) },
                    { label: '状态', value: selected.enabled ? '启用' : '停用' },
                    {
                      label: '单件材料重量',
                      value: `${formatMilligramsAsGrams(selected.unitWeightMilligrams)} 克`
                    },
                    {
                      label: '最近更新',
                      value: selected.updatedAt.slice(0, 10)
                    }
                  ]}
                />
                {selected.notes ? (
                  <YumiFormMessage tone="hint">备注：{selected.notes}</YumiFormMessage>
                ) : null}
              </YumiSection>
            </div>
          ) : null}
          {detailTab === 'profit' ? (
            <div className="yumi-reference-workspace__sections">
              <YumiSection
                description="主进程按当前商品参数、全局材料克单价和预计基准时薪计算；这里不展示历史实际盈利。"
                title="成本与预计盈利"
              >
                {profitLoading ? (
                  <YumiEmptyState
                    description="正在读取主进程预计盈利，请稍候。"
                    scenario="loading"
                    title="预计盈利加载中"
                  />
                ) : profitError ? (
                  <YumiFormMessage tone="error">{profitError}</YumiFormMessage>
                ) : detailProfit ? (
                  <div className="yumi-product-profit-preview">
                    <div className="yumi-product-profit-preview__price">
                      <span>默认售价</span>
                      <strong>{formatCents(selected.basePriceCents)}</strong>
                    </div>
                    <YumiCalculatedAmount
                      calculation={profitCalculationOf(expectedProfit ?? detailProfit).unitCost}
                      showBreakdown
                    />
                    <YumiCalculatedAmount
                      calculation={profitCalculationOf(expectedProfit ?? detailProfit).unitProfit}
                      tone="profit"
                    />
                    <YumiCalculatedAmount
                      calculation={profitCalculationOf(expectedProfit ?? detailProfit).profitRate}
                    />
                    <YumiCalculatedAmount
                      calculation={
                        profitCalculationOf(expectedProfit ?? detailProfit).edgeIncrementalCost
                      }
                      showBreakdown
                    />
                  </div>
                ) : (
                  <YumiEmptyState description="商品不存在或已被删除。" title="无法读取预计盈利" />
                )}
              </YumiSection>
            </div>
          ) : null}
          {detailTab === 'capacity' ? (
            <div className="yumi-reference-workspace__sections">
              <YumiSection title="制作产能">
                <YumiDetailList
                  ariaLabel="商品产能参数"
                  items={[
                    { label: '模具数量', value: `${selected.moldCount}` },
                    { label: '每模每批产出', value: `${selected.outputPerMoldPerBatch} 件` },
                    { label: '每日最大批次数', value: `${selected.maxBatchesPerDay}` },
                    {
                      label: '日产能',
                      value:
                        selected.dailyCapacity > 0 ? `${selected.dailyCapacity} 件/日` : '未维护'
                    }
                  ]}
                />
              </YumiSection>
              <YumiSection title="预计单件时长">
                <YumiDetailList
                  ariaLabel="商品预计时长"
                  items={[
                    { label: '制作', value: `${selected.standardMakingMinutes} 分钟` },
                    {
                      label: '捏毛装袋',
                      value: `${selected.expectedFluffingBaggingMinutes} 分钟`
                    },
                    { label: '缝边', value: `${selected.expectedEdgeSewingMinutes} 分钟` },
                    { label: '打包发货', value: `${selected.expectedPackingMinutes} 分钟` }
                  ]}
                />
              </YumiSection>
            </div>
          ) : null}
          {detailTab === 'inventory' ? (
            <div className="yumi-reference-workspace__sections">
              <ProductInventoryPanel product={selected} />
            </div>
          ) : null}
        </>
      ) : (
        <YumiEmptyState description="请返回商品列表后重新选择商品。" title="商品不存在" />
      )}
    </div>
  )
}

function MoneyField({
  id,
  label,
  onChange,
  value
}: {
  id: string
  label: string
  onChange(value: string): void
  value: string
}) {
  return (
    <YumiField>
      <YumiFieldLabel htmlFor={id}>{label}</YumiFieldLabel>
      <YumiNumberField
        allowDecimal
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </YumiField>
  )
}

function MinutesField({
  id,
  label,
  onChange,
  value
}: {
  id: string
  label: string
  onChange(value: string): void
  value: string
}) {
  return (
    <YumiField>
      <YumiFieldLabel htmlFor={id}>{label}</YumiFieldLabel>
      <YumiNumberField id={id} onChange={(event) => onChange(event.target.value)} value={value} />
    </YumiField>
  )
}
