# AGENTS.md

天生会背 — 词汇学习平台前端 monorepo（pnpm + turbo，Node = 24.19.0）。
后端正从独立仓库 tsz-go（Go）重写迁移至 tsz-rust（Rust，同上级目录），
前端已切到 tsz-rust 对接；具体端点能力以当前后端 OpenAPI、实现及 api-client 契约测试
PENDING 白名单为准。本仓库负责前端与部署编排。

## 工作流

### 按任务选择路径

- **小改动**：明确结果 → 最小修改 → 定向验证 → 按授权交付。不强制评估、写 spec 或新增测试。
- **Bug**：固定版本与现场 → 复现失败 → 最小修复 → 原路径回归；使用 [bugfix](.agents/skills/bugfix/SKILL.md)，不重走新功能评估。
- **新功能/跨仓改动**：查已有能力与依赖 → 确定契约和必要设计 → 实现 → 风险验证与真实联调 → 按授权交付/发布。使用 [feature](.agents/skills/feature/SKILL.md)；接口变化按需使用 [contract-sync](.agents/skills/contract-sync/SKILL.md)。

新任务先 `git fetch origin`，从最新 `origin/main` 创建独立任务分支和 worktree，默认 `codex/<slug>`；已有本任务 worktree/PR 必须复用。通过 PR 进入 main，不在 main 或 dev 直接开发、提交、推送。保留用户改动，每个 checkout/index 保持一个写入者。

### 一份记录，连续推进

- 以用户能力或问题作为一个任务；跨仓只维护一份主记录，另一仓及相关 PR 引用，不分别重做需求和计划。
- 小改动直接用任务描述；一般单模块改动在对话或已有记录中写清方案与验收；复杂跨仓功能或契约、权限、迁移等高风险改动在 `docs/features/<slug>/` 维护必要的需求与设计，按需要拆文件，不按文档数量验收。
- 主记录只保留目标/范围、可观察验收标准、剩余依赖、相关 PR、当前阶段、阻塞与下一步；状态默认留在对话或已有文档/Issue/PR，不新增空台账。
- 多步骤任务先查已有能力，区分已在主线、可复用、小改动、新工作、阻塞，给出剩余关键路径与验证方式。只对较长任务估时；超出估计 50% 时说明原因和修订路径，继续已授权工作。
- Agent 负责调查、选技能、实现与验证，默认在当前会话连续推进；用户不必指定技能或逐阶段催办。只有影响范围、产品行为、不可逆风险或缺少授权的决定才提问，等待时继续独立工作。
- 沿用会话中已有授权，不因换技能、跨仓或等待重新确认。「开 PR」「ship」包含必要的提交/推送/PR；仅实施不包含外部交付，合并与部署须有对应授权。缺少决定时先完成可做的结果，再一次性说明具体缺项。

### 验证与完成条件

- 迭代只跑受影响检查；代码、配置、依赖与环境未变时复用有效结果。接近完成统一安排最终门；紧接已授权 ship 时由原生 hooks 承接其覆盖项，不额外手工重复全量检查。hooks 和 CI 始终正常执行，不能以复用结果为由绕过。
- 纯文档/规则改动检查格式、引用与行为一致性，不额外跑运行时套件；提交/推送时仍服从原生 hooks。真实权限、异常、数据与并发风险决定测试范围，不按数量或覆盖率堆测试。
- 独立审查在 [ship](.agents/skills/ship/SKILL.md) 中对精确提交做一次；实施收尾由当前 Agent 核对验收，不再叠加一轮独立审查。修复后定向验证并增量复查，范围扩大或初审假设失效才全量重审。
- 跨仓功能的可用性验收须证明相关真实用户链路；涉及持久化时重新请求/重新打开确认存储结果。按 [真实后端验收](.agents/skills/test/references/real-backend-acceptance.md) 核实版本、代理、mock 与数据隔离；没有环境或凭据就标明未验证/阻塞，不把两仓测试通过或 mock 成功当作联调通过。
- 配套发布按 [配套发布清单](.agents/skills/contract-sync/references/paired-release.md) 验证新旧组合与回退限制，再决定顺序；不以「同批发布」替代兼容验证。
- 分别报告代码验证、真实联调、PR/CI、各组件部署验收状态；未涉及的阶段不补做。完成以本次约定终点为准：仅评估交付方案，开 PR 交付 PR 与实际检查状态，部署交付实际版本与验收。失败、未运行和未知分别说明。

