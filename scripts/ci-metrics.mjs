import { spawn } from "node:child_process";
import { appendFile, lstat, readdir } from "node:fs/promises";
import { constants as osConstants } from "node:os";
import { performance } from "node:perf_hooks";

const labelPattern = /^[A-Za-z0-9][A-Za-z0-9 ._:/-]{0,79}$/;
const cacheKeyPattern = /^[A-Za-z0-9._:/-]{1,512}$/;

function validateLabel(value) {
  if (!labelPattern.test(value ?? "")) {
    throw new Error(`invalid metric label: ${JSON.stringify(value)}`);
  }
  return value;
}

function validateCacheKey(value, { optional = false } = {}) {
  if (optional && value === "") return value;
  if (!cacheKeyPattern.test(value ?? "")) {
    throw new Error(`invalid cache key: ${JSON.stringify(value)}`);
  }
  return value;
}

function durationText(milliseconds) {
  return `${(milliseconds / 1000).toFixed(2)}s`;
}

async function appendSummary(line) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return false;
  try {
    await appendFile(summaryPath, `${line}\n`, "utf8");
    return true;
  } catch (error) {
    console.error(
      `[ci-metrics] unable to append GitHub step summary: ${error.message}`
    );
    return false;
  }
}

async function emit(record, summaryLine) {
  console.log(`[ci-metrics] ${JSON.stringify(record)}`);
  await appendSummary(summaryLine);
}

function signalExitCode(signal) {
  const number = osConstants.signals[signal];
  return Number.isInteger(number) ? 128 + number : 1;
}

async function runMeasured(label, command, args) {
  validateLabel(label);
  if (!command) throw new Error("measured command is required");
  const startedAt = performance.now();
  const child = spawn(command, args, {
    env: process.env,
    stdio: "inherit"
  });

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  const handleSigint = () => forwardSignal("SIGINT");
  const handleSigterm = () => forwardSignal("SIGTERM");
  process.once("SIGINT", handleSigint);
  process.once("SIGTERM", handleSigterm);

  try {
    const result = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    const durationMs = performance.now() - startedAt;
    const exitCode =
      result.code ?? (result.signal ? signalExitCode(result.signal) : 1);
    const status = exitCode === 0 ? "success" : "failure";
    await emit(
      { type: "phase", label, status, duration_ms: Math.round(durationMs) },
      `- CI phase \`${label}\`: **${status}**, ${durationText(durationMs)}`
    );
    return exitCode;
  } finally {
    process.off("SIGINT", handleSigint);
    process.off("SIGTERM", handleSigterm);
  }
}

async function pathBytes(path, required) {
  let pathStat;
  try {
    pathStat = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT" && !required) return 0;
    if (error?.code === "ENOENT") {
      throw new Error(`artifact path does not exist: ${path}`);
    }
    throw error;
  }
  if (pathStat.isSymbolicLink()) {
    throw new Error(`artifact path must not be a symbolic link: ${path}`);
  }
  if (pathStat.isFile()) return pathStat.size;
  if (!pathStat.isDirectory()) return 0;

  const entries = await readdir(path);
  const sizes = await Promise.all(
    entries.map((entry) => pathBytes(`${path}/${entry}`, true))
  );
  return sizes.reduce((total, size) => total + size, 0);
}

async function recordArtifact(label, mode, paths) {
  validateLabel(label);
  if (mode !== "required" && mode !== "optional") {
    throw new Error("artifact mode must be required or optional");
  }
  if (paths.length === 0)
    throw new Error("at least one artifact path is required");
  const sizes = await Promise.all(
    paths.map((path) => pathBytes(path, mode === "required"))
  );
  const bytes = sizes.reduce((total, size) => total + size, 0);
  await emit(
    { type: "artifact", label, mode, bytes, paths: paths.length },
    `- Artifact \`${label}\`: **${bytes} bytes** (${mode})`
  );
}

async function recordCache(
  label,
  primaryKey,
  matchedKey,
  rawHit,
  restoreOutcome
) {
  validateLabel(label);
  validateCacheKey(primaryKey);
  validateCacheKey(matchedKey, { optional: true });
  if (!new Set(["", "true", "false"]).has(rawHit)) {
    throw new Error(`invalid cache-hit value: ${JSON.stringify(rawHit)}`);
  }
  if (!new Set(["success", "failure"]).has(restoreOutcome)) {
    throw new Error(
      `invalid cache restore outcome: ${JSON.stringify(restoreOutcome)}`
    );
  }
  const status =
    restoreOutcome === "failure"
      ? "error"
      : rawHit === "true"
        ? "exact"
        : matchedKey
          ? "partial"
          : "miss";
  await emit(
    {
      type: "cache",
      label,
      status,
      restore_outcome: restoreOutcome,
      primary_key: primaryKey,
      matched_key: matchedKey || null
    },
    `- Cache \`${label}\`: **${status}**, primary=\`${primaryKey}\`, matched=\`${matchedKey || "none"}\``
  );
}

async function main(rawArgs) {
  const [command, ...args] = rawArgs;
  if (command === "run") {
    const separator = args.indexOf("--");
    if (separator !== 1 || args.length < 3) {
      throw new Error(
        "usage: ci-metrics.mjs run <label> -- <command> [args...]"
      );
    }
    return runMeasured(args[0], args[2], args.slice(3));
  }
  if (command === "artifact" && args.length >= 3) {
    await recordArtifact(args[0], args[1], args.slice(2));
    return 0;
  }
  if (command === "cache" && args.length === 5) {
    await recordCache(args[0], args[1], args[2], args[3], args[4]);
    return 0;
  }
  throw new Error(
    "usage: ci-metrics.mjs run <label> -- <command> [args...] | artifact <label> <required|optional> <paths...> | cache <label> <primary-key> <matched-key> <true|false> <success|failure>"
  );
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(`[ci-metrics] ${error.message}`);
  process.exitCode = 1;
}
