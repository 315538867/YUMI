import { useCallback, useEffect, useState } from 'react'
import type { V2StudioSettings, V2StudioSettingsUpdateInput } from '@shared/contracts/index'
import { getErrorMessage } from './v2-utils'

export function useStudioSettings() {
  const [settings, setSettings] = useState<V2StudioSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setSettings(await window.yumiV2.studioSettings.get())
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const update = useCallback(async (input: V2StudioSettingsUpdateInput) => {
    const next = await window.yumiV2.studioSettings.update(input)
    setSettings(next)
    return next
  }, [])

  return { settings, loading, loadError, reload, update }
}
