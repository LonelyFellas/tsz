import { appendFile, readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { constants } from "node:os";
import { pathToFileURL } from "node:url";

const prefix = "[deploy-metrics] ";
const clock = () => Number(process.hrtime.bigint() / 1_000_000n);

export function validateMetric(record, component = record.component) {
  if (
    !["web", "admin"].includes(component) ||
    record.component !== component ||
    !["local", "remote"].includes(record.scope) ||
    !["phase", "milestone"].includes(record.type) ||
    typeof record.phase !== "string" ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(record.phase) ||
    !["success", "failure"].includes(record.status) ||
    !Number.isSafeInteger(record.duration_ms) ||
    record.duration_ms < 0
  ) {
    throw new Error("invalid deployment metric");
  }
  return record;
}

export function remoteMetrics(source, component) {
  const records = [];
  for (const line of source.split("\n")) {
    if (!line.startsWith(prefix)) continue;
    try {
      const record = validateMetric(
        JSON.parse(line.slice(prefix.length)),
        component
      );
      if (record.scope === "remote") records.push(record);
    } catch {
      // Remote command output is data, including anything resembling a metric.
      console.error("[deploy-metrics] ignored invalid remote metric");
    }
  }
  return records;
}

async function summary(text) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  try {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, text);
  } catch {
    console.error("[deploy-metrics] unable to append deployment summary");
  }
}

function row(record) {
  const label =
    record.type === "milestone" ? `${record.phase} (elapsed)` : record.phase;
  return `| ${record.scope} | ${label} | ${record.status} | ${(record.duration_ms / 1000).toFixed(3)}s |\n`;
}

const tableHeader =
  "| Scope | Phase | Result | Time |\n| --- | --- | --- | ---: |\n";

async function main(args) {
  const [command, component, scope, phase, status, started] = args;
  if (command === "run") {
    if (args[4] !== "--" || !args[5]) {
      throw new Error(
        "usage: deploy-metrics.mjs run <component> <scope> <phase> -- <command> [args...]"
      );
    }
    const record = validateMetric({
      type: "phase",
      component,
      scope,
      phase,
      status: "success",
      duration_ms: 0
    });
    const began = clock();
    const result = spawnSync(args[5], args.slice(6), { stdio: "inherit" });
    const code =
      result.status ??
      (result.signal ? 128 + (constants.signals[result.signal] ?? 0) : 1);
    if (result.error)
      console.error(`[deploy-metrics] command failed: ${result.error.message}`);
    record.status = code === 0 ? "success" : "failure";
    record.duration_ms = clock() - began;
    console.error(`${prefix}${JSON.stringify(record)}`);
    if (scope === "local") {
      await summary(
        `\n### ${component}: ${phase}\n\n${tableHeader}${row(record)}`
      );
    }
    process.exitCode = code;
    return;
  }
  if (command === "init") {
    validateMetric({
      type: "phase",
      component,
      scope,
      phase: "total",
      status: "success",
      duration_ms: 0
    });
    if (scope === "local") {
      await summary(`\n### ${component}: deployment timing\n\n${tableHeader}`);
    }
    console.log(clock());
    return;
  }
  if (command === "summary") {
    for (const record of remoteMetrics(
      await readFile(scope, "utf8"),
      component
    )) {
      await summary(row(record));
    }
    return;
  }
  if (command !== "phase" && command !== "milestone") {
    throw new Error("unknown deployment metrics command");
  }
  const now = clock();
  const start = Number(started);
  if (!started || !Number.isSafeInteger(start) || start < 0 || start > now) {
    throw new Error("invalid deployment start time");
  }
  const record = validateMetric({
    type: command,
    component,
    scope,
    phase,
    status,
    duration_ms: now - start
  });
  console.error(`${prefix}${JSON.stringify(record)}`);
  if (scope === "local") await summary(row(record));
  console.log(now);
}

if (
  process.argv[1] &&
  pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url
) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(`[deploy-metrics] ${error.message}`);
    process.exitCode = 1;
  }
}