### tshb-test 临时测试数据

- 在 tshb-test 做临时测试（含联调、部署冒烟）时，验证结束后自动彻底清理本次测试数据；同一已授权测试范围内的清理无需再次确认。正常结束、验证失败或中断均须执行清理；中断后恢复时先核实已创建与已清理的资源。
- 创建前确定任务唯一标识、精确资源 ID、归属、依赖及清理方式，优先使用独立 fixture。不得把正常业务数据、共享测试账号或共享资源纳入临时数据范围；必要的状态修改须记录原值并恢复。
- OSS 测试语音、图片等统一使用 `tshb-test-assets/temporary-tests/<run-id>/`，按需在批次内分 `audio/`、`images/`；开始前运行 `scripts/cleanup-test-oss.py --run-id <run-id> --check-permissions`，通过后才创建资源。未接入此隔离前缀的线上接口先补齐隔离能力，不改正常存储根目录，也不把普通目录当作可整批删除的测试目录。
- 结束时自动运行 `scripts/cleanup-test-oss.py --run-id <run-id> --apply` 删除全部对象版本与删除标记、独立复查并保留脱敏回执，然后清理对应数据库/缓存登记。无需逐次确认或通知；正常清理合并进最终验收，只有实际失败、残留或影响正常数据的情况单独报告。一次性受限 OSS 权限见 [临时资源清理](.agents/skills/test/references/oss-test-resources.md)。
- 清理覆盖本次新建数据及其专属依赖：测试账号与会话、词条与发布快照、关联记录、幂等响应、outbox、仅属于临时 fixture 的审计记录，以及录音/文件对象、上传暂存、对应缓存、本地样本和专用浏览器数据。撤回、归档、禁用或等待回收宽限期不能代替彻底清理；不为测试修改通用保留策略。
- 删除前核实环境、归属、外部引用与并发写入风险，按精确 ID 和依赖顺序定向清理；必要时先做事务回滚预演，对象删除确认后再移除其登记。禁止仅凭词面、时间或模糊前缀猜测删除范围，禁止清空共享库/缓存或关闭约束；保留正常业务数据、共享文件及既有运维备份、部署记录和系统日志。
- 清理后独立复查数据库实体及相关引用、对象存储和缓存无本次临时数据残留，并核实受保护的正常数据仍在；清除测试原始录音、凭据和完整数据副本，只保留脱敏验收证据与清理回执。
- 无法证明归属、发现正常业务引用或清理失败时，停止有风险的删除，继续可独立完成的安全清理，保留必要定位信息并明确报告残留、原因与下一步；存在残留时不得宣称已清理完成。只有扩大范围或影响正常业务数据时才另行确认。

## 布局

- `apps/web` — C 端，Next App Router + tailwind + `@tsz/ui`。对体验/性能/SEO 有硬要求。
- `apps/admin` — 平台后台，Vite + React Router + TanStack Query + **Ant Design 6**（品牌蓝 #2053FF）。
- `packages/types` — 后端 wire 类型镜像；`packages/shared` — 共享逻辑（含鉴权内核）；
  `packages/api-client` — 请求层；`packages/ui` — web 专用组件库；`packages/config` — 共享配置。
- `e2e` — Playwright（`@tsz/e2e`）。

## 常用命令

- `pnpm dev`（web）/ `pnpm dev:admin` / `pnpm dev:all`
- `pnpm test` / `pnpm test:cov`（生成覆盖率报告，规则与 CI 一致）/ `pnpm test:e2e`
- `pnpm typecheck` / `pnpm lint` / `pnpm format`
- **本地验收 web 用 `pnpm build` + `next start`，不要用 `next dev`**（Turbopack 内存暴涨会拖死机器）。

## 硬约定（违反会被 review 打回）

### 类型与数据层

