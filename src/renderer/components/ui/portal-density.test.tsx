/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { installDomInteractionPolyfills } from '../../test/dom'
import { DENSITIES, DensityRoot } from '../patterns/density'
import { YumiActionMenu, type YumiActionMenuItem } from './action-menu/yumi-action-menu'
import { YumiDatePicker } from './date-picker/yumi-date-picker'
import { YumiConfirmDialog, YumiDialog } from './dialog/yumi-dialog'
import { YumiSearchSelect, YumiSelect } from './select/yumi-select'
import { YumiSheet } from './sheet/yumi-sheet'

installDomInteractionPolyfills()
afterEach(cleanup)

const options = [
  { label: '客户 A', value: 'customer-a' },
  { label: '客户 B', value: 'customer-b' }
]

const menuItems: YumiActionMenuItem[] = [
  { id: 'export', label: '导出', onSelect() {} },
  { id: 'print', label: '打印', onSelect() {} }
]

const expectDensityAttribute = async (selector: string, density: string) => {
  await waitFor(() => expect(document.querySelector(selector), `未找到 ${selector}`).not.toBeNull())
  expect(document.querySelector(selector)).toHaveAttribute('data-density', density)
}

describe('P1 · Portal 密度传播（任务 3.2/3.3）', () => {
  it('对话框与确认框的内容根携带上下文密度', async () => {
    for (const density of DENSITIES) {
      render(
        <DensityRoot density={density}>
          <YumiDialog onOpenChange={() => {}} open title="测试对话框">
            内容
          </YumiDialog>
          <YumiConfirmDialog
            confirmLabel="确认"
            onConfirm={() => {}}
            onOpenChange={() => {}}
            open
            title="测试确认框"
          />
        </DensityRoot>
      )
      await expectDensityAttribute(
        '.yumi-dialog__content:not(.yumi-dialog__content--confirm)',
        density
      )
      await expectDensityAttribute('.yumi-dialog__content--confirm', density)
      cleanup()
    }
  })

  it('抽屉的内容根携带上下文密度', async () => {
    for (const density of DENSITIES) {
      render(
        <DensityRoot density={density}>
          <YumiSheet onOpenChange={() => {}} open title="测试抽屉">
            内容
          </YumiSheet>
        </DensityRoot>
      )
      await expectDensityAttribute('.yumi-sheet', density)
      cleanup()
    }
  })

  it('选择与搜索选择的浮层携带上下文密度', async () => {
    for (const density of DENSITIES) {
      render(
        <DensityRoot density={density}>
          <YumiSelect aria-label="客户" onValueChange={() => {}} options={options} />
          <YumiSearchSelect aria-label="商品" onValueChange={() => {}} options={options} />
        </DensityRoot>
      )
      fireEvent.click(document.querySelectorAll('.yumi-select__trigger')[0] as HTMLElement)
      await expectDensityAttribute('.yumi-select__content', density)
      fireEvent.click(document.querySelectorAll('.yumi-select__trigger')[1] as HTMLElement)
      await expectDensityAttribute('.yumi-select__search-content', density)
      cleanup()
    }
  })

  it('日期选择浮层携带上下文密度', async () => {
    for (const density of DENSITIES) {
      render(
        <DensityRoot density={density}>
          <YumiDatePicker aria-label="付款日期" onValueChange={() => {}} />
        </DensityRoot>
      )
      fireEvent.click(document.querySelector('.yumi-date-trigger') as HTMLElement)
      await expectDensityAttribute('.yumi-date-popover', density)
      cleanup()
    }
  })

  it('动作菜单浮层携带上下文密度', async () => {
    for (const density of DENSITIES) {
      render(
        <DensityRoot density={density}>
          <YumiActionMenu aria-label="批次操作" items={menuItems} />
        </DensityRoot>
      )
      fireEvent.click(screenGetByRoleButton('更多操作'))
      await expectDensityAttribute('.yumi-action-menu__content', density)
      cleanup()
    }
  })

  it('无密度根时所有 Portal 内容根回落到默认标准档', async () => {
    render(
      <YumiDialog onOpenChange={() => {}} open title="独立对话框">
        内容
      </YumiDialog>
    )
    await expectDensityAttribute('.yumi-dialog__content', 'standard')
  })
})

function screenGetByRoleButton(name: string) {
  const candidates = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter(
    (button) => button.textContent?.includes(name)
  )
  const trigger = candidates.find((button) => button.getAttribute('aria-label'))
  return (trigger ?? candidates[0]) as HTMLElement
}
