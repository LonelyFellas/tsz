import assert from "node:assert/strict";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  API_REPOSITORY,
  MAX_SPEC_BYTES,
  validateApiSha,
  verifyApiContract
} from "./api-contract.mjs";

export function validateApiTarget(target) {
  assert.deepEqual(
    Object.keys(target).sort(),
    ["environment", "repository", "sha", "version"],
    "invalid API preflight target fields"
  );
  assert.equal(target.version, 1, "unsupported API preflight target version");
  assert.equal(
    target.environment,
    "tshb-test",
    "unsupported API preflight environment"
  );
  assert.equal(
    target.repository,
    API_REPOSITORY,
    "API preflight repository must be the authoritative backend"
  );
  validateApiSha(target.sha);
  return target;
}

export async function downloadPinnedApiSpec(sha, fetchSpec = globalThis.fetch) {
  validateApiSha(sha);
  const url = `https://raw.githubusercontent.com/${API_REPOSITORY}/${sha}/docs/openapi.json`;
  const response = await fetchSpec(url, {
    redirect: "error",
    signal: AbortSignal.timeout(60000),
    headers: { Accept: "application/json" }
  });
  assert.ok(
    response.ok,
    `cannot retrieve pinned API contract: HTTP ${response.status}`
  );
  assert.ok(response.body, "pinned API contract has no response body");
  assert.ok(
    Number(response.headers.get("content-length")) <= MAX_SPEC_BYTES ||
      !response.headers.has("content-length"),
    "API contract exceeds the maximum size"
  );
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    assert.ok(bytes <= MAX_SPEC_BYTES, "API contract exceeds the maximum size");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function preflightApiContract({
  targetFile = resolve("deploy/api-target.json"),
  packageRoot,
  fetchSpec
} = {}) {
  const target = validateApiTarget(
    JSON.parse(await readFile(targetFile, "utf8"))
  );
  try {
    const spec = await downloadPinnedApiSpec(target.sha, fetchSpec);
    const result = await verifyApiContract({
      sha: target.sha,
      spec,
      packageRoot
    });
    return {
      status: "compatible",
      scope: "pinned-api-contract",
      target,
      ...result
    };
  } catch (error) {
    throw new Error(`API target ${target.sha}: ${error.message}`, {
      cause: error
    });
  }
}

async function writeSummary(status, details) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  try {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `\n### API compatibility preflight\n\nResult: **${status}**\n\n${details}\n\n正式发布继续核对服务器实际 API，并在共享锁内检查版本。\n`
    );
  } catch {
    console.error("[api-preflight] unable to append summary");
  }
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    assert.ok(
      args.length === 0 || (args.length === 2 && args[0] === "--target"),
      "usage: preflight-api-contract.mjs [--target <file>]"
    );
    const result = await preflightApiContract({ targetFile: args[1] });
    console.log(`[api-preflight] ${JSON.stringify(result)}`);
    await writeSummary(
      "compatible",
      `Target: \`${result.target.repository}@${result.api_sha}\`\n\nSpec SHA-256: \`${result.spec_sha256}\``
    );
  } catch (error) {
    console.error(`[api-preflight] ${error.message}`);
    await writeSummary(
      "failed",
      "目标契约未通过。差异和固定目标版本见本步骤日志；需要升级 API 时按配套发布清单准备版本组合与顺序。"
    );
    process.exitCode = 1;
  }
}
