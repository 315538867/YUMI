# P0 · 页面模式与滚动/页头所有权盘点（任务 1.2）

来源：`src/renderer/pages/app.tsx`、各页面文件与 `src/renderer/styles/pages.css`

## 应用壳

- 侧栏：`.yumi-app-sidebar`，宽度 `232px`
- 命令栏：`.yumi-app-command-bar`
- 壳层纵向滚动容器：`.yumi-app-content`、`.yumi-app-navigation`
- 页面内局部纵向滚动容器（pages.css，非壳层）：`.yumi-opening-wip__candidates`

## 路由级页面（AppShell 直接工作区）

| view          | 组件            | 文件                                       | 页头 | 主 Tab | 分段 Tab | 列表表面 | 指标带 | 摘要          |
| ------------- | --------------- | ------------------------------------------ | ---- | ------ | -------- | -------- | ------ | ------------- |
| `workbench`   | WorkbenchPage   | `src/renderer/pages/workbench/index.tsx`   | ✓    | ✓      | —        | ✓        | ✓      | —             |
| `orders`      | OrdersPage      | `src/renderer/pages/orders/index.tsx`      | ✓    | ✓      | —        | ✓        | ✓      | EntitySummary |
| `fulfillment` | FulfillmentPage | `src/renderer/pages/fulfillment/index.tsx` | ✓    | ✓      | —        | —        | ✓      | —             |
| `settlements` | SettlementsPage | `src/renderer/pages/settlements/index.tsx` | ✓    | ✓      | —        | ✓        | —      | —             |
| `finance`     | FinancePage     | `src/renderer/pages/finance/index.tsx`     | ✓    | ✓      | —        | ✓        | ✓      | —             |
| `reports`     | ReportsPage     | `src/renderer/pages/reports/index.tsx`     | —    | —      | —        | ✓        | —      | —             |
| `customers`   | CustomersPage   | `src/renderer/pages/customers/index.tsx`   | ✓    | —      | —        | ✓        | ✓      | —             |
| `products`    | ProductsPage    | `src/renderer/pages/products/index.tsx`    | ✓    | ✓      | —        | ✓        | —      | —             |
| `settings`    | SettingsPage    | `src/renderer/pages/settings/index.tsx`    | —    | ✓      | ✓        | ✓        | —      | —             |

## 嵌入式页面模式

| 组件                | 文件                                            | 宿主                                       | 自带页头                      | 自带列表表面 |
| ------------------- | ----------------------------------------------- | ------------------------------------------ | ----------------------------- | ------------ |
| WorkAssignmentsPage | `src/renderer/pages/work-assignments/index.tsx` | `src/renderer/pages/fulfillment/index.tsx` | —                             | ✓            |
| WorkersPage         | `src/renderer/pages/workers/index.tsx`          | `src/renderer/pages/settlements/index.tsx` | **✓（嵌套页头，待 P3 处理）** | ✓            |
