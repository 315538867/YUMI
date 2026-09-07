import type Database from 'better-sqlite3'

interface Migration {
  version: number
  name: string
  run: (database: Database.Database) => void
}

const initialSchema: Migration = {
  version: 1,
  name: 'initial_schema',
  run(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact TEXT,
        default_address TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE,
        category TEXT,
        base_price_cents INTEGER NOT NULL,
        edge_price_cents INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        weight_grams REAL NOT NULL DEFAULT 0,
        loss_rate REAL NOT NULL DEFAULT 0,
        standard_minutes_per_unit REAL NOT NULL DEFAULT 0,
        packaging_cost_cents INTEGER NOT NULL DEFAULT 0,
        commission_cents_per_unit INTEGER NOT NULL DEFAULT 0,
        mold_count INTEGER NOT NULL DEFAULT 1,
        output_per_mold_per_batch INTEGER NOT NULL DEFAULT 1,
        max_batches_per_day INTEGER NOT NULL DEFAULT 1,
        image_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        customer_id TEXT REFERENCES customers(id),
        customer_snapshot_json TEXT NOT NULL,
        expected_ship_date TEXT NOT NULL,
        reserve_days INTEGER NOT NULL,
        production_deadline TEXT NOT NULL,
        production_status TEXT NOT NULL,
        discount_cents INTEGER NOT NULL DEFAULT 0,
        receivable_cents INTEGER NOT NULL DEFAULT 0,
        estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
        actual_cost_cents INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products(id),
        product_snapshot_json TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price_cents INTEGER NOT NULL,
        edge_enabled INTEGER NOT NULL DEFAULT 0,
        edge_quantity INTEGER NOT NULL DEFAULT 0,
        edge_price_cents INTEGER NOT NULL DEFAULT 0,
        discount_cents INTEGER NOT NULL DEFAULT 0,
        estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK(type IN ('receipt', 'refund')),
        amount_cents INTEGER NOT NULL,
        payment_method TEXT NOT NULL,
        paid_at TEXT NOT NULL,
        note TEXT,
        receipt_attachment_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        hourly_wage_cents INTEGER NOT NULL,
        default_work_start TEXT,
        default_work_end TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shifts (
        id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL REFERENCES workers(id),
        shift_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        confirmed_risks_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shift_tasks (
        id TEXT PRIMARY KEY,
        shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        order_item_id TEXT NOT NULL REFERENCES order_items(id),
        product_id TEXT NOT NULL REFERENCES products(id),
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

      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        original_name TEXT NOT NULL,
        storage_path TEXT NOT NULL UNIQUE,
        mime_type TEXT,
        size_bytes INTEGER NOT NULL,
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

      CREATE INDEX IF NOT EXISTS idx_orders_ship_date ON orders(expected_ship_date);
      CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
      CREATE INDEX IF NOT EXISTS idx_shifts_worker_date ON shifts(worker_id, shift_date);
      CREATE INDEX IF NOT EXISTS idx_shift_tasks_shift_id ON shift_tasks(shift_id);
      CREATE INDEX IF NOT EXISTS idx_shift_tasks_product_id ON shift_tasks(product_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
    `)
  }
}

const productManagementSchema = {
  version: 2,
  name: 'product_management_and_cost_settings',
  run(database: Database.Database): void {
    database.exec(`
      ALTER TABLE products ADD COLUMN notes TEXT;
      ALTER TABLE audit_logs ADD COLUMN actor_name TEXT NOT NULL DEFAULT '本机管理员';

      CREATE TABLE IF NOT EXISTS cost_settings_history (
        id TEXT PRIMARY KEY,
        glue_price_cents_per_gram INTEGER NOT NULL,
        monthly_fixed_cost_cents INTEGER NOT NULL,
        target_effective_minutes INTEGER NOT NULL,
        fixed_overhead_hourly_rate_cents INTEGER NOT NULL,
        effective_from TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cost_settings_effective_from
        ON cost_settings_history(effective_from DESC, created_at DESC);
    `)
  }
}

const orderManagementSchema = {
  version: 3,
  name: 'order_management_sorting',
  run(database: Database.Database): void {
    database.exec(`
      ALTER TABLE order_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_order_items_order_sort ON order_items(order_id, sort_order);
    `)
  }
}

const workerManagementSchema = {
  version: 4,
  name: 'worker_wage_history',
  run(database: Database.Database): void {
    database.exec(`
      CREATE TABLE IF NOT EXISTS worker_wage_history (
        id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL REFERENCES workers(id),
        hourly_wage_cents INTEGER NOT NULL,
        effective_from TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_worker_wage_history_worker_date
        ON worker_wage_history(worker_id, effective_from DESC, created_at DESC);
    `)
  }
}

const scheduleRiskPersistenceSchema = {
  version: 5,
  name: 'schedule_risk_details',
  run(database: Database.Database): void {
    database.exec(`
      ALTER TABLE shifts ADD COLUMN detected_risks_json TEXT NOT NULL DEFAULT '[]';
    `)
  }
}

const operationalWorkflowSchema = {
  version: 6,
  name: 'operational_workflow_refinements',
  run(database: Database.Database): void {
    database.exec(`
      ALTER TABLE products ADD COLUMN accessory_cost_cents INTEGER NOT NULL DEFAULT 0
        CHECK(accessory_cost_cents >= 0);
      ALTER TABLE products ADD COLUMN replacement_bag_cost_cents INTEGER NOT NULL DEFAULT 0
        CHECK(replacement_bag_cost_cents >= 0);
      ALTER TABLE order_items ADD COLUMN accessory_cost_cents INTEGER NOT NULL DEFAULT 0
        CHECK(accessory_cost_cents >= 0);
      ALTER TABLE order_items ADD COLUMN replacement_bag_cost_cents INTEGER NOT NULL DEFAULT 0
        CHECK(replacement_bag_cost_cents >= 0);

      ALTER TABLE shift_tasks RENAME TO shift_tasks_legacy;
      ALTER TABLE shifts RENAME TO shifts_legacy;

      CREATE TABLE shifts (
        id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL REFERENCES workers(id),
        shift_date TEXT NOT NULL,
        start_time TEXT,
        end_time TEXT,
        extra_minutes INTEGER NOT NULL DEFAULT 0 CHECK(extra_minutes >= 0),
        status TEXT NOT NULL DEFAULT 'pending',
        confirmed_risks_json TEXT NOT NULL DEFAULT '[]',
        detected_risks_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE shift_tasks (
        id TEXT PRIMARY KEY,
        shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        order_item_id TEXT NOT NULL REFERENCES order_items(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        planned_quantity INTEGER NOT NULL,
        estimated_minutes INTEGER NOT NULL,
        actual_minutes INTEGER,
        qualified_quantity INTEGER NOT NULL DEFAULT 0,
        unqualified_quantity INTEGER,
        completed_quantity INTEGER,
        rework_quantity INTEGER NOT NULL DEFAULT 0,
        scrap_quantity INTEGER NOT NULL DEFAULT 0,
        actual_labor_cost_cents INTEGER NOT NULL DEFAULT 0,
        commission_cost_cents INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK(completed_quantity IS NULL OR completed_quantity >= 0),
        CHECK(unqualified_quantity IS NULL OR unqualified_quantity >= 0)
      );

      INSERT INTO shifts (
        id, worker_id, shift_date, start_time, end_time, extra_minutes, status,
        confirmed_risks_json, detected_risks_json, notes, created_at, updated_at
      )
      SELECT
        id, worker_id, shift_date, start_time, end_time, 0, status,
        confirmed_risks_json, detected_risks_json, notes, created_at, updated_at
      FROM shifts_legacy;

      INSERT INTO shift_tasks (
        id, shift_id, order_item_id, product_id, planned_quantity, estimated_minutes,
        actual_minutes, qualified_quantity, unqualified_quantity, completed_quantity,
        rework_quantity, scrap_quantity, actual_labor_cost_cents, commission_cost_cents,
        created_at, updated_at
      )
      SELECT
        id, shift_id, order_item_id, product_id, planned_quantity, estimated_minutes,
        actual_minutes, qualified_quantity, NULL, NULL,
        rework_quantity, scrap_quantity, actual_labor_cost_cents, commission_cost_cents,
        created_at, updated_at
      FROM shift_tasks_legacy;

      DROP TABLE shift_tasks_legacy;
      DROP TABLE shifts_legacy;

      CREATE INDEX IF NOT EXISTS idx_shifts_worker_date ON shifts(worker_id, shift_date);
      CREATE INDEX IF NOT EXISTS idx_shift_tasks_shift_id ON shift_tasks(shift_id);
      CREATE INDEX IF NOT EXISTS idx_shift_tasks_product_id ON shift_tasks(product_id);

      CREATE TABLE IF NOT EXISTS shipments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id),
        shipped_at TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shipment_items (
        id TEXT PRIMARY KEY,
        shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
        order_item_id TEXT NOT NULL REFERENCES order_items(id),
        quantity INTEGER NOT NULL CHECK(quantity >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(shipment_id, order_item_id)
      );

      CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments(order_id);
      CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment_id ON shipment_items(shipment_id);
      CREATE INDEX IF NOT EXISTS idx_shipment_items_order_item_id ON shipment_items(order_item_id);
    `)
  }
}

const defaultHourlyWageSchema = {
  version: 7,
  name: 'global_default_worker_hourly_wage',
  run(database: Database.Database): void {
    database.exec(`
      ALTER TABLE cost_settings_history
      ADD COLUMN default_hourly_wage_cents INTEGER NOT NULL DEFAULT 0;
    `)
  }
}

const shipmentManifestSnapshotSchema = {
  version: 8,
  name: 'shipment_manifest_snapshots',
  run(database: Database.Database): void {
    database.exec(`
      ALTER TABLE shipments ADD COLUMN manifest_snapshot_json TEXT;
    `)
  }
}

const productAdditionalCostSchema = {
  version: 10,
  name: 'product_fluff_packing_and_edge_costs',
  run(database: Database.Database): void {
    database.exec(`
      ALTER TABLE products ADD COLUMN fluff_packing_cost_cents INTEGER NOT NULL DEFAULT 0
        CHECK(fluff_packing_cost_cents >= 0);
      ALTER TABLE products ADD COLUMN edge_cost_cents INTEGER NOT NULL DEFAULT 0
        CHECK(edge_cost_cents >= 0);
    `)
  }
}

const gluePricePrecisionSchema = {
  version: 9,
  name: 'glue_price_milli_yuan_precision',
  run(database: Database.Database): void {
    database.exec(`
      ALTER TABLE cost_settings_history
      RENAME COLUMN glue_price_cents_per_gram TO glue_price_milli_yuan_per_gram;
      UPDATE cost_settings_history
      SET glue_price_milli_yuan_per_gram = glue_price_milli_yuan_per_gram * 10;
    `)
  }
}

const migrations = [
  initialSchema,
  productManagementSchema,
  orderManagementSchema,
  workerManagementSchema,
  scheduleRiskPersistenceSchema,
  operationalWorkflowSchema,
  defaultHourlyWageSchema,
  shipmentManifestSnapshotSchema,
  gluePricePrecisionSchema,
  productAdditionalCostSchema
]

export function runMigrations(database: Database.Database): void {
  database.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)'
  )
  const appliedVersions = new Set(
    database
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => (row as { version: number }).version)
  )
  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue
    database.transaction(() => {
      migration.run(database)
      database
        .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, new Date().toISOString())
    })()
  }
}
