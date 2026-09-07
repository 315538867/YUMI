import { randomUUID } from 'node:crypto'
import {
  allocateDeductionsInOccurrenceOrder,
  calculateFluffingDefectDeduction,
  calculateMakingDefectDeduction,
  calculateQualifiedCommissionCents,
  calculateSettlementReferenceWages,
  validateFinalPaidCents
} from '@main/domain/settlement'
import { DomainValidationError } from '@main/domain/errors'
import { SettlementRepository, type SettlementTaskSource } from '@main/repositories/settlement-repository'
import type { V2Database } from '@main/database/v2-connection'
import type {
  V2Worker,
  V2WorkerCreateInput,
  V2WorkerDeductionRecord,
  V2WorkerSettlement,
  V2WorkerSettlementCreateInput,
  V2WorkerSettlementDetail,
  V2WorkerSettlementQuery,
  V2WorkerSettlementDraftUpdateInput,
  V2WorkerSettlementTask,
  V2WorkerWageHistory,
  V2WorkerWageHistoryInput
} from '@shared/contracts/settlements'

interface Clock { createId(): string; now(): string }
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
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new DomainValidationError(`${label}无效`)
  return value
}

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new DomainValidationError(`${label}必须是非负整数`)
  return value
}

function requireNonNegativeCents(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new DomainValidationError(`${label}必须是非负整数分`)
  return value
}

function nullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function productStandardMinutes(source: SettlementTaskSource): number {
  if (!source.productSnapshotJson) throw new DomainValidationError('制作任务缺少产品快照')
  const snapshot = JSON.parse(source.productSnapshotJson) as { standardMakingMinutes?: number }
  if (!Number.isInteger(snapshot.standardMakingMinutes) || snapshot.standardMakingMinutes < 0) {
    throw new DomainValidationError('产品标准制作分钟无效')
  }
  return snapshot.standardMakingMinutes
}

export class SettlementService {
  private readonly repository: SettlementRepository

