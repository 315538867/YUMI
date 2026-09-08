import { useState, type FormEvent } from 'react'
import { Badge, Button, Flex, Heading, Text, TextArea, TextField } from '@radix-ui/themes'
import type { V2Customer, V2CustomerInput } from '@shared/contracts/index'
import { getErrorMessage } from '../../composables/v2-utils'
import { useCustomers } from '../../composables/use-customers'

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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openCreate = () => {
    setEditing(null)
    setDraft(emptyDraft())
    setError(null)
  }

  const openEdit = (customer: V2Customer) => {
    setEditing(customer)
    setDraft(toDraft(customer))
    setError(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      if (editing) {
        await updateCustomer({ ...toInput(draft), id: editing.id, enabled: editing.enabled })
      } else {
        await createCustomer(toInput(draft))
      }
      openCreate()
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="v2-page">
      <Flex justify="between" align="center" gap="4" className="page-title-row">
        <div>
          <Heading size="6">客户</Heading>
          <Text as="p" color="gray">维护订单可关联的客户资料；订单会保留当时的客户快照。</Text>
        </div>
        <Button onClick={openCreate}>新建客户</Button>
      </Flex>

      <div className="v2-two-column">
        <div className="panel">
          <Heading size="4">客户列表</Heading>
          {loadError && <p className="form-error">{loadError}</p>}
          {loading ? <p className="empty">正在加载客户…</p> : (
            <div className="data-list">
              {customers.map((customer) => (
                <button type="button" className="data-list-row" key={customer.id} onClick={() => openEdit(customer)}>
                  <span>
                    <strong>{customer.name}</strong>
                    <small>{customer.contact || '未填写联系人'} · {customer.defaultAddress || '未填写默认地址'}</small>
                  </span>
                  <Badge color={customer.enabled ? 'green' : 'gray'}>{customer.enabled ? '启用' : '停用'}</Badge>
                </button>
              ))}
              {!customers.length && <p className="empty">还没有客户。请先建立客户资料。</p>}
            </div>
          )}
        </div>

        <form className="panel v2-form" onSubmit={submit}>
          <Heading size="4">{editing ? `编辑客户：${editing.name}` : '新建客户'}</Heading>
          <label>客户名称<TextField.Root required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>联系人<TextField.Root value={draft.contact} onChange={(event) => setDraft({ ...draft, contact: event.target.value })} /></label>
          <label>默认收货地址<TextArea value={draft.defaultAddress} onChange={(event) => setDraft({ ...draft, defaultAddress: event.target.value })} /></label>
          <label>备注<TextArea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
          {error && <p className="form-error">{error}</p>}
          <Flex gap="3" justify="end">
            {editing && <Button type="button" variant="soft" color="gray" onClick={openCreate}>取消编辑</Button>}
            <Button type="submit" disabled={submitting}>{submitting ? '保存中…' : editing ? '保存客户' : '创建客户'}</Button>
          </Flex>
        </form>
      </div>
    </section>
  )
}
