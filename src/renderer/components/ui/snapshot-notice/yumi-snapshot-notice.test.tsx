/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiSnapshotNotice } from './yumi-snapshot-notice'

afterEach(cleanup)

describe('YumiSnapshotNotice', () => {
  it('清楚说明只读快照边界', () => {
    render(<YumiSnapshotNotice>本清单仅读取本批发货时保存的快照。</YumiSnapshotNotice>)
    expect(screen.getByRole('note', { name: '快照说明' })).toHaveTextContent(
      '本清单仅读取本批发货时保存的快照。'
    )
  })
})
