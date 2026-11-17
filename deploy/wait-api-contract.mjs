import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { checkDeployedApiContract } from "./check-api-contract.mjs";

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 20 * 1000;

export async function waitForApiContract({
  expectedSha,
  check = checkDeployedApiContract,
  sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  intervalMs = DEFAULT_INTERVAL_MS,
  now = () => Date.now()
}) {
  assert.match(expectedSha, /^[0-9a-f]{40}$/);
  const deadline = now() + timeoutMs;
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
    if (now() >= deadline) {
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
    await sleep(Math.min(intervalMs, Math.max(0, deadline - now())));
  }
}

if (import.meta.main) {
  const target = JSON.parse(
    await readFile(resolve("deploy/api-target.json"), "utf8")
  );
  console.log(await waitForApiContract({ expectedSha: target.sha }));
}
