import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type {
  V2ExpensePaymentSource,
  V2FinancialEntry,
  V2NavigationTarget
} from '@shared/contracts/index'
import { formatCents, getErrorMessage, today, yuanToCents } from '../../composables/v2-utils'
import { useFinance } from '../../composables/use-finance'
import {
  YumiButton,
  YumiDataTable,
  YumiDatePicker,
  YumiEmptyState,
  YumiField,
  YumiFieldLabel,
  YumiFormMessage,
  YumiListSurface,
  YumiListToolbar,
  YumiMetricStrip,
  YumiMonthPicker,
  YumiNumberField,
  YumiPageHeader,
  YumiPrimaryTabs,
  YumiSearchSelect,
  YumiSection,
  YumiSelect,
  YumiSheet,
  YumiStatusTag,
  YumiTextArea,
  YumiTextField,
  useYumiNotificationMessage
} from '../../components/ui'

type FinanceWorkspaceView = 'overview' | 'cashflow' | 'reimbursements'

const workspaceViews: Array<{ id: FinanceWorkspaceView; label: string }> = [
  { id: 'overview', label: '月度经营结果' },
  { id: 'cashflow', label: '现金流水' },
  { id: 'reimbursements', label: '待报销' }
]

type FinanceNavigationTarget = Extract<V2NavigationTarget, { view: 'finance' }>

interface FinancePageProps {
  navigationTarget?: FinanceNavigationTarget | null
}

