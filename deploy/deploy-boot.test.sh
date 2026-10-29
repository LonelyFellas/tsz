#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
source "$repo_root/deploy/deploy-source.sh"

test_dir="$(mktemp -d /tmp/tsz-deploy-boot-test.XXXXXX)"
occupier_pid=""
cleanup_test() {
  stop_standalone_boot
  # 与 stop_standalone_boot 同理：整段重定向，挡掉 bash 对被 kill 后台任务打的 "Terminated"。
  [[ -z "$occupier_pid" ]] || { kill "$occupier_pid" 2>/dev/null; wait "$occupier_pid"; } 2>/dev/null || true
  rm -rf "$test_dir"
}
trap cleanup_test EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

# 用真的 node 起一个最小 server 冒充产物：这里要证的是闸本身（起得来放行、起不来拦下、
# 每条路径都收进程），产物的真实内容由部署时的真构建提供。
make_artifact() {
  local name="$1"
  local root="$test_dir/$name"
  mkdir -p "$root/apps/web"
  cat >"$root/apps/web/server.js"
  printf '%s' "$root"
}

healthy="$(make_artifact healthy <<'ENTRY'
const fs = require("node:fs");
const http = require("node:http");
fs.writeFileSync(__dirname + "/pid", String(process.pid));
http
  .createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  })
  .listen(Number(process.env.PORT), process.env.HOSTNAME);
ENTRY
)"

crashing="$(make_artifact crashing <<'ENTRY'
require("this-module-does-not-exist");
ENTRY
)"

unhealthy="$(make_artifact unhealthy <<'ENTRY'
const http = require("node:http");
http
  .createServer((_req, res) => {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("boom");
  })
  .listen(Number(process.env.PORT), process.env.HOSTNAME);
ENTRY
)"

# B01 起得来的产物放行，且不留下子进程。
verify_standalone_boot "$healthy" apps/web/server.js ||
  fail "B01 healthy artifact should pass the boot gate"
[[ -n "$(cat "$healthy/apps/web/pid")" ]] || fail "B01 healthy artifact should have been started"
if kill -0 "$(cat "$healthy/apps/web/pid")" 2>/dev/null; then
  fail "B01 boot child should be gone after the gate passes"
fi
[[ -z "$DEPLOY_BOOT_PID" ]] || fail "B01 boot pid handle should be cleared"

# B02 启动即崩（真实事故形状：MODULE_NOT_FOUND）要拦下，且不等满超时窗口。
started="$SECONDS"
if verify_standalone_boot "$crashing" apps/web/server.js 2>/dev/null; then
  fail "B02 crashing artifact should fail the boot gate"
fi
((SECONDS - started < 20)) || fail "B02 crashing artifact should fail fast"

# B03 起来了但不健康：卡在超时窗口上，到点必须退出而不是挂死。
started="$SECONDS"
DEPLOY_BOOT_TIMEOUT_SECONDS=3
if verify_standalone_boot "$unhealthy" apps/web/server.js 2>/dev/null; then
  fail "B03 non-200 artifact should fail the boot gate"
fi
unset DEPLOY_BOOT_TIMEOUT_SECONDS
((SECONDS - started < 30)) || fail "B03 non-200 artifact should stop at the timeout"
[[ -z "$DEPLOY_BOOT_PID" ]] || fail "B03 boot pid handle should be cleared"

# B04 产物里根本没有入口时直接拦下，不去起任何进程。
if verify_standalone_boot "$test_dir/missing" apps/web/server.js 2>/dev/null; then
  fail "B04 missing entry should fail the boot gate"
fi

# 随机种子生成的端口可能已被其他进程占用；仅以本进程监听成功的回执作为就绪依据。
occupy_seeded_ports() {
  local count="$1" seed tick
  for ((seed = 7; seed < 107; seed++)); do
    RANDOM="$seed"
    occupied_ports=()
    for ((tick = 0; tick < count; tick++)); do
      occupied_ports+=("$((40000 + RANDOM % 20000))")
    done
    rm -f "$test_dir/occupied-ready"
    node -e 'const fs = require("node:fs"), http = require("node:http");
const [ready, ...ports] = process.argv.slice(1);
let pending = ports.length;
for (const port of ports) {
  const server = http.createServer((_q, s) => s.end("x"));
  server.on("error", () => process.exit(2));
  server.listen(Number(port), "127.0.0.1", () => {
    if (--pending === 0) fs.writeFileSync(ready, "ready");
  });
}' "$test_dir/occupied-ready" "${occupied_ports[@]}" &
    occupier_pid=$!
    for ((tick = 0; tick < 50; tick++)); do
      [[ -f "$test_dir/occupied-ready" ]] && break
      kill -0 "$occupier_pid" 2>/dev/null || break
      sleep 0.1
    done
    if [[ -f "$test_dir/occupied-ready" ]]; then
      occupied_seed="$seed"
      return 0
    fi
    { kill "$occupier_pid" 2>/dev/null; wait "$occupier_pid"; } 2>/dev/null || true
    occupier_pid=""
  done
  fail "could not reserve a seeded set of test ports"
}

# B05 端口撞车要换端口重试，不能把好产物误判成起不来。
occupied_ports=()
occupied_seed=""
occupy_seeded_ports 1
occupied_port="${occupied_ports[0]}"
RANDOM="$occupied_seed"
verify_standalone_boot "$healthy" apps/web/server.js 2>"$test_dir/b05.err" ||
  fail "B05 an occupied port should be retried on another one, not reported as a dead artifact"
grep -q "$occupied_port" "$test_dir/b05.err" ||
  fail "B05 the port conflict should be reported before retrying"
{ kill "$occupier_pid" 2>/dev/null; wait "$occupier_pid"; } 2>/dev/null || true
occupier_pid=""

# B06 连着抢不到空闲端口时，结论要说「没抢到端口」，而不是诬赖产物起不来。
occupy_seeded_ports 3
RANDOM="$occupied_seed"
if verify_standalone_boot "$healthy" apps/web/server.js 2>"$test_dir/b06.err"; then
  fail "B06 should not pass when every candidate port is taken"
fi
grep -q "no free local port" "$test_dir/b06.err" ||
  fail "B06 should report that no port was free, not that the artifact is broken"
{ kill "$occupier_pid" 2>/dev/null; wait "$occupier_pid"; } 2>/dev/null || true
occupier_pid=""

printf 'deploy-boot tests: PASS\n'
