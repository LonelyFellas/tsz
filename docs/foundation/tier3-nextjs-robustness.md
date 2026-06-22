# Tier 3 · Next 应用健壮性

**目标**:补齐 App Router 的错误/加载/404 边界,避免运行时出错直接白屏;并对环境变量做启动期校验,把「少配了 env」从运行时偶发错误变成启动期明确报错。

**预计改动**:在 `apps/web`(及按需 `apps/admin`)新增约定式文件 + 一个 env 校验模块。

---

## 1. 错误与加载边界(App Router 约定文件)

Next App Router 会自动识别这些文件名。目前 `apps/web/src/app` 一个都没有。

### 1.1 全局错误页 `apps/web/src/app/global-error.tsx`

捕获根 layout 自身的错误(必须是 client 组件,且自带 `<html><body>`):

```tsx
"use client";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-xl font-bold">页面出错了</h1>
        <p className="text-sm text-gray-500">{error.message}</p>
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white"
          onClick={reset}
        >
          重试
        </button>
      </body>
    </html>
  );
}
```

### 1.2 段级错误边界 `apps/web/src/app/(main)/error.tsx`

捕获 `(main)` 分组内的渲染错误(client 组件):

```tsx
"use client";

import { Button } from "@tsz/ui";

export default function MainError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h2 className="text-lg font-bold">加载失败</h2>
      <p className="text-sm text-gray-500">{error.message}</p>
      <Button onClick={reset}>重试</Button>
    </div>
  );
}
```

### 1.3 加载态 `apps/web/src/app/(main)/loading.tsx`

路由切换/异步 RSC 时显示(可服务端组件):

```tsx
export default function MainLoading() {
  return <p className="py-16 text-center text-gray-500">加载中…</p>;
}
```

### 1.4 404 页 `apps/web/src/app/not-found.tsx`

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">404</h1>
      <p className="text-gray-500">页面不存在</p>
      <Link href="/" className="text-blue-600 underline">
        返回首页
      </Link>
    </div>
  );
}
```

> 可选:在词表详情等数据页,数据查无时调用 `notFound()`(来自 `next/navigation`)触发上面这个页面。
>
> admin 若需要,同样补 `apps/admin/src/app/{error,not-found}.tsx`(admin 是独立 app)。

## 2. 环境变量校验(zod)

把分散的 `process.env.X` 读取收敛到一个**启动期校验**的模块。少配/配错时直接抛错,而不是运行时拿到 `undefined`。

### 2.1 安装

```bash
pnpm --filter @tsz/web add zod
```

> 版本用当时 `npm view zod version` 的最新稳定版。

### 2.2 新增 `apps/web/src/lib/env.ts`

```ts
import { z } from "zod";

// 只校验浏览器可见变量(NEXT_PUBLIC_*)。服务端私有变量另列一组。
const schema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z
    .string()
    .url()
    .default("http://localhost:8080/api")
});

// Next 会内联 NEXT_PUBLIC_* 到打包产物,必须逐个显式引用(不能用 process.env 动态键)。
export const env = schema.parse({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL
});
```

### 2.3 改 `apps/web/src/lib/request.ts` 使用 `env`

把:

```ts
const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";
```

换成:

```ts
import { env } from "./env";
const baseUrl = env.NEXT_PUBLIC_API_BASE_URL;
```

> 注意 Next 的限制:`NEXT_PUBLIC_*` 在构建时被静态内联,**必须**像上面那样写死键名引用 `process.env.NEXT_PUBLIC_API_BASE_URL`,不能用变量索引 `process.env[key]`。

---

## 验收(Definition of Done)

1. 新增文件:`global-error.tsx`、`(main)/error.tsx`、`(main)/loading.tsx`、`not-found.tsx`、`lib/env.ts`;`request.ts` 改用 `env`;`zod` 在 `@tsz/web` 依赖。
2. 访问一个不存在的路径(如 `/nope`)→ 显示自定义 404。
3. 在某 `(main)` 下的 client 组件里临时 `throw new Error("boom")` → 显示段级 error 边界(可重试),不白屏;验证后移除。
4. 不配 `NEXT_PUBLIC_API_BASE_URL` 时用默认值;配成非 URL 字符串时 `pnpm --filter @tsz/web build` 应因 zod 校验失败而报错。
5. 通用验收命令全绿:
   ```bash
   pnpm lint && pnpm typecheck && pnpm format:check && pnpm test:cov && pnpm build
   ```
6. 更新 `docs/foundation/README.md` 进度表 Tier 3 → ✅,提交(如 `feat(web): add error/loading boundaries and env validation`)。

## 注意事项 / 陷阱

- `global-error.tsx` 仅在**生产**构建生效(开发模式 Next 会显示自己的错误叠层)。验收第 3 条用 `pnpm build && pnpm --filter @tsz/web start` 验证更准。
- `error.tsx` 必须是 client 组件(`"use client"`),且只捕获**同级及以下**的错误,不捕获自身 layout 的错误——那是 `global-error` 的职责。
- env 校验若想更严格,可对 `lib/env.ts` 加一个单元测试(给定非法值断言 `schema.parse` 抛错),纳入既有 web vitest project。
