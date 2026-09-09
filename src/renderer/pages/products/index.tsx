import { useMemo, useState, type FormEvent } from 'react'
import type { V2Product, V2ProductInput } from '@shared/contracts/index'
import { formatGluePriceYuanPerGram, formatMilligramsAsGrams, parseGramsToMilligrams } from '@shared/money'
import { centsToYuan, formatCents, getErrorMessage, yuanToCents } from '../../composables/v2-utils'
import { useProducts } from '../../composables/use-products'
import { useStudioSettings } from '../../composables/use-studio-settings'
import {
  YumiBusinessList,
  YumiBusinessListItem,
  YumiButton,
  YumiEmptyState,
  YumiField,
  YumiFieldLabel,
  YumiNumberField,
  YumiPageHeader,
  YumiSheet,
  YumiStatusTag,
  YumiTextArea,
  YumiTextField
} from '../../components/ui'

interface ProductDraft {
  name: string
  code: string
  category: string
  basePrice: string
  glueWeight: string
  packagingCost: string
  accessoryCost: string
  replacementBagCost: string
  edgeCost: string
  standardMakingMinutes: string
  makingCommission: string
  notes: string
}

const emptyDraft = (): ProductDraft => ({
  name: '', code: '', category: '', basePrice: '0', glueWeight: '0', packagingCost: '0', accessoryCost: '0',
  replacementBagCost: '0', edgeCost: '0', standardMakingMinutes: '0', makingCommission: '0', notes: ''
})
const toDraft = (product: V2Product): ProductDraft => ({
  name: product.name, code: product.code ?? '', category: product.category ?? '', basePrice: centsToYuan(product.basePriceCents),
  glueWeight: formatMilligramsAsGrams(product.glueWeightMilligrams), packagingCost: centsToYuan(product.packagingCostCents),
  accessoryCost: centsToYuan(product.accessoryCostCents), replacementBagCost: centsToYuan(product.replacementBagCostCents),
  edgeCost: centsToYuan(product.edgeCostCents), standardMakingMinutes: String(product.standardMakingMinutes),
  makingCommission: centsToYuan(product.makingCommissionCents), notes: product.notes ?? ''
})
const toInput = (draft: ProductDraft): V2ProductInput => ({
  name: draft.name, code: draft.code || null, category: draft.category || null,
  basePriceCents: yuanToCents(draft.basePrice), glueWeightMilligrams: parseGramsToMilligrams(draft.glueWeight),
  packagingCostCents: yuanToCents(draft.packagingCost), accessoryCostCents: yuanToCents(draft.accessoryCost),
  replacementBagCostCents: yuanToCents(draft.replacementBagCost), edgeCostCents: yuanToCents(draft.edgeCost),
  standardMakingMinutes: Math.round(Number(draft.standardMakingMinutes) || 0),
  makingCommissionCents: yuanToCents(draft.makingCommission), notes: draft.notes || null
})

