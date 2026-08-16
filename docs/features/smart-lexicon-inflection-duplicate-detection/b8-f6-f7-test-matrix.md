# B8 / F6 / F7 测试用例矩阵

依据已评审的 `requirements.md`、`design.md` 与 `tasks.md`。P0 必须自动化；真实数据库并发与前后端联调另列集成/E2E，不用 mock 结果替代。

| #     | 层        | 场景                                     | 输入 / 前置                                                          | 预期                                                                                                    | 优先级              |
| ----- | --------- | ---------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------- |
| B8-01 | Rust 集成 | 首条公开 0→1                             | gate-off；scope 无 active；publish/带 publication restore/activation | 命令成功；`new_ids={target}`、`after.size=1`                                                            | P0                  |
| B8-02 | Rust 集成 | 第二条公开 1→2                           | gate-off；scope 已有另一 active                                      | 原子 409 `multiple_active_exact_headword_publications_not_enabled`；disabled snapshot 可分页且无 token  | P0                  |
| B8-03 | Rust 集成 | 批量恢复 0→2                             | gate-off；同 scope 两个 archived current publications                | 整批原子失败，无一条恢复                                                                                | P0                  |
| B8-04 | Rust 集成 | 已公开 entry 发布新 revision             | target 已在 `before_active_ids`                                      | `new_ids` 为空并成功，不误判新增 active entry                                                           | P0                  |
| B8-05 | Rust 集成 | 不增加 active set 的 lifecycle           | archive、无 current publication 的 restore、集合缩减                 | 不因普通同形阻断                                                                                        | P0                  |
| B8-06 | Rust 集成 | gate-on visibility-only                  | 1→2；普通 warning 已有可复用证据                                     | 返回命令级 visibility snapshot；终页 token 绑定 command、epoch、完整 active set                         | P0                  |
| B8-07 | Rust 集成 | gate-on ordinary-only                    | 无 visibility 转换但仍有未确认 surface warning                       | snapshot 仅含 ordinary reason；确认后原子成功                                                           | P0                  |
| B8-08 | Rust 集成 | gate-on composite                        | visibility 与未确认普通 warning 同时存在，含重叠 item                | 单 snapshot/token；items 去重；准确标注 visibility-only、ordinary-only、双 reason；digest 含 membership | P0                  |
| B8-09 | Rust 集成 | 命令绑定                                 | publish token 用于 restore/activation/batch 或不同 selection         | 稳定 409，不能跨命令/目标复用                                                                           | P0                  |
| B8-10 | Rust 集成 | epoch 变化                               | 签 token 后推进 visibility policy epoch                              | 锁内稳定 409 `surface_policy_changed` 并返回当前策略                                                    | P0                  |
| B8-11 | Rust 集成 | active set / match / membership 并发变化 | 签 token 后并发 publish/archive/forms 改变集合或 reason membership   | 锁后复查失败，返回新 composite 首页并要求重新确认                                                       | P0                  |
| B8-12 | Rust 集成 | snapshot 过期                            | 过期 cursor/token                                                    | 稳定 410；业务状态不变                                                                                  | P0                  |
| B8-13 | Rust 集成 | Idempotency-Key                          | 成功重放、已知 409 后换 key、传输未知重试复用 key                    | 成功只执行一次；旧策略失败不永久粘住新尝试                                                              | P0                  |
| B8-14 | Rust 集成 | 多 scope / batch 完整计算                | 一个命令涉及多个 dialect scope，至少一个违规                         | 每 scope 完整 before/after/new；任一违规则整命令原子失败                                                | P0                  |
| B8-15 | OpenAPI   | 权威契约                                 | publish/restore/batch/activation 与 snapshot page                    | snake_case schema、稳定 codes、Idempotency-Key、token/epoch/selection 完整描述                          | P0                  |
| F6-01 | 组件      | 0→1 发布                                 | publish 成功                                                         | 成功态刷新；不弹 visibility 确认                                                                        | P0                  |
| F6-02 | 组件      | gate-off 1→2                             | 409 capability + disabled page                                       | 显示“学习端暂不支持多个同名公开词条”；可翻页查看；无继续按钮，普通 token 不绕过                         | P0                  |
| F6-03 | 组件      | gate-on visibility-only                  | 409 + 可继续终页                                                     | 展示公开可见性组；加载完全部页后用单 token + 当前 epoch 重试                                            | P0                  |
| F6-04 | 组件      | ordinary-only / composite                | 分别返回单 reason 与三类 membership                                  | 分组准确，重叠 item 不重复；只提交一个 composite token                                                  | P0                  |
| F6-05 | 组件      | policy / match / snapshot 变化           | 409/410 稳定 code + 新首页/当前 epoch                                | 保留页面和草稿状态；清旧 token；重新分页确认；新业务尝试换 Idempotency-Key                              | P0                  |
| F6-06 | 组件      | 网络结果未知                             | fetch 失败且未知是否成功                                             | 同一次传输重试复用 key；避免重复 publish                                                                | P0                  |
| F6-07 | E2E       | 发布纵切                                 | mock 仅验证浏览器交互；真后端另验                                    | 0→1、disabled、composite 主流程键盘可操作且信息可读                                                     | P1                  |
| F7-01 | 单元/组件 | 单条 restore 按 ID                       | 从详情入口恢复 archived word                                         | 先 GET 最新 entry；请求使用 `word_id` 与最新 `lifecycle_revision`                                       | P0                  |
| F7-02 | 单元/组件 | 带 current publication 的 0→1 / 1→2      | gate-off/on                                                          | 与 publish 相同 visibility 状态机；失败保留 archived 与选择状态                                         | P0                  |
| F7-03 | 单元/组件 | 无 current publication restore           | archived draft                                                       | 不因同形普通 lifecycle 自动阻断；按 ID 成功                                                             | P0                  |
| F7-04 | 单元/组件 | batch 0→2                                | 完整 selection 两条同名 archived entries                             | token 绑定排序后的完整 selection；gate-off 原子失败且全选保留                                           | P0                  |
| F7-05 | 单元/组件 | batch selection 改变                     | 取得 token 后增删选择                                                | 清除旧 snapshot/token/key；重新请求，不可部分复用                                                       | P0                  |
| F7-06 | 单元/组件 | composite / disabled / 过期 / 并发       | 稳定 visibility/surface codes                                        | 分组准确；错误不泛化为“草稿版本已更新”；失败保态并可重试                                                | P0                  |
| F7-07 | API 契约  | 单条/批量 restore                        | OpenAPI 权威 schema                                                  | 路径、方法、header、snake_case body/response 一致                                                       | P0                  |
| F7-08 | E2E       | SmartDictionary/Wizard restore           | F8/F9 共享列表/回看基线已合并                                        | 单条与批量按 ID；0→1/1→2/0→2、失败保态完整覆盖                                                          | P1（被 F8/F9 阻塞） |
| J-01  | 真联调    | B8↔F6                                    | 本地 PostgreSQL + gate-off/on 受控配置                               | 真实 0→1、1→2、composite、epoch/并发结果与 UI 一致；结束后 gate 恢复关闭                                | P0                  |
| J-02  | 真联调    | B8↔F7                                    | F8/F9 合并后，本地 PostgreSQL                                        | 单条/批量 restore 真实纵切通过；不以 mock 代验                                                          | P0（被 F8/F9 阻塞） |

## 手测清单

- [ ] disabled 页逐页读完仍不出现确认入口，文案明确是学习端能力限制。
- [ ] composite 三组标题、数量、同一 entry 去重与详情跳转均正确。
- [ ] 409/410 后表单、当前步骤、单条目标和 batch selection 均保持。
- [ ] gate-on 联调结束后确认 `allow_multiple_active_exact_headword_publications=false`，未推进生产 epoch。
