import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createV2Database } from './v2-connection'
import { runV2Migrations, runV2MigrationsUpTo } from './v2-migrations'
import {
  V2_ATTACHMENT_DIRECTORY_NAME,
  V2_BACKUP_DIRECTORY_NAME,
  V2_DATABASE_FILE_NAME,
  resolveV2StoragePaths
} from './v2-storage'

describe('V2 独立数据空间', () => {
  it('首次启用时创建空 V2 数据库且不触碰 V1 数据和附件', async () => {
    const userDataDirectory = await mkdtemp(join(tmpdir(), 'yumi-v2-storage-'))
    const v1DatabasePath = join(userDataDirectory, 'yumi-studio.sqlite')
    const v1AttachmentsDirectory = join(userDataDirectory, 'attachments')
    await writeFile(v1DatabasePath, 'v1-test-data')
    await mkdir(v1AttachmentsDirectory)
    await writeFile(join(v1AttachmentsDirectory, 'legacy.txt'), 'v1-attachment')

    const storage = resolveV2StoragePaths(userDataDirectory)
    expect(storage.databasePath).toBe(join(userDataDirectory, V2_DATABASE_FILE_NAME))
    expect(storage.attachmentDirectory).toBe(join(userDataDirectory, V2_ATTACHMENT_DIRECTORY_NAME))
    expect(storage.backupDirectory).toBe(join(userDataDirectory, V2_BACKUP_DIRECTORY_NAME))

    const database = createV2Database(storage.databasePath)
    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'orders'")
        .get()
    ).toBeTruthy()
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'financial_entries'"
        )
        .get()
    ).toBeTruthy()
    expect(
      database.prepare('SELECT MAX(version) AS version FROM v2_schema_migrations').get()
    ).toEqual({ version: 16 })
    const productColumns = (
      database.prepare('PRAGMA table_info(products)').all() as Array<{ name: string }>
    ).map((column) => column.name)
    expect(productColumns).toEqual(
      expect.arrayContaining([
        'unit_weight_milligrams',
        'edge_consumable_cost_cents',
        'fixed_cost_cents',
        'expected_fluffing_bagging_minutes',
        'expected_edge_sewing_minutes',
        'expected_packing_minutes',
        'edge_sewing_commission_cents',
        'mold_count',
        'output_per_mold_per_batch',
        'max_batches_per_day',
        'daily_capacity'
      ])
    )
    for (const removed of [
      'material_cost_cents',
      'making_glue_cost_cents',
      'glue_weight_milligrams',
      'material_loss_rate_basis_points',
      'internal_edge_cost_cents',
      'category'
    ]) {
      expect(productColumns).not.toContain(removed)
    }
    database.close()

    await expect(readFile(v1DatabasePath, 'utf8')).resolves.toBe('v1-test-data')
    await expect(readFile(join(v1AttachmentsDirectory, 'legacy.txt'), 'utf8')).resolves.toBe(
      'v1-attachment'
    )
  })

  it('拒绝把 V1 迁移表误判为 V2 已初始化状态', async () => {
    const userDataDirectory = await mkdtemp(join(tmpdir(), 'yumi-v2-v1-guard-'))
    const v1DatabasePath = join(userDataDirectory, 'yumi-studio.sqlite')
    const v1 = new Database(v1DatabasePath)
    v1.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (1, 'initial_schema', '2026-09-01T00:00:00.000Z');
    `)
    v1.close()

    expect(() => createV2Database(v1DatabasePath)).toThrow('拒绝将 V2 schema 写入疑似 V1 数据库')

    const inspected = new Database(v1DatabasePath)
    expect(
      inspected
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'v2_schema_migrations'"
        )
        .get()
    ).toBeUndefined()
    inspected.close()
  })

  it('最新结构重复启动保持同一目标模型，不重复执行迁移且保留既有数据', async () => {
    const userDataDirectory = await mkdtemp(join(tmpdir(), 'yumi-v2-repeat-start-'))
    const storage = resolveV2StoragePaths(userDataDirectory)
    const first = createV2Database(storage.databasePath)
    first
      .prepare(
        `INSERT INTO customers (id, name, enabled, created_at, updated_at)
         VALUES ('customer-1', '重复启动客户', 1, '2026-09-14T00:00:00.000Z', '2026-09-14T00:00:00.000Z')`
      )
      .run()
    const firstColumns = (
      first.prepare('PRAGMA table_info(products)').all() as Array<{ name: string }>
    ).map((column) => column.name)
    first.close()

    const reopened = createV2Database(storage.databasePath)
    expect(reopened.prepare('SELECT COUNT(*) AS count FROM v2_schema_migrations').get()).toEqual({
      count: 16
    })
    expect(reopened.prepare('SELECT name FROM customers WHERE id = ?').get('customer-1')).toEqual({
      name: '重复启动客户'
    })
    const reopenedColumns = (
      reopened.prepare('PRAGMA table_info(products)').all() as Array<{ name: string }>
    ).map((column) => column.name)
    expect(reopenedColumns).toEqual(firstColumns)
    reopened.close()
  })

  it('退回 v14 后重跑迁移会再次删除分类列并为缺失编码的商品补发 SP 编码', () => {
    const database = createV2Database(':memory:')
    const insert = database.prepare(
      `INSERT INTO products (id, name, code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
    )
    insert.run(
      'product-first',
      '先建商品',
      null,
      '2026-09-14T00:00:00.000Z',
      '2026-09-14T00:00:00.000Z'
    )
    insert.run(
      'product-legacy',
      '旧编码商品',
      'LEGACY-X',
      '2026-09-14T01:00:00.000Z',
      '2026-09-14T01:00:00.000Z'
    )
    insert.run(
      'product-third',
      '再建商品',
      null,
      '2026-09-14T02:00:00.000Z',
      '2026-09-14T02:00:00.000Z'
    )
    database.prepare('DELETE FROM v2_schema_migrations WHERE version = ?').run(15)

    runV2Migrations(database)

    const productColumns = (
      database.prepare('PRAGMA table_info(products)').all() as Array<{ name: string }>
    ).map((column) => column.name)
    expect(productColumns).not.toContain('category')
    expect(database.prepare('SELECT id, code FROM products ORDER BY created_at, id').all()).toEqual(
      [
        { id: 'product-first', code: 'SP0001' },
        { id: 'product-legacy', code: 'LEGACY-X' },
        { id: 'product-third', code: 'SP0002' }
      ]
    )
    database.close()
  })

  it('旧版业务库缺少目标模型列时拒绝启动并提示重建', () => {
    const database = new Database(':memory:')
    database.exec(`
      CREATE TABLE v2_schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      WITH RECURSIVE versions(version) AS (
        SELECT 1
        UNION ALL
        SELECT version + 1 FROM versions WHERE version < 12
      )
      INSERT INTO v2_schema_migrations (version, name, applied_at)
      SELECT version, 'legacy-applied', '2026-09-01T00:00:00.000Z' FROM versions;

      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        internal_edge_cost_cents INTEGER NOT NULL DEFAULT 0,
        material_cost_cents INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO products (id, name) VALUES ('legacy-product', '旧版商品');
    `)

    expect(() => runV2Migrations(database)).toThrow('数据库结构与当前版本不兼容')
    expect(() => runV2Migrations(database)).toThrow('请先备份旧业务库，再按最新结构重建数据库')
    expect(database.prepare('SELECT COUNT(*) AS count FROM products').get()).toEqual({ count: 1 })
    database.close()
  })

  it('空数据库直接建立目标模型，商品快照与结算字段不含旧胶水口径', () => {
    const database = createV2Database(':memory:')
    const productColumns = (
      database.prepare('PRAGMA table_info(products)').all() as Array<{ name: string }>
    ).map((column) => column.name)
    expect(productColumns).toContain('edge_sewing_commission_cents')
    expect(productColumns).not.toContain('material_loss_rate_basis_points')

    const orderItemColumns = (
      database.prepare('PRAGMA table_info(order_items)').all() as Array<{ name: string }>
    ).map((column) => column.name)
    expect(orderItemColumns).toEqual(
      expect.arrayContaining([
        'product_snapshot_json',
        'edge_enabled',
        'edge_quantity',
        'edge_unit_price_cents',
        'item_discount_cents'
      ])
    )
    database.close()
  })

  it('追加履约基础表并拒绝负数量和负计划分钟', async () => {
    const userDataDirectory = await mkdtemp(join(tmpdir(), 'yumi-v2-fulfillment-schema-'))
    const database = createV2Database(resolveV2StoragePaths(userDataDirectory).databasePath)
    const tableNames = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>
    expect(tableNames.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'work_assignments',
        'process_tasks',
        'process_results',
        'quality_inspections',
        'fulfillment_events',
        'product_stage_inventory_events',
        'work_time_reviews',
        'work_time_review_assignments',
        'work_time_review_items'
      ])
    )
    expect(() =>
      database
        .prepare(
          `
      INSERT INTO process_tasks (
        id, work_assignment_id, process_type, source_type, planned_quantity,
        planned_minutes, extra_minutes, status, created_at, updated_at
      ) VALUES ('task-negative', 'assignment-missing', 'making', 'normal_production', -1, 0, 0, 'pending', '2026-09-07T00:00:00.000Z', '2026-09-07T00:00:00.000Z')
    `
        )
        .run()
    ).toThrow()
    expect(() =>
      database
        .prepare(
          `
      INSERT INTO process_results (id, process_task_id, completed_quantity, submitted_on, created_at)
      VALUES ('result-negative', 'task-missing', -1, '2026-09-07', '2026-09-07T00:00:00.000Z')
    `
        )
        .run()
    ).toThrow()
    expect(() =>
      database
        .prepare(
          `
      INSERT INTO quality_inspections (
        id, process_result_id, process_task_id, qualified_quantity, unqualified_quantity,
        inspected_on, requires_rework, created_at
      ) VALUES ('inspection-negative', 'result-missing', 'task-missing', -1, 0, '2026-09-08', 0, '2026-09-08T00:00:00.000Z')
    `
        )
        .run()
    ).toThrow()
    expect(() =>
      database
        .prepare(
          `
      INSERT INTO fulfillment_events (
        id, order_item_id, event_type, quantity, occurred_on, created_at
      ) VALUES ('event-negative', 'item-missing', 'making_qualified', -1, '2026-09-07', '2026-09-07T00:00:00.000Z')
    `
        )
        .run()
    ).toThrow()
    expect(() =>
      database
        .prepare(
          `
      INSERT INTO product_stage_inventory_events (
        id, product_id, stage, quantity_delta, source_type, occurred_on, created_at
      ) VALUES ('inventory-zero', 'product-missing', 'packed', 0, 'opening', '2026-09-07', '2026-09-07T00:00:00.000Z')
    `
        )
        .run()
    ).toThrow()
    database.close()
  })

  it('追加兼职工资数据基线，并防止确认任务、扣款和工资流水被重复归属', () => {
    const database = createV2Database(':memory:')
    const tableNames = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>
    expect(tableNames.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'workers',
        'worker_wage_history',
        'worker_settlements',
        'worker_settlement_making_sources',
        'worker_settlement_timed_sources',
        'worker_settlement_timed_items',
        'worker_settlement_adjustments',
        'worker_deduction_records',
        'worker_settlement_deduction_allocations',
        'worker_deduction_balances',
        'worker_refund_records'
      ])
    )
    expect(
      database.prepare('SELECT MAX(version) AS version FROM v2_schema_migrations').get()
    ).toEqual({ version: 16 })
    expect(
      database
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'financial_entries'"
        )
        .get()
    ).toEqual(expect.objectContaining({ sql: expect.stringContaining('source_type') }))

    database
      .prepare(
        `
      INSERT INTO workers (id, name, enabled, created_at, updated_at)
      VALUES ('worker-1', '兼职小林', 1, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO worker_wage_history (id, worker_id, effective_on, hourly_wage_cents, created_at)
      VALUES ('wage-1', 'worker-1', '2026-09-08', 2_000, '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    expect(() =>
      database
        .prepare(
          `
      INSERT INTO worker_wage_history (id, worker_id, effective_on, hourly_wage_cents, created_at)
      VALUES ('wage-duplicate', 'worker-1', '2026-09-08', 2_200, '2026-09-08T00:00:00.000Z')
    `
        )
        .run()
    ).toThrow()

    database
      .prepare(
        `
      INSERT INTO work_assignments (id, worker_id, assigned_on, process_type, status, created_at, updated_at)
      VALUES ('assignment-1', 'worker-1', '2026-09-08', 'making', 'completed', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO process_tasks (
        id, work_assignment_id, process_type, source_type, planned_quantity,
        planned_minutes, extra_minutes, status, created_at, updated_at
      ) VALUES ('task-1', 'assignment-1', 'making', 'normal_production', 1, 20, 0, 'confirmed', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO financial_entries (id, source_type, direction, business_type, amount_cents, occurred_on, created_at)
      VALUES ('wage-entry-1', 'worker_settlement', 'expense', 'wage_payment', 2_000, '2026-09-08', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    expect(() =>
      database
        .prepare(
          `
      INSERT INTO financial_entries (id, source_type, direction, business_type, amount_cents, occurred_on, created_at)
      VALUES ('invalid-source-entry', 'unsupported_source', 'expense', 'wage_payment', 1, '2026-09-08', '2026-09-08T00:00:00.000Z')
    `
        )
        .run()
    ).toThrow()

    database
      .prepare(
        `
      INSERT INTO worker_settlements (
        id, worker_id, period_start_on, period_end_on, status, financial_entry_id, created_at, updated_at
      ) VALUES ('settlement-1', 'worker-1', '2026-09-08', '2026-09-08', 'confirmed', 'wage-entry-1', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO worker_settlements (id, worker_id, period_start_on, period_end_on, status, created_at, updated_at)
      VALUES ('settlement-2', 'worker-1', '2026-09-09', '2026-09-09', 'draft', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    expect(() =>
      database
        .prepare(
          `
      UPDATE worker_settlements SET financial_entry_id = 'wage-entry-1' WHERE id = 'settlement-2'
    `
        )
        .run()
    ).toThrow()

    database
      .prepare(
        `
      INSERT INTO work_time_reviews (
        id, worker_id, worked_on, process_type, approved_minutes, hourly_wage_cents_snapshot,
        source_type, status, created_at, updated_at
      ) VALUES ('review-1', 'worker-1', '2026-09-08', 'packing', 240, 2_000, 'manual_review', 'confirmed', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    const insertTimedSource = database.prepare(
      `
      INSERT INTO worker_settlement_timed_sources (
        id, settlement_id, work_time_review_id, process_type, occurred_on, approved_minutes,
        hourly_wage_cents_snapshot, timed_wage_cents, commission_cents, status, created_at
      ) VALUES (?, ?, 'review-1', 'packing', '2026-09-08', 240, 2_000, 8_000, 0, 'confirmed', '2026-09-08T00:00:00.000Z')
    `
    )
    insertTimedSource.run('timed-1', 'settlement-1')
    expect(() => insertTimedSource.run('timed-2', 'settlement-2')).toThrow('UNIQUE')

    database
      .prepare(
        `
      INSERT INTO worker_deduction_records (
        id, worker_id, process_task_id, unqualified_quantity, material_deduction_cents,
        total_deduction_cents, deducted_cents,
        remaining_carryover_cents, status, created_at, updated_at
      ) VALUES ('deduction-1', 'worker-1', 'task-1', 1, 50, 50, 0, 50, 'pending', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO worker_settlement_deduction_allocations (
        id, settlement_id, deduction_record_id, allocated_cents, status, created_at
      ) VALUES ('allocation-1', 'settlement-1', 'deduction-1', 50, 'confirmed', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    expect(() =>
      database
        .prepare(
          `
      INSERT INTO worker_settlement_deduction_allocations (
        id, settlement_id, deduction_record_id, allocated_cents, status, created_at
      ) VALUES ('allocation-2', 'settlement-2', 'deduction-1', 50, 'confirmed', '2026-09-08T00:00:00.000Z')
    `
        )
        .run()
    ).toThrow()
    database
      .prepare(
        `
      INSERT INTO worker_deduction_balances (id, worker_id, deduction_record_id, remaining_cents, status, created_at, updated_at)
      VALUES ('balance-1', 'worker-1', 'deduction-1', 50, 'open', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    expect(() =>
      database
        .prepare(
          `
      INSERT INTO worker_deduction_balances (id, worker_id, deduction_record_id, remaining_cents, status, created_at, updated_at)
      VALUES ('balance-duplicate', 'worker-1', 'deduction-1', 50, 'open', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
        )
        .run()
    ).toThrow()
    database.close()
  })

  it('建立日常财务、垫付报销与售后数据基线，并保留旧工资流水关联', () => {
    const database = createV2Database(':memory:')
    const tableNames = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>
    expect(tableNames.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'finance_categories',
        'advance_payers',
        'advance_reimbursements',
        'after_sales_cases',
        'after_sales_charge_links',
        'worker_refund_records'
      ])
    )
    expect(
      database.prepare('SELECT MAX(version) AS version FROM v2_schema_migrations').get()
    ).toEqual({ version: 16 })

    database
      .prepare(
        `
      INSERT INTO finance_categories (id, direction, name, enabled, created_at, updated_at)
      VALUES ('expense-category-1', 'expense', '日常耗材', 1, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO finance_categories (id, direction, name, enabled, created_at, updated_at)
      VALUES ('income-category-1', 'income', '其他收入', 1, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO advance_payers (id, name, enabled, created_at, updated_at)
      VALUES ('payer-1', '小林', 1, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO financial_entries (
        id, source_type, direction, business_type, amount_cents, occurred_on,
        category_id, payment_source, advance_payer_id, created_at
      ) VALUES (
        'advance-entry-1', 'manual_expense', 'expense', 'daily_expense', 2_000, '2026-09-08',
        'expense-category-1', 'private_advance', 'payer-1', '2026-09-08T00:00:00.000Z'
      )
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO financial_entries (
        id, source_type, direction, business_type, amount_cents, occurred_on, category_id, created_at
      ) VALUES (
        'income-entry-1', 'manual_income', 'income', 'daily_income', 500, '2026-09-08',
        'income-category-1', '2026-09-08T00:00:00.000Z'
      )
    `
      )
      .run()
    expect(() =>
      database.prepare("DELETE FROM finance_categories WHERE id = 'expense-category-1'").run()
    ).toThrow()
    expect(() =>
      database.prepare("DELETE FROM advance_payers WHERE id = 'payer-1'").run()
    ).toThrow()
    expect(() =>
      database
        .prepare(
          `
      INSERT INTO financial_entries (id, source_type, direction, business_type, amount_cents, occurred_on, payment_source, created_at)
      VALUES ('invalid-private-advance', 'manual_expense', 'expense', 'daily_expense', 100, '2026-09-08', 'private_advance', '2026-09-08T00:00:00.000Z')
    `
        )
        .run()
    ).toThrow()
    expect(() =>
      database
        .prepare(
          `
      INSERT INTO financial_entries (id, source_type, direction, business_type, amount_cents, occurred_on, payment_source, created_at)
      VALUES ('invalid-income-payer', 'manual_income', 'income', 'daily_income', 100, '2026-09-08', 'business_account', '2026-09-08T00:00:00.000Z')
    `
        )
        .run()
    ).toThrow()

    database
      .prepare(
        `
      INSERT INTO financial_entries (id, source_type, direction, business_type, amount_cents, occurred_on, payment_source, created_at)
      VALUES ('reimbursement-entry-1', 'reimbursement', 'expense', 'advance_reimbursement', 2_000, '2026-09-09', 'business_account', '2026-09-09T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO advance_reimbursements (id, advance_financial_entry_id, reimbursement_financial_entry_id, created_at)
      VALUES ('reimbursement-1', 'advance-entry-1', 'reimbursement-entry-1', '2026-09-09T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO financial_entries (id, source_type, direction, business_type, amount_cents, occurred_on, payment_source, created_at)
      VALUES ('reimbursement-entry-2', 'reimbursement', 'expense', 'advance_reimbursement', 2_000, '2026-09-10', 'business_account', '2026-09-10T00:00:00.000Z')
    `
      )
      .run()
    expect(() =>
      database
        .prepare(
          `
      INSERT INTO advance_reimbursements (id, advance_financial_entry_id, reimbursement_financial_entry_id, created_at)
      VALUES ('reimbursement-duplicate-advance', 'advance-entry-1', 'reimbursement-entry-2', '2026-09-10T00:00:00.000Z')
    `
        )
        .run()
    ).toThrow()
    database
      .prepare(
        `
      INSERT INTO financial_entries (
        id, source_type, direction, business_type, amount_cents, occurred_on,
        category_id, payment_source, advance_payer_id, created_at
      ) VALUES (
        'advance-entry-2', 'manual_expense', 'expense', 'daily_expense', 2_000, '2026-09-10',
        'expense-category-1', 'private_advance', 'payer-1', '2026-09-10T00:00:00.000Z'
      )
    `
      )
      .run()
    expect(() =>
      database
        .prepare(
          `
      INSERT INTO advance_reimbursements (id, advance_financial_entry_id, reimbursement_financial_entry_id, created_at)
      VALUES ('reimbursement-duplicate-payment', 'advance-entry-2', 'reimbursement-entry-1', '2026-09-10T00:00:00.000Z')
    `
        )
        .run()
    ).toThrow()

    database
      .prepare(
        `
      INSERT INTO orders (
        id, code, customer_snapshot_json, order_discount_cents, created_at, updated_at
      ) VALUES ('order-1', 'ORDER-001', '{"name":"客户"}', 10_000, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO shipments (id, order_id, shipped_on, created_at, updated_at)
      VALUES ('shipment-1', 'order-1', '2026-09-08', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO after_sales_cases (
        id, order_id, shipment_id, occurred_on, reason_description, customer_request,
        responsibility_description, handling_description, status, customer_charge_note,
        accounting_cost_cents, note, created_at, updated_at
      ) VALUES (
        'after-sales-1', 'order-1', 'shipment-1', '2026-09-08', '客户不满意包装', '换袋并加封边',
        '待负责人协商', '重新包装并加封边', 'processing', '小额免费处理', 2_000, '不自动生成支出',
        '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z'
      )
    `
      )
      .run()
    expect(() =>
      database
        .prepare(
          `
      INSERT INTO after_sales_cases (
        id, order_id, occurred_on, reason_description, responsibility_description,
        handling_description, status, accounting_cost_cents, created_at, updated_at
      ) VALUES ('after-sales-invalid-cost', 'order-1', '2026-09-08', '测试', '待定', '测试', 'open', -1, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
        )
        .run()
    ).toThrow()
    expect(database.prepare('SELECT COUNT(*) AS count FROM financial_entries').get()).toEqual({
      count: 5
    })
    database
      .prepare(
        `
      INSERT INTO financial_entries (id, source_type, direction, business_type, amount_cents, occurred_on, order_id, created_at)
      VALUES ('after-sales-charge-entry-1', 'order_fund', 'income', 'after_sales_charge', 1_000, '2026-09-09', 'order-1', '2026-09-09T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO after_sales_charge_links (after_sales_case_id, financial_entry_id, created_at)
      VALUES ('after-sales-1', 'after-sales-charge-entry-1', '2026-09-09T00:00:00.000Z')
    `
      )
      .run()
    expect(
      database
        .prepare(
          `
      SELECT COUNT(*) AS count FROM after_sales_charge_links WHERE after_sales_case_id = 'after-sales-1'
    `
        )
        .get()
    ).toEqual({ count: 1 })
    database.close()

    const upgraded = createV2Database(':memory:')
    upgraded.pragma('foreign_keys = OFF')
    upgraded.exec(`
      CREATE TABLE financial_entries_legacy (
        id TEXT PRIMARY KEY,
        direction TEXT NOT NULL CHECK(direction IN ('income', 'expense')),
        business_type TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
        occurred_on TEXT NOT NULL,
        payment_method TEXT,
        order_id TEXT REFERENCES orders(id),
        attachment_id TEXT REFERENCES attachments(id),
        reversal_of_entry_id TEXT REFERENCES financial_entries_legacy(id),
        note TEXT,
        created_at TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'order_fund' CHECK(source_type IN ('order_fund', 'worker_settlement')),
        UNIQUE(reversal_of_entry_id)
      );
      DROP TABLE financial_entries;
      ALTER TABLE financial_entries_legacy RENAME TO financial_entries;
    `)
    upgraded.prepare('DELETE FROM v2_schema_migrations WHERE version = ?').run(8)
    upgraded.pragma('foreign_keys = ON')
    upgraded
      .prepare(
        `
      INSERT INTO workers (id, name, enabled, created_at, updated_at)
      VALUES ('legacy-worker-1', '历史兼职', 1, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    upgraded
      .prepare(
        `
      INSERT INTO financial_entries (id, source_type, direction, business_type, amount_cents, occurred_on, created_at)
      VALUES ('legacy-wage-entry-1', 'worker_settlement', 'expense', 'wage_payment', 1_800, '2026-09-08', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    upgraded
      .prepare(
        `
      INSERT INTO worker_settlements (
        id, worker_id, period_start_on, period_end_on, status, financial_entry_id, created_at, updated_at
      ) VALUES ('legacy-settlement-1', 'legacy-worker-1', '2026-09-08', '2026-09-08', 'confirmed', 'legacy-wage-entry-1', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    runV2Migrations(upgraded)
    expect(
      upgraded
        .prepare(
          `
      SELECT source_type, amount_cents FROM financial_entries WHERE id = 'legacy-wage-entry-1'
    `
        )
        .get()
    ).toEqual({ source_type: 'worker_settlement', amount_cents: 1_800 })
    expect(
      upgraded
        .prepare(
          `
      SELECT financial_entry_id FROM worker_settlements WHERE id = 'legacy-settlement-1'
    `
        )
        .get()
    ).toEqual({ financial_entry_id: 'legacy-wage-entry-1' })
    expect(upgraded.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    upgraded.close()
  })
})

describe('V2 计时排班解耦与单次核算迁移', () => {
  it('全新库建立排班模式与重复计时班次唯一约束', () => {
    const database = createV2Database(':memory:')
    expect(
      database.prepare('SELECT MAX(version) AS version FROM v2_schema_migrations').get()
    ).toEqual({ version: 16 })
    const workAssignmentColumns = (
      database.prepare('PRAGMA table_info(work_assignments)').all() as Array<{ name: string }>
    ).map((column) => column.name)
    expect(workAssignmentColumns).toEqual(
      expect.arrayContaining(['schedule_mode', 'status', 'assigned_on'])
    )

    const insertTimed = database.prepare(
      `
      INSERT INTO work_assignments (
        id, worker_id, assigned_on, process_type, status, schedule_mode, created_at, updated_at
      ) VALUES (?, 'worker-timed', '2026-09-10', ?, 'scheduled', 'timed_shift', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z')
    `
    )
    insertTimed.run('timed-repeated-1', 'edge_sewing')
    expect(() => insertTimed.run('timed-repeated-2', 'edge_sewing')).toThrow('UNIQUE')
    insertTimed.run('timed-other-process', 'packing')

    database
      .prepare("UPDATE work_assignments SET status = 'cancelled' WHERE id = 'timed-repeated-1'")
      .run()
    insertTimed.run('timed-repeated-2', 'edge_sewing')
    database
      .prepare("UPDATE work_assignments SET status = 'absent' WHERE id = 'timed-repeated-2'")
      .run()
    insertTimed.run('timed-repeated-3', 'edge_sewing')

    const insertMaking = database.prepare(
      `
      INSERT INTO work_assignments (
        id, worker_id, assigned_on, process_type, status, schedule_mode, created_at, updated_at
      ) VALUES (?, 'worker-timed', '2026-09-10', 'making', 'scheduled', 'making_task', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z')
    `
    )
    insertMaking.run('making-1')
    insertMaking.run('making-2')
    database.close()
  })

  it('v15 升级保留历史事实、释放草稿并允许零产出制作结果', () => {
    const database = new Database(':memory:')
    database.pragma('foreign_keys = ON')
    runV2MigrationsUpTo(database, 15)
    expect(
      database.prepare('SELECT MAX(version) AS version FROM v2_schema_migrations').get()
    ).toEqual({ version: 15 })

    database
      .prepare(
        `
      INSERT INTO workers (id, name, enabled, created_at, updated_at)
      VALUES ('worker-legacy', '历史兼职', 1, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO orders (id, code, customer_snapshot_json, created_at, updated_at)
      VALUES ('order-legacy', 'ORDER-LEGACY', '{"name":"客户"}', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO order_items (
        id, order_id, product_snapshot_json, quantity, unit_price_cents, created_at, updated_at
      ) VALUES ('item-legacy', 'order-legacy', '{"name":"历史商品"}', 10, 6_000, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO work_assignments (id, worker_id, assigned_on, process_type, status, created_at, updated_at)
      VALUES ('assignment-legacy-making', 'worker-legacy', '2026-09-08', 'making', 'completed', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO process_tasks (
        id, work_assignment_id, order_item_id, process_type, source_type, planned_quantity,
        planned_minutes, extra_minutes, status, piece_rate_cents, created_at, updated_at
      ) VALUES ('task-legacy-making', 'assignment-legacy-making', 'item-legacy', 'making', 'normal_production', 10, 120, 0, 'confirmed', 300, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO process_results (id, process_task_id, completed_quantity, submitted_on, note, created_at)
      VALUES ('result-legacy', 'task-legacy-making', 10, '2026-09-08', '历史结果', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO quality_inspections (
        id, process_result_id, process_task_id, qualified_quantity, unqualified_quantity,
        inspected_on, requires_rework, created_at
      ) VALUES ('inspection-legacy', 'result-legacy', 'task-legacy-making', 9, 1, '2026-09-09', 0, '2026-09-09T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO fulfillment_events (
        id, order_item_id, event_type, quantity, source_stage, target_stage,
        source_record_type, source_record_id, occurred_on, created_at
      ) VALUES ('event-legacy', 'item-legacy', 'making_qualified', 9, 'making', 'fluffing_bagging',
        'quality_inspection', 'inspection-legacy', '2026-09-09', '2026-09-09T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO work_assignments (id, worker_id, assigned_on, process_type, status, created_at, updated_at)
      VALUES ('assignment-legacy-timed', 'worker-legacy', '2026-09-10', 'packing', 'scheduled', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO process_tasks (
        id, work_assignment_id, order_item_id, process_type, source_type, planned_quantity,
        planned_minutes, extra_minutes, status, piece_rate_cents, created_at, updated_at
      ) VALUES ('task-legacy-packing', 'assignment-legacy-timed', 'item-legacy', 'packing', 'normal_production', 5, 30, 0, 'pending', NULL, '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO work_time_reviews (
        id, worker_id, worked_on, process_type, approved_minutes, hourly_wage_cents_snapshot,
        source_type, raw_started_at, raw_ended_at, status, review_note, created_at, updated_at
      ) VALUES ('review-legacy-draft', 'worker-legacy', '2026-09-09', 'packing', 240, NULL,
        'manual_review', NULL, NULL, 'draft', '未确认草稿', '2026-09-09T00:00:00.000Z', '2026-09-09T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO work_time_review_assignments (review_id, work_assignment_id, created_at)
      VALUES ('review-legacy-draft', 'assignment-legacy-timed', '2026-09-09T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO work_time_reviews (
        id, worker_id, worked_on, process_type, approved_minutes, hourly_wage_cents_snapshot,
        source_type, status, review_note, created_at, updated_at
      ) VALUES ('review-legacy-confirmed', 'worker-legacy', '2026-09-08', 'packing', 180, 2_000,
        'manual_review', 'confirmed', '历史已确认', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO work_time_review_items (
        id, review_id, process_task_id, order_item_id, completed_quantity, created_at
      ) VALUES ('review-item-legacy', 'review-legacy-confirmed', 'task-legacy-packing', NULL, 5, '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO financial_entries (id, source_type, direction, business_type, amount_cents, occurred_on, created_at)
      VALUES ('wage-entry-legacy', 'worker_settlement', 'expense', 'wage_payment', 6_000, '2026-09-08', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO worker_settlements (
        id, worker_id, period_start_on, period_end_on, status, financial_entry_id, created_at, updated_at
      ) VALUES ('settlement-legacy', 'worker-legacy', '2026-09-08', '2026-09-08', 'confirmed', 'wage-entry-legacy', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO worker_settlement_timed_sources (
        id, settlement_id, work_time_review_id, process_type, occurred_on, approved_minutes,
        hourly_wage_cents_snapshot, timed_wage_cents, commission_cents, status, created_at
      ) VALUES ('timed-source-legacy', 'settlement-legacy', 'review-legacy-confirmed', 'packing', '2026-09-08', 180, 2_000, 6_000, 0, 'confirmed', '2026-09-08T00:00:00.000Z')
    `
      )
      .run()
    database
      .prepare(
        `
      INSERT INTO worker_settlement_timed_items (
        id, timed_source_id, process_task_id, order_item_id, completed_quantity, piece_rate_cents, commission_cents, created_at
      ) VALUES ('timed-item-legacy', 'timed-source-legacy', 'task-legacy-packing', 'item-legacy', 5, 0, 0, '2026-09-08T00:00:00.000Z')
    `
      )
      .run()

    runV2Migrations(database)

    expect(
      database
        .prepare(
          "SELECT status, schedule_mode FROM work_assignments WHERE id = 'assignment-legacy-making'"
        )
        .get()
    ).toEqual({ status: 'completed', schedule_mode: 'legacy_task' })
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])

    // 历史草稿转为作废但保留原记录，不生成履约或工资事实
    expect(
      database
        .prepare('SELECT status, void_reason, voided_at FROM work_time_reviews WHERE id = ?')
        .get('review-legacy-draft')
    ).toMatchObject({ status: 'voided' })
    expect(
      database
        .prepare('SELECT COUNT(*) AS count FROM fulfillment_events WHERE id = ?')
        .get('event-legacy')
    ).toEqual({ count: 1 })
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM worker_settlement_timed_sources WHERE work_time_review_id = 'review-legacy-draft'"
        )
        .get()
    ).toEqual({ count: 0 })

    // 历史已确认核算与结算金额守恒
    expect(
      database
        .prepare(
          'SELECT status, approved_minutes, hourly_wage_cents_snapshot FROM work_time_reviews WHERE id = ?'
        )
        .get('review-legacy-confirmed')
    ).toEqual({ status: 'confirmed', approved_minutes: 180, hourly_wage_cents_snapshot: 2_000 })
    expect(
      database
        .prepare(
          'SELECT qualified_quantity, unqualified_quantity FROM quality_inspections WHERE id = ?'
        )
        .get('inspection-legacy')
    ).toEqual({ qualified_quantity: 9, unqualified_quantity: 1 })
    expect(
      database
        .prepare('SELECT completed_quantity, status FROM process_results WHERE id = ?')
        .get('result-legacy')
    ).toEqual({ completed_quantity: 10, status: 'confirmed' })

    // 历史核算明细回填订单商品与提成快照，预计分钟无法可靠补齐留空
    expect(
      database
        .prepare(
          'SELECT order_item_id, process_task_id, piece_rate_cents_snapshot, expected_unit_minutes_snapshot FROM work_time_review_items WHERE id = ?'
        )
        .get('review-item-legacy')
    ).toEqual({
      order_item_id: 'item-legacy',
      process_task_id: 'task-legacy-packing',
      piece_rate_cents_snapshot: null,
      expected_unit_minutes_snapshot: null
    })

    // 历史结算明细保留任务关联且不新造核算明细来源
    expect(
      database
        .prepare(
          'SELECT process_task_id, work_time_review_item_id FROM worker_settlement_timed_items WHERE id = ?'
        )
        .get('timed-item-legacy')
    ).toEqual({ process_task_id: 'task-legacy-packing', work_time_review_item_id: null })

    // 零产出制作结果允许写入，重复当前有效结果被唯一约束拒绝
    database
      .prepare(
        `
      INSERT INTO process_results (
        id, process_task_id, completed_quantity, submitted_on, status, created_at
      ) VALUES ('result-zero', 'task-legacy-making', 0, '2026-09-11', 'voided', '2026-09-11T00:00:00.000Z')
    `
      )
      .run()
    expect(() =>
      database
        .prepare(
          `
      INSERT INTO process_results (
        id, process_task_id, completed_quantity, submitted_on, status, created_at
      ) VALUES ('result-duplicate-current', 'task-legacy-making', 1, '2026-09-11', 'confirmed', '2026-09-11T00:00:00.000Z')
    `
        )
        .run()
    ).toThrow('UNIQUE')

    // 履约事件幂等键：历史为空可共存，新键唯一但同一来源允许多条不同事件
    const insertEvent = database.prepare(
      `
      INSERT INTO fulfillment_events (
        id, order_item_id, event_type, quantity, source_record_type, source_record_id,
        source_event_key, occurred_on, created_at
      ) VALUES (?, 'item-legacy', 'fluffing_bagging_completed', 1, 'work_time_review_item',
        'review-item-legacy', ?, '2026-09-11', '2026-09-11T00:00:00.000Z')
    `
    )
    insertEvent.run('event-key-1', 'work_time_review_item:review-item-legacy:to_edge_sewing')
    expect(() =>
      insertEvent.run(
        'event-key-duplicate',
        'work_time_review_item:review-item-legacy:to_edge_sewing'
      )
    ).toThrow('UNIQUE')
    insertEvent.run('event-key-2', 'work_time_review_item:review-item-legacy:to_packing')

    database.close()
  })
})
