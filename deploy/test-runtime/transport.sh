#!/usr/bin/env bash
set -euo pipefail
# Real SSH/rsync over loopback in an isolated container. No deployed host or key.
root="$(mktemp -d /tmp/tsz-transport-test.XXXXXX)"
server_pid=""
workspace="$root/workspace with 'quotes'"
cleanup() {
  local status=$?
  if [[ "$status" != 0 && -f "$root/server.log" ]]; then cat "$root/server.log" >&2; fi
  deploy_transport_cleanup
  [[ -z "$server_pid" ]] || kill "$server_pid" || true
  rm -rf -- "$root"
  exit "$status"
}
source /repo/deploy/deploy-transport.sh
trap cleanup EXIT
mkdir -p /run/sshd /root/.ssh "$workspace" "$root/source/artifact/assets"
chmod 700 /root/.ssh
chmod 700 "$root/source"
ssh-keygen -q -t ed25519 -N '' -f "$root/host-key"
ssh-keygen -q -t ed25519 -N '' -f "$root/client-key"
cp "$root/client-key.pub" /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
cat >"$root/sshd.conf" <<EOF
ListenAddress 127.0.0.1
Port 2222
HostKey $root/host-key
PidFile $root/sshd.pid
AuthorizedKeysFile /root/.ssh/authorized_keys
PermitRootLogin yes
PasswordAuthentication no
KbdInteractiveAuthentication no
UsePAM no
LogLevel VERBOSE
EOF
printf '[127.0.0.1]:2222 %s\n' "$(cat "$root/host-key.pub")" >"$root/known_hosts"
cat >/root/.ssh/config <<EOF
Host tshb-test
  HostName 127.0.0.1
  Port 2222
  User root
  IdentityFile $root/client-key
  IdentitiesOnly yes
  UserKnownHostsFile $root/known_hosts
EOF
chmod 600 /root/.ssh/config
# Debian's image locks root; this container accepts only our temporary SSH key.
passwd -d root >/dev/null
/usr/sbin/sshd -D -e -f "$root/sshd.conf" >"$root/server.log" 2>&1 &
server_pid=$!
for attempt in {1..50}; do
  [[ ! -f "$root/sshd.pid" ]] || break
  sleep 0.1
done
[[ -f "$root/sshd.pid" ]]
unset DEPLOY_SSH_CONTROL_PATH
deploy_transport_init "$workspace"
[[ "$(deploy_ssh tshb-test 'printf connected')" = connected ]]
[[ -S "$DEPLOY_SSH_CONTROL_PATH" ]]
printf 'verified artifact\n' >"$root/source/artifact/assets/payload.js"
ln -s assets/payload.js "$root/source/artifact/link.js"
printf 'candidate\n' >"$root/source/candidate.json"
rsync -az --no-o --no-g --timeout=180 -e "$DEPLOY_RSYNC_RSH" "$root/source/" "tshb-test:$root/received/"
diff -r "$root/source" "$root/received"
[[ "$(stat -c '%a' "$root/received")" = 700 ]]
# Another component borrows the same socket and must not close its owner.
DEPLOY_SSH_CONTROL_PATH="$DEPLOY_SSH_CONTROL_PATH" bash -c '
  set -euo pipefail
  source /repo/deploy/deploy-transport.sh
  deploy_transport_init "$1"
  [[ "$(deploy_ssh tshb-test "printf borrowed")" = borrowed ]]
  deploy_transport_cleanup
' bash "$workspace"
[[ "$(deploy_ssh tshb-test 'printf reused')" = reused ]]
[[ "$(grep -c 'Accepted publickey for' "$root/server.log")" = 1 ]]
deploy_ssh -O check tshb-test
# The borrowed master keeps output FDs alive after a timed-out client. The log
# collector must return without waiting for that master or the remote command.
began=$SECONDS
set +e
python3 -I /repo/deploy/run-with-progress.py --log-file "$root/timeout.log" \
  1 remote-timeout ssh "${DEPLOY_SSH_OPTIONS[@]}" tshb-test 'printf remote-start; sleep 10; printf remote-end'
status=$?
set -e
[[ "$status" = 124 ]]
((SECONDS - began < 5))
grep -q remote-start "$root/timeout.log"
deploy_ssh -O check tshb-test
set +e
python3 -I /repo/deploy/run-with-progress.py --log-file "$root/failure.log" \
  5 remote-failure ssh "${DEPLOY_SSH_OPTIONS[@]}" tshb-test 'printf remote-failure; exit 42'
status=$?
set -e
[[ "$status" = 42 ]]
grep -q remote-failure "$root/failure.log"
[[ "$(grep -c 'Accepted publickey for' "$root/server.log")" = 1 ]]
# A disconnected master may be recreated; publication commands are never retried.
deploy_ssh -O exit tshb-test
[[ "$(deploy_ssh tshb-test 'printf reconnected')" = reconnected ]]
[[ "$(grep -c 'Accepted publickey for' "$root/server.log")" = 2 ]]
deploy_transport_cleanup
if deploy_ssh -O check tshb-test 2>/dev/null; then
  echo 'owned SSH master survived cleanup' >&2
  exit 1
fi
# Reconnection must retain strict host-key verification.
: >"$root/untrusted_hosts"
if deploy_ssh -o "UserKnownHostsFile=$root/untrusted_hosts" tshb-test true 2>/dev/null; then
  echo 'unknown host key was accepted' >&2
  exit 1
fi
echo 'PASS: one SSH authentication, bounded logs with shared master, failure status, reconnect, owner cleanup, strict host key'
