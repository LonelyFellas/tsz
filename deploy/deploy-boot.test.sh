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

# B05 端口撞车要换端口重试，不能把好产物误判成起不来。
# 给 RANDOM 播同一个种子，就能预知闸挑的第一个端口，先把它占住。
RANDOM=7
occupied_port=$((40000 + RANDOM % 20000))
node -e "require('http').createServer((_q, s) => s.end('x')).listen($occupied_port, '127.0.0.1')" &
occupier_pid=$!
listening=""
for ((tick = 0; tick < 50; tick++)); do
  if curl -sS -m 1 -o /dev/null "http://127.0.0.1:${occupied_port}/" 2>/dev/null; then
    listening=1
    break
  fi
  sleep 0.1
done
[[ -n "$listening" ]] || fail "B05 could not occupy the port the gate will pick first"
RANDOM=7
verify_standalone_boot "$healthy" apps/web/server.js 2>"$test_dir/b05.err" ||
  fail "B05 an occupied port should be retried on another one, not reported as a dead artifact"
grep -q "$occupied_port" "$test_dir/b05.err" ||
  fail "B05 the port conflict should be reported before retrying"
{ kill "$occupier_pid" 2>/dev/null; wait "$occupier_pid"; } 2>/dev/null || true
occupier_pid=""

# B06 连着抢不到空闲端口时，结论要说「没抢到端口」，而不是诬赖产物起不来。
RANDOM=7
occupied_ports=()
for ((tick = 0; tick < 3; tick++)); do
  occupied_ports+=("$((40000 + RANDOM % 20000))")
done
node -e 'const http = require("http");
for (const port of process.argv.slice(1)) {
  http.createServer((_q, s) => s.end("x")).listen(Number(port), "127.0.0.1");
}' "${occupied_ports[@]}" &
occupier_pid=$!
for port in "${occupied_ports[@]}"; do
  listening=""
  for ((tick = 0; tick < 50; tick++)); do
    if curl -sS -m 1 -o /dev/null "http://127.0.0.1:${port}/" 2>/dev/null; then
      listening=1
      break
    fi
    sleep 0.1
  done
  [[ -n "$listening" ]] || fail "B06 could not occupy port $port"
done
RANDOM=7
if verify_standalone_boot "$healthy" apps/web/server.js 2>"$test_dir/b06.err"; then
  fail "B06 should not pass when every candidate port is taken"
fi
grep -q "no free local port" "$test_dir/b06.err" ||
  fail "B06 should report that no port was free, not that the artifact is broken"
{ kill "$occupier_pid" 2>/dev/null; wait "$occupier_pid"; } 2>/dev/null || true
occupier_pid=""

printf 'deploy-boot tests: PASS\n'
