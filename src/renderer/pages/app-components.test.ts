import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const appSource = source('src/renderer/pages/app.tsx')
const mainSource = source('src/renderer/main.tsx')
const packageSource = source('package.json')
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
const reportsPageSource = source('src/renderer/pages/reports/index.tsx')
const settingsPageSource = source('src/renderer/pages/settings/index.tsx')
const numericTextFieldSource = source('src/renderer/pages/numeric-text-field.tsx')
const afterSalesPanelSource = source('src/renderer/components/after-sales/after-sales-panel.tsx')
const financeComposableSource = source('src/renderer/composables/use-finance.ts')
const workbenchPageSource = source('src/renderer/pages/workbench/index.tsx')
const workbenchComposableSource = source('src/renderer/composables/use-workbench.ts')

describe('V2 应用壳与页面边界', () => {
  it('应用壳仅负责导航与页面装配，不直接调用预加载能力', () => {
    expect(appSource).toContain("from './customers'")
    expect(appSource).toContain("from './products'")
    expect(appSource).toContain("from './orders'")
    expect(appSource).toContain("from './fulfillment'")
    expect(appSource).toContain("from './settlements'")
    expect(appSource).not.toContain('window.yumi')
    expect(appSource).not.toContain('ipcRenderer')
    expect(appSource).not.toContain('@radix-ui/themes')
    expect(appSource).toContain("from '../components/ui'")
  })

  it('页面通过 composable 获取数据，不直接连接 IPC', () => {
    for (const pageSource of [
      customerPageSource,
      productPageSource,
      orderPageSource,
      fulfillmentPageSource,
      workAssignmentsPageSource,
      workersPageSource,
      settlementsPageSource,
      settlementDetailSource
    ]) {
      expect(pageSource).not.toContain('window.yumi')
      expect(pageSource).not.toContain('ipcRenderer')
    }
    expect(customerComposableSource).toContain('window.yumiV2.customers')
    expect(productComposableSource).toContain('window.yumiV2.products')
    expect(orderComposableSource).toContain('window.yumiV2.orders')
    expect(fulfillmentComposableSource).toContain('window.yumiV2.fulfillment')
    expect(fulfillmentComposableSource).toContain('window.yumiV2.reports.getFulfillmentProgress')
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

  it('订单使用 YUMI 经营列表与自定义表单控件，而非 Radix Themes 或原生选择框', () => {
    expect(orderPageSource).not.toContain('@radix-ui/themes')
    expect(orderPageSource).not.toContain('<select')
    expect(orderPageSource).not.toContain('TextField.Root')
    expect(orderPageSource).toContain('YumiBusinessList')
    expect(orderPageSource).toContain('YumiSearchSelect')
    expect(orderPageSource).toContain('YumiDatePicker')
  })

  it('将创建、变更、资金和发货失败保留在页面草稿中', () => {
    expect(orderPageSource).toContain('setError')
    expect(orderPageSource).toContain('await createOrder')
    expect(orderPageSource).toContain('await changeContent')
    expect(orderPageSource).toContain('await recordFund')
    expect(orderPageSource).toContain('await correctFund')
    expect(orderPageSource).toContain('await createShipment')
  })

  it('将分批发货收纳为抽屉，按实际待发货数量校验并保留只读历史批次', () => {
    expect(orderPageSource).toContain(
      'const [shipmentSheetOpen, setShipmentSheetOpen] = useState(false)'
    )
    expect(orderPageSource).toContain('YumiSheet')
    expect(orderPageSource).toContain('登记分批发货')
    expect(orderPageSource).toContain('当前可发')
    expect(orderPageSource).toContain('同一批可选择多个商品')
    expect(orderPageSource).toContain('历史批次只读')
    expect(orderComposableSource).toContain('window.yumiV2.fulfillment.getOrderItem')
  })
})

describe('YUMI 履约界面', () => {
  it('履约待办使用经营列表，并用 YUMI 字段替换原生选择和日期控件', () => {
    expect(fulfillmentPageSource).not.toContain('@radix-ui/themes')
    expect(fulfillmentPageSource).not.toContain('<select')
    expect(fulfillmentPageSource).not.toContain('TextField.Root')
    expect(fulfillmentPageSource).toContain('YumiBusinessList')
    expect(fulfillmentPageSource).toContain('YumiSelect')
    expect(fulfillmentPageSource).toContain('YumiDatePicker')
    expect(workAssignmentsPageSource).not.toContain('@radix-ui/themes')
    expect(workAssignmentsPageSource).not.toContain('<select')
    expect(workAssignmentsPageSource).not.toContain('TextField.Root')
    expect(workAssignmentsPageSource).toContain('YumiBusinessList')
    expect(workAssignmentsPageSource).toContain('YumiDatePicker')
  })
})

describe('V2 履约工作区', () => {
  it('提供阶段余额、期初在制品、负责人调整和工作安排入口', () => {
    expect(fulfillmentPageSource).toContain('履约待办')
    expect(fulfillmentPageSource).toContain('进入处理')
    expect(fulfillmentComposableSource).toContain('buildFulfillmentQueue')
    expect(fulfillmentPageSource).toContain('期初在制品')
    expect(fulfillmentPageSource).toContain('负责人数量调整')
    expect(fulfillmentPageSource).toContain('待发货')
    expect(workAssignmentsPageSource).toContain('新增工作安排')
    expect(workAssignmentsPageSource).toContain('提交完成')
    expect(workAssignmentsPageSource).toContain('次日质检')
  })

  it('将履约首页组织为单一队列与互斥阶段筛选，待发货事项直接进入订单的分批发货处理', () => {
    expect(fulfillmentPageSource).toContain(
      "type FulfillmentWorkspaceMode = 'queue' | 'processing'"
    )
    expect(fulfillmentPageSource).toContain("useState<FulfillmentQueueStage>('all')")
    expect(fulfillmentPageSource).toContain('filterFulfillmentQueue')
    expect(fulfillmentPageSource).toContain('阶段筛选')
    expect(fulfillmentPageSource).toContain('进入发货处理')
    expect(fulfillmentPageSource).toContain("orderView: 'fulfillment'")
    expect(fulfillmentPageSource).toContain('focusedTaskId={navigationTarget?.processTaskId}')
    expect(workAssignmentsPageSource).toContain('focusedTaskId?: string')
    expect(workAssignmentsPageSource).toContain('visibleAssignments')
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
    expect(financePageSource).toContain('批量报销')
    expect(settingsPageSource).toContain('私人垫付人')
    expect(afterSalesPanelSource).toContain('系统不会自动定责、收费或创建返工任务')
  })
})

describe('V2 月度财务首页', () => {
  it('将月度经营结果、现金流水和待报销作为互斥工作视图，而不是长期堆叠的三个区块', () => {
    expect(financePageSource).toContain(
      "type FinanceWorkspaceView = 'overview' | 'cashflow' | 'reimbursements'"
    )
    expect(financePageSource).toContain("useState<FinanceWorkspaceView>('overview')")
    expect(financePageSource).toContain("workspaceView === 'overview'")
    expect(financePageSource).toContain("workspaceView === 'cashflow'")
    expect(financePageSource).toContain("workspaceView === 'reimbursements'")
    expect(financePageSource).toContain('批量报销')
    expect(financePageSource).toContain('已选择')
    expect(financeComposableSource).toContain('reimburseBatch')
  })

  it('按实际收付款月展示经营结果、截至日待报销与当月流水', () => {
    expect(financePageSource).toContain('本月经营结果')
    expect(financePageSource).toContain('实际收入')
    expect(financePageSource).toContain('经营支出')
    expect(financePageSource).toContain('经营结果')
    expect(financePageSource).toContain('待报销私人垫付')
    expect(financePageSource).toContain('当月现金流水')
    expect(financeComposableSource).toContain('getMonthlySummary')
    expect(financeComposableSource).toContain('loadMonthlyOverview')
  })
})

describe('V2 负责人工作台', () => {
  it('默认进入工作台，并以互斥视图展示唯一主任务列表', () => {
    expect(appSource).toContain("type View = 'workbench'")
    expect(appSource).toContain("useState<NavigationState>({ view: 'workbench', target: null })")
    expect(appSource).toContain('returnToWorkbench')
    expect(appSource).toContain('onViewChange={setWorkbenchView}')
    expect(appSource).toContain("id: 'workbench'")
    expect(appSource).toContain('<WorkbenchPage')
    expect(workbenchPageSource).toContain("type WorkbenchView = 'decision' | 'advance'")
    expect(workbenchPageSource).toContain("initialView = 'decision'")
    expect(workbenchPageSource).toContain("activeView === 'decision'")
    expect(workbenchPageSource).toContain('snapshot?.advanceItems')
    expect(workbenchPageSource).toContain('onNavigate(item.navigationTarget)')
    expect(workbenchComposableSource).toContain('window.yumiV2.workbench')
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

describe('运营界面操作流', () => {
  it('应用壳按运营、资金分析与基础资料分组，并隐藏内部版本文案', () => {
    expect(appSource).toContain('const navigationGroups')
    expect(appSource).toContain('业务运营')
    expect(appSource).toContain('资金与分析')
    expect(appSource).toContain('基础资料')
    expect(appSource).not.toContain('STUDIO V2')
    expect(appSource).not.toContain('订单与资金先行')
    expect(appSource).not.toContain('本地数据已隔离')
  })

  it('订单把列表、新建和详情作为互斥工作状态，并在基础资料缺失时引导建档', () => {
    expect(orderPageSource).toContain("type OrderWorkspaceMode = 'list' | 'create' | 'detail'")
    expect(orderPageSource).toContain("useState<OrderWorkspaceMode>('list')")
    expect(orderPageSource).toContain("workspaceMode === 'create'")
    expect(orderPageSource).toContain("workspaceMode === 'detail'")
    expect(orderPageSource).toContain('先建立客户')
    expect(orderPageSource).toContain('建立商品')
    expect(orderPageSource).toContain('onNavigateToBaseData')
  })

  it('订单详情用互斥工作视图承载概览、履约、资金和售后，不再在同一屏堆叠全部表单', () => {
    expect(orderPageSource).toContain(
      "type OrderDetailView = 'overview' | 'fulfillment' | 'funds' | 'after_sales'"
    )
    expect(orderPageSource).toContain("useState<OrderDetailView>('overview')")
    expect(orderPageSource).toContain('navigationTarget.orderView')
    expect(orderPageSource).toContain("activeView === 'overview'")
    expect(orderPageSource).toContain("activeView === 'fulfillment'")
    expect(orderPageSource).toContain("activeView === 'funds'")
    expect(orderPageSource).toContain("activeView === 'after_sales'")
    expect(orderPageSource).toContain('分批发货')
  })

  it('工作台任务会带着上下文进入对应工作区，而不是只切换导航菜单', () => {
    expect(appSource).toContain(
      "navigationTarget={navigation.target?.view === 'orders' ? navigation.target : null}"
    )
    expect(appSource).toContain(
      "navigationTarget={navigation.target?.view === 'fulfillment' ? navigation.target : null}"
    )
    expect(appSource).toContain(
      "navigationTarget={navigation.target?.view === 'settlements' ? navigation.target : null}"
    )
    expect(appSource).toContain(
      "navigationTarget={navigation.target?.view === 'finance' ? navigation.target : null}"
    )
    expect(orderPageSource).toContain('navigationTarget?: Extract<V2NavigationTarget')
    expect(orderPageSource).toContain("setWorkspaceMode('detail')")
    expect(fulfillmentPageSource).toContain('navigationTarget?: Extract<V2NavigationTarget')
    expect(fulfillmentPageSource).toContain('navigationTarget?.orderId')
    expect(settlementsPageSource).toContain("focus === 'refund'")
    expect(settlementsPageSource).toContain('待退款')
    expect(settlementsPageSource).toContain('YumiSheet')
    expect(settlementsComposableSource).toContain('listRefunds')
    expect(settlementsComposableSource).toContain('resolveRefund')
    expect(financePageSource).toContain('navigationTarget?: FinanceNavigationTarget')
    expect(financePageSource).toContain('navigationTarget.financeView')
  })
})

describe('运营界面按需录入', () => {
  it('基础资料、工资和财务只在负责人主动操作时打开录入工作区', () => {
    expect(customerPageSource).toContain('useState(false)')
    expect(customerPageSource).toContain('open={editorOpen}')
    expect(productPageSource).toContain('useState(false)')
    expect(productPageSource).toContain('open={editorOpen}')
    expect(settlementsPageSource).toContain("useState<SettlementsWorkspace>('settlements')")
    expect(settlementsPageSource).toContain('open={showDraftForm}')
    expect(settlementsPageSource).toContain('title="新建结算"')
    expect(settlementsPageSource).not.toContain('YumiSection title="新建结算草稿"')
    expect(financePageSource).toContain('useState(false)')
    expect(financePageSource).toContain('open={showEntryForm}')
    expect(financePageSource).toContain('登记收支')
  })
})

describe('YUMI 工资结算界面', () => {
  it('结算列表与确认明细使用经营列表和自定义日期选择，不再依赖 Radix Themes 或原生表单控件', () => {
    for (const pageSource of [settlementsPageSource, settlementDetailSource]) {
      expect(pageSource).not.toContain('@radix-ui/themes')
      expect(pageSource).not.toContain('<select')
      expect(pageSource).not.toContain('TextField.Root')
      expect(pageSource).not.toContain('type="date"')
    }
    expect(settlementsPageSource).toContain('YumiBusinessList')
    expect(settlementsPageSource).toContain('YumiSearchSelect')
    expect(settlementsPageSource).toContain('YumiDateRangePicker')
    expect(settlementDetailSource).toContain('YumiDatePicker')
    expect(settlementDetailSource).toContain('YumiStatusTag')
  })
})

describe('YUMI 财务与报表界面', () => {
  it('财务流水使用经营列表和抽屉录入，报表使用自定义数据表格与月份选择', () => {
    for (const pageSource of [financePageSource, reportsPageSource]) {
      expect(pageSource).not.toContain('@radix-ui/themes')
      expect(pageSource).not.toContain('<select')
      expect(pageSource).not.toContain('TextField.Root')
      expect(pageSource).not.toContain('type="date"')
      expect(pageSource).not.toContain('type="month"')
    }
    expect(financePageSource).toContain('YumiBusinessList')
    expect(financePageSource).toContain('YumiSheet')
    expect(financePageSource).toContain('YumiMonthPicker')
    expect(reportsPageSource).toContain('YumiDataTable')
    expect(reportsPageSource).toContain('YumiMonthPicker')
  })
})

describe('YUMI 售后处理界面', () => {
  it('售后记录使用轻量经营列表与自定义表单控件，且不把责任和收费交给系统自动判断', () => {
    expect(afterSalesPanelSource).not.toContain('@radix-ui/themes')
    expect(afterSalesPanelSource).not.toContain('<select')
    expect(afterSalesPanelSource).not.toContain('TextField.Root')
    expect(afterSalesPanelSource).not.toContain('type="date"')
    expect(afterSalesPanelSource).toContain('YumiBusinessList')
    expect(afterSalesPanelSource).toContain('YumiDatePicker')
    expect(afterSalesPanelSource).toContain('YumiStatusTag')
    expect(afterSalesPanelSource).toContain('系统不会自动定责、收费或创建返工任务')
  })
})

describe('YUMI 客户与商品资料界面', () => {
  it('客户和商品使用经营资料列表与按需抽屉，不依赖 Radix Themes 或旧面板样式', () => {
    for (const pageSource of [customerPageSource, productPageSource]) {
      expect(pageSource).not.toContain('@radix-ui/themes')
      expect(pageSource).not.toContain('TextField.Root')
      expect(pageSource).not.toContain('className="panel"')
      expect(pageSource).toContain('YumiPageHeader')
      expect(pageSource).toContain('YumiBusinessList')
      expect(pageSource).toContain('YumiSheet')
      expect(pageSource).toContain('YumiTextField')
    }
    expect(customerPageSource).toContain('订单会保留当时的客户快照')
    expect(productPageSource).toContain('标准制作分钟')
    expect(productPageSource).toContain('制作胶水')
    expect(productPageSource).toContain('制作提成')
  })
})

describe('YUMI 人员与财务设置界面', () => {
  it('人员、时薪历史、动态类目和垫付人统一使用 YUMI 选择器与日期组件', () => {
    for (const pageSource of [workersPageSource, settingsPageSource, numericTextFieldSource]) {
      expect(pageSource).not.toContain('@radix-ui/themes')
      expect(pageSource).not.toContain('TextField.Root')
    }
    expect(workersPageSource).not.toContain('<select')
    expect(workersPageSource).not.toContain('type="date"')
    expect(workersPageSource).toContain('YumiDatePicker')
    expect(workersPageSource).toContain('YumiSearchSelect')
    expect(workersPageSource).toContain('YumiBusinessList')
    expect(settingsPageSource).toContain('YumiBusinessList')
    expect(settingsPageSource).toContain('YumiDialog')
    expect(numericTextFieldSource).toContain('YumiTextField')
  })
})

describe('YUMI 全局视觉入口', () => {
  it('渲染入口仅加载 YUMI 样式令牌和自有组件，不再包装或依赖 Radix Themes', () => {
    expect(mainSource).toContain("'./styles/tokens.css'")
    expect(mainSource).toContain("'./styles/base.css'")
    expect(mainSource).toContain("'./styles/components.css'")
    expect(mainSource).toContain("'./styles/pages.css'")
    expect(mainSource).not.toContain('@radix-ui/themes')
    expect(mainSource).not.toContain("'./styles/app.css'")
    expect(mainSource).not.toContain('<Theme')
    expect(packageSource).not.toContain('"@radix-ui/themes"')
  })
})
