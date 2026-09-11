import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { V2NavigationTarget, V2Product, V2ProductInput } from '@shared/contracts/index'
import {
  formatGluePriceYuanPerGram,
  formatMilligramsAsGrams,
  parseGramsToMilligrams
} from '@shared/money'
import { centsToYuan, formatCents, getErrorMessage, yuanToCents } from '../../composables/v2-utils'
import { useProducts } from '../../composables/use-products'
import { useStudioSettings } from '../../composables/use-studio-settings'
import {
  YumiButton,
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
  YumiSelect,
  YumiSheet,
  YumiStatusTag,
  YumiTextArea,
  YumiTextField,
  useYumiNotificationMessage
} from '../../components/ui'

interface ProductDraft {
  name: string
  code: string
  category: string
  basePrice: string
  glueWeight: string
  unitWeight: string
  materialLossRate: string
  moldCount: string
  outputPerMoldPerBatch: string
  maxBatchesPerDay: string
  packagingCost: string
  accessoryCost: string
  replacementBagCost: string
  edgeCost: string
  standardMakingMinutes: string
  makingCommission: string
  notes: string
}

const emptyDraft = (): ProductDraft => ({
  name: '',
  code: '',
  category: '',
  basePrice: '0',
  glueWeight: '0',
  unitWeight: '0',
  materialLossRate: '0',
  moldCount: '0',
  outputPerMoldPerBatch: '0',
  maxBatchesPerDay: '0',
  packagingCost: '0',
  accessoryCost: '0',
  replacementBagCost: '0',
  edgeCost: '0',
  standardMakingMinutes: '0',
  makingCommission: '0',
  notes: ''
})
const toDraft = (product: V2Product): ProductDraft => ({
  name: product.name,
  code: product.code ?? '',
  category: product.category ?? '',
  basePrice: centsToYuan(product.basePriceCents),
  glueWeight: formatMilligramsAsGrams(product.glueWeightMilligrams),
  unitWeight: formatMilligramsAsGrams(product.unitWeightMilligrams),
  materialLossRate: String(product.materialLossRateBasisPoints / 100),
  moldCount: String(product.moldCount),
  outputPerMoldPerBatch: String(product.outputPerMoldPerBatch),
  maxBatchesPerDay: String(product.maxBatchesPerDay),
  packagingCost: centsToYuan(product.packagingCostCents),
  accessoryCost: centsToYuan(product.accessoryCostCents),
  replacementBagCost: centsToYuan(product.replacementBagCostCents),
  edgeCost: centsToYuan(product.internalEdgeCostCents),
  standardMakingMinutes: String(product.standardMakingMinutes),
  makingCommission: centsToYuan(product.makingCommissionCents),
  notes: product.notes ?? ''
})
const toInput = (draft: ProductDraft): V2ProductInput => ({
  name: draft.name,
  code: draft.code || null,
  category: draft.category || null,
  basePriceCents: yuanToCents(draft.basePrice),
  glueWeightMilligrams: parseGramsToMilligrams(draft.glueWeight),
  unitWeightMilligrams: parseGramsToMilligrams(draft.unitWeight),
  materialLossRateBasisPoints: Math.round((Number(draft.materialLossRate) || 0) * 100),
  moldCount: Math.round(Number(draft.moldCount) || 0),
  outputPerMoldPerBatch: Math.round(Number(draft.outputPerMoldPerBatch) || 0),
  maxBatchesPerDay: Math.round(Number(draft.maxBatchesPerDay) || 0),
  packagingCostCents: yuanToCents(draft.packagingCost),
  accessoryCostCents: yuanToCents(draft.accessoryCost),
  replacementBagCostCents: yuanToCents(draft.replacementBagCost),
  internalEdgeCostCents: yuanToCents(draft.edgeCost),
  standardMakingMinutes: Math.round(Number(draft.standardMakingMinutes) || 0),
  makingCommissionCents: yuanToCents(draft.makingCommission),
  notes: draft.notes || null
})

type ProductsPageProps = {
  navigationTarget?: Extract<V2NavigationTarget, { view: 'products' }> | null
}

