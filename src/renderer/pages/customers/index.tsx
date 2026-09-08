import { useMemo, useState, type FormEvent } from 'react'
import type { V2Customer, V2CustomerInput } from '@shared/contracts/index'
import { getErrorMessage } from '../../composables/v2-utils'
import { useCustomers } from '../../composables/use-customers'
import {
  YumiBusinessList,
  YumiBusinessListItem,
  YumiButton,
  YumiEmptyState,
  YumiField,
  YumiFieldLabel,
  YumiPageHeader,
  YumiSheet,
  YumiStatusTag,
  YumiTextArea,
  YumiTextField
} from '../../components/ui'

interface CustomerDraft {
  name: string
  contact: string
  defaultAddress: string
  notes: string
}

const emptyDraft = (): CustomerDraft => ({ name: '', contact: '', defaultAddress: '', notes: '' })
const toDraft = (customer: V2Customer): CustomerDraft => ({
  name: customer.name,
  contact: customer.contact ?? '',
  defaultAddress: customer.defaultAddress ?? '',
  notes: customer.notes ?? ''
})
const toInput = (draft: CustomerDraft): V2CustomerInput => ({
  name: draft.name,
  contact: draft.contact || null,
  defaultAddress: draft.defaultAddress || null,
  notes: draft.notes || null
})

export function CustomersPage() {
  const { customers, loading, loadError, createCustomer, updateCustomer } = useCustomers()
  const [draft, setDraft] = useState<CustomerDraft>(emptyDraft)
  const [editing, setEditing] = useState<V2Customer | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editorTitle = editing ? `编辑客户：${editing.name}` : '新建客户'
  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(editing ? toDraft(editing) : emptyDraft()), [draft, editing])

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
  const openEdit = (customer: V2Customer) => {
    setEditing(customer)
    setDraft(toDraft(customer))
    setError(null)
    setEditorOpen(true)
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      if (editing) await updateCustomer({ ...toInput(draft), id: editing.id, enabled: editing.enabled })
      else await createCustomer(toInput(draft))
      closeEditor()
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="yumi-page yumi-reference-workspace">
    <YumiPageHeader
      actions={<YumiButton onClick={openCreate} variant="primary">新建客户</YumiButton>}
      description="维护订单可关联的客户资料；订单会保留当时的客户快照。"
      title="客户"
    />
    {loadError && <p className="yumi-feedback yumi-feedback--danger" role="alert">{loadError}</p>}
    <div className="yumi-primary-list" aria-label="客户列表">
      {loading ? <div className="yumi-empty">正在加载客户…</div> : customers.length === 0 ? <YumiEmptyState description="点击右上角“新建客户”后，负责人可在新增订单时主动选择关联。" scenario="first-use" title="还没有客户资料" /> : <YumiBusinessList>
        {customers.map((customer) => <YumiBusinessListItem
          key={customer.id}
          onOpen={() => openEdit(customer)}
          status={<YumiStatusTag tone={customer.enabled ? 'success' : 'neutral'}>{customer.enabled ? '启用' : '停用'}</YumiStatusTag>}
          summary={`${customer.contact || '未填写联系人'} · ${customer.defaultAddress || '未填写默认地址'}`}
          title={customer.name}
        >
          {customer.notes ? <span>备注：{customer.notes}</span> : <span>暂无备注</span>}
        </YumiBusinessListItem>)}
      </YumiBusinessList>}
    </div>

    <YumiSheet
      description="客户名称、联系人、默认地址和备注仅在负责人主动保存后写入资料库。"
      dirty={isDirty}
      footer={<><YumiButton onClick={closeEditor} variant="ghost">取消</YumiButton><YumiButton form="customer-editor-form" loading={submitting} type="submit" variant="primary">{editing ? '保存客户' : '创建客户'}</YumiButton></>}
      onOpenChange={(open) => { if (!open) closeEditor() }}
      open={editorOpen}
      title={editorTitle}
    >
      <form className="yumi-form-panel yumi-sheet-form" id="customer-editor-form" onSubmit={submit}>
        <YumiField>
          <YumiFieldLabel htmlFor="customer-name" required>客户名称</YumiFieldLabel>
          <YumiTextField id="customer-name" onChange={(event) => setDraft({ ...draft, name: event.target.value })} required value={draft.name} />
        </YumiField>
        <YumiField>
          <YumiFieldLabel htmlFor="customer-contact">联系人</YumiFieldLabel>
          <YumiTextField id="customer-contact" onChange={(event) => setDraft({ ...draft, contact: event.target.value })} placeholder="例如：王女士 / 微信号" value={draft.contact} />
        </YumiField>
        <YumiField>
          <YumiFieldLabel htmlFor="customer-address">默认收货地址</YumiFieldLabel>
          <YumiTextArea id="customer-address" onChange={(event) => setDraft({ ...draft, defaultAddress: event.target.value })} placeholder="按客户确认的地址填写" value={draft.defaultAddress} />
        </YumiField>
        <YumiField>
          <YumiFieldLabel htmlFor="customer-notes">备注</YumiFieldLabel>
          <YumiTextArea id="customer-notes" onChange={(event) => setDraft({ ...draft, notes: event.target.value })} value={draft.notes} />
        </YumiField>
        {error && <p className="yumi-feedback yumi-feedback--danger" role="alert">{error}</p>}
      </form>
    </YumiSheet>
  </div>
}
