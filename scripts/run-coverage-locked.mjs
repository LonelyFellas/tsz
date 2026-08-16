import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { withSingleInstanceLock } from "./coverage-lock.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function positiveIntegerFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

async function runCoverage() {
  let waitWasReported = false;
  const timeoutMs = positiveIntegerFromEnv(
    "COVERAGE_LOCK_TIMEOUT_MS",
    15 * 60_000
  );
  const pollMs = positiveIntegerFromEnv("COVERAGE_LOCK_POLL_MS", 250);

  return withSingleInstanceLock(
    {
      lockDirectory: join(repositoryRoot, ".coverage-lock"),
      timeoutMs,
      pollMs,
      onWait(owner) {
        if (waitWasReported) return;
        waitWasReported = true;
        const ownerPid = owner?.wrapper_pid ?? "unknown";
        console.error(
          `[coverage-lock] Another coverage task is running (PID ${ownerPid}); waiting...`
        );
      }
    },
    async (lock) => {
      const vitestCli = join(
        repositoryRoot,
        "node_modules",
        "vitest",
        "vitest.mjs"
      );
      const child = spawn(
        process.execPath,
        [vitestCli, "run", "--coverage", ...process.argv.slice(2)],
        {
          cwd: repositoryRoot,
          env: process.env,
          stdio: "inherit"
        }
      );
      const childResult = new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code) => resolve(code ?? 1));
      });

      const forwardSignal = (signal) => child.kill(signal);
      const handleSigint = () => forwardSignal("SIGINT");
      const handleSigterm = () => forwardSignal("SIGTERM");
      process.once("SIGINT", handleSigint);
      process.once("SIGTERM", handleSigterm);

      try {
        if (child.pid !== undefined) await lock.setChildPid(child.pid);
        return await childResult;
      } finally {
        process.off("SIGINT", handleSigint);
        process.off("SIGTERM", handleSigterm);
      }
    }
  );
}

try {
  process.exitCode = await runCoverage();
} catch (error) {
  console.error(`[coverage-lock] ${error.message}`);
  process.exitCode = 1;
}
