# 智能词库 V3 测试矩阵

> 状态：Phase 1 推荐决策包与本矩阵已于 2026-08-24 获用户批准，进入契约施工。
>
> 前端施工基线：分支 `feat/smart-lexicon-v3` 从 `3d69269a3ea3` 起步；契约于 2026-08-25 对账后端 `main@4178ebea5736`。
>
> 当前边界：后端 C2 已由 `678e3f3` 合入并据用户确认完成部署；前端契约已重新同步当前 OpenAPI。V3 Admin 编辑器的 unit/integration 与三条 Playwright Mock E2E 已实现；真实 HTTP/数据库、测试服浏览器及 create/edit/publish/projection flags 验收仍保持 BLOCKED，不能用类型、fixture 或 Mock E2E 结果替代。

## 范围和证据规则

- 本矩阵覆盖 Phase 1 的 V3 词形结构、主词兼容桥、Admin 编辑器及其 V2 回归，并列出后续 surface、学习端与迁移门禁。
- 每个 P0 行必须有自动化测试；真实浏览器、真实 HTTP/数据库和迁移演练另列发布证据，mock E2E 不能替代。
- V3 `@tsz/types`、V2/V3 decoder 与 V3 api-client 已按当前后端 OpenAPI 接入；`openapi.snapshot.json` 与运行时 schema closure 只能用 `pnpm --filter @tsz/api-client sync:openapi` 生成。
- 状态含义：READY = 决策与契约已具备，可开始写测试；PASS = 自动化已实现并通过；BLOCKED = 缺后端契约、实现或真实环境；LATER = 已批准延后至 Phase 2/3。

## 决策依赖

| 依赖 | 内容                                           | 决策/契约状态          | 阻塞范围                           |
| ---- | ---------------------------------------------- | ---------------------- | ---------------------------------- |
| D0   | Phase 1 仅 `kind=word`，phrase 保持 V2         | Phase 1 已批准         | aggregate、路由、create/detect     |
| D1   | Q1：同一 POS 允许一形多组 membership           | Phase 1 已批准         | membership、移动/删除与排序        |
| D2   | Q2：地区模式只属于 concrete form               | Phase 1 已批准         | region 模式与完成校验              |
| D3a  | Q3：Phase 1 临时展示名称与 Phase 2 最终策略    | 临时规则已批准         | presentation、列表与关联展示       |
| D3b  | Q4：同拼写 warning/acknowledgement 策略        | Phase 1 已批准         | create/detect、surface 与重复检查  |
| D4a  | Q5a：Phase 1 sense 只归属 POS                  | Phase 1 已批准         | meanings wire、影响预览与学习端    |
| D4b  | Q5b：sentence form/variant 命中证据            | 已批准延后 Phase 2     | 例句 resolver、方言显示和历史解释  |
| D5a  | Q6：V2 base 配多个既有 group 的迁移规则        | 转换语义已批准         | migration 与 UUID/membership 映射  |
| D5b  | Q8：draft/complete、空 group 与 orphan 规则    | Phase 1 已批准         | 聚合校验、删除和编辑器空态         |
| D6   | Q7：历史 V2 publication 不可变                 | Phase 1 已批准         | 双版本 reader、恢复与回滚          |
| D7a  | Q9：form_type 使用版本化固定枚举               | Phase 1 已批准         | wire 枚举、目录治理和校验          |
| D7b  | Q10：wire 数组顺序与数据库 ordinal             | Phase 1 已批准         | 重排、往返和 repository 一致性     |
| D7c  | Q11：规范化后完全重复发音拒绝                  | Phase 1 已批准         | pronunciation 去重校验             |
| D8   | Q12：只读迁移 bridge 与新 V3 发布 gate         | Phase 1 已批准         | V3 创建、legacy 消费和 Phase 3     |
| C1   | 后端 V3 OpenAPI 与错误码正式冻结并同步 C2 变化 | PASS（当前 spec 对账） | types、api-client；不代表真实 HTTP |

## 前端单元与模型测试

