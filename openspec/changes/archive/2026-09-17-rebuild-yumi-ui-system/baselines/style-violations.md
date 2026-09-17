# P0 · 静态违规基线（任务 1.3）

来源：`src/renderer/styles/*.css`、`src/renderer/pages/**`、`src/renderer/components/**`。
棘轮基线：`src/renderer/test/ui-baseline/style-violations.json`；校验：`style-violations.test.ts`。

## 分类规模

| 类别                                             | 数量    |
| ------------------------------------------------ | ------- |
| 裸颜色值（raw-color）                            | 0       |
| 裸字号/行高/字距（raw-typography）               | 133     |
| 裸间距（raw-spacing）                            | 44      |
| 裸圆角（raw-radius）                             | 9       |
| 裸阴影（raw-shadow）                             | 0       |
| 私有断点（private-breakpoint）                   | 13      |
| 共享组件内部 class 覆盖（shared-class-override） | 0       |
| 旧 class 残留（legacy-class-in-source）          | 0       |
| 悬空令牌引用（dangling-token-reference）         | 0       |
| 未消费令牌（unconsumed-token）                   | 10      |
| **合计**                                         | **209** |

## 裸颜色值（raw-color） — 0

基线为空：该类别当前没有违规，棘轮已锁定，新增即失败。

## 裸字号/行高/字距（raw-typography） — 133

### `src/renderer/styles/composites.css` — 55

| 行                                     | 选择器                                                                | 违规内容                |
| -------------------------------------- | --------------------------------------------------------------------- | ----------------------- |
| 755                                    | `.yumi-calculated-amount--comfortable .yumi-calculated-amount__value` | font-size: 22px         |
| 756                                    | `.yumi-calculated-amount--comfortable .yumi-calculated-amount__value` | line-height: 30px       |
| 808                                    | `.yumi-calculated-amount__breakdown-expression`                       | font-size: 12px         |
| 803                                    | `.yumi-calculated-amount__breakdown-item dd`                          | font-size: 13px         |
| 804                                    | `.yumi-calculated-amount__breakdown-item dd`                          | line-height: 18px       |
| 795                                    | `.yumi-calculated-amount__breakdown-item dt`                          | font-size: 12px         |
| 796                                    | `.yumi-calculated-amount__breakdown-item dt`                          | line-height: 18px       |
| 772                                    | `.yumi-calculated-amount__expression,                                 |
| .yumi-calculated-amount__substitution, |
| .yumi-calculated-amount__note`         | font-size: 12px                                                       |
| 773                                    | `.yumi-calculated-amount__expression,                                 |
| .yumi-calculated-amount__substitution, |
| .yumi-calculated-amount__note`         | line-height: 18px                                                     |
| 742                                    | `.yumi-calculated-amount__label`                                      | font-size: 12px         |
| 743                                    | `.yumi-calculated-amount__label`                                      | line-height: 18px       |
| 747                                    | `.yumi-calculated-amount__value`                                      | font-size: 20px         |
| 750                                    | `.yumi-calculated-amount__value`                                      | line-height: 28px       |
| 894                                    | `.yumi-document-preview__description`                                 | font-size: 13px         |
| 895                                    | `.yumi-document-preview__description`                                 | line-height: 20px       |
| 888                                    | `.yumi-document-preview__title`                                       | font-size: 18px         |
| 889                                    | `.yumi-document-preview__title`                                       | line-height: 26px       |
| 393                                    | `.yumi-empty-state p`                                                 | font-size: 13px         |
| 394                                    | `.yumi-empty-state p`                                                 | line-height: 20px       |
| 824                                    | `.yumi-entity-summary__eyebrow`                                       | font-size: 12px         |
| 826                                    | `.yumi-entity-summary__eyebrow`                                       | line-height: 18px       |
| 831                                    | `.yumi-entity-summary__title`                                         | font-size: 22px         |
| 832                                    | `.yumi-entity-summary__title`                                         | line-height: 30px       |
| 599                                    | `.yumi-form-section__description`                                     | font-size: 13px         |
| 600                                    | `.yumi-form-section__description`                                     | line-height: 20px       |
| 593                                    | `.yumi-form-section__heading`                                         | font-size: 15px         |
| 594                                    | `.yumi-form-section__heading`                                         | line-height: 22px       |
| 488                                    | `.yumi-list-cell span`                                                | font-size: 12px         |
| 489                                    | `.yumi-list-cell span`                                                | line-height: 18px       |
| 483                                    | `.yumi-list-cell strong`                                              | font-size: 14px         |
| 484                                    | `.yumi-list-cell strong`                                              | line-height: 20px       |
| 89                                     | `.yumi-page-actions__context`                                         | font-size: 13px         |
| 90                                     | `.yumi-page-actions__context`                                         | line-height: 20px       |
| 61                                     | `.yumi-page-header__description`                                      | font-size: 14px         |
| 62                                     | `.yumi-page-header__description`                                      | line-height: 21px       |
| 53                                     | `.yumi-page-header__meta`                                             | font-size: 13px         |
| 55                                     | `.yumi-page-header__meta`                                             | line-height: 20px       |
| 29                                     | `.yumi-page-header__navigation .yumi-button`                          | font-size: 13px         |
| 114                                    | `.yumi-page-header__title`                                            | font-size: 22px         |
| 44                                     | `.yumi-page-header__title`                                            | font-size: 26px         |
| 46                                     | `.yumi-page-header__title`                                            | letter-spacing: -0.02em |
| 115                                    | `.yumi-page-header__title`                                            | line-height: 30px       |
| 47                                     | `.yumi-page-header__title`                                            | line-height: 36px       |
| 562                                    | `.yumi-record-summary__description`                                   | font-size: 13px         |
| 563                                    | `.yumi-record-summary__description`                                   | line-height: 20px       |
| 556                                    | `.yumi-record-summary__heading`                                       | font-size: 20px         |
| 557                                    | `.yumi-record-summary__heading`                                       | line-height: 28px       |
| 137                                    | `.yumi-section__description`                                          | font-size: 13px         |
| 138                                    | `.yumi-section__description`                                          | line-height: 20px       |
| 130                                    | `.yumi-section__heading`                                              | font-size: 18px         |
| 132                                    | `.yumi-section__heading`                                              | line-height: 26px       |
| 869                                    | `.yumi-snapshot-notice__content`                                      | font-size: 13px         |
| 870                                    | `.yumi-snapshot-notice__content`                                      | line-height: 20px       |
| 863                                    | `.yumi-snapshot-notice__title`                                        | font-size: 13px         |
| 864                                    | `.yumi-snapshot-notice__title`                                        | line-height: 20px       |

