import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Flex, Heading, Table, Text, TextField } from '@radix-ui/themes'
import { useReports } from '../../composables/use-reports'
import { formatCents, getErrorMessage, today } from '../../composables/v2-utils'

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return <Table.Row><Table.Cell colSpan={colSpan}><div className="empty"><Text color="gray">{message}</Text></div></Table.Cell></Table.Row>
}

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

  return <section className="v2-page reports-workspace">
    <div className="page-heading"><div><Text size="2" color="gray">V2 已确认经营事实</Text><Heading size="7">经营报表</Heading><Text as="p" color="gray">订单核算不分摊工资；工资仅以负责人确认的实际发放为准；月度经营按实际收付款日期统计。</Text></div><Badge color="green">只读汇总</Badge></div>
    {loadError && <div className="panel"><Text color="red">{loadError}</Text></div>}
    {error && <div className="panel"><Text color="red">{error}</Text></div>}
    {exportMessage && <div className="panel"><Text color={exportMessage.startsWith('已导出') ? 'green' : 'gray'}>{exportMessage}</Text></div>}

    <section className="panel report-month-panel"><Flex justify="between" align="end" gap="4"><div><Heading size="4">月度经营</Heading><Text size="2" color="gray">报销付款保留现金事实，但不会重复作为经营支出。</Text></div><div className="inline-fields"><label>统计月份<TextField.Root type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><Button size="1" variant="soft" onClick={() => void reload()} disabled={loading || exporting}>刷新</Button><Button size="1" onClick={() => void exportReport()} disabled={loading || exporting}>{exporting ? '导出中…' : '导出当前报表'}</Button></div></Flex><div className="finance-summary-grid"><Metric label="实际收入" cents={monthlyOperation?.incomeCents ?? 0} tone="income" /><Metric label="经营支出" cents={monthlyOperation?.operatingExpenseCents ?? 0} tone="expense" /><Metric label="经营结果" cents={monthlyOperation?.operatingResultCents ?? 0} tone="result" /><Metric label="已确认工资" cents={monthlyOperation?.confirmedSettlementPaidCents ?? 0} tone="expense" /></div></section>

    <section className="panel report-panel"><div className="section-title"><div><Heading size="4">订单核算</Heading><Text size="2" color="gray">成本为商品下单快照成本与售后核算成本，不将未建立分摊规则的工资强行计入订单。</Text></div><Badge color="gray">{orderBusiness?.rows.length ?? 0} 个订单</Badge></div><Table.Root variant="surface"><Table.Header><Table.Row><Table.ColumnHeaderCell>订单</Table.ColumnHeaderCell><Table.ColumnHeaderCell>确认金额</Table.ColumnHeaderCell><Table.ColumnHeaderCell>净收款</Table.ColumnHeaderCell><Table.ColumnHeaderCell>待收</Table.ColumnHeaderCell><Table.ColumnHeaderCell>商品成本</Table.ColumnHeaderCell><Table.ColumnHeaderCell>售后成本</Table.ColumnHeaderCell><Table.ColumnHeaderCell>核算利润参考</Table.ColumnHeaderCell></Table.Row></Table.Header><Table.Body>{orderBusiness?.rows.length ? orderBusiness.rows.map((row) => <Table.Row key={row.orderId}><Table.Cell><strong>{row.orderCode}</strong><br /><Text size="1" color="gray">{row.customerName}</Text></Table.Cell><Table.Cell>{formatCents(row.currentAmountCents)}</Table.Cell><Table.Cell>{formatCents(row.netReceivedCents)}</Table.Cell><Table.Cell>{formatCents(row.outstandingCents)}</Table.Cell><Table.Cell>{formatCents(row.productCostCents)}</Table.Cell><Table.Cell>{formatCents(row.afterSalesCostCents)}</Table.Cell><Table.Cell><strong>{formatCents(row.knownMarginCents)}</strong></Table.Cell></Table.Row>) : <EmptyRow colSpan={7} message="暂无 V2 订单事实。" />}</Table.Body></Table.Root></section>

    <section className="panel report-panel"><div className="section-title"><div><Heading size="4">履约进度</Heading><Text size="2" color="gray">阶段数量来自期初在制品、质检合格、打包和发货等履约事件。</Text></div><Badge color="orange">已发 {fulfillmentProgress?.totalShippedQuantity ?? 0} 件</Badge></div><Table.Root variant="surface"><Table.Header><Table.Row><Table.ColumnHeaderCell>订单产品</Table.ColumnHeaderCell><Table.ColumnHeaderCell>确认数量</Table.ColumnHeaderCell><Table.ColumnHeaderCell>制作中</Table.ColumnHeaderCell><Table.ColumnHeaderCell>待捏毛装袋</Table.ColumnHeaderCell><Table.ColumnHeaderCell>待打包</Table.ColumnHeaderCell><Table.ColumnHeaderCell>待发货</Table.ColumnHeaderCell><Table.ColumnHeaderCell>已发货</Table.ColumnHeaderCell></Table.Row></Table.Header><Table.Body>{fulfillmentProgress?.rows.length ? fulfillmentProgress.rows.map((row) => <Table.Row key={row.orderItemId}><Table.Cell><strong>{row.orderCode}</strong><br /><Text size="1" color="gray">{row.productName}</Text></Table.Cell><Table.Cell>{row.confirmedQuantity}</Table.Cell><Table.Cell>{row.stages.making}</Table.Cell><Table.Cell>{row.stages.fluffingBagging}</Table.Cell><Table.Cell>{row.stages.packing}</Table.Cell><Table.Cell>{row.stages.readyToShip}</Table.Cell><Table.Cell>{row.stages.shipped}</Table.Cell></Table.Row>) : <EmptyRow colSpan={7} message="暂无 V2 履约事实。" />}</Table.Body></Table.Root></section>

    <section className="panel report-panel"><div className="section-title"><div><Heading size="4">已确认工资</Heading><Text size="2" color="gray">草稿结算、排班参考工资和考勤参考工资均不作为实际发放进入本报表。</Text></div><Badge color="purple">合计 {formatCents(confirmedSettlements?.totalFinalPaidCents ?? 0)}</Badge></div><Table.Root variant="surface"><Table.Header><Table.Row><Table.ColumnHeaderCell>兼职人员</Table.ColumnHeaderCell><Table.ColumnHeaderCell>结算周期</Table.ColumnHeaderCell><Table.ColumnHeaderCell>实际付款日</Table.ColumnHeaderCell><Table.ColumnHeaderCell>实发金额</Table.ColumnHeaderCell><Table.ColumnHeaderCell>负责人备注</Table.ColumnHeaderCell></Table.Row></Table.Header><Table.Body>{confirmedSettlements?.rows.length ? confirmedSettlements.rows.map((row) => <Table.Row key={row.id}><Table.Cell>{row.workerName}</Table.Cell><Table.Cell>{row.periodStartOn} 至 {row.periodEndOn}</Table.Cell><Table.Cell>{row.paidOn}</Table.Cell><Table.Cell><strong>{formatCents(row.finalPaidAmountCents)}</strong></Table.Cell><Table.Cell>{row.managerNote ?? '—'}</Table.Cell></Table.Row>) : <EmptyRow colSpan={5} message="当前没有已确认并实际发放的工资结算。" />}</Table.Body></Table.Root></section>
  </section>
}

function Metric({ label, cents, tone }: { label: string; cents: number; tone: string }) {
  return <div className={`finance-metric ${tone}`}><Text size="2" color="gray">{label}</Text><Heading size="5">{formatCents(cents)}</Heading></div>
}
