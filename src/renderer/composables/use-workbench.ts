import { useCallback, useEffect, useState } from 'react'
import { getErrorMessage } from './v2-utils'

/** 工作台只读取由主进程聚合的现有事实，不在渲染进程拼接或写入待办。 */
export function useWorkbench() {
  const [snapshot, setSnapshot] = useState<Awaited<
    ReturnType<typeof window.yumiV2.workbench.getSnapshot>
  > | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setSnapshot(await window.yumiV2.workbench.getSnapshot())
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { snapshot, loading, loadError, reload }
}