### `src/renderer/styles/pages.css` — 80

| 行                                                  | 选择器                                                                            | 违规内容                |
| --------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------- |
| 52                                                  | `.yumi-app-brand em`                                                              | font-size: 9px          |
| 55                                                  | `.yumi-app-brand em`                                                              | letter-spacing: 0.15em  |
| 56                                                  | `.yumi-app-brand em`                                                              | line-height: 12px       |
| 44                                                  | `.yumi-app-brand strong`                                                          | font-size: 15px         |
| 45                                                  | `.yumi-app-brand strong`                                                          | letter-spacing: 0.08em  |
| 46                                                  | `.yumi-app-brand strong`                                                          | line-height: 17px       |
| 39                                                  | `.yumi-app-brand__mark`                                                           | font-size: 19px         |
| 134                                                 | `.yumi-app-command-bar strong`                                                    | font-size: 14px         |
| 125                                                 | `.yumi-app-command-bar`                                                           | font-size: 13px         |
| 77                                                  | `.yumi-app-navigation__label`                                                     | font-size: 11px         |
| 79                                                  | `.yumi-app-navigation__label`                                                     | letter-spacing: 0.08em  |
| 80                                                  | `.yumi-app-navigation__label`                                                     | line-height: 16px       |
| 104                                                 | `.yumi-app-sidebar__footer`                                                       | font-size: 12px         |
| 105                                                 | `.yumi-app-sidebar__footer`                                                       | line-height: 18px       |
| 246                                                 | `.yumi-line-editor > legend`                                                      | font-size: 14px         |
| 248                                                 | `.yumi-line-editor > legend`                                                      | line-height: 21px       |
| 631                                                 | `.yumi-opening-wip__candidate span`                                               | font-size: 12px         |
| 632                                                 | `.yumi-opening-wip__candidate span`                                               | line-height: 18px       |
| 618                                                 | `.yumi-opening-wip__empty`                                                        | font-size: 13px         |
| 619                                                 | `.yumi-opening-wip__empty`                                                        | line-height: 20px       |
| 895                                                 | `.yumi-order-items-total strong`                                                  | font-size: 18px         |
| 896                                                 | `.yumi-order-items-total strong`                                                  | line-height: 26px       |
| 890                                                 | `.yumi-order-items-total`                                                         | font-size: 13px         |
| 891                                                 | `.yumi-order-items-total`                                                         | line-height: 20px       |
| 1244                                                | `.yumi-order-key-brief__metrics dd`                                               | font-size: 18px         |
| 1246                                                | `.yumi-order-key-brief__metrics dd`                                               | line-height: 26px       |
| 1236                                                | `.yumi-order-key-brief__metrics dt`                                               | font-size: 12px         |
| 1238                                                | `.yumi-order-key-brief__metrics dt`                                               | line-height: 18px       |
| 1367                                                | `.yumi-order-profit-reconciliation`                                               | line-height: 20px       |
| 1300                                                | `.yumi-order-profit-summary__main > span,                                         |
| .yumi-order-profit-summary__stats dt,               |
| .yumi-order-profit-summary small,                   |
| .yumi-order-profit-costs small`                     | line-height: 18px                                                                 |
| 1304                                                | `.yumi-order-profit-summary__main > strong`                                       | font-size: 30px         |
| 1306                                                | `.yumi-order-profit-summary__main > strong`                                       | letter-spacing: -0.03em |
| 1307                                                | `.yumi-order-profit-summary__main > strong`                                       | line-height: 38px       |
| 1332                                                | `.yumi-order-profit-summary__stats dd,                                            |
| .yumi-order-profit-costs dd`                        | font-size: 20px                                                                   |
| 1335                                                | `.yumi-order-profit-summary__stats dd,                                            |
| .yumi-order-profit-costs dd`                        | line-height: 28px                                                                 |
| 909                                                 | `.yumi-order-progress`                                                            | font-size: 12px         |
| 910                                                 | `.yumi-order-progress`                                                            | line-height: 18px       |
| 1495                                                | `.yumi-product-profit-preview__price span`                                        | font-size: 12px         |
| 1496                                                | `.yumi-product-profit-preview__price span`                                        | line-height: 18px       |
| 1500                                                | `.yumi-product-profit-preview__price strong`                                      | font-size: 20px         |
| 1502                                                | `.yumi-product-profit-preview__price strong`                                      | line-height: 28px       |
| 284                                                 | `.yumi-shipment-lines > div`                                                      | font-size: 13px         |
| 285                                                 | `.yumi-shipment-lines > div`                                                      | line-height: 20px       |
| 394                                                 | `.yumi-table-secondary`                                                           | font-size: 12px         |
| 395                                                 | `.yumi-table-secondary`                                                           | line-height: 18px       |
| 1403                                                | `.yumi-work-time-review__dialog-meta`                                             | font-size: 13px         |
| 1404                                                | `.yumi-work-time-review__dialog-meta`                                             | line-height: 20px       |
| 1418                                                | `.yumi-work-time-review__formula`                                                 | font-size: 12px         |
| 1419                                                | `.yumi-work-time-review__formula`                                                 | line-height: 18px       |
| 1428                                                | `.yumi-work-time-review__lock`                                                    | font-size: 12px         |
| 1429                                                | `.yumi-work-time-review__lock`                                                    | line-height: 18px       |
| 1434                                                | `.yumi-work-time-review__muted`                                                   | font-size: 12px         |
| 1435                                                | `.yumi-work-time-review__muted`                                                   | line-height: 18px       |
| 1447                                                | `.yumi-work-time-review__time-field`                                              | font-size: 12px         |
| 1448                                                | `.yumi-work-time-review__time-field`                                              | line-height: 18px       |
| 1045                                                | `.yumi-workbench-item-structure > div:first-child > p,                            |
| .yumi-workbench-priority-list__header p,            |
| .yumi-workbench-distribution > div:first-child > p` | line-height: 18px                                                                 |
| 1037                                                | `.yumi-workbench-item-structure h2,                                               |
| .yumi-workbench-priority-list h2,                   |
| .yumi-workbench-distribution h2`                    | line-height: 24px                                                                 |
| 1143                                                | `.yumi-workbench-priority-list li span:not(.yumi-workbench-priority-list__index), |
| .yumi-workbench-distribution li span`               | line-height: 18px                                                                 |
| 1134                                                | `.yumi-workbench-priority-list li strong,                                         |
| .yumi-workbench-distribution li strong`             | line-height: 20px                                                                 |
| 946                                                 | `.yumi-workbench-stage-chart__header h2`                                          | font-size: 16px         |
| 947                                                 | `.yumi-workbench-stage-chart__header h2`                                          | line-height: 24px       |
| 952                                                 | `.yumi-workbench-stage-chart__header p`                                           | font-size: 12px         |
| 953                                                 | `.yumi-workbench-stage-chart__header p`                                           | line-height: 18px       |
| 975                                                 | `.yumi-workbench-stage-chart__list li > div`                                      | font-size: 12px         |
| 976                                                 | `.yumi-workbench-stage-chart__list li > div`                                      | line-height: 18px       |
| 838                                                 | `.yumi-worker-week__add`                                                          | font-size: 12px         |
| 679                                                 | `.yumi-worker-week__date small`                                                   | font-size: 11px         |
| 673                                                 | `.yumi-worker-week__date`                                                         | font-size: 12px         |
| 674                                                 | `.yumi-worker-week__date`                                                         | line-height: 18px       |
| 853                                                 | `.yumi-worker-week__empty`                                                        | font-size: 12px         |
| 777                                                 | `.yumi-worker-week__person-count`                                                 | font-size: 11px         |
| 766                                                 | `.yumi-worker-week__person-name`                                                  | font-size: 12px         |
| 767                                                 | `.yumi-worker-week__person-name`                                                  | line-height: 18px       |
| 792                                                 | `.yumi-worker-week__task`                                                         | font-size: 12px         |
| 793                                                 | `.yumi-worker-week__task`                                                         | line-height: 16px       |
| 825                                                 | `.yumi-worker-week__task--timed .yumi-worker-week__task-meta`                     | font-size: 12px         |
| 816                                                 | `.yumi-worker-week__task-meta`                                                    | font-size: 11px         |
| 817                                                 | `.yumi-worker-week__task-meta`                                                    | line-height: 16px       |

