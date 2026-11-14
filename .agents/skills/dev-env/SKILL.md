---
name: dev-env
description: 诊断或按授权准备 tsz 前端本地环境，核实 Web/Admin 构建、进程、API 代理与 mock；服务端数据和启动由对应仓库流程负责。
---

# 前端环境与真实请求去向

遵循 [AGENTS.md](../../../AGENTS.md)，复用主任务有效版本证据。诊断默认只读；明确要求启动/修复本地环境时完成必要可逆操作，不能接管未知进程或扩大到服务器部署。

1. 核实任务 checkout、SHA/脏差异、目标页面、实际 URL、监听 PID、进程 cwd/启动时间与构建来源。端口、mtime、HEAD 和 health 均不能单独证明运行版本，默认 3000/3001 只是查找起点。
2. 按 [环境核对](references/environment-checks.md) 核实 Next rewrites、Vite 当前 mode/代理、API 基地址及 cookie 路径，保留 `/api/v1` 前缀。preview/生产不能套用 dev 代理结论。
3. 检查构建开关、实际 client 装配、service worker 和浏览器请求拦截；关闭 env mock 不代表请求已真实化。用实际只读请求或 Network 证明目标链，不输出 token、cookie 或整份 env。
4. web 验收使用 `pnpm build` + `next start`，不使用 `next dev`。代理/构建输入变化需重建，不能用旧 `.next` 证明新配置。Admin 按实际启动模式验证路由。

涉及服务端时，从用户目标、Git 身份和工作树列表定位所选 tsz-rust/tsz-agent checkout，按需读取各自 `.agents/skills/dev-env/SKILL.md`；不能从前端健康或代理成功推断数据库隔离、迁移安全及 worker 可用。缺少配套环境就明确未验证项。

只停止/重启本任务拥有且身份明确的进程；记录新服务句柄、日志与清理方式。仅诊断不写业务数据；授权验收的数据清理遵循项目规则，不批量清共享库/缓存或杀原服务。
交付「页面 → URL/进程 → 构建版本 → API 去向 → mock → 已验证/待验证」。真实页面与持久化验收按 [真实后端验收](../test/references/real-backend-acceptance.md)，契约疑点按 [contract-sync](../contract-sync/SKILL.md)。
