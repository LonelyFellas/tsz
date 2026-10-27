# 禅道 #153：词条列表名称与表头调整

任务：[禅道 #153](http://47.121.142.19/zentao/index.php?m=task&f=view&taskID=153)。本记录保存本地实施、测试和真实联调证据；后续 PR、CI 与合并状态以 GitHub 为准。尚未部署。

## 实现与契约

- “名称”改为“词条名称”，“释义”改为“常见释义”，删除方言列；释义内容仍使用现有 `gloss`。
- 后端从当前原形生成 `name_variants: [{ text, dialects }]`。名称去重，通用在前、英式在美式之前；相同英美拼写合并一行双点，通用拼写不加点。拼写通用而发音区分时仍不加点。
- 当前原形全部为空时沿用初始名称回退；缺少确定的方言规则时保留名称，不猜方言。
- `GET /api/v1/admin/lexicon/entries` 只有 `include_name_variants=true` 时返回新字段；缺省或 false 时完全省略。新管理端允许字段缺省并回退 `presentation.label`。
- 新字段只扩展列表响应，不改共享 presentation、写入格式或数据库结构。无新增迁移。
- 智能词库与垃圾桶共用组件，两个入口均应用调整；保留标注上标与原有行操作。

## 版本与真实环境

- 前端：`/Users/darwish/Dev/tsz-core/.worktrees/frontend/task-153-entry-list`，分支 `codex/task-153-entry-list`，基线 `72741dae` 加本次未提交差异。
- 后端：`/Users/darwish/Dev/tsz-core/.worktrees/backend/task-153-entry-list`，同名任务分支，基线 `d0c6435` 加本次未提交差异。
- OpenAPI 来源为上述后端 `docs/openapi.json`，SHA-256：`3fbefc8a73a890a7ff7ffd54c45cd9293fb1c14714c0d180149e48bed0b9bf38`。通过原生导出和显式 `OPENAPI_SOURCE` 同步；生成 bundle 的输入哈希已独立核对。
- 浏览器 Chromium；admin `127.0.0.1:3153` 经同源代理访问 API `127.0.0.1:8453`。后端由本任务构建后复制固定的最终二进制启动。
- PostgreSQL 16 使用任务专用 cluster、端口 55453、数据库 `tsz_task153`；Redis 使用任务专用实例、端口 56453，服务 DB 0、测试 DB 1。未使用共享环境数据。
- 浏览器没有 route mock；词库、词性和 TTS mock 开关均为 false。本次未生成语音、上传文件或使用外部对象存储。

## 已验证

| 层次             | 结果                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 前端全仓普通测试 | `pnpm test --maxWorkers=2`：308 文件、4402 用例通过；随后移除方言列专属孤儿 helper 及其测试，受影响 3 文件 69 用例复验通过                       |
| 请求与响应契约   | 最终生成物及名称 schema 白名单补齐后，4 文件 308 用例通过，含布尔 query 序列化、新字段缺省/非法值及严格校验                                      |
| 全仓类型与 lint  | `pnpm typecheck`、`pnpm lint` 全部通过；最后修改为生成快照白名单，未改变业务类型                                                                 |
| 管理端构建       | `pnpm --filter @tsz/admin build` 通过                                                                                                            |
| 后端静态检查     | `cargo fmt --check`、`SQLX_OFFLINE=true cargo clippy --all-targets --all-features -- -D warnings` 通过                                           |
| 后端单测         | 最终 `cargo test --lib`：447 用例通过，显式传入任务 PostgreSQL/Redis                                                                             |
| 后端词库集成     | 完整 `cargo test --test lexicon_handler`：176 用例通过；共享内容规则修正后，列表三种拼写/音标组合的真实数据库集成用例再次通过                    |
| 实际响应兼容     | 新 API 缺省响应通过旧 reader；新 reader 同时接受缺省响应和 opt-in 响应；旧 reader 拒绝 opt-in 新字段，证明按请求返回字段的必要性                 |
| 真实浏览器链路   | 登录 → 列表 → 打开词形内容 → 语音编辑器把美式 `cozy` 改为 `cozier` → 应用草稿 → 保存 → 独立 GET → 返回列表 → 刷新 → 归档 → 垃圾桶 → 刷新，均通过 |
| 展示边界         | 英式蓝点、美式粉点、英式在上；同形双点；通用与仅发音区分均无点；桌面和手机名称显示正常，无页面脚本错误                                           |

前端首次默认并发全仓运行出现两个既有向导用例 5 秒超时；该文件单独运行 65/65 通过，降低并发完整复跑通过，未修改超时或弱化断言。后端首次全量单测漏传依赖环境变量，补齐隔离 PostgreSQL/Redis 后复跑通过。

手机宽度 390px 时测到页面 `scrollWidth=391`，表格宽 362px、容器宽 332px；固定列及表格横向滚动的组合带来 1px 页面溢出，名称与圆点可见。未扩展本任务修改通用表格布局。响应式切换验收须等待布局稳定。

## 发布与回退依据

建议后端先发布、admin 后发布；未部署，不将本地候选视为线上版本。

- 旧管理端不发送参数，新 API 省略字段，旧严格 reader 已通过实际响应验证。
- 新管理端在缺少新字段时回退旧名称；旧 API 忽略未知 query 参数的结论来自现有 DTO 与 Axum extractor 静态核查，未另启动旧 API 服务。
- 后端回退后新管理端仍可显示旧名称；admin 回退后不请求新字段。无数据迁移回退问题。

## 验收证据与清理

证据由任务隔离数据生成：

- [桌面列表](acceptance/desktop.png)
- [手机列表](acceptance/mobile.png)
- [修改保存后垃圾桶](acceptance/trash.png)
- [浏览器验证结果](acceptance/browser.json)
- [实际响应兼容结果](acceptance/compatibility.json)

测试资源已全部清理，见 [清理回执](acceptance/cleanup.json)。本任务 API、admin、专用 PostgreSQL cluster、专用 Redis 均已停止；临时账号、词条、会话、凭据及浏览器数据随专用数据目录彻底移除。独立复查 8453、3153、55453、56453 四个端口均无监听，未改动其他工作区或共享数据。

最终补充验证：`pnpm --filter @tsz/api-client test` 完整 30 文件、617 用例通过。两仓 `git diff --check` 通过，手工变更文件的 Prettier 检查通过。
