# Tier 1 · 一致性与防护

**目标**:统一开发环境约定 + 在本地提交前拦截 lint/format/type 问题,减少「推上去才被 CI 拒」。

**预计改动**:新增若干根级配置文件 + 引入一个 git hooks 工具。不改业务代码。

---

## 1. `.editorconfig`(跨编辑器一致性)

仓库根新增 `.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false
```

> 与 Prettier 配置(`printWidth 80 / tabWidth 2 / semi / 双引号`,见 `packages/config/prettier.config.js`)保持一致。

## 2. 锁定 Node 版本

CI 用 Node 22,本地应统一。两处:

- 根新增 `.nvmrc`,内容一行:`22`
- 根 `package.json` 增加 `engines` 字段:

```jsonc
{
  "engines": {
    "node": ">=22",
    "pnpm": ">=10"
  }
}
```

> 可选:`.npmrc` 增加 `engine-strict=true` 让版本不符时安装报错。本仓 `.npmrc` 已有 pnpm 相关项,追加即可。

## 3. `.env.example`(环境变量自文档)

代码里已引用 `process.env.NEXT_PUBLIC_API_BASE_URL`(见 `apps/web/src/lib/request.ts`)。在 `apps/web/.env.example` 写出所有需要的变量:

```bash
# 后端 API 基地址(浏览器可见,务必只放公开信息)
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api
```

- `.gitignore` 已忽略 `.env*.local`,确认 `.env.example` **不被忽略**(应被提交)。
- 若 admin 后续也用到 env,同样补 `apps/admin/.env.example`。

## 4. Pre-commit 钩子(本 tier 的核心)

用 **lefthook**(比 husky 轻、配置单文件、跨平台、无需 shell 脚本)。

### 4.1 安装

```bash
pnpm add -Dw lefthook
```

> `-w` 装到工作区根。版本用当时 `npm view lefthook version` 的最新稳定版。

### 4.2 根新增 `lefthook.yml`

```yaml
pre-commit:
  parallel: true
  commands:
    format:
      glob: "*.{ts,tsx,js,mjs,json,css,md}"
      run: pnpm prettier --write {staged_files}
      stage_fixed: true
    lint:
      glob: "*.{ts,tsx}"
      run: node scripts/lint-staged.mjs {staged_files}
      stage_fixed: true

pre-push:
  commands:
    typecheck:
      run: pnpm typecheck
    test:
      run: pnpm test
```

设计说明:

- **pre-commit** 只对**暂存文件**做 prettier + eslint 自动修复(快,不卡提交);`stage_fixed: true` 会把修复结果重新加入暂存区。
- **pre-push** 跑全量 `typecheck` + `test`(较慢的放到 push 阶段,push 比 commit 频率低)。
- **lint 用 `scripts/lint-staged.mjs` 而非直接 `pnpm eslint {staged_files}`**:本仓是 monorepo,eslint 只装在各 app/包内(根无 eslint 依赖),且 flat config 只认 cwd 下的单一配置、忽略 base path 之外的文件,无法在根用一条命令正确 lint 跨包文件。该脚本把暂存文件按所属工作区分组,再用 `pnpm -C <pkg> exec eslint --fix` 在各自目录运行(等价于 CI 的 `pnpm -r lint`,只是范围收窄到暂存文件)。

### 4.3 安装钩子 + 自动安装

```bash
pnpm lefthook install
```

并在根 `package.json` 加 `prepare` 脚本,让 `pnpm install` 后自动装钩子:

```jsonc
{
  "scripts": {
    "prepare": "lefthook install"
  }
}
```

> 注意:CI 里 `pnpm install --frozen-lockfile` 也会触发 `prepare`。lefthook install 在 CI 上是无害的(只写 `.git/hooks`),可接受;若想跳过,可在 CI 设 `LEFTHOOK=0`。

---

## 验收(Definition of Done)

1. 新增文件:`.editorconfig`、`.nvmrc`、`apps/web/.env.example`、`lefthook.yml`;`package.json` 含 `engines` + `prepare` 脚本;`lefthook` 在 devDependencies。
2. 故意写一个格式不规范的改动并 `git commit`,钩子应自动 format/lint 并修复后提交成功。
3. 故意制造一个 type 错误并 `git push`,pre-push 的 typecheck 应拦下。
4. 通用验收命令全绿:
   ```bash
   pnpm lint && pnpm typecheck && pnpm format:check && pnpm test:cov && pnpm build
   ```
5. 更新 `docs/foundation/README.md` 进度表 Tier 1 → ✅,提交(如 `chore: add consistency tooling and pre-commit hooks`)。

## 注意事项 / 陷阱

- lefthook 的 `{staged_files}` 为空时(无匹配文件)命令会被跳过,不会报错。
- 若团队有人用 GUI 客户端提交,lefthook 同样生效(钩子写在 `.git/hooks`)。
- 不要把 `prepare` 写成会在无 git 环境失败的形式;lefthook install 在非 git 目录会报错,但本仓已是 git 仓库,无碍。
