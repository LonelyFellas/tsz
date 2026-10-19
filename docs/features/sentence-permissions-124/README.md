# 禅道 #124：多维例句权限

任务来源：[禅道 #124](http://47.121.142.19/zentao/index.php?m=task&f=view&taskID=124)。本次终点为前后端分别审查、提交、推送并开 PR；不包含合并或部署。

## 已有能力与最小改动

- 实施基线：前端 `b2cdd4b8`、后端 `5dbb822`；交付同步到前端 `3cc4230d`、后端 `61c71e2`，任务分支均为 `codex/sentence-permissions-124`。
- 已有例句创建、文本/关联分权、他人编辑范围、发布快照、归属限制、双版本及幂等检查，继续复用。
- 后端权限目录采用任务要求的名称/说明；新增 `sentences.read_published`，不依赖全部查看权限。`sentences.access` 仍可查看全部例句。
- 公开只读权限只允许列表/详情的 published 视图（缺省也是 published）；草稿、撤回内容、发布管理历史和写接口拒绝访问。前端菜单/直链/列表/详情及词条公开预览同步支持。
- 删除目录中的 `sentences.restore`，现有授权及权限标签迁移到 `sentences.publish`；旧 restore API 保留，改由发布权限控制。
- 历史恢复只在未公开状态下执行，将快照写回草稿及关联，递增草稿 revision，保留不可变发布记录和撤回状态；公开例句必须先撤回。恢复后须另行发布。
- 既有存储以 `current_publication_id` 加 `withdrawn_at` 表示公开/撤回；沿用该模型。发布草稿同时解除撤回，重新展示原发布仍可通过既有 restore API 操作。
- 发布、撤回、历史恢复的本人/超管限制保持；`edit_others` 仅扩展对应编辑范围，不授予其他操作。

## 验收

- 只读管理员看到公开快照，不能读草稿/撤回内容或执行写操作；全量查看管理员仍能查询草稿。
- 发布权限可重新展示原发布，废弃权限单独无效；迁移覆盖管理员授权、标签和版本号。
- 公开状态恢复历史返回 409；撤回后恢复写回草稿，重新 GET 内容一致，不增加发布记录，不自动公开；过期 revision 拒绝，幂等重放不重复写。
- 前端只读菜单/直链、请求视图和历史恢复按钮与后端一致；原有编辑分权测试继续通过。

## 兼容与回退

wire 结构和路径保持不变，新增权限 key 由目录/profile 的字符串字段承载。旧前端不认识新只读 key，会隐藏入口；新前端配旧后端无法取得新授权。旧前端历史恢复的文案与新语义不同；新前端接旧后端时，历史恢复仍执行旧的发布语义。因此两种混合版本均不能作为完整功能验收通过，不宣称在线滚动发布安全。后续部署须先提供兼容补丁，或取得受控维护窗口授权后更新两端并验收历史恢复入口；本次只交付 PR，不执行发布。

迁移 down 无法还原合并前的发布/恢复权限区分：保留合并后的能力，为所有发布者补回 restore，删除新只读 key（只读用户因此失去入口，不升级为全部查看）。授权及标签修改会递增版本。正式回退需审查该差异。

## 验证结果（2026-10-13）

已完成本地实施及验证；交付状态与 CI 以配套 PR 为准，未合并或部署。后端 worktree：`/Users/darwish/.codex/worktrees/sentence-permissions-124/tsz-rust`。隔离 PostgreSQL `127.0.0.1:55424/task124`，Redis `127.0.0.1:56324/0`；均为本任务新进程。最终结果在验收后更新。

- 前端 `pnpm typecheck`、`pnpm lint` 通过；lint 只有原有 web 导航警告。最终文案调整通过组件测试，修改文件通过 prettier / diff 检查。
- `pnpm test` 首轮：255 文件中 252 通过；3728 测试中 3722 通过、4 失败、2 原有跳过。三个失败来自本次 mock/菜单动画断言，已修正并定向复跑通过；另一个未改动的 `Italic.test.tsx` 在并发运行时超时，保持原超时设置定向复跑通过。未再次重复全仓测试。
- API `pnpm --filter @tsz/api-client test`：23 文件、519 测试通过。OpenAPI 只变化接口说明；生成快照只有来源/哈希元数据变化。原生生成并核对 SHA-256：`1a26ab872afc219456368a50cdfaf54c60c2905940c3e1a300e414bc7e726f83`。
- 后端 `cargo test --locked --test lexicon_handler batch4 -- --test-threads=4`：14 通过，包含公开只读、废弃 restore key 拒绝、发布授权恢复展示、草稿历史恢复/重放/并发版本保护及批量发布。
- 后端 `cargo test --locked --test shared_sentences --test admin_profile_handler --test admin_permissions_handler -- --test-threads=4`：29 + 12 + 14 通过，包含迁移 up/down/up、标签与授权保留、版本递增、现有编辑分权。
- 后端 `cargo test --locked --lib admin::permissions`：12 通过；`cargo fmt --check` 和 `cargo clippy --locked --all-targets --all-features -- -D warnings` 通过。SQL 均为动态查询，没有新增编译时 SQLx 宏缓存。
- 上述后端命令使用 `SQLX_OFFLINE=true CARGO_TARGET_DIR=/tmp/tsz-task124/target`；数据库测试显式传 `DATABASE_URL=postgres://task124@127.0.0.1:55424/task124`、`TEST_REDIS_URL=redis://127.0.0.1:56324/0`、`REDIS_URL=redis://127.0.0.1:56324/0`。

## 真实浏览器验收

浏览器入口 `http://127.0.0.1:53124` → 当前前端 worktree 的 Vite → `http://127.0.0.1:58324/api/v1` → 最终后端任务源码构建。最终构建进程于本地时间 10:39:49 启动；改动状态为上述基线 SHA + 本任务工作区差异。三个 Admin mock 开关均为 false，无 API 拦截。仅短信发送沿用后端自带 Mock 通道；例句 API、鉴权、数据库及 Redis 均为真实本地服务。

- 隔离库创建一个超管、一个仅 `sentences.read_published` 的管理员及 3 条例句（公开/草稿/撤回）。只读账号真实登录后，菜单与直链可用，列表仅 1 条公开内容；详情为 B1 发布快照，未暴露 C1 草稿，无历史和编辑入口。
- 超管可读全部 3 条；公开例句历史弹窗不提供选择恢复，确认按钮禁用。
- 对撤回例句执行历史恢复：实际 POST rollback 200；刷新 GET 200 后仍为“草稿（已撤回）”，内容恢复为 B1。独立 SQL 确认 revision 3 → 4，lifecycle_revision 不变，发布记录仍 1 条。
- 再发布：实际 POST publications 200；刷新 GET 200 后变为“已发布”。浏览器操作与后端日志、数据库持久化一致。
- 浏览器截图与原始验证日志保存在 `/tmp/tsz-task124/`。验收结束关闭本任务浏览器和前后端、PostgreSQL、Redis 进程；删除本任务隔离数据库与临时构建副本，保留日志及截图。未改动已有服务和共享数据。

## 交付检查

已同步两仓最新主线的任务 #125–127，保留教师材料和词库配置权限拆分；契约从本任务后端重新生成。部署迁移测试的最新版本号同步到 `20261013100000`，避免已有迁移回退测试使用过期版本。独立审查针对提交对象进行，正常执行两仓原生 hooks；审查结论、最终 SHA 和 CI 状态写入配套 PR。
