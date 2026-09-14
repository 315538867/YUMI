import { randomUUID } from 'node:crypto'
import {
  allocateDeductionsInOccurrenceOrder,
  calculateMakingMaterialDeductionCents,
  calculatePreDeductionWageCents,
  calculateQualifiedCommissionCents,
  calculateTimedWageCents,
  calculateWorkTimeAdjustmentCents,
  validateFinalPaidCents
} from '@main/domain/settlement'
import { DomainValidationError } from '@main/domain/errors'
import {
  SettlementRepository,
  type MakingSourceRow,
  type TimedReviewRow
} from '@main/repositories/settlement-repository'
import type { V2Database } from '@main/database/v2-connection'
import type {
  V2Worker,
  V2WorkerCreateInput,
  V2WorkerDeductionRecord,
  V2WorkerRefundQuery,
  V2WorkerRefundRecord,
  V2WorkerRefundResolveInput,
  V2WorkerSettlement,
  V2WorkerSettlementCreateInput,
  V2WorkerSettlementDetail,
  V2WorkerSettlementDraftUpdateInput,
  V2WorkerSettlementMakingSource,
  V2WorkerSettlementQuery,
  V2WorkerSettlementTimedSource,
  V2WorkerSettlementWorkTimeAdjustmentInput,
  V2WorkerWageHistory,
  V2WorkerWageHistoryInput
} from '@shared/contracts/settlements'

interface Clock {
  createId(): string
  now(): string
}
const defaultClock: Clock = { createId: randomUUID, now: () => new Date().toISOString() }
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function requireText(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized) throw new DomainValidationError(`${label}不能为空`)
  return normalized
}

function requireDate(value: string, label: string): string {
  if (!DATE_PATTERN.test(value)) throw new DomainValidationError(`${label}格式必须为 YYYY-MM-DD`)
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new DomainValidationError(`${label}无效`)
  return value
}

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0)
    throw new DomainValidationError(`${label}必须是非负整数`)
  return value
}

function requireNonNegativeCents(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0)
    throw new DomainValidationError(`${label}必须是非负整数分`)
  return value
}

function requirePositiveCents(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0)
    throw new DomainValidationError(`${label}必须是正整数分`)
  return value
}

function nullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

/**
 * 兼职工资结算：只聚合可追溯的新事实。
 * 制作按合格数量计提成并按不合格数量扣冻结材料成本且不含时薪；捏毛装袋与缝边按已确认
 * 工时计个人时薪并加完成数量提成；打包发货只按已确认工时计个人时薪。
 */
export class SettlementService {
  private readonly repository: SettlementRepository

  constructor(
    database: V2Database,
    private readonly clock: Clock = defaultClock
  ) {
    this.repository = new SettlementRepository(database)
  }

  listWorkers(): V2Worker[] {
    return this.repository.listWorkers()
  }

  listWageHistory(workerId: string): V2WorkerWageHistory[] {
    this.requireWorker(requireText(workerId, '兼职人员标识'))
    return this.repository.listWageHistory(workerId)
  }

  createWorker(input: V2WorkerCreateInput): V2Worker {
    const name = requireText(input.name, '兼职人员姓名')
    const effectiveOn = requireDate(input.effectiveOn, '时薪生效日期')
    requireNonNegativeCents(input.hourlyWageCents, '时薪')
    return this.repository.transaction(() => {
      const now = this.clock.now()
      const worker = this.repository.createWorkerRecord({
        id: this.clock.createId(),
        name,
        note: input.note,
        now
      })
      this.repository.insertWageHistory({
        id: this.clock.createId(),
        workerId: worker.id,
        effectiveOn,
        hourlyWageCents: input.hourlyWageCents,
        createdAt: now
      })
      return worker
    })
  }

  recordWageHistory(input: V2WorkerWageHistoryInput): V2WorkerWageHistory {
    const workerId = requireText(input.workerId, '兼职人员标识')
    const effectiveOn = requireDate(input.effectiveOn, '时薪生效日期')
    requireNonNegativeCents(input.hourlyWageCents, '时薪')
    return this.repository.transaction(() => {
      this.requireWorker(workerId)
      const wage: V2WorkerWageHistory = {
        id: this.clock.createId(),
        workerId,
        effectiveOn,
        hourlyWageCents: input.hourlyWageCents,
        createdAt: this.clock.now()
      }
      this.repository.insertWageHistory(wage)
      return wage
    })
  }