## 裸间距（raw-spacing） — 44

### `src/renderer/styles/composites.css` — 7

| 行  | 选择器                                    | 违规内容                           |
| --- | ----------------------------------------- | ---------------------------------- |
| 737 | `.yumi-calculated-amount`                 | row-gap: 2px                       |
| 782 | `.yumi-calculated-amount__breakdown`      | gap: 6px                           |
| 783 | `.yumi-calculated-amount__breakdown`      | margin: 4px 0 0                    |
| 791 | `.yumi-calculated-amount__breakdown-item` | padding-top: 6px                   |
| 356 | `.yumi-empty-state`                       | padding: 48px var(--yumi-space-5)  |
| 478 | `.yumi-list-cell`                         | gap: 3px                           |
| 135 | `.yumi-section__description`              | margin: -4px 0 var(--yumi-space-3) |

### `src/renderer/styles/pages.css` — 37

| 行                                     | 选择器                                    | 违规内容                |
| -------------------------------------- | ----------------------------------------- | ----------------------- |
| 50                                     | `.yumi-app-brand em`                      | margin-top: 1px         |
| 26                                     | `.yumi-app-brand`                         | gap: 10px               |
| 27                                     | `.yumi-app-brand`                         | padding: 0 8px 28px     |
| 122                                    | `.yumi-app-command-bar`                   | padding: 0 32px         |
| 141                                    | `.yumi-app-content`                       | padding: 24px 28px 36px |
| 178                                    | `.yumi-app-content,                       |
| .yumi-app-command-bar`                 | padding-inline: 20px                      |
| 64                                     | `.yumi-app-navigation`                    | gap: 14px               |
| 67                                     | `.yumi-app-navigation`                    | padding-right: 4px      |
| 71                                     | `.yumi-app-navigation__group`             | gap: 3px                |
| 85                                     | `.yumi-app-navigation__item`              | gap: 10px               |
| 86                                     | `.yumi-app-navigation__item`              | padding: 8px 10px       |
| 75                                     | `.yumi-app-navigation__label`             | padding: 0 10px 5px     |
| 153                                    | `.yumi-app-sidebar`                       | padding-inline: 8px     |
| 20                                     | `.yumi-app-sidebar`                       | padding: 24px 12px 16px |
| 102                                    | `.yumi-app-sidebar__footer`               | padding: 14px 8px 0     |
| 623                                    | `.yumi-opening-wip__candidate > div`      | gap: 2px                |
| 596                                    | `.yumi-opening-wip__candidates`           | padding-right: 2px      |
| 907                                    | `.yumi-order-progress`                    | gap: 5px                |
| 182                                    | `.yumi-page`                              | padding: 24px 20px 28px |
| 197                                    | `.yumi-page`                              | padding: 28px 32px 36px |
| 1444                                   | `.yumi-work-time-review__time-field`      | gap: 6px                |
| 1073                                   | `.yumi-workbench-item-structure__body dl` | gap: 5px                |
| 1127                                   | `.yumi-workbench-priority-list li > div,  |
| .yumi-workbench-distribution li > div` | gap: 2px                                  |
| 835                                    | `.yumi-worker-week__add`                  | padding: 5px 0          |
| 660                                    | `.yumi-worker-week__column`               | gap: 6px                |
| 664                                    | `.yumi-worker-week__column`               | padding: 8px            |
| 669                                    | `.yumi-worker-week__date`                 | gap: 2px                |
| 670                                    | `.yumi-worker-week__date`                 | padding: 2px 0 8px      |
| 655                                    | `.yumi-worker-week__grid`                 | padding-bottom: 2px     |
| 688                                    | `.yumi-worker-week__person`               | gap: 4px                |
| 691                                    | `.yumi-worker-week__person`               | padding: 7px            |
| 758                                    | `.yumi-worker-week__person-head`          | gap: 6px                |
| 759                                    | `.yumi-worker-week__person-head`          | padding: 0 1px          |
| 764                                    | `.yumi-worker-week__person-name`          | gap: 6px                |
| 784                                    | `.yumi-worker-week__task`                 | gap: 2px                |
| 789                                    | `.yumi-worker-week__task`                 | padding: 5px 7px        |
| 805                                    | `.yumi-worker-week__task-head`            | gap: 6px                |

