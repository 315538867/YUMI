import { describe, expect, it } from 'vitest'
import {
  constantNode,
  createMoneyCalculationResult,
  createPercentageCalculationResult,
  evaluateFormulaNode,
  groupNode,
  materialNode,
  proportionalNode,
  sumNode,
  subtractNode,
  variableNode
} from './expression'

describe('受控公式表达式', () => {
  it('求和节点精确相加并生成公式文本与代入文本', () => {
    const node = sumNode([
      variableNode({ key: 'packaging', label: '包装成本', unit: 'cents', value: 20 }),
      variableNode({ key: 'accessory', label: '配饰成本', unit: 'cents', value: 5 })
    ])
    const evaluation = evaluateFormulaNode(node)
    expect(evaluation.value).toBe(25)
    expect(evaluation.expression).toBe('包装成本 + 配饰成本')
    expect(evaluation.substitutedExpression).toBe('0.20 + 0.05 = 0.25')
  })

  it('减法节点支持负利润并保持 HALF_UP 之前的精确值', () => {
    const evaluation = evaluateFormulaNode(
      subtractNode(
        variableNode({ key: 'price', label: '默认售价', unit: 'cents', value: 1_500 }),
        variableNode({ key: 'cost', label: '预计单件成本', unit: 'cents', value: 2_158 })
      )
    )
    expect(evaluation.value).toBe(-658)
    expect(evaluation.expression).toBe('默认售价 − 预计单件成本')
    expect(evaluation.substitutedExpression).toBe('15.00 − 21.58 = -6.58')
  })

  it('比例金额节点按分钟时薪在整数分边界 HALF_UP', () => {
    const makeNode = (minutes: number, hourlyWageCents: number) =>
      proportionalNode({
        base: variableNode({
          key: 'wage',
          label: '捏毛装袋预计基准时薪',
          unit: 'cents',
          value: hourlyWageCents
        }),
        numerator: variableNode({
          key: 'minutes',
          label: '预计单件捏毛装袋分钟',
          unit: 'minutes',
          value: minutes
        }),
        denominator: constantNode({ label: '60', unit: 'minutes', value: 60 })
      })

    expect(evaluateFormulaNode(makeNode(30, 3_000)).value).toBe(1_500)
    expect(evaluateFormulaNode(makeNode(30, 1_001)).value).toBe(501)
    expect(evaluateFormulaNode(makeNode(1, 1_000)).value).toBe(17)

    const evaluation = evaluateFormulaNode(makeNode(30, 3_000))
    expect(evaluation.expression).toBe('预计单件捏毛装袋分钟 ÷ 60 × 捏毛装袋预计基准时薪')
    expect(evaluation.substitutedExpression).toBe('30 ÷ 60 × 30.00 = 15.00')
  })

  it('材料成本节点按克单价与毫克重量一次性舍入', () => {
    const evaluation = evaluateFormulaNode(
      materialNode({
        unitPrice: variableNode({
          key: 'materialPrice',
          label: '全局材料克单价',
          unit: 'microYuanPerGram',
          value: 3_400
        }),
        weightMilligrams: variableNode({
          key: 'weight',
          label: '单件材料重量',
          unit: 'milligrams',
          value: 25_000
        }),
        quantity: variableNode({ key: 'quantity', label: '数量', unit: 'quantity', value: 100 })
      })
    )
    expect(evaluation.value).toBe(850)
    expect(evaluation.expression).toBe('全局材料克单价 × 单件材料重量 × 数量')
    expect(evaluation.substitutedExpression).toBe('0.0034 × 25 × 100 = 8.50')
  })

  it('金额结果包含业务名称、主干公式、代入值与分组明细', () => {
    const node = sumNode([
      groupNode(
        '预计单件材料成本',
        materialNode({
          unitPrice: constantNode({
            label: '全局材料克单价',
            unit: 'microYuanPerGram',
            value: 3_400
          }),
          weightMilligrams: constantNode({
            label: '单件材料重量',
            unit: 'milligrams',
            value: 25_000
          }),
          quantity: constantNode({ label: '数量', unit: 'quantity', value: 1 })
        })
      ),
      variableNode({ key: 'packaging', label: '包装成本', unit: 'cents', value: 20 })
    ])
    const result = createMoneyCalculationResult({
      formulaId: 'product.expected_cost',
      formulaVersion: 1,
      label: '预计单件成本',
      node,
      notes: ['不含订单级缝边客户收入']
    })

    expect(result.amountCents).toBe(29)
    expect(result.expression).toBe('预计单件材料成本 + 包装成本')
    expect(result.substitutedExpression).toBe('0.09 + 0.20 = 0.29')
    expect(result.breakdown).toEqual([
      {
        label: '预计单件材料成本',
        amountCents: 9,
        expression: '全局材料克单价 × 单件材料重量 × 数量',
        substitutedExpression: '0.0034 × 25 × 1 = 0.09'
      }
    ])
    expect(result.notes).toEqual(['不含订单级缝边客户收入'])
    expect(result.formulaId).toBe('product.expected_cost')
    expect(result.formulaVersion).toBe(1)
  })

  it('零值参与求和时稳定输出零金额', () => {
    const evaluation = evaluateFormulaNode(
      sumNode([
        variableNode({ key: 'a', label: '替换袋成本', unit: 'cents', value: 0 }),
        variableNode({ key: 'b', label: '缝边耗材成本', unit: 'cents', value: 0 })
      ])
    )
    expect(evaluation.value).toBe(0)
    expect(evaluation.substitutedExpression).toBe('0.00 + 0.00 = 0.00')
  })

  it('比例结果在分母为零时返回不可计算状态而不是 Infinity 或 NaN', () => {
    const result = createPercentageCalculationResult({
      formulaId: 'product.expected_profit_rate',
      formulaVersion: 1,
      label: '预计利润率',
      numerator: variableNode({
        key: 'profit',
        label: '预计单件利润',
        unit: 'cents',
        value: 1_342
      }),
      denominator: variableNode({ key: 'price', label: '默认售价', unit: 'cents', value: 0 }),
      notes: ['默认售价为零，无法计算利润率']
    })

    expect(result.status).toBe('not_computable')
    expect(result.basisPoints).toBeNull()
    expect(result.display).toBe('—')
    expect(result.expression).toBe('预计单件利润 ÷ 默认售价')
    expect(result.notes).toEqual(['默认售价为零，无法计算利润率'])
  })

  it('比例结果按万分比 HALF_UP 计算并支持负利润', () => {
    const profitRate = createPercentageCalculationResult({
      formulaId: 'product.expected_profit_rate',
      formulaVersion: 1,
      label: '预计利润率',
      numerator: variableNode({
        key: 'profit',
        label: '预计单件利润',
        unit: 'cents',
        value: 1_342
      }),
      denominator: variableNode({ key: 'price', label: '默认售价', unit: 'cents', value: 3_500 })
    })
    expect(profitRate.status).toBe('computable')
    expect(profitRate.basisPoints).toBe(3_834)
    expect(profitRate.display).toBe('38.34%')
    expect(profitRate.substitutedExpression).toBe('13.42 ÷ 35.00 = 38.34%')

    const negativeRate = createPercentageCalculationResult({
      formulaId: 'product.expected_profit_rate',
      formulaVersion: 1,
      label: '预计利润率',
      numerator: variableNode({ key: 'profit', label: '预计单件利润', unit: 'cents', value: -658 }),
      denominator: variableNode({ key: 'price', label: '默认售价', unit: 'cents', value: 1_500 })
    })
    expect(negativeRate.basisPoints).toBe(-4_387)
    expect(negativeRate.display).toBe('-43.87%')
  })

  it('公式文本只来自受控节点结构，变量标签中的表达式字样不参与计算', () => {
    const evaluation = evaluateFormulaNode(
      sumNode([
        variableNode({ key: 'note', label: '1 + 1', unit: 'cents', value: 7 }),
        variableNode({ key: 'other', label: '其他', unit: 'cents', value: 0 })
      ])
    )
    expect(evaluation.value).toBe(7)
    expect(evaluation.expression).toBe('1 + 1 + 其他')
    expect(evaluation.substitutedExpression).toBe('0.07 + 0.00 = 0.07')
  })

  it('相同输入稳定产生相同的数值与展示数据', () => {
    const build = () =>
      createMoneyCalculationResult({
        formulaId: 'wage.timed',
        formulaVersion: 1,
        label: '捏毛装袋计时工资',
        node: proportionalNode({
          base: variableNode({ key: 'wage', label: '个人时薪', unit: 'cents', value: 3_000 }),
          numerator: variableNode({
            key: 'minutes',
            label: '核算分钟',
            unit: 'minutes',
            value: 240
          }),
          denominator: constantNode({ label: '60', unit: 'minutes', value: 60 })
        })
      })
    expect(build()).toEqual(build())
  })

  it('拒绝通过未知节点类型绕过受控表达式', () => {
    expect(() =>
      evaluateFormulaNode({ kind: 'eval', source: '1+1' } as unknown as ReturnType<typeof sumNode>)
    ).toThrow('不支持的公式节点')
  })

  it('减法链按左结合展示且不产生多余括号', () => {
    const evaluation = evaluateFormulaNode(
      subtractNode(
        subtractNode(
          variableNode({ key: 'subtotal', label: '商品与缝边小计', unit: 'cents', value: 1_550 }),
          variableNode({ key: 'itemDiscount', label: '明细优惠合计', unit: 'cents', value: 40 })
        ),
        variableNode({ key: 'orderDiscount', label: '订单优惠', unit: 'cents', value: 50 })
      )
    )
    expect(evaluation.value).toBe(1_460)
    expect(evaluation.expression).toBe('商品与缝边小计 − 明细优惠合计 − 订单优惠')
    expect(evaluation.substitutedExpression).toBe('15.50 − 0.40 − 0.50 = 14.60')
  })

  it('材料节点在未给出数量时按单件展示公式', () => {
    const evaluation = evaluateFormulaNode(
      materialNode({
        unitPrice: variableNode({
          key: 'materialPrice',
          label: '全局材料克单价',
          unit: 'microYuanPerGram',
          value: 3_400
        }),
        weightMilligrams: variableNode({
          key: 'weight',
          label: '单件材料重量',
          unit: 'milligrams',
          value: 25_000
        })
      })
    )
    expect(evaluation.value).toBe(9)
    expect(evaluation.expression).toBe('全局材料克单价 × 单件材料重量')
    expect(evaluation.substitutedExpression).toBe('0.0034 × 25 = 0.09')
  })
})
