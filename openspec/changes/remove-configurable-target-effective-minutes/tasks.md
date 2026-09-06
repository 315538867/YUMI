## 1. 契约与成本计算

- [x] 1.1 在 `src/main/domain/costing.test.ts` 先编写去除固定成本输入、结果和总成本后的失败用例；再修改 `src/main/domain/costing.ts`。验证：领域测试通过。
- [x] 1.2 在 `src/shared/contracts.ts` 移除固定成本相关成本设置、预览结果和订单快照字段；在 `src/main/services/studio-service.ts` 更新成本设置校验与商品预览映射。验证：产品管理服务测试通过。

## 2. 存储、订单与报表

- [x] 2.1 在 `src/main/repositories/studio-repository.ts` 停止读取和计算固定成本，保存成本设置时为旧 SQLite 列写入兼容占位值；订单新快照不再保存固定成本。验证：订单和产品管理测试通过。
- [x] 2.2 在商品成本/产能报表中移除固定成本分摊，并调整演示数据和相关测试的成本设置输入与期望。验证：报表、端到端和演示数据测试通过。

## 3. 界面与验证

- [x] 3.1 在 `src/renderer/pages/app.tsx` 移除月度固定成本、目标有效工时和预览中的房租水电分摊；在 `src/renderer/pages/app-components.test.ts` 添加回归断言。验证：渲染测试通过。
- [x] 3.2 运行 `npm run typecheck`、`npm run lint`、`npm run build`、`openspec validate remove-configurable-target-effective-minutes --strict` 和 `git diff --check`，并在 Electron Node 下执行完整 Vitest 套件；回写方案、提案和任务验证证据。

## 验证记录

- 1.1：`src/main/domain/costing.test.ts` 通过（3 个用例）。
- 1.2、2.1、2.2、3.1：Electron Node 下的定向回归测试通过（产品、订单、报表、端到端、渲染共 31 个用例）。
- 3.2：`npm run typecheck`、`npm run lint`、`npm run build`、`openspec validate remove-configurable-target-effective-minutes --strict` 和 `git diff --check` 通过；Electron Node 下完整 Vitest 套件通过（28 个测试文件、85 个用例）。
