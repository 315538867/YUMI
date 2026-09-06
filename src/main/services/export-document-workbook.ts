import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import ExcelJS from 'exceljs'

interface OrderSheetRow {
  productId: string
  productName: string
  weightGrams: number
  unitPrice: number
  packagingFee: number
  replacementBagFee: number
  totalUnitPrice: number
  quantity: number
  totalAmount: number
  notes: string
}

export interface OrderSheetWorkbookInput {
  customerName: string
  contact: string
  address: string
  createdAt: string
  rows: OrderSheetRow[]
  imagePathByProductId: ReadonlyMap<string, string | null>
}

interface ShipmentManifestRow {
  productId: string
  productName: string
  orderedQuantity: number
  shipmentQuantity: number
  pendingQuantity: number
  notes: string
}

export interface ShipmentManifestWorkbookInput {
  customerName: string
  shippedAt: string
  notes: string
  rows: ShipmentManifestRow[]
  imagePathByProductId: ReadonlyMap<string, string | null>
}

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } }
}

const centered: Partial<ExcelJS.Alignment> = {
  horizontal: 'center',
  vertical: 'middle',
  wrapText: true
}

const yellowFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFF00' }
}

function orderDate(createdAt: string): string {
  return createdAt.slice(0, 10).replaceAll('-', '.')
}

function shipmentTitleDate(shippedAt: string): string {
  const [year, month, day] = shippedAt.split('-').map(Number)
  if (!year || !month || !day) return shippedAt
  return `${month}. ${day}`
}

function shipmentFooterDate(shippedAt: string): string {
  const [year, month, day] = shippedAt.split('-').map(Number)
  if (!year || !month || !day) return shippedAt
  return `${year}.${month}.${day}`
}

function configurePrintLayout(worksheet: ExcelJS.Worksheet): void {
  worksheet.views = [{ showGridLines: false }]
  worksheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: { left: 0.2, right: 0.2, top: 0.3, bottom: 0.3, header: 0, footer: 0 }
  }
}

function applyGrid(
  worksheet: ExcelJS.Worksheet,
  fromRow: number,
  toRow: number,
  columnCount: number
): void {
  for (let row = fromRow; row <= toRow; row += 1) {
    for (let column = 1; column <= columnCount; column += 1) {
      const cell = worksheet.getCell(row, column)
      cell.border = thinBorder
      cell.alignment = centered
    }
  }
}

async function addProductImage(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  imagePath: string | null | undefined,
  row: number
): Promise<void> {
  if (!imagePath) return
  const extension = extname(imagePath).slice(1).toLowerCase()
  const normalizedExtension = extension === 'jpg' ? 'jpeg' : extension
  if (!['png', 'jpeg', 'gif'].includes(normalizedExtension)) return
  try {
    const imageId = workbook.addImage({
      buffer: await readFile(imagePath),
      extension: normalizedExtension as 'png' | 'jpeg' | 'gif'
    })
    worksheet.addImage(imageId, {
      tl: { col: 1.08, row: row - 0.92 },
      br: { col: 1.92, row: row - 0.08 },
      editAs: 'oneCell'
    })
  } catch {
    // 产品图片只是展示增强；文件不存在或损坏时保留空白图片格，不能阻断单据导出。
  }
}

function styleHeaderRow(
  worksheet: ExcelJS.Worksheet,
  row: number,
  columnCount: number,
  yellow = false
): void {
  for (let column = 1; column <= columnCount; column += 1) {
    const cell = worksheet.getCell(row, column)
    cell.font = { name: 'Microsoft YaHei', size: 11, bold: true }
    cell.alignment = centered
    cell.border = thinBorder
    if (yellow) cell.fill = yellowFill
  }
}

function styleTitleCell(cell: ExcelJS.Cell): void {
  cell.font = { name: 'Microsoft YaHei', size: 14, bold: true }
  cell.alignment = centered
}

