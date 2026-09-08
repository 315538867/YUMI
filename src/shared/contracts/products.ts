import type { Cents, GluePriceMicroYuanPerGram, IsoDateTime, WeightMilligrams } from './common'

export interface V2Product {
  id: string
  name: string
  code: string | null
  category: string | null
  basePriceCents: Cents
  materialCostCents: Cents
  packagingCostCents: Cents
  accessoryCostCents: Cents
  replacementBagCostCents: Cents
  edgeCostCents: Cents
  standardMakingMinutes: number
  makingCommissionCents: Cents
  makingGlueCostCents: Cents
  /** 工作室统一胶水单价以订单快照冻结；商品仅维护用量。 */
  glueWeightMilligrams: WeightMilligrams
  enabled: boolean
  imageAttachmentId: string | null
  notes: string | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface V2ProductInput {
  name: string
  code?: string | null
  category?: string | null
  basePriceCents: Cents
  /** 仅用于兼容旧数据导入；新建商品不再填写人工材料成本。 */
  materialCostCents?: Cents
  packagingCostCents: Cents
  accessoryCostCents: Cents
  replacementBagCostCents: Cents
  edgeCostCents: Cents
  standardMakingMinutes: number
  makingCommissionCents: Cents
  /** 仅用于兼容旧数据导入；新建商品不再填写人工胶水成本。 */
  makingGlueCostCents?: Cents
  glueWeightMilligrams?: WeightMilligrams
  imageAttachmentId?: string | null
  notes?: string | null
}

export interface V2ProductUpdateInput extends V2ProductInput {
  id: string
  enabled?: boolean
}

/** 下单时冻结，后续修改商品默认参数不得覆盖。 */
export interface V2ProductOrderSnapshot {
  productId: string | null
  name: string
  code: string | null
  category: string | null
  basePriceCents: Cents
  materialCostCents: Cents
  packagingCostCents: Cents
  accessoryCostCents: Cents
  replacementBagCostCents: Cents
  edgeCostCents: Cents
  standardMakingMinutes: number
  makingCommissionCents: Cents
  makingGlueCostCents: Cents
  /** 缺失时代表升级前的旧订单快照，按旧人工材料成本读取。 */
  glueWeightMilligrams?: WeightMilligrams
  gluePriceMicroYuanPerGram?: GluePriceMicroYuanPerGram
}
