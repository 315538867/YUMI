import type { Cents, V2ProductOrderSnapshot } from '@shared/contracts/index'
import { calculateGlueCostCents } from '@shared/money'
import { DomainValidationError } from './errors'
import { calculateMaterialRequirementMilligrams } from './product-capacity'

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainValidationError(`${label}必须是非负整数`)
  }
  return value
}

/**
 * 新订单以冻结的胶水单价和克重按整批数量计算，避免把单件成本先四舍五入造成累计误差。
 * 旧快照缺少新字段时，保持原来的人工材料成本口径，确保历史报表不被改写。
 * 本函数仅计算商品可归属的材料、包装、配饰、替换袋和缝边内部成本；不包含运费、
 * 制作/捏毛装袋提成，以及不能稳定归属到订单的工资。
 */
export function calculateProductSnapshotCostCents(
  snapshot: V2ProductOrderSnapshot,
  quantity: number,
  edgeQuantity = quantity
): Cents {
  requireNonNegativeInteger(quantity, '商品数量')
  requireNonNegativeInteger(edgeQuantity, '缝边数量')
  // 旧版订单快照使用 edgeCostCents；升级后字段改为 internalEdgeCostCents。
  // 读取历史快照时必须兼容两者，否则 undefined × 0 会传播为 NaN，进而使报表和客户统计白屏。
  const internalEdgeCostCents =
    snapshot.internalEdgeCostCents ??
    (snapshot as V2ProductOrderSnapshot & { edgeCostCents?: Cents }).edgeCostCents ??
    0
  const otherCostCents =
    (snapshot.packagingCostCents + snapshot.accessoryCostCents + snapshot.replacementBagCostCents) *
      quantity +
    internalEdgeCostCents * edgeQuantity

  const hasMaterialFormula =
    snapshot.unitWeightMilligrams !== undefined &&
    snapshot.unitWeightMilligrams > 0 &&
    snapshot.materialLossRateBasisPoints !== undefined &&
    snapshot.materialLossRateBasisPoints !== null &&
    snapshot.gluePriceMicroYuanPerGram !== undefined
  const hasGlueFormula =
    !hasMaterialFormula &&
    snapshot.glueWeightMilligrams !== undefined &&
    snapshot.gluePriceMicroYuanPerGram !== undefined

  const materialOrGlueCostCents = hasMaterialFormula
    ? calculateGlueCostCents({
        gluePriceMicroYuanPerGram: snapshot.gluePriceMicroYuanPerGram,
        glueWeightMilligrams: calculateMaterialRequirementMilligrams({
          quantity,
          unitWeightMilligrams: snapshot.unitWeightMilligrams,
          materialLossRateBasisPoints: snapshot.materialLossRateBasisPoints
        }),
        quantity: 1
      })
    : hasGlueFormula
      ? calculateGlueCostCents({
          gluePriceMicroYuanPerGram: snapshot.gluePriceMicroYuanPerGram,
          glueWeightMilligrams: snapshot.glueWeightMilligrams,
          quantity
        })
      : snapshot.materialCostCents * quantity

  return materialOrGlueCostCents + otherCostCents
}
