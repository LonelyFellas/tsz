import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { API_REPOSITORY, validateApiSha } from "./api-contract.mjs";
import { validateApiTarget } from "./preflight-api-contract.mjs";

export async function fetchBackendMainSha(fetcher = globalThis.fetch) {
  const response = await fetcher(
    `https://api.github.com/repos/${API_REPOSITORY}/commits/main`,
    {
      redirect: "error",
      signal: AbortSignal.timeout(60000),
      headers: {
        Accept: "application/vnd.github+json",
        ...(process.env.GH_TOKEN
          ? { Authorization: `Bearer ${process.env.GH_TOKEN}` }
          : {})
      }
    }
  );
  assert.ok(
    response.ok,
    `cannot retrieve backend main SHA: HTTP ${response.status}`
  );
  const body = await response.json();
  validateApiSha(body.sha);
  return body.sha;
}

export async function verifyApiTargetMain({
  targetFile = resolve("deploy/api-target.json"),
  fetcher
} = {}) {
  const target = validateApiTarget(
    JSON.parse(await readFile(targetFile, "utf8"))
  );
  const mainSha = await fetchBackendMainSha(fetcher);
  assert.equal(
    target.sha,
    mainSha,
    `API target ${target.sha} does not match backend main ${mainSha}; update deploy/api-target.json after the backend merge`
  );
  return { target, mainSha };
}

if (import.meta.main) {
  const result = await verifyApiTargetMain();
  console.log(
    `[api-target] backend main ${result.mainSha} matches target ${result.target.sha}`
  );
}
