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

## 布局

- `apps/web` — C 端，Next App Router + tailwind + `@tsz/ui`。对体验/性能/SEO 有硬要求。
- `apps/admin` — 平台后台，Vite + React Router + TanStack Query + **antd v6**（ConfigProvider 品牌蓝 #2053FF，取自品牌规范的克莱因蓝）。
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
  UI 按端分叉：web → `@tsz/ui`，admin → antd 自带组件。

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

### admin（antd v6）

- **禁止引入 tailwind / `@tsz/ui`**，视觉以 antd 默认为准；admin 无 SEO 要求。
- React 19 下 antd v6 免补丁；dayjs 需显式安装。
- `Form.List` 的 key 用 `field.key` 而非 `name`；`noStyle` 的 `Form.Item` 上 `style` 无效；
  v6 `Alert` 的 `message` 改叫 `title`；两字按钮文案之间插空格。
- jsdom 测试需 `matchMedia` / `ResizeObserver` 垫片；大表格测试避免 `getByRole`（慢到超时）。

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
