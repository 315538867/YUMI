import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createDatabase } from './connection'
import { runMigrations } from './migrations'

type TableColumn = {
  name: string
  notnull: number
  dflt_value: string | null
}

function tableColumns(database: Database.Database, tableName: string): TableColumn[] {
  return database.prepare(`PRAGMA table_info(${tableName})`).all() as TableColumn[]
}

function column(database: Database.Database, tableName: string, columnName: string): TableColumn {
  const result = tableColumns(database, tableName).find((item) => item.name === columnName)
  if (!result) throw new Error(`未找到 ${tableName}.${columnName}`)
  return result
}

describe('SQLite 数据基础', () => {
  it('可以建立内存数据库并完成运营流程迁移', () => {
    const database = createDatabase(':memory:')
    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'products'")
        .get()
    ).toBeTruthy()
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cost_settings_history'"
        )
        .get()
    ).toBeTruthy()
    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'shipments'")
        .get()
    ).toBeTruthy()
    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'shipment_items'")
        .get()
    ).toBeTruthy()
    expect(database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual(
      {
        version: 9
      }
    )

    expect(column(database, 'products', 'accessory_cost_cents').dflt_value).toBe('0')
    expect(column(database, 'products', 'replacement_bag_cost_cents').dflt_value).toBe('0')
    expect(column(database, 'order_items', 'accessory_cost_cents').dflt_value).toBe('0')
    expect(column(database, 'order_items', 'replacement_bag_cost_cents').dflt_value).toBe('0')
    expect(column(database, 'shift_tasks', 'completed_quantity').notnull).toBe(0)
    expect(column(database, 'shift_tasks', 'unqualified_quantity').notnull).toBe(0)
    expect(column(database, 'shifts', 'start_time').notnull).toBe(0)
    expect(column(database, 'shifts', 'end_time').notnull).toBe(0)
    expect(column(database, 'shifts', 'extra_minutes').dflt_value).toBe('0')

    database.close()
  })

  it('升级旧排班时保留历史数据，并为新排班字段提供兼容默认值', () => {
    const database = new Database(':memory:')
    database.pragma('foreign_keys = ON')
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations (version, name, applied_at) VALUES
        (1, 'initial_schema', '2026-09-01T00:00:00.000Z'),
        (2, 'product_management_and_cost_settings', '2026-09-01T00:00:00.000Z'),
        (3, 'order_management_sorting', '2026-09-01T00:00:00.000Z'),
        (4, 'worker_wage_history', '2026-09-01T00:00:00.000Z'),
        (5, 'schedule_risk_details', '2026-09-01T00:00:00.000Z');

      CREATE TABLE workers (id TEXT PRIMARY KEY);
      CREATE TABLE cost_settings_history (
        id TEXT PRIMARY KEY,
        glue_price_cents_per_gram INTEGER NOT NULL,
        monthly_fixed_cost_cents INTEGER NOT NULL,
        target_effective_minutes INTEGER NOT NULL,
        fixed_overhead_hourly_rate_cents INTEGER NOT NULL,
        effective_from TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO cost_settings_history (
        id, glue_price_cents_per_gram, monthly_fixed_cost_cents, target_effective_minutes,
        fixed_overhead_hourly_rate_cents, effective_from, created_at
      ) VALUES ('cost-legacy', 50, 480000, 9600, 3000, '2026-09-01', '2026-09-01T00:00:00.000Z');
      CREATE TABLE products (id TEXT PRIMARY KEY);
      CREATE TABLE orders (id TEXT PRIMARY KEY);
      CREATE TABLE order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, product_id TEXT NOT NULL);
      CREATE TABLE shifts (
        id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL,
        shift_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        confirmed_risks_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        detected_risks_json TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TABLE shift_tasks (
        id TEXT PRIMARY KEY,
        shift_id TEXT NOT NULL,
        order_item_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        planned_quantity INTEGER NOT NULL,
        estimated_minutes INTEGER NOT NULL,
        actual_minutes INTEGER,
        qualified_quantity INTEGER NOT NULL DEFAULT 0,
        rework_quantity INTEGER NOT NULL DEFAULT 0,
        scrap_quantity INTEGER NOT NULL DEFAULT 0,
        actual_labor_cost_cents INTEGER NOT NULL DEFAULT 0,
        commission_cost_cents INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_shifts_worker_date ON shifts(worker_id, shift_date);

      INSERT INTO workers (id) VALUES ('worker-1');
      INSERT INTO products (id) VALUES ('product-1');
      INSERT INTO orders (id) VALUES ('order-1');
      INSERT INTO order_items (id, order_id, product_id) VALUES ('item-1', 'order-1', 'product-1');
      INSERT INTO shifts (
        id, worker_id, shift_date, start_time, end_time, status,
        confirmed_risks_json, detected_risks_json, notes, created_at, updated_at
      ) VALUES (
        'shift-legacy', 'worker-1', '2026-09-01', '09:00', '18:00', 'completed',
        '["SHIFT_UNDER_CAPACITY"]', '["DEADLINE_RISK"]', '历史备注',
        '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'
      );
      INSERT INTO shift_tasks (
        id, shift_id, order_item_id, product_id, planned_quantity, estimated_minutes,
        actual_minutes, qualified_quantity, rework_quantity, scrap_quantity,
        actual_labor_cost_cents, commission_cost_cents, created_at, updated_at
      ) VALUES (
        'task-legacy', 'shift-legacy', 'item-1', 'product-1', 20, 40,
        35, 18, 1, 1, 500, 100,
        '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'
      );
    `)

    runMigrations(database)

    expect(database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual(
      {
        version: 9
      }
    )
    expect(column(database, 'shipments', 'manifest_snapshot_json').type).toBe('TEXT')
    expect(column(database, 'cost_settings_history', 'glue_price_milli_yuan_per_gram').type).toBe(
      'INTEGER'
    )
    expect(
      database
        .prepare(
          "SELECT glue_price_milli_yuan_per_gram FROM cost_settings_history WHERE id = 'cost-legacy'"
        )
        .get()
    ).toEqual({ glue_price_milli_yuan_per_gram: 500 })
    expect(column(database, 'cost_settings_history', 'default_hourly_wage_cents').dflt_value).toBe(
      '0'
    )
    expect(
      database
        .prepare(
          "SELECT default_hourly_wage_cents FROM cost_settings_history WHERE id = 'cost-legacy'"
        )
        .get()
    ).toEqual({ default_hourly_wage_cents: 0 })
    expect(
      database
        .prepare(
          `SELECT id, shift_date, start_time, end_time, status, confirmed_risks_json,
            detected_risks_json, notes, extra_minutes
           FROM shifts WHERE id = 'shift-legacy'`
        )
        .get()
    ).toEqual({
      id: 'shift-legacy',
      shift_date: '2026-09-01',
      start_time: '09:00',
      end_time: '18:00',
      status: 'completed',
      confirmed_risks_json: '["SHIFT_UNDER_CAPACITY"]',
      detected_risks_json: '["DEADLINE_RISK"]',
      notes: '历史备注',
      extra_minutes: 0
    })
    expect(
      database
        .prepare(
          `SELECT planned_quantity, estimated_minutes, actual_minutes, qualified_quantity,
            rework_quantity, scrap_quantity, completed_quantity, unqualified_quantity
           FROM shift_tasks WHERE id = 'task-legacy'`
        )
        .get()
    ).toEqual({
      planned_quantity: 20,
      estimated_minutes: 40,
      actual_minutes: 35,
      qualified_quantity: 18,
      rework_quantity: 1,
      scrap_quantity: 1,
      completed_quantity: null,
      unqualified_quantity: null
    })
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_shifts_worker_date'"
        )
        .get()
    ).toBeTruthy()

    database.close()
  })
})
