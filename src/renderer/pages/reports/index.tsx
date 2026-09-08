import { useCallback, useEffect, useState } from 'react'
import type { V2ConfirmedSettlementReportRow, V2FulfillmentProgressReportRow, V2OrderBusinessReportRow } from '@shared/contracts/index'
import { useReports } from '../../composables/use-reports'
import { formatCents, getErrorMessage, today } from '../../composables/v2-utils'
import { YumiButton, YumiDataTable, YumiField, YumiFieldLabel, YumiMonthPicker, YumiPageHeader, YumiSection, YumiStatusTag } from '../../components/ui'

export function ReportsPage() {
  const { orderBusiness, fulfillmentProgress, confirmedSettlements, monthlyOperation, loading, loadError, exporting, exportMessage, load, exportCurrentReport } = useReports()
  const [month, setMonth] = useState(today().slice(0, 7))
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try { setError(null); await load(month) } catch (cause) { setError(getErrorMessage(cause)) }
  }, [load, month])
  useEffect(() => { void reload() }, [reload])
  const exportReport = useCallback(async () => {
    try { setError(null); await exportCurrentReport(month) } catch (cause) { setError(getErrorMessage(cause)) }
  }, [exportCurrentReport, month])

  return <div className="yumi-reports-workspace">
    <YumiPageHeader
      actions={<YumiStatusTag tone="success">只读汇总</YumiStatusTag>}
      description="订单核算不分摊工资；工资仅以负责人确认的实际发放为准；月度经营按实际收付款日期统计。"
      title="经营报表"
    />
    {loadError && <p className="yumi-feedback yumi-feedback--danger" role="alert">{loadError}</p>}
    {error && <p className="yumi-feedback yumi-feedback--danger" role="alert">{error}</p>}
    {exportMessage && <p className={`yumi-feedback ${exportMessage.startsWith('已导出') ? 'yumi-feedback--success' : ''}`} role="status">{exportMessage}</p>}

    <YumiSection description="报销付款保留现金事实，但不会重复作为经营支出。" title="月度经营">
      <div className="yumi-report-controls">
        <YumiField><YumiFieldLabel>统计月份</YumiFieldLabel><YumiMonthPicker aria-label="统计月份" onValueChange={setMonth} value={month} /></YumiField>
        <YumiButton disabled={loading || exporting} onClick={() => void reload()} variant="secondary">刷新</YumiButton>
        <YumiButton disabled={loading || exporting} loading={exporting} onClick={() => void exportReport()} variant="primary">导出当前报表</YumiButton>
      </div>
      <div className="yumi-finance-summary-grid">
        <Metric label="实际收入" cents={monthlyOperation?.incomeCents ?? 0} tone="success" />
        <Metric label="经营支出" cents={monthlyOperation?.operatingExpenseCents ?? 0} tone="danger" />
        <Metric label="经营结果" cents={monthlyOperation?.operatingResultCents ?? 0} tone={(monthlyOperation?.operatingResultCents ?? 0) >= 0 ? 'success' : 'danger'} />
        <Metric label="已确认工资" cents={monthlyOperation?.confirmedSettlementPaidCents ?? 0} tone="brand" />
      </div>
    </YumiSection>

    <YumiSection description="成本为商品下单快照成本与售后核算成本，不将未建立分摊规则的工资强行计入订单。" title="订单核算">
      <YumiDataTable<V2OrderBusinessReportRow>
        columns={[
          { key: 'order', label: '订单', render: (row) => <><strong>{row.orderCode}</strong><br /><span className="yumi-table-secondary">{row.customerName}</span></> },
          { align: 'right', key: 'current', label: '确认金额', render: (row) => formatCents(row.currentAmountCents) },
          { align: 'right', key: 'received', label: '净收款', render: (row) => formatCents(row.netReceivedCents) },
          { align: 'right', key: 'outstanding', label: '待收', render: (row) => formatCents(row.outstandingCents) },
          { align: 'right', key: 'product-cost', label: '商品成本', render: (row) => formatCents(row.productCostCents) },
          { align: 'right', key: 'after-sales-cost', label: '售后成本', render: (row) => formatCents(row.afterSalesCostCents) },
          { align: 'right', key: 'margin', label: '核算利润参考', render: (row) => <strong>{formatCents(row.knownMarginCents)}</strong> }
        ]}
        emptyText="暂无 V2 订单事实。"
        getRowKey={(row) => row.orderId}
        rows={orderBusiness?.rows ?? []}
      />
    </YumiSection>

    <YumiSection description="阶段数量来自期初在制品、质检合格、打包和发货等履约事件。" title="履约进度">
      <div className="yumi-section-inline-status"><YumiStatusTag tone="warning">已发 {fulfillmentProgress?.totalShippedQuantity ?? 0} 件</YumiStatusTag></div>
      <YumiDataTable<V2FulfillmentProgressReportRow>
        columns={[
          { key: 'item', label: '订单产品', render: (row) => <><strong>{row.orderCode}</strong><br /><span className="yumi-table-secondary">{row.productName}</span></> },
          { align: 'right', key: 'confirmed', label: '确认数量', render: (row) => row.confirmedQuantity },
          { align: 'right', key: 'making', label: '制作中', render: (row) => row.stages.making },
          { align: 'right', key: 'fluffing', label: '待捏毛装袋', render: (row) => row.stages.fluffingBagging },
          { align: 'right', key: 'packing', label: '待打包', render: (row) => row.stages.packing },
          { align: 'right', key: 'ship', label: '待发货', render: (row) => row.stages.readyToShip },
          { align: 'right', key: 'shipped', label: '已发货', render: (row) => row.stages.shipped }
        ]}
        emptyText="暂无 V2 履约事实。"
        getRowKey={(row) => row.orderItemId}
        rows={fulfillmentProgress?.rows ?? []}
      />
    </YumiSection>

    <YumiSection description="草稿结算、排班参考工资和考勤参考工资均不作为实际发放进入本报表。" title="已确认工资">
      <div className="yumi-section-inline-status"><YumiStatusTag tone="brand">合计 {formatCents(confirmedSettlements?.totalFinalPaidCents ?? 0)}</YumiStatusTag></div>
      <YumiDataTable<V2ConfirmedSettlementReportRow>
        columns={[
          { key: 'worker', label: '兼职人员', render: (row) => row.workerName },
          { key: 'period', label: '结算周期', render: (row) => `${row.periodStartOn} 至 ${row.periodEndOn}` },
          { key: 'paid-on', label: '实际付款日', render: (row) => row.paidOn },
          { align: 'right', key: 'paid', label: '实发金额', render: (row) => <strong>{formatCents(row.finalPaidAmountCents)}</strong> },
          { key: 'note', label: '负责人备注', render: (row) => row.managerNote ?? '—' }
        ]}
        emptyText="当前没有已确认并实际发放的工资结算。"
        getRowKey={(row) => row.id}
        rows={confirmedSettlements?.rows ?? []}
      />
    </YumiSection>
  </div>
}

function Metric({ cents, label, tone }: { cents: number; label: string; tone: 'brand' | 'success' | 'danger' }) {
  return <article className={`yumi-finance-metric yumi-finance-metric--${tone}`}><span>{label}</span><strong>{formatCents(cents)}</strong></article>
}
