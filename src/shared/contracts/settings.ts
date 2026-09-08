import type { GluePriceMicroYuanPerGram, IsoDateTime } from './common'

/** 工作室级参数；变更只影响之后新建的订单快照。 */
export interface V2StudioSettings {
  gluePriceMicroYuanPerGram: GluePriceMicroYuanPerGram
  updatedAt: IsoDateTime | null
}

export interface V2StudioSettingsUpdateInput {
  gluePriceMicroYuanPerGram: GluePriceMicroYuanPerGram
}
