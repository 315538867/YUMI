import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const appSource = source('src/renderer/pages/app.tsx')
const customerPageSource = source('src/renderer/pages/customers/index.tsx')
const productPageSource = source('src/renderer/pages/products/index.tsx')
const orderPageSource = source('src/renderer/pages/orders/index.tsx')
const customerComposableSource = source('src/renderer/composables/use-customers.ts')
const productComposableSource = source('src/renderer/composables/use-products.ts')
const orderComposableSource = source('src/renderer/composables/use-orders.ts')

describe('V2 应用壳与页面边界', () => {
  it('应用壳仅负责导航与页面装配，不直接调用预加载能力', () => {
    expect(appSource).toContain("from './customers'")
    expect(appSource).toContain("from './products'")
    expect(appSource).toContain("from './orders'")
    expect(appSource).not.toContain('window.yumi')
    expect(appSource).not.toContain('ipcRenderer')
  })

  it('页面通过 composable 获取数据，不直接连接 IPC', () => {
    for (const pageSource of [customerPageSource, productPageSource, orderPageSource]) {
      expect(pageSource).not.toContain('window.yumi')
      expect(pageSource).not.toContain('ipcRenderer')
    }
    expect(customerComposableSource).toContain('window.yumiV2.customers')
    expect(productComposableSource).toContain('window.yumiV2.products')
    expect(orderComposableSource).toContain('window.yumiV2.orders')
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
