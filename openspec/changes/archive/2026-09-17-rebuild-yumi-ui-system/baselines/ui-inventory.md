# P0 · UI 运行时导出与调用点盘点（任务 1.1）

来源：`src/renderer/components/ui/index.ts`

- 运行时导出：53
- 仅类型导出：20
- 生产零使用：10
- 仅被同层 ui 组件消费：4
- 被页面/领域消费：39

## 生产零使用（P1 任务 3.9 的候选删除清单）

| 导出 | 声明文件 | 提案是否点名删除 |
| --- | --- | --- |
| `YumiCluster` | `src/renderer/components/ui/layout/yumi-cluster.tsx` | **否，需决策** |
| `YumiDivider` | `src/renderer/components/ui/layout/yumi-divider.tsx` | **否，需决策** |
| `YumiGrid` | `src/renderer/components/ui/layout/yumi-grid.tsx` | **否，需决策** |
| `YumiNotification` | `src/renderer/components/ui/notification/yumi-notification.tsx` | **否，需决策** |
| `YumiNotificationHost` | `src/renderer/components/ui/notification/yumi-notification.tsx` | **否，需决策** |
| `YumiPageActions` | `src/renderer/components/ui/page-header/yumi-page-header.tsx` | **否，需决策** |
| `YumiPageStack` | `src/renderer/components/ui/layout/yumi-page-stack.tsx` | **否，需决策** |
| `YumiScrollArea` | `src/renderer/components/ui/layout/yumi-scroll-area.tsx` | **否，需决策** |
| `YumiSectionHeader` | `src/renderer/components/ui/page-header/yumi-page-header.tsx` | **否，需决策** |
| `useYumiNotification` | `src/renderer/components/ui/notification/yumi-notification-context.ts` | **否，需决策** |

## 仅被同层 ui 组件消费

| 导出 | 声明文件 | 消费方 |
| --- | --- | --- |
| `YumiActionMenu` | `src/renderer/components/ui/action-menu/yumi-action-menu.tsx` | `src/renderer/components/ui/page-header/yumi-page-header.tsx` |
| `YumiIconButton` | `src/renderer/components/ui/button/yumi-button.tsx` | `src/renderer/components/ui/notification/yumi-notification.tsx` |
| `getYumiNotificationTimeout` | `src/renderer/components/ui/notification/yumi-notification-context.ts` | `src/renderer/components/ui/notification/yumi-notification.tsx` |
| `useYumiFieldAccessibility` | `src/renderer/components/ui/field/yumi-field-accessibility.ts` | `src/renderer/components/ui/date-picker/yumi-date-picker.tsx`<br>`src/renderer/components/ui/field/yumi-field.tsx`<br>`src/renderer/components/ui/select/yumi-select.tsx` |

## 被页面/领域消费

