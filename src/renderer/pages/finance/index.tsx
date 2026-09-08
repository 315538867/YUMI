import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Badge, Button, Flex, Heading, Text, TextArea, TextField } from '@radix-ui/themes'
import type { V2ExpensePaymentSource } from '@shared/contracts'
import { formatCents, getErrorMessage, today, yuanToCents } from '../../composables/v2-utils'
import { useFinance } from '../../composables/use-finance'

export function FinancePage() {
  const { categories, advancePayers, entries, pendingReimbursements, loading, loadError, createManualIncome, createManualExpense, reimburse } = useFinance()
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
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)

  const enabledCategories = useMemo(() => categories.filter((item) => item.direction === direction && item.enabled), [categories, direction])
  const enabledPayers = useMemo(() => advancePayers.filter((item) => item.enabled), [advancePayers])
  useEffect(() => {
    if (enabledCategories.some((item) => item.id === categoryId)) return
    setCategoryId(enabledCategories[0]?.id ?? '')
  }, [categoryId, enabledCategories])
  useEffect(() => {
    if (enabledPayers.some((item) => item.id === advancePayerId)) return
    setAdvancePayerId(enabledPayers[0]?.id ?? '')
  }, [advancePayerId, enabledPayers])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault(); setError(null); setSubmitting('entry')
    try {
      const amountCents = yuanToCents(amount)
      if (direction === 'income') await createManualIncome({ amountCents, occurredOn, categoryId, paymentMethod: paymentMethod || null, note: note || null })
      else await createManualExpense({ amountCents, occurredOn, categoryId, paymentSource, advancePayerId: paymentSource === 'private_advance' ? advancePayerId : null, paymentMethod: paymentMethod || null, note: note || null })
      setAmount(''); setNote(''); setPaymentMethod('')
    } catch (cause) { setError(getErrorMessage(cause)) } finally { setSubmitting(null) }
  }
  const handleReimburse = async (financialEntryId: string) => {
    setError(null); setSubmitting(financialEntryId)
    try { await reimburse({ advanceFinancialEntryId: financialEntryId, reimbursedOn: reimburseDate, paymentMethod: reimburseMethod || null }) }
    catch (cause) { setError(getErrorMessage(cause)) } finally { setSubmitting(null) }
  }

  return <section className="v2-page finance-workspace">
    <div className="page-heading"><div><Text size="2" color="gray">日常现金事实</Text><Heading size="7">财务登记</Heading><Text as="p" color="gray">按实际付款日期入账；私人垫付会形成待报销项，报销付款不重复计入经营费用。</Text></div><Badge color="green">负责人手动登记</Badge></div>
    {loadError && <div className="panel"><Text color="red">{loadError}</Text></div>}
    {error && <div className="panel"><Text color="red">{error}</Text></div>}
    <div className="two-column">
      <form className="panel editor-form" onSubmit={handleSubmit}>
        <Heading size="4">登记日常收支</Heading>
        <div className="form-grid two"><label>方向<select value={direction} onChange={(event) => setDirection(event.target.value as 'income' | 'expense')}><option value="expense">支出</option><option value="income">收入</option></select></label><label>实际付款 / 收款日期<TextField.Root required type="date" value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} /></label><label>金额（元）<TextField.Root required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label>收支类目<select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">请选择</option>{enabledCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
        {direction === 'expense' && <div className="form-grid two"><label>付款来源<select value={paymentSource} onChange={(event) => setPaymentSource(event.target.value as V2ExpensePaymentSource)}><option value="business_account">公账支出</option><option value="private_advance">私人垫付</option></select></label>{paymentSource === 'private_advance' && <label>垫付人<select required value={advancePayerId} onChange={(event) => setAdvancePayerId(event.target.value)}><option value="">请选择</option>{enabledPayers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}</div>}
        <div className="form-grid two"><label>支付方式<TextField.Root value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} placeholder="例如：微信、公账转账" /></label><label>备注<TextArea value={note} onChange={(event) => setNote(event.target.value)} /></label></div>
        <Flex justify="end"><Button type="submit" disabled={!categoryId || (direction === 'expense' && paymentSource === 'private_advance' && !advancePayerId) || submitting === 'entry'}>{submitting === 'entry' ? '登记中…' : '登记收支'}</Button></Flex>
      </form>
      <div className="panel finance-list-panel"><Heading size="4">最近流水</Heading>{loading ? <div className="empty">加载财务流水中…</div> : entries.length === 0 ? <div className="empty">尚无财务流水。</div> : <div className="finance-list">{entries.slice(0, 12).map((entry) => <div key={entry.id} className="finance-row"><div><strong>{entry.categoryName ?? entry.businessType}</strong><Text as="p" size="1" color="gray">{entry.occurredOn} · {entry.note || entry.sourceType}</Text></div><div><Badge color={entry.direction === 'income' ? 'green' : 'orange'}>{entry.direction === 'income' ? '收入' : '支出'}</Badge><strong>{entry.direction === 'income' ? '+' : '-'}{formatCents(entry.amountCents)}</strong></div></div>)}</div>}</div>
    </div>
    <section className="panel v2-form"><Flex justify="between" align="center"><div><Heading size="4">待报销</Heading><Text size="2" color="gray">仅能一次性完整报销；原垫付仍保留为发生日的经营费用。</Text></div><div className="inline-fields"><TextField.Root type="date" value={reimburseDate} onChange={(event) => setReimburseDate(event.target.value)} /><TextField.Root value={reimburseMethod} onChange={(event) => setReimburseMethod(event.target.value)} placeholder="报销支付方式" /></div></Flex>{pendingReimbursements.length === 0 ? <div className="empty">没有待报销的私人垫付。</div> : <div className="finance-list">{pendingReimbursements.map((item) => <div key={item.financialEntryId} className="finance-row"><div><strong>{item.advancePayerName ?? '未命名垫付人'} · {formatCents(item.amountCents)}</strong><Text as="p" size="1" color="gray">{item.occurredOn} · {item.categoryName ?? '未分类'} · {item.note || '无备注'}</Text></div><Button size="1" onClick={() => void handleReimburse(item.financialEntryId)} disabled={submitting === item.financialEntryId}>{submitting === item.financialEntryId ? '处理中…' : '完整报销'}</Button></div>)}</div>}</section>
  </section>
}
