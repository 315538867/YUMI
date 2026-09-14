import type { Cents, IsoDateTime, MaterialPriceMicroYuanPerGram, WeightMilligrams } from './common'
import type { ProductProfitCalculation } from '../calculations/product-profit'

export interface V2Product {
  id: string
  name: string
  /** 由系统在创建时分配的 SP 序号编码，创建后不可修改。 */
  code: string
  basePriceCents: Cents
  packagingCostCents: Cents
  accessoryCostCents: Cents
  replacementBagCostCents: Cents
  /** 缝边耗材成本，只进入缝边预计增加成本。 */
  edgeConsumableCostCents: Cents
  /** 负责人手工录入的单件固定成本（房租、水电、网络等预计分摊）。 */
  fixedCostCents: Cents
  /** 单件材料重量，既是实际材料使用量也是成品材料重量。 */
  unitWeightMilligrams: WeightMilligrams
  /** 预计单件制作时长；只服务排产和产能参考，不进入制作工资。 */
  standardMakingMinutes: number
  expectedFluffingBaggingMinutes: number
  expectedEdgeSewingMinutes: number
  expectedPackingMinutes: number
  makingCommissionCents: Cents
  fluffingBaggingCommissionCents: Cents
  edgeSewingCommissionCents: Cents
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
  basePriceCents: Cents
  packagingCostCents: Cents
  accessoryCostCents: Cents
  replacementBagCostCents: Cents
  edgeConsumableCostCents: Cents
  /** 缺省视为 0；新建/编辑界面应始终显式提交。 */
  fixedCostCents?: Cents
  unitWeightMilligrams?: WeightMilligrams
  standardMakingMinutes: number
  expectedFluffingBaggingMinutes?: number
  expectedEdgeSewingMinutes?: number
  expectedPackingMinutes?: number
  makingCommissionCents: Cents
  /** 缺省视为 0；新建/编辑界面应始终显式提交。 */
  fluffingBaggingCommissionCents?: Cents
  edgeSewingCommissionCents?: Cents
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

/** 下单时冻结，后续修改商品或全局设置不得覆盖。 */
export interface V2ProductOrderSnapshot {
  productId: string | null
  name: string
  code: string
  basePriceCents: Cents
  packagingCostCents: Cents
  accessoryCostCents: Cents
  replacementBagCostCents: Cents
  edgeConsumableCostCents: Cents
  fixedCostCents: Cents
  unitWeightMilligrams: WeightMilligrams
  materialPriceMicroYuanPerGram: MaterialPriceMicroYuanPerGram
  standardMakingMinutes: number
  expectedFluffingBaggingMinutes: number
  expectedEdgeSewingMinutes: number
  expectedPackingMinutes: number
  makingCommissionCents: Cents
  fluffingBaggingCommissionCents: Cents
  edgeSewingCommissionCents: Cents
  moldCount: number
  outputPerMoldPerBatch: number
  maxBatchesPerDay: number
  dailyCapacity: number
  imageAttachmentId?: string | null
  notes?: string | null
}

/** 主进程基于当前商品与全局设置计算的权威预计盈利。 */
export type V2ProductExpectedProfit = ProductProfitCalculation
