/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiCluster } from './yumi-cluster'

afterEach(cleanup)

describe('YumiCluster', () => {
  it('以紧凑控件簇容器排列同权控件并保持 DOM 顺序', () => {
    render(
      <YumiCluster>
        <button>筛选</button>
        <button>导出</button>
      </YumiCluster>
    )

    const cluster = screen.getByText('筛选').parentElement
    expect(cluster).toHaveClass('yumi-cluster')
    expect(cluster?.children).toHaveLength(2)
    expect(cluster?.children[0]).toHaveTextContent('筛选')
    expect(cluster?.children[1]).toHaveTextContent('导出')
  })
})
