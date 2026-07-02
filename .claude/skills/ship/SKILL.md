---
name: ship
description: 把当前工作区的代码改动经「审查 → 提交 → 推送 → 开 PR」安全送上远程。先跑 code-review（必要时加 security-review），停下让用户确认后再提交，绝不绕过 lefthook 的 pre-push 校验。当用户说「提交并推送」「开 PR」「ship 这个改动」「把改动推上去」等时触发。
---

# ship —— 改动审查并安全推送

把当前未提交/未推送的改动，经过审查后安全地送上远程仓库并开 PR。

**核心原则：这个 skill 是「质量门 + 编排」，不重复跑「慢校验」。**
- typecheck 由 lefthook `pre-push` 负责；**e2e 由 CI 的 e2e job 负责**（本地不跑，太慢），
  本 skill 都**不**自己跑。
- 单元/集成测试套件 `test:cov`（vitest，全 monorepo + 覆盖率）**会在审查阶段跑一次**，
  用来产出测试质量与覆盖率的评估依据、并尽早暴露破坏；pre-push 会再作为最终门跑一遍，
  这点冗余是「绝不绕过钩子」的必要代价，且 vitest 很快，可接受。
- 其余 hooks 管不到的环节（多维评估、安全、分支保护、规范提交、PR）由本 skill 补齐。

## 不可逾越的红线

- **绝不绕过 pre-push 钩子。** 禁止 `LEFTHOOK=0 git push`、`--no-verify`、`-o ci.skip` 等任何
  跳过手段。push 报 `failed to push some refs` 时，**默认是 hook（多半 test:cov/typecheck）挂了，不是网络** ——
  去读 hook 输出、定位、修复、重推，而不是想办法绕过。
- **绝不直接提交/推送到 `main`。** 进入流程第一件事就是检查分支。

## 流程

### 1. 摸底 + 分支保护
- `git status` / `git diff` 看清改动范围与文件。
- **先 `git fetch origin`，再判断 base 状态**（别用过期的 remote-tracking 引用，会被假象误导）：
  - `git log --oneline origin/main..main`（本地领先）与 `git log --oneline main..origin/main`（本地落后）。
  - 三种情况分别处理：
    - **同步 / 仅本地领先**：正常继续。
    - **本地落后**：从 `origin/main` 而非本地 main 切分支（`git switch -c <branch> origin/main`），
      避免把本地 main 的陈旧基线带进 PR。
    - **真分叉**（两边各有对方没有的提交，常因 origin/main 被 force-update/重写）：**停下告知用户**，
      绝不 force-push 覆盖远程。本次改动的 PR 可用 `git rebase --onto origin/main <local-base> <branch>`
      把分支收成「只含本次提交」开干净 PR；本地 main 与远程的整合作为**单独的事**交给用户，不夹带进来。
- `git branch --show-current`。若当前在 `main`：
  - 有改动 → 先 `git switch -c <feat/fix-描述性分支名>`（按 conventional 前缀命名，如 `feat/word-review`），
    基线按上面 base 状态选（落后/分叉时基于 `origin/main`）。
  - 把工作区改动带到新分支后再继续。
- 若已在 feature 分支则直接继续。
- **多 push URL 留意**：`origin` 可能同时指向多个远程（如 GitHub + Gitee 镜像）。push 用
  `--force-with-lease`；某个镜像因 stale info 被拒是**安全保护生效**，不要改用 `--force` 强推，
  PR 以主仓（gh 所在的 GitHub）为准，镜像滞后单独说明即可。

### 2. 多维评估（每个维度按 diff 命中条件触发，不命中则跳过并说明）

先看 `git diff` 判断改动触及哪些面，再逐维度评估。**不要把不相关的维度硬跑一遍**——
后端/配置改动谈不上 SEO，纯文案改动谈不上组件拆分。最后产出一张评估表（见下）。