| ID      | 层级 | 场景                 | 输入/前置条件                                             | 预期行为                                                                                | 优先级 | 依赖       | 状态    |
| ------- | ---- | -------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------ | ---------- | ------- |
| V3-U01  | Unit | common 地区形状      | 一个 form，`mode=common`，一条 common variant             | selector/校验无损读取，variant/form UUID 不变                                           | P0     | D2、C1     | PASS    |
| V3-U02  | Unit | uk+us 地区形状       | 一个 form，`mode=uk_us`，完整 uk 与 us                    | 两侧属于同一 form，顺序与 UUID 稳定                                                     | P0     | D2、C1     | PASS    |
| V3-U03  | Unit | 非法地区组合         | common+uk、uk_us 缺节点、重复/未知 dialect                | draft 也拒绝结构错误并返回精确 form/variant issue；不自动补节点                         | P0     | D2、C1     | PASS    |
| V3-U04  | Unit | 同类型多个具体词形   | 同组两个 `base`、两个 `comparative`                       | 合法保留，不去重、不覆盖、不选“主”节点                                                  | P0     | D7a、C1    | PASS    |
| V3-U05  | Unit | form/membership 身份 | 改拼写、发音、移组、数组重排                              | 内容修改保留 form/variant/pronunciation UUID；组变化只影响 membership                   | P0     | D1/D7b、C1 | PASS    |
| V3-U06  | Unit | 同一 POS 跨组共享    | 同一 `form_id` 通过两个 membership 出现在两个 group       | 合法保留一个 concrete form 与两个 membership，不复制内容                                | P0     | D1、C1     | PASS    |
| V3-U06a | Unit | 非法 membership      | form 跨 POS，或同一 group 重复引用同一 form               | 返回精确 membership issue；不复制、不重绑、不自动修复                                   | P0     | D1、C1     | PASS    |
| V3-U06b | Unit | 最后 membership      | 删除 form 的唯一/最后 membership                          | 同事务显式退役/删除 form 或拒绝；绝不留下 orphan                                        | P0     | D1/D5b、C1 | PASS    |
| V3-U06c | Unit | 零组与空组           | POS 分别有零 group、一个空 group、空组+非空组、base-only  | draft 可保存；complete 要求至少一组且所有保留 group 非空                                | P0     | D5b、C1    | PASS    |
| V3-U07  | Unit | 发音完整性           | 0/1/多条发音；空 `dict_phonetic`、`actual_pron`、`style`  | draft 与 complete 按契约分流；complete 精确阻断                                         | P0     | C1         | PASS    |
| V3-U07b | Unit | 发音完全重复         | 同 variant 下规范化后三元组相同、未完成 draft 行          | 严格执行 D7c；未完成 draft 行不误参与重复判断                                           | P0     | D7c、C1    | PASS    |
| V3-U08  | Unit | wire 数组顺序        | group/form/member/pronunciation 数组重排并往返            | 重排后的数组顺序稳定；wire 不发送/接收 `sort_order`                                     | P0     | D7b、C1    | PASS    |
| V3-U09  | Unit | 节点/文本上限        | 0、边界、超限、超长拼写/音标                              | 边界可保存；超限给稳定 issue                                                            | P0     | C1         | PASS    |
| V3-U10a | Unit | 当前 V2 版本防火墙   | schema 2、缺失、3、4、null                                | 当前客户端只接受 schema 2；其他版本 fail closed；不声称支持 V3                          | P0     | 无         | PASS    |
| V3-U10b | Unit | V2/V3 union guard    | 正式 schema 2、3、缺失、4、null                           | V2/V3 正确收窄；未知版本 fail closed                                                    | P0     | C1         | PASS    |
| V3-U11a | Unit | 迁移展示投影         | 迁移 entry 的 legacy headwords 与 presentation            | 服务端按 legacy 规则格式化 label；客户端只读，不写回 canonical input                    | P0     | D3a、C1    | PASS    |
| V3-U11b | Unit | 新 V3 展示投影       | 重复 regional surfaces、无 surface、新增多个 base         | label 为去重 surface 摘要；空时为 short UUID fallback；不选 first base                  | P0     | D3a、C1    | PASS    |
| V3-U11c | Unit | 展示策略生命周期     | response 含/缺 presentation、已知/未知 `strategy_version` | presentation 仅 response；未知非空版本照常显示并记录指标；缺失或 shape 非法 fail closed | P0     | D3a、C1    | PASS    |
| V3-U12  | Unit | 完成度聚合           | 多 POS/group/form/variant/pronunciation blockers          | 计数无重复，并返回第一个稳定 UUID 定位                                                  | P0     | D5b、C1    | PASS    |
| V3-U13  | Unit | TTS 试听 identity    | form 移组、拼写变更、voice 变更、URL 过期                 | 移组不误失效；内容/voice 变化失效；URL 不进 canonical wire                              | P1     | C1         | BLOCKED |

