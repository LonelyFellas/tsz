import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { checkDeployedApiContract } from "./check-api-contract.mjs";

const DEFAULT_INTERVAL_MS = 20 * 1000;
// Backend deployment recovery may take longer than the old 15-minute wait.
export const DEFAULT_COMPATIBLE_TIMEOUT_MS = 120 * 60 * 1000;

function nextDelay({ deadline, now, intervalMs }) {
  return deadline == null
    ? intervalMs
    : Math.min(intervalMs, Math.max(0, deadline - now()));
}

export async function waitForApiContract({
  expectedSha,
  check = checkDeployedApiContract,
  sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
  timeoutMs = null,
  intervalMs = DEFAULT_INTERVAL_MS,
  now = () => Date.now()
}) {
  assert.match(expectedSha, /^[0-9a-f]{40}$/);
  const deadline = timeoutMs == null ? null : now() + timeoutMs;
  let lastError;
  while (true) {
    try {
      const actualSha = await check();
      if (actualSha === expectedSha) return actualSha;
      lastError = new Error(
        `deployed API is ${actualSha}, expected ${expectedSha}`
      );
    } catch (error) {
      lastError = error;
    }
    if (deadline != null && now() >= deadline) {
      throw new Error(
        `API contract did not reach ${expectedSha}: ${lastError?.message ?? "unknown error"}`,
        {
          cause: lastError
        }
      );
    }
    console.error(
      `[api-contract] waiting for ${expectedSha}: ${lastError?.message ?? "unknown error"}`
    );
    await sleep(nextDelay({ deadline, now, intervalMs }));
  }
}

export async function waitForCompatibleApiContract({
  check = checkDeployedApiContract,
  sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
  timeoutMs = DEFAULT_COMPATIBLE_TIMEOUT_MS,
  intervalMs = DEFAULT_INTERVAL_MS,
  now = () => Date.now()
} = {}) {
  const deadline = timeoutMs == null ? null : now() + timeoutMs;
  let lastError;
  while (true) {
    try {
      const actualSha = await check();
      assert.match(actualSha, /^[0-9a-f]{40}$/);
      return actualSha;
    } catch (error) {
      lastError = error;
    }
    if (deadline != null && now() >= deadline) {
      throw new Error(
        `deployed API did not become compatible: ${lastError?.message ?? "unknown error"}`,
        { cause: lastError }
      );
    }
    console.error(
      `[api-contract] waiting for a compatible deployed API: ${lastError?.message ?? "unknown error"}`
    );
    await sleep(nextDelay({ deadline, now, intervalMs }));
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  assert.ok(
    args.length === 0 || (args.length === 1 && args[0] === "--compatible"),
    "usage: wait-api-contract.mjs [--compatible]"
  );
  if (args[0] === "--compatible") {
    console.log(await waitForCompatibleApiContract());
  } else {
    const target = JSON.parse(
      await readFile(resolve("deploy/api-target.json"), "utf8")
    );
    console.log(await waitForApiContract({ expectedSha: target.sha }));
  }
}