## 裸圆角（raw-radius） — 9

### `src/renderer/styles/composites.css` — 1

| 行  | 选择器                    | 违规内容            |
| --- | ------------------------- | ------------------- |
| 365 | `.yumi-empty-state__icon` | border-radius: 12px |

### `src/renderer/styles/pages.css` — 8

| 行   | 选择器                               | 违规内容             |
| ---- | ------------------------------------ | -------------------- |
| 35   | `.yumi-app-brand__mark`              | border-radius: 10px  |
| 918  | `.yumi-order-progress__track`        | border-radius: 999px |
| 181  | `.yumi-page`                         | border-radius: 18px  |
| 196  | `.yumi-page`                         | border-radius: 22px  |
| 1469 | `.yumi-product-workspace__form`      | border-radius: 14px  |
| 1410 | `.yumi-work-time-review__comparison` | border-radius: 12px  |
| 987  | `.yumi-workbench-stage-chart__track` | border-radius: 999px |
| 772  | `.yumi-worker-week__person-dot`      | border-radius: 999px |

## 裸阴影（raw-shadow） — 0

基线为空：该类别当前没有违规，棘轮已锁定，新增即失败。

## 私有断点（private-breakpoint） — 13

### `src/renderer/styles/composites.css` — 5

| 行  | 选择器 | 违规内容 |
| --- | ------ | -------- |
| —   | `—`    | 1023px   |
| —   | `—`    | 640px    |
| —   | `—`    | 720px    |
| —   | `—`    | 820px    |
| —   | `—`    | 900px    |