## API 契约与请求层

| ID     | 层级         | 场景                                    | 输入/前置条件                                                   | 预期行为                                                                                      | 优先级 | 依赖    | 状态 |
| ------ | ------------ | --------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------ | ------- | ---- |
| V3-C01 | Contract     | V3 schema 对账                          | 权威 OpenAPI 含 AdminWordV3/forms/region/pronunciation          | required、oneOf、snake_case、UUID、枚举与 `@tsz/types` 一致                                   | P0     | C1      | PASS |
| V3-C02 | Contract     | create/get/save/impact/validate/publish | V3 method/path/body/header/status                               | api-client 与 OpenAPI 完全一致，不复用不兼容 V2 泛型                                          | P0     | C1      | PASS |
| V3-C03 | Contract     | 生成 snapshot                           | 后端权威 spec 已冻结                                            | 原生命令生成；无手改；契约测试无未说明 PENDING                                                | P0     | C1      | PASS |
| V3-C04 | Request unit | runtime decoder                         | 合法 V3、缺字段、多余字段、非法 union、未知 enum                | 合法通过；非法 fail closed，保留可诊断 code                                                   | P0     | C1      | PASS |
| V3-C05 | Request unit | RFC 9457 issue location                 | 400/409/422/500 与深层 node location                            | 解码到 POS/group/form/variant/pronunciation；不丢 meta                                        | P0     | C1      | PASS |
| V3-C06 | Request unit | 幂等创建/发布                           | 同 key 同 body、同 key 异 body                                  | 重放相同响应；异 body 409，前端轮换 key 前刷新状态                                            | P0     | D8、C1  | PASS |
| V3-C07 | Request unit | 认证/权限                               | access 过期 401、禁用/强制改密 403                              | 复用 Admin auth 内核；不把权限错误显示成校验错误                                              | P0     | C1      | PASS |
| V3-C08 | Request unit | 网络/服务失败                           | timeout、断网、500、503                                         | 保留本地输入；可重试；不乐观标记已保存/已发布                                                 | P0     | C1      | PASS |
| V3-C09 | Request unit | V3 forms surface warning                | 同形 form surfaces、分页 warning、确认 token、policy epoch 变化 | 继承 warning + acknowledgement/policy gate；token 绑定 digest/revision/epoch，陈旧 token 拒绝 | P0     | D3b、C1 | PASS |

## Admin 组件与集成测试

