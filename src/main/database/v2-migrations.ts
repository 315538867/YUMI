import type Database from 'better-sqlite3'

interface V2Migration {
  version: number
  name: string
  run: (database: Database.Database) => void
  requiresForeignKeysDisabled?: boolean
}

function hasTable(database: Database.Database, tableName: string): boolean {
  return Boolean(
    database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName)
  )
}

function hasColumn(database: Database.Database, tableName: string, columnName: string): boolean {
  return (
    database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  ).some((column) => column.name === columnName)
}

function addColumnIfMissing(
  database: Database.Database,
  tableName: string,
  columnName: string,
  definition: string
): void {
  if (!hasColumn(database, tableName, columnName)) {
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition};`)
  }
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
        packaging_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(packaging_cost_cents >= 0),
        accessory_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(accessory_cost_cents >= 0),
        replacement_bag_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(replacement_bag_cost_cents >= 0),
        edge_consumable_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(edge_consumable_cost_cents >= 0),
        fixed_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(fixed_cost_cents >= 0),
        unit_weight_milligrams INTEGER NOT NULL DEFAULT 0 CHECK(unit_weight_milligrams >= 0),
        standard_making_minutes INTEGER NOT NULL DEFAULT 0 CHECK(standard_making_minutes >= 0),
        expected_fluffing_bagging_minutes INTEGER NOT NULL DEFAULT 0 CHECK(expected_fluffing_bagging_minutes >= 0),
        expected_edge_sewing_minutes INTEGER NOT NULL DEFAULT 0 CHECK(expected_edge_sewing_minutes >= 0),
        expected_packing_minutes INTEGER NOT NULL DEFAULT 0 CHECK(expected_packing_minutes >= 0),
        making_commission_cents INTEGER NOT NULL DEFAULT 0 CHECK(making_commission_cents >= 0),
        fluffing_bagging_commission_cents INTEGER NOT NULL DEFAULT 0 CHECK(fluffing_bagging_commission_cents >= 0),
        edge_sewing_commission_cents INTEGER NOT NULL DEFAULT 0 CHECK(edge_sewing_commission_cents >= 0),
        mold_count INTEGER NOT NULL DEFAULT 0 CHECK(mold_count >= 0),
        output_per_mold_per_batch INTEGER NOT NULL DEFAULT 0 CHECK(output_per_mold_per_batch >= 0),
        max_batches_per_day INTEGER NOT NULL DEFAULT 0 CHECK(max_batches_per_day >= 0),
        daily_capacity INTEGER NOT NULL DEFAULT 0 CHECK(daily_capacity >= 0),
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
        order_discount_cents INTEGER NOT NULL DEFAULT 0 CHECK(order_discount_cents >= 0),
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
        edge_enabled INTEGER NOT NULL DEFAULT 0 CHECK(edge_enabled IN (0, 1)),
        edge_quantity INTEGER NOT NULL DEFAULT 0 CHECK(edge_quantity >= 0),
        edge_unit_price_cents INTEGER NOT NULL DEFAULT 0 CHECK(edge_unit_price_cents >= 0),
        item_discount_cents INTEGER NOT NULL DEFAULT 0 CHECK(item_discount_cents >= 0),
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
        process_type TEXT NOT NULL CHECK(process_type IN ('making', 'fluffing_bagging', 'edge_sewing', 'packing')),
        status TEXT NOT NULL CHECK(status IN ('draft', 'scheduled', 'cancelled', 'completed')),
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS process_tasks (
        id TEXT PRIMARY KEY,
        work_assignment_id TEXT NOT NULL REFERENCES work_assignments(id) ON DELETE CASCADE,
        order_item_id TEXT REFERENCES order_items(id),
        process_type TEXT NOT NULL CHECK(process_type IN ('making', 'fluffing_bagging', 'edge_sewing', 'packing')),
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
          'inventory_allocation', 'making_qualified', 'fluffing_bagging_completed', 'edge_sewing_completed',
          'packing_completed', 'shipment', 'manager_adjustment', 'after_sales_return', 'after_sales_replacement'
        )),
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        source_stage TEXT CHECK(source_stage IS NULL OR source_stage IN ('making', 'fluffing_bagging', 'edge_sewing', 'packing', 'ready_to_ship', 'shipped')),
        target_stage TEXT CHECK(target_stage IS NULL OR target_stage IN ('making', 'fluffing_bagging', 'edge_sewing', 'packing', 'ready_to_ship', 'shipped')),
        source_record_type TEXT,
        source_record_id TEXT,
        occurred_on TEXT NOT NULL,
        note TEXT,
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
    `)
  }
}

