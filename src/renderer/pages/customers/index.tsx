import { useMemo, useState, type FormEvent } from 'react'
import type {
  V2Customer,
  V2CustomerInput,
  V2CustomerOrderInsights,
  V2CustomerOrderHistoryRow,
  V2NavigationTarget
} from '@shared/contracts/index'
import { formatCents, getErrorMessage } from '../../composables/v2-utils'
import { useCustomers } from '../../composables/use-customers'
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
  YumiMetricStrip,
  YumiPageHeader,
  YumiSelect,
  YumiSheet,
  YumiStatusTag,
  YumiTextArea,
  YumiTextField,
  useYumiNotificationMessage
} from '../../components/ui'

interface CustomerDraft {
  name: string
  contact: string
  defaultAddress: string
  notes: string
}

type CustomersPageProps = { onNavigate?(target: V2NavigationTarget): void }

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

export function CustomersPage({ onNavigate }: CustomersPageProps) {
  const {
    customers,
    loading,
    loadError,
    createCustomer,
    updateCustomer,
    getCustomerOrderInsights
  } = useCustomers()
  const [draft, setDraft] = useState<CustomerDraft>(emptyDraft)
  const [editing, setEditing] = useState<V2Customer | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [viewing, setViewing] = useState<V2Customer | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [insights, setInsights] = useState<V2CustomerOrderInsights | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  useYumiNotificationMessage(loadError)
  useYumiNotificationMessage(error)
  const editorTitle = editing ? `编辑客户：${editing.name}` : '新建客户'
  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(editing ? toDraft(editing) : emptyDraft()),
    [draft, editing]
  )
  const visibleCustomers = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase()
    return customers.filter((customer) => {
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'enabled' ? customer.enabled : !customer.enabled)
      const matchesQuery =
        !query ||
        [customer.name, customer.contact, customer.defaultAddress, customer.notes]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase()
          .includes(query)
      return matchesStatus && matchesQuery
    })
  }, [customers, searchQuery, statusFilter])

  const closeEditor = () => {
    setEditing(null)
    setDraft(emptyDraft())
    setError(null)
    setEditorOpen(false)
  }
  const closeDetail = () => {
    setViewing(null)
    setInsights(null)
    setDetailOpen(false)
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
  const openDetail = async (customer: V2Customer) => {
    setViewing(customer)
    setInsights(null)
    setInsightsLoading(true)
    setDetailOpen(true)
    try {
      setInsights(await getCustomerOrderInsights(customer.id))
    } catch (insightError) {
      setError(getErrorMessage(insightError))
    } finally {
      setInsightsLoading(false)
    }
  }
  const startEditingViewingCustomer = () => {
    if (!viewing) return
    const customer = viewing
    closeDetail()
    openEdit(customer)
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      if (editing)
        await updateCustomer({ ...toInput(draft), id: editing.id, enabled: editing.enabled })
      else await createCustomer(toInput(draft))
      closeEditor()
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="yumi-page yumi-reference-workspace">
      <YumiPageHeader
        actions={{
          ariaLabel: '客户页面动作',
          primaryAction: { label: '新建客户', onClick: openCreate }
        }}
        description="维护订单可关联的客户资料；订单会保留当时的客户快照。"
        title="客户"
      />
      <YumiListSurface ariaLabel={`客户列表，共 ${visibleCustomers.length} 位`}>
        <YumiListToolbar
          ariaLabel="客户列表工具"
          countLabel={`共 ${visibleCustomers.length} 位客户`}
          filters={
            <YumiSelect
              aria-label="客户状态筛选"
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
              aria-label="搜索客户"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索客户、联系人或地址"
              value={searchQuery}
            />
          }
        />
        {loading ? (
          <YumiEmptyState
            description="正在读取客户资料，请稍候。"
            scenario="loading"
            title="客户资料加载中"
          />
        ) : customers.length === 0 ? (
          <YumiEmptyState
            description="点击右上角“新建客户”后，负责人可在新增订单时主动选择关联。"
            scenario="first-use"
            title="还没有客户资料"
          />
        ) : visibleCustomers.length ? (
          <YumiDataTable
            ariaLabel="客户列表"
            columns={[
              {
                key: 'customer',
                label: '客户 / 备注',
                render: (customer) => (
                  <div className="yumi-list-cell">
                    <strong>{customer.name}</strong>
                    <span>{customer.notes ? `备注：${customer.notes}` : '暂无备注'}</span>
                  </div>
                )
              },
              {
                key: 'contact',
                label: '联系人',
                render: (customer) => customer.contact || '未填写'
              },
              {
                key: 'address',
                label: '默认地址',
                render: (customer) => customer.defaultAddress || '未填写'
              },
              {
                key: 'status',
                label: '状态',
                render: (customer) => (
                  <YumiStatusTag tone={customer.enabled ? 'success' : 'neutral'}>
                    {customer.enabled ? '启用' : '停用'}
                  </YumiStatusTag>
                )
              },
              {
                key: 'updatedAt',
                label: '最近更新',
                render: (customer) => customer.updatedAt.slice(0, 10)
              },
              {
                align: 'right',
                key: 'actions',
                label: '操作',
                render: (customer) => (
                  <YumiButton
                    aria-label={`查看客户资料：${customer.name}`}
                    onClick={() => void openDetail(customer)}
                    variant="ghost"
                  >
                    查看详情
                  </YumiButton>
                )
              }
            ]}
            getRowKey={(customer) => customer.id}
            rows={visibleCustomers}
          />
        ) : (
          <YumiEmptyState
            description="请调整搜索内容或状态筛选后重试。"
            title="没有符合筛选条件的客户。"
          />
        )}
      </YumiListSurface>

      <YumiSheet
        description="资料与历史订单只读展示；需要变更时再主动进入编辑。"
        footer={
          <>
            <YumiButton onClick={closeDetail} variant="ghost">
              关闭
            </YumiButton>
            <YumiButton onClick={startEditingViewingCustomer} variant="primary">
              编辑客户
            </YumiButton>
          </>
        }
        onOpenChange={(open) => {
          if (!open) closeDetail()
        }}
        open={detailOpen}
        title={viewing ? `客户资料：${viewing.name}` : '客户资料'}
      >
        {viewing && (
          <div className="yumi-sheet-form">
            <YumiDetailList
              ariaLabel="客户基础资料"
              items={[
                { label: '联系人', value: viewing.contact || '未填写' },
                { label: '状态', value: viewing.enabled ? '启用' : '停用' },
                { label: '默认收货地址', value: viewing.defaultAddress || '未填写' },
                { label: '备注', value: viewing.notes || '暂无备注' }
              ]}
            />
            <YumiFormSection title="客户订单统计">
              {insightsLoading ? (
                <YumiEmptyState
                  description="正在汇总该客户的历史订单与资金信息，请稍候。"
                  scenario="loading"
                  title="客户订单加载中"
                />
              ) : insights ? (
                <>
                  <YumiMetricStrip
                    ariaLabel="客户订单统计指标"
                    items={[
                      { label: '订单数', value: `${insights.orderCount} 单` },
                      { label: '订单金额', value: formatCents(insights.totalCurrentAmountCents) },
                      {
                        label: '净收款',
                        tone: 'success',
                        value: formatCents(insights.totalNetReceivedCents)
                      },
                      {
                        label: '待收',
                        tone: 'warning',
                        value: formatCents(insights.totalOutstandingCents)
                      }
                    ]}
                  />
                  <YumiFormMessage tone="hint">
                    最近下单：{insights.latestOrderDate ?? '暂无订单'}
                  </YumiFormMessage>
                  <YumiDataTable<V2CustomerOrderHistoryRow>
                    ariaLabel="客户历史订单"
                    columns={[
                      {
                        key: 'code',
                        label: '订单',
                        render: (row) => <strong>{row.orderCode}</strong>
                      },
                      {
                        key: 'date',
                        label: '下单时间',
                        render: (row) => row.createdAt.slice(0, 10)
                      },
                      {
                        align: 'right',
                        key: 'amount',
                        label: '订单金额',
                        render: (row) => formatCents(row.currentAmountCents)
                      },
                      {
                        align: 'right',
                        key: 'received',
                        label: '净收款',
                        render: (row) => formatCents(row.netReceivedCents)
                      },
                      {
                        align: 'right',
                        key: 'outstanding',
                        label: '待收',
                        render: (row) => formatCents(row.outstandingCents)
                      },
                      {
                        key: 'status',
                        label: '状态',
                        render: (row) => (
                          <>
                            {row.orderStatus} · {row.shipmentStatus}
                          </>
                        )
                      },
                      {
                        key: 'action',
                        label: '操作',
                        render: (row) => (
                          <YumiButton
                            onClick={() =>
                              onNavigate?.({
                                view: 'orders',
                                orderId: row.orderId,
                                orderView: 'overview'
                              })
                            }
                            variant="ghost"
                          >
                            查看订单
                          </YumiButton>
                        )
                      }
                    ]}
                    emptyText="该客户暂时还没有历史订单。"
                    getRowKey={(row) => row.orderId}
                    rows={insights.orders}
                  />
                </>
              ) : (
                <YumiEmptyState
                  description="当前客户暂时没有可汇总的订单记录。"
                  title="暂无客户订单统计"
                />
              )}
            </YumiFormSection>
          </div>
        )}
      </YumiSheet>

      <YumiSheet
        description="客户名称、联系人、默认地址和备注仅在负责人主动保存后写入资料库。"
        dirty={isDirty}
        footer={
          <>
            <YumiButton onClick={closeEditor} variant="ghost">
              取消
            </YumiButton>
            <YumiButton
              form="customer-editor-form"
              loading={submitting}
              type="submit"
              variant="primary"
            >
              {editing ? '保存客户' : '创建客户'}
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
          id="customer-editor-form"
          onSubmit={submit}
        >
          <YumiField>
            <YumiFieldLabel htmlFor="customer-name" required>
              客户名称
            </YumiFieldLabel>
            <YumiTextField
              id="customer-name"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              required
              value={draft.name}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel htmlFor="customer-contact">联系人</YumiFieldLabel>
            <YumiTextField
              id="customer-contact"
              onChange={(event) => setDraft({ ...draft, contact: event.target.value })}
              placeholder="例如：王女士 / 微信号"
              value={draft.contact}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel htmlFor="customer-address">默认收货地址</YumiFieldLabel>
            <YumiTextArea
              id="customer-address"
              onChange={(event) => setDraft({ ...draft, defaultAddress: event.target.value })}
              placeholder="按客户确认的地址填写"
              value={draft.defaultAddress}
            />
          </YumiField>
          <YumiField>
            <YumiFieldLabel htmlFor="customer-notes">备注</YumiFieldLabel>
            <YumiTextArea
              id="customer-notes"
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              value={draft.notes}
            />
          </YumiField>
        </form>
      </YumiSheet>
    </div>
  )
}
