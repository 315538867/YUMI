import type { V2ProcessType } from '@shared/contracts/index'

type YumiTaskRateSummaryProps = {
  pieceRateCents: number | null
  processType: V2ProcessType
}

const labels: Record<V2ProcessType, string> = {
  making: '制作任务冻结计件提成',
  fluffing_bagging: '捏毛装袋任务冻结计件提成',
  packing: '打包任务计件提成',
  shipping: '发货任务计件提成'
}

function formatCents(cents: number): string {
  const amount = Math.abs(cents) / 100
  return `${cents < 0 ? '-' : ''}¥${amount.toFixed(2)}`
}

/**
 * 工序任务的计件费率以任务记录为唯一依据，避免误读为当前商品参数或物料成本。
 */
export function YumiTaskRateSummary({ pieceRateCents, processType }: YumiTaskRateSummaryProps) {
  const isProductCommission = processType === 'making' || processType === 'fluffing_bagging'
  const isPacking = processType === 'packing'

  return (
    <aside aria-label={labels[processType]} className="yumi-task-rate-summary" role="note">
      <strong className="yumi-task-rate-summary__label">{labels[processType]}</strong>
      <span className="yumi-task-rate-summary__value">
        {pieceRateCents === null ? '未设置计件提成' : formatCents(pieceRateCents)}
      </span>
      <p className="yumi-task-rate-summary__description">
        {isProductCommission
          ? '以该任务创建时冻结的费率结算，后续商品改价不影响本任务结算。'
          : isPacking
            ? '商品包装成本属于物料成本，不是打包计件工资。'
            : '如有计件提成，以该任务创建时保存的费率结算。'}
      </p>
    </aside>
  )
}
