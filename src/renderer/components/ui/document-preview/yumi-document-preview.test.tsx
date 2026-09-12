/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiDocumentPreview } from './yumi-document-preview'

afterEach(cleanup)

describe('YumiDocumentPreview', () => {
  it('以只读文档结构承接标题、事实和正文', () => {
    render(
      <YumiDocumentPreview
        ariaLabel="发货清单预览"
        facts={[
          { label: '客户', value: '小满' },
          { label: '发货日期', value: '2026-09-10' }
        ]}
        title="发货清单"
      >
        <p>草莓捏捏 × 20</p>
      </YumiDocumentPreview>
    )
    const region = screen.getByRole('region', { name: '发货清单预览' })
    expect(within(region).getByRole('heading', { name: '发货清单' })).toBeVisible()
    expect(within(region).getByText('客户')).toBeVisible()
    expect(within(region).getByText('小满')).toBeVisible()
    expect(within(region).getByText('草莓捏捏 × 20')).toBeVisible()
  })
})
