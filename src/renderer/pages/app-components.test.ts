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
    expect(appSource).toMatch(/生成订单表/)
    expect(appSource).toMatch(/保存发货清单/)
    expect(appSource).toMatch(/window\.yumi\.orders\.exportOrderSheet/)
    expect(appSource).toMatch(/window\.yumi\.orders\.exportShipmentManifest/)
    expect(appSource).toMatch(/disabled=\{exportingShipmentManifestId === shipment\.id\}/)
    expect(appSource).not.toMatch(/生成订单表和发货清单/)
    expect(appSource).not.toMatch(/导出累计发货清单/)
    expect(appSource).not.toMatch(/shipment-export-choice/)
    expect(appSource).not.toMatch(/window\.yumi\.orders\.exportWorkbook/)
    expect(appSource).not.toMatch(/setExportShipmentId|exportShipmentId/)
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
    expect(appSource).toMatch(
      /以任务时长安排本次排班；系统计算任务基础、额外预留和最终总时长，并提示模具日产能与交期风险。/
    )
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

describe('用户可见状态中文化', () => {
  it('订单、报表与排班界面统一使用集中状态展示模块', () => {
    expect(appSource).toMatch(/from '\.\.\/status-display'/)
    expect(appSource).toMatch(/getProductionStatusPresentation\(order\.productionStatus\)\.label/)
    expect(appSource).toMatch(/getFinancialStatusPresentation\(row\.financialStatus\)\.label/)
    expect(appSource).toMatch(/getShiftStatusPresentation\(shift\.status\)\.label/)
    expect(appSource).toMatch(/knownProductionStatuses\.map/)
    expect(appSource).toMatch(/knownShiftStatuses\.map/)
  })

  it('不直接将内部英文状态枚举渲染给用户', () => {
    expect(appSource).not.toMatch(/>\s*\{order\.productionStatus\}\s*</)
    expect(appSource).not.toMatch(/productionStatusLabel|financialStatusLabel|shiftStatusLabels/)
  })
})

describe('订单、排班与兼职人员联动展示', () => {
  it('订单展示独立的排产状态及合格、已排和未排数量', () => {
    expect(appSource).toMatch(/待排产/)
    expect(appSource).toMatch(/部分已排/)
    expect(appSource).toMatch(/待补排/)
    expect(appSource).toMatch(
      /合格 \{qualifiedQuantity\} · 已排 \{scheduledQuantity\} · 未排 \{unplannedQuantity\}/
    )
    expect(appSource).toMatch(/getSchedulingStatusPresentation\(order\.schedulingStatus\)/)
    expect(appSource).toMatch(/关联排班/)
  })

  it('排班预览和兼职人员任务都复用主进程返回的订单进度，并提供订单跳转', () => {
    expect(appSource).toMatch(/preview\.taskProgress\.map/)
    expect(appSource).toMatch(
      /当前合格\s*\{task\.progress\.qualifiedQuantity\}\s*·\s*不合格(?:\s*\{\s*' '\s*\})?\s*\{task\.progress\.unqualifiedQuantity\}\s*·\s*已排\s*\{task\.progress\.scheduledQuantity\}\s*·\s*未排\s*\{task\.progress\.unplannedQuantity\}/
    )
    expect(appSource).toMatch(/worker\.orderTasks\.map/)
    expect(appSource).toMatch(/不合格 \/ 未完成/)
    expect(appSource).toMatch(/onInspectOrder\(task\.orderId\)/)
    expect(appSource).toMatch(/onInspectShift\(task\.shiftId\)/)
    expect(appSource).toMatch(/onInspectShift\(schedule\.id\)/)
  })
})

describe('全局默认兼职时薪展示', () => {
  it('设置页面维护默认时薪，商品预览统一使用系统设置而不是临时输入', () => {
    expect(appSource).toMatch(/默认兼职时薪（元\/小时）/)
    expect(appSource).toMatch(/window\.yumi\.settings\.getCost\(\)/)
    expect(appSource).toMatch(/window\.yumi\.settings\.updateCost/)
    expect(appSource).toMatch(/按全局默认兼职时薪/)
    expect(appSource).toMatch(/appliedHourlyWageCents/)
    expect(appSource).not.toMatch(/预估时薪（元）/)
    expect(appSource).not.toMatch(/previewWage/)
  })
})

describe('成本设置简化', () => {
  it('不再暴露固定成本分摊的设置或预览展示', () => {
    expect(appSource).not.toContain('月度固定成本（元）')
    expect(appSource).not.toContain('目标有效工时（分钟）')
    expect(appSource).not.toContain('房租水电分摊')
    expect(appSource).not.toContain('monthlyFixedCostCents')
    expect(appSource).not.toContain('targetEffectiveMinutes')
    expect(appSource).not.toContain('fixedOverheadCostCents')
  })
})
