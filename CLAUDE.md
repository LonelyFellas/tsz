# CLAUDE.md

天生会背 — 词汇学习平台前端 monorepo（pnpm + turbo，Node ≥ 22）。
后端是独立仓库 tsz-go（Go），本仓库只管前端与部署编排。

## 布局

- `apps/web` — C 端，Next App Router + tailwind + `@tsz/ui`。对体验/性能/SEO 有硬要求。
- `apps/admin` — 平台后台，Vite + React Router + TanStack Query + **antd v6**（ConfigProvider 品牌蓝 #0071e3）。
- `packages/types` — 后端 wire 类型镜像；`packages/shared` — 共享逻辑（含鉴权内核）；
  `packages/api-client` — 请求层；`packages/ui` — web 专用组件库；`packages/config` — 共享配置。
- `e2e` — Playwright（`@tsz/e2e`）。

## 常用命令

- `pnpm dev`（web）/ `pnpm dev:admin` / `pnpm dev:all`
- `pnpm test` / `pnpm test:cov`（带覆盖率门槛，与 CI 一致）/ `pnpm test:e2e`
- `pnpm typecheck` / `pnpm lint` / `pnpm format`
- **本地验收 web 用 `pnpm build` + `next start`，不要用 `next dev`**（Turbopack 内存暴涨会拖死机器）。

## 硬约定（违反会被 review 打回）

### 类型与数据层

- `@tsz/types` 全部 **snake_case，1:1 镜像后端 Go 的 JSON wire 格式**，前端不做命名转换层
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
  （conventional commits），pre-push = typecheck + test:cov。e2e 由 CI 兜底。
- **绝不绕过钩子**（`LEFTHOOK=0`、`--no-verify` 一律禁止）。push 报
  `failed to push some refs` 时默认是 hook 挂了，不是网络——读输出、修根因、重推。
- 覆盖率门槛（根 `vitest.config.ts`）：`packages/**` 100%；`apps/*/src` 业务逻辑层
  （features/lib/stores）90%。纯装配/mock/静态展示文件按约定加 coverage exclude
  并附 TODO 注释说明补测条件；有逻辑分支的必须补测，不许 exclude。
- 默认分支 `main`，一律走 PR；绝不直接提交/推送 main。

## API 文档

- 权威来源：Swagger `http://localhost:8080/docs`（spec 为 `/docs/openapi.yaml`；
  8080 是到测试服后端的 SSH 隧道）。源文件在 tsz-go 仓库 `docs/api.md`。

## 部署

- 部署流程见 `.claude/skills/deploy`（测试服 tshb-test 只拉 **Gitee** 镜像，不拉 GitHub）。
- 生产环境 `.env` 的 `COOKIE_SECURE` **禁止为 false**（false 仅限纯 HTTP 的测试环境）。
