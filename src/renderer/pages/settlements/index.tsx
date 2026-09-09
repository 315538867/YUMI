import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { V2NavigationTarget, V2WorkerRefundRecord, V2WorkerSettlementDetail } from '@shared/contracts/index'
import { centsToYuan, formatCents, getErrorMessage, today, yuanToCents } from '../../composables/v2-utils'
import { useSettlements } from '../../composables/use-settlements'
import { SettlementDetail } from '../../components/settlement/settlement-detail'
import {
  YumiBusinessList,
  YumiBusinessListItem,
  YumiButton,
  YumiDatePicker,
  YumiDateRangePicker,
  YumiField,
  YumiFieldLabel,
  YumiNumberField,
  YumiPageHeader,
  YumiSearchSelect,
  YumiSheet,
  YumiStatusTag,
  YumiTextArea
} from '../../components/ui'
import { WorkersPage } from '../workers'

type SettlementsWorkspace = 'settlements' | 'refunds' | 'workers'
type SettlementsNavigationTarget = Extract<V2NavigationTarget, { view: 'settlements' }>

interface SettlementsPageProps {
  navigationTarget?: SettlementsNavigationTarget | null
}

export function SettlementsPage({ navigationTarget = null }: SettlementsPageProps) {
  const {
    workers, settlements, refunds, loading, loadError,
    createWorker, listWageHistory, recordWageHistory,
    createDraft, updateDraft, confirmSettlement, resolveRefund
  } = useSettlements()
  const [workspace, setWorkspace] = useState<SettlementsWorkspace>('settlements')
  const [showDraftForm, setShowDraftForm] = useState(false)
  const [workerId, setWorkerId] = useState('')
  const [periodStartOn, setPeriodStartOn] = useState(today())
  const [periodEndOn, setPeriodEndOn] = useState(today())
  const [selectedSettlementId, setSelectedSettlementId] = useState('')
  const [selectedRefundId, setSelectedRefundId] = useState('')
  const [showRefundSheet, setShowRefundSheet] = useState(false)
  const [actualRefundAmount, setActualRefundAmount] = useState('')
  const [refundedOn, setRefundedOn] = useState(today())
  const [refundNote, setRefundNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (workerId && workers.some((worker) => worker.id === workerId)) return
    setWorkerId(workers[0]?.id ?? '')
  }, [workerId, workers])
  useEffect(() => {
    if (!selectedSettlementId || settlements.some((settlement) => settlement.id === selectedSettlementId)) return
    setSelectedSettlementId('')
  }, [selectedSettlementId, settlements])
  useEffect(() => {
    if (!selectedRefundId || refunds.some((refund) => refund.id === selectedRefundId)) return
    setSelectedRefundId('')
    setShowRefundSheet(false)
  }, [refunds, selectedRefundId])
  useEffect(() => {
    if (!navigationTarget) return
    if (navigationTarget.settlementId) {
      setSelectedSettlementId(navigationTarget.settlementId)
      setShowDraftForm(false)
    }
    if (navigationTarget.focus === 'refund') setWorkspace('refunds')
  }, [navigationTarget])

  const workerNames = useMemo(() => new Map(workers.map((worker) => [worker.id, worker.name])), [workers])
  const workerOptions = useMemo(() => workers.map((worker) => ({ label: worker.name, searchText: worker.name, value: worker.id })), [workers])
  const selectedSettlement: V2WorkerSettlementDetail | null = settlements.find((settlement) => settlement.id === selectedSettlementId) ?? null
  const selectedRefund: V2WorkerRefundRecord | null = refunds.find((refund) => refund.id === selectedRefundId) ?? null
  const pendingRefunds = useMemo(() => refunds.filter((refund) => refund.status === 'pending'), [refunds])

  const openDraftForm = () => {
    setShowDraftForm(true)
    setSelectedSettlementId('')
    setError(null)
  }
  const openRefund = (refund: V2WorkerRefundRecord) => {
    setSelectedRefundId(refund.id)
    setActualRefundAmount(centsToYuan(refund.requestedRefundCents))
    setRefundedOn(today())
    setRefundNote(refund.managerNote ?? '')
    setError(null)
    setShowRefundSheet(true)
  }
  const handleCreateDraft = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!workerId) {
      setError('请选择兼职人员。')
      return
    }
    if (periodEndOn < periodStartOn) {
      setError('结束日期不能早于开始日期。')
      return
    }
    setSubmitting(true)
    try {
      const draft = await createDraft({ workerId, periodStartOn, periodEndOn })
      setSelectedSettlementId(draft.id)
      setShowDraftForm(false)
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }
  const handleResolveRefund = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedRefund) return
    setError(null)
    const actualRefundCents = yuanToCents(actualRefundAmount)
    if (actualRefundCents <= 0) {
      setError('请填写实际退款金额。')
      return
    }
    if (actualRefundCents > selectedRefund.requestedRefundCents) {
      setError('实际退款不能超过待退款金额。')
      return
    }
    setSubmitting(true)
    try {
      await resolveRefund(selectedRefund.id, { actualRefundCents, refundedOn, managerNote: refundNote || null })
      setShowRefundSheet(false)
      setSelectedRefundId('')
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="yumi-settlements-workspace">
    <YumiPageHeader
      actions={<div className="yumi-page-tabs">
        <YumiButton aria-pressed={workspace === 'settlements'} onClick={() => setWorkspace('settlements')} variant={workspace === 'settlements' ? 'secondary' : 'ghost'}>工资结算</YumiButton>
        <YumiButton aria-pressed={workspace === 'refunds'} onClick={() => setWorkspace('refunds')} variant={workspace === 'refunds' ? 'secondary' : 'ghost'}>待退款{pendingRefunds.length ? ` ${pendingRefunds.length}` : ''}</YumiButton>
        <YumiButton aria-pressed={workspace === 'workers'} onClick={() => setWorkspace('workers')} variant={workspace === 'workers' ? 'secondary' : 'ghost'}>人员与时薪</YumiButton>
        {workspace === 'settlements' && <YumiButton onClick={openDraftForm} variant="primary">新建结算</YumiButton>}
      </div>}
      description="负责人确认实际工资；已确认工资后发现的不合格，不回写历史实发，改由负责人单独处理退款。"
      title="工资"
    />
    {loadError && <p className="yumi-feedback yumi-feedback--danger" role="alert">{loadError}</p>}
    {error && <p className="yumi-feedback yumi-feedback--danger" role="alert">{error}</p>}
    {workspace === 'workers' ? <WorkersPage workers={workers} createWorker={createWorker} listWageHistory={listWageHistory} recordWageHistory={recordWageHistory} /> : workspace === 'refunds' ? <div aria-label="兼职待退款列表" className="yumi-primary-list">
      <p className="yumi-workspace-hint">只列出已确认工资后才发现的不合格；负责人登记实际收到的退款，原工资记录保持不变。</p>
      {loading ? <div className="yumi-empty">加载待退款记录中…</div> : refunds.length === 0 ? <div className="yumi-empty">暂无兼职退款记录。</div> : <YumiBusinessList>
        {refunds.map((refund) => <YumiBusinessListItem
          key={refund.id}
          meta={refund.status === 'refunded' && refund.refundedOn ? `退款日期 ${refund.refundedOn}` : '等待负责人处理'}
          metrics={[{ label: refund.status === 'pending' ? '待退款' : '已退款', value: formatCents(refund.status === 'pending' ? refund.requestedRefundCents : (refund.actualRefundCents ?? 0)) }]}
          onOpen={refund.status === 'pending' ? () => openRefund(refund) : undefined}
          status={<YumiStatusTag tone={refund.status === 'pending' ? 'warning' : 'success'}>{refund.status === 'pending' ? '待退款' : '已退款'}</YumiStatusTag>}
          summary={`不合格 ${refund.unqualifiedQuantity} 件 · 原结算 ${refund.originalSettlementId}`}
          title={`${workerNames.get(refund.workerId) ?? refund.workerId} · 已确认工资退款`}
        />)}
      </YumiBusinessList>}
    </div> : <>
      <div aria-label="工资结算列表" className="yumi-primary-list">
        {loading ? <div className="yumi-empty">加载工资结算中…</div> : settlements.length === 0 ? <div className="yumi-empty">尚未建立工资结算。</div> : <YumiBusinessList>
          {settlements.map((settlement) => <YumiBusinessListItem
            key={settlement.id}
            meta={settlement.id === selectedSettlementId ? '当前查看' : undefined}
            metrics={[{ label: '最终实发', value: settlement.finalPaidAmountCents === null ? '待确认' : formatCents(settlement.finalPaidAmountCents) }]}
            onOpen={() => { setSelectedSettlementId(settlement.id); setShowDraftForm(false) }}
            status={<YumiStatusTag tone={settlement.status === 'draft' ? 'warning' : 'success'}>{settlement.status === 'draft' ? '草稿' : '已确认'}</YumiStatusTag>}
            summary={`${settlement.periodStartOn} 至 ${settlement.periodEndOn}`}
            title={workerNames.get(settlement.workerId) ?? settlement.workerId}
          />)}
        </YumiBusinessList>}
      </div>
      {selectedSettlement && <SettlementDetail settlement={selectedSettlement} workerName={workerNames.get(selectedSettlement.workerId) ?? selectedSettlement.workerId} updateDraft={updateDraft} confirmSettlement={confirmSettlement} />}
    </>}
    <YumiSheet
      description="结算日期范围可按任意周或负责人指定周期填写；排班与考勤只作两套参考，最终实发由负责人确认。"
      footer={<div className="yumi-form-actions"><YumiButton onClick={() => setShowDraftForm(false)} variant="ghost">取消</YumiButton><YumiButton disabled={!workerId} form="settlement-draft-form" loading={submitting} type="submit" variant="primary">新建结算草稿</YumiButton></div>}
      onOpenChange={setShowDraftForm}
      open={showDraftForm}
      title="新建结算"
    >
      <form className="yumi-form-panel yumi-sheet-form" id="settlement-draft-form" onSubmit={handleCreateDraft}>
        <div className="yumi-form-grid yumi-form-grid--two">
          <YumiField>
            <YumiFieldLabel required>兼职人员</YumiFieldLabel>
            <YumiSearchSelect aria-label="兼职人员" onValueChange={setWorkerId} options={workerOptions} placeholder="搜索或选择人员" value={workerId} />
          </YumiField>
          <YumiField>
            <YumiFieldLabel required>结算日期范围</YumiFieldLabel>
            <YumiDateRangePicker aria-label="结算日期范围" onValueChange={(range) => {
              if (!range) return
              setPeriodStartOn(range.start)
              setPeriodEndOn(range.end)
            }} value={{ end: periodEndOn, start: periodStartOn }} />
          </YumiField>
        </div>
      </form>
    </YumiSheet>
    <YumiSheet
      description={selectedRefund ? `${workerNames.get(selectedRefund.workerId) ?? selectedRefund.workerId} · 待退款 ${formatCents(selectedRefund.requestedRefundCents)}，原结算不会被改写。` : undefined}
      footer={<div className="yumi-form-actions"><YumiButton onClick={() => setShowRefundSheet(false)} variant="ghost">取消</YumiButton><YumiButton form="worker-refund-form" loading={submitting} type="submit" variant="primary">确认退款</YumiButton></div>}
      onOpenChange={setShowRefundSheet}
      open={showRefundSheet && Boolean(selectedRefund)}
      title="登记兼职退款"
    >
      <form id="worker-refund-form" onSubmit={handleResolveRefund}>
        <div className="yumi-form-grid yumi-form-grid--two">
          <YumiField><YumiFieldLabel required>实际退款金额（元）</YumiFieldLabel><YumiNumberField allowDecimal min="0.01" onChange={(event) => setActualRefundAmount(event.target.value)} required value={actualRefundAmount} /></YumiField>
          <YumiField><YumiFieldLabel required>退款日期</YumiFieldLabel><YumiDatePicker aria-label="兼职退款日期" onValueChange={setRefundedOn} value={refundedOn} /></YumiField>
        </div>
        <YumiField><YumiFieldLabel>处理备注</YumiFieldLabel><YumiTextArea onChange={(event) => setRefundNote(event.target.value)} placeholder="例如：已由兼职人员退回" value={refundNote} /></YumiField>
      </form>
    </YumiSheet>
  </div>
}
