# B4 邀请奖励（COIN-10）验收

日期：2026-10-06。功能实现、隔离测试、真实链路及最终质量门已完成。

## 验收输入与交付边界

- 后端 `/Users/darwish/.codex/worktrees/coins-b1a/tsz-rust`，`codex/coins-b1a@1bf9ddb99afaa77efe9e1611a47fa0c00c46c52a` + 本批未提交差异。
- 前端 `/Users/darwish/Dev/tsz-core/tsz-coins-b1a`，`codex/coins-b1a@d528d47624db5ca9628ddb6afa04d2fc41111c90` + 本批未提交差异。
- 复用原工作区及 B1/B2 依赖，fetch 后两仓 origin/main 与交接一致。未修改旧 `9adc` 评估目录。
- 用户已确认归因及异常策略；授权包含实现、隔离测试和真实验收。验收阶段没有提交；随后用户已授权两仓本地提交，精确提交以各仓 Git 历史为准。没有推送、PR、合并或部署。
- 金额未获生产配置；`INVITATION_REWARD_ENABLED=false` 为默认，`INVITATION_REWARD_AMOUNT` 缺省也不发放；配置非法金额拒绝启动。测试用 37 币仅存在隔离进程，未设为默认值。

## 行为与覆盖

| 行为             | 实现与证据                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 固定邀请码、链接 | 本人显式 POST 生成随机码，重复/并发返回同一码；GET 不创建。本人邀请页可复制同源注册链接。`invitations_handler`、真实浏览器验证。                                       |
| 最终表单归因     | 链接预填，可修改/清空；登录与注册切换保留最终值。重复 URL 参数取首值；注册后不提供补绑或改绑接口。RegisterForm/AuthNavigation/page 回归和浏览器验证。                  |
| 验证码与无效码   | 无效邀请码在消费 OTP 前拒绝，用户可改码或清空继续；手机号/邮箱两种注册共用同一后端路径。真库及真实邮箱注册验证。                                                       |
| 同事务唯一奖励   | 先锁唯一现有邀请人，再创建不可被其他事务访问的新用户；关系、一次 System credit、角色及会话同事务。业务来源使用新用户 UUID，与请求幂等独立去重。                        |
| 并发与故障       | 同邮箱并发争夺不同邀请人仅一笔成功；账本 INSERT、refresh INSERT 故障及余额溢出回滚注册与奖励。七项 `invitations_handler` 真库测试覆盖。                                |
| 不可收奖         | 停用、任意 pending 注销（含到期）、已删除邀请人：注册继续，记录 `inviter_unavailable`，不发、不补；正常邀请人但配置关闭为 `reward_disabled`。                          |
| 不篡改历史       | 新账号唯一归属、禁止自邀、关系和码不可更新/删除。双方只留稳定 UUID，账号删除不级联删除记录；已发记录关联账本操作，不复制联系方式。                                     |
| 到期锁等待       | 邀请码唯一键等待可能跨注销截止；提交前复查真实数据库时间。回归先复现 200，再修复为 401 且零残留；独立增量复查确认关闭。                                                |
| 页面与隐私       | `/account/invitations` 不依赖学习引导；个人中心、钱包入口；真实已发/未发状态分开。金额十进制字符串，失败不伪装零或空记录，缓存按 user/主体隔离。记录无邮箱/手机/凭据。 |
| 保留 B1/B2       | 注册、注销门禁/worker、原账本 schema 定向回归通过；没有任意转账、补发接口、每日任务或词表业务扩展。                                                                    |

## 迁移、契约与配套

- 新迁移 `20261006030000_invitations`：邀请码及注册关系表、唯一索引、奖励金额/操作形状约束、不可修改触发器。存在码或关系时 down 拒绝删除证据。
- `invitations_schema` 两项、原 `coins_schema` 两项证明空库 up/down、不可改绑、自邀与金额约束、用户删除后保留。破坏性 down 仅在 sqlx 独立测试库；保留历史的 `coins_prepare` 只执行 up。
- 新增 `GET /me/invitations`、`POST /me/invitations/code`、`GET /me/invitations/records`；注册请求增可选 `invite_code`，原注册/登录响应不变。
- 原生 OpenAPI 导出与显式后端工作区的前端同步；新增严格 runtime schemas 和 BIGINT 校验。来源 SHA-256：`8bf959574542286788f300d31d7f1d53145978a7a2122889990f0eab9dacc5a1`。
- 与 B2 比较：旧 path 描述没有变化；旧 schemas 仅 `RegisterRequest` 的可选字段、`ErrorCode` 新增稳定错误。旧前端不传码可继续注册，响应形状完全保持。
- 新前端遇到旧邀请端点 404 明确显示不可用；但旧注册 DTO 会忽略未知邀请码，因此必须后端先发布、前端后发布，不能把新前端＋旧后端视为安全过渡组合。实际部署版本未查询，本批不执行发布。
- 已有码/关系后保留 schema，不回退到忽略邀请归因的旧后端；停止发奖使用关闭配置，不自动补发历史事件。仍须保留 B1b 到期门禁。未做旧二进制回退演练。

