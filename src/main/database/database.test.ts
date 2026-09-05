import { describe, expect, it } from 'vitest'
import { createDatabase } from './connection'

describe('SQLite 数据基础', () => {
  it('可以建立内存数据库并完成迁移', () => {
    const database = createDatabase(':memory:')
    const row = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'products'")
      .get()
    expect(row).toBeTruthy()
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cost_settings_history'"
        )
        .get()
    ).toBeTruthy()
    expect(database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual(
      {
        version: 5
      }
    )
    database.close()
  })
})
