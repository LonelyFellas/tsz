# Smart Lexicon V3 Step 1 英美主词可编辑：测试矩阵

## 判定口径

- 所有 P0 用例必须在实施阶段有可执行自动化；本阶段不写测试代码。
- fixture 与 HTTP body 使用 snake_case wire；后端数据库测试使用隔离 PostgreSQL/Redis。
- 旧 worktree 的 20 行矩阵作为输入，但需按最新 main、多维例句导航和兼容发布补齐。
- 浏览器手测不得创建、发布或删除真实业务词条；真实创建验收需要单独授权和可回收测试数据。

## 自动化矩阵

| ID    | 层              | 场景                                    | 输入/前置                                           | 预期                                                                                  | 优先级 |
| ----- | --------------- | --------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| H-01  | 前端单元        | 英式偏好区分模式                        | 建议 `centre/center`，偏好 `uk`                     | 英式锁定、美式可编辑，`source_dialect=uk`                                             | P0     |
| H-02  | 前端单元        | 美式偏好区分模式                        | 同上，偏好 `us`                                     | 美式锁定、英式可编辑，`source_dialect=us`                                             | P0     |
| H-03  | 前端单元        | 区分切统一                              | 非偏好侧已编辑                                      | 只剩一个可编辑统一主词；初值取已确认的偏好侧                                          | P0     |
| H-04  | 前端单元        | 统一切区分                              | 统一值已编辑                                        | 两侧从确认值初始化；偏好侧锁定                                                        | P0     |
| H-05  | 前端单元        | 非法最终值                              | 空、中文、emoji、纯数字、控制字符                   | 字段错误；不发 create                                                                 | P0     |
| H-06  | 前端集成        | 检测来源不改变编辑规则                  | matched、not_found、surface match                   | 都按偏好锁定；最终值进入 payload                                                      | P0     |
| H-07  | 前端集成        | 建议刷新/网络重试                       | 编辑后 surface token 更新或请求失败                 | 非主动重新检测不覆盖当前确认值                                                        | P0     |
| H-08  | 前端集成        | 多维例句导航回归                        | 带 `initialPendingTarget` 创建                      | 创建后 navigation state 仍含 pending target                                           | P0     |
| H-09  | 前端集成        | phrase 回归                             | phrase 检测与创建                                   | unified 最终值可创建；不套 word 专属规则                                              | P0     |
| H-10  | api-client 契约 | 兼容阶段字段可选                        | 后端 expand OpenAPI                                 | runtime schema 接受旧 body 和带 `headwords` body；method/path/header 不变             | P0     |
| H-11  | api-client 契约 | harden 阶段字段必填                     | 最终 OpenAPI                                        | 缺字段被 runtime/schema 测试拒绝；snake_case 对齐                                     | P0     |
| H-12  | 后端 HTTP       | 旧客户端兼容                            | V3 create 不带 `headwords`                          | 兼容阶段 201，按旧 detection 规则物化并写 `initial_*`                                 | P0     |
| H-13  | 后端 HTTP       | matched + distinguish 最终值            | 编辑非偏好侧                                        | 201；forms/presentation/nodes 使用最终值；snapshot 保持建议                           | P0     |
| H-14  | 后端 HTTP       | matched 建议切 unified                  | 合法统一最终值                                      | 201；所有 base form 与 presentation 使用 unified 值                                   | P0     |
| H-15  | 后端 HTTP       | not_found / surface match               | 合法编辑值                                          | 检测类别不绑定最终模式；仍执行最终重复策略                                            | P0     |
| H-16  | 后端 HTTP       | 非法或未知请求                          | 空/非法、未知 mode/字段                             | 400 `invalid_headword` 或 422 `invalid_request_body`；无 entry/idempotency/消费副作用 | P0     |
| H-17  | 后端 HTTP       | 同 key 同 body 重放                     | 串行两次                                            | 相同 entry/response，无第二份节点或审计                                               | P0     |
| H-18  | 后端 HTTP       | 同 key 最终值变化                       | 第二次修改 `headwords`                              | 409 `idempotency_conflict`，原 entry 不变                                             | P0     |
| H-19  | 后端并发        | 同 key 同 body 并发                     | 两请求并发                                          | 都返回同一 entry，只写一次                                                            | P0     |
| H-20  | 后端并发        | 同 detection 不同 key                   | 两请求并发                                          | 检测只消费一次；无半成品                                                              | P0     |
| H-21  | 后端并发        | 不同 detection 相同最终值               | 相同 kind、相同 canonical keys                      | key lock 串行；最多一条无需确认地创建，另一条稳定确认/拒绝                            | P0     |
| H-22  | 后端重复        | 最终值命中 active surface               | detection 值不同、final 命中                        | 按 final 返回确认或重复错误，不信旧 snapshot                                          | P0     |
| H-23  | 后端重复        | legacy-only exact                       | surface tombstone/尚未投影但 legacy key 存在        | final legacy fallback 仍阻断；改离后允许                                              | P0     |
| H-24  | 后端重复        | native 无 surface 空壳                  | 既有 `initial_headword_keys` 重叠                   | kind 相同拒绝；kind 不同按现有策略处理                                                | P0     |
| H-24A | 后端生命周期    | 空壳单条/批量恢复与 create 并发         | archived/active 或批内 `initial_headword_keys` 重叠 | 使用同一 key lock；单条/批量原子拒绝，不能恢复出重复 active 空壳                      | P0     |
| H-24B | 后端 forms 保存 | forms 转为空投影与 create 并发          | active 条目 initial X、当前 forms Y                 | clear/create 锁同一 initial keys；顺序和并发均最多一个 active hidden owner            | P0     |
| H-25  | DB schema       | JSON/keys 配对与严格形状                | 半套、extra key、错误 key 数/前缀                   | CHECK violation；合法 unified/distinguish 通过                                        | P0     |
| H-26  | 迁移 dry-run    | 既有 native 可确定回填                  | 历史 snapshot 完整                                  | 输出确定值/digest，不写数据                                                           | P0     |
| H-27  | 迁移阻断        | snapshot 缺失或多义                     | 无法唯一还原                                        | 列入阻断清单，不写猜测值，不允许 harden                                               | P0     |
| H-28  | 迁移并发/幂等   | dry-run 后旧 writer 写入、apply 重跑    | writer barrier 与已确认 manifest digest             | apply 等待 writer；manifest 漂移整体拒绝；刷新 dry-run 后原子回填且无残留 NULL        | P0     |
| H-28A | 迁移重复        | 历史版本已产生重复 active 空壳          | 同 kind 推导 keys 重叠                              | dry-run 把所有冲突行列为 blocker；apply 不写任何一行                                  | P0     |
| H-28B | 迁移存量重复    | 两个 active hidden 行均已有非 NULL keys | 同 kind keys 重叠                                   | 即使无 NULL 候选也报告两个 blocker，apply 失败                                        | P0     |
| H-29  | 迁移 harden     | native / migrated_v2 混合               | 回填完成                                            | native 两列必填；migrated_v2 规则保持；总数与 dry-run 对账                            | P0     |
| H-30  | OpenAPI         | 后端生成与前端同步                      | 两个兼容阶段                                        | `export_openapi` 生成；snapshot/runtime hash 与权威 spec 一致                         | P0     |
| H-31  | 回归            | 多维例句/建议词性/SearchOutlined        | 全量 admin 聚焦用例                                 | 已合入能力与既有 UI 不回归                                                            | P0     |
| H-32  | 性能            | `initial_headword_keys && $1` 查询      | 代表性数据量                                        | 查询计划无不可接受全表扫描；必要时再决定索引                                          | P1     |

## 手测清单

- [ ] 只做检测与输入：英式/美式偏好分别确认锁定侧和可编辑侧。
- [ ] unified/distinguish 往返，确认值不丢、没有两份伪统一输入。
- [ ] matched、not_found、已有 surface 三类检测均不改变编辑规则。
- [ ] 编辑最终值后触发重复提示时，不复用检测旧值的确认说明。
- [ ] 带 pending sentence target 的创建入口仍显示并保留目标上下文；本轮不点击创建。

## 实施阶段质量门

- 前端：相关 Vitest → `pnpm --filter @tsz/api-client test` → admin typecheck/lint → `pnpm test:cov`。
- 后端：聚焦 HTTP/DB/迁移测试 → `cargo fmt --check` → `cargo check --locked` → clippy → `cargo test --locked --all-features`。
- 契约：后端原生命令生成 `docs/openapi.json`，前端同步 snapshot/runtime schema，不手改生成物。
