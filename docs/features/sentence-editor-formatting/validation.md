# 实施与验收记录

2026-10-09，本地任务分支 `codex/sentence-editor-formatting`。实现基于前端 `7b0f0e5`、后端 `3ef1ea9`；本次验收未执行部署。

## 已通过

- 实现阶段前端全仓 `pnpm typecheck`、`pnpm lint`、`pnpm test`：243 个文件，3516 项通过、2 项既有跳过。后续改动重新通过受影响检查：voice-editor 20 文件/332 项、admin 宿主 44 项、两包 typecheck/lint、admin 生产构建。
- API client 20 文件/501 项通过；包括新视觉格式组合、未知格式和额外属性拒绝。生成 runtime bundle 来源与后端 OpenAPI 的 SHA-256 一致：`64ea33128067dbfffb8c184a933112426877bf336ef051c8a8fb76a8bd4ce3e1`。
- 后端 334 项 lib 测试通过；`sentence_formats_persist_in_definitions_and_shared_sentences` 在本任务独立 Postgres/Redis 中保存英文释义和共享例句后独立 GET，标注一致；fmt 与 all-targets/all-features clippy 通过。
- 独立只读复核发现并修复：关闭编辑器写入口时已有格式的阅读展示；格式变化时连读弧重新测量。两项修复定向复核通过。
- 语法结构聚焦问题先以三组回归测试及实际只读输入框复现，再修复预览判断。聚焦前后均保留颜色、字重和两处连读锚点；可直接改字的降级路径仍保留可见正文与光标。浏览器热更新期间保留用户未保存的草稿。

## 真实浏览器与 API

使用本任务后端二进制和前端 Vite dev，同源 `/api/v1` 代理真实后端，无词条/例句 API 拦截。Postgres `127.0.0.1:59326/sentence_formatting`、Redis 独立容器随机映射端口 `54734`、后端 `59328`、admin `59329`。一次性管理员和词条均在任务隔离库内，不触碰其他任务环境。

- 英文释义选中 `harbour` 后连续 B/I/U，原生选区保持 `[2,9)`；完成、真实 PUT 保存 200、刷新 GET 200，三种标注与码点范围一致。
- 已有连读端点取消粗体，SVG 路径立即从 `M 140.11 54.45 …` 变为 `M 139.32 54.66 …`；重开编辑器路径相同，恢复粗体后恢复原路径。斜体取消也验证字形状态；该测试字体的端点墨迹在此次斜体切换中未改变弧线坐标。
- 清除停顿后，正文、B/I/U 与连读保留；共享例句局部取消下划线、撤销，再清除停顿，真实 PUT 200、刷新独立列表 GET 200，三种格式、连读及一条既有词义关联均保留，停顿未返回。
- 跨词设置下划线时两处词间空白均显示 underline；取消临时修改。
- 390px 视口下弹窗宽 374px，未超出视口。
- 截图：`output/playwright/sentence-editor-formatting.png`。

本地未配置 TTS 供应商，不声称已完成音频试听；SSML 的视觉格式等值及停顿保留由后端测试证明。未重复运行全套 mock Playwright suite，此处浏览器证据来自真实后端。

## 发布与清理

新格式生产写入口 `VITE_SENTENCE_FORMATTING` 默认 false，开发默认 true。读取支持独立于此开关和 `VITE_VOICE_EDITOR`。先升级读取端与后端，再启用新格式写入；旧浏览器标签页需更新。有新数据后只关闭写入口回退，不回退读取枚举。

首次验收用的临时浏览器、前后端进程及隔离数据已清理。随后按用户请求重建本任务隔离环境，保留后台预览及前后端服务运行；运行配置与当前 fixture 在本机任务临时目录中，不纳入 Git。截图、源码、设计与脱敏验证记录保留。

## 安全开启补丁验证（2026-10-10，尚未部署）

前端隔离 checkout `/Users/darwish/.codex/worktrees/sentence-formatting-compatibility/tsz`，基线 `7a4cc16`；后端同目录 `tsz-rust`，基线 `3e8fe50`。均为 `codex/sentence-formatting-client-compatibility`，当前为未提交改动。

- 后端 cargo check/fmt 通过。共享叶子投影测试验证 nested words/sentences/snapshots，V1 spans、italic、连读和停顿保持，canonical 不变。
- 真实 Axum/Postgres/Redis 测试：旧读取移除 B/U，旧 meanings 保存与删除带格式 POS 被拒绝且 audit/revision/content 不变；普通旧词形保存保留格式；词条与独立句子发布旧→新同键重放、草稿/发布/历史读取、旧句子更新拒写及新客户端清除格式通过。已有相关词条/句子集成共 9 项通过。
- 公开、个人 full-view、后台审核三类词表实际接口旧/新读取通过，publication snapshot 未被裁剪，私密备注边界保持。
- api-client 22 文件/507 项通过，包级 typecheck 通过；冻结前端 `7b0f0e5` 的真实 annotation/validation-code 定义验证旧 reader 拒绝完整新格式、接受投影视图与既有刷新验证码。
- 旧词条 layout 26 项通过，安全拒写显示既有刷新提示，不调用自动刷新或丢弃输入回调。
- 原生 OpenAPI 导出/同步通过，source SHA-256 `271302d77f5ce6ef1900f6cd22953b1936e9f8fd7ff6eed00b5b5b9385db3700`；body schema 与 main 相同，仅新增 26 个可选能力头声明。

Postgres 与 Redis 复用本会话自有隔离服务 `127.0.0.1:57681`/`57682`；数据库测试由 SQLx 创建独立测试库，不使用生产数据。未在本轮重复原编辑器的真实浏览器 B/I/U 操作；编辑器源码没有修改，其已有浏览器证据见上文。本次协议/存储保护以真实 handler、数据库、旧 reader 和 UI 错误路径证明；全量门由原生 hooks/CI 承接，部署后再核对线上制品、能力头、开关和完整 smoke。

发布必须先兼容后端，再配套 web 读取客户端，最后后台 `DEPLOY_SENTENCE_FORMATTING=true`。当前线上仍为 `false`；此记录不把准备完成写成已经开启。
