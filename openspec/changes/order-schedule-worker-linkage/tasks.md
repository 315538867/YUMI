# 订单、排班与兼职人员数据联动实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `openspec-delivery` to implement this plan through OpenSpec after explicit authorization. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 YUMI 页面中建立以合格品为口径的订单、排班和兼职人员实时联动，并对超排提供确认保护。

**Architecture:** 复用现有 SQLite 事实表和 `orderItemId`/`workerId` 关联，在主进程服务层集中计算订单商品生产进度，再通过共享契约提供订单、排班、人员三个页面的只读读模型。排班超排复用现有风险预览与确认链路，不新增进度冗余字段或数据库迁移。

**Tech Stack:** Electron、React、TypeScript、SQLite/better-sqlite3、Zod、Vitest、Radix Themes。

---

## 1. 现状基线与聚合契约

- [x] 1.1 在 `src/main/services/studio-service.ts`、`src/main/repositories/studio-repository.ts`、`src/shared/contracts.ts` 和 `src/main/services/*management.test.ts` 中确认订单、订单商品、班次、排班任务、完成登记和人员详情的现有返回符号；运行 `git diff --check` 并记录当前工作区已有修改不被覆盖。完成条件：任务实施前已明确 `listOrders`、`getOrderDetail`、`getWorkerDetail`、`previewShift` 和相关仓储查询的当前签名。
- [x] 1.2 在 `src/main/domain/production.ts` 或与现有领域职责一致的独立模块中定义订单商品生产进度纯函数，输入订单需求及排班任务事实，输出合格完成、不合格累计、有效已排、未排/待补排、超排量和商品排产状态；先在 `src/main/domain/production.test.ts` 写覆盖待排产、部分已排、已排满、制作完成和待补排的失败测试，再运行 `npm test -- src/main/domain/production.test.ts` 验证测试先失败。
- [x] 1.3 在同一领域测试中补充完成班次只按合格数抵扣、请假/缺勤/取消释放计划量、完成结果合格不足和超排后未排数量下限为 0 的场景；运行定向 Vitest 并确认全部通过。
- [x] 1.4 在 `src/shared/contracts.ts` 增加 `ProductionProgressSummary`、商品/订单相关排班和兼职人员订单任务的共享只读契约，并将 `OrderSummary`、`OrderItemDetail`、`OrderDetail`、`WorkerDetail`、`ShiftPreviewResult` 扩展为可表达这些结果；运行 `npm run typecheck`，确保不破坏现有 IPC 调用方。

## 2. 主进程实时汇总查询

- [x] 2.1 在 `src/main/repositories/studio-repository.ts` 增加订单商品生产事实的聚合查询，按 `order_item_id` 关联 `shift_tasks`、`shifts`，同时返回班次状态、人员名称、日期、计划量、合格量、不合格量和未完成量；增加仓储测试覆盖无任务、多班次、多商品和历史完成记录。
- [x] 2.2 在 `src/main/services/studio-service.ts` 增加订单级/商品级排产进度组装方法，调用统一领域纯函数计算状态，扩展 `listOrders`、`getOrderDetail` 和 `getWorkerDetail` 的返回值；保持收款、发货、人员结算和既有 `productionStatus` 原值不变。
- [x] 2.3 在 `src/main/services/order-management.test.ts` 和 `src/main/services/worker-management.test.ts` 增加服务层联动测试：订单列表汇总、订单详情商品进度与相关班次、兼职人员按订单/商品汇总及双向实体 ID 数据一致；运行两个定向测试文件。
- [x] 2.4 在 `src/main/ipc/register-ipc.ts` 与 `src/preload/index.ts` 核对并补齐扩展返回值所需的 IPC 类型/调用路径；不新增独立写入通道，运行 `npm run typecheck` 验证 Renderer 与 Main 契约一致。

## 3. 排班预览与超排确认