| 导出 | 调用点文件数 | 声明文件 |
| --- | --- | --- |
| `YumiButton` | 24 | `src/renderer/components/ui/button/yumi-button.tsx` |
| `useYumiNotificationMessage` | 17 | `src/renderer/components/ui/notification/yumi-notification-context.ts` |
| `YumiDataTable` | 16 | `src/renderer/components/ui/data-table/yumi-data-table.tsx` |
| `YumiField` | 15 | `src/renderer/components/ui/field/yumi-field.tsx` |
| `YumiFieldLabel` | 15 | `src/renderer/components/ui/field/yumi-field.tsx` |
| `YumiEmptyState` | 14 | `src/renderer/components/ui/empty-state/yumi-empty-state.tsx` |
| `YumiStatusTag` | 14 | `src/renderer/components/ui/status-tag/yumi-status-tag.tsx` |
| `YumiFormMessage` | 13 | `src/renderer/components/ui/form-message.tsx` |
| `YumiSelect` | 13 | `src/renderer/components/ui/select/yumi-select.tsx` |
| `YumiTextArea` | 13 | `src/renderer/components/ui/field/yumi-field.tsx` |
| `YumiSection` | 12 | `src/renderer/components/ui/page-header/yumi-page-header.tsx` |
| `YumiTextField` | 12 | `src/renderer/components/ui/field/yumi-field.tsx` |
| `YumiDatePicker` | 11 | `src/renderer/components/ui/date-picker/yumi-date-picker.tsx` |
| `YumiDetailList` | 11 | `src/renderer/components/ui/detail-list/yumi-detail-list.tsx` |
| `YumiNumberField` | 11 | `src/renderer/components/ui/field/yumi-field.tsx` |
| `YumiPageHeader` | 10 | `src/renderer/components/ui/page-header/yumi-page-header.tsx` |
| `YumiListSurface` | 9 | `src/renderer/components/ui/list-surface/yumi-list-surface.tsx` |
| `YumiListToolbar` | 9 | `src/renderer/components/ui/list-toolbar/yumi-list-toolbar.tsx` |
| `YumiMetricStrip` | 9 | `src/renderer/components/ui/metric-strip/yumi-metric-strip.tsx` |
| `YumiSheet` | 8 | `src/renderer/components/ui/sheet/yumi-sheet.tsx` |
| `YumiConfirmDialog` | 6 | `src/renderer/components/ui/dialog/yumi-dialog.tsx` |
| `YumiDialog` | 6 | `src/renderer/components/ui/dialog/yumi-dialog.tsx` |
| `YumiPrimaryTabs` | 6 | `src/renderer/components/ui/tabs/yumi-tabs.tsx` |
| `YumiFormSection` | 5 | `src/renderer/components/ui/form-section/yumi-form-section.tsx` |
| `YumiRecordActionBar` | 4 | `src/renderer/components/ui/record-action-bar/yumi-record-action-bar.tsx` |
| `YumiSearchSelect` | 4 | `src/renderer/components/ui/select/yumi-select.tsx` |
| `YumiCalculatedAmount` | 3 | `src/renderer/components/ui/calculated-amount/index.ts` |
| `YumiCheckbox` | 2 | `src/renderer/components/ui/field/yumi-field.tsx` |
| `YumiEntitySummary` | 2 | `src/renderer/components/ui/entity-summary/yumi-entity-summary.tsx` |
| `YumiMonthPicker` | 2 | `src/renderer/components/ui/date-picker/yumi-date-picker.tsx` |
| `YumiNotificationProvider` | 2 | `src/renderer/components/ui/notification/yumi-notification.tsx` |
| `YumiRecordSummary` | 2 | `src/renderer/components/ui/page-header/yumi-page-header.tsx` |
| `YumiDateRangePicker` | 1 | `src/renderer/components/ui/date-picker/yumi-date-picker.tsx` |
| `YumiDocumentPreview` | 1 | `src/renderer/components/ui/document-preview/yumi-document-preview.tsx` |
| `YumiSegmentedTabs` | 1 | `src/renderer/components/ui/tabs/yumi-tabs.tsx` |
| `YumiSnapshotNotice` | 1 | `src/renderer/components/ui/snapshot-notice/yumi-snapshot-notice.tsx` |
| `YumiSplitLayout` | 1 | `src/renderer/components/ui/layout/yumi-split-layout.tsx` |
| `YumiStickyActions` | 1 | `src/renderer/components/ui/layout/yumi-sticky-actions.tsx` |
| `YumiTimeField` | 1 | `src/renderer/components/ui/date-picker/yumi-time-field.tsx` |

## 全部运行时导出与调用点

<details><summary>展开</summary>

- `YumiActionMenu` (src/renderer/components/ui/action-menu/yumi-action-menu.tsx)
  - src/renderer/components/ui/page-header/yumi-page-header.tsx
