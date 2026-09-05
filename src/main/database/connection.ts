import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { runMigrations } from './migrations'

export type StudioDatabase = Database.Database

export function createDatabase(databasePath: string): StudioDatabase {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true })
  const database = new Database(databasePath)
  database.pragma('foreign_keys = ON')
  database.pragma('journal_mode = WAL')
  database.pragma('busy_timeout = 5000')
  runMigrations(database)
  return database
}