function toWorkbookBuffer(workbook: ExcelJS.Workbook): Promise<Uint8Array> {
  return workbook.xlsx.writeBuffer().then((buffer) => new Uint8Array(buffer))
}

export async function createOrderSheetWorkbook(
  input: OrderSheetWorkbookInput
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'YUMI Studio'
  const worksheet = workbook.addWorksheet('订单表')
  configurePrintLayout(worksheet)
  worksheet.columns = [
    { width: 8 },
    { width: 14 },
    { width: 24 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 16 },
    { width: 20 }
  ]

  worksheet.mergeCells('A1:E1')
  worksheet.mergeCells('F1:K1')
  worksheet.mergeCells('A2:K2')
  worksheet.mergeCells('A3:K3')
  worksheet.getCell('A1').value = `客户：${input.customerName}`
  worksheet.getCell('F1').value = `联系电话：${input.contact}`
  worksheet.getCell('A2').value = `收货地址：${input.address}`
  worksheet.getCell('A3').value = `下单表：${orderDate(input.createdAt)}`
  worksheet.getCell('A3').font = {
    name: 'Microsoft YaHei',
    size: 14,
    bold: true,
    color: { argb: 'FFCC0000' }
  }
  worksheet.getCell('A3').alignment = centered
  for (const cell of ['A1', 'F1', 'A2']) {
    worksheet.getCell(cell).font = { name: 'Microsoft YaHei', size: 10 }
    worksheet.getCell(cell).alignment = { vertical: 'middle' }
  }

  const headers = [
    '序号',
    '产品图',
    '产品名称',
    '产品克重',
    '理望单价',
    '包装费',
    '替换袋',
    '总单价',
    '订购数量',
    '总金额',
    '备注'
  ]
  worksheet.getRow(4).values = headers
  worksheet.getRow(4).height = 26
  styleHeaderRow(worksheet, 4, headers.length, true)

  for (const [index, item] of input.rows.entries()) {
    const row = index + 5
    worksheet.getRow(row).height = 62
    worksheet.getCell(row, 1).value = index + 1
    worksheet.getCell(row, 3).value = item.productName
    worksheet.getCell(row, 4).value = item.weightGrams
    worksheet.getCell(row, 5).value = item.unitPrice
    worksheet.getCell(row, 6).value = item.packagingFee
    worksheet.getCell(row, 7).value = item.replacementBagFee
    worksheet.getCell(row, 8).value = item.totalUnitPrice
    worksheet.getCell(row, 9).value = item.quantity
    worksheet.getCell(row, 10).value = item.totalAmount
    worksheet.getCell(row, 11).value = item.notes
    for (const column of [5, 6, 7, 8, 10]) worksheet.getCell(row, column).numFmt = '¥#,##0.00'
    worksheet.getCell(row, 4).numFmt = '0.00'
    applyGrid(worksheet, row, row, headers.length)
    await addProductImage(workbook, worksheet, input.imagePathByProductId.get(item.productId), row)
  }

  const totalRow = input.rows.length + 5
  worksheet.mergeCells(totalRow, 1, totalRow, 8)
  worksheet.getCell(totalRow, 1).value = '合计'
  worksheet.getCell(totalRow, 9).value = input.rows.reduce(
    (total, item) => total + item.quantity,
    0
  )
  worksheet.getCell(totalRow, 10).value = input.rows.reduce(
    (total, item) => total + item.totalAmount,
    0
  )
  worksheet.getCell(totalRow, 10).numFmt = '¥#,##0.00'
  worksheet.getRow(totalRow).height = 24
  applyGrid(worksheet, totalRow, totalRow, headers.length)
  for (let column = 1; column <= headers.length; column += 1) {
    worksheet.getCell(totalRow, column).font = {
      name: 'Microsoft YaHei',
      size: 11,
      bold: true,
      color: { argb: 'FFCC0000' }
    }
  }

  styleTitleCell(worksheet.getCell('A3'))
  return toWorkbookBuffer(workbook)
}

