import Decimal from 'decimal.js'
import {
  calculateMaterialCents,
  calculateProportionalCents,
  calculateRatioBasisPoints,
  formatCents,
  formatMaterialPriceYuanPerGram,
  formatMilligramsAsGrams
} from '@shared/money'
import type {
  CalculationBreakdownItem,
  CalculationUnit,
  FormulaEvaluation,
  FormulaNode,
  FormulaVariable,
  MoneyCalculationResult,
  PercentageCalculationResult
} from './types'

/** 不可计算比例的展示占位符。 */
export const NOT_COMPUTABLE_DISPLAY = '—'

export function variableNode(variable: FormulaVariable): FormulaNode {
  return { kind: 'variable', variable }
}

export function constantNode(input: {
  label: string
  unit: CalculationUnit
  value: number
}): FormulaNode {
  return { kind: 'constant', label: input.label, unit: input.unit, value: input.value }
}

export function sumNode(items: FormulaNode[]): FormulaNode {
  return { kind: 'sum', items }
}

export function subtractNode(left: FormulaNode, right: FormulaNode): FormulaNode {
  return { kind: 'subtract', left, right }
}

export function proportionalNode(input: {
  base: FormulaNode
  numerator: FormulaNode
  denominator: FormulaNode
}): FormulaNode {
  return {
    kind: 'proportional',
    base: input.base,
    numerator: input.numerator,
    denominator: input.denominator
  }
}

export function materialNode(input: {
  unitPrice: FormulaNode
  weightMilligrams: FormulaNode
  quantity?: FormulaNode
}): FormulaNode {
  return {
    kind: 'material',
    unitPrice: input.unitPrice,
    weightMilligrams: input.weightMilligrams,
    quantity: input.quantity
  }
}

export function groupNode(label: string, node: FormulaNode): FormulaNode {
  return { kind: 'group', label, node }
}

export function formatBasisPoints(basisPoints: number): string {
  return `${new Decimal(basisPoints).div(100).toFixed(2)}%`
}

function formatValue(value: number, unit: CalculationUnit): string {
  switch (unit) {
    case 'cents':
      return formatCents(value)
    case 'milligrams':
      return formatMilligramsAsGrams(value)
    case 'microYuanPerGram':
      return formatMaterialPriceYuanPerGram(value)
    case 'quantity':
    case 'minutes':
      return String(value)
  }
}

interface EvaluatedNode {
  value: number
  unit: CalculationUnit
  /** 主干公式文本：叶子为业务名称，组合节点为运算符连接后的表达式。 */
  expression: string
  /** 展开到叶子的代入文本，用于最终代入结果的左侧。 */
  inlinedSubstitution: string
  /** 作为父节点子项时的代入文本：叶子显示自身取值，组合节点显示其计算结果。 */
  substitutedText: string
  /** 左结合减法链展开、但分组仍折叠为结果值的代入文本。 */
  chainSubstitution: string
}

function displayText(node: FormulaNode, evaluation: EvaluatedNode): string {
  if (node.kind === 'group') return node.label
  if (node.kind === 'variable' || node.kind === 'constant') return evaluation.expression
  return `(${evaluation.expression})`
}

function evaluateNode(node: FormulaNode): EvaluatedNode {
  switch (node.kind) {
    case 'variable': {
      const { unit, value, label } = node.variable
      const formatted = formatValue(value, unit)
      return {
        value,
        unit,
        expression: label,
        inlinedSubstitution: formatted,
        substitutedText: formatted,
        chainSubstitution: formatted
      }
    }
    case 'constant': {
      const { unit, value, label } = node
      const formatted = formatValue(value, unit)
      return {
        value,
        unit,
        expression: label,
        inlinedSubstitution: formatted,
        substitutedText: formatted,
        chainSubstitution: formatted
      }
    }
    case 'group': {
      const inner = evaluateNode(node.node)
      return {
        ...inner,
        substitutedText: formatValue(inner.value, inner.unit),
        chainSubstitution: formatValue(inner.value, inner.unit)
      }
    }
    case 'sum': {
      const items = node.items.map(evaluateNode)
      const value = items.reduce((total, item) => total + item.value, 0)
      const unit = items[0]?.unit ?? 'cents'
      return {
        value,
        unit,
        expression: items.map((item, index) => displayText(node.items[index]!, item)).join(' + '),
        inlinedSubstitution: items.map((item) => item.substitutedText).join(' + '),
        substitutedText: formatValue(value, unit),
        chainSubstitution: items.map((item) => item.chainSubstitution).join(' + ')
      }
    }
    case 'subtract': {
      const left = evaluateNode(node.left)
      const right = evaluateNode(node.right)
      const value = left.value - right.value
      const leftText =
        node.left.kind === 'subtract' ? left.expression : displayText(node.left, left)
      const leftSubstitution =
        node.left.kind === 'subtract' ? left.chainSubstitution : left.substitutedText
      return {
        value,
        unit: left.unit,
        expression: `${leftText} − ${displayText(node.right, right)}`,
        inlinedSubstitution: `${leftSubstitution} − ${right.substitutedText}`,
        substitutedText: formatValue(value, left.unit),
        chainSubstitution: `${leftSubstitution} − ${right.substitutedText}`
      }
    }
    case 'proportional': {
      const base = evaluateNode(node.base)
      const numerator = evaluateNode(node.numerator)
      const denominator = evaluateNode(node.denominator)
      const value = calculateProportionalCents({
        baseCents: base.value,
        numerator: numerator.value,
        denominator: denominator.value
      })
      return {
        value,
        unit: 'cents',
        expression: `${displayText(node.numerator, numerator)} ÷ ${displayText(node.denominator, denominator)} × ${displayText(node.base, base)}`,
        inlinedSubstitution: `${numerator.substitutedText} ÷ ${denominator.substitutedText} × ${base.substitutedText}`,
        substitutedText: formatValue(value, 'cents'),
        chainSubstitution: `${numerator.chainSubstitution} ÷ ${denominator.chainSubstitution} × ${base.chainSubstitution}`
      }
    }
    case 'material': {
      const unitPrice = evaluateNode(node.unitPrice)
      const weightMilligrams = evaluateNode(node.weightMilligrams)
      const quantity = node.quantity ? evaluateNode(node.quantity) : undefined
      const value = calculateMaterialCents({
        materialPriceMicroYuanPerGram: unitPrice.value,
        weightMilligrams: weightMilligrams.value,
        quantity: quantity?.value ?? 1
      })
      const expressionParts = [unitPrice, weightMilligrams, ...(quantity ? [quantity] : [])]
      const expressionNodes = [
        node.unitPrice,
        node.weightMilligrams,
        ...(quantity ? [node.quantity!] : [])
      ]
      return {
        value,
        unit: 'cents',
        expression: expressionNodes
          .map((partNode, index) => displayText(partNode, expressionParts[index]!))
          .join(' × '),
        inlinedSubstitution: expressionParts.map((part) => part.substitutedText).join(' × '),
        substitutedText: formatValue(value, 'cents'),
        chainSubstitution: expressionParts.map((part) => part.chainSubstitution).join(' × ')
      }
    }
    default: {
      const unknown = node as unknown as { kind?: unknown }
      throw new Error(`不支持的公式节点：${String(unknown.kind)}`)
    }
  }
}

