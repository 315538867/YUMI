## 1. 详情界面契约测试

- [x] 1.1 在 `src/renderer/pages/app-components.test.ts` 中新增订单备注、订单/人员/排班详情工作区及详情返回入口的源代码契约，并先运行该测试确认现有详情弹窗和遗漏备注导致失败。
- [x] 1.2 在同一测试中断言订单检查器、人员检查器和排班检查器不再以对应详情标题作为 `Dialog.Title`，同时保留“填写实际完成数据”等短流程弹窗契约。

## 2. 主工作区详情导航

- [x] 2.1 修改 `src/renderer/pages/app.tsx`：在 `App` 提升统一详情目标状态，打开订单、人员或排班详情时切换到对应列表视图，并在内容区域仅渲染一个目标详情工作区。
- [x] 2.2 修改同一文件的 `ViewContent`、人员和排班列表传参：将人员详情打开回调提升至 `App`，移除各工作区内部用于详情弹窗的状态和渲染。
- [x] 2.3 修改订单、人员和排班详情组件：用页面级详情容器和“返回…列表”操作替代详情 `Dialog.Root`/`Dialog.Content`，保留资料编辑、订单编辑、排班编辑、状态变更与完成登记的既有短流程弹窗。
- [x] 2.4 修改详情组件之间的回调：从订单或人员详情打开关联订单/班次时替换当前详情目标，保证不会叠加多个详情窗口。

## 3. 订单备注与页面样式

- [x] 3.1 修改 `src/renderer/pages/app.tsx`：在订单详情中仅当 `order.notes` 非空时展示“订单备注”，并将其作为只读详情内容。
- [x] 3.2 修改 `src/renderer/styles/app.css`：增加详情工作区的宽度、头部与返回操作样式，并为订单备注保留多行文本；移除不再使用的人员和排班详情弹窗宽度规则。

## 4. 验证与交付

- [x] 4.1 运行 `npm test -- src/renderer/pages/app-components.test.ts`，确认新增界面契约通过。
- [x] 4.2 依次运行 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`，记录结果并修复阻塞问题。
- [x] 4.3 运行 `openspec validate refine-detail-workspaces --strict`，将已完成任务逐项勾选并记录验证证据。
- [x] 4.4 使用路径限定暂存检查变更并提交中文 Conventional Commit；不推送远端。

## 验证证据

- 2026-09-07：`npm test -- src/renderer/pages/app-components.test.ts` 通过，18 项组件与样式契约测试通过。
- 2026-09-07：`npm test` 通过，32 个测试文件、101 项测试通过。
- 2026-09-07：`npm run typecheck`、`npm run lint` 与 `npm run build` 均通过。
- 2026-09-07：`openspec validate refine-detail-workspaces --strict` 通过。
- 2026-09-07：已在当前 `main` 分支以路径限定暂存并提交本变更，不推送远端。