- `YumiButton` (src/renderer/components/ui/button/yumi-button.tsx)
  - src/renderer/components/after-sales/after-sales-panel.tsx
  - src/renderer/components/app-runtime-guard.tsx
  - src/renderer/components/fulfillment/dispatch-views.tsx
  - src/renderer/components/fulfillment/work-time-review-forms.tsx
  - src/renderer/components/fulfillment/work-time-review-panel.tsx
  - src/renderer/components/product/product-inventory-panel.tsx
  - src/renderer/components/settlement/settlement-detail.tsx
  - src/renderer/components/ui/action-menu/yumi-action-menu.tsx
  - src/renderer/components/ui/date-picker/yumi-date-picker.tsx
  - src/renderer/components/ui/dialog/yumi-dialog.tsx
  - src/renderer/components/ui/page-header/yumi-page-header.tsx
  - src/renderer/components/ui/record-action-bar/yumi-record-action-bar.tsx
  - src/renderer/components/ui/sheet/yumi-sheet.tsx
  - src/renderer/pages/app.tsx
  - src/renderer/pages/customers/index.tsx
  - src/renderer/pages/finance/index.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/products/index.tsx
  - src/renderer/pages/reports/index.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/settlements/index.tsx
  - src/renderer/pages/work-assignments/index.tsx
  - src/renderer/pages/workbench/index.tsx
  - src/renderer/pages/workers/index.tsx
- `YumiCalculatedAmount` (src/renderer/components/ui/calculated-amount/index.ts)
  - src/renderer/components/fulfillment/work-time-review-forms.tsx
  - src/renderer/components/ui/calculated-amount/yumi-calculated-amount.tsx
  - src/renderer/pages/products/index.tsx
- `YumiCheckbox` (src/renderer/components/ui/field/yumi-field.tsx)
  - src/renderer/components/fulfillment/work-time-review-forms.tsx
  - src/renderer/pages/orders/index.tsx
- `YumiCluster` (src/renderer/components/ui/layout/yumi-cluster.tsx)
  - — 无生产调用点
- `YumiConfirmDialog` (src/renderer/components/ui/dialog/yumi-dialog.tsx)
  - src/renderer/components/after-sales/after-sales-panel.tsx
  - src/renderer/components/settlement/settlement-detail.tsx
  - src/renderer/components/ui/sheet/yumi-sheet.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/settlements/index.tsx
- `YumiDataTable` (src/renderer/components/ui/data-table/yumi-data-table.tsx)
  - src/renderer/components/after-sales/after-sales-panel.tsx
  - src/renderer/components/fulfillment/dispatch-views.tsx
  - src/renderer/components/fulfillment/work-time-review-forms.tsx
  - src/renderer/components/fulfillment/work-time-review-panel.tsx
  - src/renderer/components/product/product-inventory-panel.tsx
  - src/renderer/components/settlement/settlement-detail.tsx
  - src/renderer/pages/customers/index.tsx
  - src/renderer/pages/finance/index.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/products/index.tsx
  - src/renderer/pages/reports/index.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/settlements/index.tsx
  - src/renderer/pages/work-assignments/index.tsx
  - src/renderer/pages/workbench/index.tsx
  - src/renderer/pages/workers/index.tsx
- `YumiDatePicker` (src/renderer/components/ui/date-picker/yumi-date-picker.tsx)
  - src/renderer/components/after-sales/after-sales-panel.tsx
  - src/renderer/components/fulfillment/dispatch-views.tsx
  - src/renderer/components/fulfillment/work-time-review-forms.tsx
  - src/renderer/components/product/product-inventory-panel.tsx
  - src/renderer/components/settlement/settlement-detail.tsx
  - src/renderer/pages/finance/index.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/reports/index.tsx
  - src/renderer/pages/settlements/index.tsx
  - src/renderer/pages/work-assignments/index.tsx
  - src/renderer/pages/workers/index.tsx
- `YumiDateRangePicker` (src/renderer/components/ui/date-picker/yumi-date-picker.tsx)
  - src/renderer/pages/settlements/index.tsx
- `YumiDetailList` (src/renderer/components/ui/detail-list/yumi-detail-list.tsx)
  - src/renderer/components/fulfillment/dispatch-views.tsx
  - src/renderer/components/fulfillment/work-time-review-forms.tsx
  - src/renderer/components/fulfillment/work-time-review-panel.tsx
  - src/renderer/components/product/product-inventory-panel.tsx
  - src/renderer/components/ui/document-preview/yumi-document-preview.tsx
  - src/renderer/components/ui/entity-summary/yumi-entity-summary.tsx
  - src/renderer/pages/customers/index.tsx
  - src/renderer/pages/products/index.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/work-assignments/index.tsx
  - src/renderer/pages/workers/index.tsx
