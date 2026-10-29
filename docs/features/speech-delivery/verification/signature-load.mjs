import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
const root = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(root, "load.json"), "utf8"));
if (config.base !== "http://127.0.0.1:8417/api/v1")
  throw Error("unexpected load destination");
const url = `${config.base}/dictionary/entries/${config.entry_id}/audio/${config.asset_id}`;
const started = new Date().toISOString();
const results = [];
let stopped = false;
let refreshedAt = performance.now();
let refreshes = 0;
let refreshPending;
let refreshFailure;
const refreshLatency = [];
process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function receipt(state) {
  const value = {
    started,
    updated: new Date().toISOString(),
    state,
    environment:
      "isolated single-instance native release optimized signing path pool20; signing API only, not media delivery",
    max_outstanding: 8192,
    refreshes,
    refresh_latency_ms: refreshLatency,
    phases: results
  };
  writeFileSync(
    join(root, "signature-pool20-full.tmp"),
    JSON.stringify(value, null, 2)
  );
  renameSync(
    join(root, "signature-pool20-full.tmp"),
    join(root, "signature-pool20-full.json")
  );
}
async function refresh() {
  const refreshStarted = performance.now();
  const response = await fetch(config.base + "/auth/refresh", {
    method: "POST",
    headers: { Cookie: "refresh_token=" + config.refresh_cookie },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw Error("load fixture refresh " + response.status);
  const value = await response.json();
  config.access_token = value.access_token;
  const set = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("refresh_token="));
  if (!set) throw Error("missing refreshed fixture cookie");
  config.refresh_cookie = set.split(";")[0].slice("refresh_token=".length);
  writeFileSync(join(root, "load.json"), JSON.stringify(config), {
    mode: 0o600
  });
  refreshedAt = performance.now();
  refreshes++;
  refreshLatency.push(performance.now() - refreshStarted);
}
async function phase(name, rate, seconds) {
  const metrics = {
    name,
    target_rps: rate,
    duration_seconds: seconds,
    scheduled: 0,
    sent: 0,
    backpressure: 0,
    statuses: {},
    errors: 0
  };
  const latency = [];
  const pending = new Set();
  const start = performance.now();
  results.push(metrics);
  let nextReport = start + 60000;
  function send() {
    metrics.sent++;
    const at = performance.now();
    let work;
    work = (async () => {
      try {
        const response = await fetch(url, {
          headers: { Authorization: "Bearer " + config.access_token },
          signal: AbortSignal.timeout(5000)
        });
        await response.arrayBuffer();
        metrics.statuses[response.status] =
          (metrics.statuses[response.status] ?? 0) + 1;
      } catch {
        metrics.errors++;
      } finally {
        latency.push(performance.now() - at);
        pending.delete(work);
      }
    })();
    pending.add(work);
  }
  while (!stopped && performance.now() - start < seconds * 1000) {
    const now = performance.now();
    if (now - refreshedAt > 600000 && !refreshPending)
      refreshPending = refresh()
        .catch((error) => {
          refreshFailure = error;
          stopped = true;
        })
        .finally(() => {
          refreshPending = undefined;
        });
    const desired = Math.min(
      Math.floor(((now - start) * rate) / 1000),
      rate * seconds
    );
    const due = desired - metrics.scheduled;
    metrics.scheduled = desired;
    for (let i = 0; i < due; i++) {
      if (pending.size >= 8192) metrics.backpressure++;
      else send();
    }
    if (now >= nextReport) {
      metrics.elapsed_seconds = (now - start) / 1000;
      receipt("running");
      console.log(
        JSON.stringify({
          phase: name,
          elapsed_seconds: Math.round(metrics.elapsed_seconds),
          sent: metrics.sent,
          backpressure: metrics.backpressure,
          errors: metrics.errors
        })
      );
      nextReport = now + 60000;
    }
    await sleep(10);
  }
  await Promise.all(pending);
  metrics.elapsed_seconds = (performance.now() - start) / 1000;
  latency.sort((a, b) => a - b);
  const percentile = (q) =>
    latency[Math.min(latency.length - 1, Math.floor(latency.length * q))] ??
    null;
  metrics.latency_ms = {
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: latency.at(-1) ?? null
  };
  metrics.actual_rps = metrics.sent / metrics.elapsed_seconds;
  metrics.passed =
    !stopped &&
    metrics.errors === 0 &&
    metrics.backpressure === 0 &&
    Object.keys(metrics.statuses).every((code) => code === "200") &&
    metrics.actual_rps >= rate * 0.98 &&
    metrics.latency_ms.p95 <= 150;
  receipt("running");
  console.log(JSON.stringify({ phase: name, complete: true, ...metrics }));
}
let failure;
try {
  receipt("running");
  await phase("warmup", 100, 30);
  await phase("sustained", 400, 1800);
  if (!stopped) await phase("burst", 1000, 10);
  if (refreshFailure) throw refreshFailure;
  receipt(
    stopped
      ? "interrupted"
      : results.every((p) => p.passed)
        ? "passed"
        : "failed"
  );
} catch (error) {
  failure = String(error);
  receipt("failed");
  console.error("load failed: " + failure);
} finally {
  const cleanup = spawnSync("python3", [join(root, "cleanup_cloud.py")], {
    stdio: "inherit"
  });
  if (cleanup.status !== 0) {
    console.error("owned cloud cleanup failed");
    process.exitCode = 1;
  }
  if (failure || stopped || results.some((p) => !p.passed))
    process.exitCode = 1;
}
