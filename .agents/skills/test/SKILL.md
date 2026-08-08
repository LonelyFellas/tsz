---
name: test
description: 为功能或改动系统性地「先设计测试、再写测试、跑到绿」——产出用例矩阵，分层落地单元/集成/e2e + 手测清单，覆盖边界与错误路径，达项目覆盖率门槛。当用户说「给 XX 写测试」「补测试」「测试覆盖不够」「这块怎么测」「前期把测试想好」等时触发；也被 feature skill 在代码动工阶段调用，把 design 里的测试策略落成可执行用例与测试代码。支持实现前设计（TDD）与实现后补测，但**写任何测试代码之前必须先完成用例设计**。
---

# test —— 前期设计并编写测试

把测试当正经设计工作：**先列清「要证什么」→ 选层 → 写断言 → 跑到绿**。不是实现完随手补两个 happy-path。

**为什么强调前期设计**：用例矩阵几分钟能改，漏测的回归要几小时修。在写测试代码之前把分支、边界、错误路径、权限、并发场景列全，比事后对着覆盖率报表补洞便宜得多。

**与 sibling skill 的分工**：

| Skill                | 角色                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| **feature**          | design.md 里写测试**策略方向**（测什么层、不测什么）                 |
| **test（本 skill）** | 把策略展开成**用例矩阵**，编写测试代码，跑到绿                       |
| **ship**             | 发布前**审查**已有测试质量，跑全量 `test:cov`；不替本 skill 设计用例 |

**可被 feature 在动工第 5 步调用**；也可独立触发（补测、覆盖率不达标、用户点名某模块）。

## 适用与边界

- **范围**：前端仓 `tsz`——vitest 单元/集成 + Playwright e2e（`@tsz/e2e`，物理目录 `e2e/`）。
- **后端**：`tsz-go` 有自己的 contract/service/integration 测试，本 skill **不碰 Go 源码**；前端侧通过 **api-client 契约测试** + mock fixture 对齐 `../docs/` 对接文档与 `@tsz/types` wire 类型。
- **适合**：新功能前期设计测试、改动补测、覆盖率不达标、api-client 端点变更、薄弱模块加固。
- **不适合**：一次性脚本；纯静态展示且无逻辑分支的组件（按约定 `coverage exclude` + TODO，见下）。

## 阶段 0 —— 摸清上下文

动手设计用例之前，先对齐「测谁、依据什么」：

1. **若来自 feature**：读 `docs/features/<slug>/design.md` 的「测试策略」与「数据流」——本 skill 负责把它**具体化**，不是另起炉灶。
2. **读被测代码**：改动涉及的源文件、调用链、对外行为；同 feature 目录下**已有测试**（学项目风格，别发明第二套写法）。
3. **定目标端**：web（Next + `@tsz/ui`）/ admin（Vite + antd v6）——mock 点、路由库、测试工具不同（见下「按端差异」）。
4. **涉及接口时**：读 `../docs/` 对接文档；fixture 字段用 **snake_case**，对齐 `@tsz/types` / 对接文档示例，不臆造 camelCase。

## 阶段 1 —— 设计用例矩阵（写代码前的必经步）

**本阶段只设计、不写测试文件。** 列出每个该被验证的行为，别只盯 happy-path：

| 维度      | 要问的问题                                                                 |
| --------- | -------------------------------------------------------------------------- |
| 主流程    | 正常输入 → 预期 UI / 状态 / 副作用                                         |
| 逻辑分支  | if/switch、角色/权限、模式切换                                             |
| 边界值    | 空 / null / undefined / 0 / 负数 / 越界 / 超长 / 格式非法                  |
| 错误路径  | API 4xx/5xx、网络失败、校验失败、回退/重试                                 |
| 鉴权      | 未登录、token 过期、角色不符、guard 跳转                                   |
| 并发/时序 | 双提交、刷新竞态、多标签页刷新宽限期（见 `../docs/auth-token-storage.md`） |
| 状态流转  | 提交前/中/后、乐观更新失败回滚                                             |

产出一张**用例矩阵**（汇报或附在 PR / design 末尾均可）：

