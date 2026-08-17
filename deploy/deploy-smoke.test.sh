#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
source "$repo_root/deploy/deploy-source.sh"

test_dir="$(mktemp -d /tmp/tsz-deploy-smoke-test.XXXXXX)"
trap 'rm -rf "$test_dir"' EXIT
fake_bin="$test_dir/bin"
mkdir -p "$fake_bin"

cat >"$fake_bin/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
set -euo pipefail
call_count=0
if [[ -f "$FAKE_CURL_CALLS" ]]; then
  call_count="$(wc -l <"$FAKE_CURL_CALLS" | tr -d '[:space:]')"
fi
next_call=$((call_count + 1))
printf '%s\n' "$next_call" >>"$FAKE_CURL_CALLS"
status="$(sed -n "${next_call}p" "$FAKE_CURL_RESPONSES")"
[[ -n "$status" ]] || exit 90
printf '%s' "$status"
FAKE_CURL
chmod +x "$fake_bin/curl"
export PATH="$fake_bin:$PATH"
export FAKE_CURL_CALLS="$test_dir/calls"
export FAKE_CURL_RESPONSES="$test_dir/responses"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

set_responses() {
  : >"$FAKE_CURL_CALLS"
  printf '%s\n' "$@" >"$FAKE_CURL_RESPONSES"
}

call_count() {
  wc -l <"$FAKE_CURL_CALLS" | tr -d '[:space:]'
}

set_responses 200
wait_for_http_status "GET /" "http://example.test/" 200 3 0
[[ "$(call_count)" = 1 ]] || fail "S08 immediate success should make one request"

set_responses 502 200
wait_for_http_status "GET /" "http://example.test/" 200 3 0
[[ "$(call_count)" = 2 ]] || fail "S08 transient 502 should retry once"

set_responses 502 502 502
if wait_for_http_status "GET /" "http://example.test/" 200 3 0; then
  fail "S08 persistent 502 unexpectedly succeeded"
fi
[[ "$(call_count)" = 3 ]] || fail "S08 persistent failure should stop at the attempt limit"

printf 'deploy-smoke tests: PASS\n'