- `YumiDialog` (src/renderer/components/ui/dialog/yumi-dialog.tsx)
  - src/renderer/components/fulfillment/dispatch-views.tsx
  - src/renderer/components/fulfillment/work-time-review-forms.tsx
  - src/renderer/components/fulfillment/work-time-review-panel.tsx
  - src/renderer/components/product/product-inventory-panel.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/work-assignments/index.tsx
- `YumiDivider` (src/renderer/components/ui/layout/yumi-divider.tsx)
  - — 无生产调用点
- `YumiDocumentPreview` (src/renderer/components/ui/document-preview/yumi-document-preview.tsx)
  - src/renderer/pages/orders/index.tsx
- `YumiEmptyState` (src/renderer/components/ui/empty-state/yumi-empty-state.tsx)
  - src/renderer/components/app-runtime-guard.tsx
  - src/renderer/components/fulfillment/dispatch-views.tsx
  - src/renderer/components/product/product-inventory-panel.tsx
  - src/renderer/pages/customers/index.tsx
  - src/renderer/pages/finance/index.tsx
  - src/renderer/pages/fulfillment/index.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/products/index.tsx
  - src/renderer/pages/reports/index.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/settlements/index.tsx
  - src/renderer/pages/work-assignments/index.tsx
  - src/renderer/pages/workbench/index.tsx
  - src/renderer/pages/workers/index.tsx
- `YumiEntitySummary` (src/renderer/components/ui/entity-summary/yumi-entity-summary.tsx)
  - src/renderer/components/patterns/detail-page.tsx
  - src/renderer/components/ui/page-header/yumi-page-header.tsx
- `YumiField` (src/renderer/components/ui/field/yumi-field.tsx)
  - src/renderer/components/after-sales/after-sales-panel.tsx
  - src/renderer/components/fulfillment/dispatch-views.tsx
  - src/renderer/components/fulfillment/work-time-review-forms.tsx
  - src/renderer/components/fulfillment/work-time-review-panel.tsx
  - src/renderer/components/product/product-inventory-panel.tsx
  - src/renderer/components/settlement/settlement-detail.tsx
  - src/renderer/pages/customers/index.tsx
  - src/renderer/pages/finance/index.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/products/index.tsx
  - src/renderer/pages/reports/index.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/settlements/index.tsx
  - src/renderer/pages/work-assignments/index.tsx
  - src/renderer/pages/workers/index.tsx
- `YumiFieldLabel` (src/renderer/components/ui/field/yumi-field.tsx)
  - src/renderer/components/after-sales/after-sales-panel.tsx
  - src/renderer/components/fulfillment/dispatch-views.tsx
  - src/renderer/components/fulfillment/work-time-review-forms.tsx
  - src/renderer/components/fulfillment/work-time-review-panel.tsx
  - src/renderer/components/product/product-inventory-panel.tsx
  - src/renderer/components/settlement/settlement-detail.tsx
  - src/renderer/pages/customers/index.tsx
  - src/renderer/pages/finance/index.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/products/index.tsx
  - src/renderer/pages/reports/index.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/settlements/index.tsx
  - src/renderer/pages/work-assignments/index.tsx
  - src/renderer/pages/workers/index.tsx
- `YumiFormMessage` (src/renderer/components/ui/form-message.tsx)
  - src/renderer/components/after-sales/after-sales-panel.tsx
  - src/renderer/components/fulfillment/dispatch-views.tsx
  - src/renderer/components/fulfillment/work-time-review-forms.tsx
  - src/renderer/components/fulfillment/work-time-review-panel.tsx
  - src/renderer/components/product/product-inventory-panel.tsx
  - src/renderer/components/settlement/settlement-detail.tsx
  - src/renderer/components/ui/field/yumi-field.tsx
  - src/renderer/pages/customers/index.tsx
  - src/renderer/pages/finance/index.tsx
  - src/renderer/pages/fulfillment/index.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/products/index.tsx
  - src/renderer/pages/settings/index.tsx
