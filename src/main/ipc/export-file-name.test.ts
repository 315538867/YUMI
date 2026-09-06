import { describe, expect, it } from 'vitest'
import { buildDocumentDefaultFileName } from './export-file-name'

describe('单据默认保存文件名', () => {
  it('按时间、表格类型和客户名称生成订单表与发货清单文件名', () => {
    const savedAt = new Date(2026, 8, 6, 23, 5, 7)

    expect(buildDocumentDefaultFileName(savedAt, '订单表', '陈')).toBe('20260906-230507-订单表-陈.xlsx')
    expect(buildDocumentDefaultFileName(savedAt, '发货清单', '陈')).toBe('20260906-230507-发货清单-陈.xlsx')
  })

  it('替换客户名称中不能作为文件名的字符', () => {
    expect(buildDocumentDefaultFileName(new Date(2026, 8, 6, 23, 5, 7), '订单表', '陈/女士')).toBe(
      '20260906-230507-订单表-陈_女士.xlsx'
    )
  })
})