const v2WorkerSettlementFoundation: V2Migration = {
  version: 5,
  name: 'v2_worker_settlement_foundation',
  run(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS workers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL CHECK(length(trim(name)) > 0),
        enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS worker_wage_history (
        id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
        effective_on TEXT NOT NULL,
        hourly_wage_cents INTEGER NOT NULL CHECK(hourly_wage_cents >= 0),
        created_at TEXT NOT NULL,
        UNIQUE(worker_id, effective_on)
      );

      CREATE TABLE IF NOT EXISTS worker_settlements (
        id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
        period_start_on TEXT NOT NULL,
        period_end_on TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('draft', 'confirmed', 'adjusted')),
        timed_wage_cents INTEGER NOT NULL DEFAULT 0 CHECK(timed_wage_cents >= 0),
        commission_cents INTEGER NOT NULL DEFAULT 0 CHECK(commission_cents >= 0),
        material_deduction_cents INTEGER NOT NULL DEFAULT 0 CHECK(material_deduction_cents >= 0),
        adjustment_cents INTEGER NOT NULL DEFAULT 0,
        candidate_wage_cents INTEGER NOT NULL DEFAULT 0 CHECK(candidate_wage_cents >= 0),
        current_deduction_cents INTEGER NOT NULL DEFAULT 0 CHECK(current_deduction_cents >= 0),
        carried_deduction_cents INTEGER NOT NULL DEFAULT 0 CHECK(carried_deduction_cents >= 0),
        actual_deduction_cents INTEGER NOT NULL DEFAULT 0 CHECK(actual_deduction_cents >= 0),
        continuing_carryover_cents INTEGER NOT NULL DEFAULT 0 CHECK(continuing_carryover_cents >= 0),
        other_adjustment_cents INTEGER NOT NULL DEFAULT 0,
        final_paid_amount_cents INTEGER CHECK(final_paid_amount_cents IS NULL OR final_paid_amount_cents >= 0),
        paid_on TEXT,
        manager_note TEXT,
        financial_entry_id TEXT UNIQUE REFERENCES financial_entries(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK(period_end_on >= period_start_on)
      );

      CREATE TABLE IF NOT EXISTS worker_settlement_making_sources (
        id TEXT PRIMARY KEY,
        settlement_id TEXT NOT NULL REFERENCES worker_settlements(id) ON DELETE CASCADE,
        process_task_id TEXT NOT NULL REFERENCES process_tasks(id) ON DELETE RESTRICT,
        quality_inspection_id TEXT NOT NULL REFERENCES quality_inspections(id) ON DELETE RESTRICT,
        order_id TEXT REFERENCES orders(id) ON DELETE RESTRICT,
        order_item_id TEXT REFERENCES order_items(id) ON DELETE RESTRICT,
        occurred_on TEXT NOT NULL,
        qualified_quantity INTEGER NOT NULL DEFAULT 0 CHECK(qualified_quantity >= 0),
        unqualified_quantity INTEGER NOT NULL DEFAULT 0 CHECK(unqualified_quantity >= 0),
        piece_rate_cents INTEGER CHECK(piece_rate_cents IS NULL OR piece_rate_cents >= 0),
        qualified_commission_cents INTEGER NOT NULL DEFAULT 0 CHECK(qualified_commission_cents >= 0),
        material_deduction_cents INTEGER NOT NULL DEFAULT 0 CHECK(material_deduction_cents >= 0),
        status TEXT NOT NULL CHECK(status IN ('draft', 'confirmed', 'cancelled')),
        created_at TEXT NOT NULL,
        UNIQUE(settlement_id, quality_inspection_id)
      );

      CREATE TABLE IF NOT EXISTS worker_settlement_timed_sources (
        id TEXT PRIMARY KEY,
        settlement_id TEXT NOT NULL REFERENCES worker_settlements(id) ON DELETE CASCADE,
        work_time_review_id TEXT NOT NULL REFERENCES work_time_reviews(id) ON DELETE RESTRICT,
        process_type TEXT NOT NULL CHECK(process_type IN ('fluffing_bagging', 'edge_sewing', 'packing')),
        occurred_on TEXT NOT NULL,
        approved_minutes INTEGER NOT NULL CHECK(approved_minutes > 0),
        hourly_wage_cents_snapshot INTEGER NOT NULL CHECK(hourly_wage_cents_snapshot >= 0),
        timed_wage_cents INTEGER NOT NULL DEFAULT 0 CHECK(timed_wage_cents >= 0),
        commission_cents INTEGER NOT NULL DEFAULT 0 CHECK(commission_cents >= 0),
        status TEXT NOT NULL CHECK(status IN ('draft', 'confirmed', 'cancelled')),
        created_at TEXT NOT NULL,
        UNIQUE(settlement_id, work_time_review_id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_worker_settlement_timed_review_confirmed
        ON worker_settlement_timed_sources(work_time_review_id) WHERE status = 'confirmed';

      CREATE TABLE IF NOT EXISTS worker_settlement_timed_items (
        id TEXT PRIMARY KEY,
        timed_source_id TEXT NOT NULL REFERENCES worker_settlement_timed_sources(id) ON DELETE CASCADE,
        process_task_id TEXT NOT NULL REFERENCES process_tasks(id) ON DELETE RESTRICT,
        order_item_id TEXT REFERENCES order_items(id) ON DELETE RESTRICT,
        completed_quantity INTEGER NOT NULL CHECK(completed_quantity > 0),
        piece_rate_cents INTEGER CHECK(piece_rate_cents IS NULL OR piece_rate_cents >= 0),
        commission_cents INTEGER NOT NULL DEFAULT 0 CHECK(commission_cents >= 0),
        created_at TEXT NOT NULL,
        UNIQUE(timed_source_id, process_task_id)
      );

      CREATE TABLE IF NOT EXISTS worker_settlement_adjustments (
        id TEXT PRIMARY KEY,
        settlement_id TEXT NOT NULL REFERENCES worker_settlements(id) ON DELETE CASCADE,
        work_time_review_id TEXT NOT NULL REFERENCES work_time_reviews(id) ON DELETE RESTRICT,
        original_settlement_id TEXT NOT NULL REFERENCES worker_settlements(id) ON DELETE RESTRICT,
        process_type TEXT NOT NULL CHECK(process_type IN ('fluffing_bagging', 'edge_sewing', 'packing')),
        original_minutes INTEGER NOT NULL CHECK(original_minutes >= 0),
        corrected_minutes INTEGER NOT NULL CHECK(corrected_minutes >= 0),
        hourly_wage_cents_snapshot INTEGER NOT NULL CHECK(hourly_wage_cents_snapshot >= 0),
        amount_cents INTEGER NOT NULL,
        reason TEXT NOT NULL CHECK(length(trim(reason)) > 0),
        note TEXT,
        status TEXT NOT NULL CHECK(status IN ('draft', 'confirmed', 'cancelled')),
        created_at TEXT NOT NULL,
        UNIQUE(settlement_id, work_time_review_id)
      );

      CREATE TABLE IF NOT EXISTS worker_deduction_records (
        id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
        work_assignment_id TEXT REFERENCES work_assignments(id) ON DELETE RESTRICT,
        process_task_id TEXT NOT NULL REFERENCES process_tasks(id) ON DELETE RESTRICT,
        process_result_id TEXT REFERENCES process_results(id) ON DELETE RESTRICT,
        quality_inspection_id TEXT UNIQUE REFERENCES quality_inspections(id) ON DELETE RESTRICT,
        order_id TEXT REFERENCES orders(id) ON DELETE RESTRICT,
        order_item_id TEXT REFERENCES order_items(id) ON DELETE RESTRICT,
        unqualified_quantity INTEGER NOT NULL CHECK(unqualified_quantity > 0),
        material_deduction_cents INTEGER NOT NULL DEFAULT 0 CHECK(material_deduction_cents >= 0),
        total_deduction_cents INTEGER NOT NULL CHECK(total_deduction_cents >= 0),
        deducted_cents INTEGER NOT NULL DEFAULT 0 CHECK(deducted_cents >= 0),
        remaining_carryover_cents INTEGER NOT NULL DEFAULT 0 CHECK(remaining_carryover_cents >= 0),
        status TEXT NOT NULL CHECK(status IN ('pending', 'partially_deducted', 'settled')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK(deducted_cents + remaining_carryover_cents <= total_deduction_cents)
      );

      CREATE TABLE IF NOT EXISTS worker_settlement_deduction_allocations (
        id TEXT PRIMARY KEY,
        settlement_id TEXT NOT NULL REFERENCES worker_settlements(id) ON DELETE CASCADE,
        deduction_record_id TEXT NOT NULL REFERENCES worker_deduction_records(id) ON DELETE RESTRICT,
        allocated_cents INTEGER NOT NULL CHECK(allocated_cents > 0),
        status TEXT NOT NULL CHECK(status IN ('draft', 'confirmed', 'cancelled')),
        created_at TEXT NOT NULL,
        UNIQUE(settlement_id, deduction_record_id)
      );

      CREATE TABLE IF NOT EXISTS worker_deduction_balances (
        id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
        deduction_record_id TEXT NOT NULL UNIQUE REFERENCES worker_deduction_records(id) ON DELETE RESTRICT,
        remaining_cents INTEGER NOT NULL CHECK(remaining_cents > 0),
        status TEXT NOT NULL CHECK(status IN ('open', 'resolved')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_worker_wage_history_lookup
        ON worker_wage_history(worker_id, effective_on DESC);
      CREATE INDEX IF NOT EXISTS idx_worker_settlements_worker_period
        ON worker_settlements(worker_id, period_start_on, period_end_on, status);
      CREATE INDEX IF NOT EXISTS idx_worker_settlement_making_sources_settlement
        ON worker_settlement_making_sources(settlement_id, status);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_worker_settlement_making_source_confirmed
        ON worker_settlement_making_sources(quality_inspection_id) WHERE status = 'confirmed';
      CREATE INDEX IF NOT EXISTS idx_worker_settlement_timed_sources_settlement
        ON worker_settlement_timed_sources(settlement_id, status);
      CREATE INDEX IF NOT EXISTS idx_worker_settlement_timed_items_source
        ON worker_settlement_timed_items(timed_source_id);
      CREATE INDEX IF NOT EXISTS idx_worker_settlement_adjustments_settlement
        ON worker_settlement_adjustments(settlement_id, status);
      CREATE INDEX IF NOT EXISTS idx_worker_deduction_records_worker_status
        ON worker_deduction_records(worker_id, status, created_at);
      CREATE INDEX IF NOT EXISTS idx_worker_settlement_deduction_allocations_settlement
        ON worker_settlement_deduction_allocations(settlement_id, status);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_worker_settlement_deductions_confirmed_record
        ON worker_settlement_deduction_allocations(deduction_record_id) WHERE status = 'confirmed';
      CREATE INDEX IF NOT EXISTS idx_worker_deduction_balances_worker_status
        ON worker_deduction_balances(worker_id, status, created_at);
    `)
  }
}

const v2WagePaymentFinancialSource: V2Migration = {
  version: 6,
  name: 'v2_wage_payment_financial_source',
  run(database) {
    database.exec(`
      ALTER TABLE financial_entries ADD COLUMN source_type TEXT NOT NULL DEFAULT 'order_fund'
        CHECK(source_type IN ('order_fund', 'worker_settlement'));
      CREATE INDEX IF NOT EXISTS idx_financial_entries_source_type_occurred_on
        ON financial_entries(source_type, occurred_on);
    `)
  }
}

const v2FinanceAndAfterSalesFoundation: V2Migration = {
  version: 7,
  name: 'v2_finance_and_after_sales_foundation',
  requiresForeignKeysDisabled: true,
  run(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS finance_categories (
        id TEXT PRIMARY KEY,
        direction TEXT NOT NULL CHECK(direction IN ('income', 'expense')),
        name TEXT NOT NULL CHECK(length(trim(name)) > 0),
        enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(direction, name)
      );

      CREATE TABLE IF NOT EXISTS advance_payers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE CHECK(length(trim(name)) > 0),
        enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE financial_entries_next (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL CHECK(source_type IN (
          'order_fund', 'worker_settlement', 'manual_income', 'manual_expense', 'reimbursement'
        )),
        direction TEXT NOT NULL CHECK(direction IN ('income', 'expense')),
        business_type TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
        occurred_on TEXT NOT NULL,
        payment_method TEXT,
        payment_source TEXT CHECK(payment_source IN ('business_account', 'private_advance')),
        category_id TEXT REFERENCES finance_categories(id) ON DELETE RESTRICT,
        advance_payer_id TEXT REFERENCES advance_payers(id) ON DELETE RESTRICT,
        order_id TEXT REFERENCES orders(id),
        attachment_id TEXT REFERENCES attachments(id),
        reversal_of_entry_id TEXT REFERENCES financial_entries_next(id),
        note TEXT,
        created_at TEXT NOT NULL,
        CHECK(
          (payment_source IS NULL AND advance_payer_id IS NULL)
          OR (payment_source = 'business_account' AND advance_payer_id IS NULL)
          OR (payment_source = 'private_advance' AND advance_payer_id IS NOT NULL)
        ),
        CHECK(
          direction = 'expense'
          OR (payment_source IS NULL AND advance_payer_id IS NULL)
        ),
        UNIQUE(reversal_of_entry_id)
      );

      INSERT INTO financial_entries_next (
        id, source_type, direction, business_type, amount_cents, occurred_on,
        payment_method, order_id, attachment_id, reversal_of_entry_id, note, created_at
      )
      SELECT
        id, source_type, direction, business_type, amount_cents, occurred_on,
        payment_method, order_id, attachment_id, reversal_of_entry_id, note, created_at
      FROM financial_entries;

      DROP TABLE financial_entries;
      ALTER TABLE financial_entries_next RENAME TO financial_entries;

      CREATE TABLE IF NOT EXISTS advance_reimbursements (
        id TEXT PRIMARY KEY,
        advance_financial_entry_id TEXT NOT NULL UNIQUE REFERENCES financial_entries(id) ON DELETE RESTRICT,
        reimbursement_financial_entry_id TEXT NOT NULL UNIQUE REFERENCES financial_entries(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS after_sales_cases (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
        shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
        occurred_on TEXT NOT NULL,
        reason_description TEXT NOT NULL CHECK(length(trim(reason_description)) > 0),
        customer_request TEXT,
        responsibility_description TEXT NOT NULL CHECK(length(trim(responsibility_description)) > 0),
        handling_description TEXT NOT NULL CHECK(length(trim(handling_description)) > 0),
        status TEXT NOT NULL CHECK(status IN ('open', 'processing', 'resolved', 'cancelled')),
        customer_charge_note TEXT,
        accounting_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(accounting_cost_cents >= 0),
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS after_sales_charge_links (
        after_sales_case_id TEXT NOT NULL REFERENCES after_sales_cases(id) ON DELETE RESTRICT,
        financial_entry_id TEXT NOT NULL UNIQUE REFERENCES financial_entries(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        PRIMARY KEY(after_sales_case_id, financial_entry_id)
      );

      CREATE INDEX IF NOT EXISTS idx_financial_entries_order_id ON financial_entries(order_id);
      CREATE INDEX IF NOT EXISTS idx_financial_entries_occurred_on ON financial_entries(occurred_on);
      CREATE INDEX IF NOT EXISTS idx_financial_entries_source_type_occurred_on
        ON financial_entries(source_type, occurred_on);
      CREATE INDEX IF NOT EXISTS idx_financial_entries_category_occurred_on
        ON financial_entries(category_id, occurred_on);
      CREATE INDEX IF NOT EXISTS idx_financial_entries_advance_payer_occurred_on
        ON financial_entries(advance_payer_id, occurred_on);
      CREATE INDEX IF NOT EXISTS idx_finance_categories_direction_enabled
        ON finance_categories(direction, enabled, name);
      CREATE INDEX IF NOT EXISTS idx_advance_payers_enabled_name
        ON advance_payers(enabled, name);
      CREATE INDEX IF NOT EXISTS idx_advance_reimbursements_reimbursement
        ON advance_reimbursements(reimbursement_financial_entry_id);
      CREATE INDEX IF NOT EXISTS idx_after_sales_cases_order_occurred_on
        ON after_sales_cases(order_id, occurred_on DESC);
      CREATE INDEX IF NOT EXISTS idx_after_sales_cases_shipment_id
        ON after_sales_cases(shipment_id);
      CREATE INDEX IF NOT EXISTS idx_after_sales_charge_links_case
        ON after_sales_charge_links(after_sales_case_id);
    `)
  }
}

const v2WorkerSettlementRefunds: V2Migration = {
  version: 8,
  name: 'v2_worker_settlement_refunds',
  run(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS worker_refund_records (
        id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
        original_settlement_id TEXT NOT NULL REFERENCES worker_settlements(id) ON DELETE RESTRICT,
        process_task_id TEXT NOT NULL REFERENCES process_tasks(id) ON DELETE RESTRICT,
        process_result_id TEXT REFERENCES process_results(id) ON DELETE RESTRICT,
        quality_inspection_id TEXT NOT NULL UNIQUE REFERENCES quality_inspections(id) ON DELETE RESTRICT,
        order_id TEXT REFERENCES orders(id) ON DELETE RESTRICT,
        order_item_id TEXT REFERENCES order_items(id) ON DELETE RESTRICT,
        unqualified_quantity INTEGER NOT NULL CHECK(unqualified_quantity > 0),
        material_refund_cents INTEGER NOT NULL CHECK(material_refund_cents > 0),
        actual_refund_cents INTEGER CHECK(actual_refund_cents IS NULL OR actual_refund_cents > 0),
        refunded_on TEXT,
        manager_note TEXT,
        status TEXT NOT NULL CHECK(status IN ('pending', 'refunded')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK(
          (status = 'pending' AND actual_refund_cents IS NULL AND refunded_on IS NULL)
          OR (status = 'refunded' AND actual_refund_cents IS NOT NULL AND refunded_on IS NOT NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS idx_worker_refund_records_worker_status
        ON worker_refund_records(worker_id, status, created_at);
      CREATE INDEX IF NOT EXISTS idx_worker_refund_records_settlement
        ON worker_refund_records(original_settlement_id, status);
    `)
  }
}

const v2ProcessTaskMaterialSnapshot: V2Migration = {
  version: 9,
  name: 'v2_process_task_material_snapshot',
  run(database) {
    database.exec(`
      ALTER TABLE process_tasks
        ADD COLUMN glue_price_micro_yuan_per_gram INTEGER CHECK(glue_price_micro_yuan_per_gram >= 0);
      ALTER TABLE process_tasks
        ADD COLUMN glue_weight_milligrams INTEGER CHECK(glue_weight_milligrams >= 0);
    `)
  }
}

const v2ShipmentDocumentSnapshots: V2Migration = {
  version: 10,
  name: 'v2_shipment_document_snapshots',
  run(database) {
    database.exec(`
      ALTER TABLE shipments ADD COLUMN snapshot_json TEXT;
    `)
  }
}

const v2OrderSchedule: V2Migration = {
  version: 11,
  name: 'v2_order_schedule',
  run(database) {
    database.exec(`
      ALTER TABLE orders
        ADD COLUMN reserved_days INTEGER NOT NULL DEFAULT 2 CHECK(reserved_days >= 0);
    `)
  }
}

const v2ShipmentVoidLifecycle: V2Migration = {
  version: 12,
  name: 'v2_shipment_void_lifecycle',
  run(database) {
    // 兼容历史半成品库：其迁移记录可能完整但从未创建 shipments 表。
    if (!hasTable(database, 'shipments')) return
    addColumnIfMissing(
      database,
      'shipments',
      'status',
      "status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'voided'))"
    )
    addColumnIfMissing(database, 'shipments', 'voided_on', 'voided_on TEXT')
    addColumnIfMissing(database, 'shipments', 'void_reason', 'void_reason TEXT')
    addColumnIfMissing(database, 'shipments', 'voided_at', 'voided_at TEXT')
    database.exec(
      'CREATE INDEX IF NOT EXISTS idx_shipments_order_status ON shipments(order_id, status)'
    )
  }
}

const v2ProductStageInventory: V2Migration = {
  version: 13,
  name: 'v2_product_stage_inventory',
  run(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS product_stage_inventory_events (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        stage TEXT NOT NULL CHECK(stage IN ('made', 'fluffing_bagging_done', 'edge_sewing_done', 'packed')),
        quantity_delta INTEGER NOT NULL CHECK(quantity_delta <> 0),
        source_type TEXT NOT NULL CHECK(source_type IN ('opening', 'order_allocation', 'manager_adjustment')),
        order_item_id TEXT REFERENCES order_items(id) ON DELETE RESTRICT,
        occurred_on TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_product_stage_inventory_product_stage
        ON product_stage_inventory_events(product_id, stage, occurred_on);
      CREATE INDEX IF NOT EXISTS idx_product_stage_inventory_order_item
        ON product_stage_inventory_events(order_item_id);
    `)
  }
}

const v2WorkTimeReviews: V2Migration = {
  version: 14,
  name: 'v2_work_time_reviews',
  run(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS work_time_reviews (
        id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
        worked_on TEXT NOT NULL,
        process_type TEXT NOT NULL CHECK(process_type IN ('fluffing_bagging', 'edge_sewing', 'packing')),
        approved_minutes INTEGER NOT NULL CHECK(approved_minutes > 0),
        hourly_wage_cents_snapshot INTEGER CHECK(hourly_wage_cents_snapshot IS NULL OR hourly_wage_cents_snapshot >= 0),
        source_type TEXT NOT NULL CHECK(source_type IN ('manual_review', 'attendance_device')),
        external_record_id TEXT,
        raw_started_at TEXT,
        raw_ended_at TEXT,
        status TEXT NOT NULL CHECK(status IN ('draft', 'confirmed', 'voided')),
        review_note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK(status <> 'confirmed' OR hourly_wage_cents_snapshot IS NOT NULL)
      );

      CREATE TABLE IF NOT EXISTS work_time_review_assignments (
        review_id TEXT NOT NULL REFERENCES work_time_reviews(id) ON DELETE CASCADE,
        work_assignment_id TEXT NOT NULL REFERENCES work_assignments(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        PRIMARY KEY(review_id, work_assignment_id)
      );

      CREATE TABLE IF NOT EXISTS work_time_review_items (
        id TEXT PRIMARY KEY,
        review_id TEXT NOT NULL REFERENCES work_time_reviews(id) ON DELETE CASCADE,
        process_task_id TEXT NOT NULL REFERENCES process_tasks(id) ON DELETE RESTRICT,
        order_item_id TEXT REFERENCES order_items(id) ON DELETE RESTRICT,
        completed_quantity INTEGER NOT NULL CHECK(completed_quantity > 0),
        created_at TEXT NOT NULL,
        UNIQUE(review_id, process_task_id)
      );

      CREATE INDEX IF NOT EXISTS idx_work_time_reviews_worker_day
        ON work_time_reviews(worker_id, worked_on, process_type, status);
      CREATE INDEX IF NOT EXISTS idx_work_time_review_assignments_assignment
        ON work_time_review_assignments(work_assignment_id);
      CREATE INDEX IF NOT EXISTS idx_work_time_review_items_review
        ON work_time_review_items(review_id);
      CREATE INDEX IF NOT EXISTS idx_work_time_review_items_task
        ON work_time_review_items(process_task_id);
    `)
  }
}

const migrations: readonly V2Migration[] = [
  v2MasterData,
  v2OrderFoundation,
  v2OrderItemPosition,
  v2FulfillmentFoundation,
  v2WorkerSettlementFoundation,
  v2WagePaymentFinancialSource,
  v2FinanceAndAfterSalesFoundation,
  v2WorkerSettlementRefunds,
  v2ProcessTaskMaterialSnapshot,
  v2ShipmentDocumentSnapshots,
  v2OrderSchedule,
  v2ShipmentVoidLifecycle,
  v2ProductStageInventory,
  v2WorkTimeReviews
]

/**
 * 目标模型必需列：旧版业务库缺少这些列时拒绝启动，避免在未重建的数据库上静默运行。
 * 本提案不做历史业务数据迁移；部署前必须先备份旧库并按最新结构重建。
 */
const requiredTargetColumns: ReadonlyArray<readonly [string, string]> = [
  ['products', 'edge_consumable_cost_cents'],
  ['products', 'fixed_cost_cents'],
  ['products', 'expected_fluffing_bagging_minutes'],
  ['products', 'expected_edge_sewing_minutes'],
  ['products', 'expected_packing_minutes'],
  ['products', 'edge_sewing_commission_cents'],
  ['product_stage_inventory_events', 'stage'],
  ['work_time_reviews', 'approved_minutes']
]

function assertTargetSchema(database: Database.Database): void {
  for (const [table, column] of requiredTargetColumns) {
    if (!hasColumn(database, table, column)) {
      throw new Error(
        `数据库结构与当前版本不兼容：缺少 ${table}.${column}。请先备份旧业务库，再按最新结构重建数据库。`
      )
    }
  }
}

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
      database.prepare('SELECT version FROM v2_schema_migrations').all() as Array<{
        version: number
      }>
    ).map((row) => row.version)
  )

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue

    const applyMigration = () => {
      database.transaction(() => {
        migration.run(database)
        database
          .prepare('INSERT INTO v2_schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
          .run(migration.version, migration.name, new Date().toISOString())
      })()
    }

    if (!migration.requiresForeignKeysDisabled) {
      applyMigration()
      continue
    }

    const foreignKeysEnabled = database.pragma('foreign_keys', { simple: true }) === 1
    if (foreignKeysEnabled) database.pragma('foreign_keys = OFF')
    try {
      applyMigration()
    } finally {
      if (foreignKeysEnabled) database.pragma('foreign_keys = ON')
    }
  }

  assertTargetSchema(database)
}
