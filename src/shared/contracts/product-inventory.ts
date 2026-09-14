import type { BusinessDate, IsoDateTime } from './common'

/** 商品物理加工阶段：已制作待捏毛装袋、已捏毛装袋未缝边、已缝边待打包发货、已打包待发货。 */
export type V2ProductStage = 'made' | 'fluffing_bagging_done' | 'edge_sewing_done' | 'packed'

export type V2ProductInventorySourceType = 'opening' | 'order_allocation' | 'manager_adjustment'

export interface V2ProductStageInventoryEvent {
  id: string
  productId: string
  stage: V2ProductStage
  quantityDelta: number
  sourceType: V2ProductInventorySourceType
  /** 仅投入订单时填写，用于追溯商品存量与订单履约的双边记账。 */
  orderItemId: string | null
  occurredOn: BusinessDate
  note: string | null
  createdAt: IsoDateTime
}

export type V2ProductStageBalances = Record<V2ProductStage, number>

export interface V2ProductInventorySummary {
  productId: string
  stages: V2ProductStageBalances
}

export interface V2ProductOpeningInput {
  productId: string
  stage: V2ProductStage
  quantity: number
  occurredOn: BusinessDate
  note?: string | null
}

export interface V2ProductInventoryAdjustInput {
  productId: string
  stage: V2ProductStage
  /** 非零整数：正数增加、负数减少。 */
  quantityDelta: number
  occurredOn: BusinessDate
  note: string
}

export interface V2ProductInventoryAllocateInput {
  productId: string
  /** 投入使用的商品存量阶段。 */
  stage: V2ProductStage
  orderItemId: string
  quantity: number
  occurredOn: BusinessDate
  note?: string | null
}

export interface V2ProductInventoryAllocationResult {
  summary: V2ProductInventorySummary
  orderItemId: string
  /** 投入后进入订单的目标履约阶段。 */
  targetStage: 'fluffing_bagging' | 'edge_sewing' | 'packing' | 'ready_to_ship'
}
