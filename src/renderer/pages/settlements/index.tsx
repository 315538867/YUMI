import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type {
  V2NavigationTarget,
  V2WorkerRefundRecord,
  V2WorkerSettlementDetail
} from '@shared/contracts/index'
import {
  centsToYuan,
  formatCents,
  getErrorMessage,
  today,
  yuanToCents
} from '../../composables/v2-utils'
import { useSettlements } from '../../composables/use-settlements'
import { useWorkTimeReviews } from '../../composables/use-work-time-reviews'
import { SettlementDetail } from '../../components/settlement/settlement-detail'
import {
  YumiButton,
  YumiConfirmDialog,
  YumiDataTable,
  YumiDatePicker,
  YumiDateRangePicker,
  YumiEmptyState,
  YumiField,
  YumiFieldLabel,
  YumiNumberField,
  YumiListSurface,
  YumiListToolbar,
  YumiPageHeader,
  YumiPrimaryTabs,
  YumiSection,
  YumiSelect,
  YumiSearchSelect,
  YumiSheet,
  YumiStatusTag,
  YumiTextArea,
  YumiTextField,
  useYumiNotificationMessage
} from '../../components/ui'
import { WorkersPage } from '../workers'

type SettlementsWorkspace = 'settlements' | 'refunds' | 'workers'
type SettlementStatusFilter = 'all' | 'draft' | 'confirmed'
type RefundStatusFilter = 'all' | 'pending' | 'refunded'
type SettlementsNavigationTarget = Extract<V2NavigationTarget, { view: 'settlements' }>

interface SettlementsPageProps {
  navigationTarget?: SettlementsNavigationTarget | null
}

