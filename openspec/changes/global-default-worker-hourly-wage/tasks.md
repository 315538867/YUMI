# 实施任务

- [x] 1. 在 `src/main/services/product-management.test.ts` 先添加成本设置、商品预览和订单历史快照的失败用例；在 `src/renderer/pages/app-components.test.ts` 添加全局时薪界面断言。验证：相关 Vitest 用例先失败。
- [x] 2. 在 `src/main/database/migrations.ts` 新增成本设置历史字段迁移；在 `src/shared/contracts.ts` 扩展成本设置、成本预览和订单快照契约。完成条件：旧数据库以 0 兼容新字段。
- [x] 3. 在 `src/main/repositories/studio-repository.ts` 读写默认兼职时薪、生成订单快照并以其计算预计人工成本；在 `src/main/services/studio-service.ts` 令商品预览读取全局时薪。验证：服务测试通过。
- [x] 4. 在 `src/renderer/pages/app.tsx` 增加系统成本设置表单，商品新建/详情预览显示采用的全局时薪并移除临时预估时薪输入。验证：渲染回归测试通过。
- [x] 5. 执行 `npm run typecheck`、`npm run lint`、`npm test`、`npm run build`、`openspec validate global-default-worker-hourly-wage --strict` 和 `git diff --check`；将结果记录在本文件与提案、方案文档中。

## 验证记录（2026-09-06）

- 任务 1：先运行 `npm test -- src/main/services/product-management.test.ts src/renderer/pages/app-components.test.ts`，新增用例按预期失败，确认 TDD 红灯。
- 任务 2：`npm test -- src/main/database/database.test.ts src/main/services/product-management.test.ts src/renderer/pages/app-components.test.ts` 通过（3 个测试文件、20 个用例），覆盖旧成本设置迁移后默认值为 0。
- 任务 3、4：上述定向测试通过，覆盖全局时薪商品预览、订单快照及设置/商品预览页面。
- 任务 5：`npm run typecheck`、`npm run lint`、`npm test`（28 个测试文件、84 个用例）、`npm run build`、`openspec validate global-default-worker-hourly-wage --strict` 与 `git diff --check` 均通过。
