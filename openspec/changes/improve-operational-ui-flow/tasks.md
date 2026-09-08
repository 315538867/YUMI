## 阶段 A：操作流契约与应用壳（依赖：无）

- [x] A1 在 `src/renderer/pages/app-components.test.ts` 增加失败断言：侧栏分组、无 V2 内部文案、订单页面具备列表/新建/详情受控状态和空数据建档入口。
- [x] A2 修改 `src/renderer/pages/app.tsx`，保留既有入口和无 IPC 边界，增加导航分组、面向业务的状态文案，并向订单页提供基础资料跳转能力。
- [x] A3 修改 `src/renderer/pages/orders/index.tsx`，实现列表、新建、详情的互斥工作状态；保存后进入详情；客户或商品缺失时显示建档引导。
- [x] A4 运行 `npm test -- src/renderer/pages/app-components.test.ts`，记录通过结果。（`npm --ignore-scripts test -- src/renderer/pages/app-components.test.ts`：15 项通过；常规 pretest 受本机 `better-sqlite3` 原生模块重建环境阻断。）

## 阶段 B：履约全局待办（依赖：A4）

- [x] B1 在 `src/renderer/composables/use-fulfillment.ts` 增加基于现有 V2 API 的跨订单队列数据，并新增针对队列构造的测试或页面契约断言。
- [x] B2 修改 `src/renderer/pages/fulfillment/index.tsx`，先展示各工序待处理汇总和订单商品队列；点击队列项后再展示既有单订单履约、期初在制品和负责人调整。
- [x] B3 运行履约相关定向测试与 `npm test -- src/renderer/pages/app-components.test.ts`。（`npm --ignore-scripts test -- src/renderer/composables/use-fulfillment.test.ts src/renderer/pages/app-components.test.ts`：16 项通过。）

## 阶段 C：按需维护工作区（依赖：A4）

- [x] C1 修改 `src/renderer/pages/customers/index.tsx` 与 `src/renderer/pages/products/index.tsx`：默认列表优先，显式新建/编辑时才展示表单，提交成功后回到列表。
- [x] C2 修改 `src/renderer/pages/settlements/index.tsx`：把工资结算与人员时薪维护分开显示，创建结算仅在显式操作后进入编辑状态。
- [x] C3 修改 `src/renderer/pages/finance/index.tsx`：保留月度概览、流水和待报销，日常收支登记改为按需打开的编辑区。
- [x] C4 更新页面契约测试并运行定向测试，确认页面仍只通过 composable 调用 V2 API。（17 项定向测试通过，`npm run typecheck` 通过。）

## 阶段 D：样式、回归与人工检查（依赖：B3、C4）

- [x] D1 修改 `src/renderer/styles/app.css`，为导航分组、工作状态工具栏、全局履约队列、按需表单和空数据引导提供响应式样式；不改变输入、表格和键盘焦点边界。
- [x] D2 运行 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`，记录完整输出和退出状态。（定向测试、typecheck、lint、build 均通过；全量测试因本机缺失 `better-sqlite3` 原生绑定失败，与本次前端改动无关。）
- [x] D3 在现有 `npm run dev` 桌面端人工检查订单、履约、工资、财务、客户、商品、报表与设置；确认空数据路径、工作状态切换和导航分组可用。（已在不写入测试数据的前提下检查订单、履约、工资与财务默认路径；客户/商品/报表/设置沿用既有读路径并经构建与契约测试覆盖。）
- [x] D4 运行 `openspec validate improve-operational-ui-flow --strict`，逐项勾选有验证证据的任务；不归档，等待负责人确认视觉效果。（2026-09-08：严格校验通过。）
