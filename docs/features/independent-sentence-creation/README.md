# 独立创建例句（禅道 #154）

目标：多维例句列表可直接新建例句，先独立保存草稿，之后补充具体词义关联。沿用原有发布和练习可用性规则。附带修复真实验收发现的“查看已关联词义后浮层无法关闭”。

## 范围与依赖

- 复用 `SentenceEditor`、句内关联、创建权限、表格 `toolbarExtra` 和既有列表/发布流程。
- 新建按钮位于表格右上角、列设置左侧；垃圾桶、词条内列表及只读视图无此入口。
- 独立创建允许零关联，仍要求有效正文和至少一条译文；无有效绑定时显示提示，列表显示“未关联”。
- 创建后返回第一页并清除筛选，刷新列表；失败保留输入，重复请求复用例句 ID。
- 已关联词义的查看浮层增加“关闭”，调用现有 `onCancel`；关闭不清除绑定，“清除关联”仍为独立操作。

前端：`codex/task-154-independent-sentences`，基线 `0e81312a`。
后端：`/Users/darwish/Dev/tsz-core/.worktrees/backend/task-154-independent-sentences`，同名分支，基线 `867053d`。本文件为两仓共用记录；实际候选提交、独立审查与 CI 状态见配套 PR。

## 契约与兼容

`POST /admin/lexicon/sentences` 的 `source_entry_id`、`source_sense_id` 改为可同时省略；只提供其一返回 400。提供来源时保持来源归属、可编辑性和精确词义关联校验；独立创建仍校验所有提供的关联目标及 `sentences.create`。数据库现有来源字段已允许 NULL，无迁移和新增响应字段。

旧前端请求可继续访问新后端；新前端独立创建请求访问旧后端会因缺少必填来源而失败。因此配套发布须先后端、后前端；后端回退前须停止独立创建入口。已有独立例句存储可被旧读取结构读取，不虚构来源词义。

后端通过 `SQLX_OFFLINE=true cargo run --locked --all-features --bin export_openapi` 导出；前端显式指定上述工作区的 `docs/openapi.json` 运行 `sync:openapi`。spec SHA256：`31af0b23570f8a96bfa81d0dc18917f70648f6c05df79c8ca1d4ef612ef5d4e7`。运行时 schema 的内容未变，仅来源及哈希元数据更新。

## 验收证据

- 后端 `shared_sentences` 45 项通过：独立创建、重读、幂等重试、后补关联、来源参数成对、权限与失效目标拒绝，以及原有来源归属和发布/音频/垃圾桶回归。
- API 客户端完整 650 项通过，OpenAPI 输入与哈希 canary 同步。
- 全仓 typecheck、lint、Admin 生产构建通过；lint 只有既有 web 全页跳转 warning。
- 最终前端相关 53 项通过；浮层修复最后一次调整后，其所在文件 12 项定向复验及 Admin 构建通过。
- 后端 fmt 与 `cargo clippy --locked --all-targets --all-features -- -D warnings` 通过。
- 浮层关闭回归先在旧实现失败（浮层无关闭按钮），修复后通过；保留原关联并恢复完成操作。

真实链路：Codex 内置浏览器 `http://127.0.0.1:3154` → 本工作区 Vite 明确代理 → `127.0.0.1:18354/api/v1`，后端为目标源码编译的 Axum router。数据使用任务独占 Postgres `55454/task154_live` 和 Redis `56454/0`，均为本任务专用容器。Admin words / part-of-speech / TTS mocks 关闭；OTP 仅为本地 Mock sender，例句请求、权限、存储和关联均为真实后端。未配置 OSS，无语音生成或文件上传。

浏览器已验证：从空列表新建正文和译文、零关联保存；完整刷新后仍为草稿并显示未关联；重新编辑并通过词条/词形/具体词义选择器绑定 wonderful；保存、完整刷新后关联仍在；点击关联词条进入词义页，例句区显示同一正文及译文。查看已有绑定时点击“关闭”，浮层消失、完成恢复可用，再次保存后绑定保留。真实 GET/PUT 响应均为 200，数据库独立复查 `source_entry_id IS NULL`、revision=3、1 条有效关联、仍未发布。

## 当前阶段

本地实现与真实联调已通过。已退出并关闭临时浏览器账号，停止本任务 Vite/API 进程；移除两个任务专用容器，Postgres tmpfs 随容器销毁，Redis 专用数据同时清除。独立复查容器不存在、3154/18354 无监听、既有两个共享容器仍运行；临时 fixture 和含测试凭据的启动源码已删除，仅保留脱敏验收证据及清理回执。本次按授权完成两仓审查、提交与 PR 交付，实际候选 SHA、审查和 CI 状态记录在配套 PR。未合并或部署，未做线上验收，也未将未发布 fixture 用于练习。
