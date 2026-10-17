# 线上临时资源隔离

目标：真实页面的临时语音、音频和图片落在 `tshb-test-assets/temporary-tests/<run-id>/<space>/`，复用项目清理脚本彻底删除所有版本、删除标记及专属登记。普通请求继续使用原目录。

## 接入与边界

后端读取可选 `X-TSZ-Test-Run` 请求头，校验与清理脚本一致的批次格式（8–80 位，首位小写字母/数字，其余允许 `_`、`-`）和显式配置的管理员/用户 ID 白名单，保留原业务鉴权。未配置、未授权或非法批次直接拒绝，不能悄悄回退普通目录。

覆盖 speech preview、管理员音频直传/确认、头像直传/确认和认证材料图片上传。服务端生成的逻辑 key 带 `temporary-tests/<run-id>/<space>/`；存储路由使用独立测试凭据，把它映射到固定测试 bucket/root，保留原空间大小、私有性、签名 TTL 与缓存策略。登记保留完整测试 key，因此后续无请求头的读取、确认重试、公开头像读取及后台回收仍能定位测试资源。由测试暂存文件派生的正式 key 自动继承批次，禁止跨普通/测试目录或跨批次复制。

试听缓存指纹另加批次命名空间，普通指纹保持原值；不同批次互不复用缓存。不修改 API 正文、响应结构或数据库 schema。

浏览器在独占测试标签页 URL 加 `?tsz_test_run=<run-id>`，Web/Admin 请求层将其保存到该标签页的 sessionStorage 并附加请求头；刷新和站内导航保留。`?tsz_test_run=off` 退出，关闭专用标签页清理浏览器上下文。显式批次保存失败时中止请求。登录、刷新凭据等公开请求及 OSS 直传请求不附加此头。启用前必须确认实际后端版本已支持该请求头；旧后端会忽略未知头，不能拿它执行临时资源验收。

## 操作

1. 使用唯一 run ID、专用 fixture；先运行 `scripts/cleanup-test-oss.py --run-id <run-id> --check-permissions`。必须证明列举、版本读取和永久删除均可用后才创建资源。
2. 后端设置 `TEST_RESOURCES_OSS_ENDPOINT`、`TEST_RESOURCES_OSS_REGION`、`TEST_RESOURCES_OSS_ACCESS_KEY_ID`、`TEST_RESOURCES_OSS_ACCESS_KEY_SECRET`，以及逗号分隔的 `TEST_RESOURCES_ADMIN_IDS` / `TEST_RESOURCES_USER_IDS`（至少一个显式 ID）。bucket/root 固定，不能配置到业务目录；密钥不写仓库或日志。
3. 页面显式开启批次，确认返回 URL 位于该批次目录。所有新建 DB 实体/依赖按精确 ID 登记，正常账号/词条不能作为可删除 fixture。
4. 成功、失败或中断恢复均在 finally/trap 中运行 `scripts/cleanup-test-oss.py --run-id <run-id> --apply`；对象版本确认清空后再定向移除本批次的 DB/Redis 登记。后台回收或生命周期不能替代该步骤。参考 [OSS 清理规则](../../../.agents/skills/test/references/oss-test-resources.md)。
5. 复查该批次版本/删除标记、DB、Redis 无残留，保护数据仍在；只留脱敏证据。撤销或回滚测试存储配置前先清空临时资源，否则旧二进制不能读取带测试命名空间的 key。

## 权限与交付

`TszTemporaryTestResourcesAccess` 新增权限仅覆盖专用测试前缀，已绑定 `tsz-rust-test`；该现有身份原有业务权限保持不变，不将其描述为只有测试权限的账号。清理脚本硬编码测试 bucket/root，不能借它删除普通目录。原有 4 个旧目录对象使用 `TszLegacyFourPreviewsCleanup20261017` 临时精确策略，实际删除及缓存复查完成后已解除授权。

基线：后端 `8035abee5e8e028335ffc73d65bd0ab87313c428`，前端 `613a54738bb215cf194601a79417c27a383ad8da`。两仓任务分支均为 `codex/online-test-resource-prefix`。

已完成：新增受限策略真实权限探测通过；遗留 4 个版本永久删除，4 条缓存登记删除、锁无残留，正常 different 词条未变。代码定向测试、契约同步进行中。

兼容与发布顺序：先发布后端（旧客户端不带头行为保持不变），再发布 Web/Admin 测试批次入口；新客户端普通模式也兼容旧后端，但不能在旧后端开启测试模式。无迁移；回滚前先清理测试对象和登记。线上新批次语音/图片及最终清理待发布后验收。
