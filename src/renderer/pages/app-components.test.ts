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
const fulfillmentDispatchViewsSource = source(
  'src/renderer/components/fulfillment/dispatch-views.tsx'
)
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
const fieldSource = source('src/renderer/components/ui/field/yumi-field.tsx')
const financeComposableSource = source('src/renderer/composables/use-finance.ts')
const backupsComposableSource = source('src/renderer/composables/use-backups.ts')
const workbenchPageSource = source('src/renderer/pages/workbench/index.tsx')
const workbenchComposableSource = source('src/renderer/composables/use-workbench.ts')
const designTokensSource = source('src/renderer/styles/tokens.css')
const componentStylesSource = source('src/renderer/styles/components.css')
const pageStylesSource = source('src/renderer/styles/pages.css')

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

describe('YUMI 列表业务容器规范', () => {
  it('列表页面与嵌入式业务列表统一使用 YumiListSurface，避免页面直接拼装容器基线', () => {
    const listSurfaceSources = [
      customerPageSource,
      productPageSource,
      orderPageSource,
      fulfillmentDispatchViewsSource,
      workersPageSource,
      settlementsPageSource,
      financePageSource,
      reportsPageSource,
      settingsPageSource,
      workAssignmentsPageSource,
      workbenchPageSource,
      afterSalesPanelSource
    ]

    for (const pageSource of listSurfaceSources) {
      expect(pageSource).toContain('YumiListSurface')
      expect(pageSource).not.toContain('className="yumi-list-surface')
    }
  })
})

describe('YUMI 表单反馈组件规范', () => {
  it('错误与辅助说明统一使用 YumiFormMessage，页面不再直接维护反馈样式', () => {
    const feedbackSources = [
      afterSalesPanelSource,
      customerPageSource,
      productPageSource,
      fulfillmentDispatchViewsSource,
      settlementDetailSource,
      financePageSource,
      orderPageSource,
      settingsPageSource,
      workAssignmentsPageSource
    ]

    for (const pageSource of feedbackSources) {
      expect(pageSource).toContain('YumiFormMessage')
      expect(pageSource).not.toContain('yumi-form-error')
      expect(pageSource).not.toContain('yumi-form-hint')
      expect(pageSource).not.toContain('yumi-field-hint')
    }

    expect(componentStylesSource).toContain('.yumi-form-message')
    expect(componentStylesSource).toContain('.yumi-form-message--error')
    expect(pageStylesSource).not.toContain('.yumi-form-error')
    expect(pageStylesSource).not.toContain('.yumi-form-hint')

    expect(fieldSource).toContain('YumiFormMessage')
    expect(fieldSource).not.toContain('yumi-field__error')
    expect(fieldSource).not.toContain('yumi-field__hint')
    expect(componentStylesSource).toContain('.yumi-field__label-hint')
  })
})

