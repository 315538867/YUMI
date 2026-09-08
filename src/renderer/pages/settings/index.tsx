import { useState, type FormEvent } from 'react'
import type { V2AdvancePayer, V2FinanceCategory } from '@shared/contracts/index'
import { getErrorMessage } from '../../composables/v2-utils'
import { useFinance } from '../../composables/use-finance'
import {
  YumiBusinessList,
  YumiBusinessListItem,
  YumiButton,
  YumiConfirmDialog,
  YumiDialog,
  YumiEmptyState,
  YumiField,
  YumiFieldLabel,
  YumiPageHeader,
  YumiSelect,
  YumiStatusTag,
  YumiTextArea,
  YumiTextField
} from '../../components/ui'

type CategoryEditor = { direction: 'income' | 'expense'; item?: V2FinanceCategory } | null
type PayerEditor = V2AdvancePayer | 'create' | null
type PendingDelete = { id: string; kind: 'category' | 'payer'; name: string } | null
type LibraryView = 'income' | 'expense' | 'payer'

export function SettingsPage() {
  const { categories, advancePayers, loading, loadError, createCategory, updateCategory, deleteCategory, createAdvancePayer, updateAdvancePayer, deleteAdvancePayer } = useFinance()
  const [libraryView, setLibraryView] = useState<LibraryView>('income')
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditor>(null)
  const [payerEditor, setPayerEditor] = useState<PayerEditor>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)

  const run = async (key: string, action: () => Promise<unknown>) => {
    setError(null)
    setSubmitting(key)
    try {
      await action()
      return true
    } catch (cause) {
      setError(getErrorMessage(cause))
      return false
    } finally {
      setSubmitting(null)
    }
  }
  const saveCategory = async (input: { name: string; enabled: boolean }) => {
    if (!categoryEditor) return
    const success = categoryEditor.item
      ? await run(`category-${categoryEditor.item.id}`, () => updateCategory(categoryEditor.item!.id, input))
      : await run(`category-create-${categoryEditor.direction}`, () => createCategory({ direction: categoryEditor.direction, name: input.name }))
    if (success) setCategoryEditor(null)
  }
  const savePayer = async (input: { name: string; note: string | null; enabled: boolean }) => {
    if (!payerEditor) return
    const success = payerEditor === 'create'
      ? await run('payer-create', () => createAdvancePayer({ name: input.name, note: input.note }))
      : await run(`payer-${payerEditor.id}`, () => updateAdvancePayer(payerEditor.id, input))
    if (success) setPayerEditor(null)
  }
  const confirmDelete = async () => {
    if (!pendingDelete) return
    const success = pendingDelete.kind === 'category'
      ? await run(`category-delete-${pendingDelete.id}`, () => deleteCategory(pendingDelete.id))
      : await run(`payer-delete-${pendingDelete.id}`, () => deleteAdvancePayer(pendingDelete.id))
    if (success) setPendingDelete(null)
  }
  const incomeCategories = categories.filter((item) => item.direction === 'income')
  const expenseCategories = categories.filter((item) => item.direction === 'expense')

  const activeCategoryDirection = libraryView === 'expense' ? 'expense' : 'income'
  const activeCategories = activeCategoryDirection === 'income' ? incomeCategories : expenseCategories
  const activeCategoryLabel = activeCategoryDirection === 'income' ? '收入类目' : '支出类目'
  const changeLibraryView = (nextView: LibraryView) => {
    setError(null)
    setLibraryView(nextView)
  }
  const openCreate = () => {
    if (libraryView === 'payer') {
      setPayerEditor('create')
      return
    }
    setCategoryEditor({ direction: activeCategoryDirection })
  }

  return <div className="yumi-page yumi-settings-workspace">
    <YumiPageHeader
      actions={<YumiButton onClick={openCreate} variant="primary">{libraryView === 'payer' ? '新增垫付人' : `新增${activeCategoryLabel}`}</YumiButton>}
      description="维护财务登记可选的收入类目、支出类目和私人垫付人；已被财务流水引用的资料不能删除，可改名或停用。"
      title="财务设置"
    />
    {loadError && <p className="yumi-feedback yumi-feedback--danger" role="alert">{loadError}</p>}
    {error && <p className="yumi-feedback yumi-feedback--danger" role="alert">{error}</p>}

    <div className="yumi-library-workspace">
      <nav aria-label="财务资料类型" className="yumi-page-tabs">
        <YumiButton aria-pressed={libraryView === 'income'} onClick={() => changeLibraryView('income')} variant={libraryView === 'income' ? 'primary' : 'secondary'}>收入类目</YumiButton>
        <YumiButton aria-pressed={libraryView === 'expense'} onClick={() => changeLibraryView('expense')} variant={libraryView === 'expense' ? 'primary' : 'secondary'}>支出类目</YumiButton>
        <YumiButton aria-pressed={libraryView === 'payer'} onClick={() => changeLibraryView('payer')} variant={libraryView === 'payer' ? 'primary' : 'secondary'}>私人垫付人</YumiButton>
      </nav>

      {libraryView === 'payer' ? (
        <ResourceLibraryList
          emptyDescription="建立垫付人后，私人支付的支出才可在财务登记中选择对应来源。"
          emptyTitle="暂无私人垫付人"
          items={advancePayers}
          loading={loading}
          onDelete={(item) => setPendingDelete({ id: item.id, kind: 'payer', name: item.name })}
          onEdit={(item) => setPayerEditor(item)}
          summary={(item) => item.note || '暂无备注'}
        />
      ) : (
        <ResourceLibraryList
          emptyDescription={`建立${activeCategoryLabel}后，财务登记时才可选择对应类目。`}
          emptyTitle={`暂无${activeCategoryLabel}`}
          items={activeCategories}
          loading={loading}
          onDelete={(item) => setPendingDelete({ id: item.id, kind: 'category', name: item.name })}
          onEdit={(item) => setCategoryEditor({ direction: item.direction, item })}
          summary={(item) => item.enabled ? '可在财务登记中选择' : '已停用，不再用于新的财务登记'}
        />
      )}
    </div>

    <YumiDialog
      footer={<CategoryDialogFooter busy={submitting !== null} editing={Boolean(categoryEditor?.item)} />}
      onOpenChange={(open) => { if (!open) setCategoryEditor(null) }}
      open={categoryEditor !== null}
      title={categoryEditor?.item ? `编辑${categoryEditor.item.direction === 'income' ? '收入' : '支出'}类目` : `新增${categoryEditor?.direction === 'income' ? '收入' : '支出'}类目`}
    >
      {categoryEditor && <CategoryEditorForm key={categoryEditor.item?.id ?? `new-${categoryEditor.direction}`} item={categoryEditor.item} onSubmit={saveCategory} />}
    </YumiDialog>
    <YumiDialog
      footer={<PayerDialogFooter busy={submitting !== null} editing={payerEditor !== 'create'} />}
      onOpenChange={(open) => { if (!open) setPayerEditor(null) }}
      open={payerEditor !== null}
      title={payerEditor === 'create' ? '新增垫付人' : `编辑垫付人：${payerEditor?.name ?? ''}`}
    >
      {payerEditor && <PayerEditorForm key={payerEditor === 'create' ? 'new-payer' : payerEditor.id} item={payerEditor === 'create' ? undefined : payerEditor} onSubmit={savePayer} />}
    </YumiDialog>
    <YumiConfirmDialog
      confirmLabel="确认删除"
      description={pendingDelete ? `将删除“${pendingDelete.name}”。如果资料已被财务流水引用，系统会保留原有数据并拒绝删除。` : undefined}
      onConfirm={() => void confirmDelete()}
      onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
      open={pendingDelete !== null}
      title="删除基础资料？"
    />
  </div>
}


