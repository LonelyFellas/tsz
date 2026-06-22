# 基础框架补全计划

对当前 monorepo(Next 16 + React 19 + TanStack Query + ESLint flat + Prettier + Vitest + GitHub Actions)的工程化补全,分五个 tier、各用一个独立 session 完成。

每份文档都是**可独立执行的实施规范**:含背景、要新增/修改的文件、命令、以及验收标准(Definition of Done)。执行某个 tier 时,只需读对应那一份。

## 进度

| Tier | 主题                     | 文档                                                                 | 状态    |
| ---- | ------------------------ | -------------------------------------------------------------------- | ------- |
| 1    | 一致性与防护             | [tier1-consistency-and-guards.md](./tier1-consistency-and-guards.md) | ✅ 完成 |
| 2    | Turborepo 任务编排与缓存 | [tier2-turborepo.md](./tier2-turborepo.md)                           | ✅ 完成 |
| 3    | Next 应用健壮性          | [tier3-nextjs-robustness.md](./tier3-nextjs-robustness.md)           | ✅ 完成 |
| 4    | 文档与提交规范           | [tier4-docs-and-conventions.md](./tier4-docs-and-conventions.md)     | ✅ 完成 |
| 5    | 测试面扩展(应用 + E2E)   | [tier5-testing-expansion.md](./tier5-testing-expansion.md)           | ✅ 完成 |

> 建议顺序:1 → 2 → 3 → 4 → 5。其中有两处跨 tier 依赖:
>
> - **Tier 4 的 commitlint** 复用 **Tier 1 的 lefthook**(加一个 `commit-msg` 钩子)。若先做 Tier 4,需先按 Tier 1 装好 lefthook。
> - **Tier 2 的 turbo** 会改写根 `package.json` 的 `lint/typecheck/build` 命令;Tier 1 的 pre-commit、Tier 5 的测试脚本都复用这些命令,顺序在前可少返工。

## 仓库现状(执行时的已知前提)

- 包管理:`pnpm@10.33.0`(根 `package.json` 的 `packageManager` 字段),工作区 `apps/*` + `packages/*`。
- Node:CI 用 **22**,本地开发用 25。Tier 1 会统一约束。
- 已有根脚本:`dev` / `dev:all` / `build` / `lint` / `typecheck` / `format` / `format:check` / `test` / `test:watch` / `test:cov`。
- 子项目脚本约定:每个可测/可检的包都有 `lint`、`typecheck`,部分有 `test`、`build`。
- CI:`.github/workflows/ci.yml`,顺序为 install → lint → typecheck → format:check → test:cov → build。
- 覆盖率:`vitest.config.ts` 对 `packages/{shared,ui,api-client}` 设了 100% 门槛;`apps/web` 当前仅有 1 个集成测试样板。

## 通用验收

每个 tier 完成后,以下命令必须全绿:

```bash
pnpm lint && pnpm typecheck && pnpm format:check && pnpm test:cov && pnpm build
```

完成一个 tier 后,把上面进度表对应行改成 ✅,并按现有 Conventional Commits 风格提交(如 `chore: add tier1 consistency tooling`)。
