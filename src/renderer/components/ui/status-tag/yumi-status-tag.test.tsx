/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiStatusTag } from './yumi-status-tag'

afterEach(cleanup)

describe('YumiStatusTag', () => {
  it('以可读状态文字、语义色调和紧凑密度呈现状态', () => {
    render(
      <YumiStatusTag density="compact" dot tone="warning">
        待确认
      </YumiStatusTag>
    )

    const status = screen.getByText('待确认')
    expect(status).toHaveClass(
      'yumi-status-tag',
      'yumi-status-tag--warning',
      'yumi-status-tag--compact'
    )
    expect(status.querySelector('.yumi-status-tag__dot')).toBeInTheDocument()
  })
})
