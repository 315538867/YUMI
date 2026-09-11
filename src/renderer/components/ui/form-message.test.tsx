/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YumiFormMessage } from './form-message'

afterEach(cleanup)

describe('YumiFormMessage', () => {
  it('以 alert 语义呈现错误消息', () => {
    render(<YumiFormMessage tone="error">保存失败，请重试。</YumiFormMessage>)

    const message = screen.getByRole('alert')
    expect(message).toHaveTextContent('保存失败，请重试。')
    expect(message).toHaveClass('yumi-form-message', 'yumi-form-message--error')
  })

  it('以普通提示语义呈现辅助说明，不冒充错误告警', () => {
    render(<YumiFormMessage>保存后只影响后续新建订单。</YumiFormMessage>)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('保存后只影响后续新建订单。')).toHaveClass(
      'yumi-form-message',
      'yumi-form-message--hint'
    )
  })
})
