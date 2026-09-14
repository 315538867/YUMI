import type { Cents, IsoDateTime, MaterialPriceMicroYuanPerGram } from './common'

/** 工作室级参数；变更只影响之后新建的订单快照。 */
export interface V2StudioSettings {
  /** 全局材料克单价，只在设置中维护，商品页面只读展示。 */
  materialPriceMicroYuanPerGram: MaterialPriceMicroYuanPerGram
  orderReservedDays: number
  /** 三道计时工序的预计基准时薪：只用于商品预计盈利和负责人核对，不代表员工实际工资。 */
  fluffingBaggingExpectedHourlyWageCents: Cents
  edgeSewingExpectedHourlyWageCents: Cents
  packingExpectedHourlyWageCents: Cents
  updatedAt: IsoDateTime | null
}

export interface V2StudioSettingsUpdateInput {
  materialPriceMicroYuanPerGram: MaterialPriceMicroYuanPerGram
  orderReservedDays?: number
  fluffingBaggingExpectedHourlyWageCents?: Cents
  edgeSewingExpectedHourlyWageCents?: Cents
  packingExpectedHourlyWageCents?: Cents
}
