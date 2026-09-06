import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(resolve(process.cwd(), 'src/renderer/pages/app.tsx'), 'utf8')

describe('桌面工作区组件声明', () => {
  it('设置工作区组件不与导航 Settings 图标同名', () => {
    expect(appSource).not.toMatch(/function\s+Settings\s*\(/)
    expect(appSource).toMatch(/function\s+SettingsWorkspace\s*\(/)
  })
})

describe('订单发货与收货地址交互', () => {
  it('提供仅修改订单草稿的客户收货地址复制操作', () => {
    expect(appSource).toMatch(/复制客户收货地址/)
    expect(appSource).toMatch(/收货地址/)
    expect(appSource).not.toMatch(/常用地址/)
  })

  it('支持用户逐次填写发货数量，并展示系统计算的已发和待发数量', () => {
    expect(appSource).toMatch(/发货清单/)
    expect(appSource).toMatch(/本次发货数量/)
    expect(appSource).toMatch(/累计已发/)
    expect(appSource).toMatch(/待发/)
    expect(appSource).toMatch(/window\.yumi\.orders\.createShipment/)
    expect(appSource).toMatch(/window\.yumi\.orders\.updateShipment/)
    expect(appSource).toMatch(/window\.yumi\.orders\.exportWorkbook/)
  })
})

describe('商品单页创建', () => {
  it('在连续表单中收集费用与制作参数并可预览成本', () => {
    expect(appSource).toMatch(/配件费（元\/个）/)
    expect(appSource).toMatch(/替换袋费用（元\/个）/)
    expect(appSource).toMatch(/预览单件成本/)
    expect(appSource).not.toMatch(/先建立基础资料；完整成本和模具参数可在商品详情维护。/)
  })
})

describe('排班时长、完成登记与月度重量报表交互', () => {
  it('排班仅在全局填写额外分钟，并展示任务基础、额外和最终总时长', () => {
    expect(appSource).toMatch(/本次额外增加分钟/)
    expect(appSource).toMatch(/任务基础时长/)
    expect(appSource).toMatch(/最终总时长/)
    expect(appSource).toMatch(/以任务时长安排本次排班；系统计算任务基础、额外预留和最终总时长，并提示模具日产能与交期风险。/)
    expect(appSource).toMatch(/还没有兼职人员。创建人员后，可以按任务时长安排本次排班。/)
    expect(appSource).not.toMatch(/最终上班时段/)
    expect(appSource).not.toMatch(/直接为人员创建最终上班时间段/)
    expect(appSource).not.toMatch(/保存前检查重叠、工时/)
  })

  it('状态标记为已完成时逐项收集合格和不合格数量，不展示工资扣费', () => {
    expect(appSource).toMatch(/填写实际完成数据/)
    expect(appSource).toMatch(/合格数量/)
    expect(appSource).toMatch(/不合格数量/)
    expect(appSource).toMatch(/taskCompletions/)
    expect(appSource).toMatch(/本期不计算工资与扣费/)
  })

  it('报表工作区提供按月查询完成制作重量的入口', () => {
    expect(appSource).toMatch(/月度制作/)
    expect(appSource).toMatch(/window\.yumi\.reports\.monthlyProductionWeight/)
    expect(appSource).toMatch(/完成重量（kg）/)
  })
})
