/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installDomInteractionPolyfills } from '../../test/dom'
import { AfterSalesPanel } from './after-sales-panel'

installDomInteractionPolyfills()
afterEach(cleanup)

describe('AfterSalesPanel', () => {
  it('打开按需录入抽屉，但在负责人未完成责任判断和处理方式前不会自动创建售后记录', async () => {
    const listCases = vi.fn().mockResolvedValue([])
    const createCase = vi.fn().mockResolvedValue({})
    render(
      <AfterSalesPanel
        createCase={createCase}
        funds={[]}
        linkCharge={vi.fn().mockResolvedValue(undefined)}
        listCases={listCases}
        orderId="order-1"
        shipments={[]}
        updateCase={vi.fn().mockResolvedValue({})}
      />
    )

    await waitFor(() => expect(listCases).toHaveBeenCalledWith({ orderId: 'order-1' }))
    fireEvent.click(screen.getByRole('button', { name: '新增售后记录' }))

    expect(screen.getByRole('dialog', { name: '新增售后记录' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认负责人判断' }))

    expect(await screen.findByRole('alert', { hidden: true })).toHaveTextContent('请完整填写问题原因、负责人责任判断和处理方式。')
    expect(createCase).not.toHaveBeenCalled()
  })
})

  it('负责人先核对原发货上下文，再明确确认处理判断；确认前不会创建售后记录或派生后续动作', async () => {
    const listCases = vi.fn().mockResolvedValue([])
    const createCase = vi.fn().mockResolvedValue({})
    render(
      <AfterSalesPanel
        createCase={createCase}
        funds={[]}
        linkCharge={vi.fn().mockResolvedValue(undefined)}
        listCases={listCases}
        orderId="order-1"
        shipments={[{
          id: 'shipment-1', orderId: 'order-1', shippedOn: '2026-09-07', carrier: '顺丰', trackingNumber: 'SF001', note: null,
          items: [{ id: 'shipment-item-1', orderItemId: 'order-item-1', quantity: 12 }],
          createdAt: '2026-09-07T10:00:00.000Z', updatedAt: '2026-09-07T10:00:00.000Z'
        }]}
        updateCase={vi.fn().mockResolvedValue({})}
      />
    )

    await waitFor(() => expect(listCases).toHaveBeenCalledWith({ orderId: 'order-1' }))
    fireEvent.click(screen.getByRole('button', { name: '新增售后记录' }))
    fireEvent.click(screen.getByRole('combobox', { name: '关联发货批次' }))
    fireEvent.click(screen.getByRole('option', { name: '2026-09-07 · SF001' }))

    expect(screen.getByText('原发货上下文')).toBeInTheDocument()
    expect(screen.getByText('2026-09-07 · 顺丰 · SF001 · 1 种商品 / 12 件')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('例如：客户不满意包装袋或产品质量问题'), { target: { value: '包装袋需要更换' } })
    fireEvent.change(screen.getByPlaceholderText('负责人结合实际明确说明责任归属'), { target: { value: '工作室承担包装失误' } })
    fireEvent.change(screen.getByPlaceholderText('例如：重新包装、补发或协商收费'), { target: { value: '重新包装，不额外收费' } })
    fireEvent.click(screen.getByRole('button', { name: '确认负责人判断' }))

    expect(screen.getByRole('alertdialog', { name: '确认售后处理判断' })).toBeInTheDocument()
    expect(createCase).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '确认并保存售后记录' }))

    await waitFor(() => expect(createCase).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'order-1', shipmentId: 'shipment-1',
      responsibilityDescription: '工作室承担包装失误', handlingDescription: '重新包装，不额外收费'
    })))
  })
