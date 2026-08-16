# B6+B9/F9 测试用例矩阵

| #   | 层                  | 场景                                | 输入/前置                                                       | 预期                                                                                                     | 优先级  |
| --- | ------------------- | ----------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Rust 单元           | warning 审计摘要序列化              | 超过 preview 上限的确认结果                                     | 保留 `total`、digest、`acknowledged=true`、最多 5 项 preview、`truncated=true`；普通响应无完整 match IDs | P0      |
| 2   | Rust 单元/集成      | preview 消歧上下文                  | 同 headword、不同 kind/方言/POS/gloss/status 的命中             | 每项按精确 `existing_word_id` 返回必要上下文                                                             | P0      |
| 3   | Rust 集成           | legacy/clear/nullable evidence 兼容 | 旧 clear snapshot、nullable dictionary evidence、旧幂等成功响应 | 均可读取或逐字节语义重放，不被 warning 新字段破坏                                                        | P0      |
| 4   | Rust 集成           | 列表稳定排序                        | 两条 `created_at` 相同的同名 entry                              | 两条均返回；主排序后按 `id DESC`，分页不丢失/重复                                                        | P0      |
| 5   | Admin 组件          | 同名双行与消歧                      | 两条 `workspace` fixture，ID/status/kind/方言/POS/gloss 不同    | 两行同时存在并显示短 ID 与上下文，不按 headword 去重                                                     | P0      |
| 6   | Admin 组件          | 逐 ID 查看和归档入口                | 点击两条同名行各自操作                                          | 路由和 mutation 分别收到对应 `word_id`                                                                   | P0      |
| 7   | Admin 组件          | warning snapshot 回看               | 已确认、total 大于 preview、truncated=true                      | 展示总数、已确认、有限预览和截断提示；链接使用 preview 的 `existing_word_id`                             | P0      |
| 8   | Admin 组件          | clear/legacy snapshot 回看          | clear、旧 nullable evidence                                     | 兼容展示且不报错，不伪造 warning                                                                         | P0      |
| 9   | Playwright mock E2E | 同名列表纵向链路                    | 管理端 mock 返回两条 workspace                                  | 两条可辨认；查看/归档入口命中各自 ID；snapshot 链接命中记录 ID                                           | P1      |
| 10  | 真实联调            | B6+B9/F9 纵向链路                   | 精确 Rust/Admin SHA、真实 DB/Redis、允许创建同名 draft          | 两个不同 ID 同时列出并可逐 ID 操作；第二条详情可回看真实确认摘要                                         | 手测/J2 |

## 边界

- F9 不实现 restore/visibility 确认状态机，只保留现有恢复入口的精确 ID 传递。
- 不实现 related-search、Forms、Publish、学习端或生产迁移。
- mock/E2E 仅证明前端行为；第 10 项必须单独记录真实接口、数据库和浏览器证据。
