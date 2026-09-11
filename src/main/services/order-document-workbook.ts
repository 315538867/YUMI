import ExcelJS from 'exceljs'

export interface DocumentImage {
  buffer: Buffer
  extension: 'jpeg' | 'png' | 'gif'
}

export interface OrderTableDocument {
  orderCode: string
  customer: {
    name: string
    contact: string | null
    address: string | null
  }
  createdAt: string
  expectedShipDate: string | null
  notes: string | null
  items: Array<{
    productName: string
    image: DocumentImage | null
    unitWeightMilligrams: number | null
    unitPriceCents: number
    itemAmountCents: number
    edgeEnabled: boolean
    edgeQuantity: number
    edgeUnitPriceCents: number
    edgeAmountCents: number
    itemDiscountCents: number
    quantity: number
    lineAmountCents: number
    notes: string | null
  }>
  totals: {
    totalQuantity: number
    itemAmountCents: number
    edgeAmountCents: number
    itemDiscountCents: number
    orderDiscountCents: number
    orderAmountCents: number
  }
}

export interface ShippingListDocument {
  orderCode: string
  customer: {
    name: string
    contact: string | null
    address: string | null
  }
  generatedAt: string
  shipment: {
    shippedOn: string | null
    carrier: string | null
    trackingNumber: string | null
    /** 指定批次导出时保留作废历史；缺失时兼容旧调用并按有效批次处理。 */
    status?: 'active' | 'voided'
    voidedOn?: string | null
    voidReason?: string | null
  } | null
  items: Array<{
    productName: string
    image: DocumentImage | null
    unitWeightMilligrams: number | null
    orderedQuantity: number
    thisShipmentQuantity: number | null
    shippedQuantity: number
    remainingQuantity: number
    notes: string | null
  }>
}

const palette = {
  brand: 'C95078',
  brandLight: 'F8E4EC',
  border: 'E8DDE1',
  heading: '3A3034',
  muted: '766D71',
  total: 'FCF5F7'
}

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: palette.border } },
  left: { style: 'thin', color: { argb: palette.border } },
  bottom: { style: 'thin', color: { argb: palette.border } },
  right: { style: 'thin', color: { argb: palette.border } }
}

function yuan(cents: number): number {
  return cents / 100
}

function weightGrams(weightMilligrams: number | null): number | string {
  return weightMilligrams === null ? '未维护' : weightMilligrams / 1000
}

function text(value: string | null | undefined): string {
  return value?.trim() || '—'
}

function prepareSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columnWidths: number[]
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name, {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.1, footer: 0.1 }
    },
    views: [{ state: 'frozen', ySplit: 7 }]
  })
  columnWidths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width
  })
  sheet.properties.defaultRowHeight = 20
  return sheet
}

function addTitle(sheet: ExcelJS.Worksheet, title: string, columnCount: number): void {
  sheet.mergeCells(1, 1, 1, columnCount)
  const cell = sheet.getCell('A1')
  cell.value = title
  cell.font = { name: 'Microsoft YaHei', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.brand } }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(1).height = 30
}

function addMetaRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  entries: Array<{ label: string; value: string }>,
  columnCount: number
): void {
  let column = 1
  for (const entry of entries) {
    const labelCell = sheet.getCell(row, column)
    labelCell.value = entry.label
    labelCell.font = { bold: true, color: { argb: palette.heading } }
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.brandLight } }
    labelCell.border = thinBorder
    labelCell.alignment = { vertical: 'middle' }
    const valueEnd = Math.min(column + 2, columnCount)
    sheet.mergeCells(row, column + 1, row, valueEnd)
    const valueCell = sheet.getCell(row, column + 1)
    valueCell.value = entry.value
    valueCell.border = thinBorder
    valueCell.alignment = { vertical: 'middle', wrapText: true }
    for (let current = column + 2; current <= valueEnd; current += 1) {
      sheet.getCell(row, current).border = thinBorder
    }
    column += 4
  }
}

function addNotesRow(sheet: ExcelJS.Worksheet, row: number, notes: string | null, columnCount: number): void {
  const label = sheet.getCell(row, 1)
  label.value = '备注'
  label.font = { bold: true, color: { argb: palette.heading } }
  label.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.brandLight } }
  label.border = thinBorder
  sheet.mergeCells(row, 2, row, columnCount)
  const value = sheet.getCell(row, 2)
  value.value = text(notes)
  value.border = thinBorder
  value.alignment = { wrapText: true, vertical: 'middle' }
  for (let column = 3; column <= columnCount; column += 1) sheet.getCell(row, column).border = thinBorder
  sheet.getRow(row).height = 28
}

function styleHeader(sheet: ExcelJS.Worksheet, row: number, headers: string[]): void {
  headers.forEach((header, index) => {
    const cell = sheet.getCell(row, index + 1)
    cell.value = header
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.brand } }
    cell.border = thinBorder
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
  sheet.getRow(row).height = 30
}

