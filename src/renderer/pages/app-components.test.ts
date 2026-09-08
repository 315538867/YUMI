import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const appSource = source('src/renderer/pages/app.tsx')
const customerPageSource = source('src/renderer/pages/customers/index.tsx')
const productPageSource = source('src/renderer/pages/products/index.tsx')
const orderPageSource = source('src/renderer/pages/orders/index.tsx')
const fulfillmentPageSource = source('src/renderer/pages/fulfillment/index.tsx')
const workAssignmentsPageSource = source('src/renderer/pages/work-assignments/index.tsx')
const workersPageSource = source('src/renderer/pages/workers/index.tsx')
const settlementsPageSource = source('src/renderer/pages/settlements/index.tsx')
const settlementDetailSource = source('src/renderer/components/settlement/settlement-detail.tsx')
const customerComposableSource = source('src/renderer/composables/use-customers.ts')
const productComposableSource = source('src/renderer/composables/use-products.ts')
const orderComposableSource = source('src/renderer/composables/use-orders.ts')
const fulfillmentComposableSource = source('src/renderer/composables/use-fulfillment.ts')
const workAssignmentsComposableSource = source('src/renderer/composables/use-work-assignments.ts')
const settlementsComposableSource = source('src/renderer/composables/use-settlements.ts')
const financePageSource = source('src/renderer/pages/finance/index.tsx')
const settingsPageSource = source('src/renderer/pages/settings/index.tsx')
const afterSalesPanelSource = source('src/renderer/components/after-sales/after-sales-panel.tsx')
const financeComposableSource = source('src/renderer/composables/use-finance.ts')

describe('V2 应用壳与页面边界', () => {
  it('应用壳仅负责导航与页面装配，不直接调用预加载能力', () => {
    expect(appSource).toContain("from './customers'")
    expect(appSource).toContain("from './products'")
    expect(appSource).toContain("from './orders'")
    expect(appSource).toContain("from './fulfillment'")
    expect(appSource).toContain("from './settlements'")
    expect(appSource).not.toContain('window.yumi')
    expect(appSource).not.toContain('ipcRenderer')
  })

  it('页面通过 composable 获取数据，不直接连接 IPC', () => {
    for (const pageSource of [customerPageSource, productPageSource, orderPageSource, fulfillmentPageSource, workAssignmentsPageSource, workersPageSource, settlementsPageSource, settlementDetailSource]) {
      expect(pageSource).not.toContain('window.yumi')
      expect(pageSource).not.toContain('ipcRenderer')
    }
    expect(customerComposableSource).toContain('window.yumiV2.customers')
    expect(productComposableSource).toContain('window.yumiV2.products')
    expect(orderComposableSource).toContain('window.yumiV2.orders')
    expect(fulfillmentComposableSource).toContain('window.yumiV2.fulfillment')
    expect(workAssignmentsComposableSource).toContain('window.yumiV2.fulfillment')
    expect(settlementsComposableSource).toContain('window.yumiV2.workers')
    expect(settlementsComposableSource).toContain('window.yumiV2.settlements')
  })
})

describe('V2 订单工作区', () => {
  it('覆盖多商品订单、内容变更、资金冲正和分批发货操作', () => {
    expect(orderPageSource).toContain('初始确认金额')
    expect(orderPageSource).toContain('订单内容变更')
    expect(orderPageSource).toContain('金额调整')
    expect(orderPageSource).toContain('收款 / 退款')
    expect(orderPageSource).toContain('冲正并更正')
    expect(orderPageSource).toContain('新增发货')
    expect(orderPageSource).toContain('累计已发')
    expect(orderPageSource).toContain('待发')
  })

  it('将创建、变更、资金和发货失败保留在页面草稿中', () => {
    expect(orderPageSource).toContain('setError')
    expect(orderPageSource).toContain('await createOrder')
    expect(orderPageSource).toContain('await changeContent')
    expect(orderPageSource).toContain('await recordFund')
    expect(orderPageSource).toContain('await correctFund')
    expect(orderPageSource).toContain('await createShipment')
  })
})


