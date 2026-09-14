import type { Cents, V2ProductOrderSnapshot } from '@shared/contracts/index'
import { calculateMaterialCostCents } from '@shared/calculations/material-cost'
import { DomainValidationError } from './errors'

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainValidationError(`${label}必须是非负整数`)
  }
  return value
}

/**
 * 新订单以冻结的材料单价与单件材料重量按整批数量计算，避免把单件成本先四舍五入造成累计误差。
 * 本函数只计算可归属到订单商品的材料、包装、配饰、替换袋、固定成本和缝边耗材；
 * 不包含制作/捏毛装袋提成，也不把无法唯一归属的计时工资伪造成订单实际成本。
 */
export function calculateProductSnapshotCostCents(
  snapshot: V2ProductOrderSnapshot,
  quantity: number,
  edgeQuantity = quantity
): Cents {
  requireNonNegativeInteger(quantity, '商品数量')
  requireNonNegativeInteger(edgeQuantity, '缝边数量')
  const otherCostCents =
    (snapshot.packagingCostCents +
      snapshot.accessoryCostCents +
      snapshot.replacementBagCostCents +
      snapshot.fixedCostCents) *
      quantity +
    snapshot.edgeConsumableCostCents * edgeQuantity
  const materialCostCents = calculateMaterialCostCents({
    materialPriceMicroYuanPerGram: snapshot.materialPriceMicroYuanPerGram,
    weightMilligrams: snapshot.unitWeightMilligrams,
    quantity
  })

  return materialCostCents + otherCostCents
}