  createDraft(input: V2WorkerSettlementCreateInput): V2WorkerSettlementDetail {
    const workerId = requireText(input.workerId, '兼职人员标识')
    const periodStartOn = requireDate(input.periodStartOn, '结算开始日期')
    const periodEndOn = requireDate(input.periodEndOn, '结算结束日期')
    if (periodEndOn < periodStartOn) throw new DomainValidationError('结算结束日期不能早于开始日期')
    const otherAdjustmentCents = input.otherAdjustmentCents ?? 0
    if (!Number.isInteger(otherAdjustmentCents))
      throw new DomainValidationError('其他调整必须是整数分')

    return this.repository.transaction(() => {
      this.requireWorker(workerId)
      this.ensureDefectRecords(workerId)
      const makingSources = this.repository.listEligibleMakingSources(
        workerId,
        periodStartOn,
        periodEndOn
      )
      const timedReviews = this.repository.listEligibleTimedReviews(
        workerId,
        periodStartOn,
        periodEndOn
      )
      if (makingSources.length === 0 && timedReviews.length === 0) {
        if (
          this.repository.hasConfirmedMakingSource(workerId, periodStartOn, periodEndOn) ||
          this.repository.hasConfirmedTimedSource(workerId, periodStartOn, periodEndOn)
        ) {
          throw new DomainValidationError('该期间的制作结果或工时已确认结算，不能重复纳入')
        }
        throw new DomainValidationError('结算周期内没有可结算的已确认制作结果或工时核算')
      }

      const now = this.clock.now()
      const makingEntries = makingSources.map((source) => this.toMakingSource(source, now))
      const timedEntries = timedReviews.map((review) => this.toTimedSource(review, now))
      const timedWageCents = timedEntries.reduce((total, entry) => total + entry.timedWageCents, 0)
      const commissionCents =
        makingEntries.reduce((total, entry) => total + entry.qualifiedCommissionCents, 0) +
        timedEntries.reduce((total, entry) => total + entry.commissionCents, 0)
      const materialDeductionCents = makingEntries.reduce(
        (total, entry) => total + entry.materialDeductionCents,
        0
      )
      const preDeductionWageCents = calculatePreDeductionWageCents({
        timedWageCents,
        commissionCents,
        adjustmentCents: 0,
        otherAdjustmentCents
      })
      const eligibleDeductions = this.repository
        .listOpenDeductions(workerId)
        .filter((deduction) => deduction.occurredOn <= periodEndOn)
      const allocation = this.calculateAllocations(eligibleDeductions, preDeductionWageCents)

      const settlement: V2WorkerSettlement = {
        id: this.clock.createId(),
        workerId,
        periodStartOn,
        periodEndOn,
        status: 'draft',
        timedWageCents,
        commissionCents,
        materialDeductionCents,
        adjustmentCents: 0,
        otherAdjustmentCents,
        candidateWageCents: Math.max(0, preDeductionWageCents - allocation.appliedDeductionCents),
        currentDeductionCents: eligibleDeductions
          .filter((deduction) => deduction.occurredOn >= periodStartOn)
          .reduce((total, deduction) => total + deduction.remainingCarryoverCents, 0),
        carriedDeductionCents: eligibleDeductions
          .filter((deduction) => deduction.occurredOn < periodStartOn)
          .reduce((total, deduction) => total + deduction.remainingCarryoverCents, 0),
        actualDeductionCents: allocation.appliedDeductionCents,
        continuingCarryoverCents: allocation.carryoverDeductionCents,
        finalPaidAmountCents: null,
        paidOn: null,
        managerNote: null,
        financialEntryId: null,
        createdAt: now,
        updatedAt: now
      }
      this.repository.insertSettlement(settlement)
      makingEntries.forEach((source) =>
        this.repository.insertMakingSource({ ...source, settlementId: settlement.id })
      )
      timedEntries.forEach((source) =>
        this.repository.insertTimedSource({ ...source, settlementId: settlement.id })
      )
      this.repository.replaceDraftAllocations(
        settlement.id,
        allocation.allocations.map((item) => ({
          id: this.clock.createId(),
          settlementId: settlement.id,
          deductionRecordId: item.deductionRecordId,
          allocatedCents: item.appliedCents,
          status: 'draft' as const,
          createdAt: now
        }))
      )
      return this.requireDetail(settlement.id)
    })
  }

