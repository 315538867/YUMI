/**
 * 视觉验收夹具的共享上下文与工厂签名（任务 1.6）。
 */
import type { BusinessDate, V2StudioSettings } from '@shared/contracts/index'
import {
  atFixedHour,
  createIdSequence,
  createRandom,
  FIXED_MATERIAL_PRICE_MICRO_YUAN_PER_GRAM,
  FIXED_SEED,
  FIXED_TODAY,
  shiftDate,
  type FixtureIdSequence,
  type FixtureRandom
} from './determinism'

/** 数据集声明的记录数量；换数量必须同步更新 visual-fixtures.manifest.json。 */
export const DECLARED_COUNTS = {
  customers: 12,
  products: 14,
  orders: 16,
  orderFunds: 20,
  shipments: 5,
  workers: 8,
  wageHistory: 10,
  settlements: 6,
  refunds: 4,
  financeCategories: 8,
  advancePayers: 3,
  financialEntries: 24,
  pendingReimbursements: 5,
  workAssignments: 18,
  workTimeReviews: 9,
  workbenchDecision: 6,
  workbenchAdvance: 5
} as const

export type DeclaredCountKey = keyof typeof DECLARED_COUNTS

export type BuildOptions = { seed?: number } & Partial<Record<DeclaredCountKey, number>>

export type FactoryContext = {
  random: FixtureRandom
  nextId: FixtureIdSequence
  settings: V2StudioSettings
  today: BusinessDate
}

export const baseSettings = (): V2StudioSettings => ({
  materialPriceMicroYuanPerGram: FIXED_MATERIAL_PRICE_MICRO_YUAN_PER_GRAM,
  orderReservedDays: 2,
  fluffingBaggingExpectedHourlyWageCents: 2800,
  edgeSewingExpectedHourlyWageCents: 3200,
  packingExpectedHourlyWageCents: 2600,
  updatedAt: atFixedHour(shiftDate(FIXED_TODAY, -14), 9)
})

export const createFactoryContext = (seed: number = FIXED_SEED): FactoryContext => ({
  random: createRandom(seed),
  nextId: createIdSequence(),
  settings: baseSettings(),
  today: FIXED_TODAY
})
