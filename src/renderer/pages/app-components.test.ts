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
const customerComposableSource = source('src/renderer/composables/use-customers.ts')
const productComposableSource = source('src/renderer/composables/use-products.ts')
const orderComposableSource = source('src/renderer/composables/use-orders.ts')
const fulfillmentComposableSource = source('src/renderer/composables/use-fulfillment.ts')
const workAssignmentsComposableSource = source('src/renderer/composables/use-work-assignments.ts')

describe('V2 应用壳与页面边界', () => {
  it('应用壳仅负责导航与页面装配，不直接调用预加载能力', () => {
    expect(appSource).toContain("from './customers'")
    expect(appSource).toContain("from './products'")
    expect(appSource).toContain("from './orders'")
    expect(appSource).toContain("from './fulfillment'")
    expect(appSource).not.toContain('window.yumi')
    expect(appSource).not.toContain('ipcRenderer')
  })

  it('页面通过 composable 获取数据，不直接连接 IPC', () => {
    for (const pageSource of [customerPageSource, productPageSource, orderPageSource, fulfillmentPageSource, workAssignmentsPageSource]) {
      expect(pageSource).not.toContain('window.yumi')
      expect(pageSource).not.toContain('ipcRenderer')
    }
    expect(customerComposableSource).toContain('window.yumiV2.customers')
    expect(productComposableSource).toContain('window.yumiV2.products')
    expect(orderComposableSource).toContain('window.yumiV2.orders')
    expect(fulfillmentComposableSource).toContain('window.yumiV2.fulfillment')
    expect(workAssignmentsComposableSource).toContain('window.yumiV2.fulfillment')
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