  listSettlements(query: V2WorkerSettlementQuery = {}): V2WorkerSettlementDetail[] {
    if (query.workerId) this.requireWorker(requireText(query.workerId, '兼职人员标识'))
    if (query.periodStartOn) requireDate(query.periodStartOn, '结算开始日期')
    if (query.periodEndOn) requireDate(query.periodEndOn, '结算结束日期')
    if (query.periodStartOn && query.periodEndOn && query.periodEndOn < query.periodStartOn) {
      throw new DomainValidationError('结算结束日期不能早于开始日期')
    }
    return this.repository.listSettlements(query).map((settlement) => this.toDetail(settlement))
  }

  getSettlement(id: string): V2WorkerSettlementDetail | null {
    const settlement = this.repository.getSettlement(requireText(id, '结算单标识'))
    return settlement ? this.toDetail(settlement) : null
  }

  listRefunds(query: V2WorkerRefundQuery = {}): V2WorkerRefundRecord[] {
    if (query.workerId) this.requireWorker(requireText(query.workerId, '兼职人员标识'))
    return this.repository.listRefunds(query)
  }

  listPendingRefunds(workerId?: string): V2WorkerRefundRecord[] {
    return this.listRefunds({ workerId, status: 'pending' })
  }

  resolveRefund(id: string, input: V2WorkerRefundResolveInput): V2WorkerRefundRecord {
    const refundId = requireText(id, '待退款记录标识')
    const actualRefundCents = requirePositiveCents(input.actualRefundCents, '实际退款金额')
    const refundedOn = requireDate(input.refundedOn, '退款处理日期')
    const managerNote = nullableText(input.managerNote)
    return this.repository.transaction(() => {
      const refund = this.repository.getRefund(refundId)
      if (!refund) throw new DomainValidationError('待退款记录不存在')
      if (refund.status !== 'pending') throw new DomainValidationError('只有待退款记录可以处理')
      if (actualRefundCents > refund.materialRefundCents) {
        throw new DomainValidationError('实际退款金额不能超过待退款金额')
      }
      const updated: V2WorkerRefundRecord = {
        ...refund,
        actualRefundCents,
        refundedOn,
        managerNote,
        status: 'refunded',
        updatedAt: this.clock.now()
      }
      this.repository.updateRefund(updated)
      return updated
    })
  }

  /**
   * 已结算工时差异：在后续草稿结算中关联原工时与原结算建立正负调整，
   * 使用原工时冻结的个人时薪计算，不改变原结算的历史实发与履约完成数量。
   */
  addWorkTimeAdjustment(
    settlementId: string,
    input: V2WorkerSettlementWorkTimeAdjustmentInput
  ): V2WorkerSettlementDetail {
    const reviewId = requireText(input.workTimeReviewId, '工时核算标识')
    const correctedMinutes = requireNonNegativeInteger(input.correctedMinutes, '更正核算分钟')
    const reason = requireText(input.reason, '更正原因')
    const note = nullableText(input.note)
    return this.repository.transaction(() => {
      const settlement = this.requireDraft(settlementId)
      const review = this.repository.getReviewForAdjustment(reviewId)
      if (!review) throw new DomainValidationError('工时核算不存在')
      if (review.workerId !== settlement.workerId) {
        throw new DomainValidationError('工时核算与结算单的兼职人员不一致')
      }
      if (review.status !== 'confirmed') {
        throw new DomainValidationError('只有已确认工时核算可以建立差异调整')
      }
      const originalSettlement = this.repository.getConfirmedSettlementForReview(reviewId)
      if (!originalSettlement) {
        throw new DomainValidationError('该工时尚未进入已确认结算，不能建立差异调整')
      }
      const amountCents = calculateWorkTimeAdjustmentCents({
        originalMinutes: review.approvedMinutes,
        correctedMinutes,
        hourlyWageCentsSnapshot: review.hourlyWageCentsSnapshot
      })
      const now = this.clock.now()
      this.repository.insertAdjustment({
        id: this.clock.createId(),
        settlementId: settlement.id,
        workTimeReviewId: reviewId,
        originalSettlementId: originalSettlement.id,
        processType: review.processType,
        originalMinutes: review.approvedMinutes,
        correctedMinutes,
        hourlyWageCentsSnapshot: review.hourlyWageCentsSnapshot,
        amountCents,
        reason,
        note,
        status: 'draft',
        createdAt: now
      })
      this.recalculateCandidate(settlement, now)
      return this.requireDetail(settlement.id)
    })
  }

