/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  YumiCheckbox,
  YumiField,
  YumiFieldLabel,
  YumiNumberField,
  YumiTextArea,
  YumiTextField
} from './yumi-field'
import { YumiSelect } from '../select/yumi-select'
import { YumiDatePicker } from '../date-picker/yumi-date-picker'

afterEach(cleanup)

describe('YumiCheckbox', () => {
  it('以统一控件承载可访问的布尔选择与键盘焦点样式钩子', () => {
    function Example() {
      const [checked, setChecked] = useState(false)
      return (
        <YumiCheckbox
          aria-label="第 1 行缝边"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
        >
          启用缝边
        </YumiCheckbox>
      )
    }

    render(<Example />)

    const checkbox = screen.getByRole('checkbox', { name: '第 1 行缝边' })
    expect(checkbox).toHaveClass('yumi-checkbox__input')
    expect(screen.getByText('启用缝边')).toBeVisible()

    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
  })
})

describe('YumiField', () => {
  it('未显式传入 aria 标签时，将字段标签关联到基础文本控件', () => {
    render(
      <>
        <YumiField>
          <YumiFieldLabel required>付款金额</YumiFieldLabel>
          <YumiNumberField />
        </YumiField>
        <YumiField>
          <YumiFieldLabel>处理备注</YumiFieldLabel>
          <YumiTextArea />
        </YumiField>
        <YumiField>
          <YumiFieldLabel>付款说明</YumiFieldLabel>
          <YumiTextField />
        </YumiField>
      </>
    )

    expect(screen.getByRole('textbox', { name: '付款金额' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: '处理备注' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: '付款说明' })).toBeVisible()
  })

  it('保留调用方显式提供的 aria 标签', () => {
    render(
      <YumiField>
        <YumiFieldLabel>内部字段名</YumiFieldLabel>
        <YumiTextField aria-label="用于无障碍的字段名" />
      </YumiField>
    )

    expect(screen.getByRole('textbox', { name: '用于无障碍的字段名' })).toBeVisible()
    expect(screen.queryByRole('textbox', { name: '内部字段名' })).not.toBeInTheDocument()
  })

  it('将字段级错误关联到基础控件，并声明无效状态', () => {
    const view = render(
      <YumiField error="金额格式不合法">
        <YumiFieldLabel required>付款金额</YumiFieldLabel>
        <YumiNumberField />
      </YumiField>
    )

    const field = within(view.container).getByRole('textbox', { name: '付款金额' })
    const error = within(view.container).getByText('金额格式不合法')

    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAttribute('aria-describedby', error.id)
    expect(error).toHaveAttribute('role', 'alert')
    expect(error).toHaveClass('yumi-form-message', 'yumi-form-message--error')
  })

  it('将字段标签、错误与提示反馈一致地关联到复合选择和日期控件', () => {
    const view = render(
      <>
        <YumiField error="请选择付款方式">
          <YumiFieldLabel required>付款方式</YumiFieldLabel>
          <YumiSelect
            aria-describedby="external-payment-note"
            onValueChange={() => undefined}
            options={[{ label: '银行转账', value: 'bank' }]}
          />
        </YumiField>
        <YumiField hint="以款项实际到账日期为准。">
          <YumiFieldLabel>付款日期</YumiFieldLabel>
          <YumiDatePicker onValueChange={() => undefined} value="2026-09-11" />
        </YumiField>
      </>
    )

    const select = within(view.container).getByRole('combobox', { name: '付款方式' })
    const datePicker = within(view.container).getByRole('button', { name: '付款日期' })
    const selectError = within(view.container).getByText('请选择付款方式')
    const dateHint = within(view.container).getByText('以款项实际到账日期为准。')

    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAttribute('aria-describedby', `external-payment-note ${selectError.id}`)
    expect(datePicker).toHaveAttribute('aria-describedby', dateHint.id)
    expect(dateHint).toHaveClass('yumi-form-message', 'yumi-form-message--hint')
  })

  it('将字段提示关联到基础控件，且不覆盖调用方已有描述', () => {
    const view = render(
      <YumiField hint="请输入客户可识别的付款说明。">
        <YumiFieldLabel>付款说明</YumiFieldLabel>
        <YumiTextField aria-describedby="existing-description" />
      </YumiField>
    )

    const field = within(view.container).getByRole('textbox', { name: '付款说明' })
    const hint = within(view.container).getByText('请输入客户可识别的付款说明。')

    expect(field).toHaveAttribute('aria-describedby', `existing-description ${hint.id}`)
  })
})

describe('YumiField · 适用状态与读写契约（任务 3.6）', () => {
  it('将字段级错误与提示关联到容器内的复选框控件', () => {
    const view = render(
      <YumiField error="请确认已勾选">
        <YumiCheckbox>同意结算条款</YumiCheckbox>
      </YumiField>
    )

    const checkbox = within(view.container).getByRole('checkbox', { name: '同意结算条款' })
    const error = within(view.container).getByText('请确认已勾选')

    expect(checkbox).toHaveAttribute('aria-invalid', 'true')
    expect(checkbox).toHaveAttribute('aria-describedby', error.id)
  })

  it('字段消息槽位常驻占位，空字段也保留下方消息位置', () => {
    render(
      <YumiField>
        <YumiFieldLabel>处理备注</YumiFieldLabel>
        <YumiTextArea />
      </YumiField>
    )

    expect(screen.getByRole('textbox', { name: '处理备注' })).toBeVisible()
    expect(document.querySelector('.yumi-form-message--reserved')).toBeInTheDocument()
  })

  it('错误清除后还原无效声明，消息槽从错误切换为提示', () => {
    const view = render(
      <YumiField error="必填">
        <YumiFieldLabel>客户备注</YumiFieldLabel>
        <YumiTextField />
      </YumiField>
    )

    const field = () => within(view.container).getByRole('textbox', { name: '客户备注' })
    expect(field()).toHaveAttribute('aria-invalid', 'true')

    view.rerender(
      <YumiField hint="选填">
        <YumiFieldLabel>客户备注</YumiFieldLabel>
        <YumiTextField />
      </YumiField>
    )

    expect(field()).not.toHaveAttribute('aria-invalid')
    expect(within(view.container).getByText('选填')).toBeVisible()
    expect(within(view.container).queryByText('必填')).not.toBeInTheDocument()
  })

  it('只读字段保留可读值与只读语义，且不视为无效', () => {
    render(
      <YumiField hint="供应商固定">
        <YumiFieldLabel>付款方式</YumiFieldLabel>
        <YumiTextField readOnly value="银行转账" />
      </YumiField>
    )

    const field = screen.getByRole('textbox', { name: '付款方式' })
    expect(field).toHaveValue('银行转账')
    expect(field).toHaveAttribute('readonly')
    expect(field).not.toHaveAttribute('aria-invalid')
  })

  it('数字字段使用数字键盘输入模式并透传读写属性', () => {
    render(<YumiNumberField allowDecimal readOnly value="123.45" />)

    const field = screen.getByRole('textbox')
    expect(field).toHaveAttribute('inputmode', 'decimal')
    expect(field).toHaveAttribute('readonly')
  })
})