  constructor(database: V2Database, private readonly clock: Clock = defaultClock) {
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
      const worker = this.repository.createWorkerRecord({ id: this.clock.createId(), name, note: input.note, now })
      this.repository.insertWageHistory({
        id: this.clock.createId(), workerId: worker.id, effectiveOn, hourlyWageCents: input.hourlyWageCents, createdAt: now
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
        id: this.clock.createId(), workerId, effectiveOn, hourlyWageCents: input.hourlyWageCents, createdAt: this.clock.now()
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
    const attendanceMinutes = input.attendanceMinutes === undefined || input.attendanceMinutes === null
      ? null : requireNonNegativeInteger(input.attendanceMinutes, '考勤总分钟')
    const otherAdjustmentCents = input.otherAdjustmentCents ?? 0
    if (!Number.isInteger(otherAdjustmentCents)) throw new DomainValidationError('其他调整必须是整数分')

    return this.repository.transaction(() => {
      this.requireWorker(workerId)
      this.ensureDefectRecords(workerId)
      const sources = this.repository.listEligibleTaskSources(workerId, periodStartOn, periodEndOn)
      if (sources.length === 0) {
        if (this.repository.hasConfirmedSettlementTask(workerId, periodStartOn, periodEndOn)) {
          throw new DomainValidationError('任务已确认结算，不能重复纳入')
        }
        throw new DomainValidationError('结算周期内没有可结算的已确认任务')
      }
      const now = this.clock.now()
      const taskEntries = sources.map((source) => this.toSettlementTask(source, workerId, now))
      const scheduledMinutes = taskEntries.reduce((total, task) => total + task.scheduledMinutes, 0)
      const qualifiedCommissionCents = taskEntries.reduce((total, task) => total + task.qualifiedCommissionCents, 0)
      const hourlyWageCents = this.requireWage(workerId, periodEndOn)
      const eligibleDeductions = this.repository.listOpenDeductions(workerId)
        .filter((deduction) => deduction.occurredOn <= periodEndOn)
      const allocation = this.calculateAllocations(eligibleDeductions, scheduledMinutes, attendanceMinutes, hourlyWageCents, qualifiedCommissionCents, otherAdjustmentCents)
      const wages = calculateSettlementReferenceWages({
        scheduledMinutes, attendanceMinutes: attendanceMinutes ?? 0, hourlyWageCents, qualifiedCommissionCents,
        deductionCents: allocation.appliedDeductionCents, otherAdjustmentCents
      })
      const settlement: V2WorkerSettlement = {
        id: this.clock.createId(), workerId, periodStartOn, periodEndOn, status: 'draft', scheduledMinutes, attendanceMinutes,
        attendanceNote: nullableText(input.attendanceNote), scheduledReferenceWageCents: wages.scheduledReferenceWageCents,
        attendanceReferenceWageCents: wages.attendanceReferenceWageCents, qualifiedCommissionCents,
        currentDeductionCents: eligibleDeductions.filter((deduction) => deduction.occurredOn >= periodStartOn)
          .reduce((total, deduction) => total + deduction.remainingCarryoverCents, 0),
        carriedDeductionCents: eligibleDeductions.filter((deduction) => deduction.occurredOn < periodStartOn)
          .reduce((total, deduction) => total + deduction.remainingCarryoverCents, 0),
        actualDeductionCents: allocation.appliedDeductionCents, continuingCarryoverCents: allocation.carryoverDeductionCents,
        otherAdjustmentCents, finalPaidAmountCents: null, paidOn: null, managerNote: null, financialEntryId: null,
        createdAt: now, updatedAt: now
      }
      this.repository.insertSettlement(settlement)
      taskEntries.forEach((task) => this.repository.insertSettlementTask({ ...task, settlementId: settlement.id }))
      this.repository.replaceDraftAllocations(settlement.id, allocation.allocations.map((item) => ({
        id: this.clock.createId(), settlementId: settlement.id, deductionRecordId: item.deductionRecordId,
        allocatedCents: item.appliedCents, status: 'draft' as const, createdAt: now
      })))
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

  updateDraft(id: string, input: V2WorkerSettlementDraftUpdateInput): V2WorkerSettlementDetail {
    return this.repository.transaction(() => {
      const settlement = this.requireDraft(id)
      const attendanceMinutes = input.attendanceMinutes === undefined ? settlement.attendanceMinutes
        : input.attendanceMinutes === null ? null : requireNonNegativeInteger(input.attendanceMinutes, '考勤总分钟')
      const otherAdjustmentCents = input.otherAdjustmentCents ?? settlement.otherAdjustmentCents
      if (!Number.isInteger(otherAdjustmentCents)) throw new DomainValidationError('其他调整必须是整数分')
      const attendanceNote = input.attendanceNote === undefined ? settlement.attendanceNote : nullableText(input.attendanceNote)
      const finalPaidAmountCents = input.finalPaidAmountCents === undefined ? settlement.finalPaidAmountCents : input.finalPaidAmountCents
      if (finalPaidAmountCents !== null) validateFinalPaidCents(finalPaidAmountCents)
      const paidOn = input.paidOn === undefined ? settlement.paidOn : input.paidOn === null ? null : requireDate(input.paidOn, '实际付款日期')
      const managerNote = input.managerNote === undefined ? settlement.managerNote : nullableText(input.managerNote)
      const hourlyWageCents = this.requireWage(settlement.workerId, settlement.periodEndOn)
      const eligibleDeductions = this.repository.listOpenDeductions(settlement.workerId)
        .filter((deduction) => deduction.occurredOn <= settlement.periodEndOn)
      const allocation = this.calculateAllocations(
        eligibleDeductions, settlement.scheduledMinutes, attendanceMinutes, hourlyWageCents, settlement.qualifiedCommissionCents,
        otherAdjustmentCents, input.actualDeductionCents
      )
      const wages = calculateSettlementReferenceWages({
        scheduledMinutes: settlement.scheduledMinutes, attendanceMinutes: attendanceMinutes ?? 0, hourlyWageCents,
        qualifiedCommissionCents: settlement.qualifiedCommissionCents, deductionCents: allocation.appliedDeductionCents, otherAdjustmentCents
      })
      const updated: V2WorkerSettlement = {
        ...settlement, attendanceMinutes, attendanceNote, otherAdjustmentCents, finalPaidAmountCents, paidOn, managerNote,
        scheduledReferenceWageCents: wages.scheduledReferenceWageCents, attendanceReferenceWageCents: wages.attendanceReferenceWageCents,
        actualDeductionCents: allocation.appliedDeductionCents, continuingCarryoverCents: allocation.carryoverDeductionCents, updatedAt: this.clock.now()
      }
      this.repository.updateSettlement(updated)
      this.repository.replaceDraftAllocations(updated.id, allocation.allocations.map((item) => ({
        id: this.clock.createId(), settlementId: updated.id, deductionRecordId: item.deductionRecordId,
        allocatedCents: item.appliedCents, status: 'draft' as const, createdAt: updated.updatedAt
      })))
      return this.requireDetail(updated.id)
    })
  }

  confirm(id: string): V2WorkerSettlementDetail {
    return this.repository.transaction(() => {
      const settlement = this.requireDraft(id)
      if (settlement.finalPaidAmountCents === null) throw new DomainValidationError('确认结算前必须填写最终实发金额')
      if (settlement.finalPaidAmountCents <= 0) throw new DomainValidationError('确认结算时最终实发金额必须大于零')
      if (!settlement.paidOn) throw new DomainValidationError('确认结算前必须填写实际付款日期')
      const now = this.clock.now()
      const financialEntryId = this.clock.createId()
      this.repository.insertWagePaymentFinancialEntry({
        id: financialEntryId, amountCents: settlement.finalPaidAmountCents, occurredOn: settlement.paidOn,
        note: settlement.managerNote, createdAt: now
      })
      const confirmed = {
        ...settlement, status: 'confirmed' as const, financialEntryId, updatedAt: now
      }
      this.repository.updateSettlement(confirmed)
      this.repository.confirmSettlementArtifacts(confirmed.id, confirmed.updatedAt)
      return this.requireDetail(confirmed.id)
    })
  }

  private ensureDefectRecords(workerId: string): void {
    this.repository.listUnrecordedDefectSources(workerId).forEach((source) => {
      if (source.processType !== 'making' && source.processType !== 'fluffing_bagging') return
      const hourlyWageCents = source.hourlyWageCents ?? this.requireWage(workerId, source.assignedOn)
      const pieceRateCents = source.pieceRateCents ?? 0
      const deduction = source.processType === 'making'
        ? calculateMakingDefectDeduction({
          unqualifiedQuantity: source.unqualifiedQuantity, pieceRateCents, hourlyWageCents,
          standardMakingMinutes: productStandardMinutes(source), glueDeductionCentsPerUnit: source.glueCostCents ?? 0
        })
        : calculateFluffingDefectDeduction({
          unqualifiedQuantity: source.unqualifiedQuantity, plannedQuantity: source.plannedQuantity ?? 0,
          plannedMinutes: source.plannedMinutes, pieceRateCents, hourlyWageCents
        })
      const now = this.clock.now()
      this.repository.insertDeduction({
        id: this.clock.createId(), workerId, workAssignmentId: source.workAssignmentId, processTaskId: source.processTaskId,
        processResultId: source.processResultId, qualityInspectionId: source.qualityInspectionId, orderId: source.orderId,
        orderItemId: source.orderItemId, unqualifiedQuantity: source.unqualifiedQuantity,
        commissionDeductionCents: deduction.commissionDeductionCents, wageDeductionCents: deduction.hourlyWageDeductionCents,
        glueDeductionCents: deduction.glueDeductionCents, totalDeductionCents: deduction.totalDeductionCents,
        deductedCents: 0, remainingCarryoverCents: deduction.totalDeductionCents, status: 'pending',
        occurredOn: source.inspectedOn!, createdAt: now, updatedAt: now
      })
    })
  }

  private toSettlementTask(source: SettlementTaskSource, workerId: string, now: string): V2WorkerSettlementTask {
    const qualifiedCommissionCents = calculateQualifiedCommissionCents([{
      processType: source.processType, qualifiedQuantity: source.qualifiedQuantity, pieceRateCents: source.pieceRateCents ?? 0
    }])
    // 保证历史任务至少存在可用时薪；当前结算的统一参考时薪取结算结束日生效记录。
    if (source.hourlyWageCents === null) this.requireWage(workerId, source.assignedOn)
    return {
      id: this.clock.createId(), processTaskId: source.processTaskId, scheduledMinutes: source.plannedMinutes + source.extraMinutes,
      qualifiedQuantity: source.qualifiedQuantity, qualifiedCommissionCents, status: 'draft', createdAt: now
    }
  }

  private calculateAllocations(
    deductions: V2WorkerDeductionRecord[], scheduledMinutes: number, attendanceMinutes: number | null,
    hourlyWageCents: number, qualifiedCommissionCents: number, otherAdjustmentCents: number, requestedDeductionCents?: number
  ) {
    const beforeDeduction = calculateSettlementReferenceWages({
      scheduledMinutes, attendanceMinutes: attendanceMinutes ?? 0, hourlyWageCents, qualifiedCommissionCents,
      deductionCents: 0, otherAdjustmentCents
    }).scheduledPreDeductionWageCents
    const defaultAllocation = allocateDeductionsInOccurrenceOrder({
      scheduledPreDeductionWageCents: beforeDeduction,
      deductions: deductions.map((deduction) => ({ id: deduction.id, occurredAt: deduction.createdAt, remainingCents: deduction.remainingCarryoverCents }))
    })
    if (requestedDeductionCents === undefined) return defaultAllocation
    requireNonNegativeCents(requestedDeductionCents, '本期实际扣除金额')
    if (requestedDeductionCents > defaultAllocation.totalRemainingDeductionCents) {
      throw new DomainValidationError('本期实际扣除金额不能超过待抵扣总额')
    }
    if (requestedDeductionCents > beforeDeduction) {
      throw new DomainValidationError('本期实际扣除金额不能超过排班口径扣前应发')
    }
    return allocateDeductionsInOccurrenceOrder({
      scheduledPreDeductionWageCents: requestedDeductionCents,
      deductions: deductions.map((deduction) => ({ id: deduction.id, occurredAt: deduction.createdAt, remainingCents: deduction.remainingCarryoverCents }))
    })
  }

  private requireWorker(id: string): V2Worker {
    const worker = this.repository.getWorker(id)
    if (!worker) throw new DomainValidationError('兼职人员不存在')
    return worker
  }

  private requireWage(workerId: string, effectiveOn: string): number {
    const wage = this.repository.getHourlyWage(workerId, effectiveOn)
    if (wage === null) throw new DomainValidationError('兼职人员在该日期尚未设置生效时薪')
    return wage
  }

  private requireDraft(id: string): V2WorkerSettlement {
    const settlement = this.repository.getSettlement(requireText(id, '结算单标识'))
    if (!settlement) throw new DomainValidationError('工资结算单不存在')
    if (settlement.status !== 'draft') throw new DomainValidationError('只有草稿结算单可以编辑或确认')
    return settlement
  }

  private requireDetail(id: string): V2WorkerSettlementDetail {
    const detail = this.getSettlement(id)
    if (!detail) throw new DomainValidationError('工资结算单不存在')
    return detail
  }

  private toDetail(settlement: V2WorkerSettlement): V2WorkerSettlementDetail {
    return {
      ...settlement, tasks: this.repository.listSettlementTasks(settlement.id), deductions: this.repository.listSettlementDeductions(settlement.id),
      deductionAllocations: this.repository.listSettlementAllocations(settlement.id)
    }
  }
}
