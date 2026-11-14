# 环境核对：按证据选择检查

以下路径都相对已经核实的对应 checkout。这里只给诊断入口，不把历史运行记录作为当前值。

## 进程与产物

macOS 可用 `lsof -nP -iTCP:<port> -sTCP:LISTEN` 找监听 PID，再用 `ps -p <pid> -o pid=,ppid=,lstart=,comm=` 和 `lsof -a -p <pid> -d cwd,txt` 查启动时间、cwd/可执行文件。
Linux 用 `ss -ltnp`、`/proc/<pid>/cwd`、`/proc/<pid>/exe`；权限不足标明缺失，不擅自提权。
避免完整进程参数/环境转储，它们可能携带凭据。Next/Vite 子进程、旧 binary 或同仓不同 worktree 要分别核对。

现有 manifest/构建日志能证明版本就复用；mtime、端口、当前 HEAD 或 health 本身不能证明构建 SHA。
需要新进程才能绑定来源时，记录构建输入 SHA/差异和启动句柄，不擅自把原监听服务停掉。

## 前端配置与 mock

| 来源                                                           | 核对内容                                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `apps/web/next.config.mjs`                                     | `/api/v1` rewrites；`BACKEND_API_URL` 默认 `http://localhost:8383/api/v1`；同时核实构建时和启动时输入     |
| `apps/admin/vite.config.ts`、`apps/admin/src/lib/dev-proxy.ts` | 当前 mode 加载的 env、serve 代理、路径 rewrite、cookie domain；preview 的实际路由单独验证                 |
| `apps/admin/src/lib/env.ts`、`apps/admin/src/lib/env-flags.ts` | `VITE_API_BASE_URL` 默认 `/api/v1`；布尔值使用受支持的 `true`/`false`，不用 `0`/`TRUE` 猜含义             |
| 页面实际 client 装配                                           | 例如 `apps/web/src/features/placement/lib/client.ts` 当前直接创建 mock client；无真实接线的路径列为未接通 |

真实 admin 验收检查 `VITE_ADMIN_WORDS_MOCK`、`VITE_ADMIN_PART_OF_SPEECH_MOCK`、`VITE_ADMIN_TTS_MOCK` 的有效值为 false。
功能开关只核对目标路径需要的项；voice preview/editor、related search、audio upload 等状态不能用「全开」替代已实现契约。
还要检查 browser route 拦截、service worker 或 fixture 是否替换了目标请求；不得输出登录凭据。

## 服务端依赖

前端转发目标涉及 Rust/Agent 时，核实对应任务 checkout 并按需读取其 `.agents/skills/dev-env/SKILL.md`。数据库连接、启动迁移与 worker 规则由服务所属仓库维护，前端不复制默认值。

登录、refresh、草稿创建等会改变会话或数据。明确真实验收范围后可使用已有授权，不为每次请求重复确认；仅诊断时不自动写业务数据。
隔离库/Redis DB 或键空间仍有其他任务数据时不能整库清理。只删除本任务确实创建且可识别的 fixture；保留共享服务。

代码更新不代表运行进程已重启，必须核对进程与制品来源；旧验收记录中的 PID、端口、数据库及 Redis DB 不是本技能的默认设置。
