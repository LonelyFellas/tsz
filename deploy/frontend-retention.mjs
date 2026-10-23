import { lstat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { planPrune, applyPrune } from "./releases.mjs";

// prune-frontend.sh 持发布锁后调用；两端都通过预检才开始删除。
export async function pruneFrontend(base = "/opt", now = Date.now()) {
  const transaction = await lstat(
    path.join(base, "tsz-frontend-transaction")
  ).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (transaction) throw new Error("存在未完成前端发布，停止清理");
  const plans = [];
  for (const component of ["web", "admin"]) {
    plans.push(
      await planPrune(path.join(base, "tsz-releases", component), now)
    );
  }
  const results = [];
  for (const plan of plans) results.push(await applyPrune(plan));
  return results;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  console.log(JSON.stringify(await pruneFrontend()));
}