| ID      | 层级        | 场景                    | 输入/前置条件                                    | 预期行为                                                                | 优先级 | 依赖       | 状态    |
| ------- | ----------- | ----------------------- | ------------------------------------------------ | ----------------------------------------------------------------------- | ------ | ---------- | ------- |
| V3-I01  | Integration | schema 路由             | 列表含 V2/V3 draft/published/archived/unknown    | 进入正确 editor/preview；未知版本只读报错；不交叉保存                   | P0     | D0、C1     | PASS    |
| V3-I02  | Integration | 多 POS/多组/同类型多行  | 两个 POS、每 POS 两组、同组两个 base             | Tabs/Card/行完整显示；React key 使用 UUID；编辑互不覆盖                 | P0     | C1         | PASS    |
| V3-I03  | Integration | common ↔ uk+us          | 切换、取消、已有多发音                           | 按批准规则确认影响；不新建 entry/form；焦点与输入稳定                   | P0     | D2、C1     | PASS    |
| V3-I04  | Integration | 多发音 Form.List        | 新增、删除、数组重排 normal/strong/weak          | 使用 `field.key`；每条 UUID/内容稳定；完成度同步                        | P0     | D7b、C1    | PASS    |
| V3-I05  | Integration | 错误导航                | issue 指向非当前 POS 下第二个 pronunciation      | 激活 POS、展开 group、滚动并 focus 精确字段                             | P0     | C1         | PASS    |
| V3-I06  | Integration | canonical save          | 编辑后服务端规范化并返回 canonical V3            | UI 用响应替换草稿，revision 更新，未改节点不抖动                        | P0     | C1         | PASS    |
| V3-I07  | Integration | optimistic conflict     | 两次保存共用旧 revision                          | 一个成功；另一个 409，提示刷新/比较且不丢输入                           | P0     | C1         | PASS    |
| V3-I08  | Integration | 422 与部分完成          | draft 含零/空组，或 uk/us 节点内容为空/缺发音    | 结构完整的 draft 成功；complete issue 定位；不得显示已完成              | P0     | D2/D5b、C1 | PASS    |
| V3-I09  | Integration | 同 tick 双击            | 快速双击保存、impact、发布                       | 同步 in-flight lock 只发一请求；完成后可重试                            | P0     | D8、C1     | PASS    |
| V3-I10  | Integration | 请求失败与回滚          | 500/网络失败发生在编辑、移组、删除后             | 保留编辑内容或回滚乐观状态；按钮恢复；错误可重试                        | P0     | C1         | PASS    |
| V3-I11a | Integration | Phase 1 删除影响预览    | 迁移 form 被既有 sense POS/relation/surface 引用 | 未确认不删除；展示兼容桥可解析引用；token 绑定 revision                 | P0     | D4a/D8、C1 | PASS    |
| V3-I11b | Integration | Phase 2 例句命中影响    | sentence 记录 form/variant/publication evidence  | 按 Q5b 展示与校验命中证据；不改变 sense ownership                       | P0     | D4b、C1    | LATER   |
| V3-I12  | Integration | 预览与发布 gate         | 新 V3 多 base、common/uk+us、多发音              | 平级预览无“主”暗示；Phase 1 激活发布被稳定阻断                          | P0     | D8、C1     | PASS    |
| V3-I13  | Integration | 主词兼容桥              | 迁移后 V3 forms 与 legacy headwords 不一致       | V3 保存不绑定/同步 bridge；请求无 bridge 写字段/API；只读值保持迁移副本 | P0     | D8、C1     | PASS    |
| V3-I14  | Integration | V2 回归                 | 现有 V2 base_form、零派生、多组和关联词          | 继续走 V2 editor；现有保存/发布/待建条行为不回归                        | P0     | 无         | PASS    |
| V3-I15a | Integration | 保存与 surface 异步竞态 | 切 POS/路由时保存或 surface 请求返回             | 过期响应不覆盖新状态；请求正确清理                                      | P0     | C1         | PASS    |
| V3-I15b | Integration | V3 TTS 生命周期         | 切 POS/路由时 TTS 请求返回或音频仍在播放         | 过期响应不覆盖新状态；请求与音频正确清理                                | P0     | C1         | BLOCKED |
| V3-I16  | Integration | phrase 保持 V2          | phrase draft/published/list 路由                 | 不进入 V3 editor，不被 V3 guard/保存路径改写                            | P0     | D0         | PASS    |

## E2E、真实环境与跨团队门禁

