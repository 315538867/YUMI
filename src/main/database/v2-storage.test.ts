import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createV2Database } from './v2-connection'
import { runV2Migrations } from './v2-migrations'
import { V2FulfillmentRepository } from '@main/repositories/fulfillment-repository'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import { FulfillmentService } from '@main/services/fulfillment-service'
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
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'financial_entries'")
        .get()
    ).toBeTruthy()
    expect(
      database.prepare('SELECT MAX(version) AS version FROM v2_schema_migrations').get()
    ).toEqual({ version: 9 })
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
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'v2_schema_migrations'")
        .get()
    ).toBeUndefined()
    inspected.close()
  })

  it('仅识别 V2 迁移记录，并将较早 V2 数据库增量升级', async () => {
    const userDataDirectory = await mkdtemp(join(tmpdir(), 'yumi-v2-migration-'))
    const storage = resolveV2StoragePaths(userDataDirectory)
    const earlierV2 = new Database(storage.databasePath)
    earlierV2.exec(`
      CREATE TABLE v2_schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      INSERT INTO v2_schema_migrations (version, name, applied_at)
      VALUES (1, 'v2_master_data', '2026-09-06T00:00:00.000Z');
      CREATE TABLE customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact TEXT,
        default_address TEXT,
        notes TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE,
        category TEXT,
        base_price_cents INTEGER NOT NULL DEFAULT 0,
        material_cost_cents INTEGER NOT NULL DEFAULT 0,
        packaging_cost_cents INTEGER NOT NULL DEFAULT 0,
        accessory_cost_cents INTEGER NOT NULL DEFAULT 0,
        replacement_bag_cost_cents INTEGER NOT NULL DEFAULT 0,
        edge_cost_cents INTEGER NOT NULL DEFAULT 0,
        standard_making_minutes INTEGER NOT NULL DEFAULT 0,
        making_commission_cents INTEGER NOT NULL DEFAULT 0,
        making_glue_cost_cents INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        image_attachment_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE attachments (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        original_name TEXT NOT NULL,
        storage_key TEXT NOT NULL UNIQUE,
        mime_type TEXT,
        size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );
    `)
    earlierV2
      .prepare("INSERT INTO customers (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(
        'customer-1',
        'V2 客户',
        '2026-09-07T00:00:00.000Z',
        '2026-09-07T00:00:00.000Z'
      )
    earlierV2.close()

    const upgraded = createV2Database(storage.databasePath)
    expect(upgraded.prepare('SELECT name FROM customers WHERE id = ?').get('customer-1')).toEqual({
      name: 'V2 客户'
    })
    expect(upgraded.prepare('SELECT COUNT(*) AS count FROM v2_schema_migrations').get()).toEqual({
      count: 9
    })
    expect(
      upgraded
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'order_content_changes'")
        .get()
    ).toBeTruthy()
    upgraded.close()
  })

  it('将阶段 A 已发货记录回填为履约事实，且不会形成负的待发货数量', () => {
    const database = createV2Database(':memory:')
    database.prepare(`
      INSERT INTO orders (
        id, code, customer_snapshot_json, initial_confirmed_amount_cents, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'legacy-order', 'LEGACY-001', '{"name":"历史客户"}', 10_000,
      '2026-09-06T08:00:00.000Z', '2026-09-06T08:00:00.000Z'
    )
    database.prepare(`
      INSERT INTO order_items (
        id, order_id, product_snapshot_json, quantity, unit_price_cents, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'legacy-order-item', 'legacy-order', '{}', 10, 1_000,
      '2026-09-06T08:00:00.000Z', '2026-09-06T08:00:00.000Z'
    )
    database.prepare(`
      INSERT INTO shipments (id, order_id, shipped_on, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'legacy-shipment', 'legacy-order', '2026-09-07',
      '2026-09-07T08:00:00.000Z', '2026-09-07T08:00:00.000Z'
    )
    database.prepare(`
      INSERT INTO shipment_items (id, shipment_id, order_item_id, quantity, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('legacy-shipment-item', 'legacy-shipment', 'legacy-order-item', 4, '2026-09-07T08:00:00.000Z')

    database.prepare('DELETE FROM v2_schema_migrations WHERE version = ?').run(5)
    runV2Migrations(database)

    expect(database.prepare(`
      SELECT event_type, source_stage, target_stage, quantity, source_record_type, source_record_id
      FROM fulfillment_events WHERE id = ?
    `).get('legacy-shipment:legacy-shipment-item')).toEqual({
      event_type: 'shipment', source_stage: 'making', target_stage: 'shipped', quantity: 4,
      source_record_type: 'shipment_item', source_record_id: 'legacy-shipment-item'
    })
    expect(new V2OrderRepository(database).listShipments('legacy-order')).toEqual([
      expect.objectContaining({
        id: 'legacy-shipment',
        items: [{ orderItemId: 'legacy-order-item', quantity: 4 }]
      })
    ])
    expect(new FulfillmentService(new V2FulfillmentRepository(database)).getOrderItemFulfillment('legacy-order-item').stages)
      .toMatchObject({ making: 6, readyToShip: 0, shipped: 4 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM fulfillment_events').get()).toEqual({ count: 1 })
    database.close()
  })

  it('追加履约基础表并拒绝负数量和负计划分钟', async () => {
    const userDataDirectory = await mkdtemp(join(tmpdir(), 'yumi-v2-fulfillment-schema-'))
    const database = createV2Database(resolveV2StoragePaths(userDataDirectory).databasePath)
    const tableNames = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>
    expect(tableNames.map((row) => row.name)).toEqual(expect.arrayContaining([
      'work_assignments', 'process_tasks', 'process_results', 'quality_inspections',
      'fulfillment_events', 'opening_wip_records'
    ]))
    expect(() => database.prepare(`
      INSERT INTO process_tasks (
        id, work_assignment_id, process_type, source_type, planned_quantity,
        planned_minutes, extra_minutes, status, created_at, updated_at
      ) VALUES ('task-negative', 'assignment-missing', 'making', 'normal_production', -1, 0, 0, 'pending', '2026-09-07T00:00:00.000Z', '2026-09-07T00:00:00.000Z')
    `).run()).toThrow()
    expect(() => database.prepare(`
      INSERT INTO process_results (id, process_task_id, completed_quantity, submitted_on, created_at)
      VALUES ('result-negative', 'task-missing', -1, '2026-09-07', '2026-09-07T00:00:00.000Z')
    `).run()).toThrow()
    expect(() => database.prepare(`
      INSERT INTO quality_inspections (
        id, process_result_id, process_task_id, qualified_quantity, unqualified_quantity,
        inspected_on, requires_rework, created_at
      ) VALUES ('inspection-negative', 'result-missing', 'task-missing', -1, 0, '2026-09-08', 0, '2026-09-08T00:00:00.000Z')
    `).run()).toThrow()
    expect(() => database.prepare(`
      INSERT INTO fulfillment_events (
        id, order_item_id, event_type, quantity, occurred_on, created_at
      ) VALUES ('event-negative', 'item-missing', 'opening_wip', -1, '2026-09-07', '2026-09-07T00:00:00.000Z')
    `).run()).toThrow()
    expect(() => database.prepare(`
      INSERT INTO opening_wip_records (
        id, order_item_id, target_stage, quantity, occurred_on, fulfillment_event_id, created_at
      ) VALUES ('wip-negative', 'item-missing', 'packing', -1, '2026-09-07', 'event-missing', '2026-09-07T00:00:00.000Z')
    `).run()).toThrow()
    database.close()
  })


  it('追加兼职工资数据基线，并防止确认任务、扣款和工资流水被重复归属', () => {
    const database = createV2Database(':memory:')
    const tableNames = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>
    expect(tableNames.map((row) => row.name)).toEqual(expect.arrayContaining([
      'workers', 'worker_wage_history', 'worker_settlements', 'worker_settlement_tasks',
      'worker_deduction_records', 'worker_settlement_deduction_allocations', 'worker_deduction_balances',
      'worker_refund_records'
    ]))
    expect(database.prepare('SELECT MAX(version) AS version FROM v2_schema_migrations').get()).toEqual({ version: 9 })
    expect(database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'financial_entries'").get())
      .toEqual(expect.objectContaining({ sql: expect.stringContaining('source_type') }))

    database.prepare(`
      INSERT INTO workers (id, name, enabled, created_at, updated_at)
      VALUES ('worker-1', '兼职小林', 1, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `).run()
    database.prepare(`
      INSERT INTO worker_wage_history (id, worker_id, effective_on, hourly_wage_cents, created_at)
      VALUES ('wage-1', 'worker-1', '2026-09-08', 2_000, '2026-09-08T00:00:00.000Z')
    `).run()
    expect(() => database.prepare(`
      INSERT INTO worker_wage_history (id, worker_id, effective_on, hourly_wage_cents, created_at)
      VALUES ('wage-duplicate', 'worker-1', '2026-09-08', 2_200, '2026-09-08T00:00:00.000Z')
    `).run()).toThrow()

    database.prepare(`
      INSERT INTO work_assignments (id, worker_id, assigned_on, process_type, status, created_at, updated_at)
      VALUES ('assignment-1', 'worker-1', '2026-09-08', 'making', 'completed', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `).run()
    database.prepare(`
      INSERT INTO process_tasks (
        id, work_assignment_id, process_type, source_type, planned_quantity,
        planned_minutes, extra_minutes, status, created_at, updated_at
      ) VALUES ('task-1', 'assignment-1', 'making', 'normal_production', 1, 20, 0, 'confirmed', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `).run()
    database.prepare(`
      INSERT INTO financial_entries (id, source_type, direction, business_type, amount_cents, occurred_on, created_at)
      VALUES ('wage-entry-1', 'worker_settlement', 'expense', 'wage_payment', 2_000, '2026-09-08', '2026-09-08T00:00:00.000Z')
    `).run()
    expect(() => database.prepare(`
      INSERT INTO financial_entries (id, source_type, direction, business_type, amount_cents, occurred_on, created_at)
      VALUES ('invalid-source-entry', 'unsupported_source', 'expense', 'wage_payment', 1, '2026-09-08', '2026-09-08T00:00:00.000Z')
    `).run()).toThrow()

    database.prepare(`
      INSERT INTO worker_settlements (
        id, worker_id, period_start_on, period_end_on, status, financial_entry_id, created_at, updated_at
      ) VALUES ('settlement-1', 'worker-1', '2026-09-08', '2026-09-08', 'confirmed', 'wage-entry-1', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `).run()
    database.prepare(`
      INSERT INTO worker_settlements (id, worker_id, period_start_on, period_end_on, status, created_at, updated_at)
      VALUES ('settlement-2', 'worker-1', '2026-09-09', '2026-09-09', 'draft', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `).run()
    expect(() => database.prepare(`
      UPDATE worker_settlements SET financial_entry_id = 'wage-entry-1' WHERE id = 'settlement-2'
    `).run()).toThrow()

    database.prepare(`
      INSERT INTO worker_settlement_tasks (id, settlement_id, process_task_id, status, created_at)
      VALUES ('settlement-task-1', 'settlement-1', 'task-1', 'confirmed', '2026-09-08T00:00:00.000Z')
    `).run()
    expect(() => database.prepare(`
      INSERT INTO worker_settlement_tasks (id, settlement_id, process_task_id, status, created_at)
      VALUES ('settlement-task-2', 'settlement-2', 'task-1', 'confirmed', '2026-09-08T00:00:00.000Z')
    `).run()).toThrow()

    database.prepare(`
      INSERT INTO worker_deduction_records (
        id, worker_id, process_task_id, unqualified_quantity, commission_deduction_cents,
        wage_deduction_cents, glue_deduction_cents, total_deduction_cents, deducted_cents,
        remaining_carryover_cents, status, created_at, updated_at
      ) VALUES ('deduction-1', 'worker-1', 'task-1', 1, 300, 667, 50, 1_017, 0, 1_017, 'pending', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `).run()
    database.prepare(`
      INSERT INTO worker_settlement_deduction_allocations (
        id, settlement_id, deduction_record_id, allocated_cents, status, created_at
      ) VALUES ('allocation-1', 'settlement-1', 'deduction-1', 1_017, 'confirmed', '2026-09-08T00:00:00.000Z')
    `).run()
    expect(() => database.prepare(`
      INSERT INTO worker_settlement_deduction_allocations (
        id, settlement_id, deduction_record_id, allocated_cents, status, created_at
      ) VALUES ('allocation-2', 'settlement-2', 'deduction-1', 1_017, 'confirmed', '2026-09-08T00:00:00.000Z')
    `).run()).toThrow()
    database.prepare(`
      INSERT INTO worker_deduction_balances (id, worker_id, deduction_record_id, remaining_cents, status, created_at, updated_at)
      VALUES ('balance-1', 'worker-1', 'deduction-1', 1_017, 'open', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `).run()
    expect(() => database.prepare(`
      INSERT INTO worker_deduction_balances (id, worker_id, deduction_record_id, remaining_cents, status, created_at, updated_at)
      VALUES ('balance-duplicate', 'worker-1', 'deduction-1', 1_017, 'open', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `).run()).toThrow()
    database.close()
  })


  it('建立日常财务、垫付报销与售后数据基线，并保留旧工资流水关联', () => {
    const database = createV2Database(':memory:')
    const tableNames = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>
    expect(tableNames.map((row) => row.name)).toEqual(expect.arrayContaining([
      'finance_categories', 'advance_payers', 'advance_reimbursements',
      'after_sales_cases', 'after_sales_charge_links', 'worker_refund_records'
    ]))
    expect(database.prepare('SELECT MAX(version) AS version FROM v2_schema_migrations').get()).toEqual({ version: 9 })

    database.prepare(`
      INSERT INTO finance_categories (id, direction, name, enabled, created_at, updated_at)
      VALUES ('expense-category-1', 'expense', '日常耗材', 1, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `).run()
    database.prepare(`
      INSERT INTO finance_categories (id, direction, name, enabled, created_at, updated_at)
      VALUES ('income-category-1', 'income', '其他收入', 1, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `).run()
    database.prepare(`
      INSERT INTO advance_payers (id, name, enabled, created_at, updated_at)
      VALUES ('payer-1', '小林', 1, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `).run()
    database.prepare(`
      INSERT INTO financial_entries (
        id, source_type, direction, business_type, amount_cents, occurred_on,
        category_id, payment_source, advance_payer_id, created_at
      ) VALUES (
        'advance-entry-1', 'manual_expense', 'expense', 'daily_expense', 2_000, '2026-09-08',
        'expense-category-1', 'private_advance', 'payer-1', '2026-09-08T00:00:00.000Z'
      )
    `).run()
    database.prepare(`
      INSERT INTO financial_entries (
        id, source_type, direction, business_type, amount_cents, occurred_on, category_id, created_at
      ) VALUES (
        'income-entry-1', 'manual_income', 'income', 'daily_income', 500, '2026-09-08',
        'income-category-1', '2026-09-08T00:00:00.000Z'
      )
    `).run()
    expect(() => database.prepare("DELETE FROM finance_categories WHERE id = 'expense-category-1'").run()).toThrow()
    expect(() => database.prepare("DELETE FROM advance_payers WHERE id = 'payer-1'").run()).toThrow()
    expect(() => database.prepare(`
      INSERT INTO financial_entries (id, source_type, direction, business_type, amount_cents, occurred_on, payment_source, created_at)
      VALUES ('invalid-private-advance', 'manual_expense', 'expense', 'daily_expense', 100, '2026-09-08', 'private_advance', '2026-09-08T00:00:00.000Z')
    `).run()).toThrow()
    expect(() => database.prepare(`
      INSERT INTO financial_entries (id, source_type, direction, business_type, amount_cents, occurred_on, payment_source, created_at)
      VALUES ('invalid-income-payer', 'manual_income', 'income', 'daily_income', 100, '2026-09-08', 'business_account', '2026-09-08T00:00:00.000Z')
    `).run()).toThrow()

    database.prepare(`
      INSERT INTO financial_entries (id, source_type, direction, business_type, amount_cents, occurred_on, payment_source, created_at)
      VALUES ('reimbursement-entry-1', 'reimbursement', 'expense', 'advance_reimbursement', 2_000, '2026-09-09', 'business_account', '2026-09-09T00:00:00.000Z')
    `).run()
    database.prepare(`
      INSERT INTO advance_reimbursements (id, advance_financial_entry_id, reimbursement_financial_entry_id, created_at)
      VALUES ('reimbursement-1', 'advance-entry-1', 'reimbursement-entry-1', '2026-09-09T00:00:00.000Z')
    `).run()
    database.prepare(`
      INSERT INTO financial_entries (id, source_type, direction, business_type, amount_cents, occurred_on, payment_source, created_at)
      VALUES ('reimbursement-entry-2', 'reimbursement', 'expense', 'advance_reimbursement', 2_000, '2026-09-10', 'business_account', '2026-09-10T00:00:00.000Z')
    `).run()
    expect(() => database.prepare(`
      INSERT INTO advance_reimbursements (id, advance_financial_entry_id, reimbursement_financial_entry_id, created_at)
      VALUES ('reimbursement-duplicate-advance', 'advance-entry-1', 'reimbursement-entry-2', '2026-09-10T00:00:00.000Z')
    `).run()).toThrow()
    database.prepare(`
      INSERT INTO financial_entries (
        id, source_type, direction, business_type, amount_cents, occurred_on,
        category_id, payment_source, advance_payer_id, created_at
      ) VALUES (
        'advance-entry-2', 'manual_expense', 'expense', 'daily_expense', 2_000, '2026-09-10',
        'expense-category-1', 'private_advance', 'payer-1', '2026-09-10T00:00:00.000Z'
      )
    `).run()
    expect(() => database.prepare(`
      INSERT INTO advance_reimbursements (id, advance_financial_entry_id, reimbursement_financial_entry_id, created_at)
      VALUES ('reimbursement-duplicate-payment', 'advance-entry-2', 'reimbursement-entry-1', '2026-09-10T00:00:00.000Z')
    `).run()).toThrow()

    database.prepare(`
      INSERT INTO orders (
        id, code, customer_snapshot_json, initial_confirmed_amount_cents, created_at, updated_at
      ) VALUES ('order-1', 'ORDER-001', '{"name":"客户"}', 10_000, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `).run()
    database.prepare(`
      INSERT INTO shipments (id, order_id, shipped_on, created_at, updated_at)
      VALUES ('shipment-1', 'order-1', '2026-09-08', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `).run()
    database.prepare(`
      INSERT INTO after_sales_cases (
        id, order_id, shipment_id, occurred_on, reason_description, customer_request,
        responsibility_description, handling_description, status, customer_charge_note,
        accounting_cost_cents, note, created_at, updated_at
      ) VALUES (
        'after-sales-1', 'order-1', 'shipment-1', '2026-09-08', '客户不满意包装', '换袋并加封边',
        '待负责人协商', '重新包装并加封边', 'processing', '小额免费处理', 2_000, '不自动生成支出',
        '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z'
      )
    `).run()
    expect(() => database.prepare(`
      INSERT INTO after_sales_cases (
        id, order_id, occurred_on, reason_description, responsibility_description,
        handling_description, status, accounting_cost_cents, created_at, updated_at
      ) VALUES ('after-sales-invalid-cost', 'order-1', '2026-09-08', '测试', '待定', '测试', 'open', -1, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `).run()).toThrow()
    expect(database.prepare('SELECT COUNT(*) AS count FROM financial_entries').get()).toEqual({ count: 5 })
    database.prepare(`
      INSERT INTO financial_entries (id, source_type, direction, business_type, amount_cents, occurred_on, order_id, created_at)
      VALUES ('after-sales-charge-entry-1', 'order_fund', 'income', 'after_sales_charge', 1_000, '2026-09-09', 'order-1', '2026-09-09T00:00:00.000Z')
    `).run()
    database.prepare(`
      INSERT INTO after_sales_charge_links (after_sales_case_id, financial_entry_id, created_at)
      VALUES ('after-sales-1', 'after-sales-charge-entry-1', '2026-09-09T00:00:00.000Z')
    `).run()
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM after_sales_charge_links WHERE after_sales_case_id = 'after-sales-1'
    `).get()).toEqual({ count: 1 })
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
    upgraded.prepare(`
      INSERT INTO workers (id, name, enabled, created_at, updated_at)
      VALUES ('legacy-worker-1', '历史兼职', 1, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `).run()
    upgraded.prepare(`
      INSERT INTO financial_entries (id, source_type, direction, business_type, amount_cents, occurred_on, created_at)
      VALUES ('legacy-wage-entry-1', 'worker_settlement', 'expense', 'wage_payment', 1_800, '2026-09-08', '2026-09-08T00:00:00.000Z')
    `).run()
    upgraded.prepare(`
      INSERT INTO worker_settlements (
        id, worker_id, period_start_on, period_end_on, status, financial_entry_id, created_at, updated_at
      ) VALUES ('legacy-settlement-1', 'legacy-worker-1', '2026-09-08', '2026-09-08', 'confirmed', 'legacy-wage-entry-1', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    `).run()
    runV2Migrations(upgraded)
    expect(upgraded.prepare(`
      SELECT source_type, amount_cents FROM financial_entries WHERE id = 'legacy-wage-entry-1'
    `).get()).toEqual({ source_type: 'worker_settlement', amount_cents: 1_800 })
    expect(upgraded.prepare(`
      SELECT financial_entry_id FROM worker_settlements WHERE id = 'legacy-settlement-1'
    `).get()).toEqual({ financial_entry_id: 'legacy-wage-entry-1' })
    expect(upgraded.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    upgraded.close()
  })

})
