import type Database from 'better-sqlite3'

interface V2Migration {
  version: number
  name: string
  run: (database: Database.Database) => void
}

function hasTable(database: Database.Database, tableName: string): boolean {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName)
  )
}

const v2MasterData: V2Migration = {
  version: 1,
  name: 'v2_master_data',
  run(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL CHECK(length(trim(name)) > 0),
        contact TEXT,
        default_address TEXT,
        notes TEXT,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL CHECK(length(trim(name)) > 0),
        code TEXT UNIQUE,
        category TEXT,
        base_price_cents INTEGER NOT NULL DEFAULT 0 CHECK(base_price_cents >= 0),
        material_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(material_cost_cents >= 0),
        packaging_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(packaging_cost_cents >= 0),
        accessory_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(accessory_cost_cents >= 0),
        replacement_bag_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(replacement_bag_cost_cents >= 0),
        edge_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(edge_cost_cents >= 0),
        standard_making_minutes INTEGER NOT NULL DEFAULT 0 CHECK(standard_making_minutes >= 0),
        making_commission_cents INTEGER NOT NULL DEFAULT 0 CHECK(making_commission_cents >= 0),
        making_glue_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(making_glue_cost_cents >= 0),
        enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
        image_attachment_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        original_name TEXT NOT NULL,
        storage_key TEXT NOT NULL UNIQUE,
        mime_type TEXT,
        size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
        ON audit_logs(entity_type, entity_id, created_at DESC);
    `)
  }
}

const v2OrderFoundation: V2Migration = {
  version: 2,
  name: 'v2_order_foundation',
  run(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        customer_id TEXT REFERENCES customers(id),
        customer_snapshot_json TEXT NOT NULL,
        initial_confirmed_amount_cents INTEGER NOT NULL CHECK(initial_confirmed_amount_cents >= 0),
        expected_ship_date TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id TEXT REFERENCES products(id),
        product_snapshot_json TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS order_amount_adjustments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        amount_cents INTEGER NOT NULL CHECK(amount_cents <> 0),
        occurred_on TEXT NOT NULL,
        reason TEXT NOT NULL CHECK(length(trim(reason)) > 0),
        note TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS order_content_changes (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        occurred_on TEXT NOT NULL,
        description TEXT NOT NULL CHECK(length(trim(description)) > 0),
        before_items_snapshot_json TEXT NOT NULL,
        after_items_snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS financial_entries (
        id TEXT PRIMARY KEY,
        direction TEXT NOT NULL CHECK(direction IN ('income', 'expense')),
        business_type TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
        occurred_on TEXT NOT NULL,
        payment_method TEXT,
        order_id TEXT REFERENCES orders(id),
        attachment_id TEXT REFERENCES attachments(id),
        reversal_of_entry_id TEXT REFERENCES financial_entries(id),
        note TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(reversal_of_entry_id)
      );

      CREATE TABLE IF NOT EXISTS shipments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        shipped_on TEXT NOT NULL,
        carrier TEXT,
        tracking_number TEXT,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shipment_items (
        id TEXT PRIMARY KEY,
        shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
        order_item_id TEXT NOT NULL REFERENCES order_items(id),
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        created_at TEXT NOT NULL,
        UNIQUE(shipment_id, order_item_id)
      );

      CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_order_amount_adjustments_order_id ON order_amount_adjustments(order_id);
      CREATE INDEX IF NOT EXISTS idx_order_content_changes_order_id ON order_content_changes(order_id);
      CREATE INDEX IF NOT EXISTS idx_financial_entries_order_id ON financial_entries(order_id);
      CREATE INDEX IF NOT EXISTS idx_financial_entries_occurred_on ON financial_entries(occurred_on);
      CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments(order_id);
      CREATE INDEX IF NOT EXISTS idx_shipment_items_order_item_id ON shipment_items(order_item_id);
    `)
  }
}

const v2OrderItemPosition: V2Migration = {
  version: 3,
  name: 'v2_order_item_position',
  run(database) {
    database.exec(`
      ALTER TABLE order_items ADD COLUMN line_no INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_order_items_order_line ON order_items(order_id, line_no, id);
    `)
  }
}

