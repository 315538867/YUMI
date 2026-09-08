## 0. 方案与执行前核对

- [x] 0.1 将已确认业务规则写入 `docs/solutions/2026-09-08-yumi-studio-operating-foundations-solution.md` 与本 change 的 `proposal.md`、`design.md`、四份 capability spec。完成条件：规则包括全局胶水单价、商品克重、订单冻结、HALF_UP、固定壳、数据保护和人员页按需侧栏；`openspec validate` 可读取工件。

## 1. 共用金额与单位内核（依赖：0.1）

- [x] 1.1 在 `package.json`、`package-lock.json` 增加 `decimal.js`，并创建 `src/shared/money/index.ts`、`src/shared/money/money.test.ts`。实现普通元金额、元/克胶水价、克重的严格文本解析、格式化和总量胶水金额计算。完成条件：`0.0034`、`25`、`100` 得到 850 分；单件 0.085 元乘 100 得到 850 分；超出精度、科学计数法和负值测试失败。
> 实施证据（2026-09-09）：`npx vitest run src/shared/money/money.test.ts` 通过（4 项）；`npm run typecheck` 通过。
- [ ] 1.2 修改 `src/shared/contracts/common.ts`、`src/shared/contracts/index.ts`，新增胶水单价与克重整数单位类型；审查 `src/main`、`src/renderer` 的新增金额路径，确保不自行进行浮点金额运算。完成条件：共享类型由商品、设置和订单快照引用；金额模块测试与 `npm run typecheck` 通过。

## 2. 工作室参数、商品和订单快照（依赖：1.1、1.2）

- [ ] 2.1 修改 `src/main/database/v2-migrations.ts`、`src/main/database/v2-storage.test.ts`，新增胶水设置默认值和产品克重列的增量迁移。完成条件：空库和已迁移 V2 库均拥有正确键/列，旧成本列未删除。
- [ ] 2.2 创建 `src/main/services/studio-settings-service.ts` 及测试，扩展 `src/main/application/v2-runtime.ts`、`src/main/ipc/register-v2-ipc.ts`、`src/preload/index.ts`、`src/shared/contracts/v2-api.ts`，暴露获取/保存工作室胶水单价的 IPC。完成条件：设置输入在主进程复核、保存后可读取，非法精度拒绝。
- [ ] 2.3 修改 `src/shared/contracts/products.ts`、`src/main/repositories/v2-order-repository.ts`、`src/main/services/v2-order-service.ts` 和对应测试，移除新商品对手填原材料/制作胶水成本的依赖，保存商品克重，并创建包含冻结单价与克重的订单快照。完成条件：商品创建/编辑与订单创建测试覆盖新字段；修改全局单价后旧快照不变。
- [ ] 2.4 修改 `src/main/repositories/fulfillment-repository.ts`、`src/main/services/fulfillment-service.ts`、`src/main/services/settlement-service.ts`、`src/main/services/report-service.ts` 和对应测试，使新任务、质检不合格胶水扣款及订单/报表成本由订单快照的总量公式得出。完成条件：不合格扣款与报告不使用当前全局单价；批量舍入回归测试通过。

## 3. 固定壳、设置和数据保护（依赖：2.1、2.2）

- [ ] 3.1 修改 `src/renderer/styles/base.css`、`src/renderer/styles/pages.css`、`src/renderer/pages/app.tsx` 与 `src/renderer/styles/layering.test.ts`，建立固定高度应用壳、独立导航滚动和唯一内容滚动区。完成条件：测试断言壳/侧栏/工作区/内容的关键结构与 overflow 规则；手动滚动右侧内容时左栏不移动。
- [ ] 3.2 修改 `src/shared/contracts/v2-api.ts`、`src/preload/index.ts`，暴露备份活动/检查接口；改造 `src/renderer/pages/settings/index.tsx`，使用 `工作室参数 | 财务资料 | 数据保护` 的互斥模式，接入胶水单价、立即备份、历史列表和恢复确认侧栏。完成条件：取消恢复不调用 API；确认恢复传入 `confirmed: true`；备份后刷新列表。
- [ ] 3.3 创建或修改 `src/renderer/pages/settings/index.test.tsx`，覆盖模式互斥、胶水价显示/保存、备份创建、恢复取消/确认的 UI 行为。完成条件：渲染测试不依赖系统原生 `select` 或原生日期控件。

## 4. 商品与人员页交互（依赖：1.1、2.2、2.3）

- [ ] 4.1 修改 `src/renderer/pages/products/index.tsx` 与新增/现有页面测试，使商品抽屉展示只读工作室胶水单价、可编辑克重、单件胶水成本参考和其它逐件成本；删除手填原材料与制作胶水成本字段。完成条件：保存提交包含克重整数单位；价格变动只更新当前商品预览。
- [ ] 4.2 修改 `src/renderer/pages/workers/index.tsx` 与 `src/renderer/pages/reference-pages.test.tsx`，使默认页只有人员列表和新增入口；使用 `YumiSheet` 实现新建人员、人员资料与侧栏内时薪调整。完成条件：默认 DOM 不含并列的新建/时薪历史表单；调整后刷新历史且不修改既有结算。

## 5. 验证、回写与交付（依赖：1 至 4）

- [ ] 5.1 运行相关金额、迁移、订单、履约、结算、报表、设置、商品、人员和壳层测试；原生绑定恢复后运行 `npm test`。完成条件：记录通过结果；若 `better-sqlite3` 原生绑定仍缺失，保留完整失败原因，不能宣称全量数据库测试通过。
- [ ] 5.2 运行 `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 与 `openspec validate strengthen-studio-operating-foundations --strict`。完成条件：读取完整输出并写入本文件实施证据。
- [ ] 5.3 回写 `docs/solutions/2026-09-08-yumi-studio-operating-foundations-solution.md` 的实施状态、实际迁移、验证结果和偏差；仅在所有可用验证完成后将 proposal 标记为已完成。完成条件：方案、任务勾选和代码状态一致；未获归档授权时不归档。
