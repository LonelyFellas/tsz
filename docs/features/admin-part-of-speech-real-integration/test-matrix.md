# 管理后台词性配置真实后端对接测试用例矩阵

## 自动化用例

|   # | 层   | 场景                              | 输入 / 前置                                                           | 预期                                                                                  | 优先级                 |
| --: | ---- | --------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------- |
|   1 | 契约 | 9 个词性端点已进入 OpenAPI        | 从 `tsz-rust/docs/openapi.json` 同步快照                              | catalog、基本列表/CRUD、细分列表/CRUD 的方法和路径全部命中 spec，PENDING 不再包含它们 | P0                     |
|   2 | 单元 | 基本词性 DELETE 编码 revision     | `remove(id, { base_revision: 4 })`                                    | 发出 `DELETE /settings/parts-of-speech/{id}?base_revision=4`，无 request body         | P0                     |
|   3 | 单元 | 细分词性 DELETE 编码 revision     | `removeSubPart(partId, subId, { base_revision: 7 })`                  | 发出带 `base_revision=7` 的子路径 DELETE                                              | P0                     |
|   4 | 单元 | 其余 7 个接口保持 wire            | 搜索/分页、创建和 PATCH 输入                                          | 方法、路径、query/body 与 OpenAPI 一致，snake_case 不转换                             | P0                     |
|   5 | 单元 | 204 空响应                        | fetch 返回 204、空 body                                               | DELETE 解析为 `undefined`，不抛 JSON 解析错误                                         | P0                     |
|   6 | 单元 | RFC 9457 通用 meta                | Problem body 含 `usage_count/current_revision/part_of_speech_id/code` | `HttpError.meta` 与 `HttpError.problem.meta` 得到同一合法 wire 内容                   | P0                     |
|   7 | 单元 | 保留词条错误 meta                 | Problem body 含 `word_id/max_reachable_step/affected_node_ids`        | 现有词条错误上下文继续解析，兼容别名不破坏调用方                                      | P0                     |
|   8 | 单元 | 畸形 meta 降级                    | 负 usage、空 id、非法 step 或混合非法字段                             | meta 不进入业务分支，Problem 其余字段仍按既有规则解析                                 | P0                     |
|   9 | 单元 | 新环境开关默认值                  | 未配置词性 mock；分别模拟开发/生产                                    | 开发默认 mock，生产默认真实                                                           | P0                     |
|  10 | 单元 | 新环境开关严格解析                | `true/false` 与模糊值                                                 | 仅接受显式布尔值；模糊值 fail-fast                                                    | P0                     |
|  11 | 单元 | production mock 防泄漏            | production 开启词性 mock                                              | 普通 production 构建拒绝；test mode 显式开启允许                                      | P0                     |
|  12 | 单元 | 全真实数据源                      | words mock=false、POS mock=false                                      | 两组 facade 都委派真实源，mock chunk 不加载                                           | P0                     |
|  13 | 单元 | 全 mock 数据源                    | words mock=true、POS mock=true                                        | 两组 facade 复用同一个 lazy mock runtime                                              | P0                     |
|  14 | 单元 | 单词 mock + 词性真实              | words mock=true、POS mock=false                                       | words 委派 mock，catalog/配置全部委派真实源                                           | P0                     |
|  15 | 单元 | 单词真实 + 词性 mock              | words mock=false、POS mock=true                                       | words 委派真实源，词性委派 mock；只加载一次 mock runtime                              | P0                     |
|  16 | 单元 | 登出清理 mock                     | 任一 mock 开启后 profile 从非空变 null                                | 清理当前 mock session 并释放 lazy runtime；全真实不订阅                               | P0                     |
|  17 | 单元 | mock 基本删除 revision 成功       | 未引用记录，revision 相等                                             | 删除成功、catalog_version 增加、级联移除子项                                          | P0                     |
|  18 | 单元 | mock 基本删除 revision 冲突       | `base_revision` 过期                                                  | 先返回 409 `revision_conflict` + `current_revision`，记录不删除                       | P0                     |
|  19 | 单元 | mock 基本删除引用保护             | revision 相等但 usage > 0                                             | 返回 409 `part_of_speech_in_use` + optional usage_count                               | P0                     |
|  20 | 单元 | mock 细分删除 revision / 引用保护 | 过期 revision；或当前项被引用                                         | 分别返回 `revision_conflict`、`sub_part_of_speech_in_use`，记录不删除                 | P0                     |
|  21 | 单元 | mock 稳定错误码对齐               | 非法字段、重复细分、缺失父/子项                                       | 分别返回 `invalid_part_of_speech`、`sub_part_of_speech_conflict`、对应 `*_not_found`  | P0                     |
|  22 | 单元 | 全 mock 严格 catalog 校验         | 保存内部 catalog 不存在的基本/细分编码                                | 返回 `unknown_part_of_speech` / `invalid_sub_part_of_speech`                          | P0                     |
|  23 | 单元 | 混合模式接受真实 catalog 编码     | words mock + POS real；保存内部 seed 不存在但 UI 已选的编码           | mock 保存不被内部 seed 二次否决                                                       | P0                     |
|  24 | 集成 | 基本删除 hook 透传 revision       | `{ id, base_revision }`                                               | data source 收到完整参数；成功失效词性根 query                                        | P0                     |
|  25 | 集成 | 细分删除 hook 透传 revision       | `{ partId, subId, base_revision }`                                    | data source 收到完整参数；成功失效词性根 query                                        | P0                     |
|  26 | 集成 | 基本删除 UI 使用行 revision       | 未引用行 revision=1，确认删除                                         | mutation 收到 id + revision，成功提示                                                 | P0                     |
|  27 | 集成 | 细分删除 UI 使用行 revision       | 未引用子项 revision=1，确认删除                                       | mutation 收到父子 id + revision，成功提示                                             | P0                     |
|  28 | 集成 | 稳定错误提示                      | 基本/细分冲突、not found、revision conflict、in-use                   | 显示对应中文提示；删除失败重取最新列表                                                | P0                     |
|  29 | 回归 | catalog 共享与失败降级            | catalog 成功 / 失败                                                   | 列表、legacy 编辑器、V2 向导仍共用目录；失败时显示 code 并禁用新增选择                | P0                     |
|  30 | 构建 | tshb-test 混合配置                | admin `build --mode test`                                             | words mock 保留，POS mock 明确关闭，构建成功                                          | P0                     |
|  31 | e2e  | 超管完整词性 CRUD                 | 具备稳定的真实后端与可隔离测试数据                                    | 基本/细分创建、修改、删除及刷新持久化闭环                                             | P1（由真后端手测承接） |