  updateDraft(id: string, input: V2WorkerSettlementDraftUpdateInput): V2WorkerSettlementDetail {
    return this.repository.transaction(() => {
      const settlement = this.requireDraft(id)
      const otherAdjustmentCents = input.otherAdjustmentCents ?? settlement.otherAdjustmentCents
      if (!Number.isInteger(otherAdjustmentCents))
        throw new DomainValidationError('其他调整必须是整数分')
      const finalPaidAmountCents =
        input.finalPaidAmountCents === undefined
          ? settlement.finalPaidAmountCents
          : input.finalPaidAmountCents
      if (finalPaidAmountCents !== null) validateFinalPaidCents(finalPaidAmountCents)
      const paidOn =
        input.paidOn === undefined
          ? settlement.paidOn
          : input.paidOn === null
            ? null
            : requireDate(input.paidOn, '实际付款日期')
      const managerNote =
        input.managerNote === undefined ? settlement.managerNote : nullableText(input.managerNote)

      const adjustmentCents = this.repository
        .listAdjustments(settlement.id)
        .reduce((total, adjustment) => total + adjustment.amountCents, 0)
      const preDeductionWageCents = calculatePreDeductionWageCents({
        timedWageCents: settlement.timedWageCents,
        commissionCents: settlement.commissionCents,
        adjustmentCents,
        otherAdjustmentCents
      })
      const eligibleDeductions = this.repository
        .listOpenDeductions(settlement.workerId)
        .filter((deduction) => deduction.occurredOn <= settlement.periodEndOn)
      const allocation = this.calculateAllocations(
        eligibleDeductions,
        preDeductionWageCents,
        input.actualDeductionCents
      )
      const updated: V2WorkerSettlement = {
        ...settlement,
        adjustmentCents,
        otherAdjustmentCents,
        candidateWageCents: Math.max(0, preDeductionWageCents - allocation.appliedDeductionCents),
        finalPaidAmountCents,
        paidOn,
        managerNote,
        actualDeductionCents: allocation.appliedDeductionCents,
        continuingCarryoverCents: allocation.carryoverDeductionCents,
        updatedAt: this.clock.now()
      }
      this.repository.updateSettlement(updated)
      this.repository.replaceDraftAllocations(
        updated.id,
        allocation.allocations.map((item) => ({
          id: this.clock.createId(),
          settlementId: updated.id,
          deductionRecordId: item.deductionRecordId,
          allocatedCents: item.appliedCents,
          status: 'draft' as const,
          createdAt: updated.updatedAt
        }))
      )
      return this.requireDetail(updated.id)
    })
  }

  confirm(id: string): V2WorkerSettlementDetail {
    return this.repository.transaction(() => {
      const settlement = this.requireDraft(id)
      if (settlement.finalPaidAmountCents === null)
        throw new DomainValidationError('确认结算前必须填写最终实发金额')
      if (settlement.finalPaidAmountCents <= 0)
        throw new DomainValidationError('确认结算时最终实发金额必须大于零')
      if (!settlement.paidOn) throw new DomainValidationError('确认结算前必须填写实际付款日期')
      const now = this.clock.now()
      const financialEntryId = this.clock.createId()
      this.repository.insertWagePaymentFinancialEntry({
        id: financialEntryId,
        amountCents: settlement.finalPaidAmountCents,
        occurredOn: settlement.paidOn,
        note: settlement.managerNote,
        createdAt: now
      })
      const confirmed = {
        ...settlement,
        status: 'confirmed' as const,
        financialEntryId,
        updatedAt: now
      }
      this.repository.updateSettlement(confirmed)
      this.repository.confirmSettlementArtifacts(confirmed.id, confirmed.updatedAt)
      return this.requireDetail(confirmed.id)
    })
  }

