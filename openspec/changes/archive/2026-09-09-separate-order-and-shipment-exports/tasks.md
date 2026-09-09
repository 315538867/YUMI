# 订单表与发货清单成品化版式实施任务

> **For agentic workers:** REQUIRED SUB-SKILL: Use `openspec-delivery` to implement this plan through OpenSpec after explicit authorization. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 将独立的订单表、发货清单导出重构为包含产品图和用户确认版式的成品 XLSX 文件。

**架构：** `StudioService` 继续承担查询与业务口径，新增 ExcelJS 工作簿构建模块承担单据排版与图片嵌入。对外 IPC/预加载/渲染 API 不变。

**技术栈：** TypeScript、Electron、ExcelJS、Vitest。

---

## 1. 测试先行与依赖

- [x] 1.1 在 `src/main/services/shipping-management.test.ts` 替换当前纯 SheetJS 数据表断言，新增失败用例：订单表含 `订单表`、客户信息、黄色表头、嵌图、`产品单价 + 包装费 + 替换袋` 的价格与数量/金额合计；发货清单含全订单商品、未发商品的本次数量 0、累计未发数量、发货标题、合计和页尾。测试使用临时最小 PNG 及 ExcelJS 回读导出 buffer。依赖：无。验证：实现前运行 `npx vitest run src/main/services/shipping-management.test.ts`，预期因旧 SheetJS 结构/无图片断言失败。
- [x] 1.2 在 `package.json` 与 `package-lock.json` 增加生产依赖 `exceljs`。依赖：1.1。验证：`npm ls exceljs` 返回已解析的生产依赖。

## 2. 工作簿构建与服务口径

- [x] 2.1 新建 `src/main/services/export-document-workbook.ts`，实现 `createOrderSheetWorkbook`：创建“订单表”工作表、合并顶部客户/联系/地址/标题区域，创建黄色表头、列宽、边框、商品行、图片格、人民币格式、合计行与横向页面设置。输入必须是已组装的订单导出视图模型和图片路径映射，单图读取或格式失败必须跳过。依赖：1.2。验证：1.1 中订单表断言通过。
- [x] 2.2 在同一模块实现 `createShipmentManifestWorkbook`：创建“发货清单”工作表、发货标题和客户/发货总数头部、全订单商品明细、图片格、采购/本次/未发数量、三类合计、发货时间/收货人/备注页尾与横向页面设置。依赖：2.1。验证：1.1 中发货清单断言通过。
- [x] 2.3 修改 `src/main/services/studio-service.ts` 的 `exportOrderSheet` 与 `exportShipmentManifest`：保留输入校验与归属校验，组装订单价格快照、当前产品图片路径、所选发货数量映射和 `getOrderShipmentSummary` 的累计未发数量，调用新模块并返回 XLSX buffer；禁止写入仓储。依赖：2.1、2.2。验证：`npx vitest run src/main/services/shipping-management.test.ts` 通过，并保留跨订单发货记录拒绝和导出不修改业务数据断言。

## 3. 集成验证与回写

- [x] 3.1 运行 `npm run typecheck`、`npm run lint`、`npm test`、`npm run build`、`openspec validate separate-order-and-shipment-exports --strict` 与 `git diff --check`。依赖：2.3。完成条件：每条命令退出码为 0；任何失败均记录实际原因，不得勾选为完成。
- [ ] 3.2 在 Electron 调试应用中手动导出订单表并确认保存窗口标题、默认文件名与客户单据版式；为不改动业务数据，发货清单视觉验证仅在已有发货记录时执行，若无记录须先取得用户同意才创建临时记录。依赖：3.1。验证：记录实际操作、生成文件或明确未执行原因。
- [ ] 3.3 将本任务完成状态、`proposal.md`、`docs/solutions/2026-09-06-separate-order-and-shipment-exports-solution.md` 的版本、实施结果及验证证据同步更新；未获得归档授权不得运行 `openspec archive`。依赖：3.1、3.2。验证：`openspec status --change separate-order-and-shipment-exports` 显示全部工件完整，且任务/提案/方案状态一致。

## 验证记录（第 2 阶段，2026-09-06）