export function evaluateFormulaNode(node: FormulaNode): FormulaEvaluation {
  const evaluation = evaluateNode(node)
  return {
    value: evaluation.value,
    unit: evaluation.unit,
    display: formatValue(evaluation.value, evaluation.unit),
    expression: evaluation.expression,
    substitutedExpression: `${evaluation.inlinedSubstitution} = ${formatValue(evaluation.value, evaluation.unit)}`
  }
}

function collectBreakdown(node: FormulaNode): CalculationBreakdownItem[] {
  switch (node.kind) {
    case 'group': {
      const inner = evaluateNode(node.node)
      const item: CalculationBreakdownItem[] =
        inner.unit === 'cents' || inner.unit === 'quantity'
          ? [
              {
                label: node.label,
                amountCents: inner.value,
                expression: inner.expression,
                substitutedExpression: `${inner.inlinedSubstitution} = ${formatValue(inner.value, inner.unit)}`
              }
            ]
          : []
      return [...item, ...collectBreakdown(node.node)]
    }
    case 'sum':
      return node.items.flatMap(collectBreakdown)
    case 'subtract':
      return [...collectBreakdown(node.left), ...collectBreakdown(node.right)]
    case 'proportional':
      return [
        ...collectBreakdown(node.base),
        ...collectBreakdown(node.numerator),
        ...collectBreakdown(node.denominator)
      ]
    case 'material':
      return [
        ...collectBreakdown(node.unitPrice),
        ...collectBreakdown(node.weightMilligrams),
        ...(node.quantity ? collectBreakdown(node.quantity) : [])
      ]
    default:
      return []
  }
}

export function createMoneyCalculationResult(input: {
  formulaId: string
  formulaVersion: number
  label: string
  node: FormulaNode
  notes?: string[]
}): MoneyCalculationResult {
  const evaluation = evaluateNode(input.node)
  if (evaluation.unit !== 'cents') throw new Error('金额公式结果必须是整数分')
  return {
    formulaId: input.formulaId,
    formulaVersion: input.formulaVersion,
    label: input.label,
    amountCents: evaluation.value,
    expression: evaluation.expression,
    substitutedExpression: `${evaluation.inlinedSubstitution} = ${formatValue(evaluation.value, evaluation.unit)}`,
    breakdown: collectBreakdown(input.node),
    notes: input.notes ?? []
  }
}

export function createPercentageCalculationResult(input: {
  formulaId: string
  formulaVersion: number
  label: string
  numerator: FormulaNode
  denominator: FormulaNode
  notes?: string[]
}): PercentageCalculationResult {
  const numerator = evaluateNode(input.numerator)
  const denominator = evaluateNode(input.denominator)
  const expression = `${displayText(input.numerator, numerator)} ÷ ${displayText(input.denominator, denominator)}`
  const base = {
    formulaId: input.formulaId,
    formulaVersion: input.formulaVersion,
    label: input.label,
    expression,
    notes: input.notes ?? []
  }
  if (denominator.value === 0) {
    return {
      ...base,
      status: 'not_computable',
      basisPoints: null,
      display: NOT_COMPUTABLE_DISPLAY,
      substitutedExpression: `${numerator.substitutedText} ÷ ${denominator.substitutedText} = ${NOT_COMPUTABLE_DISPLAY}`
    }
  }
  const basisPoints = calculateRatioBasisPoints({
    numerator: numerator.value,
    denominator: denominator.value
  })
  const display = formatBasisPoints(basisPoints)
  return {
    ...base,
    status: 'computable',
    basisPoints,
    display,
    substitutedExpression: `${numerator.substitutedText} ÷ ${denominator.substitutedText} = ${display}`
  }
}
