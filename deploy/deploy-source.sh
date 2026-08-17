#!/usr/bin/env bash

deploy_source_error() {
  printf 'deployment source gate: %s\n' "$1" >&2
  return 1
}

deploy_remote_main_sha() {
  git ls-remote --exit-code origin refs/heads/main | awk 'NR == 1 { print $1 }'
}

deploy_github_repository() {
  local origin_url="$1"
  local repository
  case "$origin_url" in
    git@github.com:*) repository="${origin_url#git@github.com:}" ;;
    ssh://git@github.com/*) repository="${origin_url#ssh://git@github.com/}" ;;
    https://github.com/*) repository="${origin_url#https://github.com/}" ;;
    *) deploy_source_error "origin is not a supported GitHub URL"; return 1 ;;
  esac
  repository="${repository%.git}"
  if [[ ! "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
    deploy_source_error "cannot derive a safe owner/repository from origin"
    return 1
  fi
  printf '%s\n' "$repository"
}

deploy_worktree_status() {
  local status_output
  status_output="$(git status --porcelain)" || {
    deploy_source_error "cannot read working tree status"
    return 1
  }
  printf '%s' "$status_output"
}

reject_ignored_build_env() {
  local component="$1"
  local candidates=()
  case "$component" in
    web)
      candidates=(apps/web/.env apps/web/.env.local apps/web/.env.production.local)
      ;;
    admin)
      candidates=(
        apps/admin/.env
        apps/admin/.env.local
        apps/admin/.env.test
        apps/admin/.env.test.local
      )
      ;;
    *) deploy_source_error "component must be web or admin"; return 1 ;;
  esac
  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -e "$candidate" || -L "$candidate" ]]; then
      deploy_source_error "ignored build environment file exists: $candidate"
      return 1
    fi
  done
}

run_sanitized_build() {
  env -i PATH="$PATH" TMPDIR="${TMPDIR:-/tmp}" "$@"
}

prepare_deploy_source() {
  local component="$1"
  command -v gh >/dev/null 2>&1 || {
    deploy_source_error "gh is required to prove the exact CI run"
    return 1
  }
  local worktree_status
  worktree_status="$(deploy_worktree_status)" || return 1
  [[ -z "$worktree_status" ]] || {
    deploy_source_error "working tree is not clean"
    return 1
  }
  reject_ignored_build_env "$component" || return 1

  local head_sha git_tree remote_sha origin_url repository ci_run
  head_sha="$(git rev-parse HEAD)"
  git_tree="$(git rev-parse 'HEAD^{tree}')"
  [[ "$head_sha" =~ ^[0-9a-f]{40}$ ]] || {
    deploy_source_error "HEAD is not a full lowercase commit SHA"
    return 1
  }
  [[ "$git_tree" =~ ^[0-9a-f]{40}$ ]] || {
    deploy_source_error "HEAD tree is not a full lowercase SHA"
    return 1
  }
  remote_sha="$(deploy_remote_main_sha)" || {
    deploy_source_error "cannot read origin/main"
    return 1
  }
  [[ "$remote_sha" = "$head_sha" ]] || {
    deploy_source_error "HEAD does not equal current origin/main"
    return 1
  }

  origin_url="$(git remote get-url origin)"
  repository="$(deploy_github_repository "$origin_url")" || return 1
  ci_run="$(
    gh api "repos/$repository/actions/runs?branch=main&head_sha=$head_sha&per_page=100" \
      --jq '[.workflow_runs[] | select(.name == "CI")] | sort_by(.created_at) | last | if . == null then empty else [.id, .status, (.conclusion // "-"), .html_url] | @tsv end'
  )" || {
    deploy_source_error "GitHub CI query failed"
    return 1
  }
  [[ -n "$ci_run" ]] || {
    deploy_source_error "no CI run exists for the exact main SHA"
    return 1
  }

  local run_id run_status run_conclusion run_url
  IFS=$'\t' read -r run_id run_status run_conclusion run_url <<<"$ci_run"
  [[ "$run_id" =~ ^[1-9][0-9]{0,14}$ ]] || {
    deploy_source_error "CI run ID is invalid"
    return 1
  }
  [[ "$run_status" = completed && "$run_conclusion" = success ]] || {
    deploy_source_error "exact main CI is not completed/success"
    return 1
  }
  [[ "$run_url" = "https://github.com/$repository/actions/runs/$run_id" ]] || {
    deploy_source_error "CI run URL does not match repository and run ID"
    return 1
  }

  export DEPLOY_GIT_SHA="$head_sha"
  export DEPLOY_GIT_TREE="$git_tree"
  export DEPLOY_REPOSITORY="$repository"
  export DEPLOY_CI_RUN_ID="$run_id"
  export DEPLOY_CI_RUN_URL="$run_url"
  printf 'deployment source gate: %s @ %s, CI %s\n' \
    "$repository" "$head_sha" "$run_url"
}

recheck_deploy_source() {
  local component="$1"
  [[ "${DEPLOY_GIT_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || {
    deploy_source_error "source gate has not been prepared"
    return 1
  }
  local worktree_status
  worktree_status="$(deploy_worktree_status)" || return 1
  [[ -z "$worktree_status" ]] || {
    deploy_source_error "working tree changed after source gate"
    return 1
  }
  reject_ignored_build_env "$component" || return 1
  [[ "$(git rev-parse HEAD)" = "$DEPLOY_GIT_SHA" ]] || {
    deploy_source_error "HEAD changed after source gate"
    return 1
  }
  local remote_sha
  remote_sha="$(deploy_remote_main_sha)" || {
    deploy_source_error "cannot re-read origin/main"
    return 1
  }
  [[ "$remote_sha" = "$DEPLOY_GIT_SHA" ]] || {
    deploy_source_error "origin/main advanced after source gate"
    return 1
  }
}
