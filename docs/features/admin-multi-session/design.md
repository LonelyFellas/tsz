# Admin 多端登录设计评估

## 基线与定档

2026-10-07 已 fetch 并按以下主线核对：

- 前端 `tsz`：`5b2c993a4a68eef5f51cd279b2cb80eed4c47599`。
- 后端 `tsz-rust`：`b1bb101565a0d566917b3b48aac8753a63c215b4`；后端本地 checkout 落后主线，关键行为以 `git show origin/main:<path>` 核对。

涉及鉴权、跨模块安全变更及前端失败反馈，按重档记录需求与设计。代码量预计较小至中等，验证重点是撤销语义和并发，而非新增页面。
评估后已按用户授权完成实现；实际验证与未验证边界见 [acceptance.md](acceptance.md)，未核对或改变部署版本。

## 依赖与剩余关键路径

| 部分                                           | 分类         | 处理                                                   |
| ---------------------------------------------- | ------------ | ------------------------------------------------------ |
| `admin_refresh_tokens` 存储、独立 Cookie、轮换 | 已在主线     | 直接复用；表无每账号仅一条活跃记录的唯一约束           |
| `security_version` 与访问令牌校验              | 已在主线     | 复用全账号失效机制，不新增黑名单或会话中间件           |
| 密码修改/重置导致全端失效                      | 已在主线     | 扩展多会话回归，不重写密码流程                         |
| 登录签发策略                                   | 小改动       | 去掉旧会话清场，保留原子签发保护                       |
| 全部退出与禁用                                 | 新增安全行为 | 在账号行锁保护下，同事务递增安全版本、吊销全部刷新令牌 |
| 头像菜单与请求封装                             | 可直接复用   | 保留现有两个退出入口与 API                             |
| 全部退出失败反馈                               | 小改动       | 服务端失败显示可重试错误，不静默完成全部退出           |
| 多设备与并发回归                               | 新工作       | 两套独立 Cookie/访问令牌验证，覆盖撤销事务和竞争条件   |

关键路径：会话语义确定 → 后端集中修改签发/撤销事务 → 定向集成测试 → 前端失败反馈 → 真后端双浏览器验收 → 一次最终质量门。
粗估实施及验证为 1–2 个工作日，前提是隔离 PostgreSQL/Redis、测试账号及构建环境可用；不包含 CI 排队、合并与部署等待。

## 后端方案

### 多会话签发

`src/admin/session.rs`：将 `revoke_all_and_insert` 替换为语义清晰的受保护签发方法，例如 `insert_for_active_admin(row, expected_security_version)`。
同一事务先锁 `admins` 行，校验安全版本与 active 状态，再插入新刷新令牌；移除“吊销该管理员全部旧刷新令牌”的 SQL。
不能直接改调当前无保护的 `insert`，否则会丢掉与改密、禁用、全部退出之间的串行化与版本校验。
`AdminSessionService::issue` 保留 `security_version` 输入；签发不会递增账号安全版本。登录 handler 更新 Q1 清场注释。
同账号不同登录各持独立刷新令牌链；每条链继承自己的 `expires_at`，维持现有轮换和重放检测。

### 全部退出

`src/admin/session.rs`、`src/admin/auth/handler.rs`：增加原子的全账号撤销操作，例如 `logout_all(admin_id, expected_security_version)`。
锁账号并核对请求令牌的版本，同事务执行 `security_version + 1` 与全部刷新令牌吊销，提交成功后清除当前 Cookie。
旧版本的迟到请求不得在用户重新登录后再次撤销新会话；版本不匹配返回 401，不修改数据库。
访问令牌已有版本校验，因此无需每次请求新增会话表查询。

契约细节：第一次成功返回 204；同一个已失效 Bearer 重试可返回现有 401。
现有“幂等”文案和测试须说明认证前提，不能继续承诺同一已撤销令牌重复调用总是 204。
网络丢失响应时，前端只能报告结果未确认；随后发现登录失效应进入重新登录流程，不能把所有网络失败伪装成成功。

### 禁用与密码变更

`src/admin/accounts/repository.rs::set_status`：保留现有返回 DTO，在禁用操作中以事务完成状态写入、安全版本递增、刷新令牌吊销；重新启用不恢复任何旧凭证。
`src/admin/repository.rs::set_password_transaction` 已将密码、安全版本、刷新吊销放在同一事务，直接复用；超级管理员重置密码沿用现有流程。
集中检查 `issue`、`consume_and_insert` 与全量撤销的锁顺序，统一先锁账号，再访问刷新记录。
`consume_and_insert` 已锁账号；新增/保留撤销事务后，刷新先提交则新记录被撤销，撤销先提交则旧刷新记录不可消费。
测试还要覆盖登录先读取身份、后等待账号锁的交错情况：安全版本变化必须使迟到签发失败。

独立审查补齐一处前后端衔接：`peek_admin_id` 对已撤销刷新凭证直接返回无效，使真实禁用后刷新返回 401 并触发前端清态；保留已轮换但未撤销凭证进入重放检测的路径。未撤销凭证对应禁用账号时仍保留现有 403 分支。

## 前端方案