describe('YUMI 全局经营页面骨架', () => {
  it('所有一级业务页都复用结构化共享页头，避免在页面中拼接独立动作区', () => {
    const businessPageSources = [
      customerPageSource,
      productPageSource,
      orderPageSource,
      fulfillmentPageSource,
      workersPageSource,
      settlementsPageSource,
      financePageSource,
      reportsPageSource,
      workbenchPageSource,
      settingsPageSource
    ]

    for (const pageSource of businessPageSources) {
      expect(pageSource).toContain("from '../../components/ui'")
      expect(pageSource).toContain('YumiPageHeader')
      expect(pageSource).not.toContain('YumiPageActions')
    }
  })

  it('工资结算与待退款记录区复用共享区块骨架，不在主标签下直接拼装独立容器', () => {
    expect(settlementsPageSource).toContain('YumiSection')
    expect(settlementsPageSource).toContain('title="工资结算记录"')
    expect(settlementsPageSource).toContain('title="待退款记录"')
  })

  it('含页面主操作的业务页只传递结构化配置，由共享页头生成唯一 primary 按钮', () => {
    const pagesWithPrimaryAction = [
      customerPageSource,
      productPageSource,
      orderPageSource,
      workersPageSource,
      settlementsPageSource,
      financePageSource,
      reportsPageSource
    ]

    for (const pageSource of pagesWithPrimaryAction) {
      expect(pageSource).toMatch(/primaryAction:\s*\{/)
      expect(pageSource).not.toMatch(/primaryAction:\s*(?:\(|<)/)
    }

    expect(settingsPageSource).toContain('const primaryAction: YumiPagePrimaryAction')
    expect(settingsPageSource).toContain('primaryAction')
  })

  it('页头可见次操作同样只传递结构化配置，由共享层固定为标准次级或返回样式', () => {
    const pagesWithSecondaryAction = [orderPageSource, fulfillmentPageSource, workbenchPageSource]

    for (const pageSource of pagesWithSecondaryAction) {
      expect(pageSource).toMatch(/secondaryAction:\s*\{/)
      expect(pageSource).not.toMatch(/secondaryAction:\s*(?:\(|<)/)
    }
  })
})

describe('YUMI 全局导航与摘要来源护栏', () => {
  it('页面层级导航只复用主标签与次级分段组件，不重新拼装旧同形 Tab 样式', () => {
    const primaryTabPageSources = [
      orderPageSource,
      fulfillmentPageSource,
      settlementsPageSource,
      financePageSource,
      workbenchPageSource,
      settingsPageSource
    ]

    for (const pageSource of primaryTabPageSources) {
      expect(pageSource).toContain('YumiPrimaryTabs')
      expect(pageSource).not.toContain('yumi-page-tabs')
      expect(pageSource).not.toContain('yumi-primary-tabs__item')
    }

    for (const pageSource of [fulfillmentPageSource, settingsPageSource]) {
      expect(pageSource).toContain('YumiSegmentedTabs')
      expect(pageSource).not.toContain('yumi-segmented-tabs__item')
    }
  })

  it('订单详情与排班处理以共享实体摘要承接状态和整行经营指标', () => {
    for (const pageSource of [orderPageSource, fulfillmentPageSource]) {
      expect(pageSource).toContain('YumiRecordSummary')
      expect(pageSource).not.toContain('yumi-order-summary')
    }

    expect(pageStylesSource).not.toContain('.yumi-order-summary')
    expect(componentStylesSource).toContain('.yumi-record-summary__header')
    expect(componentStylesSource).toContain('.yumi-record-summary__metrics')
  })

  it('订单详情资料分组复用共享三级区块与描述列表，不保留订单私有档案样式', () => {
    expect(orderPageSource).toContain('YumiDetailList')
    expect(orderPageSource).toContain('YumiFormSection')
    expect(orderPageSource).not.toContain('yumi-order-archive-grid')
    expect(orderPageSource).not.toContain('yumi-order-archive')
    expect(pageStylesSource).not.toContain('.yumi-order-archive-grid')
    expect(pageStylesSource).not.toContain('.yumi-order-archive')
  })

  it('工资结算详情复用共享指标带和具名来源表，不保留结算私有摘要/来源列表', () => {
    expect(settlementDetailSource).toContain('YumiRecordSummary')
    expect(settlementDetailSource).toContain('YumiMetricStrip')
    expect(settlementDetailSource).toContain('YumiDataTable')
    expect(settlementDetailSource).not.toContain('yumi-settlement-reference-grid')
    expect(settlementDetailSource).not.toContain('yumi-source-list')
    expect(settlementDetailSource).not.toContain('yumi-settlement-detail__header')
    expect(pageStylesSource).not.toContain('.yumi-settlement-reference-grid')
    expect(pageStylesSource).not.toContain('.yumi-source-list')
    expect(pageStylesSource).not.toContain('.yumi-settlement-detail__header')
  })

  it('工资结算详情复用共享摘要与来源记录，不保留结算私有结构', () => {
    expect(settlementDetailSource).toContain('YumiMetricStrip')
    expect(settlementDetailSource).toContain('YumiDataTable')
    expect(settlementDetailSource).not.toContain('yumi-settlement-reference-grid')
    expect(settlementDetailSource).not.toContain('yumi-source-list')
    expect(pageStylesSource).not.toContain('.yumi-settlement-reference-grid')
    expect(pageStylesSource).not.toContain('.yumi-source-list')
  })

  it('客户与商品详情以共享描述列表承接只读资料，不保留私有详情栅格和标签值组件', () => {
    for (const pageSource of [customerPageSource, productPageSource]) {
      expect(pageSource).toContain('YumiDetailList')
      expect(pageSource).not.toContain('yumi-detail-grid')
    }

    expect(customerPageSource).not.toContain('function DetailItem')
    expect(productPageSource).not.toContain('function ProductDetailItem')
    expect(pageStylesSource).not.toContain('.yumi-detail-grid')
    expect(componentStylesSource).toContain('.yumi-detail-list__list')
    expect(componentStylesSource).toContain('.yumi-detail-list__item dt')
  })

  it('客户与商品的详情和编辑分组复用共享三级资料区块，而不保留产品领域私有类名', () => {
    for (const pageSource of [customerPageSource, productPageSource]) {
      expect(pageSource).toContain('YumiFormSection')
      expect(pageSource).not.toContain('yumi-product-editor-section')
    }

    expect(pageStylesSource).not.toContain('.yumi-product-editor-section')
    expect(componentStylesSource).toContain('.yumi-form-section__heading')
    expect(componentStylesSource).toContain('.yumi-form-section + .yumi-form-section')
  })

  it('订单和排班操作表单复用共享资料分组，不保留页面私有表单标题样式', () => {
    for (const pageSource of [orderPageSource, fulfillmentPageSource]) {
      expect(pageSource).toContain('YumiFormSection')
      expect(pageSource).not.toContain('yumi-form-panel__title')
    }

    expect(pageStylesSource).not.toContain('.yumi-form-panel__title')
  })

  it('设置工作室参数查看复用共享资料分组与描述列表，不保留私有摘要布局', () => {
    expect(settingsPageSource).toContain('YumiFormSection')
    expect(settingsPageSource).toContain('YumiDetailList')
    for (const selector of [
      'yumi-settings-panel__intro',
      'yumi-settings-panel__value',
      'yumi-settings-panel__actions'
    ]) {
      expect(settingsPageSource).not.toContain(selector)
      expect(pageStylesSource).not.toContain(`.${selector}`)
    }
  })

  it('经营报表区块摘要使用共享状态槽位，不保留页面私有内联状态布局', () => {
    expect(reportsPageSource).toContain('status={')
    expect(reportsPageSource).not.toContain('yumi-section-inline-status')
    expect(pageStylesSource).not.toContain('.yumi-section-inline-status')
  })

  it('经营报表月度经营筛选复用共享工具条，不保留页面私有工具栏', () => {
    expect(reportsPageSource).toContain('ariaLabel="月度经营筛选工具"')
    expect(reportsPageSource).toContain('YumiListToolbar')
    expect(reportsPageSource).not.toContain('yumi-section-toolbar')
  })

  it('财务经营结果筛选复用共享工具条，不保留页面私有筛选布局', () => {
    expect(financePageSource).toContain('ariaLabel="经营结果筛选工具"')
    expect(financePageSource).toContain('YumiListToolbar')
    expect(financePageSource).not.toContain('yumi-finance-filters')
    expect(financePageSource).not.toContain('yumi-finance-selection-summary')
    expect(pageStylesSource).not.toContain('.yumi-finance-filters')
    expect(pageStylesSource).not.toContain('.yumi-finance-selection-summary')
  })

  it('已迁移业务不保留废弃页面布局样式', () => {
    for (const selector of [
      '.yumi-overview-grid',
      '.yumi-worker-history',
      '.yumi-worker-editor-grid',
      '.yumi-settings-category-grid',
      '.yumi-order-simple-lines',
      '.yumi-feedback',
      '.yumi-reports-workspace',
      '.yumi-report-controls',
      '.yumi-finance-reimburse-controls',
      '.yumi-after-sales-link-fields',
      '.yumi-settings-section-actions'
    ]) {
      expect(pageStylesSource).not.toContain(selector)
    }
  })

  it('经营摘要只经共享连续指标带输出，业务页不保留私有固定列卡片网格', () => {
    const metricPageSources = [
      customerPageSource,
      orderPageSource,
      fulfillmentPageSource,
      financePageSource,
      reportsPageSource
    ]

    for (const pageSource of metricPageSources) {
      expect(pageSource).toContain('YumiMetricStrip')
      expect(pageSource).not.toContain('yumi-order-stat-grid')
      expect(pageSource).not.toContain('yumi-finance-summary-grid')
      expect(pageSource).not.toContain('yumi-finance-metric')
    }
  })
})

describe('YUMI 全局反馈状态', () => {
  it('一级业务页统一通过共享空状态组件承载加载与无数据反馈，避免遗留裸文本占位', () => {
    const businessPageSources = [
      customerPageSource,
      productPageSource,
      orderPageSource,
      fulfillmentPageSource,
      workersPageSource,
      settlementsPageSource,
      financePageSource,
      reportsPageSource,
      workbenchPageSource,
      settingsPageSource
    ]

    for (const pageSource of businessPageSources) {
      expect(pageSource).not.toContain('className="yumi-empty"')
    }
  })
})

describe('YUMI 全局表单控件边界', () => {
  it('业务页面不得直接拼装原生复选框，布尔输入必须复用共享控件', () => {
    expect(orderPageSource).toContain('YumiCheckbox')
    expect(orderPageSource).not.toContain('type="checkbox"')
  })
})

describe('YUMI 业务页原生控件边界', () => {
  it('一级页面和嵌入记录区只组合共享控件，不直接拼装原生交互元素', () => {
    const businessViewSources = [
      customerPageSource,
      productPageSource,
      orderPageSource,
      fulfillmentPageSource,
      workAssignmentsPageSource,
      workersPageSource,
      settlementsPageSource,
      financePageSource,
      reportsPageSource,
      workbenchPageSource,
      settingsPageSource,
      afterSalesPanelSource
    ]

    for (const pageSource of businessViewSources) {
      expect(pageSource).not.toMatch(/<(button|select|input|textarea)\b/)
      expect(pageSource).not.toContain('type="checkbox"')
      expect(pageSource).not.toContain('type="date"')
      expect(pageSource).not.toContain('type="month"')
    }
  })
})

describe('YUMI 独立色彩语义', () => {
  it('将品牌、状态、表格与交互色收敛为独立 token，业务样式不再写入具体色值', () => {
    expect(designTokensSource).toContain('--yumi-brand: #355fd6')
    expect(designTokensSource).toContain('--yumi-surface-muted: #f7f9fc')
    expect(designTokensSource).toContain('--yumi-on-brand: #ffffff')
    expect(designTokensSource).toContain('--yumi-danger-hover: #a83249')
    expect(designTokensSource).toContain('--yumi-overlay: rgba(24, 32, 51, 0.34)')
    expect(componentStylesSource).not.toMatch(/#[0-9a-f]{3,8}|rgba\(/i)
    expect(pageStylesSource).not.toMatch(/#[0-9a-f]{3,8}|rgba\(/i)
  })
})

describe('V2 订单工作区', () => {
  it('覆盖多商品订单、内容变更、资金冲正和分批发货操作', () => {
    expect(orderPageSource).toContain('订单优惠')
    expect(orderPageSource).toContain('订单内容变更')
    expect(orderPageSource).toContain('金额调整')
    expect(orderPageSource).toContain('登记收款或退款')
    expect(orderPageSource).toContain('订单资金流水列表')
    expect(orderPageSource).toContain('发货批次列表')
    expect(orderPageSource).toContain('新增发货')
    expect(orderPageSource).toContain('累计已发')
    expect(orderPageSource).toContain('待发')
  })

  it('订单使用 YUMI 具名数据表与自定义表单控件，而非 Radix Themes 或原生选择框', () => {
    expect(orderPageSource).not.toContain('@radix-ui/themes')
    expect(orderPageSource).not.toContain('<select')
    expect(orderPageSource).not.toContain('TextField.Root')
    expect(orderPageSource).toContain('YumiListToolbar')
    expect(orderPageSource).toContain('YumiDataTable')
    expect(orderPageSource).toContain('订单资金列表工具')
    expect(orderPageSource).toContain('发货批次列表工具')
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

describe('YUMI 排班界面', () => {
  it('排班队列使用共享工具条和数据表，并用 YUMI 字段替换原生选择和日期控件', () => {
    expect(fulfillmentPageSource).not.toContain('@radix-ui/themes')
    expect(fulfillmentPageSource).not.toContain('<select')
    expect(fulfillmentPageSource).not.toContain('TextField.Root')
    expect(fulfillmentPageSource).toContain('OrderDispatchBoard')
    expect(fulfillmentPageSource).toContain('WorkerWeekSchedule')
    expect(fulfillmentDispatchViewsSource).not.toContain('YumiBusinessList')
    expect(fulfillmentDispatchViewsSource).toContain('YumiListToolbar')
    expect(fulfillmentDispatchViewsSource).toContain('YumiDataTable')
    expect(fulfillmentDispatchViewsSource).toContain('YumiSection')
    expect(fulfillmentDispatchViewsSource).toContain('订单排班队列')
    expect(fulfillmentDispatchViewsSource).toContain('排班队列列表工具')
    expect(fulfillmentDispatchViewsSource).toContain('排班队列列表')
    expect(fulfillmentDispatchViewsSource).toContain('YumiSelect')
    expect(fulfillmentDispatchViewsSource).toContain('YumiDatePicker')
    expect(workAssignmentsPageSource).not.toContain('@radix-ui/themes')
    expect(workAssignmentsPageSource).not.toContain('<select')
    expect(workAssignmentsPageSource).not.toContain('TextField.Root')
    expect(workAssignmentsPageSource).toContain('YumiListToolbar')
    expect(workAssignmentsPageSource).toContain('YumiDataTable')
    expect(workAssignmentsPageSource).toContain('YumiDatePicker')
  })
})

describe('V2 履约工作区', () => {
  it('提供阶段余额、期初在制品、负责人调整和工作安排入口', () => {
    expect(fulfillmentPageSource).toContain('订单视角')
    expect(fulfillmentPageSource).toContain('人员周历')
    expect(fulfillmentPageSource).toContain('工作安排与质检')
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
    expect(fulfillmentPageSource).toContain('OrderDispatchBoard')
    expect(fulfillmentPageSource).toContain("orderView: 'fulfillment'")
    expect(fulfillmentPageSource).toContain(
      'focusedTaskId={focusedProcessTaskId || navigationTarget?.processTaskId}'
    )
    expect(fulfillmentDispatchViewsSource).toContain('未派')
    expect(fulfillmentDispatchViewsSource).toContain('超派')
    expect(workAssignmentsPageSource).toContain('focusedTaskId?: string')
    expect(workAssignmentsPageSource).toContain('visibleAssignments')
  })

  it('工作安排页面明确暴露正常生产、返工与售后补发来源', () => {
    expect(workAssignmentsPageSource).toContain('正常生产')
    expect(workAssignmentsPageSource).toContain('返工')
    expect(workAssignmentsPageSource).toContain('售后补发')
    expect(fulfillmentPageSource).toContain('待发货')
  })

  it('工作安排遵循全局记录优先模式：在排班处理上下文中以区块动作发起新建，录入收纳至抽屉', () => {
    expect(workAssignmentsPageSource).not.toContain('YumiPageHeader')
    expect(workAssignmentsPageSource).toContain('YumiSheet')
    expect(workAssignmentsPageSource).toContain(
      'const [createSheetOpen, setCreateSheetOpen] = useState(false)'
    )
    expect(workAssignmentsPageSource).toContain('actions={')
    expect(workAssignmentsPageSource).toContain('打开新建工作安排')
    expect(workAssignmentsPageSource).toContain('工作安排记录')
    expect(workAssignmentsPageSource).toContain('YumiListToolbar')
    expect(workAssignmentsPageSource).toContain('YumiDataTable')
    expect(workAssignmentsPageSource).toContain('工作安排列表工具')
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
    expect(backupsComposableSource).toContain('window.yumiV2.backup')
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
    expect(workbenchPageSource).toContain('YumiListToolbar')
    expect(workbenchPageSource).toContain('YumiDataTable')
    expect(workbenchPageSource).toContain('YumiSection')
    expect(workbenchPageSource).toContain('工作台事项')
    expect(workbenchPageSource).toContain('工作台事项列表工具')
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
  expect(reportsPageSource).toContain('排班进度')
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
    expect(settlementsPageSource).toContain('YumiListToolbar')
    expect(settlementsPageSource).toContain('YumiDataTable')
    expect(settlementsPageSource).toContain('YumiSelect')
    expect(settlementsPageSource).toContain('YumiSearchSelect')
    expect(settlementsPageSource).toContain('YumiDateRangePicker')
    expect(settlementDetailSource).toContain('YumiDatePicker')
    expect(settlementDetailSource).toContain('YumiStatusTag')
  })
})

describe('YUMI 财务与报表界面', () => {
  it('财务流水使用统一工具条、记录表和抽屉录入，报表各记录区使用具名工具条、数据表格与月份选择', () => {
    for (const pageSource of [financePageSource, reportsPageSource]) {
      expect(pageSource).not.toContain('@radix-ui/themes')
      expect(pageSource).not.toContain('<select')
      expect(pageSource).not.toContain('TextField.Root')
      expect(pageSource).not.toContain('type="date"')
      expect(pageSource).not.toContain('type="month"')
    }
    expect(financePageSource).toContain('YumiListToolbar')
    expect(financePageSource).toContain('YumiDataTable')
    expect(financePageSource).toContain('现金流水列表工具')
    expect(financePageSource).toContain('待报销列表工具')
    expect(financePageSource).toContain('YumiSheet')
    expect(financePageSource).toContain('YumiMonthPicker')
    expect(reportsPageSource).toContain('YumiDataTable')
    expect(reportsPageSource).toContain('YumiListToolbar')
    expect(reportsPageSource).toContain('商品产能风险列表工具')
    expect(reportsPageSource).toContain('交期风险列表工具')
    expect(reportsPageSource).toContain('订单经营列表工具')
    expect(reportsPageSource).toContain('排班进度列表工具')
    expect(reportsPageSource).toContain('已确认工资列表工具')
    expect(reportsPageSource).toContain('YumiMonthPicker')
  })
})

describe('YUMI 售后处理界面', () => {
  it('售后记录使用统一工具条、具名表格与自定义表单控件，且不把责任和收费交给系统自动判断', () => {
    expect(afterSalesPanelSource).not.toContain('@radix-ui/themes')
    expect(afterSalesPanelSource).not.toContain('<select')
    expect(afterSalesPanelSource).not.toContain('TextField.Root')
    expect(afterSalesPanelSource).not.toContain('type="date"')
    expect(afterSalesPanelSource).toContain('YumiListToolbar')
    expect(afterSalesPanelSource).toContain('YumiDataTable')
    expect(afterSalesPanelSource).toContain('售后记录工具条')
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
      expect(pageSource).toContain('YumiListToolbar')
      expect(pageSource).toContain('YumiDataTable')
      expect(pageSource).toContain('YumiSelect')
      expect(pageSource).toContain('YumiSheet')
      expect(pageSource).toContain('YumiTextField')
    }
    expect(customerPageSource).toContain('订单会保留当时的客户快照')
    expect(productPageSource).toContain('标准制作分钟')
    expect(productPageSource).toContain('胶水用量（克）')
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
    expect(workersPageSource).toContain('YumiListToolbar')
    expect(workersPageSource).toContain('YumiDataTable')
    expect(workersPageSource).toContain('YumiSelect')
    expect(workersPageSource).toContain('YumiDetailList')
    expect(workersPageSource).toContain('YumiFormSection')
    expect(workersPageSource).not.toContain('yumi-profile-sheet')
    expect(settingsPageSource).not.toContain('YumiBusinessList')
    expect(settingsPageSource).toContain('YumiListToolbar')
    expect(settingsPageSource).toContain('YumiDataTable')
    expect(settingsPageSource).toContain('YumiSection')
    expect(settingsPageSource).toContain('备份记录')
    expect(settingsPageSource).toContain('记录区')
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
