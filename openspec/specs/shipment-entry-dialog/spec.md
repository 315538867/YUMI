# shipment-entry-dialog Specification

## Purpose
TBD - created by archiving change refine-order-costing-and-shipment-entry. Update Purpose after archive.
## Requirements
### Requirement: 显式新增发货弹窗

系统 SHALL 在订单详情的履约/发货处理区默认展示发货汇总和历史记录，并提供“新增发货”按钮。系统 MUST 在管理员点击该按钮后才打开包含可发商品数量、实际发货数量、发货日期和备注的发货录入弹窗；同一发货批次可包含该订单内多个商品，但每项数量不得超过该商品当时可发数量。系统 SHALL 支持订单未全部发完时持续新增后续发货批次。

#### Scenario: 新增一批组合发货

- **WHEN** 管理员点击“新增发货”，为两个可发商品分别填写正数且不超过可发数量的发货数量
- **THEN** 系统保存一批包含两个商品的发货记录、关闭弹窗并更新各商品累计已发和待发数量

#### Scenario: 订单分批发货

- **WHEN** 某订单尚有未发数量且管理员再次新增发货
- **THEN** 系统允许创建新的发货批次
- **AND** 历史发货批次保持不变

#### Scenario: 新增一批发货

- **WHEN** 管理员点击“新增发货”并填写至少一项正数发货数量
- **THEN** 系统保存该批发货、关闭弹窗并更新订单详情中的累计已发和待发数量

### Requirement: 历史发货只读

系统 MUST 将订单详情中的历史发货记录作为只读记录展示，并允许导出对应发货清单；系统 MUST NOT 提供编辑历史发货记录的入口。

#### Scenario: 查看已有发货记录

- **WHEN** 订单已有一批发货记录
- **THEN** 管理员可查看日期、商品数量和备注并导出清单，但不可在订单详情修改该记录
