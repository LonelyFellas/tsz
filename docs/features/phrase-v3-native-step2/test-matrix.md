# Smart Lexicon 短语 V3-native 编辑统一测试矩阵

## 状态

- 需求/设计：已批准。
- 前端自动化：已基于正式 V3 phrase OpenAPI 落地并通过。
- 后端契约：已实现、导出并同步到前端 runtime schema。
- 原则：每个 P0 必须自动化；真实浏览器验收不能替代契约和集成测试。

## 契约与类型

| ID  | 层级         | 场景                  | 输入/前置条件                                             | 预期                              | 优先级                 |
| --- | ------------ | --------------------- | --------------------------------------------------------- | --------------------------------- | ---------------------- |
| C01 | 后端契约     | V3 kind 支持 phrase   | schema 3 detection/create/detail                          | `kind=phrase` 合法且逐请求回显    | P0                     |
| C02 | API contract | OpenAPI discriminator | `CreateAdminWordV3Input`、`AdminWordV3`、list/publication | kind enum 为 `word                | phrase`，schema 仍为 3 | P0  |
| C03 | API runtime  | phrase V3 响应解析    | 完整 phrase aggregate                                     | runtime schema 接受且保留全部节点 | P0                     |
| C04 | API runtime  | 错误 schema/kind      | phrase 请求返回 V2 或 word                                | 客户端 fail closed，不导航        | P0                     |
| C05 | 类型         | V2 历史读取           | schema 2 phrase detail/list                               | 仍可按批准策略读取；不用于新建    | P1                     |

## 统一检测与创建

| ID  | 层级        | 场景             | 输入/前置条件                 | 预期                                          | 优先级 |
| --- | ----------- | ---------------- | ----------------------------- | --------------------------------------------- | ------ |
| U01 | Unit        | 输入分类         | `take care of`                | normalized 不变，kind=phrase                  | P0     |
| U02 | Unit        | 标点短语         | `day in, day out`             | kind=phrase，标点保留                         | P0     |
| U03 | Integration | phrase detection | 统一入口提交 phrase           | 只调用 schema 3 detect，不调用 V2             | P0     |
| U04 | Integration | matched 建议     | 内置词典返回 phrase POS/forms | 分来源展示建议，创建响应承载 canonical 预填   | P0     |
| U05 | Integration | not_found        | 无内置/智能命中               | 创建 schema 3 phrase 空骨架，不推断 POS/forms | P0     |
| U06 | Integration | unavailable      | 内置词典不可用                | 中文阻断，可重试，不降级为空骨架              | P0     |
| U07 | Integration | 命中已有原形     | surface snapshot 完整         | 可继续已有草稿，也可二次确认后新建独立 entry  | P0     |
| U08 | Integration | detection 过期   | 二次确认前过期                | 不创建，要求重新检测                          | P0     |
| U09 | Integration | 双击/并发        | 连续点击创建                  | 单次幂等创建，不出现两个未知结果              | P0     |

## 路由与身份守卫

| ID  | 层级        | 场景             | 输入/前置条件               | 预期                                 | 优先级 |
| --- | ----------- | ---------------- | --------------------------- | ------------------------------------ | ------ |
| R01 | Integration | phrase 创建成功  | schema 3 phrase response    | 导航 `/words/:id/v3/wizard/forms`    | P0     |
| R02 | Integration | phrase 继续创建  | V3 phrase draft list item   | 使用 V3 最大可达步骤路由             | P0     |
| R03 | Integration | 响应 ID 不一致   | path ID 与 response ID 不同 | fail closed                          | P0     |
| R04 | Integration | 响应 kind 不一致 | phrase path 返回 word       | fail closed                          | P0     |
| R05 | Integration | 历史 V2 route    | schema 2 phrase             | 仅按批准策略进入旧 route，不自动转换 | P1     |

## Step 2 数据结构与 UI

