import * as XLSX from 'xlsx'
import type {
  V2OrderDocumentsExportInput,
  V2OrderTableExportInput,
  V2ReportExportInput,
  V2ShippingListExportInput
} from '@shared/contracts/reports'
import {
  buildOrderAndShippingWorkbook,
  buildOrderTableWorkbook,
  buildShippingListWorkbook,
  type DocumentImage,
  type OrderTableDocument,
  type ShippingListDocument
} from './order-document-workbook'
import type { ReportService } from './report-service'

function appendBusinessSheet(
  workbook: XLSX.WorkBook,
  name: string,
  headers: string[],
  rows: Array<Array<string | number>>
): void {
  // 固定表头保证空数据时的导出结构仍与报表页面一致。
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...rows]), name)
}

/**
 * 以报表服务提供的 V2 已确认事实生成工作簿。
 * 此处不读取数据库、更不引用 V1 服务或表，确保导出与报表页面使用相同口径。
 */
export class V2ReportExportService {
  constructor(
    private readonly reports: Pick<
      ReportService,
      | 'getOrderBusiness'
      | 'getFulfillmentProgress'
      | 'listConfirmedSettlements'
      | 'getMonthlyOperation'
    > &
      Partial<
        Pick<
          ReportService,
          | 'getOrderTable'
          | 'getShippingList'
          | 'getOrderTableDocuments'
          | 'getShippingListDocuments'
        >
      >,
    private readonly resolveImage: (
      attachmentId: string
    ) => Promise<DocumentImage | null> = async () => null
  ) {}

  async exportOrderTableWorkbook(input: V2OrderTableExportInput = {}): Promise<Uint8Array> {
    const documents = await this.hydrateOrderDocuments(
      this.reports.getOrderTableDocuments?.(input) ?? []
    )
    return buildOrderTableWorkbook(documents)
  }

  async exportShippingListWorkbook(input: V2ShippingListExportInput = {}): Promise<Uint8Array> {
    const documents = await this.hydrateShippingListDocuments(
      this.reports.getShippingListDocuments?.(input) ?? []
    )
    return buildShippingListWorkbook(documents)
  }

  async exportOrderDocumentsWorkbook(input: V2OrderDocumentsExportInput): Promise<Uint8Array> {
    const orderDocuments = await this.hydrateOrderDocuments(
      this.reports.getOrderTableDocuments?.({ orderId: input.orderId }) ?? []
    )
    // 合并单据只能对应已指定的发货批次，避免在没有批次语义时伪造“发货清单”。
    if (!input.shipmentId) return buildOrderTableWorkbook(orderDocuments)

    const shippingDocuments = await this.hydrateShippingListDocuments(
      this.reports.getShippingListDocuments?.(input) ?? []
    )
    return buildOrderAndShippingWorkbook(orderDocuments, shippingDocuments)
  }

  private async resolveDocumentImage(attachmentId: string | null): Promise<DocumentImage | null> {
    if (!attachmentId) return null
    try {
      return await this.resolveImage(attachmentId)
    } catch {
      // 单张图片缺失、损坏或读取失败均不能阻断业务单据导出。
      return null
    }
  }

  private async hydrateOrderDocuments(
    documents: NonNullable<ReturnType<ReportService['getOrderTableDocuments']>>
  ): Promise<OrderTableDocument[]> {
    return Promise.all(
      documents.map(async (document) => ({
        orderCode: document.orderCode,
        customer: {
          name: document.customerName,
          contact: document.customerContact,
          address: document.customerAddress
        },
        createdAt: document.createdAt,
        expectedShipDate: document.expectedShipDate,
        notes: document.notes,
        items: await Promise.all(
          document.items.map(async (item) => ({
            ...item,
            image: await this.resolveDocumentImage(item.imageAttachmentId)
          }))
        ),
        totals: document.totals
      }))
    )
  }

