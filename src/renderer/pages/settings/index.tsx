import { useState, type FormEvent } from 'react'
import { Badge, Button, Flex, Heading, Text, TextArea, TextField } from '@radix-ui/themes'
import type { V2AdvancePayer, V2FinanceCategory } from '@shared/contracts/index'
import { getErrorMessage } from '../../composables/v2-utils'
import { useFinance } from '../../composables/use-finance'

export function SettingsPage() {
  const { categories, advancePayers, loading, loadError, createCategory, updateCategory, deleteCategory, createAdvancePayer, updateAdvancePayer, deleteAdvancePayer } = useFinance()
  const [incomeCategoryName, setIncomeCategoryName] = useState('')
  const [expenseCategoryName, setExpenseCategoryName] = useState('')
  const [payerName, setPayerName] = useState('')
  const [payerNote, setPayerNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const run = async (key: string, action: () => Promise<unknown>) => {
    setError(null); setSubmitting(key)
    try { await action() } catch (cause) { setError(getErrorMessage(cause)) } finally { setSubmitting(null) }
  }
  const handleCategoryCreate = (direction: 'income' | 'expense', name: string, clear: () => void) => async (event: FormEvent) => {
    event.preventDefault()
    await run(`category-${direction}`, async () => { await createCategory({ direction, name }); clear() })
  }
  const handlePayerCreate = async (event: FormEvent) => {
    event.preventDefault()
    await run('payer-create', async () => { await createAdvancePayer({ name: payerName, note: payerNote || null }); setPayerName(''); setPayerNote('') })
  }

  return <section className="v2-page settings-workspace">
    <div className="page-heading"><div><Text size="2" color="gray">动态基础资料</Text><Heading size="7">财务设置</Heading><Text as="p" color="gray">类目和垫付人可新增、改名和停用；已被财务流水引用的资料不能删除。</Text></div><Badge color="orange">仅负责人维护</Badge></div>
    {loadError && <div className="panel"><Text color="red">{loadError}</Text></div>}
    {error && <div className="panel"><Text color="red">{error}</Text></div>}
    <div className="two-column">
      <section className="panel settings-panel"><Heading size="4">日常收入类目</Heading><CategoryCreator value={incomeCategoryName} onChange={setIncomeCategoryName} submitting={submitting === 'category-income'} onSubmit={handleCategoryCreate('income', incomeCategoryName, () => setIncomeCategoryName(''))} />{loading ? <div className="empty">加载中…</div> : <CategoryList items={categories.filter((item) => item.direction === 'income')} submitting={submitting} onUpdate={(id, input) => run(`category-${id}`, () => updateCategory(id, input))} onDelete={(id) => run(`category-delete-${id}`, () => deleteCategory(id))} />}</section>
      <section className="panel settings-panel"><Heading size="4">日常支出类目</Heading><CategoryCreator value={expenseCategoryName} onChange={setExpenseCategoryName} submitting={submitting === 'category-expense'} onSubmit={handleCategoryCreate('expense', expenseCategoryName, () => setExpenseCategoryName(''))} />{loading ? <div className="empty">加载中…</div> : <CategoryList items={categories.filter((item) => item.direction === 'expense')} submitting={submitting} onUpdate={(id, input) => run(`category-${id}`, () => updateCategory(id, input))} onDelete={(id) => run(`category-delete-${id}`, () => deleteCategory(id))} />}</section>
    </div>
    <section className="panel settings-panel"><Heading size="4">私人垫付人</Heading><form className="form-grid three" onSubmit={handlePayerCreate}><label>姓名<TextField.Root required value={payerName} onChange={(event) => setPayerName(event.target.value)} /></label><label>备注<TextArea value={payerNote} onChange={(event) => setPayerNote(event.target.value)} /></label><Flex align="end"><Button type="submit" disabled={submitting === 'payer-create'}>{submitting === 'payer-create' ? '新增中…' : '新增垫付人'}</Button></Flex></form>{loading ? <div className="empty">加载中…</div> : <PayerList items={advancePayers} submitting={submitting} onUpdate={(id, input) => run(`payer-${id}`, () => updateAdvancePayer(id, input))} onDelete={(id) => run(`payer-delete-${id}`, () => deleteAdvancePayer(id))} />}</section>
  </section>
}

function CategoryCreator({ value, onChange, submitting, onSubmit }: { value: string; onChange: (value: string) => void; submitting: boolean; onSubmit: (event: FormEvent) => void }) {
  return <form className="inline-entry" onSubmit={onSubmit}><TextField.Root required value={value} onChange={(event) => onChange(event.target.value)} placeholder="输入类目名称" /><Button type="submit" disabled={submitting}>{submitting ? '新增中…' : '新增类目'}</Button></form>
}
function CategoryList({ items, submitting, onUpdate, onDelete }: { items: V2FinanceCategory[]; submitting: string | null; onUpdate: (id: string, input: { name?: string; enabled?: boolean }) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  return <div className="settings-list">{items.length === 0 ? <div className="empty">尚未建立类目。</div> : items.map((item) => <EditableRow key={item.id} id={item.id} name={item.name} note={null} enabled={item.enabled} submitting={submitting} onUpdate={onUpdate} onDelete={onDelete} />)}</div>
}
function PayerList({ items, submitting, onUpdate, onDelete }: { items: V2AdvancePayer[]; submitting: string | null; onUpdate: (id: string, input: { name?: string; note?: string | null; enabled?: boolean }) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  return <div className="settings-list">{items.length === 0 ? <div className="empty">尚未建立垫付人。</div> : items.map((item) => <EditableRow key={item.id} id={item.id} name={item.name} note={item.note} enabled={item.enabled} submitting={submitting} onUpdate={onUpdate} onDelete={onDelete} />)}</div>
}
function EditableRow({ id, name: initialName, note: initialNote, enabled, submitting, onUpdate, onDelete }: { id: string; name: string; note: string | null; enabled: boolean; submitting: string | null; onUpdate: (id: string, input: { name?: string; note?: string | null; enabled?: boolean }) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [name, setName] = useState(initialName)
  const [note, setNote] = useState(initialNote ?? '')
  const busy = submitting === `category-${id}` || submitting === `payer-${id}` || submitting === `category-delete-${id}` || submitting === `payer-delete-${id}`
  return <div className="settings-row"><TextField.Root value={name} onChange={(event) => setName(event.target.value)} /><TextField.Root value={note} onChange={(event) => setNote(event.target.value)} placeholder="备注（可选）" /><Badge color={enabled ? 'green' : 'gray'}>{enabled ? '启用' : '已停用'}</Badge><Flex gap="2"><Button size="1" variant="soft" onClick={() => void onUpdate(id, { name, note: note || null })} disabled={busy}>保存</Button><Button size="1" color="gray" variant="soft" onClick={() => void onUpdate(id, { enabled: !enabled })} disabled={busy}>{enabled ? '停用' : '启用'}</Button><Button size="1" color="red" variant="soft" onClick={() => void onDelete(id)} disabled={busy}>删除</Button></Flex></div>
}