```markdown
# <模块> 测试用例矩阵

| #   | 层   | 场景 | 输入/前置 | 预期 | 优先级              |
| --- | ---- | ---- | --------- | ---- | ------------------- |
| 1   | 单元 | …    | …         | …    | P0                  |
| 2   | 集成 | …    | …         | …    | P0                  |
| 3   | e2e  | …    | …         | …    | P1（仅关键路径）    |
| 4   | 手测 | …    | …         | …    | 无法/不值得自动化时 |

P0 = 必自动化；P1 = 关键路径 e2e；手测 = 真后端/视觉/跨浏览器等。
```

矩阵里**每个 P0 行都必须在阶段 3 有对应测试**；写代码时逐行划掉，防漏测。

## 阶段 2 —— 分层选型（就近原则：逻辑在哪，测在哪）

| 层       | 测什么                                                 | 放哪                                                                                           | 速度             |
| -------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---------------- |
| **单元** | 纯函数、校验、格式化、store reducer、token 调度        | `packages/shared`、`packages/api-client`、`packages/ui`；app 的 `features/*/lib`、纯逻辑 `.ts` | 最快，优先       |
| **集成** | 组件 + store/Query + mock 请求层；表单提交；guard 跳转 | 与被测 feature 同目录 `*.test.tsx`                                                             | 快               |
| **契约** | api-client 发出的 method/path 与 openapi 快照一致      | `packages/api-client/src/endpoints.contract.test.ts`                                           | 改端点必跑       |
| **e2e**  | 跨页关键用户路径（登录、注册、注销等）                 | `e2e/tests/*.spec.ts` + `mockApi.ts`                                                           | 慢，只留关键路径 |
| **手测** | OSS 直传、真后端联调、视觉细节                         | PR 描述或 design 附录                                                                          | 按需             |

**选型原则**：

- 能在下层测的，不上浮到 e2e（e2e 由 CI 兜底，本地按需）。
- 改 `@tsz/api-client` 端点 → **必须**更新契约测试；新端点在 spec 尚无则进 `PENDING` 白名单并注释原因。
- 后端未就绪：集成层 mock 请求；e2e 用 `mockApi.ts` 拦截 `/api/v1/**`；fixture 仍按对接文档形状写。

## 阶段 3 —— 编写测试

矩阵逐行落地。遵守：**测行为不测私有实现**；断言具体（不只 `toBeTruthy`）；异步等最终态。

### 按端 mock 模式（参照现有测试，勿另起范式）

**web（Next App Router）**

- Mock 路由：`vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back, ... }) }))`
- Mock 请求薄壳：`vi.mock("@/lib/request", () => ({ api: { ... }, setAccessToken, scheduleRefresh }))`，再用 `vi.mocked(api.xxx)`
- 渲染：`renderWithProviders`（`apps/web/src/test/render.tsx`），QueryClient `retry: false`
- 参照：`apps/web/src/features/auth/components/RegisterForm.test.tsx`

**admin（Vite + React Router + antd）**

- Mock 路由：`vi.mock("react-router-dom", () => ({ useNavigate, useSearchParams }))`
- Mock 鉴权薄壳：`vi.mock("@/lib/auth", ...)` 导出 `api`、`useAuthStore`、`persistSession`
- antd 两字按钮文案可能带空格（如「登 录」），用正则 `/^登\s?录$/`
- 大表格/list：**避免** `getByRole`（慢到超时），用 `getByText` / `getByTestId`
- 参照：`apps/admin/src/features/auth/AdminLoginForm.test.tsx`

**packages（shared / api-client / ui）**

- 纯逻辑直接测；涉及 `fetch` 用 `vi.spyOn(globalThis, "fetch")`
- 鉴权内核：`packages/shared/src/auth/tokenManager.test.ts`
- 参照：`packages/shared/src/auth/*.test.ts`

**e2e（Playwright）**

- 入口：`await mockApi(page, { authenticated, onboarded })` 拦截 API
- 新关键路径加 `e2e/tests/<feature>.spec.ts`；扩展 `mockApi.ts` 而非每个 spec 重复 route
- 参照：`e2e/tests/auth-flows.spec.ts`、`e2e/tests/support/mockApi.ts`

