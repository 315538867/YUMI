import { useCallback, useEffect, useState } from 'react'
import type { V2BackupSummary } from '@shared/contracts/index'
import { getErrorMessage } from './v2-utils'

/** 数据保护页的预加载桥接与异步状态统一收敛在此处。 */
export function useBackups() {
  const [backups, setBackups] = useState<V2BackupSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const nextBackups = await window.yumiV2.backup.list()
      setBackups(nextBackups)
      return nextBackups
    } catch (cause) {
      const message = getErrorMessage(cause)
      setError(message)
      throw cause
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload().catch(() => undefined)
  }, [reload])

  const createBackup = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await window.yumiV2.backup.create()
      await reload()
    } catch (cause) {
      setError(getErrorMessage(cause))
      throw cause
    } finally {
      setBusy(false)
    }
  }, [reload])

  const restoreBackup = useCallback(async (backupPath: string) => {
    setBusy(true)
    setError(null)
    try {
      return await window.yumiV2.backup.restore({ backupPath, confirmed: true })
    } catch (cause) {
      setError(getErrorMessage(cause))
      throw cause
    } finally {
      setBusy(false)
    }
  }, [])

  return { backups, loading, busy, error, createBackup, restoreBackup }
}
