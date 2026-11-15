#!/usr/bin/env bash
# Phase transitions run in the calling shell; do not wrap deployment functions in
# an `if` or `||`, which would disable their errexit checks.
DEPLOY_METRICS_TOOL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/deploy-metrics.mjs"

deploy_metrics_call() {
  "${node_bin:-node}" "$DEPLOY_METRICS_TOOL" "$@" || {
    echo '[deploy-metrics] timing unavailable; retaining deployment exit status' >&2
    return 0
  }
}

deploy_metrics_init() {
  DEPLOY_METRICS_COMPONENT="$1"
  DEPLOY_METRICS_SCOPE="$2"
  DEPLOY_METRICS_STARTED="$(deploy_metrics_call init "$1" "$2")"
  DEPLOY_METRICS_CURSOR="$DEPLOY_METRICS_STARTED"
  DEPLOY_METRICS_PHASE=""
  DEPLOY_METRICS_FINISHED=false
}

deploy_phase_end() {
  local status="${1:-success}"
  if [[ -n "$DEPLOY_METRICS_PHASE" && -n "$DEPLOY_METRICS_CURSOR" ]]; then
    DEPLOY_METRICS_CURSOR="$(deploy_metrics_call phase "$DEPLOY_METRICS_COMPONENT" \
      "$DEPLOY_METRICS_SCOPE" "$DEPLOY_METRICS_PHASE" "$status" "$DEPLOY_METRICS_CURSOR")"
  fi
  DEPLOY_METRICS_PHASE=""
}

deploy_phase() {
  deploy_phase_end "${2:-success}"
  DEPLOY_METRICS_PHASE="$1"
}

deploy_metrics_mark() {
  [[ -n "$DEPLOY_METRICS_STARTED" ]] || return 0
  deploy_metrics_call milestone "$DEPLOY_METRICS_COMPONENT" "$DEPLOY_METRICS_SCOPE" \
    "$1" success "$DEPLOY_METRICS_STARTED" >/dev/null
}

deploy_metrics_finish() {
  local status=success
  [[ "$DEPLOY_METRICS_FINISHED" = false ]] || return 0
  DEPLOY_METRICS_FINISHED=true
  [[ "$1" = 0 ]] || status=failure
  deploy_phase_end "$status"
  [[ -n "$DEPLOY_METRICS_STARTED" ]] || return 0
  deploy_metrics_call phase "$DEPLOY_METRICS_COMPONENT" "$DEPLOY_METRICS_SCOPE" \
    total "$status" "$DEPLOY_METRICS_STARTED" >/dev/null
}

deploy_metrics_remote_summary() {
  [[ -f "$1" ]] || return 0
  deploy_metrics_call summary "$DEPLOY_METRICS_COMPONENT" "$1" >/dev/null
}
