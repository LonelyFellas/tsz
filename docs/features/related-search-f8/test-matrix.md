# B9/F8 关联词搜索测试用例矩阵

| #   | 层                          | 场景                          | 输入/前置                                                           | 预期                                                                            | 优先级 |
| --- | --------------------------- | ----------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------ |
| 1   | Rust service/handler        | legacy q-only 与 limit        | 仅 q；或 q+kind+limit                                               | 保持 contains 混合结果；limit 仍生效                                            | P0     |
| 2   | Rust service/handler        | V2 参数校验                   | page_size/limit 同传、非法大小、非法 cursor                         | 返回 400 且字段准确                                                             | P0     |
| 3   | Rust repository/integration | exact 多页同名                | 两个以上同名且跨页，含 draft/archived                               | 仅当前有效 publication；按 kind/headword/word_id 稳定分页，无遗漏重复           | P0     |
| 4   | Rust repository/integration | contains 排除 exact           | match_mode=contains + exclude_exact=true                            | 保留 partial 联想，完全同名不返回                                               | P0     |
| 5   | Rust contract               | V2 wire/OpenAPI               | related-search schema                                               | 返回 dialects、pos_labels、senses、total、next_cursor；权威 OpenAPI 同步可检查  | P0     |
| 6   | Rust service/integration    | 保存目标校验                  | target_word_id + target_sense_id 指向非当前 publication 或错配      | 保存拒绝；有效当前 publication 通过                                             | P0     |
| 7   | 前端 api-client             | legacy gate-off               | rollout gate 默认关闭                                               | 只发 q-only 旧请求并读取旧 `{results}`                                          | P0     |
| 8   | 前端 api-client/Query       | V2 双查询分页                 | gate-on、同一 q/kind                                                | exact 与 contains 独立请求；contains 带 exclude_exact；两组均可加载并累积全部页 | P0     |
| 9   | 前端 Query/组件             | q/kind 改变与晚响应           | 旧请求晚于新请求返回                                                | 清旧页，旧响应不混入新结果                                                      | P0     |
| 10  | 前端组件                    | 两个同名 workspace 消歧       | 两条不同 word_id、sense_id、kind/dialect/POS/gloss                  | exact 置顶、两条均显示；option value 为 word_id                                 | P0     |
| 11  | 前端组件/保存               | 明确选择第二个同名词条及词义  | 选择第二条及其第二个 sense                                          | 保存第二条 target_word_id + target_sense_id，不取第一条                         | P0     |
| 12  | 前端组件                    | V2 缺分页字段                 | gate-on 但响应仍是旧 wire                                           | 不显示“已取全”语义，安全降级/提示                                               | P0     |
| 13  | Mock/E2E                    | 双 workspace fixture 关键路径 | mock 数据源含两个同名 publication                                   | 浏览器路径可选择第二条并提交准确 ID；mock 仅作补充证据                          | P1     |
| 14  | 真实联调                    | Rust + DB + Admin             | B9 smoke 后临时开 gate                                              | exact 跨页、contains、第二条保存真实通过；完成前 gate 保持关闭                  | 手测   |
| 15  | 前端 Query                  | 双查询真实分页与 key 隔离     | exact 两页、contains 一页；随后切换 q/kind 且旧响应晚到             | 请求参数准确、exact 累积两页；新 key 不混入旧页或晚响应                         | P0     |
| 16  | 前端组件                    | exact 查询失败                | exact 失败、contains 成功或失败                                     | 不把失败显示为“无匹配”；明确警告结果不完整并支持重试                            | P0     |
| 17  | Rust handler/OpenAPI        | V2 终页与空查询 wire          | 终页；空 q + page_size                                              | `total` 始终存在，`next_cursor` 字段存在且为 null；legacy q-only 仍只含 results | P0     |
| 18  | Rust integration            | 规范化 exact 与稳定重放       | NFKC 等价 q；首页后更新未读目标 draft；同 cursor 请求两次           | exact 命中规范化等价词；不漏页、不 panic，同 cursor 返回一致                    | P0     |
| 19  | Rust integration            | 目标集合并发变化使游标失效    | 首页后发布、归档或恢复任一关系目标                                  | 旧签名 cursor 返回 400，要求重启搜索，不静默插入/漏掉跨页结果                   | P0     |
| 20  | 前端组件                    | contains 查询失败             | exact 成功但 contains 失败                                          | 不冒充“未找到”；明确提示相关联想不完整并可单独重试                              | P0     |
| 21  | 前端 OpenAPI 契约           | V2 query 参数漂移             | Rust spec 的 q/kind/match_mode/exclude_exact/page_size/limit/cursor | 精简快照保留名称、类型、范围/default，契约测试逐项锁定                          | P0     |
| 22  | Rust 集成/安全              | cursor 上下文绑定             | 换 actor、q、kind 重放同一 cursor                                   | 均返回 400 cursor，不读取或混入结果                                             | P0     |
| 23  | 前端组件                    | contains 多页入口             | contains 返回 next_cursor                                           | 显示“加载更多相关联想”，点击仅拉取 contains 下一页                              | P0     |

## 边界说明

- 不覆盖 SmartDictionary 列表排序、Create、Forms、Publish/Restore、surface warning、学习端、多 publication gate 或迁移。
- P0 用例全部需要自动化；真实联调不能由 mock 替代。