| ID      | 层级                  | 场景                   | 输入/前置条件                                               | 预期行为                                                                   | 优先级    | 依赖                        | 状态    |
| ------- | --------------------- | ---------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- | --------- | --------------------------- | ------- |
| V3-E01a | Playwright mock E2E   | Phase 1 新 V3 主路径   | contract-shaped mock：新建、多 POS/组/base、regions、多发音 | 编辑、保存、刷新、定位、预览通过；激活发布稳定阻断；证据明确标 mock        | P0        | D0/D1/D2/D5b/D7a/D7b/D8、C1 | PASS    |
| V3-E01b | Playwright mock E2E   | Phase 1 迁移 canary    | 带只读 legacy bridge 的迁移 entry                           | 白名单发布通过；历史 V2 publication 未改写；证据明确标 mock                | P0        | D5a/D6/D8、C1               | PASS    |
| V3-E01c | Playwright mock E2E   | Phase 2 新 V3 激活     | presentation/surface/search 消费者已切换                    | 新 V3 发布后可通过列表、搜索和关联读取                                     | P0        | D3a/D3b/D4b、C1             | LATER   |
| V3-E02  | Playwright mock E2E   | V2/V3 混合列表         | V2 与 V3 多状态记录                                         | 查看/继续编辑/归档入口按 ID、schema 与服务端 presentation 路由             | P0        | D3a、C1                     | PASS    |
| V3-R01a | 真实 HTTP             | Phase 1 新 V3 命令链   | 本地 tsz-rust + PostgreSQL + 正式 OpenAPI                   | create/get/save/impact/validate 对账；publish 返回稳定 gate 错误且无副作用 | P0 发布门 | D8、C1、后端实现            | BLOCKED |
| V3-R01b | 真实 HTTP             | Phase 1 迁移 publish   | 带只读 legacy bridge 的白名单迁移 entry                     | publish 返回真实 V3 publication；token/UUID/revision 对账；V2 历史不变     | P0 发布门 | D5a/D6/D8、C1、后端实现     | BLOCKED |
| V3-R02a | 真实浏览器            | Phase 1 新 V3 主路径   | in-app browser、真实本地 API                                | 多原型、地区侧、多发音、错误定位、刷新、预览通过；激活发布阻断             | P0 发布门 | V3-R01a                     | BLOCKED |
| V3-R02b | 真实浏览器            | Phase 1 迁移 canary    | in-app browser、真实迁移 entry                              | 白名单发布可见；legacy label 只读；历史 V2 publication 可回看              | P0 发布门 | V3-R01b                     | BLOCKED |
| V3-R02c | 真实浏览器            | Phase 2 新 V3 激活     | 新 V3 publish/search capability 已打开                      | 发布后列表、搜索、关联和学习端读取一致                                     | P0 发布门 | Phase 2 下游实现            | LATER   |
| V3-R03  | 真实浏览器            | V2 历史回看            | V3 current + V2 historical publication                      | 双版本可读，无隐式迁移或内容改写                                           | P0 发布门 | D6、后端实现                | BLOCKED |
| V3-B01  | Backend unit/DB       | ownership/constraints  | 跨 POS membership、重复 type、地区集合、空组、悬空引用      | 重复 type 合法；非法 ownership/region/orphan/complete-empty-group 事务拒绝 | P0        | D1/D2/D5b/C1                | BLOCKED |
| V3-B02  | Backend HTTP          | 幂等/并发/错误         | 400/401/403/409/422/500、双管理员并发                       | 稳定 Problem Details；无静默覆盖；重放确定                                 | P0        | C1、后端实现                | BLOCKED |
| V3-B03  | Backend repository/DB | internal ordinal       | 数组重排、重复/负数/间断 ordinal                            | 确定性序列化或事务拒绝；V3 wire 始终只有数组顺序                           | P0        | D7b、C1                     | BLOCKED |
| V3-M01  | Migration rehearsal   | V2 单组                | base + 一个 group + derived slots                           | UUID/内容/顺序/投影一一对账                                                | P0        | D1/D6、迁移实现             | BLOCKED |
| V3-M02a | Migration rehearsal   | V2 多组                | 一个 base + 多个既有 groups                                 | 严格执行 D5a；保留一个 base UUID 与确定 membership，不复制 concrete form   | P0        | D1/D5a/D6、迁移实现         | BLOCKED |
| V3-M02b | Migration rehearsal   | V2 零组                | base + `form_groups=[]`                                     | 严格执行 D5b 建确定性 base-only group；仅异常记录 blocked                  | P0        | D5b/D6、迁移实现            | BLOCKED |
| V3-M03  | Migration rehearsal   | 中断、重放、checksum   | 批次中断、重复运行、projection 延迟                         | 幂等无重复；checkpoint/parity 正确；阈值超限停止                           | P0        | 迁移实现                    | BLOCKED |
| V3-M04  | Rollback rehearsal    | 已有 V3-only 多 base   | 关闭 create/edit/publish/projection flags                   | V3 数据保持只读；不有损降级；V2 历史仍可读                                 | P0        | D6、后端实现                | BLOCKED |
| V3-M05  | Migration/HTTP        | legacy bridge 生命周期 | V2 headwords 迁移、随后编辑 V3 forms、尝试提交 bridge 字段  | 仅迁移事务一次性复制并审计；后续不持续同步；写字段/API 被拒绝或不存在      | P0        | D6/D8、C1、迁移实现         | BLOCKED |
| V3-L01  | Learning integration  | V2/V3 publication      | 两版本学习端 fixture                                        | 通过 schema 读取；按 presentation/variant 显示；不以 headword 作身份       | P0        | D3a/D4a/D6、学习端实现      | LATER   |
| V3-L02  | Learning integration  | sentence 命中证据      | 同拼写多 form/variant/publication                           | 按 Q5b 展示明确命中证据；不把命中归属误作 sense ownership                  | P0        | D4b、学习端实现             | LATER   |