- `@tsz/types` 全部 **snake_case，1:1 镜像后端的 JSON wire 格式**，前端不做命名转换层
  （http 层纯 parse）。组件 props / 本地 state 是例外，用 camelCase。
- 复用优先级：逻辑 → `@tsz/shared`，类型 → `@tsz/types`，请求 → `@tsz/api-client`；
  UI 按端分叉：web → `@tsz/ui`，admin → Ant Design。

### 鉴权

- 鉴权内核在 `@tsz/shared/auth`，web/admin 共用；web 的 `lib/request`、`stores/user` 与
  admin 的 `(console)` 路由组门禁都是薄壳，逻辑改动进内核，不在壳里散落。
- 用**客户端路由守卫**而非 Next 服务端 middleware（refresh cookie 有 path 限制，服务端拿不到）。
- 受保护页内的终止操作（注销账号、登出等）用 `window.location` **整页跳转**，
  避免 RouteGuard/GuestGuard 竞态。

### web（Next）

- C 端视觉与交互统一遵循 [apps/web/style.md](apps/web/style.md)；新增页面与正在调整的组件按此接入。
- UI 按落地页设计体系做：Apple 风 token（#0071e3 / rounded-3xl / animate-in）；
  原型图只作功能参照，不照搬视觉，功能不能少。
- `.dark` 主题 class 加在 `<html>` 上会被 React 水合剥掉：须在水合后的 layout effect
  里重新断言；`useTheme` 状态从 localStorage 派生，不读 DOM。

### admin（Ant Design）

- 后台及共享语音编辑器使用 Ant Design 6 与 `@ant-design/icons`；品牌蓝 #2053FF、中文 locale 与 Day.js 集中配置。
- 普通表单使用 AntD Form；复杂草稿继续由业务模型持有。仅更换 UI 组件，不改变业务行为、接口或持久化格式。
- reader 入口不依赖 AntD、MUI、Emotion 或后台 Provider；C 端保留现有设计体系。
- 禁止引入 tailwind / `@tsz/ui`。业务数组以稳定业务 ID 为 key；服务端分页保持 1 基。
- 日期范围只有完整有效或明确清空时提交。弹窗 pending、取消及失败保留现有业务状态。
- 隐藏面板采用 hidden / aria-hidden / inert；字段定位聚焦实际控件，测试保留 matchMedia / ResizeObserver 垫片。

## 质量门

- git hooks（lefthook）：pre-commit = prettier + eslint（按包），commit-msg = commitlint
  （conventional commits），pre-push 的实际检查以 `lefthook.yml` 为准（当前为 typecheck + 普通测试）。e2e 由 CI 兜底。
- **绝不绕过钩子**（`LEFTHOOK=0`、`--no-verify` 一律禁止）。push 报
  `failed to push some refs` 时读取完整输出，区分 hooks、远端拒绝、网络和认证问题，修复根因后重推。
- 覆盖率规则以根 `vitest.shared-config.ts` 及各项目 Vitest 配置为准：当前生成报告，不设百分比门槛。
  不为提高数字补弱断言，也不通过 exclude 有分支逻辑来掩盖缺失测试。
- 测试以可观察风险、回归价值和关键契约为中心；覆盖率用于发现盲区，不为提高数字堆叠低价值测试。

## API 文档

- 权威来源：tsz-rust 仓库 `docs/openapi.json`（`pnpm --filter @tsz/api-client sync:openapi`
  同步为 `openapi.snapshot.json`，契约测试以此对账）；对接节奏见 tsz-rust
  `docs/frontend-integration.md`。
- 本地 dev 代理默认 `http://localhost:8383/api/v1`（本地 `cargo run` 的 tsz-rust；
  可用 `BACKEND_API_URL` 覆盖）。旧 tsz-go 的 Swagger（8080 SSH 隧道）仅存量参考。

## 部署

- 部署流程见 `.agents/skills/deploy/SKILL.md`：从 GitHub main 的精确提交导出本地构建，rsync 到 tshb-test；服务器不拉 Git 仓库。
- 生产环境 `.env` 的 `COOKIE_SECURE` **禁止为 false**（false 仅限纯 HTTP 的测试环境）。