- `YumiFormSection` (src/renderer/components/ui/form-section/yumi-form-section.tsx)
  - src/renderer/pages/customers/index.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/products/index.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/workers/index.tsx
- `YumiGrid` (src/renderer/components/ui/layout/yumi-grid.tsx)
  - — 无生产调用点
- `YumiIconButton` (src/renderer/components/ui/button/yumi-button.tsx)
  - src/renderer/components/ui/notification/yumi-notification.tsx
- `YumiListSurface` (src/renderer/components/ui/list-surface/yumi-list-surface.tsx)
  - src/renderer/components/after-sales/after-sales-panel.tsx
  - src/renderer/components/patterns/list-page.tsx
  - src/renderer/pages/finance/index.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/reports/index.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/work-assignments/index.tsx
  - src/renderer/pages/workbench/index.tsx
  - src/renderer/pages/workers/index.tsx
- `YumiListToolbar` (src/renderer/components/ui/list-toolbar/yumi-list-toolbar.tsx)
  - src/renderer/components/after-sales/after-sales-panel.tsx
  - src/renderer/components/patterns/list-page.tsx
  - src/renderer/pages/finance/index.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/reports/index.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/work-assignments/index.tsx
  - src/renderer/pages/workbench/index.tsx
  - src/renderer/pages/workers/index.tsx
- `YumiMetricStrip` (src/renderer/components/ui/metric-strip/yumi-metric-strip.tsx)
  - src/renderer/components/after-sales/after-sales-panel.tsx
  - src/renderer/components/patterns/dashboard-overview.tsx
  - src/renderer/components/patterns/detail-page.tsx
  - src/renderer/components/patterns/list-page.tsx
  - src/renderer/components/settlement/settlement-detail.tsx
  - src/renderer/components/ui/entity-summary/yumi-entity-summary.tsx
  - src/renderer/components/ui/page-header/yumi-page-header.tsx
  - src/renderer/pages/fulfillment/index.tsx
  - src/renderer/pages/orders/index.tsx
- `YumiMonthPicker` (src/renderer/components/ui/date-picker/yumi-date-picker.tsx)
  - src/renderer/pages/finance/index.tsx
  - src/renderer/pages/reports/index.tsx
- `YumiNotification` (src/renderer/components/ui/notification/yumi-notification.tsx)
  - — 无生产调用点
- `YumiNotificationHost` (src/renderer/components/ui/notification/yumi-notification.tsx)
  - — 无生产调用点
- `YumiNotificationProvider` (src/renderer/components/ui/notification/yumi-notification.tsx)
  - src/renderer/components/ui/notification/yumi-notification-context.ts
  - src/renderer/main.tsx
- `YumiNumberField` (src/renderer/components/ui/field/yumi-field.tsx)
  - src/renderer/components/after-sales/after-sales-panel.tsx
  - src/renderer/components/fulfillment/dispatch-views.tsx
  - src/renderer/components/fulfillment/work-time-review-forms.tsx
  - src/renderer/components/product/product-inventory-panel.tsx
  - src/renderer/components/settlement/settlement-detail.tsx
  - src/renderer/pages/finance/index.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/products/index.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/settlements/index.tsx
  - src/renderer/pages/workers/index.tsx
- `YumiPageActions` (src/renderer/components/ui/page-header/yumi-page-header.tsx)
  - — 无生产调用点
- `YumiPageHeader` (src/renderer/components/ui/page-header/yumi-page-header.tsx)
  - src/renderer/components/patterns/calendar-workspace.tsx
  - src/renderer/components/patterns/dashboard-overview.tsx
  - src/renderer/components/patterns/detail-page.tsx
  - src/renderer/components/patterns/form-workspace.tsx
  - src/renderer/components/patterns/list-page.tsx
  - src/renderer/components/patterns/review-workspace.tsx
  - src/renderer/components/patterns/settings-workspace.tsx
  - src/renderer/components/ui/list-toolbar/yumi-list-toolbar.tsx
  - src/renderer/pages/fulfillment/index.tsx
  - src/renderer/pages/settlements/index.tsx