const v2FulfillmentFoundation: V2Migration = {
  version: 4,
  name: 'v2_fulfillment_foundation',
  run(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS work_assignments (
        id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL,
        assigned_on TEXT NOT NULL,
        process_type TEXT NOT NULL CHECK(process_type IN ('making', 'fluffing_bagging', 'packing', 'shipping')),
        status TEXT NOT NULL CHECK(status IN ('draft', 'scheduled', 'cancelled', 'completed')),
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS process_tasks (
        id TEXT PRIMARY KEY,
        work_assignment_id TEXT NOT NULL REFERENCES work_assignments(id) ON DELETE CASCADE,
        order_item_id TEXT REFERENCES order_items(id),
        process_type TEXT NOT NULL CHECK(process_type IN ('making', 'fluffing_bagging', 'packing', 'shipping')),
        source_type TEXT NOT NULL CHECK(source_type IN ('normal_production', 'rework', 'after_sales_replacement', 'manager_arrangement')),
        planned_quantity INTEGER CHECK(planned_quantity IS NULL OR planned_quantity >= 0),
        planned_minutes INTEGER NOT NULL CHECK(planned_minutes >= 0),
        extra_minutes INTEGER NOT NULL DEFAULT 0 CHECK(extra_minutes >= 0),
        status TEXT NOT NULL CHECK(status IN ('pending', 'pending_inspection', 'confirmed', 'cancelled')),
        hourly_wage_cents INTEGER CHECK(hourly_wage_cents IS NULL OR hourly_wage_cents >= 0),
        piece_rate_cents INTEGER CHECK(piece_rate_cents IS NULL OR piece_rate_cents >= 0),
        glue_cost_cents INTEGER CHECK(glue_cost_cents IS NULL OR glue_cost_cents >= 0),
        rate_snapshot_json TEXT,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS process_results (
        id TEXT PRIMARY KEY,
        process_task_id TEXT NOT NULL REFERENCES process_tasks(id) ON DELETE CASCADE,
        completed_quantity INTEGER NOT NULL CHECK(completed_quantity > 0),
        actual_minutes INTEGER CHECK(actual_minutes IS NULL OR actual_minutes >= 0),
        submitted_on TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS quality_inspections (
        id TEXT PRIMARY KEY,
        process_result_id TEXT NOT NULL UNIQUE REFERENCES process_results(id) ON DELETE RESTRICT,
        process_task_id TEXT NOT NULL REFERENCES process_tasks(id) ON DELETE RESTRICT,
        qualified_quantity INTEGER NOT NULL CHECK(qualified_quantity >= 0),
        unqualified_quantity INTEGER NOT NULL CHECK(unqualified_quantity >= 0),
        inspected_on TEXT NOT NULL,
        reason_note TEXT,
        requires_rework INTEGER NOT NULL DEFAULT 0 CHECK(requires_rework IN (0, 1)),
        note TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fulfillment_events (
        id TEXT PRIMARY KEY,
        order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
        event_type TEXT NOT NULL CHECK(event_type IN (
          'opening_wip', 'making_qualified', 'fluffing_bagging_qualified', 'packing_completed',
          'shipment', 'manager_adjustment', 'after_sales_return', 'after_sales_replacement'
        )),
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        source_stage TEXT CHECK(source_stage IS NULL OR source_stage IN ('making', 'fluffing_bagging', 'packing', 'ready_to_ship', 'shipped')),
        target_stage TEXT CHECK(target_stage IS NULL OR target_stage IN ('making', 'fluffing_bagging', 'packing', 'ready_to_ship', 'shipped')),
        source_record_type TEXT,
        source_record_id TEXT,
        occurred_on TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS opening_wip_records (
        id TEXT PRIMARY KEY,
        order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
        target_stage TEXT NOT NULL CHECK(target_stage IN ('fluffing_bagging', 'packing', 'ready_to_ship')),
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        occurred_on TEXT NOT NULL,
        note TEXT,
        fulfillment_event_id TEXT NOT NULL UNIQUE REFERENCES fulfillment_events(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_work_assignments_worker_day
        ON work_assignments(worker_id, assigned_on, process_type);
      CREATE INDEX IF NOT EXISTS idx_process_tasks_assignment
        ON process_tasks(work_assignment_id, process_type, status);
      CREATE INDEX IF NOT EXISTS idx_process_tasks_order_item
        ON process_tasks(order_item_id, process_type, status);
      CREATE INDEX IF NOT EXISTS idx_process_results_task
        ON process_results(process_task_id, submitted_on);
      CREATE INDEX IF NOT EXISTS idx_quality_inspections_task
        ON quality_inspections(process_task_id, inspected_on);
      CREATE INDEX IF NOT EXISTS idx_fulfillment_events_order_item
        ON fulfillment_events(order_item_id, occurred_on, event_type);
      CREATE INDEX IF NOT EXISTS idx_opening_wip_order_item
        ON opening_wip_records(order_item_id, target_stage, occurred_on);
    `)
  }
}

const migrations: readonly V2Migration[] = [
  v2MasterData,
  v2OrderFoundation,
  v2OrderItemPosition,
  v2FulfillmentFoundation
]

/**
 * V2 使用独立的迁移表，不会把 V1 的 schema_migrations 当成已初始化状态。
 */
export function runV2Migrations(database: Database.Database): void {
  const hasV2Migrations = hasTable(database, 'v2_schema_migrations')
  if (!hasV2Migrations && hasTable(database, 'schema_migrations')) {
    throw new Error('拒绝将 V2 schema 写入疑似 V1 数据库')
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS v2_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)
  const appliedVersions = new Set(
    (
      database.prepare('SELECT version FROM v2_schema_migrations').all() as Array<{ version: number }>
    ).map((row) => row.version)
  )

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue
    database.transaction(() => {
      migration.run(database)
      database
        .prepare('INSERT INTO v2_schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, new Date().toISOString())
    })()
  }
}