| ID  | 层级       | 场景            | 输入/前置条件                   | 预期                                                    | 优先级 |
| --- | ---------- | --------------- | ------------------------------- | ------------------------------------------------------- | ------ |
| F01 | Component  | 同组件渲染      | V3 word 与 V3 phrase            | 都使用 `V3FormsAndPronunciationStep` 和相同关键 DOM/CSS | P0     |
| F02 | Model      | 多 base         | phrase POS 含 2 个 base         | 两者均保留，顺序不变                                    | P0     |
| F03 | Model      | 同类型多条      | phrase 含 2 个 plural           | 不合并、不覆盖                                          | P0     |
| F04 | Model      | 共享 membership | 一个 form 被两个 group 引用     | form UUID 唯一，members 均保留                          | P0     |
| F05 | Model      | 多发音          | 一个 variant 有多 pronunciation | 顺序、style、UUID 保留                                  | P0     |
| F06 | Component  | UU              | common variants                 | 单词/短语同一通用面板结构                               | P0     |
| F07 | Component  | UD              | UK/US 同拼写、分发音            | 两侧完整面板，拼写同步，发音独立                        | P0     |
| F08 | Component  | DD              | UK/US 异拼写                    | 两侧独立面板、间距和控件一致                            | P0     |
| F09 | Operations | 模式往返        | common→uk/us→common             | form/membership 不变，variant ID 按账本复用             | P0     |
| F10 | Readiness  | 空 phrase 骨架  | POS/forms 为空                  | draft 可保存，complete 返回可定位 issue                 | P0     |
| F11 | UI         | kind 无分支     | 相同 forms 数据、不同 kind      | Step 2 DOM 与布局一致，仅业务标签可不同                 | P0     |
| F12 | A11y       | 键盘操作        | tabs、radio、add/remove         | 可聚焦、名称稳定、无内部 ID                             | P1     |

## 保存、影响与并发

| ID  | 层级            | 场景                  | 输入/前置条件                   | 预期                                                      | 优先级 |
| --- | --------------- | --------------------- | ------------------------------- | --------------------------------------------------------- | ------ |
| S01 | API integration | phrase forms save     | `intent=save`                   | 200、revision+1、UUID 原样回读                            | P0     |
| S02 | API integration | phrase forms complete | 完整 payload                    | completed_steps/max_reachable 正确推进                    | P0     |
| S03 | API integration | 不完整 complete       | 缺发音/拼写/POS                 | 422 stable issue，定位具体 node                           | P0     |
| S04 | Integration     | impact 无确认         | 无 downstream 影响              | POST impact 200 + PUT save 200                            | P0     |
| S05 | Integration     | impact 需确认         | 删除被 meanings 引用的 POS/form | 展示影响，确认 token 绑定 revision/digest                 | P0     |
| S06 | Integration     | revision 冲突         | 旧 base_revision                | 409，对账后保留用户草稿                                   | P0     |
| S07 | Integration     | surface 变化          | phrase base 与已有 surface 命中 | 使用统一 surface snapshot/确认，不按 duplicate entry 阻断 | P0     |

## Step 3、发布与生命周期

| ID  | 层级            | 场景                | 输入/前置条件             | 预期                                            | 优先级 |
| --- | --------------- | ------------------- | ------------------------- | ----------------------------------------------- | ------ |
| M01 | Integration     | phrase Step 3       | V3 phrase forms 已保存    | 使用 V3 meanings editor，不回退 V2              | P0     |
| M02 | Integration     | meanings 节点引用   | phrase POS/form IDs       | stable node location 可导航                     | P0     |
| M03 | API integration | validate/publish    | 完整 V3 phrase            | validate 200、publish 201、snapshot kind=phrase | P0     |
| M04 | Integration     | preview             | V3 phrase                 | 只显示业务结构，不泄露 ID/schema                | P1     |
| M05 | API integration | publication history | 多版本 phrase             | history/activate 使用 V3 snapshot               | P0     |
| M06 | API integration | archive/restore     | V3 phrase                 | lifecycle revision、surface 和列表状态正确      | P0     |
| M07 | Integration     | 关联与例句          | phrase 作为 source/target | consumer 不按 kind 错误排除                     | P0     |