- `YumiPageStack` (src/renderer/components/ui/layout/yumi-page-stack.tsx)
  - — 无生产调用点
- `YumiPrimaryTabs` (src/renderer/components/ui/tabs/yumi-tabs.tsx)
  - src/renderer/components/patterns/detail-page.tsx
  - src/renderer/pages/finance/index.tsx
  - src/renderer/pages/fulfillment/index.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/settlements/index.tsx
  - src/renderer/pages/workbench/index.tsx
- `YumiRecordActionBar` (src/renderer/components/ui/record-action-bar/yumi-record-action-bar.tsx)
  - src/renderer/components/fulfillment/work-time-review-panel.tsx
  - src/renderer/components/product/product-inventory-panel.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/work-assignments/index.tsx
- `YumiRecordSummary` (src/renderer/components/ui/page-header/yumi-page-header.tsx)
  - src/renderer/components/settlement/settlement-detail.tsx
  - src/renderer/components/ui/entity-summary/yumi-entity-summary.tsx
- `YumiScrollArea` (src/renderer/components/ui/layout/yumi-scroll-area.tsx)
  - — 无生产调用点
- `YumiSearchSelect` (src/renderer/components/ui/select/yumi-select.tsx)
  - src/renderer/components/after-sales/after-sales-panel.tsx
  - src/renderer/pages/finance/index.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/settlements/index.tsx
- `YumiSection` (src/renderer/components/ui/page-header/yumi-page-header.tsx)
  - src/renderer/components/after-sales/after-sales-panel.tsx
  - src/renderer/components/fulfillment/dispatch-views.tsx
  - src/renderer/components/fulfillment/work-time-review-panel.tsx
  - src/renderer/components/product/product-inventory-panel.tsx
  - src/renderer/components/settlement/settlement-detail.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/products/index.tsx
  - src/renderer/pages/reports/index.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/work-assignments/index.tsx
  - src/renderer/pages/workbench/index.tsx
  - src/renderer/pages/workers/index.tsx
- `YumiSectionHeader` (src/renderer/components/ui/page-header/yumi-page-header.tsx)
  - — 无生产调用点
- `YumiSegmentedTabs` (src/renderer/components/ui/tabs/yumi-tabs.tsx)
  - src/renderer/pages/settings/index.tsx
- `YumiSelect` (src/renderer/components/ui/select/yumi-select.tsx)
  - src/renderer/components/after-sales/after-sales-panel.tsx
  - src/renderer/components/fulfillment/dispatch-views.tsx
  - src/renderer/components/product/product-inventory-panel.tsx
  - src/renderer/components/settlement/settlement-detail.tsx
  - src/renderer/pages/customers/index.tsx
  - src/renderer/pages/finance/index.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/products/index.tsx
  - src/renderer/pages/reports/index.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/settlements/index.tsx
  - src/renderer/pages/work-assignments/index.tsx
  - src/renderer/pages/workers/index.tsx
- `YumiSheet` (src/renderer/components/ui/sheet/yumi-sheet.tsx)
  - src/renderer/components/after-sales/after-sales-panel.tsx
  - src/renderer/components/fulfillment/dispatch-views.tsx
  - src/renderer/pages/customers/index.tsx
  - src/renderer/pages/finance/index.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/settlements/index.tsx
  - src/renderer/pages/workers/index.tsx
- `YumiSnapshotNotice` (src/renderer/components/ui/snapshot-notice/yumi-snapshot-notice.tsx)
  - src/renderer/pages/orders/index.tsx
- `YumiSplitLayout` (src/renderer/components/ui/layout/yumi-split-layout.tsx)
  - src/renderer/components/patterns/form-workspace.tsx