export function ProductsPage({ navigationTarget }: ProductsPageProps) {
  const { products, loading, loadError, createProduct, updateProduct } = useProducts()
  const { settings, loading: settingsLoading, loadError: settingsError } = useStudioSettings()
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft)
  const [editing, setEditing] = useState<V2Product | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [viewing, setViewing] = useState<V2Product | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  useYumiNotificationMessage(loadError)
  useYumiNotificationMessage(settingsError)
  useYumiNotificationMessage(error)
  const editorTitle = editing ? `编辑商品：${editing.name}` : '新建商品'
  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(editing ? toDraft(editing) : emptyDraft()),
    [draft, editing]
  )
  const visibleProducts = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase()
    return products.filter((product) => {
      const matchesStatus =
        statusFilter === 'all' || (statusFilter === 'enabled' ? product.enabled : !product.enabled)
      const matchesQuery =
        !query ||
        [product.name, product.code, product.category, product.notes]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase()
          .includes(query)
      return matchesStatus && matchesQuery
    })
  }, [products, searchQuery, statusFilter])
  const updateDraft = (key: keyof ProductDraft, value: string) =>
    setDraft({ ...draft, [key]: value })
  const closeEditor = () => {
    setEditing(null)
    setDraft(emptyDraft())
    setError(null)
    setEditorOpen(false)
  }
  const openCreate = () => {
    setEditing(null)
    setDraft(emptyDraft())
    setError(null)
    setEditorOpen(true)
  }
  const closeDetail = () => {
    setViewing(null)
    setDetailOpen(false)
  }
  const openDetail = (product: V2Product) => {
    setViewing(product)
    setDetailOpen(true)
  }
  const openEdit = (product: V2Product) => {
    setEditing(product)
    setDraft(toDraft(product))
    setError(null)
    setEditorOpen(true)
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      if (editing)
        await updateProduct({ ...toInput(draft), id: editing.id, enabled: editing.enabled })
      else await createProduct(toInput(draft))
      closeEditor()
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }
  useEffect(() => {
    const productId = navigationTarget?.productId
    if (!productId) return
    const product = products.find((item) => item.id === productId)
    if (product) openDetail(product)
  }, [navigationTarget?.productId, products])
  const startEditingViewingProduct = () => {
    if (!viewing) return
    const product = viewing
    closeDetail()
    openEdit(product)
  }
  const gluePrice = settings
    ? `${formatGluePriceYuanPerGram(settings.gluePriceMicroYuanPerGram)} 元/克`
    : '正在读取工作室参数…'

  return (
    <div className="yumi-page yumi-reference-workspace">
      <YumiPageHeader
        actions={{
          ariaLabel: '商品页面动作',
          primaryAction: { label: '新建商品', onClick: openCreate }
        }}
        description="商品参数会在下单时冻结；胶水单价由工作室统一维护，商品只填写实际用量。"
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
                label: '商品 / 分类',
                render: (product) => (
                  <div className="yumi-list-cell">
                    <strong>{product.name}</strong>
                    <span>
                      {product.code || '未设编码'} · {product.category || '未分类'}
                    </span>
                    <span>
                      材料 {formatMilligramsAsGrams(product.unitWeightMilligrams)} 克 · 损耗{' '}
                      {product.materialLossRateBasisPoints / 100}%
                    </span>
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
                label: '标准制作',
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

      <YumiSheet
        description="商品资料默认只读展示；需要调整参数时再主动进入编辑。"
        footer={
          <>
            <YumiButton onClick={closeDetail} variant="ghost">
              关闭
            </YumiButton>
            <YumiButton onClick={startEditingViewingProduct} variant="primary">
              编辑商品
            </YumiButton>
          </>
        }
        onOpenChange={(open) => {
          if (!open) closeDetail()
        }}
        open={detailOpen}
        title={viewing ? `商品资料：${viewing.name}` : '商品资料'}
      >
        {viewing && (
          <div className="yumi-sheet-form">
            <YumiDetailList
              ariaLabel="商品基础资料"
              items={[
                { label: '商品编码', value: viewing.code || '未设编码' },
                { label: '分类', value: viewing.category || '未分类' },
                { label: '默认售价', value: formatCents(viewing.basePriceCents) },
                { label: '状态', value: viewing.enabled ? '启用' : '停用' },
                {
                  label: '单件材料重量',
                  value: `${formatMilligramsAsGrams(viewing.unitWeightMilligrams)} 克`
                },
                { label: '材料损耗率', value: `${viewing.materialLossRateBasisPoints / 100}%` },
                {
                  label: '日产能',
                  value: viewing.dailyCapacity > 0 ? `${viewing.dailyCapacity} 件/日` : '未维护'
                },
                { label: '标准制作', value: `${viewing.standardMakingMinutes} 分钟` }
              ]}
            />
            <YumiFormSection title="制作与成本参数">
              <YumiDetailList
                ariaLabel="商品制作与成本参数"
                items={[
                  {
                    label: '胶水用量',
                    value: `${formatMilligramsAsGrams(viewing.glueWeightMilligrams)} 克`
                  },
                  { label: '制作提成', value: formatCents(viewing.makingCommissionCents) },
                  { label: '包装', value: formatCents(viewing.packagingCostCents) },
                  { label: '配饰', value: formatCents(viewing.accessoryCostCents) },
                  { label: '替换袋', value: formatCents(viewing.replacementBagCostCents) },
                  { label: '内部缝边成本', value: formatCents(viewing.internalEdgeCostCents) }
                ]}
              />
              {viewing.notes ? <YumiFormMessage tone="hint">备注：{viewing.notes}</YumiFormMessage> : null}
            </YumiFormSection>
          </div>
        )}
      </YumiSheet>

      <YumiSheet
        description="保存后只影响后续新建订单；已建立订单会保留当时的商品与胶水单价快照。"
        dirty={isDirty}
        footer={
          <>
            <YumiButton onClick={closeEditor} variant="ghost">
              取消
            </YumiButton>
            <YumiButton
              form="product-editor-form"
              loading={submitting}
              type="submit"
              variant="primary"
            >
              {editing ? '保存商品' : '创建商品'}
            </YumiButton>
          </>
        }
        onOpenChange={(open) => {
          if (!open) closeEditor()
        }}
        open={editorOpen}
        title={editorTitle}
      >
        <form
          className="yumi-form-panel yumi-sheet-form"
          id="product-editor-form"
          onSubmit={submit}
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
              <YumiField>
                <YumiFieldLabel htmlFor="product-code">商品编码</YumiFieldLabel>
                <YumiTextField
                  id="product-code"
                  onChange={(event) => updateDraft('code', event.target.value)}
                  value={draft.code}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel htmlFor="product-category">分类</YumiFieldLabel>
                <YumiTextField
                  id="product-category"
                  onChange={(event) => updateDraft('category', event.target.value)}
                  value={draft.category}
                />
              </YumiField>
              <MoneyField
                id="product-base-price"
                label="基础售价（元）"
                onChange={(value) => updateDraft('basePrice', value)}
                value={draft.basePrice}
              />
            </div>
          </YumiFormSection>
          <YumiFormSection
            description={
              <>
                工作室胶水单价：{settingsLoading ? '正在读取…' : gluePrice}
                。此处仅维护内部核算成本；客户是否缝边、缝边数量和对客单价均在订单中决定。
              </>
            }
            title="制作与成本参数"
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
              <YumiField>
                <YumiFieldLabel htmlFor="product-material-loss-rate">
                  材料损耗率（%）
                </YumiFieldLabel>
                <YumiNumberField
                  allowDecimal
                  id="product-material-loss-rate"
                  onChange={(event) => updateDraft('materialLossRate', event.target.value)}
                  value={draft.materialLossRate}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel htmlFor="product-glue-weight">胶水用量（克）</YumiFieldLabel>
                <YumiNumberField
                  allowDecimal
                  id="product-glue-weight"
                  onChange={(event) => updateDraft('glueWeight', event.target.value)}
                  value={draft.glueWeight}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel htmlFor="product-mold-count">模具数量</YumiFieldLabel>
                <YumiNumberField
                  id="product-mold-count"
                  onChange={(event) => updateDraft('moldCount', event.target.value)}
                  value={draft.moldCount}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel htmlFor="product-output-per-mold">
                  每模每批产出（件）
                </YumiFieldLabel>
                <YumiNumberField
                  id="product-output-per-mold"
                  onChange={(event) => updateDraft('outputPerMoldPerBatch', event.target.value)}
                  value={draft.outputPerMoldPerBatch}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel htmlFor="product-max-batches">每日最大批次数</YumiFieldLabel>
                <YumiNumberField
                  id="product-max-batches"
                  onChange={(event) => updateDraft('maxBatchesPerDay', event.target.value)}
                  value={draft.maxBatchesPerDay}
                />
              </YumiField>
              <YumiField>
                <YumiFieldLabel>计算日产能</YumiFieldLabel>
                <YumiFormMessage tone="hint">
                  {Number(draft.moldCount) > 0 &&
                  Number(draft.outputPerMoldPerBatch) > 0 &&
                  Number(draft.maxBatchesPerDay) > 0
                    ? `${Math.round(Number(draft.moldCount) * Number(draft.outputPerMoldPerBatch) * Number(draft.maxBatchesPerDay))} 件/日`
                    : '填写完整模具参数后计算'}
                </YumiFormMessage>
              </YumiField>
              <YumiField>
                <YumiFieldLabel htmlFor="product-standard-making-minutes">
                  标准制作分钟
                </YumiFieldLabel>
                <YumiNumberField
                  id="product-standard-making-minutes"
                  onChange={(event) => updateDraft('standardMakingMinutes', event.target.value)}
                  value={draft.standardMakingMinutes}
                />
              </YumiField>
              <MoneyField
                id="product-making-commission"
                label="制作提成（元）"
                onChange={(value) => updateDraft('makingCommission', value)}
                value={draft.makingCommission}
              />
              <MoneyField
                id="product-packaging-cost"
                label="包装（元）"
                onChange={(value) => updateDraft('packagingCost', value)}
                value={draft.packagingCost}
              />
              <MoneyField
                id="product-accessory-cost"
                label="配饰（元）"
                onChange={(value) => updateDraft('accessoryCost', value)}
                value={draft.accessoryCost}
              />
              <MoneyField
                id="product-replacement-bag-cost"
                label="替换袋（元）"
                onChange={(value) => updateDraft('replacementBagCost', value)}
                value={draft.replacementBagCost}
              />
              <MoneyField
                id="product-edge-cost"
                label="内部缝边成本（元）"
                onChange={(value) => updateDraft('edgeCost', value)}
                value={draft.edgeCost}
              />
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
      </YumiSheet>
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