复用 `packages/api-client/src/admin.ts` 的 `logout`/`logoutAll`，不新增类型和请求参数。
`apps/admin/src/features/auth/useAdminLogout.ts`：全部退出仅在服务端成功后执行本地成功收尾；失败向 UI 传递错误，不沿用无条件 `finally` 跳转。
`AdminHeader.tsx` 的确认弹窗展示“未能确认所有设备已退出，请重试”等错误并保留重试路径；若鉴权已经失效，沿用鉴权内核重新登录行为。
普通退出继续支持尽力通知后端并清理本地态。成功路径保持 `window.location.replace`，避免路由守卫竞态。
不新增设备管理页；不修改 C 端策略或将 Admin 改为滑动续期。

## API、数据与兼容性

- 不新增端点、字段、枚举或迁移；现有表可以存多条活跃会话，现有 `security_version` 已能撤销访问令牌。
- `POST /api/v1/admin/auth/login`：请求/响应不变，副作用改为保留其他会话。
- `POST /api/v1/admin/auth/logout-all`：请求/响应形状不变，增加访问令牌失效效果；旧 Bearer 重试会返回已声明的 401。
- `PATCH /api/v1/admin/admins/{admin_id}/status`：形状不变，禁用增加永久撤销旧登录效果。
- 改密、重置密码、refresh、普通 logout 的 wire 形状不变；不增加各端 token 命名转换。
- 更新后端受影响的 OpenAPI 行为描述及 `docs/admin-design.md` 中 Q1；保留历史决策但注明被本需求替代，不顺带重写其他过时章节。
- SQLx 查询宏变更时更新对应离线元数据，使用现有生成流程；不是数据库 schema 迁移。

建议先发布前端失败反馈，再发布后端新行为。旧前端配新后端可以登录/退出，但仍有全端退出失败被吞掉的问题；新前端配旧后端接口兼容，但仍会互踢，不能宣告需求完成。
后端混合新旧版本运行时，旧实例登录仍可能清场；功能验收须确认所有承接认证流量的实例已更新。
回退无需数据库 down 迁移；已经递增的安全版本及撤销记录不得还原。回退后不会立刻清掉已形成的多会话，旧版下一次登录才恢复清场行为。

## 风险与范围边界

- 多端增加账号同时持有的有效凭证数量；现有密码加短信验证码登录、绝对刷新期限、全端撤销继续保留。
- 当前前端 single-flight 仅覆盖一个 runtime，同浏览器多标签页共享 Cookie 仍可能竞争刷新；独立设备不共享 Cookie，不会因此竞争同一刷新令牌。该既有问题不计入已解决能力，实际验收发现后单独评估。
- 窗口外旧刷新令牌重放会吊销该管理员全部刷新会话，多端下影响面扩大；本期保留该安全策略，用多会话测试证明范围，不新增令牌家族模型。
- 普通退出不提供单会话访问令牌即时撤销；仅保护本地退出和刷新失效。若要求该更强语义，需另评估稳定会话 ID 与逐请求校验，不能通过增加账号版本误踢其他设备。
- 不引入设备指纹、固定设备上限、实时踢人推送、MFA 重构、跨设备编辑合并。

## 验收

以下为实施阶段命令，执行结果见验收记录。后端在从上述主线创建的任务 worktree 执行；`DATABASE_URL` 必须指向隔离测试 PostgreSQL，测试用户具有创建测试数据库权限，迁移所需扩展与 CI 一致。需要 Redis/验证码的真实登录验收使用隔离配置及测试账号，不使用生产短信/生产数据库。

```sh
cargo test --locked --all-features --test admin_session_service --test admin_session_repository --test admin_session_reuse_detection --test admin_login_handler --test admin_refresh_handler --test admin_logout_all_handler --test admin_accounts_status_handler --test admin_accounts_reset_password_handler
cargo fmt --all -- --check
```

在这些已有测试目标中替换“第二次登录吊销第一次”断言，补充两条有效会话独立轮换/退出、全端退出旧访问令牌拒绝、禁用再启用不可复活、迟到请求及事务回滚用例；已有改密回归按实际测试位置一并运行。预期全部通过，不能仅断言数据库活跃行数量。

前端仓库执行：

```sh
pnpm --filter @tsz/admin test src/features/auth/AdminHeader.test.tsx
pnpm --filter @tsz/shared test src/auth/adminRuntime.test.ts src/auth/tokenManager.test.ts
pnpm --filter @tsz/admin typecheck
```

预期确认取消不发请求、成功整页退出、全端退出失败明确提示且能重试；普通退出行为保持。最终按两仓届时实际质量门完整验证一次，不绕过 hooks、不用此次定向命令代替最终门禁。

真实行为验收：电脑浏览器与 iPad Safari 各自登录同一测试账号，跨访问令牌续期后分别访问后台；退出电脑确认 iPad 可继续；重登电脑后点全部退出，验证两端下一次请求均被拒。再分别验证改密、重置密码、禁用后启用；旁观管理员与 C 端保持正常。自动化可使用两个独立浏览器 context 验证同等会话隔离，但 iPad Safari 的设备体验仍需实机验收。
