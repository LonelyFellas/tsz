// 冒烟:打「真后端」逐个探测前端要用的端点是否存在(只看是否 404,不验业务结果)。
// 解决契约测试覆盖不到的「实现缺口」——spec 里有、但服务器还没实现的路由(线上会 404)。
//
// 安全性:全部用「无有效凭证 / 空载荷」探测,路由若存在应返回 401/400/422 等,绝不会
// 产生副作用;并刻意排除破坏性端点(DELETE /auth/account)与已知 mock 域。
// 判定:HTTP 404 / 405 = 路由缺失(失败);其余任何状态码 = 路由存在(通过)。
//
// 用法:pnpm --filter @tsz/api-client smoke
//       SMOKE_API_URL=https://staging.example.com/api/v1 pnpm --filter @tsz/api-client smoke
const BASE = process.env.SMOKE_API_URL ?? "http://localhost:8080/api/v1";

// 仅探测「非破坏性」的前端端点。method/path 与 endpoints.ts 对齐;
// 破坏性(DELETE /auth/account)、已知未实现(apply-teacher、词表/任务 mock 域)不在此列。
const PROBES = [
  ["GET", "/me"],
  ["PATCH", "/me"],
  ["POST", "/me/contact/bind-code"],
  ["POST", "/me/contact/bind"],
  ["PUT", "/me/learning-settings"],
  ["POST", "/auth/register"],
  ["POST", "/auth/login"],
  ["POST", "/auth/refresh"],
  ["POST", "/auth/logout"],
  ["POST", "/auth/send-code"],
  ["POST", "/auth/login/code"],
  ["POST", "/auth/password/forgot"],
  ["POST", "/auth/password/reset"],
  ["POST", "/auth/account/deletion-code"]
];

const MISSING = new Set([404, 405]);

async function probe(method, path) {
  const init = { method, headers: { "Content-Type": "application/json" } };
  if (method !== "GET") init.body = "{}";
  try {
    const res = await fetch(BASE + path, init);
    return { status: res.status, exists: !MISSING.has(res.status) };
  } catch (e) {
    return { status: `网络错误: ${e.message}`, exists: null };
  }
}

console.log(`冒烟目标: ${BASE}\n`);
const results = await Promise.all(
  PROBES.map(async ([m, p]) => ({ m, p, ...(await probe(m, p)) }))
);

const missing = [];
let unreachable = 0;
for (const r of results) {
  const mark = r.exists === null ? "⚠️ " : r.exists ? "✓ " : "✗ ";
  console.log(`${mark} ${String(r.status).padEnd(14)} ${r.m.padEnd(6)} ${r.p}`);
  if (r.exists === false) missing.push(`${r.m} ${r.p}`);
  if (r.exists === null) unreachable++;
}

if (unreachable === results.length) {
  console.error(`\n后端不可达(${BASE})。确认服务已起、SMOKE_API_URL 正确。`);
  process.exit(2);
}
if (missing.length) {
  console.error(
    `\n✗ 以下端点返回 404/405——后端未实现或路径/方法不符:\n  ${missing.join("\n  ")}`
  );
  process.exit(1);
}
console.log(`\n✅ ${results.length} 个端点全部存在。`);