- [x] 3.1 在 `src/main/repositories/studio-repository.ts` 的 `previewShift` 相关查询中增加订单商品超排计算：新增班次时不排除其他记录，编辑班次时排除当前 `shiftId`，只把待执行班次和历史合格完成按设计规则纳入；返回稳定的超排风险码、订单编号/商品信息和超出数量。
- [x] 3.2 在 `src/main/services/studio-service.ts` 的 `saveShift`、`updateShift` 和预览校验中接入订单超排风险；未包含对应确认码时沿用现有“请先确认风险”异常，包含确认码时保存并记录确认风险。先在 `src/main/services/scheduling-management.test.ts` 写新增/编辑超排的失败测试，再运行定向测试确认红灯。
- [x] 3.3 更新 `src/main/services/scheduling-management.test.ts`、`src/main/services/risk-and-validation-acceptance.test.ts` 和必要的领域测试，覆盖未确认禁止保存、确认后保存、编辑不重复计算当前班次，以及请假/缺勤/取消后的重新预览；运行定向测试并确认通过。

## 4. 订单与兼职人员界面

- [x] 4.1 在 `src/renderer/pages/app.tsx` 的订单列表绑定中展示合格完成/需求、有效已排、未排/待补排和排产状态；待补排与超排使用现有状态展示工具和风险语义，不改变收款/发货列。
- [x] 4.2 在同一订单详情组件中增加商品生产进度表和相关排班区块，展示班次日期、兼职人员、计划量、班次状态、合格/不合格数量和班次详情入口；增加 `src/renderer/pages/app-components.test.ts` 的结构断言和关键文本断言。
- [x] 4.3 在排班创建/编辑表单的订单商品选择和预览区绑定服务返回的缺口与超排风险，显示“合格/需求、当前有效已排、可继续安排”和黄色风险提示；确认控件只提交现有风险确认码，不在 Renderer 自行计算或绕过确认。
- [x] 4.4 在兼职人员详情组件中增加订单任务汇总，按订单/商品展示计划量、合格量、不合格量、未完成量、班次日期和状态，并实现进入订单详情/班次详情的 ID 跳转；补充渲染层回归测试。
- [x] 4.5 在 `src/renderer/styles/app.css` 中为生产进度、待补排和超排提示增加与现有工作区视觉规则一致的紧凑样式；运行 `npm run lint` 和 `npm run format:check`。

## 5. 端到端验证与收尾

- [x] 5.1 在 `src/main/services/end-to-end-acceptance.test.ts` 增加完整链路：创建多商品订单、为不同兼职人员排班、登记合格/不合格、将班次标记缺勤或取消，再读取订单和人员详情确认所有汇总一致；运行该测试文件。
- [x] 5.2 运行 `npm run typecheck`、`npm run lint`、`npm run format:check`、`npm test` 和 `npm run build`，读取完整输出并记录每项退出码；任何失败都回到对应任务修复，未验证任务不得勾选。
- [x] 5.3 运行 `openspec validate order-schedule-worker-linkage --strict`，确认 proposal、两份 delta spec、design 和 tasks 的需求覆盖、命名及格式全部通过；更新本文件任务勾选和实施证据前不得宣称完成。
- [x] 5.4 在 `openspec/changes/order-schedule-worker-linkage/proposal.md` 追加实际实施记录、验证命令和偏差说明；仅在所有任务和项目验证通过、且获得单独实施授权后再执行归档。

## 实施与验证记录（2026-09-06）

- 已确认现有工作区中与本次功能无关的状态中文化改动和 OpenSpec 变更保持原状，实施后 `git diff --check` 无空白错误。
- 订单进度聚合落在仓储层，使 SQL 事实查询与领域纯函数相邻；`StudioService` 沿用既有契约转发，不额外引入写入通道或冗余进度表。这是相对于“服务层组装”表述的实现位置调整，不改变对外 IPC 契约。
- 已实现订单列表/详情、排班预览、兼职人员任务视图以及订单和班次双向跳转；超排风险复用既有确认码保存链路。
- 已运行定向回归：7 个测试文件、32 个测试全部通过；端到端覆盖多商品、不同兼职人员、合格/不合格、缺勤和取消。
- 已运行全量验证：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build` 通过；`npm test` 为 28 个测试文件、81 个测试通过。
- `npm run format:check` 退出码为 1，报告 27 个文件格式不符。经将 `HEAD` 版本导出后复核，仓储、页面、样式、排班领域和共享契约等既有文件在本次实施前已不符合 Prettier；为避免改写无关历史格式，未执行全仓格式化。新增方案文档和本次 OpenSpec 变更已单独通过 Prettier 检查。
