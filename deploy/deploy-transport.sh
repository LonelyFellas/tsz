#!/usr/bin/env bash
# A manual entrypoint owns its socket. CI supplies one shared socket for the
# contract checks and both components, and closes it in its always-run cleanup.
deploy_transport_init() {
  DEPLOY_SSH_OWNED=false
  if [[ -z "${DEPLOY_SSH_CONTROL_PATH:-}" ]]; then
    DEPLOY_SSH_CONTROL_PATH="$1/ssh-control"
    DEPLOY_SSH_OWNED=true
  fi
  [[ "$DEPLOY_SSH_CONTROL_PATH" = /* && "$DEPLOY_SSH_CONTROL_PATH" != *$'\n'* ]] || {
    echo 'invalid deployment SSH control path' >&2
    return 1
  }
  DEPLOY_SSH_OPTIONS=(
    -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes
    -o ControlMaster=auto -o ControlPersist=60 -S "$DEPLOY_SSH_CONTROL_PATH"
  )
  # rsync tokenizes -e itself; shell-style backslash escaping (printf %q) does
  # not preserve spaces. Its quoted arguments escape a quote by doubling it.
  local option
  DEPLOY_RSYNC_RSH=ssh
  for option in "${DEPLOY_SSH_OPTIONS[@]}"; do
    option="${option//\'/\'\'}"
    DEPLOY_RSYNC_RSH="$DEPLOY_RSYNC_RSH '$option'"
  done
}

deploy_ssh() {
  command ssh "${DEPLOY_SSH_OPTIONS[@]}" "$@"
}

deploy_transport_cleanup() {
  [[ "${DEPLOY_SSH_OWNED:-false}" = true ]] || return 0
  # -O exit only addresses an existing master; it never starts a remote command.
  deploy_ssh -O exit tshb-test >/dev/null 2>&1 || true
}
