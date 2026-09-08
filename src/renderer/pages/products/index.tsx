import { useState, type FormEvent } from 'react'
import { Badge, Button, Flex, Heading, Text, TextArea, TextField } from '@radix-ui/themes'
import type { V2Product, V2ProductInput } from '@shared/contracts/index'
import { centsToYuan, formatCents, getErrorMessage, yuanToCents } from '../../composables/v2-utils'
import { useProducts } from '../../composables/use-products'

interface ProductDraft {
  name: string
  code: string
  category: string
  basePrice: string
  materialCost: string
  packagingCost: string
  accessoryCost: string
  replacementBagCost: string
  edgeCost: string
  standardMakingMinutes: string
  makingCommission: string
  makingGlueCost: string
  notes: string
}

const emptyDraft = (): ProductDraft => ({
  name: '', code: '', category: '', basePrice: '0', materialCost: '0', packagingCost: '0', accessoryCost: '0',
  replacementBagCost: '0', edgeCost: '0', standardMakingMinutes: '0', makingCommission: '0', makingGlueCost: '0', notes: ''
})
const toDraft = (product: V2Product): ProductDraft => ({
  name: product.name, code: product.code ?? '', category: product.category ?? '', basePrice: centsToYuan(product.basePriceCents),
  materialCost: centsToYuan(product.materialCostCents), packagingCost: centsToYuan(product.packagingCostCents),
  accessoryCost: centsToYuan(product.accessoryCostCents), replacementBagCost: centsToYuan(product.replacementBagCostCents),
  edgeCost: centsToYuan(product.edgeCostCents), standardMakingMinutes: String(product.standardMakingMinutes),
  makingCommission: centsToYuan(product.makingCommissionCents), makingGlueCost: centsToYuan(product.makingGlueCostCents), notes: product.notes ?? ''
})
const toInput = (draft: ProductDraft): V2ProductInput => ({
  name: draft.name, code: draft.code || null, category: draft.category || null,
  basePriceCents: yuanToCents(draft.basePrice), materialCostCents: yuanToCents(draft.materialCost),
  packagingCostCents: yuanToCents(draft.packagingCost), accessoryCostCents: yuanToCents(draft.accessoryCost),
  replacementBagCostCents: yuanToCents(draft.replacementBagCost), edgeCostCents: yuanToCents(draft.edgeCost),
  standardMakingMinutes: Math.round(Number(draft.standardMakingMinutes) || 0),
  makingCommissionCents: yuanToCents(draft.makingCommission), makingGlueCostCents: yuanToCents(draft.makingGlueCost),
  notes: draft.notes || null
})

export function ProductsPage() {
  const { products, loading, loadError, createProduct, updateProduct } = useProducts()
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft)
  const [editing, setEditing] = useState<V2Product | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const updateDraft = (key: keyof ProductDraft, value: string) => setDraft({ ...draft, [key]: value })

  const openCreate = () => { setEditing(null); setDraft(emptyDraft()); setError(null) }
  const openEdit = (product: V2Product) => { setEditing(product); setDraft(toDraft(product)); setError(null) }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      if (editing) await updateProduct({ ...toInput(draft), id: editing.id, enabled: editing.enabled })
      else await createProduct(toInput(draft))
      openCreate()
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally { setSubmitting(false) }
  }

  return (
    <section className="v2-page">
      <Flex justify="between" align="center" gap="4" className="page-title-row">
        <div><Heading size="6">商品</Heading><Text as="p" color="gray">商品的价格、成本与制作参数会在下单时冻结为订单快照。</Text></div>
        <Button onClick={openCreate}>新建商品</Button>
      </Flex>
      <div className="v2-two-column">
        <div className="panel"><Heading size="4">商品列表</Heading>
          {loadError && <p className="form-error">{loadError}</p>}
          {loading ? <p className="empty">正在加载商品…</p> : <div className="data-list">
            {products.map((product) => <button type="button" className="data-list-row" key={product.id} onClick={() => openEdit(product)}>
              <span><strong>{product.name}</strong><small>{product.code || '未设编码'} · {product.category || '未分类'} · 默认售价 {formatCents(product.basePriceCents)}</small></span>
              <Badge color={product.enabled ? 'green' : 'gray'}>{product.enabled ? '启用' : '停用'}</Badge>
            </button>)}
            {!products.length && <p className="empty">还没有商品。创建商品后即可建立订单。</p>}
          </div>}
        </div>
        <form className="panel v2-form" onSubmit={submit}>
          <Heading size="4">{editing ? `编辑商品：${editing.name}` : '新建商品'}</Heading>
          <div className="form-grid two"><label>商品名称<TextField.Root required value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} /></label><label>商品编码<TextField.Root value={draft.code} onChange={(event) => updateDraft('code', event.target.value)} /></label><label>分类<TextField.Root value={draft.category} onChange={(event) => updateDraft('category', event.target.value)} /></label><label>基础售价（元）<TextField.Root type="number" min="0" step="0.01" value={draft.basePrice} onChange={(event) => updateDraft('basePrice', event.target.value)} /></label></div>
          <Heading size="3">单件成本与制作参数</Heading>
          <div className="form-grid three">
            <label>原材料（元）<TextField.Root type="number" min="0" step="0.01" value={draft.materialCost} onChange={(event) => updateDraft('materialCost', event.target.value)} /></label>
            <label>包装（元）<TextField.Root type="number" min="0" step="0.01" value={draft.packagingCost} onChange={(event) => updateDraft('packagingCost', event.target.value)} /></label>
            <label>配饰（元）<TextField.Root type="number" min="0" step="0.01" value={draft.accessoryCost} onChange={(event) => updateDraft('accessoryCost', event.target.value)} /></label>
            <label>替换袋（元）<TextField.Root type="number" min="0" step="0.01" value={draft.replacementBagCost} onChange={(event) => updateDraft('replacementBagCost', event.target.value)} /></label>
            <label>封边（元）<TextField.Root type="number" min="0" step="0.01" value={draft.edgeCost} onChange={(event) => updateDraft('edgeCost', event.target.value)} /></label>
            <label>标准制作分钟<TextField.Root type="number" min="0" step="1" value={draft.standardMakingMinutes} onChange={(event) => updateDraft('standardMakingMinutes', event.target.value)} /></label>
            <label>制作提成（元）<TextField.Root type="number" min="0" step="0.01" value={draft.makingCommission} onChange={(event) => updateDraft('makingCommission', event.target.value)} /></label>
            <label>制作胶水（元）<TextField.Root type="number" min="0" step="0.01" value={draft.makingGlueCost} onChange={(event) => updateDraft('makingGlueCost', event.target.value)} /></label>
          </div>
          <label>备注<TextArea value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} /></label>
          {error && <p className="form-error">{error}</p>}
          <Flex gap="3" justify="end">{editing && <Button type="button" variant="soft" color="gray" onClick={openCreate}>取消编辑</Button>}<Button type="submit" disabled={submitting}>{submitting ? '保存中…' : editing ? '保存商品' : '创建商品'}</Button></Flex>
        </form>
      </div>
    </section>
  )
}