## 手测清单 — tshb-test / tsz-rust

- [ ] 无 token 请求 catalog → 预期 401，证明 nginx 与后端路由存在。
- [ ] 普通 admin 登录后读取 catalog → 预期 200；直接访问配置页仍显示无权限，管理接口返回 403。
- [ ] super_admin 搜索、分页基本词性 → 预期参数和分页总数正确。
- [ ] 新建基本词性，再刷新浏览器 → 预期配置持久存在，并进入词库列表筛选、旧版编辑器和 V2 向导的选择项。
- [ ] 修改基本词性和细分词性 → 预期展示字段更新、稳定编码只读、revision 递增。
- [ ] 删除无引用基本/细分词性 → 预期 204，页面与 catalog 同步移除。
- [ ] 两个会话同时编辑同一配置 → 后提交的旧 revision 得到 409，页面提示刷新后重试且不会覆盖数据。
- [ ] 删除被真实数据引用的配置 → 得到对应 `*_in_use`，数据保留；响应无 `meta.usage_count` 时页面也正常。
- [ ] tshb-test 中新增一个非 seed 词性，进入 mock 单词流程选择并保存 → 不被浏览器内部 fixture 判为未知编码。
- [ ] catalog 人为不可用时打开历史词条 → 以 code 降级显示，新增词性/细分选择禁用，已有内容不丢失。

## 完成口径

- 所有 P0 行必须有对应自动化测试并通过。
- P1 真后端路径在合入前至少完成手测；无法安全制造真实引用或并发数据时，在 PR 中记录未执行项与原因。
- 最终通过 `pnpm test:cov`、`pnpm typecheck`、`pnpm lint` 和 admin test mode 构建，不降低覆盖率门槛。

## 本次执行记录（2026-08-11）

- P0 自动化全部通过：全仓 109 个测试文件、1165 个用例，覆盖率门槛通过；类型检查与 lint 通过。
- admin 普通 production 构建通过，产物不包含 `adminWordsMock` 分包；tshb-test 的 test mode 混合构建通过，保留 words mock 且 `VITE_ADMIN_PART_OF_SPEECH_MOCK=false`。
- tshb-test 的 nginx 与 tsz-rust 服务均正常；无 token 请求 catalog 和管理列表均由后端返回标准 401 `invalid_token`，证明真实路由与反代已连通。
- 在 tsz-rust 本地真 PostgreSQL 上执行 `cargo test --test catalog_handler`，3 个集成测试全部通过，覆盖权限、基本/细分生命周期、revision conflict、204、查询与路径错误契约。
- tshb-test 登录态 UI 手测尚未执行：本 feature 分支按约定不直接部署，需合入 main 并完成 deploy 后再用真实 super_admin 会话验证页面与业务联动。
