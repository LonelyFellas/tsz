# 本地实现与验收记录

日期：2026-10-09。代码已实现，真实浏览器验收等待隔离环境恢复。未提交、推送、创建 PR、合并或部署。

## 版本与范围

- 前端：`/Users/darwish/.codex/worktrees/81a3/tsz`，`codex/spelling-pronunciation-assessment`，基线 `7b0f0e53009044e21eccb90851602cddfe3d7982` 加本任务工作区差异。
- 后端：`/Users/darwish/.codex/worktrees/spelling-pronunciation/tsz-rust`，`codex/spelling-pronunciation-markup`，基线 `3ef1ea9ba6694139abfe40f375c88823444cb1ca` 加本任务工作区差异。
- 新增 `spelling_rich?: RichTextV2V3`，保留纯文本拼写；actual_pron_rich 不改契约。无需数据库 migration。
- 复用主线斜体/连读/清除算法。C 端 DTO 和公共词单展示未扩展。
- 两份生成契约来自上述后端工作树 OpenAPI，源 SHA256 为 `e66eea2d21da60ec2538fc1e9178583abe9c3386a6d9776bb4997db5199ba5ad`；哈希和 source 路径已核对。

## 已取得的证据

| 检查                                                                                  | 结果                                                                                                                         |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                                      | 全仓通过；最新后台变动另跑 admin typecheck 通过                                                                              |
| `pnpm lint`                                                                           | 全仓通过，无错误；保留既有 captureSession 和 Next 跳转提示，不做无关修复                                                     |
| `pnpm --filter @tsz/voice-editor test`                                                | 22 文件、334 项通过                                                                                                          |
| `pnpm --filter @tsz/api-client test`                                                  | 20 文件、502 项通过，含新字段 optional/V2/nonnullable/错误码契约                                                             |
| 后台 operations、V3FormsAndPronunciationStep、V3VoiceTextField 定向回归               | 3 文件、157 项通过                                                                                                           |
| 后台 model、V3ReviewContent、保存相关测试                                             | 完整回归中通过，涵盖 wire 保留、非法 rich、预览和保存机制                                                                    |
| 最新 `pnpm --filter @tsz/admin build`                                                 | TypeScript 与生产 Vite 构建通过；明确启用 voice editor，关闭 TTS mock/preview                                                |
| `cargo fmt --all --check`                                                             | 通过                                                                                                                         |
| `cargo clippy --locked --all-features --all-targets -- -D warnings`                   | 最新后端变动通过                                                                                                             |
| `cargo test --locked --all-features --lib lexicon::v3_contract`                       | 31 项通过，含字段校验及英美 canonical 注解比较                                                                               |
| `cargo test --locked --all-features --lib lexicon::rich_text`                         | 15 项通过                                                                                                                    |
| `cargo test --locked --all-features --lib lexicon::service::v3::tests::spelling_rich` | 2 项通过，含缺省保留、显式空清除及规范化不改错误偏移                                                                         |
| `cargo test --locked --all-features --test lexicon_handler v3_spelling_rich_`         | 暂停前在本任务隔离 PG/Redis 上 2 项通过：真实保存/独立 GET/省略保留/改字清空/非法请求不写库，以及发布/历史/回滚/草稿不被覆盖 |
| 原生 Vitest inventory                                                                 | 两个新增测试文件被正常收录；后端测试沿用已有 lexicon_handler target                                                          |
| 独立审查与增量复核                                                                    | 三项发现已修并补回归；再次完成受非阻断提示测试保护；增量复核无新增确定性问题                                                 |

前端完整回归先以四个 worker 运行。首次 3520 项通过、2 项失败；这两处已修正且定向通过。修正后第二次完整回归 3523 项通过、1 项失败、2 项跳过，失败为未改文件 `UnifiedCreateEntryStep.test.tsx` 的创建确认用例；该文件随后单独复验 56 项全部通过。随后以两个 worker 重跑完整范围，245 文件全部通过，3524 项通过、2 项既有跳过。未改动该创建页或弱化断言，前述失败记录保留。

后端曾额外运行完整 `--lib`：317 项通过、18 项因恢复后的数据库/Redis连接失效失败；公共词单 handler 也因 `PoolTimedOut` 未能执行目标行为。不能把这些环境失败写成通过，也不修改断言掩盖。

## 需求覆盖

