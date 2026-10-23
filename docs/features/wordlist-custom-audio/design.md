# 自定义词汇语音

2026-10-23，用户已明确授权实现、真实语音验收、提交、推送和创建前后端配套 PR；不合并或部署。

- 自定义项默认不生成；每项生成英式 Sonia、美式 Aria 各一条，合计 2 天生币，保存时扣款。
- 同项同词面已有有效/处理中语音不重复收费。修改释义、注释、排序不收费；新词面需显式选择生成。
- 保存原子完成文本、任务及一笔总额扣款。余额不足全部回滚。后台重试不再收费，最终失败或未交付前删除/改词退回该项 2 币；交付后删除不退款。
- 保存顶层增加可选 `audio_generation: { item_ids, expected_cost }`（费用十进制字符串），编辑增加可选 `idempotency_key`。既有文本类型及响应保持原样，新增字段缺省省略保持旧创建哈希。
- 后端自行定价，确认金额不匹配用 `word_list_audio_cost_changed` 拒绝整个保存。未结算语音阻止注销冻结，用 `account_deletion_unsettled_audio` 提示。

## 接口约定

所有地址在 `/api/v1` 下。

- `GET /me/wordlists/{id}/custom-audio?item_ids=<逗号分隔 UUID>`：本人当前项状态，最多 100 项，每个响应 `{ items: [{ item_id, job_id, word, status, locales }] }`。无任务的项不返回。`status` 为 `queued | processing | ready | refunding | refunded`；`locales` 仅 ready 返回 `["en-GB","en-US"]`，其他为空。当前退款中项仍显示但不可重试；已退款后显式保存可重试。`word` 为任务词面，用于编辑时判断有效性。
- `GET /wordlists/{id}/custom-audio`：公开词表同形状，仅返回 ready。
- `GET /me/wordlists/{id}/custom-audio/{item_id}/{locale}` 与公开 `/wordlists/...`：校验当前项后签名，返回 `{ url, expires_at, url_expires_in_seconds }`，locale 为 `en-GB | en-US`。
- 后台对应 `/admin/wordlists/{id}/custom-audio` 及 `/admin/wordlists/{id}/review-requests/{request}/custom-audio`，查询和签名分别按当前内容及审核快照权限。

新建保存沿原请求幂等键重放，编辑保存也冻结完整请求与键；按用户/目标持久化未确认请求，刷新后重放，禁止去掉语音命令静默降级。旧后端不认识新生成字段时明确失败并保留输入。

## 实施与验收

任务分支均为 `codex/wordlist-custom-audio`，前端基线 `164691d7`、后端 `c9c2fe4`；worktree 位于 tsz-core/.worktrees/{frontend,backend}/wordlist-custom-audio。

后端持久化任务、租约和对象尝试登记；两条音频全成功才 ready。退款为绑定原扣款的内部幂等补偿，普通入账权限不放宽。播放和对象清理遵循词表及审核历史引用；测试批次进入隔离资源前缀。

先完成后端，再原生导出 OpenAPI，并用显式 OPENAPI_SOURCE 同步前端。验证收费金额、余额不足回滚、重复请求/并发、生成失败退款、删改竞态、权限/审核、旧客户端兼容及注销边界。Web production build + next start 实测保存、刷新、余额、状态及英美播放；真实云服务缺少凭据或清理权限时如实标记，不将 mock 视为真实合成。

当前：前后端实现和验收完成，进入配套 PR 交付；不合并或部署。后端396项单元、74项相关集成回归通过，另补5项语音生命周期/迁移测试通过；最终fmt/clippy通过。前端api-client全套594项、受影响组件与保存恢复/播放/轮询测试、4包typecheck及定向ESLint通过；Web和Admin生产构建通过。

真实浏览器连接本任务隔离API，已验证默认关闭、勾选一词显示2币、余额不足保留输入、同步语音不可用时未保存未扣（独立SQL词表0/任务0/余额10）、用户主动取消后文本保存、刷新及重新编辑回读；桌面浅色和375px深色无横向溢出，截图位于output/wordlist-custom-audio。API日志无错误；浏览器有本地未生成version.json的既有404和自动导航beforeunload提示，不宣称console全空。

用户随后明确授权真实云验收，已在20261023-wordlist-audio-luwlgu独占批次完成 Azure 合成、OSS 写入和浏览器英美播放。一个词保存后余额10→8，原请求重放200且只保留一笔-2扣款、一个任务、一次生成尝试和两条音频；英式1.872秒、美式2.088秒均触发loadedmetadata/playing/ended且无媒体错误，OSS媒体请求206。刷新、重新编辑显示已生成且费用0；修改释义再保存、整页刷新后余额仍8，未新增任务或收费。API日志无错误。制品哈希、状态、流水及播放证据见output/wordlist-custom-audio/real-audio-acceptance.json。

本次临时API/Web/Postgres/Redis均已停止，四个端口独立复查无监听，独占数据库目录、日志及启动脚本已删除；浏览器退出接口返回204，无待确认保存记录。云端两条音频版本已通过cleanup-test-oss.py永久删除，回执clean且remaining=0，独立只读再列举0对象及版本。保留脱敏验收与清理回执，浏览器站点缓存不宣称彻底清除。

部署建议后端先于前端；未结算付费任务存在时不能回退到没有worker的旧后端。旧请求/响应与拒写已做契约测试，未运行旧版本二进制组合。