function ResourceLibraryList<T extends V2FinanceCategory | V2AdvancePayer>({
  emptyDescription,
  emptyTitle,
  items,
  loading,
  onDelete,
  onEdit,
  summary
}: {
  emptyDescription: string
  emptyTitle: string
  items: T[]
  loading: boolean
  onDelete(item: T): void
  onEdit(item: T): void
  summary(item: T): string
}) {
  if (loading) return <div className="yumi-empty">加载中…</div>
  if (items.length === 0) return <YumiEmptyState description={emptyDescription} title={emptyTitle} />
  return <YumiBusinessList>
    {items.map((item) => <YumiBusinessListItem
      key={item.id}
      meta={<YumiButton onClick={(event) => { event.stopPropagation(); onDelete(item) }} variant="ghost">删除</YumiButton>}
      onOpen={() => onEdit(item)}
      status={<YumiStatusTag tone={item.enabled ? 'success' : 'neutral'}>{item.enabled ? '启用' : '已停用'}</YumiStatusTag>}
      summary={summary(item)}
      title={item.name}
    />)}
  </YumiBusinessList>
}

function CategoryEditorForm({ item, onSubmit }: { item?: V2FinanceCategory; onSubmit(input: { name: string; enabled: boolean }): void }) {
  const [name, setName] = useState(item?.name ?? '')
  const [enabled, setEnabled] = useState(item?.enabled ?? true)
  return <form className="yumi-form-panel yumi-sheet-form" id="category-editor-form" onSubmit={(event: FormEvent) => { event.preventDefault(); onSubmit({ name, enabled }) }}>
    <YumiField><YumiFieldLabel htmlFor="finance-category-name" required>类目名称</YumiFieldLabel><YumiTextField id="finance-category-name" onChange={(event) => setName(event.target.value)} required value={name} /></YumiField>
    {item && <YumiField><YumiFieldLabel>状态</YumiFieldLabel><YumiSelect aria-label="类目状态" onValueChange={(value) => setEnabled(value === 'enabled')} options={[{ label: '启用', value: 'enabled' }, { label: '停用', value: 'disabled' }]} value={enabled ? 'enabled' : 'disabled'} /></YumiField>}
  </form>
}