**A. 测试质量与边缘用例 —— 改动含逻辑代码时**
- 找到本次改动对应的测试；缺测试的逻辑直接标「缺测试」。
- 审查是否覆盖：边界值（空/null/0/越界）、错误与异常路径、并发/竞态、
  权限分支、非预期输入。仅有 happy-path 视为不达标。
- 缺口默认补上对应用例（小而准），大范围补测先列给用户。

**B. 全量测试套件 —— 改动含代码时**
- 跑一次 `pnpm test:cov`（全 monorepo 单元/集成 + 覆盖率阈值）。**不跑 e2e**（留给 CI）。
- 红 → 先修到全绿再往下；覆盖率掉 → 评估是否补测。
- 目的：尽早暴露「本次改动是否打挂了项目里别处的用例」。

**C. 代码质量 —— 改动含代码时**
- 调用 `/code-review`（默认 effort，针对当前 diff）：正确性 bug + 可读性/命名/死代码。
- bug 默认修掉；其余建议列给用户。

**D. 组件复用与拆分 —— 改动含组件/可复用逻辑时**
- 调用 `/simplify` 或人工审查：是否重复造轮子、巨型组件/函数是否该拆、
  props 是否过载、抽象层级是否一致。
- 复用来源**按端区分**（两端 UI 栈已分叉，见「项目事实速查」）：
  - 通用（两端同查）：逻辑 `@tsz/shared`、类型 `@tsz/types`、请求 `@tsz/api-client`。
  - **web**：UI 复用优先 `@tsz/ui`。
  - **admin**：UI 复用优先 antd 自带组件（先查 antd 有没有现成的，再考虑自写）；
    admin 已与 `@tsz/ui`/tailwind 解耦，**新代码禁止再引入这两者**。
- 明确的复用/拆分可直接改；伤筋动骨的拆分先列方案给用户。

**E. 前端性能 —— 改动触及前端页面/组件时（按端用对应清单，别拿错端的套）**
- 通用（两端同查）：数据获取瀑布/N+1、未做缓存/记忆化的重渲染、
  超大依赖进客户端包、阻塞渲染的同步逻辑。
- **web（Next App Router，面向 C 端用户，体验要求高）**：不必要的 `'use client'`
  （能 server component 就别下放）、缺失的 `next/image`、SSR/流式渲染是否被破坏、
  首屏与交互体验（加载态、布局抖动 CLS）。
- **admin（Vite SPA，内部工具）**：server component / `next/image` 等 Next 概念**不适用**；
  关注路由级代码分割（`React.lazy`，antd 全量易撑大单 chunk）、大表格/长列表渲染
  （分页或虚拟滚动）、antd Form 大表单的重渲染范围。
- 只报命中的具体点，不做泛泛而谈。

**F. SEO —— 仅 web（C 端可索引页面）改动时**
- 检查：`metadata`/`generateMetadata`（title/description/canonical）、语义化标签与单一 H1、
  图片 `alt`、可索引内容是否走 SSR 而非纯 CSR、必要的 robots/sitemap。
- **admin 一律 ⏭️ 跳过**：纯内部后台、登录墙内、无需被索引，注明「admin 无 SEO 要求」即可。

**G. 安全 —— diff 命中敏感面时**
- **仅当** 命中以下任一才跑 `/security-review`，否则跳过并说明：
  - 鉴权/会话/权限（auth、token、cookie、guard、login、session…）
  - 请求层 / 对外 IO（lib/request、fetch、api、外部输入解析、上传）
  - 密钥、环境变量、CORS、重定向、SQL/命令拼接
  - 部署 / nginx / docker / compose
- 命中则跑，高/中危发现必须处理或经用户确认后接受。

**评估表（汇报时给出）**

| 维度 | 状态 | 结论 |
|---|---|---|
| A 测试质量/边缘 | ✅/⚠️/⏭️跳过 | … |
| B 全量测试套件 | ✅/❌/⏭️ | 覆盖率 xx% |
| C 代码质量 | … | … |
| D 复用/拆分 | … | … |
| E 性能 | … | … |
| F SEO | … | … |
| G 安全 | … | … |