### `src/renderer/styles/pages.css` — 6

| 行  | 选择器 | 违规内容 |
| --- | ------ | -------- |
| —   | `—`    | 1080px   |
| —   | `—`    | 520px    |
| —   | `—`    | 640px    |
| —   | `—`    | 820px    |
| —   | `—`    | 900px    |
| —   | `—`    | 980px    |

### `src/renderer/styles/primitives.css` — 2

| 行  | 选择器 | 违规内容 |
| --- | ------ | -------- |
| —   | `—`    | 620px    |
| —   | `—`    | 640px    |

## 共享组件内部 class 覆盖（shared-class-override） — 0

基线为空：该类别当前没有违规，棘轮已锁定，新增即失败。

## 旧 class 残留（legacy-class-in-source） — 0

基线为空：该类别当前没有违规，棘轮已锁定，新增即失败。

## 悬空令牌引用（dangling-token-reference） — 0

基线为空：该类别当前没有违规，棘轮已锁定，新增即失败。

## 未消费令牌（unconsumed-token） — 10

### `src/renderer/styles/tokens.css` — 10

| 行  | 选择器 | 违规内容                      |
| --- | ------ | ----------------------------- |
| —   | `—`    | --yumi-control-height-compact |
| —   | `—`    | --yumi-font-weight-medium     |
| —   | `—`    | --yumi-layout-page-gutter     |
| —   | `—`    | --yumi-layout-sidebar-width   |
| —   | `—`    | --yumi-overlay-padding        |
| —   | `—`    | --yumi-palette-rattan-yellow  |
| —   | `—`    | --yumi-space-8                |
| —   | `—`    | --yumi-success-hover          |
| —   | `—`    | --yumi-tab-indicator-height   |
| —   | `—`    | --yumi-table-row-min-height   |