export function FinancePage({ navigationTarget = null }: FinancePageProps) {
  const {
    categories,
    advancePayers,
    entries,
    pendingReimbursements,
    monthlySummary,
    loading,
    loadError,
    createManualIncome,
    createManualExpense,
    reimburseBatch,
    loadMonthlyOverview
  } = useFinance()
  const [workspaceView, setWorkspaceView] = useState<FinanceWorkspaceView>('overview')
  const [month, setMonth] = useState(today().slice(0, 7))
  const [asOf, setAsOf] = useState(today())
  const [showEntryForm, setShowEntryForm] = useState(false)
  const [showReimbursementForm, setShowReimbursementForm] = useState(false)
  const [direction, setDirection] = useState<'income' | 'expense'>('expense')
  const [amount, setAmount] = useState('')
  const [occurredOn, setOccurredOn] = useState(today())
  const [categoryId, setCategoryId] = useState('')
  const [paymentSource, setPaymentSource] = useState<V2ExpensePaymentSource>('business_account')
  const [advancePayerId, setAdvancePayerId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [note, setNote] = useState('')
  const [reimburseDate, setReimburseDate] = useState(today())
  const [reimburseMethod, setReimburseMethod] = useState('')
  const [reimburseNote, setReimburseNote] = useState('')
  const [selectedReimbursementIds, setSelectedReimbursementIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  useYumiNotificationMessage(loadError)
  useYumiNotificationMessage(error)
  const [submitting, setSubmitting] = useState<string | null>(null)

  const enabledCategories = useMemo(
    () => categories.filter((item) => item.direction === direction && item.enabled),
    [categories, direction]
  )
  const enabledPayers = useMemo(() => advancePayers.filter((item) => item.enabled), [advancePayers])
  const categoryOptions = useMemo(
    () =>
      enabledCategories.map((item) => ({
        label: item.name,
        searchText: item.name,
        value: item.id
      })),
    [enabledCategories]
  )
  const payerOptions = useMemo(
    () =>
      enabledPayers.map((item) => ({ label: item.name, searchText: item.name, value: item.id })),
    [enabledPayers]
  )
  const selectedReimbursements = useMemo(
    () =>
      pendingReimbursements.filter((item) =>
        selectedReimbursementIds.includes(item.financialEntryId)
      ),
    [pendingReimbursements, selectedReimbursementIds]
  )
  const selectedCents = useMemo(
    () => selectedReimbursements.reduce((sum, item) => sum + item.amountCents, 0),
    [selectedReimbursements]
  )
  const refreshOverview = useCallback(async () => {
    try {
      await loadMonthlyOverview(month, asOf)
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  }, [asOf, loadMonthlyOverview, month])

  useEffect(() => {
    void refreshOverview()
  }, [refreshOverview])
  useEffect(() => {
    if (enabledCategories.some((item) => item.id === categoryId)) return
    setCategoryId(enabledCategories[0]?.id ?? '')
  }, [categoryId, enabledCategories])
  useEffect(() => {
    if (enabledPayers.some((item) => item.id === advancePayerId)) return
    setAdvancePayerId(enabledPayers[0]?.id ?? '')
  }, [advancePayerId, enabledPayers])
  useEffect(() => {
    const pendingIds = new Set(pendingReimbursements.map((item) => item.financialEntryId))
    setSelectedReimbursementIds((ids) => ids.filter((id) => pendingIds.has(id)))
  }, [pendingReimbursements])
  useEffect(() => {
    if (navigationTarget?.financeView) setWorkspaceView(navigationTarget.financeView)
  }, [navigationTarget])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!amount.trim()) {
      setError('请填写金额。')
      return
    }
    if (!categoryId) {
      setError('请选择收支类目。')
      return
    }
    if (direction === 'expense' && paymentSource === 'private_advance' && !advancePayerId) {
      setError('请选择垫付人。')
      return
    }
    setSubmitting('entry')
    try {
      const amountCents = yuanToCents(amount)
      if (direction === 'income')
        await createManualIncome({
          amountCents,
          occurredOn,
          categoryId,
          paymentMethod: paymentMethod || null,
          note: note || null
        })
      else
        await createManualExpense({
          amountCents,
          occurredOn,
          categoryId,
          paymentSource,
          advancePayerId: paymentSource === 'private_advance' ? advancePayerId : null,
          paymentMethod: paymentMethod || null,
          note: note || null
        })
      setAmount('')
      setNote('')
      setPaymentMethod('')
      setShowEntryForm(false)
      await refreshOverview()
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(null)
    }
  }

  const toggleReimbursement = (financialEntryId: string) => {
    setSelectedReimbursementIds((ids) =>
      ids.includes(financialEntryId)
        ? ids.filter((id) => id !== financialEntryId)
        : [...ids, financialEntryId]
    )
  }

  const handleReimburseBatch = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (selectedReimbursementIds.length === 0) {
      setError('请先选择至少一笔待报销私人垫付。')
      return
    }
    setSubmitting('batch-reimbursement')
    try {
      await reimburseBatch({
        advanceFinancialEntryIds: selectedReimbursementIds,
        reimbursedOn: reimburseDate,
        paymentMethod: reimburseMethod || null,
        note: reimburseNote || null
      })
      setSelectedReimbursementIds([])
      setReimburseMethod('')
      setReimburseNote('')
      setShowReimbursementForm(false)
      await refreshOverview()
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <section className="yumi-page yumi-finance-workspace">
      <YumiPageHeader
        actions={{
          ariaLabel: '财务页面动作',
          context: <YumiStatusTag tone="success">负责人手动登记</YumiStatusTag>,
          primaryAction: {
            label: '登记收支',
            onClick: () => {
              setShowEntryForm(true)
              setError(null)
            }
          }
        }}
        description="按实际付款日期入账；私人垫付形成待报销项，报销付款只进入现金流水，不重复计入经营费用。"
        title="财务"
      />
      <YumiPrimaryTabs
        ariaLabel="财务工作视图"
        items={workspaceViews}
        onValueChange={setWorkspaceView}
        value={workspaceView}
      />

      {workspaceView === 'overview' && (
        <YumiSection
          actions={
            <YumiButton
              disabled={loading}
              onClick={() => void refreshOverview()}
              variant="secondary"
            >
              刷新
            </YumiButton>
          }
          description="只按实际收付款日期归属月份；报销付款不重复计入经营支出。"
          title="本月经营结果"
        >
          <YumiListToolbar
            ariaLabel="经营结果筛选工具"
            filters={
              <YumiField>
                <YumiFieldLabel>统计月份</YumiFieldLabel>
                <YumiMonthPicker aria-label="统计月份" onValueChange={setMonth} value={month} />
              </YumiField>
            }
          />
          <YumiMetricStrip
            ariaLabel="本月经营结果指标"
            items={[
              {
                label: '实际收入',
                tone: 'success',
                value: formatCents(monthlySummary?.incomeCents ?? 0)
              },
              {
                label: '经营支出',
                tone: 'danger',
                value: formatCents(monthlySummary?.operatingExpenseCents ?? 0)
              },
              {
                label: '经营结果',
                tone: (monthlySummary?.operatingResultCents ?? 0) >= 0 ? 'success' : 'danger',
                value: formatCents(monthlySummary?.operatingResultCents ?? 0)
              }
            ]}
          />
        </YumiSection>
      )}

      {workspaceView === 'cashflow' && (
        <YumiSection
          actions={
            <YumiButton
              disabled={loading}
              onClick={() => void refreshOverview()}
              variant="secondary"
            >
              刷新
            </YumiButton>
          }
          description="包含公账收入、支出和报销付款；报销付款仅反映实际现金流。"
          title="当月现金流水"
        >
          <YumiListSurface ariaLabel="现金流水记录">
            <YumiListToolbar
              ariaLabel="现金流水列表工具"
              countLabel={`共 ${entries.length} 笔流水`}
              filters={
                <YumiField>
                  <YumiFieldLabel>查看月份</YumiFieldLabel>
                  <YumiMonthPicker
                    aria-label="现金流水月份"
                    onValueChange={setMonth}
                    value={month}
                  />
                </YumiField>
              }
            />
            {loading ? (
              <YumiEmptyState
                description="正在读取当月资金流水，请稍候。"
                scenario="loading"
                title="资金流水加载中"
              />
            ) : (
              <YumiDataTable<V2FinancialEntry>
                ariaLabel="现金流水列表"
                columns={[
                  {
                    key: 'occurredOn',
                    label: '发生日期',
                    render: (entry) => entry.occurredOn
                  },
                  {
                    key: 'business',
                    label: '业务类型 / 说明',
                    render: (entry) => (
                      <div className="yumi-list-cell">
                        <strong>{entry.categoryName ?? entry.businessType}</strong>
                        <span>
                          {getFinanceEntryDetail(entry)}
                          {entry.note ? ` · ${entry.note}` : ''}
                        </span>
                      </div>
                    )
                  },
                  {
                    key: 'payment',
                    label: '支付方式',
                    render: (entry) => entry.paymentMethod ?? '未填写'
                  },
                  {
                    key: 'status',
                    label: '状态',
                    render: (entry) => (
                      <YumiStatusTag tone={entry.direction === 'income' ? 'success' : 'warning'}>
                        {entry.direction === 'income' ? '收入' : '支出'}
                      </YumiStatusTag>
                    )
                  },
                  {
                    align: 'right',
                    key: 'amount',
                    label: '金额',
                    render: (entry) => (
                      <strong>
                        {entry.direction === 'income' ? '+' : '-'}
                        {formatCents(entry.amountCents)}
                      </strong>
                    )
                  }
                ]}
                emptyText="该月尚无现金流水。"
                getRowKey={(entry) => entry.id}
                rows={entries}
              />
            )}
          </YumiListSurface>
        </YumiSection>
      )}

      {workspaceView === 'reimbursements' && (
        <YumiSection
          actions={
            <>
              <YumiButton
                disabled={loading}
                onClick={() => void refreshOverview()}
                variant="secondary"
              >
                刷新
              </YumiButton>
              <YumiButton
                disabled={selectedReimbursementIds.length === 0}
                onClick={() => {
                  setError(null)
                  setShowReimbursementForm(true)
                }}
                variant="primary"
              >
                批量报销（已选择 {selectedReimbursementIds.length} 笔）
              </YumiButton>
            </>
          }
          description="先在同一列表选择待报销项，再统一填写报销日期、支付方式和备注；提交时会原子地校验并创建全部流水。"
          title="待报销私人垫付"
        >
          <YumiListSurface ariaLabel="待报销记录">
            <YumiListToolbar
              ariaLabel="待报销列表工具"
              countLabel={`共 ${pendingReimbursements.length} 笔待报销`}
              filters={
                <YumiField>
                  <YumiFieldLabel>截至日期</YumiFieldLabel>
                  <YumiDatePicker
                    aria-label="待报销截至日期"
                    onValueChange={setAsOf}
                    value={asOf}
                  />
                </YumiField>
              }
            />
            <YumiDataTable
              ariaLabel="待报销列表"
              columns={[
                {
                  key: 'advancePayer',
                  label: '垫付人 / 费用',
                  render: (item) => (
                    <div className="yumi-list-cell">
                      <strong>{item.advancePayerName ?? '未命名垫付人'}</strong>
                      <span>
                        {item.categoryName ?? '未分类'}
                        {item.note ? ` · ${item.note}` : ''}
                      </span>
                    </div>
                  )
                },
                {
                  key: 'occurredOn',
                  label: '垫付日期',
                  render: (item) => item.occurredOn
                },
                {
                  align: 'right',
                  key: 'amount',
                  label: '待报销金额',
                  render: (item) => <strong>{formatCents(item.amountCents)}</strong>
                },
                {
                  key: 'status',
                  label: '状态',
                  render: () => <YumiStatusTag tone="warning">待报销</YumiStatusTag>
                },
                {
                  align: 'right',
                  key: 'action',
                  label: '操作',
                  render: (item) => {
                    const selected = selectedReimbursementIds.includes(item.financialEntryId)
                    return (
                      <YumiButton
                        aria-pressed={selected}
                        onClick={() => toggleReimbursement(item.financialEntryId)}
                        variant={selected ? 'primary' : 'secondary'}
                      >
                        {selected ? '已选择' : '选择'}
                      </YumiButton>
                    )
                  }
                }
              ]}
              emptyText="截至所选日期没有待报销的私人垫付。"
              getRowKey={(item) => item.financialEntryId}
              rows={pendingReimbursements}
            />
          </YumiListSurface>
          {selectedReimbursementIds.length > 0 && (
            <YumiFormMessage>
              已选择 {selectedReimbursementIds.length} 笔，合计 {formatCents(selectedCents)}。
            </YumiFormMessage>
          )}
        </YumiSection>
      )}

      <YumiSheet
        description="按实际收付款日期登记。手工收支不关联订单；私人垫付将在待报销工作区统一处理。"
        footer={
          <>
            <YumiButton onClick={() => setShowEntryForm(false)} variant="ghost">
              取消
            </YumiButton>
            <YumiButton
              disabled={
                !categoryId ||
                (direction === 'expense' && paymentSource === 'private_advance' && !advancePayerId)
              }
              form="financial-entry-form"
              loading={submitting === 'entry'}
              type="submit"
              variant="primary"
            >
              登记收支
            </YumiButton>
          </>
        }
        onOpenChange={setShowEntryForm}
        open={showEntryForm}
        title="登记日常收支"
      >
        <form
          className="yumi-form-panel yumi-sheet-form"
          id="financial-entry-form"
          onSubmit={handleSubmit}
        >
          <div className="yumi-form-grid yumi-form-grid--two">
            <YumiField>
              <YumiFieldLabel>方向</YumiFieldLabel>
              <YumiSelect
                aria-label="收支方向"
                onValueChange={(value) => setDirection(value as 'income' | 'expense')}
                options={[
                  { label: '支出', value: 'expense' },
                  { label: '收入', value: 'income' }
                ]}
                value={direction}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel required>实际付款 / 收款日期</YumiFieldLabel>
              <YumiDatePicker
                aria-label="实际付款或收款日期"
                onValueChange={setOccurredOn}
                value={occurredOn}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel required>金额（元）</YumiFieldLabel>
              <YumiNumberField
                allowDecimal
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                value={amount}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel required>收支类目</YumiFieldLabel>
              <YumiSearchSelect
                aria-label="收支类目"
                onValueChange={setCategoryId}
                options={categoryOptions}
                placeholder="搜索或选择类目"
                value={categoryId}
              />
            </YumiField>
          </div>
          {direction === 'expense' && (
            <div className="yumi-form-grid yumi-form-grid--two">
              <YumiField>
                <YumiFieldLabel>付款来源</YumiFieldLabel>
                <YumiSelect
                  aria-label="付款来源"
                  onValueChange={(value) => setPaymentSource(value as V2ExpensePaymentSource)}
                  options={[
                    { label: '公账支出', value: 'business_account' },
                    { label: '私人垫付', value: 'private_advance' }
                  ]}
                  value={paymentSource}
                />
              </YumiField>
              {paymentSource === 'private_advance' && (
                <YumiField>
                  <YumiFieldLabel required>垫付人</YumiFieldLabel>
                  <YumiSearchSelect
                    aria-label="垫付人"
                    onValueChange={setAdvancePayerId}
                    options={payerOptions}
                    placeholder="搜索或选择垫付人"
                    value={advancePayerId}
                  />
                </YumiField>
              )}
            </div>
          )}
          <div className="yumi-form-grid yumi-form-grid--two">
            <YumiField>
              <YumiFieldLabel>支付方式</YumiFieldLabel>
              <YumiTextField
                onChange={(event) => setPaymentMethod(event.target.value)}
                placeholder="例如：微信、公账转账"
                value={paymentMethod}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel>备注</YumiFieldLabel>
              <YumiTextArea onChange={(event) => setNote(event.target.value)} value={note} />
            </YumiField>
          </div>
        </form>
      </YumiSheet>

      <YumiSheet
        description={`本次将报销 ${selectedReimbursements.length} 笔私人垫付，合计 ${formatCents(selectedCents)}。任一记录已被报销或无效时，本次不会产生部分报销。`}
        footer={
          <>
            <YumiButton onClick={() => setShowReimbursementForm(false)} variant="ghost">
              取消
            </YumiButton>
            <YumiButton
              form="batch-reimbursement-form"
              loading={submitting === 'batch-reimbursement'}
              type="submit"
              variant="primary"
            >
              确认批量报销
            </YumiButton>
          </>
        }
        onOpenChange={setShowReimbursementForm}
        open={showReimbursementForm}
        title="确认批量报销"
      >
        <form
          className="yumi-form-panel yumi-sheet-form"
          id="batch-reimbursement-form"
          onSubmit={handleReimburseBatch}
        >
          <div className="yumi-form-grid yumi-form-grid--two">
            <YumiField>
              <YumiFieldLabel required>报销付款日期</YumiFieldLabel>
              <YumiDatePicker
                aria-label="报销付款日期"
                onValueChange={setReimburseDate}
                value={reimburseDate}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel htmlFor="batch-reimbursement-method">报销支付方式</YumiFieldLabel>
              <YumiTextField
                id="batch-reimbursement-method"
                onChange={(event) => setReimburseMethod(event.target.value)}
                placeholder="例如：公账转账"
                value={reimburseMethod}
              />
            </YumiField>
          </div>
          <YumiField>
            <YumiFieldLabel htmlFor="batch-reimbursement-note">备注</YumiFieldLabel>
            <YumiTextArea
              id="batch-reimbursement-note"
              onChange={(event) => setReimburseNote(event.target.value)}
              placeholder="例如：9 月第一批报销"
              value={reimburseNote}
            />
          </YumiField>
        </form>
      </YumiSheet>
    </section>
  )
}

function getFinanceEntryDetail(entry: V2FinancialEntry) {
  if (entry.direction === 'income') return '收入'
  if (entry.sourceType === 'reimbursement') return '报销付款（不重复计入经营支出）'
  if (entry.paymentSource === 'private_advance') {
    return `私人垫付 · ${entry.advancePayerName ?? '未命名垫付人'}`
  }
  return entry.paymentSource === 'business_account' ? '公账支出' : entry.businessType
}