## 列表、搜索与 presentation

| ID  | 层级          | 场景                | 输入/前置条件         | 预期                                          | 优先级 |
| --- | ------------- | ------------------- | --------------------- | --------------------------------------------- | ------ |
| L01 | Unit/contract | 单 base             | phrase 有一个 base    | 列表词汇为该 base                             | P0     |
| L02 | Unit/contract | 多 base             | phrase 有两个 base    | 稳定顺序显示 `base1 / base2`                  | P0     |
| L03 | Unit/contract | 派生形式            | phrase 有 base+plural | 列表仅显示 base                               | P0     |
| L04 | Integration   | 空骨架              | phrase 无 surface     | 不进入主列表/统计，按 ID 可继续编辑           | P0     |
| L05 | Integration   | 搜索                | 查询任一 phrase base  | 命中正确 entry/kind/schema                    | P0     |
| L06 | Integration   | 同 surface 多 entry | 两个 phrase 共享 base | 两条独立 entry 均展示，不被数据库唯一约束拒绝 | P0     |

## 错误、权限和可靠性

| ID  | 层级        | 场景              | 输入/前置条件           | 预期                          | 优先级 |
| --- | ----------- | ----------------- | ----------------------- | ----------------------------- | ------ |
| X01 | Integration | 401               | token 失效              | 停止保存并进入既有认证处理    | P0     |
| X02 | Integration | 403               | 无编辑权限              | 不创建/保存，中文提示         | P0     |
| X03 | Integration | 500/503           | 服务失败                | 保留本地草稿，可重试          | P1     |
| X04 | Contract    | 未知 kind         | 非 word/phrase          | runtime/API fail closed       | P0     |
| X05 | Contract    | 未知 form type    | 非固定枚举              | 后端 422，前端不猜测          | P0     |
| X06 | Integration | snapshot 策略变化 | token 过期或 epoch 变化 | 重新检测/确认，不复用旧 token | P0     |

## 响应式与真实浏览器

| ID  | 层级         | 场景             | 输入/前置条件                  | 预期                                                   | 优先级 |
| --- | ------------ | ---------------- | ------------------------------ | ------------------------------------------------------ | ------ |
| E01 | E2E/manual   | 1440             | word/phrase 相同 forms fixture | 左侧摘要、Step 2、操作栏结构一致                       | P0     |
| E02 | E2E/manual   | 1024             | 同上                           | 无核心控件遮挡，布局断点一致                           | P0     |
| E03 | E2E/manual   | 768              | 同上                           | tabs/面板可编辑，无非预期横向滚动                      | P1     |
| E04 | E2E/manual   | 390              | 同上                           | 单列布局、操作可达、键盘可用                           | P1     |
| E05 | Real browser | 完整 phrase flow | `take care of`                 | detect→create→Step2 save/reload→Step3→preview，全程 V3 | P0     |
| E06 | Real browser | 错误监控         | 完整流程                       | console/network 无英文原始错误、内部 ID 或错误路由     | P0     |

## 后端契约交接清单

前端实现开始前，tsz-rust 必须交付并导出：

1. V3 kind 正式扩展为 `word | phrase`；
2. schema 3 phrase detection/create/detail/list；
3. phrase forms/meanings/validate/publish/history/lifecycle 集成测试；
4. surface projection/search/relation consumers 的 phrase 覆盖；
5. V2 phrase 清理工具或经批准的 migration；
6. 更新后的 `docs/openapi.json`；
7. 明确的错误码、validation issue 和回滚方案。

收到正式 OpenAPI 后，前端按以下顺序开始：

```bash
pnpm --filter @tsz/api-client sync:openapi
pnpm --filter @tsz/api-client test
```

随后更新 types、统一创建入口、路由和 V3 wizard；禁止在 OpenAPI 之前手写 `kind=phrase` 的 V3 假契约。
