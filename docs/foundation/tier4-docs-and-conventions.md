# Tier 4 · 文档与提交规范

**目标**:让新人能 5 分钟上手(充实 README)、统一编辑器体验(`.vscode`)、强制 Conventional Commits(commitlint)。

**预计改动**:充实根 `README.md`、新增 `.vscode/`、引入 commitlint + 一个 `commit-msg` 钩子。不改业务代码。

> 前置:本 tier 的 commitlint 钩子复用 **Tier 1 的 lefthook**。若尚未做 Tier 1,先按其文档装好 lefthook 与 `lefthook.yml`。

---

## 1. 充实根 `README.md`

当前根 `README.md` 只有 1 行。重写为对项目的真实介绍,建议包含以下小节:

```markdown
# 天生字(tsz)

词汇学习平台 —— 师生合一前台(`apps/web`)+ 平台后台(`apps/admin`),pnpm monorepo。

## 技术栈

- Next.js 16(App Router)+ React 19 + TypeScript
- TanStack Query(数据请求)、Zustand(客户端状态)
- Tailwind CSS、共享组件库 `@tsz/ui`
- Vitest(单测,packages 100% 覆盖门槛)、ESLint flat + Prettier
- GitHub Actions CI、(Tier 2 后)Turborepo

## 目录结构

- `apps/web` —— 师生合一应用。`app/` 只放路由薄壳,逻辑沉到 `features/<域>`。
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
| `pnpm lint`      | 全仓 ESLint        |
| `pnpm typecheck` | 全仓类型检查       |
| `pnpm test`      | 单元测试           |
| `pnpm test:cov`  | 带覆盖率门槛的测试 |
| `pnpm format`    | Prettier 格式化    |
| `pnpm build`     | 构建全部应用       |

## 怎么加一个 feature

1. 在 `apps/web/src/features/<域>/` 下建 `components/`、`hooks/`、`data/`,用 `index.ts` 收口对外导出。
2. 数据请求:在 `hooks/` 用 TanStack Query 封装 `useXxx`,query key 集中在一个对象里(参考 `features/wordlist/hooks/useWordLists.ts`)。
3. 路由:在 `app/` 对应位置建 `page.tsx`,只做组合 —— `import { XxxPage } from "@/features/<域>"`。
4. 角色差异:用权限判断控制操作显隐,不要按师生拆成两套组件。

## 环境变量

见 `apps/web/.env.example`。
```

> 以上为模板,执行时按仓库实际情况微调(命令表、域列表等)。注意 Tier 2 完成后 `pnpm dev` 等命令底层换成 turbo,但对外用法不变;Tier 3 完成后补一句 `.env` 校验说明。

## 2. `.vscode/`(统一编辑器体验)

> 注意:`.vscode/` 已被 `.prettierignore` 忽略(编辑器配置不走格式门槛),但**应当被 git 跟踪**(团队共享)。确认它不在 `.gitignore` 里。

### 2.1 `.vscode/extensions.json` —— 推荐扩展

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "vitest.explorer"
  ]
}
```

### 2.2 `.vscode/settings.json` —— 保存即格式化 + ESLint flat

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "eslint.useFlatConfig": true,
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

> 若仓库已存在拼写检查插件生成的 `.vscode/settings.json`(如 `cSpell.words`),合并而非覆盖。

## 3. commitlint(强制 Conventional Commits)

现有提交已是 `chore:` / `test:` / `feat(web):` 风格,这步把约定变成强制。

### 3.1 安装

```bash
pnpm add -Dw @commitlint/cli @commitlint/config-conventional
```

> 版本用当时 `npm view <pkg> version` 的最新稳定版。

### 3.2 根新增 `commitlint.config.mjs`

```js
export default {
  extends: ["@commitlint/config-conventional"]
};
```

### 3.3 在 lefthook 里挂 `commit-msg` 钩子

编辑根 `lefthook.yml`,新增:

```yaml
commit-msg:
  commands:
    commitlint:
      run: pnpm commitlint --edit {1}
```

> `{1}` 是 lefthook 传入的 commit message 文件路径(`.git/COMMIT_EDITMSG`)。改完跑 `pnpm lefthook install` 让钩子生效。

---

## 验收(Definition of Done)

1. 根 `README.md` 充实(技术栈/目录/命令/加 feature/env)。
2. 新增 `.vscode/extensions.json` 与 `.vscode/settings.json`,且被 git 跟踪。
3. `@commitlint/cli` + `@commitlint/config-conventional` 在 devDependencies;根有 `commitlint.config.mjs`;`lefthook.yml` 有 `commit-msg` 钩子。
4. 用非法 message 提交(如 `git commit -m "随便写"`)被拦下;用 `feat: xxx` 能通过。
5. 通用验收命令全绿:
   ```bash
   pnpm lint && pnpm typecheck && pnpm format:check && pnpm test:cov && pnpm build
   ```
6. 更新 `docs/foundation/README.md` 进度表 Tier 4 → ✅,提交(如 `docs: flesh out readme and enforce conventional commits`)。

## 注意事项 / 陷阱

- commitlint 依赖 lefthook 的 `commit-msg` 钩子,必须先有 Tier 1 的 lefthook。
- CI 不需要跑 commitlint(提交在本地已拦);如需在 PR 上再校验,可另加一个 `commitlint` job 用 `--from/--to` 检查范围 commit,非必须。
- `.vscode/settings.json` 进 git 后,个人化设置应放到用户级(VS Code User Settings),避免污染团队配置。