## 真实环境与证据

- 复用专用 Docker `tsz-coins-b1a-pg` / `tsz-coins-b1a-redis`，本次重启后实际回环端口 52640 / 52641。测试显式设置 DATABASE_URL、TEST_REDIS_URL 和 REDIS_URL；sqlx 为每个测试建独立库。
- 后端 `http://127.0.0.1:55623`，明确构建本任务 `tsz-rust` 后复制到 `/tmp/coins-b4-runtime/tsz-rust`；独立 cwd、随机测试签名密钥。来源与 binary hash 见 `backend-provenance.json`。
- Web `http://127.0.0.1:55624`：生产 build + next start，构建/运行 BACKEND_API_URL 均指向上述隔离后端；未使用 next dev。构建及启动日志保留。
- `real-browser.cjs` 没有注册任何 API route/mock。OTP 仍为项目本地 Mock sender，不代表真实短信/邮件送达。
- 七条真实流程：固定码与复制链接；重复 URL 参数/手动编辑/无效码不消费 OTP；新用户注册奖励；375px 页面及钱包；签署 37 币注销后新注册不发奖；撤销不补发；重启本任务后端关闭奖励后新注册记录未发。
- 4 个 `coins-b4-*` 测试用户均由正式注册 API 创建；余额只由邀请奖励服务产生，没有手改余额。一次注销申请由正式页面签署并通过正式接口撤销。测试数据及签署/账本保留于隔离库。
- SQL 核对：3 条邀请记录 = 已发 1 + 配置关闭 1 + 邀请人不可收奖 1；邀请人余额 37；关系与账本来源、收款主体、金额差异数为 0。
- 本任务 backend/web 进程及 PG/Redis 容器已停止，隔离数据和证据保留。未停止或修改其他任务服务。
- 证据 `/tmp/coins-b4-runtime/real-browser-result.json`、`fixtures.json`、`db-reconciliation.txt`、`invitations-mobile.png`、`wallet-mobile.png`。已目视确认稳定动画结束后的移动端布局，没有横向溢出。

## 质量门

- 后端：本批邀请 handler 7 项、schema 2 项通过；原注册 17、注销 gate 2、worker 5、coins schema 2 项定向通过。新增两个 target 纳入 identity 分区，固定 inventory 为 82；CI 18 项 Python 测试通过。
- SQLx prepare 成功、`.sqlx` 无增量差异；fmt、all-targets/all-features clippy（`-D warnings`）与 diff 检查通过。
- 后端完整回归覆盖全部 82 个集成 target，863 项通过、1 项既有真实 OSS 测试忽略；331 项单元/二进制测试通过，doc-tests 通过。实际完成 target 集合与 CI inventory 精确一致。
- 前端 api-client 471 项、注册/邀请相关 67 项、登录回跳 shared 28 项通过；全仓 typecheck/lint 通过（保留既有 warning），Web 生产构建通过。
- 全仓普通测试 227 文件：首轮 3358 通过、1 项未修改的 `V3SentenceTranslationsField.test.tsx` 在并行构建时超时、2 项既有 skip。该文件单并发 5 项复验全部通过，未改断言或时限。
- 前端 CI 模块/工作流测试 28 项通过；新增文件属于已有 web/packages 自动发现范围。独立 inventory 聚合命令因缺少 CI 产物参数未执行，不将其记为通过。
- 前后端独立只读审查及必要增量复查无未解决 P0–P2；提交后的精确 SHA 审查按 ship 技能执行，结论在交付回复中记录。

复验命令：

```bash
# 后端：重启任务容器后重新读取端口，显式配置隔离 DATABASE_URL / TEST_REDIS_URL / REDIS_URL
SQLX_OFFLINE=true cargo test --locked --all-features --test invitations_handler --test invitations_schema
SQLX_OFFLINE=true cargo test --locked --all-features
cargo fmt --all -- --check
SQLX_OFFLINE=true cargo clippy --locked --all-targets --all-features -- -D warnings
# 前端
pnpm --filter @tsz/api-client test
pnpm --filter @tsz/web test src/features/invitations/Invitations.test.tsx src/features/auth/components/RegisterForm.test.tsx src/features/auth/components/AuthNavigation.test.tsx src/features/auth/shared.test.ts
pnpm typecheck
pnpm lint
pnpm test --maxWorkers=4
```

真实脚本需先按 provenance 重建/启动本任务服务；每次运行创建新的 batch fixture，不能连接共享环境或把 37 币测试参数用于生产。

提交审查补充：独立 reviewer 在前端 `f2c0f21` 发现人工操作筛选误收录 `invitation_reward`，该值会被后台人工查询接口拒绝。筛选现已显式限定为 `manual_purchase/manual_reward/manual_reversal`，个人账户流水继续展示邀请奖励。新增回归先复现错误选项，修复后 Coins 页面 3 项与 Admin typecheck 通过；原全仓证据复用，最终修复提交由同一 reviewer 增量复查。
