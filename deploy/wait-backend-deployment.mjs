import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { API_REPOSITORY, validateApiSha } from "./api-contract.mjs";
import { validateApiTarget } from "./preflight-api-contract.mjs";

const DEPLOY_WORKFLOW_NAME = "Deploy tshb-test";
const DEFAULT_INTERVAL_MS = 30 * 1000;
const API_TIMEOUT_MS = 60 * 1000;

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function githubJson(url, fetcher = globalThis.fetch) {
  const response = await fetcher(url, {
    redirect: "error",
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(process.env.GH_TOKEN
        ? { Authorization: `Bearer ${process.env.GH_TOKEN}` }
        : {})
    }
  });
  assert.ok(response.ok, `GitHub API request failed: HTTP ${response.status}`);
  return response.json();
}

function matchingRuns(payload, expectedSha) {
  return (payload.workflow_runs ?? [])
    .filter(
      (run) =>
        run.name === DEPLOY_WORKFLOW_NAME &&
        run.head_branch === "main" &&
        run.head_sha === expectedSha &&
        run.event === "workflow_run" &&
        run.repository?.full_name === API_REPOSITORY
    )
    .sort((left, right) => {
      const leftKey = `${left.created_at ?? ""}:${left.id ?? 0}`;
      const rightKey = `${right.created_at ?? ""}:${right.id ?? 0}`;
      return rightKey.localeCompare(leftKey);
    });
}

export async function fetchBackendDeployment({
  expectedSha,
  fetcher = globalThis.fetch
}) {
  validateApiSha(expectedSha);
  const payload = await githubJson(
    `https://api.github.com/repos/${API_REPOSITORY}/actions/runs?branch=main&head_sha=${expectedSha}&per_page=100`,
    fetcher
  );
  return matchingRuns(payload, expectedSha)[0] ?? null;
}

export async function fetchBackendMainSha(fetcher = globalThis.fetch) {
  const payload = await githubJson(
    `https://api.github.com/repos/${API_REPOSITORY}/commits/main`,
    fetcher
  );
  return validateApiSha(payload.sha);
}

export async function waitForBackendDeployment({
  expectedSha,
  fetcher = globalThis.fetch,
  sleep: sleepFn = sleep,
  intervalMs = DEFAULT_INTERVAL_MS,
  now = () => Date.now(),
  timeoutMs = null
}) {
  validateApiSha(expectedSha);
  const deadline = timeoutMs == null ? null : now() + timeoutMs;
  while (true) {
    const run = await fetchBackendDeployment({ expectedSha, fetcher });
    if (run?.status === "completed") {
      assert.equal(
        run.conclusion,
        "success",
        `backend deployment ${run.id} ended with ${run.conclusion}`
      );
      return {
        expectedSha,
        runId: run.id,
        attempt: run.run_attempt
      };
    }
    if (!run) {
      const mainSha = await fetchBackendMainSha(fetcher);
      if (mainSha !== expectedSha) {
        throw new Error(
          `backend target ${expectedSha} was superseded by main ${mainSha}`
        );
      }
    }
    if (deadline != null && now() >= deadline) {
      throw new Error(`backend deployment did not complete for ${expectedSha}`);
    }
    console.error(
      `[backend-deploy] waiting for ${expectedSha}: ${run?.status ?? "run-not-created"}`
    );
    await sleepFn(
      deadline == null
        ? intervalMs
        : Math.min(intervalMs, Math.max(0, deadline - now()))
    );
  }
}

if (import.meta.main) {
  const target = validateApiTarget(
    JSON.parse(await readFile(resolve("deploy/api-target.json"), "utf8"))
  );
  const result = await waitForBackendDeployment({ expectedSha: target.sha });
  console.log(`[backend-deploy] ${JSON.stringify(result)}`);
}
