import { randomUUID } from 'node:crypto'
import type { V2Database } from '@main/database/v2-connection'
import {
  createAfterSalesAccountingSnapshot,
  validateAfterSalesCase,
  validateAfterSalesChargeLink
} from '@main/domain/after-sales'
import { DomainValidationError } from '@main/domain/errors'
import {
  AfterSalesRepository,
  type AfterSalesCaseWrite
} from '@main/repositories/after-sales-repository'
import type {
  V2AfterSalesCase,
  V2AfterSalesCaseCreateInput,
  V2AfterSalesCaseQuery,
  V2AfterSalesCaseUpdateInput,
  V2AfterSalesChargeLink
} from '@shared/contracts/index'

interface AfterSalesClock {
  createId(): string
  now(): string
}

const defaultClock: AfterSalesClock = { createId: randomUUID, now: () => new Date().toISOString() }

function requireText(value: string | null | undefined, label: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new DomainValidationError(`${label}不能为空`)
  return normalized
}

function requireId(value: string, label: string): string {
  return requireText(value, label)
}

function nullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized || null
}

export class AfterSalesService {
  private readonly repository: AfterSalesRepository

  constructor(
    database: V2Database,
    private readonly clock: AfterSalesClock = defaultClock
  ) {
    this.repository = new AfterSalesRepository(database)
  }

  listCases(query?: V2AfterSalesCaseQuery): V2AfterSalesCase[] {
    return this.repository.listCases(query)
  }

  getCase(id: string): V2AfterSalesCase | null {
    return this.repository.getCase(requireId(id, '售后单标识'))
  }

  createCase(input: V2AfterSalesCaseCreateInput): V2AfterSalesCase {
    return this.repository.transaction(() => {
      const normalized = this.normalizeCreate(input)
      this.requireOrder(normalized.orderId)
      this.ensureShipmentBelongsToOrder(normalized.shipmentId, normalized.orderId)
      createAfterSalesAccountingSnapshot(normalized)
      const now = this.clock.now()
      const record: AfterSalesCaseWrite = {
        id: this.clock.createId(),
        ...normalized,
        createdAt: now,
        updatedAt: now
      }
      this.repository.insertCase(record)
      const result = this.requireCase(record.id)
      this.audit('after_sales.case_created', 'after_sales_case', result.id, undefined, result, now)
      return result
    })
  }

  updateCase(id: string, input: V2AfterSalesCaseUpdateInput): V2AfterSalesCase {
    return this.repository.transaction(() => {
      const before = this.requireCase(id)
      const normalized = {
        orderId: before.orderId,
        shipmentId: input.shipmentId === undefined ? before.shipmentId : input.shipmentId,
        occurredOn: input.occurredOn ?? before.occurredOn,
        reasonDescription: input.reasonDescription ?? before.reasonDescription,
        customerRequest:
          input.customerRequest === undefined
            ? before.customerRequest
            : nullableText(input.customerRequest),
        responsibilityDescription:
          input.responsibilityDescription ?? before.responsibilityDescription,
        handlingDescription: input.handlingDescription ?? before.handlingDescription,
        status: input.status ?? before.status,
        customerChargeNote:
          input.customerChargeNote === undefined
            ? before.customerChargeNote
            : nullableText(input.customerChargeNote),
        accountingCostCents: input.accountingCostCents ?? before.accountingCostCents,
        note: input.note === undefined ? before.note : nullableText(input.note)
      }
      validateAfterSalesCase(normalized)
      this.ensureShipmentBelongsToOrder(normalized.shipmentId, normalized.orderId)
      createAfterSalesAccountingSnapshot(normalized)
      const record: AfterSalesCaseWrite = {
        id: before.id,
        ...normalized,
        createdAt: before.createdAt,
        updatedAt: this.clock.now()
      }
      this.repository.updateCase(record)
      const result = this.requireCase(record.id)
      this.audit(
        'after_sales.case_updated',
        'after_sales_case',
        result.id,
        before,
        result,
        result.updatedAt
      )
      return result
    })
  }

  linkCharge(afterSalesCaseId: string, financialEntryId: string): V2AfterSalesChargeLink {
    return this.repository.transaction(() => {
      const caseRecord = this.requireCase(afterSalesCaseId)
      const financialEntry = this.repository.getFinancialEntryForLink(
        requireId(financialEntryId, '售后收费流水标识')
      )
      if (!financialEntry) throw new DomainValidationError('售后收费流水不存在')
      validateAfterSalesChargeLink({
        afterSalesOrderId: caseRecord.orderId,
        financialEntry: {
          orderId: financialEntry.orderId,
          sourceType: financialEntry.sourceType,
          direction: financialEntry.direction,
          businessType: financialEntry.businessType
        }
      })
      const link: V2AfterSalesChargeLink = {
        afterSalesCaseId: caseRecord.id,
        financialEntryId: financialEntry.id,
        createdAt: this.clock.now()
      }
      this.repository.insertChargeLink(link)
      this.audit(
        'after_sales.charge_linked',
        'after_sales_case',
        caseRecord.id,
        undefined,
        link,
        link.createdAt,
        {
          financialEntryId: link.financialEntryId
        }
      )
      return link
    })
  }

  private normalizeCreate(input: V2AfterSalesCaseCreateInput) {
    const normalized = {
      orderId: requireId(input.orderId, '订单标识'),
      shipmentId: input.shipmentId ?? null,
      occurredOn: input.occurredOn,
      reasonDescription: input.reasonDescription,
      customerRequest: nullableText(input.customerRequest),
      responsibilityDescription: input.responsibilityDescription,
      handlingDescription: input.handlingDescription,
      status: input.status,
      customerChargeNote: nullableText(input.customerChargeNote),
      accountingCostCents: input.accountingCostCents,
      note: nullableText(input.note)
    }
    validateAfterSalesCase(normalized)
    return normalized
  }

  private requireOrder(orderId: string): void {
    if (!this.repository.hasOrder(orderId)) throw new DomainValidationError('订单不存在')
  }

  private ensureShipmentBelongsToOrder(shipmentId: string | null, orderId: string): void {
    if (
      shipmentId !== null &&
      !this.repository.shipmentBelongsToOrder(requireId(shipmentId, '发货批次标识'), orderId)
    ) {
      throw new DomainValidationError('发货批次不存在或不属于当前订单')
    }
  }

  private requireCase(id: string): V2AfterSalesCase {
    const record = this.repository.getCase(requireId(id, '售后单标识'))
    if (!record) throw new DomainValidationError('售后单不存在')
    return record
  }

  private audit(
    action: string,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
    createdAt: string,
    metadata?: unknown
  ): void {
    this.repository.insertAudit({
      id: this.clock.createId(),
      action,
      entityType,
      entityId,
      before,
      after,
      metadata,
      createdAt
    })
  }
}