⏭️ 表示该维度与本次改动无关已跳过，须注明原因（如「无前端改动，跳过 E/F」）。

### 3. 整体收口自检（轻量，确认门之前）
A–G 是逐维度找问题，这一步把改动当**一个整体**快速扫一遍收口情况，**不重跑 A–G**：
- **意图达成**：对照最初目标，功能是否完整落地，没有半截 / 占位实现。
- **收口干净**：无遗留 `console.log`/调试代码/注释掉的旧码/未解决 TODO/未用 import/临时文件。
- **改全了**：调用点、类型、文档、i18n、相关测试是否同步改全，没有「改一半」。
- **范围纯净**：`git diff` 里没有夹带无关改动或误提交的文件。
任一项不过 → 修掉再进确认门。一句话给出整体结论。

### 4. 停下确认（门）
多维评估跑完、必修项修完后**停住**，向用户汇报：
- **评估表**（第 2 步那张，含每个维度 ✅/⚠️/❌/⏭️ 与结论）。
- 已修了什么、还剩哪些可选建议（复用拆分/性能/SEO 等）等你拍板。
- 拟用的 commit message（conventional commits 格式，commitlint 会校验；正文可用中文）。
- 等用户点头。**用户确认前不 commit、不 push。** 若评估有 ❌（测试红、未解决的高危）则必须先解决。

### 5. 提交
- 按 conventional commits 生成 message（`feat:` / `fix:` / `build:` / `refactor:` …）。
- 在 commit message 末尾以当前模型署名追加（示例）：
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  ```
- `git add` 相关文件后 `git commit`。pre-commit（prettier+eslint）与 commit-msg（commitlint）会自动跑；
  失败就修，别绕。

### 6. 推送
- `git push -u origin <branch>`，**正常推，让 lefthook pre-push 跑 typecheck / test:cov**。
- 失败处理：
  - 读完整 hook 输出，判断是哪一道（typecheck / test:cov）挂了。
  - 修复根因 → 必要时 `git commit --amend` 或追加提交 → 重推。
  - **任何情况下都不用跳过钩子的手段。** 若确属环境问题（如本地依赖损坏）也先告知用户、由用户定夺，不擅自绕过。

### 7. 开 PR
- `gh pr create`，标题用本次 commit 主题，正文含：改动摘要、审查结论、测试情况。
- PR 正文末尾追加：
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  ```
- 没配 remote / 没装 gh / 没登录 → 告知用户，止步于「已推送分支」。
- 把 PR 链接以 markdown 链接形式返回给用户。

## 项目事实速查
- pnpm + turbo monorepo；Node ≥ 22。
- 钩子：pre-commit=prettier+eslint(按包)，commit-msg=commitlint(conventional)，pre-push=typecheck+test:cov。
- e2e 很慢，本地不跑（pre-push 也不跑），交给 CI 的 e2e job 兜底；test:cov 在审查阶段跑一次用于评估。
- 推送后若要合并，以 CI 全绿（含 e2e）为准，不以本地 hook 通过为准。
- **两端技术栈已分叉，评估维度按端取清单（大部分流程仍通用）**：
  - **web（apps/web，C 端）**：Next App Router + tailwind + `@tsz/ui`，Apple 风设计体系
    （token #0071e3/rounded-3xl），对用户体验、性能、SEO 有硬要求。
  - **admin（apps/admin，内部后台）**：Vite + React Router + TanStack Query + antd v6
    （ConfigProvider 品牌蓝 #0071e3），**不用** tailwind/`@tsz/ui`，视觉以 antd 默认为准；
    无 SEO 要求；`apps/admin/src` 有 90% 单测覆盖率门槛（根 vitest.config），
    mock/装配文件按约定加 coverage exclude + TODO。
- 复用优先：逻辑 `@tsz/shared`、类型 `@tsz/types`（snake_case 镜像后端 wire 格式）、
  请求 `@tsz/api-client`；UI 复用按端（web→`@tsz/ui`，admin→antd）。
- 默认分支 `main`，走 PR 流程，CI 兜底。