export function ProductsPage() {
  const { products, loading, loadError, createProduct, updateProduct } = useProducts()
  const { settings, loading: settingsLoading, loadError: settingsError } = useStudioSettings()
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft)
  const [editing, setEditing] = useState<V2Product | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editorTitle = editing ? `编辑商品：${editing.name}` : '新建商品'
  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(editing ? toDraft(editing) : emptyDraft()), [draft, editing])
  const updateDraft = (key: keyof ProductDraft, value: string) => setDraft({ ...draft, [key]: value })
  const closeEditor = () => { setEditing(null); setDraft(emptyDraft()); setError(null); setEditorOpen(false) }
  const openCreate = () => { setEditing(null); setDraft(emptyDraft()); setError(null); setEditorOpen(true) }
  const openEdit = (product: V2Product) => { setEditing(product); setDraft(toDraft(product)); setError(null); setEditorOpen(true) }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      if (editing) await updateProduct({ ...toInput(draft), id: editing.id, enabled: editing.enabled })
      else await createProduct(toInput(draft))
      closeEditor()
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }
  const gluePrice = settings ? `${formatGluePriceYuanPerGram(settings.gluePriceMicroYuanPerGram)} 元/克` : '正在读取工作室参数…'

  return <div className="yumi-page yumi-reference-workspace">
    <YumiPageHeader
      actions={<YumiButton onClick={openCreate} variant="primary">新建商品</YumiButton>}
      description="商品参数会在下单时冻结；胶水单价由工作室统一维护，商品只填写实际用量。"
      title="商品"
    />
    {(loadError || settingsError) && <p className="yumi-feedback yumi-feedback--danger" role="alert">{loadError ?? settingsError}</p>}
    <div className="yumi-primary-list" aria-label="商品列表">
      {loading ? <div className="yumi-empty">正在加载商品…</div> : products.length === 0 ? <YumiEmptyState description="点击右上角“新建商品”后，负责人即可在新增订单时主动选择。" scenario="first-use" title="还没有商品资料" /> : <YumiBusinessList>
        {products.map((product) => <YumiBusinessListItem
          key={product.id}
          metrics={[{ label: '默认售价', value: formatCents(product.basePriceCents) }, { label: '标准制作', value: `${product.standardMakingMinutes} 分钟` }]}
          onOpen={() => openEdit(product)}
          status={<YumiStatusTag tone={product.enabled ? 'success' : 'neutral'}>{product.enabled ? '启用' : '停用'}</YumiStatusTag>}
          summary={`${product.code || '未设编码'} · ${product.category || '未分类'} · 制作提成 ${formatCents(product.makingCommissionCents)}`}
          title={product.name}
        >
          <span>胶水用量 {formatMilligramsAsGrams(product.glueWeightMilligrams)} 克 · 包装 {formatCents(product.packagingCostCents)} · 配饰 {formatCents(product.accessoryCostCents)}</span>
          {product.notes ? <span>备注：{product.notes}</span> : null}
        </YumiBusinessListItem>)}
      </YumiBusinessList>}
    </div>

    <YumiSheet
      description="保存后只影响后续新建订单；已建立订单会保留当时的商品与胶水单价快照。"
      dirty={isDirty}
      footer={<><YumiButton onClick={closeEditor} variant="ghost">取消</YumiButton><YumiButton form="product-editor-form" loading={submitting} type="submit" variant="primary">{editing ? '保存商品' : '创建商品'}</YumiButton></>}
      onOpenChange={(open) => { if (!open) closeEditor() }}
      open={editorOpen}
      title={editorTitle}
    >
      <form className="yumi-form-panel yumi-sheet-form" id="product-editor-form" onSubmit={submit}>
        <section className="yumi-product-editor-section" aria-labelledby="product-basic-heading">
          <h3 id="product-basic-heading">基础资料</h3>
          <div className="yumi-form-grid yumi-form-grid--two">
            <YumiField><YumiFieldLabel htmlFor="product-name" required>商品名称</YumiFieldLabel><YumiTextField id="product-name" onChange={(event) => updateDraft('name', event.target.value)} required value={draft.name} /></YumiField>
            <YumiField><YumiFieldLabel htmlFor="product-code">商品编码</YumiFieldLabel><YumiTextField id="product-code" onChange={(event) => updateDraft('code', event.target.value)} value={draft.code} /></YumiField>
            <YumiField><YumiFieldLabel htmlFor="product-category">分类</YumiFieldLabel><YumiTextField id="product-category" onChange={(event) => updateDraft('category', event.target.value)} value={draft.category} /></YumiField>
            <MoneyField id="product-base-price" label="基础售价（元）" onChange={(value) => updateDraft('basePrice', value)} value={draft.basePrice} />
          </div>
        </section>
        <section className="yumi-product-editor-section" aria-labelledby="product-cost-heading">
          <h3 id="product-cost-heading">制作与成本参数</h3>
          <p className="yumi-field-hint">工作室胶水单价：{settingsLoading ? '正在读取…' : gluePrice}。单价请到「设置 → 工作室参数」统一调整。</p>
          <div className="yumi-form-grid yumi-form-grid--two">
            <YumiField><YumiFieldLabel htmlFor="product-glue-weight">胶水用量（克）</YumiFieldLabel><YumiNumberField allowDecimal id="product-glue-weight" onChange={(event) => updateDraft('glueWeight', event.target.value)} value={draft.glueWeight} /></YumiField>
            <YumiField><YumiFieldLabel htmlFor="product-standard-making-minutes">标准制作分钟</YumiFieldLabel><YumiNumberField id="product-standard-making-minutes" onChange={(event) => updateDraft('standardMakingMinutes', event.target.value)} value={draft.standardMakingMinutes} /></YumiField>
            <MoneyField id="product-making-commission" label="制作提成（元）" onChange={(value) => updateDraft('makingCommission', value)} value={draft.makingCommission} />
            <MoneyField id="product-packaging-cost" label="包装（元）" onChange={(value) => updateDraft('packagingCost', value)} value={draft.packagingCost} />
            <MoneyField id="product-accessory-cost" label="配饰（元）" onChange={(value) => updateDraft('accessoryCost', value)} value={draft.accessoryCost} />
            <MoneyField id="product-replacement-bag-cost" label="替换袋（元）" onChange={(value) => updateDraft('replacementBagCost', value)} value={draft.replacementBagCost} />
            <MoneyField id="product-edge-cost" label="封边（元）" onChange={(value) => updateDraft('edgeCost', value)} value={draft.edgeCost} />
          </div>
        </section>
        <YumiField><YumiFieldLabel htmlFor="product-notes">备注</YumiFieldLabel><YumiTextArea id="product-notes" onChange={(event) => updateDraft('notes', event.target.value)} value={draft.notes} /></YumiField>
        {error && <p className="yumi-feedback yumi-feedback--danger" role="alert">{error}</p>}
      </form>
    </YumiSheet>
  </div>
}

function MoneyField({ id, label, onChange, value }: { id: string; label: string; onChange(value: string): void; value: string }) {
  return <YumiField><YumiFieldLabel htmlFor={id}>{label}</YumiFieldLabel><YumiNumberField allowDecimal id={id} onChange={(event) => onChange(event.target.value)} value={value} /></YumiField>
}
