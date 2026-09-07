import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createV2Database } from './v2-connection'
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
    ).toEqual({ version: 4 })
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
      count: 4
    })
    expect(
      upgraded
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'order_content_changes'")
        .get()
    ).toBeTruthy()
    upgraded.close()
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

})
