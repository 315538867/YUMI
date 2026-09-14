import type {
  CalculationBreakdownItem,
  MoneyCalculationResult,
  PercentageCalculationResult
} from '@shared/calculations'
import { formatCents as formatMoneyCents } from '@shared/money'
import type { YumiDensity } from '../tabs/yumi-tabs'

export type YumiCalculatedAmountTone = 'default' | 'profit'

export type YumiCalculatedAmountProps = {
  /** 结构化计算结果：业务名称、金额、主干公式、代入值与组成明细均由它提供。 */
  calculation: MoneyCalculationResult | PercentageCalculationResult
  className?: string
  density?: YumiDensity
  /** 利润语义：正值使用成功色、负值使用危险色，符号文本始终保留。 */
  tone?: YumiCalculatedAmountTone
  showBreakdown?: boolean
}

function isMoneyCalculation(
  calculation: MoneyCalculationResult | PercentageCalculationResult
): calculation is MoneyCalculationResult {
  return 'amountCents' in calculation
}

function formatSignedMoneyCents(cents: number): string {
  return cents < 0 ? `-¥${formatMoneyCents(-cents)}` : `¥${formatMoneyCents(cents)}`
}

type ValueState = 'default' | 'profit' | 'loss' | 'muted'

function resolveValueState(
  calculation: MoneyCalculationResult | PercentageCalculationResult,
  tone: YumiCalculatedAmountTone
): ValueState {
  if (!isMoneyCalculation(calculation)) {
    return calculation.status === 'not_computable' ? 'muted' : 'default'
  }
  if (tone !== 'profit') return 'default'
  return calculation.amountCents < 0 ? 'loss' : 'profit'
}

/**
 * 金额与比例公式组件：直接展示结果、公式主干和代入值，组成明细可展开。
 * 组件只接收结构化计算结果，不接收页面自行拼接的公式文本。
 */
export function YumiCalculatedAmount({
  calculation,
  className,
  density = 'compact',
  showBreakdown = false,
  tone = 'default'
}: YumiCalculatedAmountProps) {
  const money = isMoneyCalculation(calculation)
  const valueText = money ? formatSignedMoneyCents(calculation.amountCents) : calculation.display
  const valueState = resolveValueState(calculation, tone)
  const showSubstitution = money || calculation.status === 'computable'
  const breakdown: CalculationBreakdownItem[] = money ? calculation.breakdown : []
  const accessibilityLabel = [
    `${calculation.label}：${valueText}`,
    `公式：${calculation.expression}`,
    ...(showSubstitution ? [`代入：${calculation.substitutedExpression}`] : []),
    ...calculation.notes
  ].join('；')

  const classes = ['yumi-calculated-amount', `yumi-calculated-amount--${density}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <div aria-label={accessibilityLabel} className={classes} role="group">
      <span className="yumi-calculated-amount__label">{calculation.label}</span>
      <span
        className={`yumi-calculated-amount__value yumi-calculated-amount__value--${valueState}`}
      >
        {valueText}
      </span>
      <span className="yumi-calculated-amount__expression">{calculation.expression}</span>
      {showSubstitution ? (
        <span className="yumi-calculated-amount__substitution">
          {calculation.substitutedExpression}
        </span>
      ) : null}
      {calculation.notes.map((note) => (
        <small className="yumi-calculated-amount__note" key={note}>
          {note}
        </small>
      ))}
      {showBreakdown && breakdown.length > 0 ? (
        <dl className="yumi-calculated-amount__breakdown">
          {breakdown.map((item) => (
            <div className="yumi-calculated-amount__breakdown-item" key={item.label}>
              <dt>{item.label}</dt>
              <dd>
                <span className="yumi-calculated-amount__breakdown-expression">
                  {item.expression}
                </span>
                <span className="yumi-calculated-amount__breakdown-substitution">
                  {item.substitutedExpression}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}
