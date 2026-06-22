# Tier 5 · 测试面扩展(应用 + E2E)

**目标**:把测试从「packages 100%」扩展到**应用层**——补 `apps/web` 的组件/hooks 单测,并加 Playwright E2E 对关键用户流程做冒烟。

**预计改动**:在 `apps/web` 增加若干 `*.test.tsx`、新增 `apps/web/src/test/` 测试工具,新增独立的 E2E 工程与 CI job。

> 前置:已有 `apps/web` vitest project(`apps/web/vitest.config.ts`,jsdom + React + `@/*` 别名)、一个集成样板 `features/wordlist/components/WordListBrowser.test.tsx`。本 tier 在此之上扩展。

---

## 第一部分:应用层单元/集成测试(Vitest)

### 1. 抽一个测试工具:带 Provider 的 render

现有 `WordListBrowser.test.tsx` 里内联了 `QueryClientProvider` 包裹。抽成复用工具 `apps/web/src/test/render.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

export function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(ui, { wrapper });
}
```

> 注意:该文件在 `src/test/` 下,会被 `vitest.config.ts` 的 `include: ["src/**/*.test.{ts,tsx}"]` 之外引用(它本身不是测试文件,被测试 import,无需匹配 include)。

### 2. 要补的测试清单

按价值排序,逐个补到 `apps/web/src/...` 对应组件旁:

1. **`features/wordlist/hooks/useWordLists.test.tsx`**
   - `useWordLists`:用 `renderHook` + `waitFor` 断言最终拿到 mock 列表。
   - `useCreateWordList`:`mutateAsync` 后 `MOCK_WORDLISTS` 增加一条;断言 `needsReview` 分支(公开+自定义词汇 → `reviewStatus: "pending"`;公开无自定义 → `"approved"`;私密 → `undefined`)。
   - 用 `@testing-library/react` 的 `renderHook`,wrapper 用上面的 QueryClientProvider。

2. **`features/wordlist/components/WordListCreator.test.tsx`**(多步流程)
   - 第一步未选词时「下一步」禁用;选词后可进入命名步。
   - 命名为空时「下一步」禁用。
   - 走到公开设置,选「公开」+ 已加自定义词汇 → 出现审核提示文案。
   - 点「完成创建」→ 进入 done 步,显示成功文案;按选择的可见性显示不同结果文案。
   - 用 `userEvent` 模拟点击/输入。

3. **`features/auth/components/LoginForm.test.tsx`**
   - 输入非法账号 → 「获取验证码」禁用 + 错误提示。
   - 输入合法手机号/邮箱 → 按钮可用。

> 这些组件用到 `next/link`、`next/navigation` 的 `useRouter`。`useRouter` 在 jsdom 下需 mock:

```tsx
import { vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() })
}));
```

### 3.(可选)把 web 纳入覆盖率门槛

当前根 `vitest.config.ts` 的 coverage `include` 只含三个 package。补完上面测试后,可把 `apps/web/src/features/**` 加入 `include`,并设一个**渐进式**门槛(如 80%,而非 100%——页面薄壳/布局不值得强测)。`app/`、`data/`(mock)、`lib/query-client.ts` 等放 `exclude`。

---

## 第二部分:E2E 冒烟(Playwright)

E2E 跑真实构建产物,验证关键路径不挂。放在独立工作区 `e2e/`(不污染 app)。

### 1. 新增 `e2e/` 工作区

`pnpm-workspace.yaml` 已含 `apps/*` 与 `packages/*`,新增一行:

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "e2e"
```

`e2e/package.json`:

```json
{
  "name": "@tsz/e2e",
  "private": true,
  "scripts": {
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0"
  }
}
```

> 版本用当时 `npm view @playwright/test version` 的最新稳定版。安装后需 `pnpm --filter @tsz/e2e exec playwright install --with-deps chromium`。

### 2. `e2e/playwright.config.ts`

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://localhost:3000" },
  // 让 Playwright 自己起 web 应用(生产构建更接近真实)。
  webServer: {
    command: "pnpm --filter @tsz/web build && pnpm --filter @tsz/web start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
```

### 3. 冒烟用例 `e2e/tests/smoke.spec.ts`

覆盖最关键的几条流程(不依赖真实后端,走 mock 数据):

```ts
import { expect, test } from "@playwright/test";

test("首页可达并能进入词表", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "天生字" })).toBeVisible();
  await page.getByRole("link", { name: "浏览词表" }).click();
  await expect(page).toHaveURL(/\/wordlists/);
});

test("创建词表向导可走通", async ({ page }) => {
  await page.goto("/wordlists/new");
  await expect(page.getByRole("heading", { name: "创建词表" })).toBeVisible();
  // 选词 → 命名 → 公开设置 → 完成(按 WordListCreator 的实际文案补全步骤)
});
```

### 4. 根脚本

根 `package.json` 加:

```jsonc
{
  "scripts": {
    "test:e2e": "pnpm --filter @tsz/e2e test:e2e"
  }
}
```

### 5. CI 增加 E2E job

`.github/workflows/ci.yml` 新增一个**独立 job**(与 `verify` 并行或在其后):

```yaml
e2e:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: pnpm
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @tsz/e2e exec playwright install --with-deps chromium
    - run: pnpm test:e2e
```

> E2E 较慢,放独立 job 不阻塞单测反馈。如需提速可只在 PR/main 触发,或加 Playwright 缓存。

---

## 验收(Definition of Done)

1. `apps/web` 新增:`src/test/render.tsx`、useWordLists / WordListCreator / LoginForm 三组测试;`pnpm test` 通过且用例数明显增加。
2. 若把 web 纳入覆盖率门槛,`pnpm test:cov` 仍通过。
3. `e2e/` 工作区就绪,本地 `pnpm test:e2e` 能起服务并跑通冒烟用例。
4. CI 新增 `e2e` job 并通过。
5. 通用验收命令全绿:
   ```bash
   pnpm lint && pnpm typecheck && pnpm format:check && pnpm test:cov && pnpm build
   ```
6. 更新 `docs/foundation/README.md` 进度表 Tier 5 → ✅,提交(如 `test: expand app-level tests and add playwright e2e`)。

## 注意事项 / 陷阱

- `useRouter` 等 `next/navigation` API 在 jsdom 单测里必须 mock,否则报「invariant expected app router to be mounted」。
- E2E 走的是 mock 数据(`features/wordlist/data/*`),所以无需真实后端即可跑;接后端后这些用例要相应调整或加测试桩。
- Playwright 的 `webServer.command` 用生产 `build && start` 最接近真实;若想更快,本地可临时改 `pnpm --filter @tsz/web dev`,但 CI 建议用构建产物。
- 别把 E2E 的 `*.spec.ts` 放进 `apps/web`,否则会被 vitest 的 include 误抓;隔离在 `e2e/` 工作区。
