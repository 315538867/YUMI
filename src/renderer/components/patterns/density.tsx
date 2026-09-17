import { createContext, useContext, type ReactNode } from 'react'

export type Density = 'compact' | 'standard' | 'comfortable'
export const DENSITIES: readonly Density[] = ['compact', 'standard', 'comfortable']
/** 组件契约规定的默认密度：无 Pattern 归属时共享组件以标准档渲染。 */
export const DEFAULT_DENSITY: Density = 'standard'

export const DensityContext = createContext<Density>(DEFAULT_DENSITY)

export const useDensity = (): Density => useContext(DensityContext)

/** 密度根：Pattern 顶层使用，把密度写入 data-density 并传入上下文，Portal 内容据此传播。 */
export function DensityRoot({ density, children }: { density: Density; children: ReactNode }) {
  return (
    <DensityContext.Provider value={density}>
      <div data-density={density}>{children}</div>
    </DensityContext.Provider>
  )
}
