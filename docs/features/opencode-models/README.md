# 出题模型设置与 API Key

在“系统设置 → AI 账本”的 OpenCode 卡片中，显示服务端当前出题模型；加载 OpenCode 的全部文本模型目录，通过“探测全部”取得真实调用结果后，搜索选择探针通过的模型并保存。添加服务商 API Key 后自动刷新目录，保存 Key 不自动切换模型。服务商、模型及连接状态均来自 OpenCode，不维护固定模型名单；有额外认证表单的服务商暂不提供单一 Key 入口。

## 调用与持久化

- 浏览器经 tsz-rust 超管接口读取目录、添加 Key、读取及保存模型选择。所有接口重新检查当前超管权限，响应禁止缓存。目录只投影标识、名称和可用状态，不透传 provider settings、headers、连接详情或 Key。
- Key 仅交给 OpenCode v2 的 `/api/integration/{integrationID}/connect/key` 保存，业务数据库不保存 Key。浏览器不将 Key 写入持久存储或 Query mutation 变量；请求结束清空输入。连接状态不证明 Key 额度或模型推理可用。
- tsz-agent 的 `agent_model_setting` 保存全局模型选择；创建任务时将模型写入任务已有 usage 数据。切换只影响新建任务，幂等重投与失败重试仍用原模型，不自动回落到其他供应商。
- DeepSeek 直连保持原适配器。OpenCode 路径通过 v2.1.4 无会话生成接口 `/api/experimental/generate` 显式指定 provider/model，沿用候选短引用、输出校验、人工审核和任务租约；不给模型文件或工具权限。

## 接口

| 后台端点                        | 行为                                           |
| ------------------------------- | ---------------------------------------------- |
| `GET /admin/opencode/models`    | OpenCode 可用文本模型目录                      |
| `GET /admin/opencode/providers` | 支持单一 API Key 的服务商及连接标志            |
| `POST /admin/opencode/keys`     | 写入 `{provider_id, api_key}`，成功 204        |
| `GET /admin/opencode/model`     | 当前出题模型 `{source, provider_id, model_id}` |
| `PUT /admin/opencode/model`     | 校验并持久化模型选择                           |

后台模型选择请求代理到 Agent `GET/PUT /v1/model-selection`，使用已有内部服务鉴权。

## 上线与回退条件

1. OpenCode 服务固定 v2.1.4，保持私有、密码保护并持久化数据。tsz-rust 沿用 `OPENCODE_SERVER_URL` / `OPENCODE_SERVER_PASSWORD`。
2. Agent API 与 worker 配置同一 OpenCode 实例：`TSZ_AGENT_OPENCODE_SERVER_URL` / `TSZ_AGENT_OPENCODE_SERVER_PASSWORD`。Agent 的原有服务端口与内部 token 配置沿用；API 和 worker 必须连接同一 Agent 数据库。
3. 显式执行 Agent `uv run alembic upgrade head` 至 `0005`，再更新配套 Agent API/worker、Rust 与前端。启动不自动迁移。旧前端不受新增端点影响；新前端访问旧 Agent/Rust 时显示不可用，不假装已保存。
4. 回退前停止创建 OpenCode 任务，完成或取消其 queued/running 任务，再回退 worker/API。`0005` downgrade 遇到活跃 OpenCode 任务会拒绝；回退删除全局选择，默认恢复 DeepSeek，已有账本不删除。

## 用量与预算边界

v2.1.4 无会话生成接口只返回文本，既不返回 Token/费用，也不接受单次 Token 上限，内部可能重试。此路径记录一次服务器调用的耗时、结果与模型，费用及逐次 Token 用量保持未知；不套用 DeepSeek 价格、不显示为免费消费或零 Token 观测。每次调度保留输出预算预留，未知用量不释放；默认 6000 预留预算允许两次 3000 预留调用，生成或审阅需要额外修正时可能因预算不足失败。该预留不是 OpenCode 或上游实际消费的硬限制；付费额度上限应在服务商设置。

本地实现阶段未发布。用户随后授权将这组改动交付并部署到 `tshb-test`；执行结果记录在发布进度中。真实付费推理未验证。

## 本地验收结果

