# Step 1 英美主词可编辑规则测试用例矩阵

## 范围与判定口径

- 目标入口：admin V3 创建向导 `UnifiedCreateEntryStep`。
- 检测结果只负责初始建议；创建请求必须显式携带管理员最终确认的 `headwords`。
- `distinguish` 模式的 `source_dialect` 等于当前管理员个人方言偏好，也是锁定侧；另一侧可编辑。
- `unified` 模式只显示一个可编辑的统一主词，不保留两份看似可编辑的镜像输入。
- 后端以请求中的 `headwords` 规范化并生成 V3 canonical forms；检测快照仍保留原始建议，不能被管理员编辑值覆盖。
- 最终 UI 手测只执行检测、模式切换与输入，不点击创建，不保存、发布或删除业务词条。

## P0 自动化矩阵

| #     | 层              | 场景                                 | 输入 / 前置                                            | 预期断言                                                                                                       | 对应测试                                                      |
| ----- | --------------- | ------------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| P0-01 | admin 集成      | 美式偏好 + 区分模式                  | 偏好 `us`，建议 `centre / center`                      | 美式主词锁定且显示“按个人偏好锁定”；英式主词可编辑；`source_dialect=us`                                        | `UnifiedCreateEntryStep.test.tsx`                             |
| P0-02 | admin 集成      | 英式偏好 + 区分模式                  | 偏好 `uk`，建议 `centre / center`                      | 英式主词锁定且显示“按个人偏好锁定”；美式主词可编辑；`source_dialect=uk`                                        | `UnifiedCreateEntryStep.test.tsx`                             |
| P0-03 | admin 集成      | 区分切到统一                         | 初始为 `distinguish`，编辑非锁定侧后关闭开关           | UI 只显示一个可编辑“统一主词”；初值取锁定侧而不是输入拼写或词典来源侧                                          | `UnifiedCreateEntryStep.test.tsx`                             |
| P0-04 | admin 集成      | 统一切到区分                         | 初始为 `unified`，编辑统一主词后开启开关               | 两侧以确认过的统一拼写初始化；偏好侧锁定，另一侧可编辑；`source_dialect` 取偏好                                | `UnifiedCreateEntryStep.test.tsx`                             |
| P0-05 | admin 集成      | 统一主词可编辑并提交                 | `unified`，把建议改为另一个合法英文拼写                | 创建请求携带最终 `{mode:"unified", common}`，不是检测建议                                                      | `UnifiedCreateEntryStep.test.tsx`                             |
| P0-06 | admin 集成      | 内置词典命中不改变锁定规则           | builtin `matched` 返回英美建议                         | 锁定侧仍只由偏好决定；编辑值进入创建载荷                                                                       | `UnifiedCreateEntryStep.test.tsx`                             |
| P0-07 | admin 集成      | 智能词库已有原形不改变锁定规则       | surface page 命中已有 V3 词条，必要时加载详情          | 既有词条只作为建议/重复提示；锁定侧仍只由偏好决定                                                              | `UnifiedCreateEntryStep.test.tsx`                             |
| P0-08 | admin 集成      | 检测无建议不改变锁定规则             | builtin `not_found`、无 surface match                  | 统一主词来自本次输入且可编辑；切换区分后仍按偏好锁定                                                           | `UnifiedCreateEntryStep.test.tsx`                             |
| P0-09 | admin 集成      | 创建前非法 UI 值                     | 统一主词或可编辑侧清空 / 输入非法字符                  | 创建按钮不可继续或显示明确字段错误；不发 create 请求                                                           | `UnifiedCreateEntryStep.test.tsx`                             |
| P0-10 | admin 集成      | 重试与确认保留最终值                 | surface token 更新或网络失败后原样重试                 | 新请求仍携带当前确认的 `headwords`；图标版“重新检测”行为不回归                                                 | `UnifiedCreateEntryStep.test.tsx`                             |
| P0-11 | api-client 契约 | V3 create wire 变化                  | `CreateAdminWordV3Input`                               | `headwords` 为必填 snake_case wire 字段；method/path/header 不变；OpenAPI 快照对账                             | `api.test.tsx`、`admin.test.ts`、`endpoints.contract.test.ts` |
| P0-12 | 后端 HTTP       | builtin matched + 最终区分拼写       | 建议 `centre / center`，提交编辑后的非偏好侧           | 201；响应 forms、editor JSONB、关系表与 presentation 均使用最终确认的英美拼写及区分模式；检测快照保持原建议    | `lexicon_handler.rs`                                          |
| P0-13 | 后端 HTTP       | builtin matched + 最终统一拼写       | 建议为区分模式，提交合法 unified 编辑值                | 201；所有 POS 的基础词形与 spelling rule 体现统一主词；读取结果与数据库一致                                    | `lexicon_handler.rs`                                          |
| P0-14 | 后端 HTTP       | not_found / 已有词库命中不绑定最终值 | 分别使用无建议检测、surface match 检测，提交合法编辑值 | 只按最终值校验与持久化；检测类别不强制模式、拼写或锁定侧                                                       | `lexicon_handler.rs`                                          |
| P0-15 | 后端 HTTP       | 空值与非法拼写                       | `common`、`uk`、`us` 分别为空；非拉丁/控制字符/无字母  | 空或非法拼写返回 400 `invalid_headword`；缺字段、未知 mode/未知字段返回 422 `invalid_request_body`；不写 entry | `lexicon_handler.rs`                                          |
| P0-16 | 后端 HTTP       | 幂等重复提交                         | 同 actor、同 idempotency key、同 body 连续或并发两次   | 返回同一 entry/响应，不产生第二条 entry、forms、projection 或审计脏数据                                        | `lexicon_handler.rs`                                          |
| P0-17 | 后端 HTTP       | 幂等键复用但最终值变化               | 同 key，第二次改 `headwords`                           | 409 `idempotency_conflict`，原 entry 不被改写                                                                  | `lexicon_handler.rs`                                          |
| P0-18 | 后端 HTTP       | 同 detection 并发不同 key            | 同 actor / detection，两个 create 命令并发             | 最多一个创建成功；另一请求稳定失败；数据库不存在重复或半成品数据                                               | `lexicon_handler.rs`                                          |
| P0-19 | 后端 HTTP       | 最终主词重复安全                     | 编辑后的最终主词命中现有 canonical surface             | 必须基于最终值重查并走现有确认/拒绝策略，不能只信检测时的旧 surface；并发下结果一致                            | `lexicon_handler.rs`                                          |
| P0-20 | 回归            | phrase 与建议词性微调不受损          | phrase 创建；当前 worktree 的建议词性来源优先级改动    | phrase 仍可用统一主词创建；建议词性展示保持既有未提交改动；SearchOutlined 保留                                 | 现有 admin / backend 测试                                     |

## 手测清单（不产生业务词条）

- [ ] 本地 admin 登录后将个人方言偏好设为美式，进入 Step 1，只执行一次词典检测：确认美式主词锁定、英式主词可编辑。
- [ ] 将个人方言偏好设为英式，重新检测：确认英式主词锁定、美式主词可编辑。
- [ ] 在区分 / 统一之间往返切换：统一模式只有一个可编辑输入；再次区分时锁定侧与个人偏好一致。
- [ ] 分别观察内置词典命中、智能词库已有词条提示和无匹配场景：三者都不改变锁定规则。
- [ ] 修改可编辑拼写并停留在 Step 1；不点击任何“创建”按钮，不保存、发布或删除词条。

## 测试数据台账

- 自动化 HTTP 测试：使用 `sqlx::test` 隔离数据库与测试 Redis，测试结束由框架回收；不触碰真实业务数据。
- 浏览器验收：只产生登录/偏好读取和检测请求，不创建业务词条；若切换个人偏好需要持久化，应在验收后恢复原值并记录前后值。
