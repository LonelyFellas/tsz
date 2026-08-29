# 未入库关联词预定义词义：测试矩阵

| ID     | 层级             | 场景                    | 输入/前置                                 | 预期                                                                                                         | 优先级 |
| ------ | ---------------- | ----------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| PRG-01 | Rust unit        | pending 无 gloss 兼容   | 仅 `pending_target_headword`              | 合法；物化默认中文释义为空                                                                                   | P0     |
| PRG-02 | Rust unit        | pending 带 gloss        | 合法英文词面 + 中文 gloss                 | 合法；trim 后保留正文                                                                                        | P0     |
| PRG-03 | Rust unit        | 非法形态                | bound IDs + 任一 pending 字段；孤立 gloss | `validation_failed`，field 精确定位                                                                          | P0     |
| PRG-04 | Rust unit        | 文本边界                | 5000/5001 码点、NUL、纯空白               | 5000 通过；其余按规则缺失或拒绝                                                                              | P0     |
| PRG-05 | Rust unit        | 同词面 gloss 冲突       | 两 relation 同 headword、不同非空 gloss   | `relation_pending_gloss_conflict`，不物化                                                                    | P0     |
| PRG-06 | Rust integration | 保存刷新                | pending headword + gloss                  | PUT/GET 与关系表/JSON 投影逐字 round-trip                                                                    | P0     |
| PRG-07 | Rust integration | 发布物化                | 目标不存在                                | 创建 stub；默认 A1 zh_definition 等于 gloss；relation 回填稳定 IDs                                           | P0     |
| PRG-08 | Rust integration | 旧客户端兼容            | 无新字段的历史请求                        | 保存、校验、发布行为不变                                                                                     | P0     |
| PRG-09 | Rust integration | 同名目标已存在          | pending 带 gloss，锁内发现目标            | 不覆盖、不吞文本；返回 `relation_pending_gloss_target_exists`                                                | P0     |
| PRG-10 | Rust integration | 并发同名发布            | 两源词同时物化同一 headword               | 唯一目标；gloss 一致则稳定绑定，冲突则一方结构化失败                                                         | P0     |
| PRG-11 | OpenAPI/contract | V2/V3 read/write schema | 生成 OpenAPI                              | 四类 relation DTO 均含 optional snake_case 字段                                                              | P0     |
| PRG-12 | Frontend unit    | canonical -> writable   | GET 含 gloss                              | model 保留字段，不带只读 snapshot                                                                            | P0     |
| PRG-13 | Frontend unit    | 请求互斥                | bound / pending                           | bound 清 pending；pending 清 target IDs；空白 gloss 省略                                                     | P0     |
| PRG-14 | Component        | pending 输入            | 合法未入库词面                            | 第三列由具体词义下拉切换为单行“预定义词义（可选）”输入；不新增下一行组件；编辑只改 gloss，relation UUID 不变 | P0     |
| PRG-15 | Component        | 绑定已有词义            | pending 行选择搜索结果与 sense            | 两个 pending 字段清除，target IDs 落定                                                                       | P0     |
| PRG-16 | Component        | 错误显示                | 超长、后端冲突 issue                      | 行内错误且 issue navigation 定位到 gloss                                                                     | P0     |
| PRG-17 | Preview/history  | pending 展示            | gloss 有/无                               | 仅 pending 行产品化展示；不显示 raw 字段名/UUID                                                              | P0     |
| PRG-18 | Real API/manual  | 保存与物化验收          | localhost 真实未入库词面 + gloss          | 保存刷新保留；发布后目标草稿正文 read-back 正确；console error 0                                             | 必验收 |

## 执行顺序

1. 后端 DTO/validation/migration 失败回归。
2. 后端持久化与物化失败回归。
3. 生成 OpenAPI；同步前端类型/runtime schema。
4. 前端 model/component/preview 失败回归与实现。
5. Rust/前端全覆盖率、typecheck、lint、build、diff-check。
6. localhost 真 API 手测，不提交、推送或部署。