- Agent：全量 100 项测试通过，包含新任务模型快照、幂等重投不改模型、worker 按任务快照派发、未知用量账本，以及 API 鉴权与模型校验。Ruff、格式、mypy、契约导出漂移检查与 wheel/sdist 构建通过。
- Rust：相关 handler 5 项与权限路由契约 2 项通过；fmt、全目标全特性 Clippy 通过。OpenAPI 已原生导出，前端快照和 runtime closure 已同步。
- 前端：API 客户端 645 项、相关 UI 11 项通过，admin 类型、ESLint、格式检查及正式构建通过。
- 真实本地链路：独立 PostgreSQL、真实 Agent API、真实 Rust router、Vite 同源代理与隔离 OpenCode v2.1.4；内置浏览器验证目录加载、保存模型后重开仍一致、添加合成测试 Key 后付费模型出现且输入清空。这里没有拦截业务 API。
- 迁移：验证 `0005 → 0004 → 0005` 与 `alembic check`，活跃 OpenCode 任务会阻止回退。仅使用独立本地 `tsz_agent_test` 数据库。
- 未验证：真实付费 Key 有效性、真实付费模型推理和完整真实词库出题；适配器与任务派发由受控 HTTP 测试证明。没有使用个人 Key，没有修改共享服务或业务数据库。
- 验收临时服务、数据、Key 与认证 fixture 在结束后清理；保留无敏感数据的页面截图。未提交、推送、合并或部署。

## 发布进度

目标为配套发布 Agent、Rust API 与 admin，不更新 web。复用本任务 worktree，经独立审查、PR/main CI 后发布；先 Agent `0005` 迁移与 API/worker，再 Rust，最后 admin。发布前核实当前服务、凭据共享方式、备份与活跃任务，保持已保存的 OpenCode 登录。

## 全量可用性探针

目录的 `enabled` 标记只表示模型在目录中启用，不能证明凭据、额度或生成接口可用。新增 `GET/POST /admin/opencode/probes`，代理 Agent `GET/POST /v1/model-probes`。读取只加载目录与结果；POST 显式发起全量最小文本请求，可能按服务商计费。列表包含 DeepSeek 直连及全部 OpenCode 文本模型，未验证、探测失败、超时和中断项都不可选。

探针以并发 2 运行，单请求沿用 Agent 的实际请求超时。API 立即返回 202，页面轮询显示逐项结果；数据库中的同一全局配置行保存当前批次，重复启动复用正在执行的批次，不重复发起探针请求。正常关闭中断剩余项，崩溃遗留的过期批次可重新启动；旧批次迟到结果不能覆盖新批次。

凭据与目录变化使旧结果失效，指纹不包含可回显凭据。保存模型会再次核对上下文及数据库中的通过状态，防止旧页面或直接请求绕过。真实出题调用失败会撤销对应可选状态，迟到的旧调用失败不会覆盖较新的成功探针。探针只记录安全状态、时间、耗时和 HTTP 状态，不保存原始异常或模型输出；费用保持 `null`，下方账本仍统计出题调用。

Agent 需显式迁移 `0006` 后更新 API/worker，再发布 Rust 与 admin。旧页面访问新 Agent 时，未经验证的选择保存会被拒绝；新页面访问旧探针接口时显示不可用且禁止保存。`0006` 回退要求批次已结束，并会删除探针结果；原模型选择及任务模型快照保留。

2026-10-28/29 的授权全量实测共 45 项：DeepSeek 直连通过，44 个 OpenCode 模型均返回 HTTP 503。仅说明本轮调用事实，不将目录登录成功当作推理成功，也不推断 503 的具体授权/额度原因。结果会随配套发布保留供页面展示，不自动切换用户模型；后续重新探测可能按服务商计费。

## 按凭据管理模型供应商

OpenCode 卡片中的“模型供应商凭据”按供应商分别列出每份登录授权、API Key、外部授权和环境变量连接，显示标签、凭据 ID 尾号及“当前使用”状态。同一供应商可保留多份凭据，使用“使用此凭据”切换，或单独“登出”其中一份；不提供整供应商批量删除。环境变量连接在服务器侧管理。

新增超管接口 `GET /admin/opencode/connections`、`POST /admin/opencode/providers/{provider_id}/connections/{connection_id}/activate` 和 `DELETE /admin/opencode/providers/{provider_id}/connections/{connection_id}`。后端只从模型供应商公开连接列表投影必要字段，不读取含密钥的 `/api/credential` 列表；写操作重新检查权限、凭据归属，调用原生单份切换/删除后再次读取确认。未生效或无法确认时返回失败，页面刷新实际状态，不假报成功。

OpenCode v2.1.4 的公开连接列表按当前使用项在先排序；删除当前凭据后会自动启用剩余凭据，可能改变计费账户，确认框明确提示，也可先取消并切换到希望使用的凭据。保存新 Key 或完成新登录会使新凭据成为该供应商当前项。切换只改变调用凭据，不改选模型；已有任务固定模型，但后续请求使用供应商当前凭据。凭据列表/顺序变化使旧探测结果失效，页面要求重新探测。

这些新增接口需要先发布后端；新页面访问旧后端时连接列表显示错误，不执行凭据操作。本次尚未发布的整供应商删除接口已移除，无需为它保留兼容端点。