### api-client 契约测试（改端点必做）

```bash
pnpm --filter @tsz/api-client sync:openapi   # 更新 openapi.snapshot.json
pnpm --filter @tsz/api-client test           # 含 endpoints.contract.test.ts
```

- 契约测的是 **路径/方法是否在 spec 里**，不是后端是否已实现。
- spec 暂无的端点：加入 `PENDING` 白名单 + 注释；后端落地后**删掉**白名单项，纳入正式校验。
- 详见 `packages/api-client/src/endpoints.contract.test.ts` 文件头注释。

### 手测清单（矩阵里 P0 无法自动化的行）

```markdown
## 手测清单 — <功能>

- [ ] <步骤> → 预期：<…>（环境：测试服 / 真 OSS / …）
```

附在 PR 描述或 `design.md` 末尾；ship 审查时会看。

## 阶段 4 —— 守项目约定

**覆盖率门槛**（根 `vitest.config.ts`，与 CI / pre-push 一致）：

| 范围                                                     | 门槛     | 说明                                                                             |
| -------------------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| `packages/**`                                            | **100%** | shared、ui、api-client 全量                                                      |
| `apps/web/src/**`（纳入 include 的 features/lib/stores） | **90%**  | 路由 page/layout 壳不纳入，靠集成/e2e                                            |
| `apps/admin/src/**`（features/lib）                      | **90%**  | admin **无 stores 目录**；dictionary 部分 `.tsx` / `api.ts` 暂 exclude 并有 TODO |

- **有逻辑分支的文件禁止 `coverage exclude` 蒙混**；exclude 只给纯装配 / mock / 静态展示，且附 TODO 说明补测条件。
- **jsdom 垫片**：admin 已在 `apps/admin/vitest.setup.ts` 补 `matchMedia` / `ResizeObserver`；web 组件若遇同类报错参照处理。
- **文件命名**：`*.test.ts` / `*.test.tsx`，与被测文件同目录或就近。

## 阶段 5 —— 跑到绿

**迭代时先小后大**（别每次都跑全 monorepo）：

```bash
# 单包 / 单文件（开发中首选）
pnpm --filter @tsz/shared test
pnpm --filter @tsz/web exec vitest run src/features/auth/components/RegisterForm.test.tsx

# 提交前 / 与 CI 一致（全量 + 覆盖率门槛）
pnpm test:cov

# e2e（慢，本地按需；CI 有专门 job）
pnpm test:e2e
```

- 红了先修到全绿；覆盖率不达标 → 回到阶段 1 矩阵找漏测行补用例，**不降门槛**。
- 改 api-client 后：`sync:openapi` → 包级 test → 再 `pnpm test:cov`。

## 红线

- **不跳过用例矩阵**：写测试代码前必须先有矩阵（至少 mental checklist；feature 流程建议写进 PR/design）。
- **不为过覆盖率写没意义的测试**（测私有细节、无断言凑行数）——覆盖率是手段，证的是行为。
- **有逻辑分支不许 exclude 蒙混**；exclude 只给纯装配 / 静态展示 + TODO。
- **不绕过测试门**：`test:cov` 红或覆盖率不达标，修到过；不注释测试、不降门槛、不用 `LEFTHOOK=0`。
- **fixture 不臆造契约**：wire 字段 snake_case，与 `@tsz/types` / `../docs/` 一致；mock 测不出路径拼错——靠契约测试补。

## 参照示例（学风格，复制模式不复制断言）

| 场景              | 文件                                                          |
| ----------------- | ------------------------------------------------------------- |
| web 表单集成测    | `apps/web/src/features/auth/components/RegisterForm.test.tsx` |
| admin 登录 + antd | `apps/admin/src/features/auth/AdminLoginForm.test.tsx`        |
| 鉴权/token 刷新   | `packages/shared/src/auth/tokenManager.test.ts`               |
| api 契约对账      | `packages/api-client/src/endpoints.contract.test.ts`          |
| e2e + mockApi     | `e2e/tests/auth-flows.spec.ts`                                |
| 纯逻辑 mapping    | `apps/admin/src/features/dictionary/mapping.test.ts`          |
