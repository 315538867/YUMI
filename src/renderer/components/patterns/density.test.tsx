/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DENSITY, DensityRoot, DENSITIES, useDensity } from './density'

function DensityProbe({ label = 'probe' }: { label?: string }) {
  const density = useDensity()
  return <span data-testid={`probe-${label}`}>{density}</span>
}

describe('P1 · 共享密度上下文（任务 3.1）', () => {
  it('Pattern 外默认密度：无密度根时读取到组件契约默认值标准档', () => {
    render(<DensityProbe />)
    expect(DEFAULT_DENSITY).toBe('standard')
    expect(screen.getByTestId('probe-probe')).toHaveTextContent(DEFAULT_DENSITY)
  })

  it('Pattern 内三档密度：根节点发出 data-density 且上下文穿透到深层后代', () => {
    for (const density of DENSITIES) {
      const { container } = render(
        <DensityRoot density={density}>
          <div>
            <div>
              <DensityProbe label={density} />
            </div>
          </div>
        </DensityRoot>
      )
      expect(container.querySelectorAll('[data-density]').length).toBe(1)
      expect(container.querySelector('[data-density]')).toHaveAttribute('data-density', density)
      expect(screen.getByTestId(`probe-${density}`)).toHaveTextContent(density)
    }
  })

  it('内层密度根可显式重开标准档覆盖外层紧凑档', () => {
    render(
      <DensityRoot density="compact">
        <DensityRoot density="standard">
          <DensityProbe label="inner" />
        </DensityRoot>
      </DensityRoot>
    )
    expect(screen.getByTestId('probe-inner')).toHaveTextContent('standard')
  })
})