- 测试先行：在未修改生产导出代码时，运行 `npx vitest run src/main/services/shipping-management.test.ts`，4 个测试中 2 个新单据版式用例失败；订单表预期 `客户：小雨` 而实际为旧表头 `订单编号`，发货清单预期 `9. 10发货清单` 而实际为旧表头 `订单编号`。
- 依赖：`npm install exceljs && npm ls exceljs` 成功，已解析 `exceljs@4.4.0`。
- 服务定向回归：`npx vitest run src/main/services/shipping-management.test.ts`，4 个测试通过；覆盖订单/发货清单标题、字段、价格/数量合计、全订单发货行、产品图片、跨订单记录拒绝和导出无副作用。
- 渲染层回归：`npx vitest run src/renderer/pages/app-components.test.ts`，13 个测试通过。
- 类型与静态检查：`npm run typecheck`、`npm run lint`、`git diff --check` 均通过。
- 全量测试：`npm test`，28 个测试文件、86 个测试通过。
- 生产构建：`npm run build` 通过。
- OpenSpec：`openspec validate separate-order-and-shipment-exports --strict` 通过。
- 人工验收：已启动 Electron 调试；尝试访问应用进行实际保存与文件视觉检查时，macOS 会话处于锁定状态，自动解锁失败。任务 3.2 与状态回写 3.3 保持未完成，等待用户解锁后继续；未创建或修改任何临时业务数据。

- 默认文件名：新增 `src/main/ipc/export-file-name.ts` 与其测试，订单表和发货清单分别生成为 `yyyyMMdd-HHmmss-订单表-客户名字.xlsx`、`yyyyMMdd-HHmmss-发货清单-客户名字.xlsx`；非法文件名字符替换为下划线。

## 第 3 阶段：发货历史快照与排班任务唯一性

- [x] 4.1 在 `src/main/services/shipping-management.test.ts` 先新增失败用例：第一批发货后再保存第二批发货，重新导出第一批清单时，采购总数量、本次发货数量及未发货数量保持第一批保存时的数据。依赖：无。验证：实现前 `npx vitest run src/main/services/shipping-management.test.ts` 失败。
- [x] 4.2 在 `src/main/database/migrations.ts` 新增迁移，为 `shipments` 增加 `manifest_snapshot_json`；在 `src/shared/contracts.ts` 声明快照契约；在 `src/main/repositories/studio-repository.ts` 创建、编辑发货记录的事务内写入快照，并为旧记录按创建时序提供只读历史推算。依赖：4.1。验证：4.1 通过，迁移测试覆盖版本升级。
- [x] 4.3 修改 `src/main/services/studio-service.ts` 的发货清单导出，优先使用发货记录快照，保留订单归属校验；不得在导出阶段写入业务数据。依赖：4.2。验证：4.1 通过，并保留跨订单导出拒绝断言。
- [x] 4.4 在 `src/main/services/scheduling-management.test.ts` 先新增失败用例，验证同一排班同一订单同一产品的两个订单明细被拒绝，而不同订单相同产品仍可保存。依赖：无。验证：实现前 `npx vitest run src/main/services/scheduling-management.test.ts` 失败。
- [x] 4.5 修改 `src/main/services/studio-service.ts` 与 `src/renderer/pages/app.tsx`：服务端在预览、创建、编辑排班时校验订单+产品组合唯一；界面下拉框隐藏其他任务已选择的组合，无剩余组合时禁用添加按钮。依赖：4.4。验证：4.4 通过；`npx vitest run src/renderer/pages/app-components.test.ts` 通过。
- [x] 4.6 运行 `npm run typecheck`、`npm run lint`、`npm test`、`npm run build`、`openspec validate separate-order-and-shipment-exports --strict` 与 `git diff --check`；更新本方案、提案与实施记录。依赖：4.3、4.5。完成条件：每条命令退出码为 0；未获归档授权不得归档。

## 验证记录（第 3 阶段，2026-09-06）

- 测试先行：扩展 `shipping-management.test.ts` 后，旧实现重新导出第一批发货清单会使用后续发货后的最新待发数量；扩展 `scheduling-management.test.ts` 后，旧实现允许同一排班出现同一订单同一产品的重复任务。
- 快照回归：`npx vitest run src/main/services/shipping-management.test.ts src/main/services/scheduling-management.test.ts src/renderer/pages/shift-task-options.test.ts src/main/database/database.test.ts` 通过，4 个测试文件、12 个测试通过；覆盖首批清单在后续发货后保持原待发数量、修正该发货记录后重建其快照、数据库迁移，以及同订单产品去重。
- 渲染层回归：`npx vitest run src/renderer/pages/app-components.test.ts` 通过，1 个测试文件、14 个测试通过；另以纯函数测试覆盖已选订单产品从下拉选项中移除。
- 类型检查：`npm run typecheck` 通过。
- 最终验证：`npm run lint`、`npm test`、`npm run build`、`openspec validate separate-order-and-shipment-exports --strict` 与 `git diff --check` 均通过；全量测试为 32 个测试文件、96 个测试通过。`npm run lint` 曾错误扫描共享目录 `.worktrees` 下另一工作树的构建产物，已在 ESLint 忽略项中排除该目录后复验通过。
