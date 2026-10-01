# 前后端对接设计

## 基线与关键路径

前端独立 worktree 基于 origin/main 0862111；后端独立 worktree 基于 e9fb960。
已在主线：验证码流程、C 端 security_version/会话撤销、登录限流、20 位随机管理员临时密码。
改动：统一密码原语、共享长度规则和错误映射、移除大写转换。
新增：本地泄露哈希名单、Argon2id、管理员安全版本与原子改密撤销。
顺序：后端原语与调用点 → 契约生成 → 前端 → 风险验证。

## 实现

后端 Password::parse 检查字符数、完整密码弱名单，parse_for_subjects 补账号关联检查。
Argon2id 使用 RustCrypto 实现，随机盐，PHC 字符串；TEXT 字段无需扩容。现有 bcrypt 哈希只做原样验证，不再尝试转大写；新写入统一 Argon2id。
本地 SecLists 固定版本样本只保存符合新长度的 SHA-256，精确匹配、无网络请求，明确有限覆盖。
前端 @tsz/shared 统一 15–128 code point 校验、提示和错误码翻译；不维护弱密码名单。
注册/重置/改密业务 JSON 字段不变，新增 password_too_weak/password_compromised 400。
通用弱密码检查在 OTP verify 前；重置时先不消费地验证 OTP，再检查全部已绑定联系方式，最后单次消费，兼顾反枚举和失败重试。管理员改密成功整页跳登录。
管理员安全版本需要成对迁移；登录令牌携带版本，所有受保护请求校验版本，密码更新与 refresh 撤销同事务。

## 契约与发布

OpenAPI 与前端快照使用原生工具生成。密码格式语义改变、大小写严格验证不兼容旧前端的大写提交，应先准备前端再发布后端，正式切换期间暂停密码写入口并同步切换服务，不能把混合版本当作可用。本任务不发布。
管理员安全版本先迁移后运行新代码，管理员安全版本已经递增时 down 迁移禁止删除列；回退旧后端会恢复旧密码策略并使 Argon2id 账号无法登录，不能直接回退，应保留支持新哈希的修复版本。禁止清库解决回退。

## 验收

- Rust 密码原语：14/15/128/129、Unicode、大小写、空格、盐随机性、泄露/账号关联拒绝。
- 受影响 handler：同一码弱密码拒绝后可重试、重置与改密会话失效、事务/并发保障。
- pnpm test/typecheck/lint，前端表单原样提交、稳定错误映射、契约测试。
- cargo fmt --check；SQLX_OFFLINE=true cargo clippy --locked --all-targets --all-features -- -D warnings；隔离 PG/Redis 中跑受影响集成测试。
- pnpm build + next start；真实注册/登录/重置/改密验收，测试仅使用本任务隔离数据。

## 实际验证结果

- 前端受影响表单与共享校验测试通过；API-client 422 项通过；typecheck、lint、web/admin build 通过。
- 全仓普通测试复测（maxWorkers=2）：3046 通过、2 跳过、1 项无关语音编辑测试超时；该 PauseInteraction 文件单独复测 10 项全通过，未改超时阈值或断言。
- Playwright auth-flows/forgot-password/account-security：28 项通过。
- 后端 lib + 21 个受影响 integration targets：524 项通过；清理装配依赖后相关管理员 targets 再次通过。fmt、离线 Clippy 全目标全功能通过。
- SQLx 缓存使用任务隔离 PostgreSQL 原生生成；迁移 up 与受保护 down 在隔离测试中验证。
- 真实前后端 API 验收：21 个步骤通过，包括同一码弱密码重试、大小写/空格、重置/改密后旧密码和 access/refresh 失效。
- 本地预览：web 3004、admin 3005、backend 8384；PG 52155/tsz_password_policy、Redis 52156/0，均为本任务独立资源。已有样式服务未接管。
- 本地泄露数据基于固定版本百万条样本，仅保留满足长度的 10,908 个不同哈希，属于有限覆盖；来源与许可见后端 src/platform/password-data。
- 运行记录、二进制哈希和验收结果在 /tmp/tsz-password-policy-20261001/manifest.json 与 verification.json；以上为实现阶段记录，提交状态以 Git 历史为准，尚未推送或部署。
