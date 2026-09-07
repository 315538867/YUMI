import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { runV2Migrations } from './v2-migrations'

export type V2Database = Database.Database

/**
 * 只用于 V2 独立文件。若错误地传入未初始化的 V1 文件，迁移会拒绝写入，避免污染 V1 测试数据。
 */
export function createV2Database(databasePath: string): V2Database {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true })
  const database = new Database(databasePath)
  database.pragma('foreign_keys = ON')
  database.pragma('journal_mode = WAL')
  database.pragma('busy_timeout = 5000')
  runV2Migrations(database)
  return database
}
