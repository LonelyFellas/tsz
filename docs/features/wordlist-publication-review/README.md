# 用户词表公开申请人工审核

2026-10-14，用户确认实施：历史已公开词表保持公开，后续申请均由管理员人工审核。用户随后授权审查前后端改动，确认无问题后提交、推送并分别创建 PR；不包含合并或部署。

## 范围与依赖

复用已合入的私密词表、审核快照、幂等提交、审核权限、驳回原因及撤回流程。取消 `/me/wordlists/{id}/publish` 自动批准，与 `/review-requests` 共用人工审核提交逻辑。历史数据不迁移、不批量下架。

C 端按钮改为“申请公开”，说明待审仍仅作者可见；后台原词表管理补审核状态筛选，不新增审核中心。名称、选词及顺序、作者公开注释属于审核内容；私密备注不进入审核，修改私密备注无需重审。内容在待审/公开时仍须先撤回再编辑，后续重新申请需要人工审核。

## 可观察验收

- 新申请持久化为 pending；公共搜索、详情及条目读取均不可访问。
- 通过后公开；驳回须填写原因，作者修改后可重提。
- 撤回使旧申请失效；重复提交幂等，旧版本/并发决策不能绕过审核。
- 审核/公开响应不包含私密备注，作者注释快照保持提交时内容。
- 历史公开词表保持可见，不修改已有审核记录；已完成申请的原键重试仍返回原结果。
- 后台审核状态筛选在服务端分页前作用，包含 total，不只过滤当前页。

## 契约与发布依赖

保留 publish 路径及原 wire 响应，只改变新申请结果为 pending。管理查询新增可选 review_state（none/pending/approved/rejected）。新筛选参数不兼容旧后端的严格查询解析，需先后端再前端；仅前端文案更新不能关闭旧后端自动批准。回退到旧后端会重新允许自动批准，需要明确接受该规则回退。

## 版本与状态

前端基线 a7ed223a，后端基线 65b9004；均使用 codex/wordlist-publication-review 任务工作区。主记录仅保留本文件，后端引用此记录。

当前阶段：本地实现与验收完成，进入精确提交独立审查及 PR 交付；最终提交、PR 与 CI 状态见交付对话和配套 PR。

## 验证证据

- `pnpm typecheck`、`pnpm lint`、`pnpm build` 通过；lint 保留既有 Admin 1 条及 Web 3 条警告。
- Web/Admin 词表定向测试 14 项通过；同步后 `pnpm --filter @tsz/api-client test` 520 项通过。
- 全仓 `pnpm test` 首轮 3739 项通过、19 项失败、2 项跳过：18 项为未改动编辑器用例超时，1 项为同步期间旧契约哈希断言。同步哈希后，原失败的全部 12 个文件以 `--maxWorkers=2` 重跑：513 项通过、2 项跳过，不修改超时阈值。
- Rust `cargo fmt --all -- --check`、`SQLX_OFFLINE=true cargo clippy --locked --all-targets --all-features -- -D warnings` 通过。
- 隔离 Postgres 上 `SQLX_OFFLINE=true cargo test --locked --all-features --test wordlists_review --test wordlists_handler -- --test-threads=2`：18 项通过。初次复用的 Postgres 中途停止，初次测试中断，不计为有效验证；最终使用本任务独立实例。
- OpenAPI 由本任务后端生成、显式 OPENAPI_SOURCE 同步；SHA256 `4554c7b52ac502ca92a7991fe1f6ebe1efd9ac44c01bda8c5f04863fbc231188`，生成输入与契约 canary 一致。

真实验收版本为上述基线加本任务工作区差异。Web `next start` 位于 127.0.0.1:13384，同源 `/api/v1` 代理到本任务构建的后端 127.0.0.1:18384；独立 Postgres 15384 / tsz_wordlist_review_20261014，独立 Redis 16384 / DB 0。使用本任务合成账号和词表 fixture，无 API mock/route 拦截。

浏览器真实登录 → 打开私密词表 → 点击“申请公开” → publish 返回 200 → 重新请求显示 pending；匿名详情及 items 返回 404。管理员真实 decision API 审核通过后，页面刷新显示“已公开”及公开入口，匿名 items 返回 200 且无 private_note；独立 SQL 确认 published / approved / revision=3。另一份已公开 fixture 在新申请前后均可访问。后台筛选真实 HTTP 返回 pending 总数 1，后台筛选交互由组件测试验证；本次未额外执行后台浏览器审核操作。

本任务测试进程、独立数据实例和临时会话凭据在验收后清理。