- `YumiStatusTag` (src/renderer/components/ui/status-tag/yumi-status-tag.tsx)
  - src/renderer/components/after-sales/after-sales-panel.tsx
  - src/renderer/components/fulfillment/dispatch-views.tsx
  - src/renderer/components/fulfillment/work-time-review-panel.tsx
  - src/renderer/components/settlement/settlement-detail.tsx
  - src/renderer/pages/customers/index.tsx
  - src/renderer/pages/finance/index.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/products/index.tsx
  - src/renderer/pages/reports/index.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/settlements/index.tsx
  - src/renderer/pages/work-assignments/index.tsx
  - src/renderer/pages/workbench/index.tsx
  - src/renderer/pages/workers/index.tsx
- `YumiStickyActions` (src/renderer/components/ui/layout/yumi-sticky-actions.tsx)
  - src/renderer/components/patterns/form-workspace.tsx
- `YumiTextArea` (src/renderer/components/ui/field/yumi-field.tsx)
  - src/renderer/components/after-sales/after-sales-panel.tsx
  - src/renderer/components/fulfillment/dispatch-views.tsx
  - src/renderer/components/fulfillment/work-time-review-forms.tsx
  - src/renderer/components/fulfillment/work-time-review-panel.tsx
  - src/renderer/components/product/product-inventory-panel.tsx
  - src/renderer/components/settlement/settlement-detail.tsx
  - src/renderer/pages/customers/index.tsx
  - src/renderer/pages/finance/index.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/products/index.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/settlements/index.tsx
  - src/renderer/pages/work-assignments/index.tsx
- `YumiTextField` (src/renderer/components/ui/field/yumi-field.tsx)
  - src/renderer/components/after-sales/after-sales-panel.tsx
  - src/renderer/components/fulfillment/work-time-review-forms.tsx
  - src/renderer/components/settlement/settlement-detail.tsx
  - src/renderer/components/ui/date-picker/yumi-time-field.tsx
  - src/renderer/pages/customers/index.tsx
  - src/renderer/pages/finance/index.tsx
  - src/renderer/pages/numeric-text-field.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/products/index.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/settlements/index.tsx
  - src/renderer/pages/workers/index.tsx
- `YumiTimeField` (src/renderer/components/ui/date-picker/yumi-time-field.tsx)
  - src/renderer/components/fulfillment/work-time-review-forms.tsx
- `getYumiNotificationTimeout` (src/renderer/components/ui/notification/yumi-notification-context.ts)
  - src/renderer/components/ui/notification/yumi-notification.tsx
- `useYumiFieldAccessibility` (src/renderer/components/ui/field/yumi-field-accessibility.ts)
  - src/renderer/components/ui/date-picker/yumi-date-picker.tsx
  - src/renderer/components/ui/field/yumi-field.tsx
  - src/renderer/components/ui/select/yumi-select.tsx
- `useYumiNotification` (src/renderer/components/ui/notification/yumi-notification-context.ts)
  - — 无生产调用点
- `useYumiNotificationMessage` (src/renderer/components/ui/notification/yumi-notification-context.ts)
  - src/renderer/components/after-sales/after-sales-panel.tsx
  - src/renderer/components/fulfillment/dispatch-views.tsx
  - src/renderer/components/fulfillment/work-time-review-forms.tsx
  - src/renderer/components/fulfillment/work-time-review-panel.tsx
  - src/renderer/components/product/product-inventory-panel.tsx
  - src/renderer/components/settlement/settlement-detail.tsx
  - src/renderer/pages/customers/index.tsx
  - src/renderer/pages/finance/index.tsx
  - src/renderer/pages/fulfillment/index.tsx
  - src/renderer/pages/orders/index.tsx
  - src/renderer/pages/products/index.tsx
  - src/renderer/pages/reports/index.tsx
  - src/renderer/pages/settings/index.tsx
  - src/renderer/pages/settlements/index.tsx
  - src/renderer/pages/work-assignments/index.tsx
  - src/renderer/pages/workbench/index.tsx
  - src/renderer/pages/workers/index.tsx

</details>