## 第一批可执行顺序

1. Phase 1 形状决策 D0、D1、D2、D5b、D6、D7a、D7b、D8 及延后项中性行为已于 2026-08-24 批准；Phase 2 行继续为 LATER。
2. V3-U01～U12（U13 除外）、V3-C01～C09 与 V3-I01～I16（I11b、I15b 除外）已有自动化 PASS；Phase 2/LATER 行、V3 TTS 生命周期与真实环境行不随前端自动化批量放行。
3. 后续每个测试行只在自身列出的全部依赖满足时由 BLOCKED 改为 READY/PASS，不能因 C1 通过整段批量放行。
4. V3 Admin UI 已按模型单元测试 → Admin integration → Mock E2E 的顺序施工；新 V3 的 Phase 1 Mock E2E 断言发布 gate 阻断，迁移 entry Mock E2E 只覆盖 canary 发布。
5. Mock E2E 仅验证浏览器 UI、真实前端 HTTP client 与 route interception 之间的集成，不是 tsz-rust、PostgreSQL、测试服 flags 或真实浏览器联调证据。
6. focused tests 绿后运行 `pnpm test:cov`、`pnpm typecheck`、`pnpm lint`；真实 HTTP/数据库/浏览器与迁移演练分别报告，不把 mock 结果升级为真实 PASS。

## 2026-08-24 C1 契约接入证据

> 以下是历史 C1 证据；当前权威状态见下一节的 2026-08-25 对账。

- 后端 C1 OpenAPI SHA-256 为 `8ac7445445909c8538f2f0c1e1c80877ba4a93c94dcbb6f6fd790b51ce25fa83`，第四轮独立只读复审 PASS（P0/P1/P2 均为 0）；后端工作树仍未提交，真实 V3 成功路径保持 capability gate。
- 前端原生同步连续两次字节稳定：`openapi.snapshot.json` SHA-256 为 `338ea2908588fe0b68650bb7dff5b4918da8c71d14b5f8b236a9c1bb91138d2f`，运行时 schema closure 为 `f76b72b1188125cd84c25d249d5eef69b6cca4107799b1e0b05533256b2d5788`。
- `@tsz/api-client` 全包 6 个文件、356 项测试通过；statements / branches / functions / lines 均为 100%。测试覆盖 V3/Any aggregate、list、create/get/save/impact/validate、detection、surface、related、publication、严格 Problem Details、完整 C1 response status/root 与未知版本/未知字段 fail closed。
- 现有 V2 Admin UI 只新增 `schema_version === 2` 收窄、V2/V3 field issue 隔离与响应 fixture 对齐；相关 focused 8 个文件 252/252、mock 60/60 通过，未进入 V3 编辑器或路由。
- 首次默认双 worker 全量覆盖率因机器资源争用出现 10 个超时和 2 个 worker 启动超时；同批失败文件单 worker 224/224 通过。随后通过原生入口 `NODE_OPTIONS=--no-experimental-webstorage pnpm test:cov -- --maxWorkers=1` 复跑：135 个文件、2004 项测试全绿；总覆盖率 statements 95.74%、branches 91.73%、functions 95.80%、lines 96.77%，满足全部目录阈值。
- 仓库级 `pnpm typecheck`、`pnpm lint`、`pnpm format:check` 与 `git diff --check` 通过。
- 当日真实 V3 成功 HTTP、数据库、Admin 浏览器、publication activation 和迁移演练仍为 BLOCKED：该段只记录 C1 当时的证据。