## 未消费令牌说明

tokens.css 中定义但全仓库无引用的令牌共 10 个：`--yumi-control-height-compact`、`--yumi-font-weight-medium`、`--yumi-layout-page-gutter`、`--yumi-layout-sidebar-width`、`--yumi-overlay-padding`、`--yumi-palette-rattan-yellow`、`--yumi-space-8`、`--yumi-success-hover`、`--yumi-tab-indicator-height`、`--yumi-table-row-min-height`。

> P1 任务 3.5（按钮/图标按钮/菜单/危险操作迁移）消费 `--yumi-control-height`、`--yumi-control-padding-x` 与 `--yumi-font-weight-semibold`，已从基线与本表删除。
>
> P1 任务 3.6（字段类迁移）消费 `--yumi-field-gap` 与 `--yumi-line-height-tight`，已从基线与本表删除；`--yumi-overlay-padding` 与 `--yumi-panel-padding` 待浮层/面板迁移（4.x）后消费。
>
> P1 任务 3.7/3.8（选择器/日期/标签页/分段/状态标签令牌迁移）新增 `--yumi-font-size-2xs` 并消费 `--yumi-control-height`、`--yumi-radius-xs`/`--yumi-radius-full`、`--yumi-space-0-5` 等，已将 select/date/tabs/status-tag 相关 39 条裸值从基线与本表删除（326→287）。
>
> P1 任务 3.9（删除零使用组件）删除 `YumiBusinessList`、`YumiBusinessListItem`、`YumiTaskRateSummary`、`YumiDateTimePicker`、`YumiDateTimeRangePicker` 及随附 CSS，清出 18 条裸值；`--yumi-z-sticky` 随 business-list 唯一消费点删除转为未消费令牌（待 4.6 StickyActions 消费），unconsumed 11→12（287→270）。
>
> P1 任务 4.3（ListSurface/ListToolbar 布局契约迁移）将 `.yumi-list-toolbar__count` 裸字号/行高改为 `--yumi-font-size-sm`/`--yumi-line-height-normal`，清出 2 条裸值（270→268）。
>
> P1 任务 4.4（DataTable/DetailList/MetricStrip 契约迁移）将 24 条裸字号/行高/间距/圆角改为令牌并新增基础尺度 `--yumi-space-2-5: 10px`、`--yumi-space-4-5: 18px`、`--yumi-space-9: 36px`、`--yumi-font-size-2xl: 22px`、`--yumi-line-height-display: 1.4`（全部即时被消费，unconsumed 保持 12），清出 24 条裸值（268→244）。
>
> P2 任务 5.1-5.11（七种页面 Pattern）期间 styles 域清理：无净新增裸值。
>
> P3 任务 6.1（报表家族 WIP 还原）删除财务总览 WIP 段落（pages.css 末尾 272 行），其内登记的裸色值 1 条、裸字号/行高/字距 20 条、私有断点 760px 1 条随之出基线（234→211）；`--yumi-space-8` 的唯一消费点随段落删除转为未消费令牌（9→10），待报表家族迁移（6.2）按新布局消费或保留登记。
>
> P3 任务 7.4（设置家族清理）删除 pages.css `.yumi-settings-*` 域规则，`.yumi-settings-protection__intro` 裸字号/行高改为 `--yumi-font-size-sm`/`--yumi-line-height-normal` 后迁入 patterns.css——清出 2 条裸值（211→209），无新增；其余设置面板/资料库表列/备份表列/行内动作布局一并以令牌迁入 Patterns 层，未引入任何新违规。
