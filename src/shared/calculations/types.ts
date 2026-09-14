/** 公式中心的受控单位：整数分、数量、分钟、毫克与克单价（微元/克）。 */
export type CalculationUnit = 'cents' | 'quantity' | 'minutes' | 'milligrams' | 'microYuanPerGram'

/** 公式输入变量：业务名称、单位与已校验的精确整数输入。 */
export interface FormulaVariable {
  key: string
  label: string
  unit: CalculationUnit
  value: number
}

/**
 * 受控公式节点。只允许常量、变量、加减、比例金额、材料金额和分组，
 * 不承载任何可执行字符串。
 */
export type FormulaNode =
  | { kind: 'variable'; variable: FormulaVariable }
  | { kind: 'constant'; label: string; unit: CalculationUnit; value: number }
  | { kind: 'sum'; items: FormulaNode[] }
  | { kind: 'subtract'; left: FormulaNode; right: FormulaNode }
  | { kind: 'proportional'; base: FormulaNode; numerator: FormulaNode; denominator: FormulaNode }
  | {
      kind: 'material'
      unitPrice: FormulaNode
      weightMilligrams: FormulaNode
      quantity?: FormulaNode
    }
  | { kind: 'group'; label: string; node: FormulaNode }

export interface FormulaEvaluation {
  value: number
  unit: CalculationUnit
  display: string
  expression: string
  substitutedExpression: string
}

export interface CalculationBreakdownItem {
  label: string
  amountCents: number
  expression: string
  substitutedExpression: string
}

export interface MoneyCalculationResult {
  formulaId: string
  formulaVersion: number
  label: string
  amountCents: number
  expression: string
  substitutedExpression: string
  breakdown: CalculationBreakdownItem[]
  notes: string[]
}

export type PercentageCalculationStatus = 'computable' | 'not_computable'

export interface PercentageCalculationResult {
  formulaId: string
  formulaVersion: number
  label: string
  status: PercentageCalculationStatus
  basisPoints: number | null
  display: string
  expression: string
  substitutedExpression: string
  notes: string[]
}