describe('V2 履约工作区', () => {
  it('提供阶段余额、期初在制品、负责人调整和工作安排入口', () => {
    expect(fulfillmentPageSource).toContain('订单产品履约')
    expect(fulfillmentPageSource).toContain('期初在制品')
    expect(fulfillmentPageSource).toContain('负责人数量调整')
    expect(fulfillmentPageSource).toContain('待发货')
    expect(workAssignmentsPageSource).toContain('新增工作安排')
    expect(workAssignmentsPageSource).toContain('提交完成')
    expect(workAssignmentsPageSource).toContain('次日质检')
  })

  it('工作安排页面明确暴露正常生产、返工与售后补发来源', () => {
    expect(workAssignmentsPageSource).toContain('正常生产')
    expect(workAssignmentsPageSource).toContain('返工')
    expect(workAssignmentsPageSource).toContain('售后补发')
    expect(fulfillmentPageSource).toContain('待发货')
  })

  it('通过 composable 完成履约写入并在失败时保留页面草稿', () => {
    expect(fulfillmentPageSource).toContain('setError')
    expect(fulfillmentPageSource).toContain('await recordOpeningWip')
    expect(fulfillmentPageSource).toContain('await adjustStageQuantity')
    expect(workAssignmentsPageSource).toContain('setError')
    expect(workAssignmentsPageSource).toContain('await createWorkAssignment')
    expect(workAssignmentsPageSource).toContain('await submitProcessResult')
    expect(workAssignmentsPageSource).toContain('await confirmQualityInspection')
  })
})


describe('V2 兼职工资结算工作区', () => {
  it('提供兼职人员、任意日期范围结算、双口径参考和确认入口', () => {
    expect(workersPageSource).toContain('新增兼职人员')
    expect(workersPageSource).toContain('时薪历史')
    expect(settlementsPageSource).toContain('新建结算草稿')
    expect(settlementsPageSource).toContain('结算日期范围')
    expect(settlementDetailSource).toContain('排班口径')
    expect(settlementDetailSource).toContain('考勤口径')
    expect(settlementDetailSource).toContain('任务来源')
    expect(settlementDetailSource).toContain('扣款来源')
    expect(settlementDetailSource).toContain('确认并记账')
  })

  it('页面通过 composable 和纯展示组件提交草稿、更新和确认，失败保留页面草稿', () => {
    expect(settlementsPageSource).toContain('setError')
    expect(settlementsPageSource).toContain('await createDraft')
    expect(workersPageSource).toContain('setError')
    expect(workersPageSource).toContain('await createWorker')
    expect(settlementDetailSource).toContain('setError')
    expect(settlementDetailSource).toContain('await props.updateDraft')
    expect(settlementDetailSource).toContain('await props.confirmSettlement')
  })
})

describe('V2 财务与售后工作区', () => {
  it('应用壳装配财务和设置页面，并在订单详情保留售后入口', () => {
    expect(appSource).toContain("from './finance'")
    expect(appSource).toContain("from './settings'")
    expect(appSource).toContain("id: 'finance'")
    expect(appSource).toContain("id: 'settings'")
    expect(orderPageSource).toContain('AfterSalesPanel')
    for (const pageSource of [financePageSource, settingsPageSource, afterSalesPanelSource]) {
      expect(pageSource).not.toContain('window.yumi')
      expect(pageSource).not.toContain('ipcRenderer')
    }
    expect(financeComposableSource).toContain('window.yumiV2.finance')
    expect(financeComposableSource).toContain('window.yumiV2.afterSales')
    expect(financePageSource).toContain('登记日常收支')
    expect(financePageSource).toContain('完整报销')
    expect(settingsPageSource).toContain('私人垫付人')
    expect(afterSalesPanelSource).toContain('系统不会自动定责、收费或创建返工任务')
  })
})

describe('V2 月度财务首页', () => {
  it('按实际收付款月展示经营结果、截至日待报销与当月流水', () => {
    expect(financePageSource).toContain('本月经营概览')
    expect(financePageSource).toContain('实际收入')
    expect(financePageSource).toContain('经营支出')
    expect(financePageSource).toContain('经营结果')
    expect(financePageSource).toContain('截至查询日待报销')
    expect(financePageSource).toContain('当月现金流水')
    expect(financeComposableSource).toContain('getMonthlySummary')
    expect(financeComposableSource).toContain('loadMonthlyOverview')
  })
})

describe('V2 报表工作区', () => {
  it('应用壳挂载独立的报表入口', () => {
    expect(appSource).toContain("from './reports'")
    expect(appSource).toContain("id: 'reports'")
  })
})

  it('报表页面通过独立 composable 展示 V2 经营事实，而不直接调用 IPC', () => {
    const reportsPageSource = source('src/renderer/pages/reports/index.tsx')
    const reportsComposableSource = source('src/renderer/composables/use-reports.ts')
    expect(reportsPageSource).toContain('订单核算')
    expect(reportsPageSource).toContain('履约进度')
    expect(reportsPageSource).toContain('已确认工资')
    expect(reportsPageSource).toContain('月度经营')
    expect(reportsPageSource).toContain('导出当前报表')
    expect(reportsPageSource).not.toContain('window.yumi')
    expect(reportsComposableSource).toContain('window.yumiV2.reports')
    expect(reportsComposableSource).toContain('exportCurrentReport')
  })
