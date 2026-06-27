# 天生会背(tsz)

词汇学习平台 —— 师生合一前台(`apps/web`)+ 平台后台(`apps/admin`),pnpm monorepo,Turborepo 任务编排。

## 技术栈

- Next.js 16(App Router)+ React 19 + TypeScript
- TanStack Query(数据请求)、Zustand(客户端状态)
- Tailwind CSS、共享组件库 `@tsz/ui`
- Vitest(单测,`packages/{shared,ui,api-client}` 100% 覆盖门槛)、ESLint flat + Prettier
- GitHub Actions CI、Turborepo(任务编排与缓存)
- lefthook(Git 钩子)+ commitlint(强制 Conventional Commits)

## 目录结构

- `apps/web` —— 师生合一应用。`app/` 只放路由薄壳,逻辑沉到 `features/<域>`(`auth` / `class` / `practice` / `stats` / `task` / `wordlist`)。
- `apps/admin` —— 平台后台(词库/词表/用户/审核)。
- `packages/types` —— 领域模型(User/Word/WordList/Task/...)。
- `packages/api-client` —— 运行环境无关的请求层。
- `packages/ui` —— 无业务基础组件。
- `packages/shared` —— 纯工具与常量。
- `packages/config` —— 共享 tsconfig / eslint / prettier。

## 常用命令

| 命令             | 作用               |
| ---------------- | ------------------ |
| `pnpm dev`       | 启动 web(:3000)    |
| `pnpm dev:admin` | 启动 admin(:3001)  |
| `pnpm dev:all`   | 同时启动所有应用   |
| `pnpm lint`      | 全仓 ESLint        |
| `pnpm typecheck` | 全仓类型检查       |
| `pnpm test`      | 单元测试           |
| `pnpm test:cov`  | 带覆盖率门槛的测试 |
| `pnpm format`    | Prettier 格式化    |
| `pnpm build`     | 构建全部应用       |

> 上述命令底层经 Turborepo 编排(`turbo run ...`),对外用法不变,且带任务缓存。

## 怎么加一个 feature

1. 在 `apps/web/src/features/<域>/` 下建 `components/`、`hooks/`、`data/`,用 `index.ts` 收口对外导出。
2. 数据请求:在 `hooks/` 用 TanStack Query 封装 `useXxx`,query key 集中在一个对象里(参考 `apps/web/src/features/wordlist/hooks/useWordLists.ts`)。
3. 路由:在 `app/` 对应位置建 `page.tsx`,只做组合 —— `import { XxxPage } from "@/features/<域>"`。
4. 角色差异:用权限判断控制操作显隐,不要按师生拆成两套组件。

## 环境变量

见 `apps/web/.env.example`。`apps/web` 在 `src/lib/env.ts` 对环境变量做了启动校验(缺失或非法会在启动时报错),新增变量请同步到 `.env.example` 与校验 schema。

## 提交规范

提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/),由 commitlint 在本地 `commit-msg` 钩子强制校验(如 `feat(web): ...`、`chore: ...`、`docs: ...`)。
