import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Dialog, Flex, Heading, Table, Text, TextField } from '@radix-ui/themes'
import type {
  CustomerDetail,
  CustomerInput,
  CustomerOverview,
  CustomerProfile
} from '@shared/contracts'
import { getErrorMessage } from './workspace-utils'

const money = (cents: number) =>
  new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(cents / 100)

type CustomerDraft = {
  name: string
  contact: string
  defaultAddress: string
  notes: string
}

const emptyDraft = (): CustomerDraft => ({ name: '', contact: '', defaultAddress: '', notes: '' })
const draftFromCustomer = (customer: CustomerProfile): CustomerDraft => ({
  name: customer.name,
  contact: customer.contact ?? '',
  defaultAddress: customer.defaultAddress ?? '',
  notes: customer.notes ?? ''
})

export function CustomerManagementPage({
  onInspectOrder
}: {
  onInspectOrder(orderId: string): void
}) {
  const [keyword, setKeyword] = useState('')
  const [customers, setCustomers] = useState<CustomerOverview[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerProfile | null>(null)
  const [draft, setDraft] = useState<CustomerDraft>(emptyDraft)
  const [saving, setSaving] = useState(false)

  const loadCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.yumi.customers.listManagement({ keyword })
      setCustomers(data)
      setSelectedId((current) =>
        current && data.some((item) => item.id === current) ? current : (data[0]?.id ?? null)
      )
      setError('')
    } catch (reason) {
      setError(getErrorMessage(reason, '客户列表读取失败，请重试。'))
    } finally {
      setLoading(false)
    }
  }, [keyword])

  useEffect(() => {
    void loadCustomers()
  }, [loadCustomers])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    void window.yumi.customers
      .getDetail(selectedId)
      .then((data) => setDetail(data))
      .catch((reason) => setError(getErrorMessage(reason, '客户详情读取失败，请重试。')))
  }, [selectedId, customers])

  const openCreate = () => {
    setEditing(null)
    setDraft(emptyDraft())
    setEditorOpen(true)
  }
  const openEdit = () => {
    if (!detail) return
    setEditing(detail)
    setDraft(draftFromCustomer(detail))
    setEditorOpen(true)
  }
  const save = async () => {
    if (!draft.name.trim()) {
      setError('请填写客户名称。')
      return
    }
    const input: CustomerInput = {
      name: draft.name.trim(),
      contact: draft.contact.trim() || null,
      defaultAddress: draft.defaultAddress.trim() || null,
      notes: draft.notes.trim() || null
    }
    setSaving(true)
    try {
      const customer = editing
        ? await window.yumi.customers.update({ ...input, id: editing.id })
        : await window.yumi.customers.create(input)
      setEditorOpen(false)
      setSelectedId(customer.id)
      await loadCustomers()
    } catch (reason) {
      setError(getErrorMessage(reason, '客户保存失败，请检查输入。'))
    } finally {
      setSaving(false)
    }
  }
  const remove = async () => {
    if (!detail) return
    try {
      await window.yumi.customers.delete(detail.id)
      setSelectedId(null)
      await loadCustomers()
    } catch (reason) {
      setError(getErrorMessage(reason, '客户删除失败。'))
    }
  }

  return (
    <div className="panel">
      <Flex justify="between" align="center" mb="4">
        <div>
          <Heading size="4">客户管理</Heading>
          <Text size="2" color="gray">
            仅在此处维护客户主档；订单保存的是独立快照，不会回写客户资料。
          </Text>
        </div>
        <Button onClick={openCreate}>新增客户</Button>
      </Flex>
      <TextField.Root
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder="按客户名称、联系方式或默认地址搜索"
        mb="4"
      />
      {error && (
        <Text color="red" as="div" mb="3">
          {error}
        </Text>
      )}
      {loading ? (
        <Text color="gray">正在读取客户…</Text>
      ) : (
        <div className="customer-management-grid">
          <Table.Root variant="surface">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>客户</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>联系方式</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>订单</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>待发货</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>待收</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>最近订单</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {customers.map((customer) => (
                <Table.Row
                  key={customer.id}
                  className="selectable-row"
                  aria-label={`查看客户 ${customer.name}`}
                  onClick={() => setSelectedId(customer.id)}
                >
                  <Table.Cell>
                    <Text weight="medium">{customer.name}</Text>
                  </Table.Cell>
                  <Table.Cell>{customer.contact || '未填写'}</Table.Cell>
                  <Table.Cell>{customer.orderCount} 笔</Table.Cell>
                  <Table.Cell>{customer.pendingShipmentOrderCount} 笔</Table.Cell>
                  <Table.Cell>{money(customer.outstandingCents)}</Table.Cell>
                  <Table.Cell>{customer.latestOrderAt ?? '暂无订单'}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
          <section className="customer-detail-panel">
            {detail ? (
              <>
                <Flex justify="between" align="start" mb="3">
                  <div>
                    <Heading size="4">{detail.name}</Heading>
                    <Text size="2" color="gray">
                      {detail.contact || '未填写联系方式'}
                    </Text>
                  </div>
                  <Flex gap="2">
                    <Button variant="soft" onClick={openEdit}>
                      编辑
                    </Button>
                    <Button color="red" variant="soft" onClick={() => void remove()}>
                      删除
                    </Button>
                  </Flex>
                </Flex>
                <Text as="div" size="2" mb="2">
                  默认地址：{detail.defaultAddress || '未填写'}
                </Text>
                {detail.notes && (
                  <Text as="div" size="2" color="gray" mb="3">
                    备注：{detail.notes}
                  </Text>
                )}
                <Flex gap="2" wrap="wrap" mb="4">
                  <Badge variant="soft">累计订单 {detail.orderCount}</Badge>
                  <Badge color="amber" variant="soft">
                    待发货 {detail.pendingShipmentOrderCount}
                  </Badge>
                  <Badge color="blue" variant="soft">
                    当前待收 {money(detail.outstandingCents)}
                  </Badge>
                  <Badge variant="soft">最近订单 {detail.latestOrderAt ?? '暂无订单'}</Badge>
                </Flex>
                <Heading size="3" mb="2">
                  关联订单
                </Heading>
                {detail.orders.length === 0 ? (
                  <Text color="gray" size="2">
                    该客户暂无关联订单，可直接删除。
                  </Text>
                ) : (
                  <Table.Root variant="surface">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeaderCell>订单</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>待收</Table.ColumnHeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {detail.orders.map((order) => (
                        <Table.Row
                          key={order.id}
                          className="selectable-row"
                          onClick={() => onInspectOrder(order.id)}
                        >
                          <Table.Cell>{order.code}</Table.Cell>
                          <Table.Cell>{money(order.outstandingCents)}</Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Root>
                )}
              </>
            ) : (
              <Text color="gray">从左侧选择客户查看详情。</Text>
            )}
          </section>
        </div>
      )}
      <Dialog.Root open={editorOpen} onOpenChange={setEditorOpen}>
        <Dialog.Content maxWidth="520px">
          <Dialog.Title>{editing ? '编辑客户' : '新增客户'}</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            客户主档只在客户管理中维护。
          </Dialog.Description>
          <Flex direction="column" gap="3">
            <label>
              <Text as="div" size="2" mb="1">
                客户名称
              </Text>
              <TextField.Root
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <label>
              <Text as="div" size="2" mb="1">
                联系方式
              </Text>
              <TextField.Root
                value={draft.contact}
                onChange={(event) => setDraft({ ...draft, contact: event.target.value })}
              />
            </label>
            <label>
              <Text as="div" size="2" mb="1">
                默认地址
              </Text>
              <TextField.Root
                value={draft.defaultAddress}
                onChange={(event) => setDraft({ ...draft, defaultAddress: event.target.value })}
              />
            </label>
            <label>
              <Text as="div" size="2" mb="1">
                备注
              </Text>
              <TextField.Root
                value={draft.notes}
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              />
            </label>
          </Flex>
          <Flex justify="end" gap="3" mt="5">
            <Button variant="soft" color="gray" onClick={() => setEditorOpen(false)}>
              取消
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? '保存中…' : '保存客户'}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  )
}
