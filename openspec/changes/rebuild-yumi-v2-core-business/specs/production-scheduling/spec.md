## REMOVED Requirements

### Requirement: 人员时间段排班

**Reason**: 兼职人员工作时间自由，打卡机不与系统连接，固定开始/结束时间不应成为工资或工作量的唯一事实。

**Migration**: V2 使用按日期、人员、工序、计划数量和计划分钟的工作安排；原 V1 测试排班不迁移。

### Requirement: 排班必须绑定订单商品任务

**Reason**: V2 将排班扩展为可包含制作、捏毛装袋、打包和发货任务的工作安排，并需要区分任务完成与质检。

**Migration**: 使用 `multi-process-fulfillment` 的工作安排与工序任务模型替代。

### Requirement: 人工工时风险提示

**Reason**: V2 不再以固定时段判断超时或未占满，负责人以任务计划分钟和额外预留分钟评估工作饱和度。

**Migration**: 使用 V2 工作安排计划分钟汇总与两种工资参考口径替代。

### Requirement: 模具日产能风险提示

**Reason**: 本次 V2 核心业务模型不以模具批次日产能作为强制履约规则。

**Migration**: 不迁移 V1 模具风险事实；负责人以订单履约和工作安排进度管理实际生产。

### Requirement: 交期风险提示

**Reason**: V2 首先建立可追溯的四工序数量流转，交期风险展示将在 V2 报表阶段基于履约事实重建。

**Migration**: V1 交期风险不迁移；V2 阶段 E 新报表提供完成进度和待发货查询。

### Requirement: 缺勤与待补排

**Reason**: V2 工作安排没有固定时段，未完成任务通过任务状态和负责人重新安排处理。

**Migration**: V2 保留取消/未完成任务事实，负责人按缺口创建新的工作安排。

### Requirement: 实际完成与按件提成

**Reason**: V2 将完成申报、质检、工资计算和最终结算拆开，不能在排班完成时直接计算实发工资。

**Migration**: 使用 `multi-process-fulfillment` 和 `worker-settlement-management` 的任务、质检与结算规则替代。
