import { randomUUID } from 'node:crypto'
import type { V2Database } from '@main/database/v2-connection'
import { createV2Database } from '@main/database/v2-connection'
import { resolveV2StoragePaths, type V2StoragePaths } from '@main/database/v2-storage'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import { V2FulfillmentRepository } from '@main/repositories/fulfillment-repository'
import { V2BackupService } from '@main/services/v2-backup-service'
import { V2OrderService } from '@main/services/v2-order-service'
import { FulfillmentService } from '@main/services/fulfillment-service'
import { SettlementService } from '@main/services/settlement-service'
import { FinanceService } from '@main/services/finance-service'
import { AfterSalesService } from '@main/services/after-sales-service'
import { ReportService } from '@main/services/report-service'
import { V2ReportExportService } from '@main/services/v2-report-export-service'
import { WorkbenchService } from '@main/services/workbench-service'
import { StudioSettingsService } from '@main/services/studio-settings-service'
import type { V2BackupRestoreInput, V2BackupRestoreResult } from '@shared/contracts/index'

interface V2RuntimeReferences {
  database: V2Database
  repository: V2OrderRepository
  orderService: V2OrderService
  studioSettingsService: StudioSettingsService
  workbenchService: WorkbenchService
  fulfillmentService: FulfillmentService
  settlementService: SettlementService
  financeService: FinanceService
  afterSalesService: AfterSalesService
  reportService: ReportService
  reportExportService: V2ReportExportService
  backupService: V2BackupService
}

/**
 * V2 主进程组合根。它持有唯一的数据库连接，并负责恢复后的引用重建，
 * 防止 IPC 在恢复后继续访问已关闭的 SQLite 连接。
 */
export class V2ApplicationRuntime {
  readonly storage: V2StoragePaths
  private references: V2RuntimeReferences | null = null

  constructor(
    userDataDirectory: string,
    private readonly applicationVersion: string
  ) {
    this.storage = resolveV2StoragePaths(userDataDirectory)
  }

  start(): void {
    if (this.references) return
    this.references = this.createReferences()
  }

  close(): void {
    if (!this.references) return
    this.references.database.close()
    this.references = null
  }

  get orderService(): V2OrderService {
    return this.requireReferences().orderService
  }

  get studioSettingsService(): StudioSettingsService {
    return this.requireReferences().studioSettingsService
  }

  get workbenchService(): WorkbenchService {
    return this.requireReferences().workbenchService
  }

  get fulfillmentService(): FulfillmentService {
    return this.requireReferences().fulfillmentService
  }

  get settlementService(): SettlementService {
    return this.requireReferences().settlementService
  }

  get financeService(): FinanceService {
    return this.requireReferences().financeService
  }

  get afterSalesService(): AfterSalesService {
    return this.requireReferences().afterSalesService
  }

  get reportService(): ReportService {
    return this.requireReferences().reportService
  }

  get reportExportService(): V2ReportExportService {
    return this.requireReferences().reportExportService
  }

  get backupService(): V2BackupService {
    return this.requireReferences().backupService
  }

  async restore(input: V2BackupRestoreInput): Promise<V2BackupRestoreResult> {
    const previous = this.requireReferences()
    const plan = await previous.backupService.prepareRestore(input)
    previous.database.pragma('wal_checkpoint(TRUNCATE)')
    previous.database.close()
    this.references = null

    try {
      await previous.backupService.applyRestore(plan)
      this.references = this.createReferences()
      const result: V2BackupRestoreResult = {
        restoredBackup: plan.sourceBackup,
        safetyBackup: plan.safetyBackup
      }
      this.requireReferences().repository.transaction(() => {
        this.requireReferences().repository.insertAudit({
          id: randomUUID(),
          action: 'backup.restored',
          entityType: 'backup',
          entityId: plan.sourceBackup.id,
          before: { currentBackupId: plan.safetyBackup.id },
          after: { restoredBackupId: plan.sourceBackup.id },
          metadata: {
            sourceBackupPath: plan.sourceBackup.backupPath,
            safetyBackupPath: plan.safetyBackup.backupPath
          },
          createdAt: new Date().toISOString()
        })
      })
      return result
    } catch (error) {
      if (!this.references) this.references = this.createReferences()
      throw error
    }
  }

  private createReferences(): V2RuntimeReferences {
    const database = createV2Database(this.storage.databasePath)
    const repository = new V2OrderRepository(database)
    const reportService = new ReportService(database)
    const studioSettingsService = new StudioSettingsService(database, repository)
    const orderService = new V2OrderService(repository, undefined, studioSettingsService)
    const fulfillmentService = new FulfillmentService(new V2FulfillmentRepository(database))
    const settlementService = new SettlementService(database)
    const financeService = new FinanceService(database)
    const afterSalesService = new AfterSalesService(database)
    return {
      database,
      repository,
      orderService,
      studioSettingsService,
      workbenchService: new WorkbenchService({
        orders: orderService,
        fulfillment: fulfillmentService,
        settlements: settlementService,
        afterSales: afterSalesService,
        finance: financeService
      }),
      fulfillmentService,
      settlementService,
      financeService,
      afterSalesService,
      reportService,
      reportExportService: new V2ReportExportService(reportService),
      backupService: new V2BackupService(this.storage, this.applicationVersion, database)
    }
  }

  private requireReferences(): V2RuntimeReferences {
    if (!this.references) throw new Error('V2 应用运行时尚未启动')
    return this.references
  }
}