## 2026-08-25 后端 C2 合入后的契约再同步

| #        | 层级       | 对账项                                                              | 预期                                          | 优先级 | 状态 |
| -------- | ---------- | ------------------------------------------------------------------- | --------------------------------------------- | ------ | ---- |
| C2-CT01  | Contract   | 当前 `tsz-rust/docs/openapi.json` 重新生成 snapshot/runtime closure | source hash、publication `503` 与生成文件一致 | P0     | PASS |
| C2-CT02  | Type       | V3 surface、meanings writable DTO、validation code                  | 判别联合无损；写 DTO 无只读投影；枚举逐项一致 | P0     | PASS |
| C2-RT01  | Runtime    | `legacy_v2` / `form_variant_v3` surface item 与旧裸 item            | 两个正式分支通过；C1 旧裸形状 fail closed     | P0     | PASS |
| C2-CT03  | Contract   | `SaveMeaningsStepInputV3.content` 深层 `$ref`                       | 固定指向 `DraftMeaningsStepContentWritableV3` | P0     | PASS |
| C2-REG01 | Regression | V2 decoder、Problem Details、api-client 全包                        | 类型检查、361 项包级测试和 lint 全绿          | P0     | PASS |

- 当前后端权威 OpenAPI SHA-256 为 `460535d2de2d9335fb1680ce86d65978085e42d5b50aea74f16431612e44c3e0`；V3 实现合并提交为 `678e3f3`，核验时后端 `main` 为 `4178ebea5736`。
- 本次同步纳入 C2 新增的 `SurfaceMatchItemV3` 判别联合、`FormSurfaceMatchV3` 来源/状态字段、完整 meanings/node-binding validation code、writable meanings DTO，以及 publication 读取的 `503`。
- 前端 V3 Admin 编辑器随后已施工，当前证据见下一节；真实环境的 HTTP、数据库、测试服 flags 与浏览器证据继续按 V3-R/V3-M 行单独验收。

## 2026-08-25 Admin V3 自动化与 response identity 门

- `V3-U01～U12`（不含独立待办 U13）、`V3-C06～C09`、`V3-I01～I15a`（不含 Phase 2 的 I11b 与 V3 TTS 生命周期 I15b）已有对应 unit/integration 自动化；V2/phrase 回归 I14/I16 继续通过。
- Admin 默认并发全量首次为 1331/1334：三个未授权 Wizard/T4 既有用例在资源压力下出现两个 5 秒 timeout 与一个短 wait 失败；同三文件单 worker 复跑 75/75 PASS，随后 Admin 完整单 worker 96 文件、1334/1334 PASS。本轮未提高 timeout 或改动 Wizard/T4。
- `admin-word-v3.spec.ts` 三条 Playwright Mock E2E 本轮单 worker 实跑 3/3 PASS：E01a 新 V3 主路径、E01b migrated canary 与不可变 V2 历史、E02 mixed V2/V3 列表路由。它们使用 contract-shaped route interception，明确不等于真实后端联调。
- V3 response binding 新增 fail-closed 门：GET、forms/meanings save、publish、activate 的 `word.id` 必须等于请求 entry；publication list/detail 同时校验 `entry_id`、内嵌 `word.id`，detail 额外校验 `publication_id`；detect 的 `request` 必须逐项回显请求 `language/kind/surface`，surface 分页的 `snapshot_id` 必须等于 path snapshot，impact 的 `base_revision` 与 validate 的 `validated_revision` 必须等于请求 `base_revision`。错配统一抛 `InvalidAdminWordResponseError`，不得更新 canonical/history 或触发后续写。
- 权威 OpenAPI 中 impact/validate response 不含 `word`/`entry_id`，因此不臆造 entry identity 字段；现有 revision echo 只绑定响应与发起该请求的 canonical revision。若后端还需 entry identity 绑定，须先扩展正式 wire/OpenAPI。
- V3-R01a/R01b、R02a/R02b/R03、V3-B、V3-M 与 create/edit/publish/projection flags 仍为 BLOCKED；本节没有真实 HTTP、PostgreSQL、测试服浏览器或 flags 验收证据。
