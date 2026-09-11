import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  V2CapacityRiskReportRow,
  V2ConfirmedSettlementReportRow,
  V2DeliveryRiskReportRow,
  V2FulfillmentProgressReportRow,
  V2NavigationTarget,
  V2OrderBusinessReportRow,
  V2RiskLevel
} from '@shared/contracts/index'
import { useReports } from '../../composables/use-reports'
import { formatCents, getErrorMessage, today } from '../../composables/v2-utils'
import {
  YumiButton,
  YumiDataTable,
  YumiDatePicker,
  YumiEmptyState,
  YumiField,
  YumiFieldLabel,
  YumiListSurface,
  YumiListToolbar,
  YumiMetricStrip,
  YumiMonthPicker,
  YumiPageHeader,
  YumiSection,
  YumiSelect,
  YumiStatusTag,
  useYumiNotificationMessage
} from '../../components/ui'

type ReportsPageProps = { onNavigate?(target: V2NavigationTarget): void }
type RiskFilter = 'all' | V2RiskLevel

export function ReportsPage({ onNavigate }: ReportsPageProps) {
  const {
    orderBusiness,
    fulfillmentProgress,
    confirmedSettlements,
    monthlyOperation,
    capacityRisk,
    deliveryRisk,
    loading,
    loadError,
    exporting,
    exportMessage,
    load,
    exportCurrentReport,
    exportOrderTable,
    exportShippingList
  } = useReports()
  const [month, setMonth] = useState(today().slice(0, 7))
  const [capacityStartOn, setCapacityStartOn] = useState(today())
  const [capacityEndOn, setCapacityEndOn] = useState(addDays(today(), 7))
  const [deliveryAsOf, setDeliveryAsOf] = useState(today())
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all')
  const [error, setError] = useState<string | null>(null)
  useYumiNotificationMessage(loadError)
  useYumiNotificationMessage(error)
  useYumiNotificationMessage(exportMessage, {
    tone: exportMessage?.startsWith('已导出')
      ? 'success'
      : exportMessage?.startsWith('已取消')
        ? 'info'
        : 'danger',
    timeout: exportMessage?.startsWith('已导出')
      ? 5000
      : exportMessage?.startsWith('已取消')
        ? 3000
        : undefined
  })
  const reload = useCallback(async () => {
    try {
      setError(null)
      await load(month, {
        capacity: { startOn: capacityStartOn, endOn: capacityEndOn },
        delivery: { asOf: deliveryAsOf }
      })
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  }, [capacityEndOn, capacityStartOn, deliveryAsOf, load, month])
  useEffect(() => {
    void reload()
  }, [reload])
  const exportReport = useCallback(async () => {
    try {
      setError(null)
      await exportCurrentReport(month)
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  }, [exportCurrentReport, month])
  const exportOrders = useCallback(async () => {
    try {
      setError(null)
      await exportOrderTable()
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  }, [exportOrderTable])
  const exportShippingSummary = useCallback(async () => {
    try {
      setError(null)
      await exportShippingList()
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  }, [exportShippingList])
  const filteredDeliveryRows = useMemo(
    () =>
      (deliveryRisk?.rows ?? []).filter((row) => riskFilter === 'all' || row.level === riskFilter),
    [deliveryRisk, riskFilter]
  )

  return (
    <div className="yumi-page yumi-report-page">
      <YumiPageHeader
        actions={{
          ariaLabel: '经营报表页面动作',
          menu: {
            ariaLabel: '经营报表更多操作',
            disabled: loading || exporting,
            items: [
              {
                id: 'export-orders',
                label: '导出订单表',
                onSelect: () => void exportOrders()
              },
              {
                id: 'export-shipping-summary',
                label: '导出发货汇总',
                onSelect: () => void exportShippingSummary()
              }
            ]
          },
          primaryAction: {
            disabled: loading || exporting,
            label: '导出当前报表',
            onClick: () => void exportReport()
          }
        }}
        description="只读取已确认的订单、排班、收付款和工资事实；风险记录只提供进入实际处理区的入口。"
        title="经营报表"
      />
      {loading ? (
        <YumiEmptyState
          description="正在汇总订单、排班、资金与工资事实，请稍候。"
          scenario="loading"
          title="经营报表加载中"
        />
      ) : (
        <>
          <YumiSection
            actions={
              <YumiButton disabled={loading} onClick={() => void reload()} variant="secondary">
                刷新
              </YumiButton>
            }
            description="按统计月份查看实际收付款、经营支出和已确认工资。"
            title="月度经营"
          >
            <YumiListToolbar
              ariaLabel="月度经营筛选工具"
              filters={
                <YumiField>
                  <YumiFieldLabel>统计月份</YumiFieldLabel>
                  <YumiMonthPicker aria-label="统计月份" onValueChange={setMonth} value={month} />
                </YumiField>
              }
            />
            <YumiMetricStrip
              ariaLabel="月度经营结果指标"
              items={[
                {
                  label: '实际收入',
                  tone: 'success',
                  value: formatCents(monthlyOperation?.incomeCents ?? 0)
                },
                {
                  label: '经营支出',
                  tone: 'danger',
                  value: formatCents(monthlyOperation?.operatingExpenseCents ?? 0)
                },
                {
                  label: '经营结果',
                  tone: (monthlyOperation?.operatingResultCents ?? 0) >= 0 ? 'success' : 'danger',
                  value: formatCents(monthlyOperation?.operatingResultCents ?? 0)
                },
                {
                  label: '已确认工资',
                  tone: 'brand',
                  value: formatCents(monthlyOperation?.confirmedSettlementPaidCents ?? 0)
                }
              ]}
            />
          </YumiSection>

          <YumiSection
            description="周期内待制作需求、已排制作量与商品模具日产能并列展示。点击商品只查看基础资料；修改参数需在资料页主动编辑。"
            title="商品产能风险"
          >
            <YumiListSurface ariaLabel="商品产能风险记录">
              <YumiListToolbar
                ariaLabel="商品产能风险列表工具"
                countLabel={`共 ${capacityRisk?.rows.length ?? 0} 个商品`}
                filters={
                  <>
                    <YumiField>
                      <YumiFieldLabel>开始日期</YumiFieldLabel>
                      <YumiDatePicker
                        aria-label="产能风险开始日期"
                        onValueChange={setCapacityStartOn}
                        value={capacityStartOn}
                      />
                    </YumiField>
                    <YumiField>
                      <YumiFieldLabel>结束日期</YumiFieldLabel>
                      <YumiDatePicker
                        aria-label="产能风险结束日期"
                        onValueChange={setCapacityEndOn}
                        value={capacityEndOn}
                      />
                    </YumiField>
                    <YumiButton
                      disabled={loading}
                      onClick={() => void reload()}
                      variant="secondary"
                    >
                      刷新风险
                    </YumiButton>
                  </>
                }
              />
              <YumiDataTable<V2CapacityRiskReportRow>
                ariaLabel="商品产能风险列表"
                columns={[
                  {
                    key: 'product',
                    label: '商品',
                    render: (row) => <strong>{row.productName}</strong>
                  },
                  {
                    align: 'right',
                    key: 'demand',
                    label: '待制作需求',
                    render: (row) => `${row.demandQuantity} 件`
                  },
                  {
                    align: 'right',
                    key: 'scheduled',
                    label: '已排制作',
                    render: (row) => `${row.scheduledQuantity} 件`
                  },
                  {
                    align: 'right',
                    key: 'capacity',
                    label: '可用产能',
                    render: (row) => `${row.availableCapacityQuantity} 件`
                  },
                  {
                    align: 'right',
                    key: 'gap',
                    label: '缺口',
                    render: (row) => `${row.gapQuantity} 件`
                  },
                  {
                    key: 'risk',
                    label: '风险',
                    render: (row) => (
                      <>
                        <RiskTag level={row.level} />
                        <br />
                        <span className="yumi-table-secondary">
                          {row.riskSources.join('；') || '暂无'}
                        </span>
                      </>
                    )
                  },
                  {
                    key: 'action',
                    label: '处理',
                    render: (row) => (
                      <YumiButton
                        onClick={() =>
                          onNavigate?.({ view: 'products', productId: row.productRoute.productId })
                        }
                        variant="ghost"
                      >
                        查看商品
                      </YumiButton>
                    )
                  }
                ]}
                emptyText="选定周期暂无待制作订单或产能风险。"
                getRowKey={(row) => row.productId}
                rows={capacityRisk?.rows ?? []}
              />
            </YumiListSurface>
          </YumiSection>

          <YumiSection
            description="以制作截止日为准识别已逾期、临近交期和未计划的未完成订单；处理需进入排班工作区。"
            title="交期风险"
          >
            <YumiListSurface ariaLabel="交期风险记录">
              <YumiListToolbar
                ariaLabel="交期风险列表工具"
                countLabel={`共 ${filteredDeliveryRows.length} 条风险`}
                filters={
                  <>
                    <YumiField>
                      <YumiFieldLabel>截至日期</YumiFieldLabel>
                      <YumiDatePicker
                        aria-label="交期风险截至日期"
                        onValueChange={setDeliveryAsOf}
                        value={deliveryAsOf}
                      />
                    </YumiField>
                    <YumiField>
                      <YumiFieldLabel>风险级别</YumiFieldLabel>
                      <YumiSelect
                        aria-label="交期风险级别筛选"
                        onValueChange={(value) => setRiskFilter(value as RiskFilter)}
                        options={[
                          { label: '全部级别', value: 'all' },
                          { label: '严重', value: 'critical' },
                          { label: '预警', value: 'warning' },
                          { label: '未计划', value: 'unplanned' },
                          { label: '正常', value: 'normal' }
                        ]}
                        value={riskFilter}
                      />
                    </YumiField>
                    <YumiButton
                      disabled={loading}
                      onClick={() => void reload()}
                      variant="secondary"
                    >
                      刷新风险
                    </YumiButton>
                  </>
                }
              />
              <YumiDataTable<V2DeliveryRiskReportRow>
                ariaLabel="交期风险列表"
                columns={[
                  {
                    key: 'order',
                    label: '订单',
                    render: (row) => <strong>{row.orderCode}</strong>
                  },
                  {
                    key: 'expected',
                    label: '预计发货',
                    render: (row) => row.expectedShipDate ?? '未填写'
                  },
                  {
                    key: 'deadline',
                    label: '制作截止',
                    render: (row) => row.productionDeadline ?? '未计划'
                  },
                  {
                    align: 'right',
                    key: 'remaining',
                    label: '待发数量',
                    render: (row) => `${row.remainingQuantity} 件`
                  },
                  {
                    key: 'risk',
                    label: '风险',
                    render: (row) => (
                      <>
                        <RiskTag level={row.level} />
                        <br />
                        <span className="yumi-table-secondary">
                          {row.riskSources.join('；') || '暂无'}
                        </span>
                      </>
                    )
                  },
                  {
                    key: 'action',
                    label: '处理',
                    render: (row) => (
                      <YumiButton
                        onClick={() =>
                          onNavigate?.({
                            view: 'fulfillment',
                            orderId: row.fulfillmentRoute.orderId,
                            focus: 'queue'
                          })
                        }
                        variant="primary"
                      >
                        进入排班处理
                      </YumiButton>
                    )
                  }
                ]}
                emptyText="当前筛选条件下没有交期风险。"
                getRowKey={(row) => row.orderId}
                rows={filteredDeliveryRows}
              />
            </YumiListSurface>
          </YumiSection>

          <YumiSection
            description="成本为商品下单快照成本与售后核算成本，不将未建立分摊规则的工资强行计入订单。"
            title="订单核算"
          >
            <YumiListSurface ariaLabel="订单经营记录">
              <YumiListToolbar
                ariaLabel="订单经营列表工具"
                countLabel={`共 ${orderBusiness?.rows.length ?? 0} 笔订单`}
              />
              <YumiDataTable<V2OrderBusinessReportRow>
                ariaLabel="订单经营列表"
                columns={[
                  {
                    key: 'order',
                    label: '订单',
                    render: (row) => (
                      <>
                        <strong>{row.orderCode}</strong>
                        <br />
                        <span className="yumi-table-secondary">{row.customerName}</span>
                      </>
                    )
                  },
                  {
                    align: 'right',
                    key: 'current',
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
                    align: 'right',
                    key: 'product-cost',
                    label: '商品成本',
                    render: (row) => formatCents(row.productCostCents)
                  },
                  {
                    align: 'right',
                    key: 'after-sales-cost',
                    label: '售后成本',
                    render: (row) => formatCents(row.afterSalesCostCents)
                  },
                  {
                    align: 'right',
                    key: 'margin',
                    label: '核算利润参考',
                    render: (row) => <strong>{formatCents(row.knownMarginCents)}</strong>
                  }
                ]}
                emptyText="暂无 V2 订单事实。"
                getRowKey={(row) => row.orderId}
                rows={orderBusiness?.rows ?? []}
              />
            </YumiListSurface>
          </YumiSection>

          <YumiSection
            description="阶段数量来自期初在制品、质检合格、打包和发货等排班事件。"
            status={
              <YumiStatusTag tone="warning">
                已发 {fulfillmentProgress?.totalShippedQuantity ?? 0} 件
              </YumiStatusTag>
            }
            title="排班进度"
          >
            <YumiListSurface ariaLabel="排班进度记录">
              <YumiListToolbar
                ariaLabel="排班进度列表工具"
                countLabel={`共 ${fulfillmentProgress?.rows.length ?? 0} 条产品进度`}
              />
              <YumiDataTable<V2FulfillmentProgressReportRow>
                ariaLabel="排班进度列表"
                columns={[
                  {
                    key: 'item',
                    label: '订单产品',
                    render: (row) => (
                      <>
                        <strong>{row.orderCode}</strong>
                        <br />
                        <span className="yumi-table-secondary">{row.productName}</span>
                      </>
                    )
                  },
                  {
                    align: 'right',
                    key: 'confirmed',
                    label: '确认数量',
                    render: (row) => row.confirmedQuantity
                  },
                  {
                    align: 'right',
                    key: 'making',
                    label: '制作中',
                    render: (row) => row.stages.making
                  },
                  {
                    align: 'right',
                    key: 'fluffing',
                    label: '待捏毛装袋',
                    render: (row) => row.stages.fluffingBagging
                  },
                  {
                    align: 'right',
                    key: 'packing',
                    label: '待打包',
                    render: (row) => row.stages.packing
                  },
                  {
                    align: 'right',
                    key: 'ship',
                    label: '待发货',
                    render: (row) => row.stages.readyToShip
                  },
                  {
                    align: 'right',
                    key: 'shipped',
                    label: '已发货',
                    render: (row) => row.stages.shipped
                  }
                ]}
                emptyText="暂无 V2 排班事实。"
                getRowKey={(row) => row.orderItemId}
                rows={fulfillmentProgress?.rows ?? []}
              />
            </YumiListSurface>
          </YumiSection>

          <YumiSection
            description="草稿结算、排班参考工资和考勤参考工资均不作为实际发放进入本报表。"
            status={
              <YumiStatusTag tone="brand">
                合计 {formatCents(confirmedSettlements?.totalFinalPaidCents ?? 0)}
              </YumiStatusTag>
            }
            title="已确认工资"
          >
            <YumiListSurface ariaLabel="已确认工资记录">
              <YumiListToolbar
                ariaLabel="已确认工资列表工具"
                countLabel={`共 ${confirmedSettlements?.rows.length ?? 0} 笔结算`}
              />
              <YumiDataTable<V2ConfirmedSettlementReportRow>
                ariaLabel="已确认工资列表"
                columns={[
                  { key: 'worker', label: '兼职人员', render: (row) => row.workerName },
                  {
                    key: 'period',
                    label: '结算周期',
                    render: (row) => `${row.periodStartOn} 至 ${row.periodEndOn}`
                  },
                  { key: 'paid-on', label: '实际付款日', render: (row) => row.paidOn },
                  {
                    align: 'right',
                    key: 'paid',
                    label: '实发金额',
                    render: (row) => <strong>{formatCents(row.finalPaidAmountCents)}</strong>
                  },
                  { key: 'note', label: '负责人备注', render: (row) => row.managerNote ?? '—' }
                ]}
                emptyText="当前没有已确认并实际发放的工资结算。"
                getRowKey={(row) => row.id}
                rows={confirmedSettlements?.rows ?? []}
              />
            </YumiListSurface>
          </YumiSection>
        </>
      )}
    </div>
  )
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function RiskTag({ level }: { level: V2RiskLevel }) {
  const labels: Record<V2RiskLevel, string> = {
    normal: '正常',
    warning: '预警',
    critical: '严重',
    unplanned: '未计划'
  }
  const tones: Record<V2RiskLevel, 'neutral' | 'warning' | 'danger' | 'success'> = {
    normal: 'success',
    warning: 'warning',
    critical: 'danger',
    unplanned: 'neutral'
  }
  return <YumiStatusTag tone={tones[level]}>{labels[level]}</YumiStatusTag>
}
