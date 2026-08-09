import { describe, expect, it } from "vitest";
import { createAdminEndpoints } from "./admin";
import { createEndpoints } from "./endpoints";
import snapshot from "./openapi.snapshot.json";

// 契约测试:把 createEndpoints 实际发出的每条 (method, path) 与后端权威 spec 的
// 路径快照(openapi.snapshot.json,由 `pnpm --filter @tsz/api-client sync:openapi` 生成)对账。
//
// 为什么需要它:其余所有测试都把 http/api 层 mock 掉,只能证明「前端调了自己定义的路径」——
// 自证自话。臆造的路径、写错的方法、拼错的 URL,在那些 mock 测试里全是绿的,直到线上 404。
// 这里引入前端之外的事实来源(后端 spec)做证伪。
//
// 注意它抓的是「契约漂移」(路径/方法在 spec 里不存在),不是「后端实现缺口」
// (spec 有、服务器还没实现 → 仍会 404)。后者需要打真后端的冒烟测试,见 smoke。

const specPaths = snapshot.paths as Record<string, string[]>;

// 已知「后端尚未提供 / 待对接」的端点白名单。每条都必须真不在 spec 里——
// 等后端实现后,本测试会反过来要求你把它从这里删掉(见下方「台账保鲜」断言),
// 删掉后它就自动纳入正式校验。新增端点若既不在 spec 也不在此处,测试会红。
//
// 形如 "<method> <path>";路径里的占位段用 "_"(见下方 SENTINEL)。
const PENDING = new Set<string>([
  // ---- 后端已切换为 tsz-rust(重写进行中),spec 只含 auth 核心 7 条路由。 ----
  // 以下按 tsz-rust 落地节奏逐步从白名单移除(T 系列见 tsz-rust/docs/frontend-integration.md §6)。

  // 个人资料 / 学习设置 / 联系方式 / 头像(tsz-rust 未实现)。
  "patch /me",
  "post /me/contact/bind-code",
  "post /me/contact/bind",
  "put /me/learning-settings",
  "post /me/avatar/upload-url",
  "post /me/avatar",
  // 找回密码 / 注销账号(tsz-rust 未实现)。
  "post /auth/password/forgot",
  "post /auth/password/reset",
  "post /auth/account/deletion-code",
  "delete /auth/account",
  // 教师申请:ApplyTeacherForm 在用,但后端 spec 暂无此路由。
  "post /auth/apply-teacher",
  // 词库 / 词表 / 评论 / 任务:目前全是前端 mock(useWordLists 等),后端未实现。
  "get /words",
  "get /wordlists",
  "get /wordlists/_",
  "post /wordlists",
  "post /wordlists/_/publish",
  "post /comments",
  "get /tasks",
  "post /tasks",
  // 平台后台(admin):auth 一期已在 tsz-rust 落地(login/login-code/logout/refresh/
  // change-password/profile),已纳入正式校验;其余端点待对接。
  "post /admin/auth/logout-all",
  "get /admin/words",
  "get /admin/words/stats",
  "post /admin/words/detect",
  "post /admin/words/dialect-variants",
  "post /admin/words",
  "get /admin/words/_",
  "put /admin/words/_/content",
  "post /admin/words/_/steps/forms/impact",
  "put /admin/words/_/steps/forms",
  "put /admin/words/_/steps/meanings",
  "post /admin/words/_/validate",
  "post /admin/words/_/publish",
  "delete /admin/words/_",
  "post /admin/words/batch-delete",
  "get /admin/words/related-search",
  "get /admin/settings/parts-of-speech/catalog",
  "get /admin/settings/parts-of-speech",
  "post /admin/settings/parts-of-speech",
  "patch /admin/settings/parts-of-speech/_",
  "delete /admin/settings/parts-of-speech/_",
  "get /admin/settings/parts-of-speech/_/sub-parts",
  "post /admin/settings/parts-of-speech/_/sub-parts",
  "patch /admin/settings/parts-of-speech/_/sub-parts/_",
  "delete /admin/settings/parts-of-speech/_/sub-parts/_",
  "get /admin/users/_",
  "patch /admin/users/_/status",
  "patch /admin/users/_",
  "patch /admin/admins/_/status",
  "post /admin/admins/_/reset-password",
  "patch /admin/admins/_/role",
  "get /admin/permissions",
  "get /admin/roles",
  "post /admin/roles",
  "patch /admin/roles/_",
  "delete /admin/roles/_"
]);

// 调用端点函数时给位置参数填的哨兵值,使 `/wordlists/${id}` 这类模板渲染成 `/wordlists/_`。
const SENTINEL = "_";