function styleDataRow(sheet: ExcelJS.Worksheet, row: number, columnCount: number): void {
  for (let column = 1; column <= columnCount; column += 1) {
    const cell = sheet.getCell(row, column)
    cell.border = thinBorder
    cell.alignment = { horizontal: column === 2 || column === columnCount ? 'left' : 'center', vertical: 'middle', wrapText: true }
  }
  sheet.getRow(row).height = 46
}

function addImage(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  row: number,
  image: DocumentImage | null
): void {
  if (!image) return
  try {
    const imageId = workbook.addImage(image)
    sheet.addImage(imageId, {
      tl: { col: 0.15, row: row - 0.85 },
      br: { col: 0.85, row: row - 0.15 },
      editAs: 'oneCell'
    })
  } catch {
    // 图片附件损坏或格式不受支持时，导出正文仍应可用。
  }
}

function applyMoneyFormat(cell: ExcelJS.Cell): void {
  cell.numFmt = '¥#,##0.00;[Red]-¥#,##0.00'
}

function sheetName(base: string, index: number, total: number): string {
  return total === 1 || index === 0 ? base : `${base}-${index + 1}`
}

function buildOrderTableSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  document: OrderTableDocument
): void {
  const sheet = prepareSheet(workbook, name, [11, 20, 9, 10, 12, 12, 12, 12, 12, 12, 10, 13, 20])
  addTitle(sheet, 'YUMI 订单表', 13)
  addMetaRow(sheet, 2, [
    { label: '客户', value: text(document.customer.name) },
    { label: '联系方式', value: text(document.customer.contact) },
    { label: '收货地址', value: text(document.customer.address) }
  ], 13)
  addMetaRow(sheet, 3, [
    { label: '订单号', value: document.orderCode },
    { label: '下单日期', value: document.createdAt },
    { label: '制作截止', value: text(document.expectedShipDate) }
  ], 13)
  addNotesRow(sheet, 4, document.notes, 13)
  styleHeader(sheet, 7, [
    '图片', '商品名称', '缝边', '缝边数量', '缝边单价(元)', '缝边金额(元)', '单件重量(克)',
    '成交单价(元)', '商品金额(元)', '明细优惠(元)', '订购数量', '金额(元)', '商品备注'
  ])

  let row = 8
  for (const item of document.items) {
    sheet.getCell(row, 2).value = item.productName
    sheet.getCell(row, 3).value = item.edgeEnabled ? '是' : '否'
    sheet.getCell(row, 4).value = item.edgeEnabled ? item.edgeQuantity : 0
    sheet.getCell(row, 5).value = yuan(item.edgeUnitPriceCents)
    sheet.getCell(row, 6).value = yuan(item.edgeAmountCents)
    sheet.getCell(row, 7).value = weightGrams(item.unitWeightMilligrams)
    sheet.getCell(row, 8).value = yuan(item.unitPriceCents)
    sheet.getCell(row, 9).value = yuan(item.itemAmountCents)
    sheet.getCell(row, 10).value = yuan(item.itemDiscountCents)
    sheet.getCell(row, 11).value = item.quantity
    sheet.getCell(row, 12).value = yuan(item.lineAmountCents)
    sheet.getCell(row, 13).value = text(item.notes)
    ;[5, 6, 8, 9, 10, 12].forEach((column) => applyMoneyFormat(sheet.getCell(row, column)))
    styleDataRow(sheet, row, 13)
    addImage(workbook, sheet, row, item.image)
    row += 1
  }

  const totals: Array<[string, number, boolean]> = [
    ['订单优惠', yuan(document.totals.orderDiscountCents), true],
    ['商品总数量', document.totals.totalQuantity, false],
    ['商品金额合计', yuan(document.totals.itemAmountCents), true],
    ['缝边金额合计', yuan(document.totals.edgeAmountCents), true],
    ['明细优惠合计', yuan(document.totals.itemDiscountCents), true],
    ['订单金额', yuan(document.totals.orderAmountCents), true]
  ]
  totals.forEach(([label, value, isMoney], offset) => {
    const totalRow = row + 2 + offset
    sheet.mergeCells(totalRow, 1, totalRow, 10)
    const labelCell = sheet.getCell(totalRow, 1)
    labelCell.value = label
    labelCell.font = { bold: true, color: { argb: palette.heading } }
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.total } }
    labelCell.alignment = { horizontal: 'right', vertical: 'middle' }
    const valueCell = sheet.getCell(totalRow, 12)
    valueCell.value = value
    valueCell.font = { bold: true, color: { argb: palette.heading } }
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.total } }
    valueCell.alignment = { horizontal: 'right', vertical: 'middle' }
    if (isMoney) applyMoneyFormat(valueCell)
    for (let column = 1; column <= 13; column += 1) {
      sheet.getCell(totalRow, column).border = thinBorder
      sheet.getCell(totalRow, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.total } }
    }
  })
  sheet.pageSetup.printArea = `A1:M${row + 7}`
}

function buildShippingListSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  document: ShippingListDocument,
  isSummary = false
): void {
  const sheet = prepareSheet(workbook, name, [11, 22, 14, 12, 12, 12, 12, 22])
  const isVoidedHistory = document.shipment?.status === 'voided'
  addTitle(
    sheet,
    isSummary ? 'YUMI 发货汇总' : isVoidedHistory ? 'YUMI 已作废发货清单' : 'YUMI 发货清单',
    8
  )
  addMetaRow(sheet, 2, [
    { label: '客户', value: text(document.customer.name) },
    { label: '联系方式', value: text(document.customer.contact) }
  ], 8)
  addMetaRow(sheet, 3, [
    { label: '订单号', value: document.orderCode },
    { label: '生成日期', value: document.generatedAt }
  ], 8)
  const shipmentInfo = document.shipment
    ? `${text(document.shipment.shippedOn)} / ${text(document.shipment.carrier)} / ${text(document.shipment.trackingNumber)}`
    : '—'
  const voidedInfo = isVoidedHistory
    ? `已作废 ${text(document.shipment?.voidedOn)}${document.shipment?.voidReason ? ` · ${document.shipment.voidReason}` : ''}`
    : shipmentInfo
  addMetaRow(sheet, 4, [
    { label: '收货地址', value: text(document.customer.address) },
    {
      label: isSummary ? '汇总口径' : '发货信息',
      value: isSummary ? '仅统计有效发货批次' : voidedInfo
    }
  ], 8)
  const headers = isSummary
    ? ['图片', '商品名称', '单件重量(克)', '订单数量', '有效累计已发', '待发数量', '商品备注', '订单号']
    : ['图片', '商品名称', '单件重量(克)', '本批发货', '订单数量', '累计已发', '待发数量', '商品备注']
  styleHeader(sheet, 7, headers)

  let row = 8
  for (const item of document.items) {
    sheet.getCell(row, 2).value = item.productName
    sheet.getCell(row, 3).value = weightGrams(item.unitWeightMilligrams)
    if (isSummary) {
      sheet.getCell(row, 4).value = item.orderedQuantity
      sheet.getCell(row, 5).value = item.shippedQuantity
      sheet.getCell(row, 6).value = item.remainingQuantity
      sheet.getCell(row, 7).value = text(item.notes)
      sheet.getCell(row, 8).value = document.orderCode
    } else {
      sheet.getCell(row, 4).value = item.thisShipmentQuantity ?? ''
      sheet.getCell(row, 5).value = item.orderedQuantity
      sheet.getCell(row, 6).value = item.shippedQuantity
      sheet.getCell(row, 7).value = item.remainingQuantity
      sheet.getCell(row, 8).value = text(item.notes)
    }
    styleDataRow(sheet, row, 8)
    addImage(workbook, sheet, row, item.image)
    row += 1
  }
  sheet.pageSetup.printArea = `A1:H${Math.max(7, row - 1)}`
}

function createWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'YUMI Studio'
  workbook.created = new Date()
  return workbook
}

function orderTableSource(documents: OrderTableDocument[]): OrderTableDocument[] {
  return documents.length > 0 ? documents : [{
    orderCode: '暂无订单', customer: { name: '—', contact: null, address: null }, createdAt: '—', expectedShipDate: null,
    notes: null, items: [], totals: {
      totalQuantity: 0, itemAmountCents: 0, edgeAmountCents: 0, itemDiscountCents: 0, orderDiscountCents: 0, orderAmountCents: 0
    }
  }]
}

function shippingListSource(documents: ShippingListDocument[]): ShippingListDocument[] {
  return documents.length > 0 ? documents : [{
    orderCode: '暂无订单', customer: { name: '—', contact: null, address: null }, generatedAt: '—', shipment: null, items: []
  }]
}

export async function buildOrderTableWorkbook(documents: OrderTableDocument[]): Promise<Buffer> {
  const workbook = createWorkbook()
  const source = orderTableSource(documents)
  source.forEach((document, index) => buildOrderTableSheet(workbook, sheetName('订单表', index, source.length), document))
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function buildShippingListWorkbook(documents: ShippingListDocument[]): Promise<Buffer> {
  const workbook = createWorkbook()
  const source = shippingListSource(documents)
  const isSummary = source.every((document) => document.shipment === null)
  const baseName = isSummary ? '发货汇总' : '发货清单'
  source.forEach((document, index) => buildShippingListSheet(
    workbook,
    sheetName(baseName, index, source.length),
    document,
    isSummary
  ))
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

/** 已保存订单的合并导出：同一文件同时提供订单核对表与发货清单。 */
export async function buildOrderAndShippingWorkbook(
  orderDocuments: OrderTableDocument[],
  shippingDocuments: ShippingListDocument[]
): Promise<Buffer> {
  const workbook = createWorkbook()
  const orders = orderTableSource(orderDocuments)
  const shipments = shippingListSource(shippingDocuments)
  orders.forEach((document, index) => buildOrderTableSheet(workbook, sheetName('订单表', index, orders.length), document))
  shipments.forEach((document, index) => buildShippingListSheet(workbook, sheetName('发货清单', index, shipments.length), document))
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
