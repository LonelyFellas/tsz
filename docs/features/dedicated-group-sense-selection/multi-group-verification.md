# 多组绑定修订验证（2026-09-17）

本记录对应本次多组绑定修订；后端配套提交为 `6cc0dbd91a10bc2d11a2b6f5061ab04564df26b8`（[PR #172](https://github.com/LonelyFellas/tsz-rust/pull/172)），前端分支为 `codex/multi-group-sense-bindings`。不表示已部署。

## 已验证

- 后端 `cargo test --locked --lib --test lexicon_handler --test shared_sentences`：281 + 96 + 24 项通过。
- 新增 HTTP 回归：同义两组保存/回显，引用 2→1→0，存在绑定时直接删除请求被拒，全部解绑后可删；新数组 JSON 阻止有损 down。
- 存量回归：单组数据 down/up 后回填一条边；模拟旧写端仅保留 legacy 单列时仍能读到一条引用。
- 新增单元回归：两个专用组均可选同一词义；重复和无效组拒绝；显式空数组覆盖旧单值。
- 前端全仓普通测试首轮：2746 通过、12 失败、2 跳过。失败包括契约生成哈希/新增断言、提示文案更新，以及并发时超时。修正相关断言后，仅复跑失败文件并将 worker 限为 2；没有调整超时阈值。相关 7 个 admin 文件通过，api-client 独立 395 项全部通过。
- 后续向导、保存流与 Popover 回归：128 项通过；Popover 在卡片外，折叠状态不变，其他组绑定仍可选，取消不改草稿，恢复一个组不影响另一个组。
- 最终词义页测试 95 项通过，包含尚未保存的多组绑定立即禁用删除；最终 admin typecheck/ESLint 通过。
- 全仓 typecheck、改动文件 ESLint、后端 fmt/全目标全特性 Clippy 通过。
- 已在隔离 PostgreSQL 执行 migration 与 `cargo sqlx prepare -- --all-targets --all-features`；`.sqlx` 无差异。
- OpenAPI 按原生导出/同步链更新，前端 runtime `_source_sha256` 与指定后端 OpenAPI 文件 SHA-256 一致。
- 独立只读审查指出的旧写端迁移窗口已通过 legacy 合并读取及回归覆盖。

## 环境和边界

测试使用本次创建的 PostgreSQL/Redis 容器；任务结束已删除容器及其测试卷。未访问生产库或共享库执行迁移。
初次未提供 DATABASE_URL 的库测试有 13 项因缺少连接失败，之后在上述隔离环境完整通过。

## 真实浏览器补充验收

使用本地 Playwright Chromium 连接 `http://127.0.0.1:3002`，代理至本次代码构建的 `http://127.0.0.1:8384/api/v1`。原生浏览器连接工具两次超时后采用此路径；未拦截或模拟 API。使用隔离测试管理员令牌，本轮不验证登录流程。

- 新后端进程使用独立复制的 binary `/tmp/tsz-multibind-acceptance-api`，进程与二进制摘要保存在 `/tmp/tsz-multibind-acceptance-process.json`。数据库为既有任务隔离库 `tsz_dedicated_acceptance`。
- `hang` 样例：第一组折叠时点击「专用词义」，Popover 位于卡片外且卡片保持折叠，第二组已绑定的词义仍可选；截图 `/tmp/tsz-multibind-popover.png`。
- 页面将第一组绑定全部三义，真实 PUT `/steps/forms` 返回 200，草稿 revision 7→8；独立 GET 验证第二词义同时保留两个组 ID。
- 新浏览器会话重新进入词义页，第二词义显示「被引用 3」：一处短语成分引用、两处词形组绑定。来源列表分别显示第 1/2 组，删除按钮禁用；截图 `/tmp/tsz-multibind-references.png`。
- 验收后通过真实影响预览及保存恢复第一组通用、第二组专用（revision 9），第二组原有两义仍保留。只修改上述任务样例，无生产写入。验收服务继续留给用户查看。

本轮交付到提交、推送与 PR，不执行合并或部署。后端包含新增数据库迁移；上线仍需按设计先更新兼容前端，再更新后端，旧页面刷新。