function PayerEditorForm({ item, onSubmit }: { item?: V2AdvancePayer; onSubmit(input: { name: string; note: string | null; enabled: boolean }): void }) {
  const [name, setName] = useState(item?.name ?? '')
  const [note, setNote] = useState(item?.note ?? '')
  const [enabled, setEnabled] = useState(item?.enabled ?? true)
  return <form className="yumi-form-panel yumi-sheet-form" id="payer-editor-form" onSubmit={(event: FormEvent) => { event.preventDefault(); onSubmit({ name, note: note || null, enabled }) }}>
    <YumiField><YumiFieldLabel htmlFor="advance-payer-name" required>姓名</YumiFieldLabel><YumiTextField id="advance-payer-name" onChange={(event) => setName(event.target.value)} required value={name} /></YumiField>
    <YumiField><YumiFieldLabel htmlFor="advance-payer-note">备注</YumiFieldLabel><YumiTextArea id="advance-payer-note" onChange={(event) => setNote(event.target.value)} value={note} /></YumiField>
    {item && <YumiField><YumiFieldLabel>状态</YumiFieldLabel><YumiSelect aria-label="垫付人状态" onValueChange={(value) => setEnabled(value === 'enabled')} options={[{ label: '启用', value: 'enabled' }, { label: '停用', value: 'disabled' }]} value={enabled ? 'enabled' : 'disabled'} /></YumiField>}
  </form>
}

function CategoryDialogFooter({ busy, editing }: { busy: boolean; editing: boolean }) {
  return <YumiButton form="category-editor-form" loading={busy} type="submit" variant="primary">{editing ? '保存类目' : '创建类目'}</YumiButton>
}
function PayerDialogFooter({ busy, editing }: { busy: boolean; editing: boolean }) {
  return <YumiButton form="payer-editor-form" loading={busy} type="submit" variant="primary">{editing ? '保存垫付人' : '创建垫付人'}</YumiButton>
}