  private async hydrateShippingListDocuments(
    documents: NonNullable<ReturnType<ReportService['getShippingListDocuments']>>
  ): Promise<ShippingListDocument[]> {
    return Promise.all(
      documents.map(async (document) => ({
        orderCode: document.orderCode,
        customer: {
          name: document.customerName,
          contact: document.customerContact,
          address: document.customerAddress
        },
        generatedAt: document.generatedAt,
        shipment:
          document.shippedOn || document.carrier || document.trackingNumber
            ? {
                shippedOn: document.shippedOn,
                carrier: document.carrier,
                trackingNumber: document.trackingNumber,
                status: document.shipmentStatus ?? 'active',
                voidedOn: document.voidedOn ?? null,
                voidReason: document.voidReason ?? null
              }
            : null,
        items: await Promise.all(
          document.items.map(async (item) => ({
            ...item,
            image: await this.resolveDocumentImage(item.imageAttachmentId)
          }))
        )
      }))
    )
  }

  exportWorkbook(input: V2ReportExportInput): Uint8Array {
    const orderBusiness = this.reports.getOrderBusiness()
    const fulfillment = this.reports.getFulfillmentProgress()
    const settlements = this.reports.listConfirmedSettlements()
    const monthly = this.reports.getMonthlyOperation(input.month)
    const workbook = XLSX.utils.book_new()

    appendBusinessSheet(
      workbook,
      '订单核算',
      [
        '订单号',
        '客户',
        '订单金额',
        '净收款',
        '待收',
        '商品成本',
        '售后成本',
        '已知核算成本',
        '核算利润参考'
      ],
      orderBusiness.rows.map((row) => [
        row.orderCode,
        row.customerName,
        row.currentAmountCents,
        row.netReceivedCents,
        row.outstandingCents,
        row.productCostCents,
        row.afterSalesCostCents,
        row.knownAccountingCostCents,
        row.knownMarginCents
      ])
    )

    const orderTable = this.reports.getOrderTable?.()
    if (orderTable) {
      appendBusinessSheet(
        workbook,
        '订单表',
        [
          '订单号',
          '客户',
          '下单日期',
          '预计发货日期',
          '商品行数',
          '商品总数',
          '订单金额',
          '调整后应收',
          '净收款',
          '待收',
          '备注'
        ],
        orderTable.map((row) => [
          row.orderCode,
          row.customerName,
          row.createdAt,
          row.expectedShipDate ?? '',
          row.itemCount,
          row.totalQuantity,
          row.orderAmountCents,
          row.currentAmountCents,
          row.netReceivedCents,
          row.outstandingCents,
          row.notes ?? ''
        ])
      )
    }

    const shippingList = this.reports.getShippingList?.()
    if (shippingList) {
      appendBusinessSheet(
        workbook,
        '发货清单',
        [
          '订单号',
          '客户',
          '商品',
          '预计发货日期',
          '订单数量',
          '已发数量',
          '待发数量',
          '最近发货日期',
          '承运商',
          '运单号'
        ],
        shippingList.map((row) => [
          row.orderCode,
          row.customerName,
          row.productName,
          row.expectedShipDate ?? '',
          row.orderedQuantity,
          row.shippedQuantity,
          row.remainingQuantity,
          row.latestShippedOn ?? '',
          row.carrier ?? '',
          row.trackingNumber ?? ''
        ])
      )
    }

    appendBusinessSheet(
      workbook,
      '履约进度',
      ['订单号', '商品', '确认数量', '制作中', '待捏毛装袋', '待打包', '待发货', '已发货'],
      fulfillment.rows.map((row) => [
        row.orderCode,
        row.productName,
        row.confirmedQuantity,
        row.stages.making,
        row.stages.fluffingBagging,
        row.stages.packing,
        row.stages.readyToShip,
        row.stages.shipped
      ])
    )

    appendBusinessSheet(
      workbook,
      '已确认工资',
      ['兼职人员', '结算周期', '实际付款日', '实发金额', '负责人备注'],
      settlements.rows.map((row) => [
        row.workerName,
        `${row.periodStartOn} 至 ${row.periodEndOn}`,
        row.paidOn,
        row.finalPaidAmountCents,
        row.managerNote ?? ''
      ])
    )

    appendBusinessSheet(
      workbook,
      '月度经营',
      ['统计月份', '实际收入', '经营支出', '经营结果', '已确认工资'],
      [
        [
          monthly.month,
          monthly.incomeCents,
          monthly.operatingExpenseCents,
          monthly.operatingResultCents,
          monthly.confirmedSettlementPaidCents
        ]
      ]
    )

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  }
}
