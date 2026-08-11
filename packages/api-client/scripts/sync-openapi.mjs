// 从后端权威 spec(tsz-rust/docs/openapi.json)生成一份精简契约快照,供契约测试对账。
// tsz-rust 的 spec 由 utoipa 生成:后端 `cargo run --features swagger` 后
// `curl http://localhost:8383/api-docs/openapi.json -o ../tsz-rust/docs/openapi.json`。
// 快照只保留 path -> [methods],剥掉 /api/v1 前缀(前端 http baseURL 默认就是 /api/v1)。
// 用法:pnpm --filter @tsz/api-client sync:openapi
// 后端 spec 位置可用 OPENAPI_SOURCE 覆盖(CI 里 checkout 路径不同的话)。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// 具名导入而非 default:js-yaml 是 CJS,Node 25 起 ESM 互操作不再合成 default 导出。
import { load } from "js-yaml";
// 输出过一遍 prettier:JSON.stringify 直出与仓库格式不一致,
// 每次同步都会造成整文件格式抖动、淹没真实的路径增量。
import { format } from "prettier";

const here = dirname(fileURLToPath(import.meta.url));
const source =
  process.env.OPENAPI_SOURCE ??
  resolve(here, "../../../../tsz-rust/docs/openapi.json");
// 放进 src/:契约测试可直接 import(免 node 类型、免 rootDir 越界)。
const out = resolve(here, "../src/openapi.snapshot.json");

const API_PREFIX = "/api/v1";

const spec = load(readFileSync(source, "utf8"));
if (!spec?.paths) {
  throw new Error(`spec 无 paths 字段: ${source}`);
}
const adminWordV2 = spec.components?.schemas?.AdminWordV2;
if (!adminWordV2?.required || !adminWordV2?.properties) {
  throw new Error(`spec 无 components.schemas.AdminWordV2: ${source}`);
}
const lifecycleSchemaNames = [
  "EntryLifecycleInput",
  "EntryLifecycleTarget",
  "EntryLifecycleBatchInput",
  "EntryLifecycleBatchResponse",
  "SuggestDialectVariantsResponseV2"
];
for (const name of lifecycleSchemaNames) {
  if (!spec.components?.schemas?.[name]) {
    throw new Error(`spec 无 components.schemas.${name}: ${source}`);
  }
}

const paths = {};
for (const [rawPath, item] of Object.entries(spec.paths)) {
  const path = rawPath.startsWith(API_PREFIX)
    ? rawPath.slice(API_PREFIX.length)
    : rawPath;
  // 只取 HTTP 方法键(忽略 parameters/summary 等)。
  const methods = Object.keys(item)
    .filter((k) => ["get", "post", "put", "patch", "delete"].includes(k))
    .sort();
  if (methods.length) paths[path] = methods;
}

const snapshot = {
  // 仅供人读:这份快照是从哪生成的、何时。契约测试不依赖这些字段。
  _note:
    "AUTO-GENERATED from backend docs/openapi.json via `pnpm --filter @tsz/api-client sync:openapi`. 勿手改。",
  _source: source,
  _generatedAt: new Date().toISOString(),
  paths,
  schemas: {
    AdminWordV2: {
      required: adminWordV2.required,
      properties: {
        status: adminWordV2.properties.status,
        revision: adminWordV2.properties.revision,
        lifecycle_revision: adminWordV2.properties.lifecycle_revision,
        archived_at: adminWordV2.properties.archived_at,
        archived_by: adminWordV2.properties.archived_by,
        published_revision: adminWordV2.properties.published_revision,
        has_unpublished_changes: adminWordV2.properties.has_unpublished_changes
      }
    },
    ...Object.fromEntries(
      lifecycleSchemaNames.map((name) => [name, spec.components.schemas[name]])
    )
  }
};

writeFileSync(out, await format(JSON.stringify(snapshot), { parser: "json" }));
console.log(`✅ 写入 ${out}\n   共 ${Object.keys(paths).length} 条路径`);