  private recalculateCandidate(settlement: V2WorkerSettlement, now: string): void {
    const adjustmentCents = this.repository
      .listAdjustments(settlement.id)
      .reduce((total, adjustment) => total + adjustment.amountCents, 0)
    const preDeductionWageCents = calculatePreDeductionWageCents({
      timedWageCents: settlement.timedWageCents,
      commissionCents: settlement.commissionCents,
      adjustmentCents,
      otherAdjustmentCents: settlement.otherAdjustmentCents
    })
    const eligibleDeductions = this.repository
      .listOpenDeductions(settlement.workerId)
      .filter((deduction) => deduction.occurredOn <= settlement.periodEndOn)
    const allocation = this.calculateAllocations(eligibleDeductions, preDeductionWageCents)
    this.repository.updateSettlement({
      ...settlement,
      adjustmentCents,
      candidateWageCents: Math.max(0, preDeductionWageCents - allocation.appliedDeductionCents),
      actualDeductionCents: allocation.appliedDeductionCents,
      continuingCarryoverCents: allocation.carryoverDeductionCents,
      updatedAt: now
    })
    this.repository.replaceDraftAllocations(
      settlement.id,
      allocation.allocations.map((item) => ({
        id: this.clock.createId(),
        settlementId: settlement.id,
        deductionRecordId: item.deductionRecordId,
        allocatedCents: item.appliedCents,
        status: 'draft' as const,
        createdAt: now
      }))
    )
  }

  /** 制作不合格只形成材料成本扣款或待退款，不扣提成、不扣制作时薪。 */
  private ensureDefectRecords(workerId: string): void {
    this.repository.listUnrecordedDefectSources(workerId).forEach((source) => {
      const materialDeductionCents = calculateMakingMaterialDeductionCents({
        unqualifiedQuantity: source.unqualifiedQuantity,
        materialPriceMicroYuanPerGram: source.materialPriceMicroYuanPerGram ?? 0,
        unitWeightMilligrams: source.unitWeightMilligrams ?? 0
      })
      const now = this.clock.now()
      const confirmedSettlement = this.repository.getConfirmedSettlementForInspection(
        source.qualityInspectionId
      )
      if (confirmedSettlement) {
        this.repository.insertRefund({
          id: this.clock.createId(),
          workerId,
          originalSettlementId: confirmedSettlement.id,
          processTaskId: source.processTaskId,
          processResultId: source.processResultId,
          qualityInspectionId: source.qualityInspectionId,
          orderId: source.orderId,
          orderItemId: source.orderItemId,
          unqualifiedQuantity: source.unqualifiedQuantity,
          materialRefundCents: materialDeductionCents,
          actualRefundCents: null,
          refundedOn: null,
          managerNote: null,
          status: 'pending',
          createdAt: now,
          updatedAt: now
        })
        return
      }
      this.repository.insertDeduction({
        id: this.clock.createId(),
        workerId,
        workAssignmentId: source.workAssignmentId,
        processTaskId: source.processTaskId,
        processResultId: source.processResultId,
        qualityInspectionId: source.qualityInspectionId,
        orderId: source.orderId,
        orderItemId: source.orderItemId,
        unqualifiedQuantity: source.unqualifiedQuantity,
        materialDeductionCents,
        totalDeductionCents: materialDeductionCents,
        deductedCents: 0,
        remainingCarryoverCents: materialDeductionCents,
        status: 'pending',
        occurredOn: source.inspectedOn,
        createdAt: now,
        updatedAt: now
      })
    })
  }

  private toMakingSource(source: MakingSourceRow, now: string): V2WorkerSettlementMakingSource {
    const qualifiedCommissionCents = calculateQualifiedCommissionCents([
      {
        processType: 'making',
        qualifiedQuantity: source.qualifiedQuantity,
        pieceRateCents: source.pieceRateCents ?? 0
      }
    ])
    const materialDeductionCents =
      source.unqualifiedQuantity > 0
        ? calculateMakingMaterialDeductionCents({
            unqualifiedQuantity: source.unqualifiedQuantity,
            materialPriceMicroYuanPerGram: source.materialPriceMicroYuanPerGram ?? 0,
            unitWeightMilligrams: source.unitWeightMilligrams ?? 0
          })
        : 0
    return {
      id: this.clock.createId(),
      processTaskId: source.processTaskId,
      qualityInspectionId: source.qualityInspectionId,
      orderId: source.orderId,
      orderItemId: source.orderItemId,
      occurredOn: source.assignedOn,
      qualifiedQuantity: source.qualifiedQuantity,
      unqualifiedQuantity: source.unqualifiedQuantity,
      pieceRateCents: source.pieceRateCents,
      qualifiedCommissionCents,
      materialDeductionCents,
      status: 'draft',
      createdAt: now
    }
  }

