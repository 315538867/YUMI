import type { V2Database } from '@main/database/v2-connection'
import type {
  ProductInventoryEventDraft,
  ProductStageBalances
} from '@main/domain/product-inventory'
import { createEmptyProductStageBalances } from '@main/domain/product-inventory'
import type { V2ProductStageInventoryEvent } from '@shared/contracts/index'

interface ProductInventoryEventRow {
  id: string
  product_id: string
  stage: string
  quantity_delta: number
  source_type: string
  order_item_id: string | null
  occurred_on: string
  note: string | null
  created_at: string
}

function mapEvent(row: ProductInventoryEventRow): V2ProductStageInventoryEvent {
  return {
    id: row.id,
    productId: row.product_id,
    stage: row.stage as V2ProductStageInventoryEvent['stage'],
    quantityDelta: row.quantity_delta,
    sourceType: row.source_type as V2ProductStageInventoryEvent['sourceType'],
    orderItemId: row.order_item_id,
    occurredOn: row.occurred_on,
    note: row.note,
    createdAt: row.created_at
  }
}

export class ProductInventoryRepository {
  constructor(private readonly database: V2Database) {}

  get connection(): V2Database {
    return this.database
  }

  transaction<T>(run: () => T): T {
    return this.database.transaction(run)()
  }

  productExists(productId: string): boolean {
    return Boolean(this.database.prepare('SELECT 1 FROM products WHERE id = ?').get(productId))
  }

  insertEvent(
    id: string,
    productId: string,
    event: ProductInventoryEventDraft,
    createdAt: string
  ): V2ProductStageInventoryEvent {
    this.database
      .prepare(
        `INSERT INTO product_stage_inventory_events (
          id, product_id, stage, quantity_delta, source_type, order_item_id, occurred_on, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        productId,
        event.stage,
        event.quantityDelta,
        event.sourceType,
        event.orderItemId ?? null,
        event.occurredOn,
        event.note ?? null,
        createdAt
      )
    const row = this.database
      .prepare('SELECT * FROM product_stage_inventory_events WHERE id = ?')
      .get(id) as ProductInventoryEventRow
    return mapEvent(row)
  }

  listEvents(productId: string): V2ProductStageInventoryEvent[] {
    return (
      this.database
        .prepare(
          'SELECT * FROM product_stage_inventory_events WHERE product_id = ? ORDER BY occurred_on ASC, created_at ASC, rowid ASC'
        )
        .all(productId) as ProductInventoryEventRow[]
    ).map(mapEvent)
  }

  getBalances(productId: string): ProductStageBalances {
    const balances = createEmptyProductStageBalances()
    const rows = this.database
      .prepare(
        'SELECT stage, SUM(quantity_delta) AS balance FROM product_stage_inventory_events WHERE product_id = ? GROUP BY stage'
      )
      .all(productId) as Array<{ stage: keyof ProductStageBalances; balance: number }>
    for (const row of rows) balances[row.stage] = row.balance
    return balances
  }
}