/** 录下端点工厂真正发出的 (method, path),不触网。prefix 用于补回 baseUrl 里的段。 */
function collectCalls(
  factory: (http: never) => unknown,
  prefix = ""
): { method: string; path: string }[] {
  const calls: { method: string; path: string }[] = [];
  const record =
    (method: string) =>
    (path: string): unknown => {
      calls.push({ method, path: `${prefix}${path}` });
      // 永不 settle 的 Promise:有的端点在 http.* 结果上链 .then 做响应装配
      // (如 me),返回 undefined 会让链式调用同步炸掉;永挂起则链上回调
      // 永不执行——收集器只关心「发出的调用」,不关心响应。
      return new Promise(() => {});
    };
  const http = {
    get: record("get"),
    post: record("post"),
    put: record("put"),
    patch: record("patch"),
    del: record("delete") // http.del → HTTP DELETE
  };

  // 遍历端点树,用哨兵参数调用每个函数,触发其内部的 http.* 记录。
  const walk = (node: unknown) => {
    if (typeof node === "function") {
      (node as (...a: unknown[]) => unknown)(
        SENTINEL,
        SENTINEL,
        SENTINEL,
        SENTINEL
      );
    } else if (node && typeof node === "object") {
      Object.values(node).forEach(walk);
    }
  };
  walk(factory(http as never));
  return calls;
}

/** 把 spec 路径(可能含 {param})编成匹配具体路径的正则。 */
function specMatchers(): { re: RegExp; methods: Set<string> }[] {
  return Object.entries(specPaths).map(([path, methods]) => ({
    re: new RegExp(
      "^" + path.replace(/\{[^}]+\}/g, "[^/]+").replace(/[.]/g, "\\.") + "$"
    ),
    methods: new Set(methods)
  }));
}

function normalize(call: { method: string; path: string }) {
  const path = call.path.split("?")[0]!; // 去掉 query
  return { method: call.method, path, key: `${call.method} ${path}` };
}

// admin 端点绑定在 baseUrl=/api/v1/admin 上,相对路径须补回 /admin 前缀才能对上快照。
const calls = [
  ...collectCalls((http) => createEndpoints(http)),
  ...collectCalls((http) => createAdminEndpoints(http), "/admin")
];
const matchers = specMatchers();

function inSpec(method: string, path: string): boolean {
  return matchers.some((m) => m.methods.has(method) && m.re.test(path));
}

describe("api-client 契约:前端端点 vs 后端 openapi 快照", () => {
  it("每条前端端点要么命中 spec,要么在 PENDING 白名单里(无臆造端点)", () => {
    const orphans = calls
      .map(normalize)
      .filter((c) => !inSpec(c.method, c.path) && !PENDING.has(c.key))
      .map((c) => c.key);

    expect(
      orphans,
      `以下端点既不在后端 spec、也不在 PENDING 白名单——可能是路径/方法写错或臆造。\n` +
        `若确属后端尚未实现,显式加入 endpoints.contract.test.ts 的 PENDING:\n  ${orphans.join("\n  ")}`
    ).toEqual([]);
  });

  it("命中 spec 的端点,其 HTTP 方法也必须与 spec 一致", () => {
    // 路径在 spec 但方法不符(如把 PATCH /me 写成 PUT)也要红。
    const methodMismatch = calls
      .map(normalize)
      .filter((c) => !PENDING.has(c.key))
      .filter((c) => {
        const pathExists = matchers.some((m) => m.re.test(c.path));
        return pathExists && !inSpec(c.method, c.path);
      })
      .map((c) => c.key);

    expect(
      methodMismatch,
      `以下端点路径在 spec 里存在,但用了 spec 未声明的方法:\n  ${methodMismatch.join("\n  ")}`
    ).toEqual([]);
  });

  it("收集器无死白名单:PENDING 里每条都确由 createEndpoints 实际发出", () => {
    // 防止收集器静默漏看某个端点:若 PENDING 写了一条但根本没被发出(拼写漂移/
    // 端点被删),这里会红,提醒清理——也反证收集器确实覆盖到了这些路径。
    const emitted = new Set(calls.map((c) => normalize(c).key));
    const dead = [...PENDING].filter((entry) => !emitted.has(entry));

    expect(
      dead,
      `PENDING 里以下端点未被任何 createEndpoints 函数发出(已删除或拼错):\n  ${dead.join("\n  ")}`
    ).toEqual([]);
  });

  it("台账保鲜:PENDING 里的端点确实仍不在 spec(后端补上后须从白名单移除)", () => {
    const nowInSpec = [...PENDING].filter((entry) => {
      const [method, path] = entry.split(" ");
      return inSpec(method!, path!);
    });

    expect(
      nowInSpec,
      `以下端点后端已在 spec 中提供,请从 PENDING 白名单移除以纳入正式校验:\n  ${nowInSpec.join("\n  ")}`
    ).toEqual([]);
  });
});
