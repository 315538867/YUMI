import type { Cents, V2ProductOrderSnapshot } from '@shared/contracts/index'
import { calculateGlueCostCents } from '@shared/money'
import { DomainValidationError } from './errors'

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainValidationError(`${label}必须是非负整数`)
  }
  return value
}

/**
 * 新订单以冻结的胶水单价和克重按整批数量计算，避免把单件成本先四舍五入造成累计误差。
 * 旧快照缺少新字段时，保持原来的人工材料成本口径，确保历史报表不被改写。
 */
export function calculateProductSnapshotCostCents(
  snapshot: V2ProductOrderSnapshot,
  quantity: number
): Cents {
  requireNonNegativeInteger(quantity, '商品数量')
  const otherCostCents = (
    snapshot.packagingCostCents
    + snapshot.accessoryCostCents
    + snapshot.replacementBagCostCents
    + snapshot.edgeCostCents
  ) * quantity

  const hasGlueFormula = snapshot.glueWeightMilligrams !== undefined
    && snapshot.gluePriceMicroYuanPerGram !== undefined

  const materialOrGlueCostCents = hasGlueFormula
    ? calculateGlueCostCents({
      gluePriceMicroYuanPerGram: snapshot.gluePriceMicroYuanPerGram,
      glueWeightMilligrams: snapshot.glueWeightMilligrams,
      quantity
    })
    : snapshot.materialCostCents * quantity

  return materialOrGlueCostCents + otherCostCents
}