  private toTimedSource(review: TimedReviewRow, now: string): V2WorkerSettlementTimedSource {
    const timedWageCents = calculateTimedWageCents({
      minutes: review.approvedMinutes,
      hourlyWageCents: review.hourlyWageCentsSnapshot
    })
    const items = review.items.map((item) => ({
      id: this.clock.createId(),
      processTaskId: item.processTaskId,
      orderItemId: item.orderItemId,
      completedQuantity: item.completedQuantity,
      pieceRateCents: item.pieceRateCents,
      commissionCents: calculateQualifiedCommissionCents([
        {
          processType: review.processType,
          qualifiedQuantity: item.completedQuantity,
          pieceRateCents: item.pieceRateCents ?? 0
        }
      ])
    }))
    return {
      id: this.clock.createId(),
      workTimeReviewId: review.id,
      processType: review.processType,
      occurredOn: review.workedOn,
      approvedMinutes: review.approvedMinutes,
      hourlyWageCentsSnapshot: review.hourlyWageCentsSnapshot,
      timedWageCents,
      commissionCents: items.reduce((total, item) => total + item.commissionCents, 0),
      status: 'draft',
      items,
      createdAt: now
    }
  }

  private calculateAllocations(
    deductions: V2WorkerDeductionRecord[],
    preDeductionWageCents: number,
    requestedDeductionCents?: number
  ) {
    const defaultAllocation = allocateDeductionsInOccurrenceOrder({
      preDeductionWageCents,
      deductions: deductions.map((deduction) => ({
        id: deduction.id,
        occurredAt: deduction.createdAt,
        remainingCents: deduction.remainingCarryoverCents
      }))
    })
    if (requestedDeductionCents === undefined) return defaultAllocation
    requireNonNegativeCents(requestedDeductionCents, '本期实际扣除金额')
    if (requestedDeductionCents > defaultAllocation.totalRemainingDeductionCents) {
      throw new DomainValidationError('本期实际扣除金额不能超过待抵扣总额')
    }
    if (requestedDeductionCents > preDeductionWageCents) {
      throw new DomainValidationError('本期实际扣除金额不能超过本期扣前应发')
    }
    return allocateDeductionsInOccurrenceOrder({
      preDeductionWageCents: requestedDeductionCents,
      deductions: deductions.map((deduction) => ({
        id: deduction.id,
        occurredAt: deduction.createdAt,
        remainingCents: deduction.remainingCarryoverCents
      }))
    })
  }

  private requireWorker(id: string): V2Worker {
    const worker = this.repository.getWorker(id)
    if (!worker) throw new DomainValidationError('兼职人员不存在')
    return worker
  }

  private requireDraft(id: string): V2WorkerSettlement {
    const settlement = this.repository.getSettlement(requireText(id, '结算单标识'))
    if (!settlement) throw new DomainValidationError('工资结算单不存在')
    if (settlement.status !== 'draft')
      throw new DomainValidationError('只有草稿结算单可以编辑或确认')
    return settlement
  }

  private requireDetail(id: string): V2WorkerSettlementDetail {
    const detail = this.getSettlement(id)
    if (!detail) throw new DomainValidationError('工资结算单不存在')
    return detail
  }

  private toDetail(settlement: V2WorkerSettlement): V2WorkerSettlementDetail {
    return {
      ...settlement,
      makingSources: this.repository.listMakingSources(settlement.id),
      timedSources: this.repository.listTimedSources(settlement.id),
      adjustments: this.repository.listAdjustments(settlement.id),
      deductions: this.repository.listSettlementDeductions(settlement.id),
      deductionAllocations: this.repository.listSettlementAllocations(settlement.id)
    }
  }
}