export async function createShipmentManifestWorkbook(
  input: ShipmentManifestWorkbookInput
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'YUMI Studio'
  const worksheet = workbook.addWorksheet('发货清单')
  configurePrintLayout(worksheet)
  worksheet.columns = [
    { width: 8 },
    { width: 14 },
    { width: 28 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 24 }
  ]

  worksheet.mergeCells('A1:G1')
  worksheet.mergeCells('A2:C2')
  worksheet.mergeCells('D2:G2')
  worksheet.getCell('A1').value = `${shipmentTitleDate(input.shippedAt)}发货清单`
  styleTitleCell(worksheet.getCell('A1'))
  worksheet.getCell('A2').value = `客户：${input.customerName}`
  worksheet.getCell('D2').value =
    `发货总数：${input.rows.reduce((total, item) => total + item.shipmentQuantity, 0)}`
  for (const cell of ['A2', 'D2']) {
    worksheet.getCell(cell).font = { name: 'Microsoft YaHei', size: 10 }
    worksheet.getCell(cell).alignment = { vertical: 'middle' }
  }

  const headers = ['序号', '产品图', '产品名称', '采购总数量', '本次发货数量', '未发货数量', '备注']
  worksheet.getRow(3).values = headers
  worksheet.getRow(3).height = 26
  styleHeaderRow(worksheet, 3, headers.length)

  for (const [index, item] of input.rows.entries()) {
    const row = index + 4
    worksheet.getRow(row).height = 62
    worksheet.getCell(row, 1).value = index + 1
    worksheet.getCell(row, 3).value = item.productName
    worksheet.getCell(row, 4).value = item.orderedQuantity
    worksheet.getCell(row, 5).value = item.shipmentQuantity
    worksheet.getCell(row, 6).value = item.pendingQuantity
    worksheet.getCell(row, 7).value = item.notes
    applyGrid(worksheet, row, row, headers.length)
    await addProductImage(workbook, worksheet, input.imagePathByProductId.get(item.productId), row)
  }

  const totalRow = input.rows.length + 4
  worksheet.mergeCells(totalRow, 1, totalRow, 3)
  worksheet.getCell(totalRow, 1).value = '总计'
  worksheet.getCell(totalRow, 4).value = input.rows.reduce(
    (total, item) => total + item.orderedQuantity,
    0
  )
  worksheet.getCell(totalRow, 5).value = input.rows.reduce(
    (total, item) => total + item.shipmentQuantity,
    0
  )
  worksheet.getCell(totalRow, 6).value = input.rows.reduce(
    (total, item) => total + item.pendingQuantity,
    0
  )
  worksheet.getRow(totalRow).height = 24
  applyGrid(worksheet, totalRow, totalRow, headers.length)
  for (let column = 1; column <= headers.length; column += 1) {
    worksheet.getCell(totalRow, column).font = { name: 'Microsoft YaHei', size: 11, bold: true }
  }

  const footerRow = totalRow + 1
  worksheet.mergeCells(footerRow, 1, footerRow, 3)
  worksheet.mergeCells(footerRow, 4, footerRow, 7)
  worksheet.mergeCells(footerRow + 1, 1, footerRow + 1, 7)
  worksheet.getCell(footerRow, 1).value = `发货时间：${shipmentFooterDate(input.shippedAt)}`
  worksheet.getCell(footerRow, 4).value = `收货人：${input.customerName}`
  worksheet.getCell(footerRow + 1, 1).value = `备注：${input.notes}`
  applyGrid(worksheet, footerRow, footerRow + 1, headers.length)
  for (const cell of [
    worksheet.getCell(footerRow, 1),
    worksheet.getCell(footerRow, 4),
    worksheet.getCell(footerRow + 1, 1)
  ]) {
    cell.font = { name: 'Microsoft YaHei', size: 10 }
    cell.alignment = { vertical: 'middle', wrapText: true }
  }

  return toWorkbookBuffer(workbook)
}
