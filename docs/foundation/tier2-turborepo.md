# Tier 2 · Turborepo 任务编排与缓存

**目标**:把根级 `pnpm -r <task>`(串行、无缓存)换成 turbo 驱动的**依赖感知任务图 + 本地/CI 缓存**。没改动的包不重复跑,CI 明显提速。

**预计改动**:新增 `turbo.json`,改写根 `package.json` 脚本,CI 增加 turbo 缓存。子项目脚本基本不变(turbo 调用各包已有的 `lint/typecheck/test/build`)。

---

## 1. 安装

```bash
pnpm add -Dw turbo
```

> 版本用当时 `npm view turbo version` 的最新稳定版(turbo 2.x)。

## 2. 根新增 `turbo.json`

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "stream",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "test:cov": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

说明:

- `^build` 表示「先构建依赖的上游包」。本仓的 `@tsz/*` 库是源码直引(`main` 指向 `src/index.ts`,Next 用 `transpilePackages` 直接编译),**不产物**,所以 `^build` 对它们其实是空操作 —— 保留是为将来若某包改为预编译时不必再调。若想更精简,可去掉 lint/typecheck 的 `dependsOn`。
- `outputs` 决定缓存哪些产物。`.next/cache` 要排除(它是 Next 自己的增量缓存,不应进 turbo 缓存)。
- `dev` 不缓存、常驻。

> 关键:turbo 缓存命中与否取决于输入(源文件 + 依赖 + 环境变量)。`packages/*` 是源码直引,改 `packages/ui` 会让依赖它的 `apps/web` 的 build 缓存失效——这正是我们要的。

## 3. 改写根 `package.json` 脚本

把聚合命令交给 turbo(保留 `dev`/`dev:admin` 的 filter 写法,turbo 的 dev 用 `--filter`):

```jsonc
{
  "scripts": {
    "dev": "turbo run dev --filter=@tsz/web",
    "dev:admin": "turbo run dev --filter=@tsz/admin",
    "dev:all": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:cov": "turbo run test:cov",
    "format": "prettier --write \"**/*.{ts,tsx,js,mjs,json,css,md}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,mjs,json,css,md}\""
  }
}
```

注意点:

- `format`/`format:check` **不要**交给 turbo——它是全仓单进程跑,无需任务图。保持原样。
- `test:cov` 现在是根 `vitest.config.ts` 一次性跑所有 project(覆盖率门槛在根配置)。**这与 turbo 的「每包独立 test」模型冲突**:turbo 会去各包跑各自的 `test:cov`,而各包没有该脚本。

  → 二选一:
  - **(推荐,改动小)** 让 `test` / `test:cov` 仍由根 vitest 跑,**不接入 turbo**:即根脚本保留 `"test:cov": "vitest run --coverage"`、`"test": "vitest run"`,只把 build/lint/typecheck 交给 turbo。覆盖率门槛逻辑不变。
  - (彻底)把测试拆成每包独立配置 + 各包 `test` 脚本,turbo 编排;覆盖率改用 turbo 汇总。成本高,非必要不做。

  本 tier **采用推荐方案**:turbo 只接管 `build`、`lint`、`typecheck`;`test`/`test:cov`/`format` 保持现状。对应 `turbo.json` 可删掉 test 相关 task。

## 4. `.gitignore` 增加 turbo 缓存目录

```
.turbo/
```

## 5. CI 接入 turbo 缓存

`.github/workflows/ci.yml` 在 `install` 之后、各检查步骤之前,加一步缓存 `.turbo`:

```yaml
- name: Restore turbo cache
  uses: actions/cache@v4
  with:
    path: .turbo
    key: turbo-${{ github.sha }}
    restore-keys: |
      turbo-
```

> 由于 lint/typecheck/build 现在走 turbo,二次 CI 运行中未改动的包会命中缓存直接跳过。`test:cov` 仍是根 vitest 全量跑。
>
> 进阶(可选,不在本 tier 范围):turbo Remote Cache(Vercel 或自建),让本地与 CI 共享缓存。

---

## 验收(Definition of Done)

1. 新增 `turbo.json`、`turbo` 在 devDependencies、`.gitignore` 含 `.turbo/`。
2. 根脚本:`build`/`lint`/`typecheck` 走 `turbo run`;`test`/`test:cov`/`format`/`format:check` 保持原样。
3. 连续两次 `pnpm build`:第二次应大量出现 `cache hit, replaying logs`(FULL TURBO)。
4. 改动 `packages/ui/src/Button.tsx` 后再 `pnpm build`:`@tsz/ui` 及依赖它的 `@tsz/web` 缓存失效重跑,其它命中。
5. CI 跑通,且第二次运行可见 turbo 缓存恢复。
6. 通用验收命令全绿:
   ```bash
   pnpm lint && pnpm typecheck && pnpm format:check && pnpm test:cov && pnpm build
   ```
7. 更新 `docs/foundation/README.md` 进度表 Tier 2 → ✅,提交(如 `chore: adopt turborepo for task orchestration and caching`)。

## 注意事项 / 陷阱

- turbo 默认会读 `.env`,但缓存键**不**自动包含所有 env;若某任务依赖特定环境变量,在该 task 的 `env` 字段声明,避免缓存错配。
- `transpilePackages` 模型下 `^build` 是空操作,别被「为什么 ^build 没构建出东西」困惑——库就是源码直引。
- 如果接 Tier 1 的 lefthook:pre-commit 里的 lint 是对 staged_files 直接跑 eslint(不经 turbo),两者不冲突。