export function SettlementsPage({ navigationTarget = null }: SettlementsPageProps) {
  const {
    workers,
    settlements,
    refunds,
    loading,
    loadError,
    createWorker,
    listWageHistory,
    recordWageHistory,
    createDraft,
    updateDraft,
    confirmSettlement,
    addWorkTimeAdjustment,
    resolveRefund
  } = useSettlements()
  const workTimeReviews = useWorkTimeReviews()
  const [workspace, setWorkspace] = useState<SettlementsWorkspace>('settlements')
  const [showDraftForm, setShowDraftForm] = useState(false)
  const [workerId, setWorkerId] = useState('')
  const [periodStartOn, setPeriodStartOn] = useState(today())
  const [periodEndOn, setPeriodEndOn] = useState(today())
  const [selectedSettlementId, setSelectedSettlementId] = useState('')
  const [selectedRefundId, setSelectedRefundId] = useState('')
  const [showRefundSheet, setShowRefundSheet] = useState(false)
  const [refundConfirmOpen, setRefundConfirmOpen] = useState(false)
  const [actualRefundAmount, setActualRefundAmount] = useState('')
  const [refundedOn, setRefundedOn] = useState(today())
  const [refundNote, setRefundNote] = useState('')
  const [settlementSearchQuery, setSettlementSearchQuery] = useState('')
  const [settlementStatusFilter, setSettlementStatusFilter] =
    useState<SettlementStatusFilter>('all')
  const [refundSearchQuery, setRefundSearchQuery] = useState('')
  const [refundStatusFilter, setRefundStatusFilter] = useState<RefundStatusFilter>('all')
  const [error, setError] = useState<string | null>(null)
  useYumiNotificationMessage(loadError)
  useYumiNotificationMessage(error)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (workerId && workers.some((worker) => worker.id === workerId)) return
    setWorkerId(workers[0]?.id ?? '')
  }, [workerId, workers])
  useEffect(() => {
    if (
      !selectedSettlementId ||
      settlements.some((settlement) => settlement.id === selectedSettlementId)
    )
      return
    setSelectedSettlementId('')
  }, [selectedSettlementId, settlements])
  useEffect(() => {
    if (!selectedRefundId || refunds.some((refund) => refund.id === selectedRefundId)) return
    setSelectedRefundId('')
    setRefundConfirmOpen(false)
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

  const workerNames = useMemo(
    () => new Map(workers.map((worker) => [worker.id, worker.name])),
    [workers]
  )
  const workerLabel = useCallback(
    (workerId: string) => workerNames.get(workerId) ?? '未知人员',
    [workerNames]
  )
  const workerOptions = useMemo(
    () =>
      workers.map((worker) => ({ label: worker.name, searchText: worker.name, value: worker.id })),
    [workers]
  )
  const selectedSettlementWorkerId = useMemo(
    () => settlements.find((settlement) => settlement.id === selectedSettlementId)?.workerId ?? '',
    [settlements, selectedSettlementId]
  )
  const confirmedReviewOptions = useMemo(
    () =>
      workTimeReviews.reviews
        .filter(
          (review) =>
            review.status === 'confirmed' && review.workerId === selectedSettlementWorkerId
        )
        .map((review) => ({
          id: review.id,
          label: `${review.workedOn} · ${
            review.processType === 'fluffing_bagging'
              ? '捏毛装袋'
              : review.processType === 'edge_sewing'
                ? '缝边'
                : '打包发货'
          } · ${review.approvedMinutes} 分钟`
        })),
    [workTimeReviews.reviews, selectedSettlementWorkerId]
  )

  const selectedSettlement: V2WorkerSettlementDetail | null =
    settlements.find((settlement) => settlement.id === selectedSettlementId) ?? null
  const selectedRefund: V2WorkerRefundRecord | null =
    refunds.find((refund) => refund.id === selectedRefundId) ?? null
  const pendingRefunds = useMemo(
    () => refunds.filter((refund) => refund.status === 'pending'),
    [refunds]
  )
  const visibleSettlements = useMemo(() => {
    const query = settlementSearchQuery.trim().toLocaleLowerCase()
    return settlements.filter((settlement) => {
      const workerName = workerLabel(settlement.workerId)
      const matchesStatus =
        settlementStatusFilter === 'all' || settlement.status === settlementStatusFilter
      const matchesQuery =
        !query ||
        [workerName, settlement.periodStartOn, settlement.periodEndOn]
          .join(' ')
          .toLocaleLowerCase()
          .includes(query)
      return matchesStatus && matchesQuery
    })
  }, [settlementSearchQuery, settlementStatusFilter, settlements, workerLabel])
  const visibleRefunds = useMemo(() => {
    const query = refundSearchQuery.trim().toLocaleLowerCase()
    return refunds.filter((refund) => {
      const workerName = workerLabel(refund.workerId)
      const matchesStatus = refundStatusFilter === 'all' || refund.status === refundStatusFilter
      const matchesQuery =
        !query ||
        [workerName, refund.originalSettlementId, refund.refundedOn]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase()
          .includes(query)
      return matchesStatus && matchesQuery
    })
  }, [refundSearchQuery, refundStatusFilter, refunds, workerLabel])

  const openDraftForm = () => {
    setShowDraftForm(true)
    setSelectedSettlementId('')
    setError(null)
  }
  const openRefund = (refund: V2WorkerRefundRecord) => {
    setSelectedRefundId(refund.id)
    setActualRefundAmount(centsToYuan(refund.materialRefundCents))
    setRefundedOn(today())
    setRefundNote(refund.managerNote ?? '')
    setError(null)
    setRefundConfirmOpen(false)
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
  const requestRefundConfirmation = (event: FormEvent) => {
    event.preventDefault()
    if (!selectedRefund) return
    setError(null)
    const actualRefundCents = yuanToCents(actualRefundAmount)
    if (actualRefundCents <= 0) {
      setError('请填写实际退款金额。')
      return
    }
    if (actualRefundCents > selectedRefund.materialRefundCents) {
      setError('实际退款不能超过待退款金额。')
      return
    }
    setRefundConfirmOpen(true)
  }
  const confirmRefund = async () => {
    if (!selectedRefund) return
    const actualRefundCents = yuanToCents(actualRefundAmount)
    setRefundConfirmOpen(false)
    setError(null)
    setSubmitting(true)
    try {
      await resolveRefund(selectedRefund.id, {
        actualRefundCents,
        refundedOn,
        managerNote: refundNote || null
      })
      setShowRefundSheet(false)
      setSelectedRefundId('')
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="yumi-page yumi-settlements-workspace">
      <YumiPageHeader
        actions={{
          ariaLabel: '工资页面动作',
          primaryAction: { label: '新建结算', onClick: openDraftForm }
        }}
        description="负责人确认实际工资；已确认工资后发现的不合格，不回写历史实发，改由负责人单独处理退款。"
        meta={`${workers.length} 位人员`}
        title="工资"
      />
      <YumiPrimaryTabs
        ariaLabel="工资工作视图"
        items={[
          { id: 'settlements', label: '工资结算' },
          {
            id: 'refunds',
            label: `待退款${pendingRefunds.length ? ` ${pendingRefunds.length}` : ''}`
          },
          { id: 'workers', label: '人员与时薪' }
        ]}
        onValueChange={setWorkspace}
        value={workspace}
      />
      {workspace === 'workers' ? (
        <WorkersPage
          embedded
          workers={workers}
          createWorker={createWorker}
          listWageHistory={listWageHistory}
          recordWageHistory={recordWageHistory}
        />
      ) : workspace === 'refunds' ? (
        <YumiSection
          ariaLabel="兼职待退款记录"
          description="只列出已确认工资后才发现的不合格；负责人登记实际收到的退款，原工资记录保持不变。"
          title="待退款记录"
        >
          <YumiListSurface>
            <YumiListToolbar
              ariaLabel="兼职待退款列表工具"
              countLabel={`共 ${visibleRefunds.length} 笔退款`}
              filters={
                <YumiSelect
                  aria-label="退款状态筛选"
                  onValueChange={(value) => setRefundStatusFilter(value as RefundStatusFilter)}
                  options={[
                    { label: '全部状态', value: 'all' },
                    { label: '待退款', value: 'pending' },
                    { label: '已退款', value: 'refunded' }
                  ]}
                  value={refundStatusFilter}
                />
              }
              search={
                <YumiTextField
                  aria-label="搜索兼职退款"
                  onChange={(event) => setRefundSearchQuery(event.target.value)}
                  placeholder="搜索人员或原结算"
                  value={refundSearchQuery}
                />
              }
            />
            {loading ? (
              <YumiEmptyState
                description="正在读取兼职退款记录，请稍候。"
                scenario="loading"
                title="待退款记录加载中"
              />
            ) : (
              <YumiDataTable<V2WorkerRefundRecord>
                ariaLabel="兼职待退款列表"
                columns={[
                  {
                    key: 'worker',
                    label: '人员 / 原结算',
                    render: (refund) => (
                      <div className="yumi-list-cell">
                        <strong>{workerLabel(refund.workerId)}</strong>
                        <span>原结算 {refund.originalSettlementId}</span>
                      </div>
                    )
                  },
                  {
                    key: 'unqualified',
                    label: '不合格数量',
                    render: (refund) => `${refund.unqualifiedQuantity} 件`
                  },
                  {
                    align: 'right',
                    key: 'amount',
                    label: '退款金额',
                    render: (refund) =>
                      formatCents(
                        refund.status === 'pending'
                          ? refund.materialRefundCents
                          : (refund.actualRefundCents ?? 0)
                      )
                  },
                  {
                    key: 'status',
                    label: '状态',
                    render: (refund) => (
                      <YumiStatusTag tone={refund.status === 'pending' ? 'warning' : 'success'}>
                        {refund.status === 'pending' ? '待退款' : '已退款'}
                      </YumiStatusTag>
                    )
                  },
                  {
                    align: 'right',
                    key: 'action',
                    label: '操作',
                    render: (refund) =>
                      refund.status === 'pending' ? (
                        <YumiButton
                          aria-label={`处理退款：${workerLabel(refund.workerId)}`}
                          onClick={() => openRefund(refund)}
                          variant="secondary"
                        >
                          处理退款
                        </YumiButton>
                      ) : (
                        '—'
                      )
                  }
                ]}
                emptyText={refunds.length ? '没有符合当前筛选的退款记录。' : '暂无兼职退款记录。'}
                getRowKey={(refund) => refund.id}
                rows={visibleRefunds}
              />
            )}
          </YumiListSurface>
        </YumiSection>
      ) : (
        <>
          <YumiSection title="工资结算记录">
            <YumiListSurface>
              <YumiListToolbar
                ariaLabel="工资结算列表工具"
                countLabel={`共 ${visibleSettlements.length} 笔结算`}
                filters={
                  <YumiSelect
                    aria-label="结算状态筛选"
                    onValueChange={(value) =>
                      setSettlementStatusFilter(value as SettlementStatusFilter)
                    }
                    options={[
                      { label: '全部状态', value: 'all' },
                      { label: '草稿', value: 'draft' },
                      { label: '已确认', value: 'confirmed' }
                    ]}
                    value={settlementStatusFilter}
                  />
                }
                search={
                  <YumiTextField
                    aria-label="搜索工资结算"
                    onChange={(event) => setSettlementSearchQuery(event.target.value)}
                    placeholder="搜索人员或结算周期"
                    value={settlementSearchQuery}
                  />
                }
              />
              {loading ? (
                <YumiEmptyState
                  description="正在读取工资结算记录，请稍候。"
                  scenario="loading"
                  title="工资结算加载中"
                />
              ) : (
                <YumiDataTable<V2WorkerSettlementDetail>
                  ariaLabel="工资结算列表"
                  columns={[
                    {
                      key: 'worker',
                      label: '兼职人员',
                      render: (settlement) => (
                        <div className="yumi-list-cell">
                          <strong>{workerLabel(settlement.workerId)}</strong>
                          <span>
                            {settlement.id === selectedSettlementId ? '当前查看' : '工资结算记录'}
                          </span>
                        </div>
                      )
                    },
                    {
                      key: 'period',
                      label: '结算周期',
                      render: (settlement) =>
                        `${settlement.periodStartOn} 至 ${settlement.periodEndOn}`
                    },
                    {
                      align: 'right',
                      key: 'paid',
                      label: '最终实发',
                      render: (settlement) =>
                        settlement.finalPaidAmountCents === null
                          ? '待确认'
                          : formatCents(settlement.finalPaidAmountCents)
                    },
                    {
                      key: 'status',
                      label: '状态',
                      render: (settlement) => (
                        <YumiStatusTag tone={settlement.status === 'draft' ? 'warning' : 'success'}>
                          {settlement.status === 'draft' ? '草稿' : '已确认'}
                        </YumiStatusTag>
                      )
                    },
                    {
                      align: 'right',
                      key: 'action',
                      label: '操作',
                      render: (settlement) => (
                        <YumiButton
                          aria-label={`查看结算详情：${workerLabel(settlement.workerId)}`}
                          onClick={() => {
                            setSelectedSettlementId(settlement.id)
                            setShowDraftForm(false)
                          }}
                          variant="secondary"
                        >
                          查看详情
                        </YumiButton>
                      )
                    }
                  ]}
                  emptyText={
                    settlements.length ? '没有符合当前筛选的工资结算。' : '尚未建立工资结算。'
                  }
                  getRowKey={(settlement) => settlement.id}
                  rows={visibleSettlements}
                />
              )}
            </YumiListSurface>
          </YumiSection>
          {selectedSettlement && (
            <SettlementDetail
              addWorkTimeAdjustment={addWorkTimeAdjustment}
              adjustableReviews={confirmedReviewOptions}
              settlement={selectedSettlement}
              workerName={workerLabel(selectedSettlement.workerId)}
              updateDraft={updateDraft}
              confirmSettlement={confirmSettlement}
            />
          )}
        </>
      )}
      <YumiSheet
        description="结算日期范围可按任意周或负责人指定周期填写；工资期间按工作日期归属，最终实发由负责人确认。"
        footer={
          <div className="yumi-form-actions">
            <YumiButton onClick={() => setShowDraftForm(false)} variant="ghost">
              取消
            </YumiButton>
            <YumiButton
              disabled={!workerId}
              form="settlement-draft-form"
              loading={submitting}
              type="submit"
              variant="primary"
            >
              新建结算草稿
            </YumiButton>
          </div>
        }
        onOpenChange={setShowDraftForm}
        open={showDraftForm}
        title="新建结算"
      >
        <form
          className="yumi-form-panel yumi-sheet-form"
          id="settlement-draft-form"
          onSubmit={handleCreateDraft}
        >
          <div className="yumi-form-grid yumi-form-grid--two">
            <YumiField>
              <YumiFieldLabel required>兼职人员</YumiFieldLabel>
              <YumiSearchSelect
                aria-label="兼职人员"
                onValueChange={setWorkerId}
                options={workerOptions}
                placeholder="搜索或选择人员"
                value={workerId}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel required>结算日期范围</YumiFieldLabel>
              <YumiDateRangePicker
                aria-label="结算日期范围"
                onValueChange={(range) => {
                  if (!range) return
                  setPeriodStartOn(range.start)
                  setPeriodEndOn(range.end)
                }}
                value={{ end: periodEndOn, start: periodStartOn }}
              />
            </YumiField>
          </div>
        </form>
      </YumiSheet>
      <YumiSheet
        description={
          selectedRefund
            ? `${workerLabel(selectedRefund.workerId)} · 待退款 ${formatCents(selectedRefund.materialRefundCents)}，原结算不会被改写。`
            : undefined
        }
        footer={
          <div className="yumi-form-actions">
            <YumiButton onClick={() => setShowRefundSheet(false)} variant="ghost">
              取消
            </YumiButton>
            <YumiButton
              form="worker-refund-form"
              loading={submitting}
              type="submit"
              variant="primary"
            >
              确认退款
            </YumiButton>
          </div>
        }
        onOpenChange={(open) => {
          setShowRefundSheet(open)
          if (!open) setRefundConfirmOpen(false)
        }}
        open={showRefundSheet && Boolean(selectedRefund)}
        title="登记兼职退款"
      >
        <form id="worker-refund-form" onSubmit={requestRefundConfirmation}>
          <div className="yumi-form-grid yumi-form-grid--two">
            <YumiField>
              <YumiFieldLabel required>实际退款金额（元）</YumiFieldLabel>
              <YumiNumberField
                allowDecimal
                aria-label="实际退款金额（元）"
                min="0.01"
                onChange={(event) => setActualRefundAmount(event.target.value)}
                required
                value={actualRefundAmount}
              />
            </YumiField>
            <YumiField>
              <YumiFieldLabel required>退款日期</YumiFieldLabel>
              <YumiDatePicker
                aria-label="兼职退款日期"
                onValueChange={setRefundedOn}
                value={refundedOn}
              />
            </YumiField>
          </div>
          <YumiField>
            <YumiFieldLabel>处理备注</YumiFieldLabel>
            <YumiTextArea
              aria-label="退款处理备注"
              onChange={(event) => setRefundNote(event.target.value)}
              placeholder="例如：已由兼职人员退回"
              value={refundNote}
            />
          </YumiField>
        </form>
      </YumiSheet>
      <YumiConfirmDialog
        confirmLabel="确认登记退款"
        description="会将本笔待退款标为已退款，原工资结算保持不变。确认后会写入退款金额、日期与处理备注。"
        destructive={false}
        onConfirm={confirmRefund}
        onOpenChange={setRefundConfirmOpen}
        open={refundConfirmOpen}
        title="确认登记兼职退款？"
      />
    </section>
  )
}
