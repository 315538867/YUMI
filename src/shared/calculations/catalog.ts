import { orderAmountFormulaIds } from './order-amount'
import { wageFormulaIds } from './wage'

/** 商品与产能公式标识：在新模型阶段内保持稳定，供公式目录与页面引用。 */
export const productFormulaIds = {
  materialRequirement: 'product.material_requirement',
  directCost: 'product.direct_cost',
  dailyCapacity: 'product.daily_capacity'
} as const

export interface FormulaCatalogEntry {
  /** 公式标识：与共享计算模块的公式标识一致，可被设置页和说明直接引用。 */
  id: string
  /** 适用范围：公式所属的业务分类。 */
  scope: string
  /** 业务名称。 */
  name: string
  /** 展示表达式：公式主干，必须与实现来自同一份定义。 */
  expression: string
  /** 输入来源。 */
  input: string
  /** 口径与边界。 */
  boundary: string
}

/**
 * 只列出会产生业务结果的当前实现公式；字段校验、状态映射和快照复制不单列为公式。
 * 每行都与主进程领域函数或共享公式中心一一对应。未建立订单归属规则的成本必须明确排除，不能以估算值补齐。
 */
export const formulaCatalog: FormulaCatalogEntry[] = [
  {
    id: orderAmountFormulaIds.itemAmount,
    scope: '订单金额',
    name: '商品金额',
    expression: '数量 × 成交单价',
    input: '订单商品行',
    boundary: '金额以分保存'
  },
  {
    id: orderAmountFormulaIds.edgeAmount,
    scope: '订单金额',
    name: '缝边金额',
    expression: '缝边数量 × 缝边单价',
    input: '启用缝边的订单商品行',
    boundary: '缝边数量不得超过商品数量'
  },
  {
    id: orderAmountFormulaIds.lineAmount,
    scope: '订单金额',
    name: '商品行应收',
    expression: '商品金额 + 缝边金额 − 明细优惠',
    input: '商品行金额与优惠',
    boundary: '明细优惠不得超过该商品行金额'
  },
  {
    id: orderAmountFormulaIds.orderAmount,
    scope: '订单金额',
    name: '订单应收金额',
    expression: '所有商品行应收之和 − 订单优惠',
    input: '商品行应收、订单优惠',
    boundary: '订单优惠不得超过商品行应收之和'
  },
  {
    id: orderAmountFormulaIds.currentAmount,
    scope: '订单金额',
    name: '当前订单金额',
    expression: '订单应收金额 + 全部金额调整',
    input: '订单金额、金额调整流水',
    boundary: '每笔调整不能为 0，可正可负'
  },

  {
    id: 'order_fund.received',
    scope: '订单资金',
    name: '累计收款',
    expression: '未被冲正的收入资金流水之和',
    input: '订单资金流水',
    boundary: '已冲正原流水和冲正流水均不重复计入'
  },
  {
    id: 'order_fund.refunded',
    scope: '订单资金',
    name: '累计退款',
    expression: '未被冲正的支出资金流水之和',
    input: '订单资金流水',
    boundary: '退款必须是支出方向'
  },
  {
    id: 'order_fund.net_received',
    scope: '订单资金',
    name: '净收款',
    expression: '累计收款 − 累计退款',
    input: '订单资金流水',
    boundary: '仅以已保存且未冲正流水计算'
  },
  {
    id: 'order_fund.outstanding',
    scope: '订单资金',
    name: '待收款',
    expression: '当前订单金额 − 净收款',
    input: '当前订单金额、订单资金流水',
    boundary: '可为负，表示超收或后续需核对'
  },

  {
    id: 'production.making_deadline',
    scope: '交期与发货',
    name: '制作截止日',
    expression: '预计发货日 − 预留天数',
    input: '预计发货日、订单或工作室预留天数',
    boundary: '未填预计发货日时不计算截止日；默认预留 2 天'
  },
  {
    id: 'fulfillment.pending_shipment',
    scope: '交期与发货',
    name: '待发数量',
    expression: '订单确认数量 − 累计已发数量',
    input: '订单确认数量、有效发货批次数量',
    boundary: '无可用待发数约束时，累计已发不得超过确认数量'
  },

  {
    id: productFormulaIds.dailyCapacity,
    scope: '商品成本与产能',
    name: '每日模具产能',
    expression: '模具数量 × 每模每批产出 × 每日最大批次',
    input: '商品模具参数',
    boundary: '三项均为正整数时才可计算'
  },
  {
    id: productFormulaIds.materialRequirement,
    scope: '商品成本与产能',
    name: '材料用量',
    expression: '数量 × 单件材料毫克 × (1 + 损耗率)',
    input: '订单冻结的商品材料参数',
    boundary: '以毫克计算并按四舍五入取整；损耗率小于 100%'
  },
  {
    id: productFormulaIds.directCost,
    scope: '商品成本与产能',
    name: '商品直接成本',
    expression:
      '材料或胶水成本 + (包装成本 + 配饰成本 + 替换袋成本) × 数量 + 内部缝边成本 × 缝边数量',
    input: '订单冻结商品快照',
    boundary: '新订单按整批材料计算；旧快照沿用旧材料成本'
  },

  {
    id: 'production.labor_cost',
    scope: '生产与排班',
    name: '实际生产人工成本',
    expression: '实际分钟 ÷ 60 × 时薪',
    input: '实际申报分钟、任务时薪',
    boundary: '金额以分级别四舍五入'
  },
  {
    id: 'production.piece_cost',
    scope: '生产与排班',
    name: '实际生产计件成本',
    expression: '合格数量 × 单件提成',
    input: '生产合格数量、任务冻结提成',
    boundary: '返工和报废不产生该项'
  },
  {
    id: 'production.total_cost',
    scope: '生产与排班',
    name: '实际生产总成本',
    expression: '实际生产人工成本 + 实际生产计件成本',
    input: '实际人工与合格计件成本',
    boundary: '用于实际生产核算，不替代订单盈利分摊'
  },
  {
    id: 'production.coverage',
    scope: '生产与排班',
    name: '生产覆盖数量',
    expression: '合格数量 + 已排班数量',
    input: '订单数量、合格数量、排班数量',
    boundary: '未排数量 = max(0，订单数量 − 覆盖数量)；超额数量 = max(0，覆盖数量 − 订单数量)'
  },
  {
    id: 'production.planned_minutes',
    scope: '生产与排班',
    name: '任务计划时长',
    expression: '制作：计划数量 × 标准制作分钟 + 额外分钟；其他工序：负责人填写的计划分钟',
    input: '任务工序、计划数量、商品快照、额外分钟',
    boundary: '额外分钟仅适用于制作任务'
  },
  {
    id: 'fulfillment.shippable_quantity',
    scope: '生产与排班',
    name: '可发货数量',
    expression: '待发货阶段库存',
    input: '订单履约阶段状态',
    boundary: '由制作、捏毛装袋、打包及发货事件逐步流转'
  },

  {
    id: wageFormulaIds.timedWage,
    scope: '兼职结算',
    name: '时薪工资',
    expression: '工作分钟 ÷ 60 × 任务冻结时薪',
    input: '排班分钟或考勤分钟、任务时薪',
    boundary: '金额以分级别四舍五入；任务创建后时薪不回写'
  },
  {
    id: 'payroll.qualification_commission',
    scope: '兼职结算',
    name: '合格计件提成',
    expression: '仅制作、捏毛装袋：合格数量 × 任务冻结单件提成',
    input: '任务工序、合格数量、任务冻结费率',
    boundary: '打包和发货不产生计件提成；历史缺失费率按 0 元'
  },
  {
    id: 'payroll.making_defect_deduction',
    scope: '兼职结算',
    name: '制作不合格扣款',
    expression: '不合格数量 × 制作提成 + 不合格数量 × 标准制作分钟 ÷ 60 × 时薪 + 胶水扣款',
    input: '制作不合格数量、制作任务快照',
    boundary: '胶水扣款可按单件成本计算，也可直接录入总额'
  },
  {
    id: 'payroll.fluffing_defect_deduction',
    scope: '兼职结算',
    name: '捏毛装袋不合格扣款',
    expression: '不合格数量 × 捏毛装袋提成 + (计划分钟 × 不合格数量 ÷ 计划数量) ÷ 60 × 时薪',
    input: '捏毛装袋任务快照',
    boundary: '不扣胶水；不合格数量不得超过计划数量'
  },
  {
    id: 'payroll.reference_wage',
    scope: '兼职结算',
    name: '参考工资（排班 / 考勤）',
    expression: 'max(0，时薪工资 + 合格计件提成 + 其他调整 − min(可扣款，排班口径扣前应发))',
    input: '排班或考勤分钟、提成、扣款、其他调整',
    boundary: '两套口径只在时薪分钟来源不同；负责人最终确认实发'
  },
  {
    id: 'payroll.deduction_allocation',
    scope: '兼职结算',
    name: '扣款分配与顺延',
    expression: '按发生时间依次：本次抵扣 = min(待抵扣金额，剩余可抵扣上限)',
    input: '待抵扣记录、排班口径扣前应发',
    boundary: '未抵完金额原样顺延；不允许负工资'
  },

  {
    id: 'finance.monthly_income',
    scope: '财务',
    name: '月经营收入',
    expression: '查询月份内全部收入流水之和',
    input: '财务流水实际发生日、方向',
    boundary: '按实际收款日期归属月份'
  },
  {
    id: 'finance.monthly_expense',
    scope: '财务',
    name: '月经营支出',
    expression: '查询月份内支出流水之和（不含报销）',
    input: '财务流水实际发生日、来源',
    boundary: '报销是现金付款，不重复记为经营支出'
  },
  {
    id: 'finance.monthly_result',
    scope: '财务',
    name: '月经营结果',
    expression: '月经营收入 − 月经营支出',
    input: '当月收入、当月经营支出',
    boundary: '只统计查询月份内的已保存流水'
  },
  {
    id: 'finance.pending_reimbursement',
    scope: '财务',
    name: '待报销金额',
    expression: '截至查询日发生、且尚无当日或更早完整报销的私人垫付之和',
    input: '私人垫付、报销记录、查询日',
    boundary: '同一私人垫付只允许对应一笔等额报销'
  }
]