| 需求                                              | 证据与边界                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 选区、两种连读、多字符端点、半条不可完成、只读    | SpellingMode 与既有 VoiceEditor 组件回归                                                          |
| 拼写斜体、与连读共存、清除保留正文/斜体、撤销重做 | 新增编辑器交互回归及既有斜体/清除测试                                                             |
| 普通输入与规范化                                  | 尾空格中间态保留；失焦/完成时规范化；逐段迁移、不丢未改词、历史可撤销；提示不阻断再次完成         |
| 取消、完成、dirty、收起回显与开关关闭             | V3VoiceTextField 回归；实际服务器保存仍走向导保存动作                                             |
| common / uk / us 与英美统一拆合                   | 模型/wire 与 operations 测试；后端 common 契约、uk/us 真实 handler；等价注解 canonical 比较       |
| 省略保留、显式空清除、改字不留旧偏移              | 后端 service 单元与真实 handler；前端 wire 明确保留                                               |
| 刷新、发布、历史、回滚                            | 独立 GET 与发布历史 handler 通过；实际浏览器刷新链路尚未验证                                      |
| strict/nonnullable/V2 与旧记录                    | API-client 契约与后端解码测试，未知字段保持拒绝                                                   |
| 纯格式保持节点与正文事实                          | operations 保留节点，handler 验证拼写/ID/meanings/completed_steps 不变；修订/确认摘要仍遵循原规则 |
| C 端不扩字段                                      | 公共 DTO/projection diff 无变化；公共词单 handler 的实际响应复验尚缺环境                          |

## 环境与未完成项

本任务容器为 `tsz-spelling-pronunciation-pg`（PG16）、`tsz-spelling-pronunciation-redis`（Redis7），仅 loopback 动态端口；连接和临时 seed 凭据保存在权限受限的 `/tmp/tsz-spelling-pronunciation/`，报告不包含凭据。
暂停时仅停止本任务容器；恢复时启动请求返回成功，但其后 Docker API 查询超时、数据库/Redis 原端口不可达，不能继续沿用历史端口。主机磁盘一度约 2 GB，现约 25 GB；未确认磁盘与 Docker 故障的因果关系。

生产 admin 预览进程曾在 `127.0.0.1:13001` 启动，现已停止本任务预览；隔离后端预定 `127.0.0.1:18383`，seed 和 API 因数据库池超时未成功启动，未建立登录或浏览器保存链路。
没有重启 Docker Desktop，也未接管/停止其他任务服务或写入共享业务数据库。全局 Docker 恢复需要用户处理，已在当前聊天异步询问。

环境恢复后须重新核实实际容器端口，更新本任务受保护配置，构建最新后端、seed 本任务账号并启动。然后以最新 admin 生产构建通过同源代理完成登录 → 拼写斜体/连读与实际发音连读 → 保存 → 独立 GET → 刷新重开 → 发布预览，补截图与网络证据；同时复验公共词单投影及必要的 handler。完成后只清理本任务拥有的资源。

## 发布限制

旧 strict runtime schema 未声明新字段，而三种新 variant 的字段可选且直接引用 V2，已用固定主线 schema 和生成物核对。需要兼容读取 → 后端支持 → 开放编辑的发布顺序；已有 rich 数据后不能直接回退不认识字段的旧 API。当前未验证线上 manifest，不指定实际发布版本。

## 2026-10-10：审查问题修复

审查指出同一条连读的端宽省略值与显式值 1 被错误判为不同。新增回归先复现：core 比较返回 false，英美组切换统一拼写返回失败；字段顺序变化同样被错误判为不等价。

仅在 `spellingAnnotationsEqual` 的比较输入中统一连读默认端宽，并固定连读/斜体的字段顺序，再复用现有排序、合并及去重。原始正文和标注未修改，不改变 wire 读写或全局规范化行为。不同的实际多字符端宽仍判为不等价。

修复后 core 的 3 项测试、后台 operations/model 的 76 项回归通过；包含实际规则合并与直接统一拼写路径。voice-editor/admin 类型检查、voice-editor lint、改动测试文件 eslint、Prettier 与 diff 空白检查通过。修复后完整前端回归以两个 worker 执行：245 个文件全部通过，3527 项通过、2 项既有跳过；本次没有新增跳过或弱化断言。

本次修复后的后台生产构建通过，沿用既定验收构建开关（voice editor 开启，TTS mock/preview 关闭）。未提交、推送或部署。
