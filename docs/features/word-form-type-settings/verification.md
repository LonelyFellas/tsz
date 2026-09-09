# 词形配置实施与验证

日期：2026-09-09。用户已批准完整方案。前后端分支均为 `codex/feature-20260909`，本次按用户授权准备本地提交，未推送或部署。

## 已实现

- 词性配置增加「词形变化」栏目；搜索、分页、五名称字段、新增、修改、引用保护和删除。
- 后端全局词形目录、原形保护、不可变编码、revision 乐观锁、事务行锁、草稿 FK、历史发布引用回填及维护。
- V2/V3 使用动态目录编码，保存、发布、匹配、关联与 V2→V3 迁移保留编码。
- 删除未使用内置类型后，词典建议按实时目录过滤。新自定义类型供人工录入。
- 前端统一名称 lookup，覆盖编辑器、预览、发布历史、匹配、目标选择与问题定位。
- 同步 OpenAPI、端点快照和 runtime schema；增加字符串 pattern 校验。运行时产物来源 SHA-256 与本任务后端 spec 一致。

## 验证证据

| 检查                                  | 结果                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| 前端 `pnpm typecheck`                 | 7 个包通过                                                                        |
| 前端 `pnpm lint`                      | 7 个包通过                                                                        |
| admin 生产构建                        | 通过                                                                              |
| api-client 测试                       | 最终 422 项通过，含新接口与动态编码契约                                           |
| admin 定向回归                        | 116 项通过；先前 V3 词形组件回归通过，含自定义名称更新                            |
| Rust clippy 全 targets/features       | 通过，含最终新增测试                                                              |
| Rust SQLx prepare 全 targets/features | 通过，`.sqlx` 没有内容差异                                                        |
| 迁移 up/down/up                       | 在本任务隔离 PostgreSQL 16 上通过                                                 |
| 核心 HTTP/数据库链路                  | 自定义类型创建→保存→发布→例句目标发现通过；未知目录编码拒绝                       |
| 删除与历史保护                        | 并发 KEY SHARE/删除、仅历史发布引用禁止删除、历史自定义类型禁止回滚通过           |
| 内置类型删除                          | 删除未引用复数配置后，词典建议不再输出该类型，原形仍存在                          |
| 浏览器真实配置 CRUD                   | 通过；无 API mock，新增 201、修改 200、删除 204；两次刷新确认持久化，零 pageerror |

全量检查没有隐藏初次失败：

- 前端 `pnpm test:cov` 完整运行：3095 通过、3 失败、3 跳过。失败均为 ConsoleLayout 布局单测新增目录 Provider 后缺少数据依赖隔离；已补充与该布局测试范围一致的 Provider mock，相关 116 项定向复验通过。随后新增的接口测试也已通过。没有降低覆盖率、排除业务文件或绕过 hooks。
- 后端完整 `cargo test --locked --all-features --no-fail-fast`：1016 通过、4 失败、2 忽略。失败为 3 个目录版本号旧断言及 1 个旧固定枚举断言；已按新增目录迁移版本和动态编码语义修正。目录目标 33 项重跑通过；旧枚举断言对应 HTTP 用例单独重跑通过，新增词形端到端及内置项删除过滤 2 项重跑通过。
- PostgreSQL 18 的最初基线出现 RESTRICT 错误码与项目预期差异；改用项目 PostgreSQL 16 后，实施前 46 项基线全部通过。未修改业务逻辑迎合 PostgreSQL 18。
- 按项目要求使用失败目标的定向重跑，不为获取整份绿色日志重复执行已通过的全部检查。

## 本地环境与产物

| 项目          | 地址/资源                                                              |
| ------------- | ---------------------------------------------------------------------- |
| 前端 worktree | `/Users/darwish/Dev/tsz-feature-20260909/tsz`                          |
| 后端 worktree | `/Users/darwish/Dev/tsz-feature-20260909/tsz-rust`                     |
| admin         | `http://127.0.0.1:15439/settings/parts-of-speech`，Vite dev            |
| 后端          | `http://127.0.0.1:18439/api/v1`，本 worktree 构建                      |
| PostgreSQL    | `tsz-form-types-pg16-20260909`，127.0.0.1:50328，数据库 tsz_form_types |
| Redis         | `tsz-form-types-redis-20260909`，127.0.0.1:49449                       |
| 浏览器截图    | `/tmp/tsz-form-types-artifacts/settings.png`                           |
| 浏览器结果    | `/tmp/tsz-form-types-artifacts/browser-result.json`                    |
| 验证日志      | `/tmp/tsz-form-types-*.log`，仅本机临时产物                            |

三个 admin mock 开关均关闭，代理显式指向本任务后端；HTTP 测试数据库由 SQLx 创建在独立 PG 实例内。
浏览器使用隔离库中的测试管理员会话；截图中的「浏览器验收词形」在验证后已删除，目录恢复为 8 个内置项。
保留本任务服务与数据库供继续开发；仅此纯 HTTP 本地环境使用 COOKIE_SECURE=false。
环境凭据保留在本机私有临时文件，报告不包含密码、token 或 JWT secret。

## 发布与回退

前端兼容版本先发布，后端迁移/API 随后发布；旧前端需刷新后才能消费自定义类型。服务未提供新目录时，新前端禁用配置管理并保留业务展示兜底。
已有自定义词形数据（包含仅历史发布引用）时 down 迁移拒绝回退；不允许恢复旧枚举后端后再尝试读取这些数据。

验收命令：`pnpm --filter @tsz/admin exec vitest run src/features/dictionary/part-of-speech src/layouts/ConsoleLayout.test.tsx --maxWorkers=2`
