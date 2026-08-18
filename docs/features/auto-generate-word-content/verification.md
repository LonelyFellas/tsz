# 词条内容自动生成验证记录

验证日期：2026-08-18

## 单元 / mock：PASS

- Rust：千问 `/chat/completions` 严格 JSON Schema 请求、Bearer 鉴权、合法响应解析、配置 fail-closed、429/内容过滤/非 2xx/超时/坏 JSON，以及缺少正文不调用模型、CEFR/引用闭包/多例句映射均通过。OpenAI 保留既有实现与测试，本次未扩展其评估范围。
- 前端：missing-only 合并、人工内容保护、revision/dirty 阻断、非法 UUID/引用拒绝、partial/retry、任务会话恢复和只读隐藏均通过。
- 前端完整覆盖率：124 个测试文件、1537 个测试通过；Statements 95.13%、Branches 91.28%、Functions 94.85%、Lines 96.39%。运行覆盖率需使用固定 Node 24.19.0，并设置 `NODE_OPTIONS=--no-experimental-webstorage`，避免 Node 实验性 Web Storage 覆盖 jsdom。

## HTTP / 数据库：PASS

- 真实 Axum 路由 + 隔离 PostgreSQL：创建任务 202、查询 200、创建和重试幂等重放、同 key 不同 body/词条 409、revision 409、未配置 provider 503。
- 迁移约束、来源正文进入任务快照、source key/locator/gloss/example 保留均通过。
- `cargo test --all-targets --quiet`：590 个测试通过，2 个测试 ignored（真实千问 smoke 与既有真实 OSS smoke 均需显式凭据）；`cargo clippy --all-targets -- -D warnings` 通过。

## 真实 Kaikki 数据：PARTIAL PASS

- 从 Kaikki 官方单词 JSONL 地址下载 `multischema` 小样，使用生产导入器 `--validate-only` 校验通过：1 条记录，SHA-256 `615234e57a7bcb01b568476e6b7d26106848ba3aa07c3d5d4d86eb68078d8b56`。
- 隔离数据库 fixture 已验证任务快照携带版本化 source key、locator、gloss 与 example。
- 未下载/导入 3GB 官方全量内容，也未修改测试服数据库或运行数据；全量导入验收仍待明确目标库、版本、行数和许可确认。

## 真实生成提供方：BLOCKED

当前进程及本地 `.env` 未配置 `LEXICON_GENERATOR_PROVIDER`、`QWEN_LEXICON_API_KEY` 与 `QWEN_LEXICON_MODEL`，因此真实千问 smoke 保持 ignored，未产生模型请求或费用。已提供显式运行的真实 smoke 用例；mock HTTP 只作为 provider 单元/HTTP 隔离证据，不计为真实 provider PASS。

## Codex 内置浏览器：BLOCKED

- 已使用 Codex 内置浏览器打开本地 admin，`/words` 正确重定向到 `/login?redirect=%2Fwords`，登录页可见。
- 没有管理员会话、本地 Rust 服务、完整 Kaikki 正文和真实 provider 配置，无法执行 running → completed/partial → 回填 → readiness → 保存主流程。
- 未使用用户 Chrome，未输入凭据，未修改任何服务器数据。

## 仓库原生总门说明

`pnpm test:cov` 的前置部署来源门会因本地既有、被忽略的 `apps/web/.env.local` fail-closed；未删除或修改该用户环境文件。绕过该无关前置后直接运行同一锁保护覆盖率执行器，完整 Vitest 与覆盖率阈值均通过。
