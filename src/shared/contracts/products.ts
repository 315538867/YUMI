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
  internalEdgeCostCents: Cents
  standardMakingMinutes: number
  makingCommissionCents: Cents
  /** 每件捏毛装袋任务默认冻结的计件提成。 */
  fluffingBaggingCommissionCents: Cents
  makingGlueCostCents: Cents
  /** 工作室统一胶水单价以订单快照冻结；商品仅维护用量。 */
  glueWeightMilligrams: WeightMilligrams
  /** 单件材料重量，按毫克保存。 */
  unitWeightMilligrams: WeightMilligrams
  /** 损耗率按基点保存：100 = 1%，10000 = 100%。 */
  materialLossRateBasisPoints: number
  moldCount: number
  outputPerMoldPerBatch: number
  maxBatchesPerDay: number
  dailyCapacity: number
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
  internalEdgeCostCents: Cents
  standardMakingMinutes: number
  makingCommissionCents: Cents
  /** 升级兼容缺省为 0；新建/编辑界面应始终显式提交。 */
  fluffingBaggingCommissionCents?: Cents
  /** 仅用于兼容旧数据导入；新建商品不再填写人工胶水成本。 */
  makingGlueCostCents?: Cents
  glueWeightMilligrams?: WeightMilligrams
  unitWeightMilligrams?: WeightMilligrams
  materialLossRateBasisPoints?: number
  moldCount?: number
  outputPerMoldPerBatch?: number
  maxBatchesPerDay?: number
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
  internalEdgeCostCents: Cents
  standardMakingMinutes: number
  makingCommissionCents: Cents
  /** 缺失时代表升级前的旧订单快照，读取为 0，不能从当前商品回填。 */
  fluffingBaggingCommissionCents?: Cents
  makingGlueCostCents: Cents
  /** 缺失时代表升级前的旧订单快照，按旧人工材料成本读取。 */
  glueWeightMilligrams?: WeightMilligrams
  gluePriceMicroYuanPerGram?: GluePriceMicroYuanPerGram
  /** 订单表/发货清单使用下单时冻结的商品资料，旧订单允许缺失。 */
  imageAttachmentId?: string | null
  notes?: string | null
  /** 商品材料与模具参数在下单时冻结；旧订单允许缺失。 */
  unitWeightMilligrams?: WeightMilligrams | null
  materialLossRateBasisPoints?: number | null
  moldCount?: number | null
  outputPerMoldPerBatch?: number | null
  maxBatchesPerDay?: number | null
  dailyCapacity?: number | null
}
