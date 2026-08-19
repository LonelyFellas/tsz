#!/usr/bin/env bash

# 构建源不再取自工作区：部署时把 origin/main 的目标 commit 用 git archive 导出到
# 这个前缀下的临时目录，在那里装依赖、构建、取产物。gitignored 的 .env* 天然不在
# git 对象里，工作区脏不脏、在哪个分支上都影响不到产物。
#
# 前缀取 /tmp 的真实路径：macOS 上 /tmp 是指向 /private/tmp 的符号链接，而
# provenance.mjs 判断「自己是不是主模块」用的是 import.meta.url(已解析符号链接)与
# argv[1](原样传入)比对。用带符号链接的路径去 node 它，CLI 会整段不执行且静默退出 0——
# 上一版就是这样把产物 rsync 上了服务器却没生成 manifest。
DEPLOY_BUILD_ROOT_PREFIX="$(cd /tmp && pwd -P)/tsz-deploy-build."
DEPLOY_BUILD_ROOT=""

deploy_source_error() {
  printf 'deployment source gate: %s\n' "$1" >&2
  return 1
}

deploy_source_warn() {
  printf 'deployment source gate: %s\n' "$1" >&2
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

# 构建目录里绝不能有 Next/Vite 会读的 ignored 环境文件。git archive 只吐 commit 里的
# 文件，正常情况下这一定成立；仍然显式断言一次，让「产物不含本地环境变量」是被检查出来的
# 结论而不是推理出来的。
reject_ignored_build_env() {
  local component="$1"
  local root="$2"
  [[ -n "$root" ]] || {
    deploy_source_error "build root is required"
    return 1
  }
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
    if [[ -e "$root/$candidate" || -L "$root/$candidate" ]]; then
      deploy_source_error "ignored build environment file exists: $root/$candidate"
      return 1
    fi
  done
}

run_sanitized_build() {
  env -i PATH="$PATH" TMPDIR="${TMPDIR:-/tmp}" "$@"
}

wait_for_http_status() {
  local label="$1"
  local url="$2"
  local expected_status="$3"
  local max_attempts="$4"
  local retry_delay="$5"
  local attempt status

  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    status="$(curl -sS -m 8 -o /dev/null -w "%{http_code}" "$url" || true)"
    printf '%s attempt %d/%d -> %s\n' \
      "$label" "$attempt" "$max_attempts" "${status:-curl-error}"
    [[ "$status" = "$expected_status" ]] && return 0
    ((attempt == max_attempts)) || sleep "$retry_delay"
  done

  return 1
}

prepare_deploy_source() {
  local component="$1"
  case "$component" in
    web | admin) ;;
    *) deploy_source_error "component must be web or admin"; return 1 ;;
  esac
  command -v gh >/dev/null 2>&1 || {
    deploy_source_error "gh is required to prove the exact CI run"
    return 1
  }

  # 目标 commit 直接取自 origin/main：部署的永远是 main 的 HEAD，与本地在哪个分支无关。
  local target_sha git_tree origin_url repository ci_run
  target_sha="$(deploy_remote_main_sha)" || {
    deploy_source_error "cannot read origin/main"
    return 1
  }
  [[ "$target_sha" =~ ^[0-9a-f]{40}$ ]] || {
    deploy_source_error "origin/main is not a full lowercase commit SHA"
    return 1
  }
  if ! git cat-file -e "${target_sha}^{commit}" 2>/dev/null; then
    git fetch --no-tags --quiet origin main || {
      deploy_source_error "cannot fetch origin/main"
      return 1
    }
    git cat-file -e "${target_sha}^{commit}" 2>/dev/null || {
      deploy_source_error "origin/main commit is still missing after fetch"
      return 1
    }
  fi
  git_tree="$(git rev-parse "${target_sha}^{tree}")" || {
    deploy_source_error "cannot read the target commit tree"
    return 1
  }
  [[ "$git_tree" =~ ^[0-9a-f]{40}$ ]] || {
    deploy_source_error "target tree is not a full lowercase SHA"
    return 1
  }

  origin_url="$(git remote get-url origin)"
  repository="$(deploy_github_repository "$origin_url")" || return 1
  ci_run="$(
    gh api "repos/$repository/actions/runs?branch=main&head_sha=$target_sha&per_page=100" \
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

  # 工作区状态不再是门，但保留提醒：让人一眼看出「跑脚本的这棵树不是被部署的东西」。
  local worktree_status worktree_head
  worktree_status="$(deploy_worktree_status)" || worktree_status=""
  [[ -z "$worktree_status" ]] ||
    deploy_source_warn "工作区有未提交改动，不会进入产物"
  worktree_head="$(git rev-parse HEAD 2>/dev/null)" || worktree_head=""
  [[ "$worktree_head" = "$target_sha" ]] ||
    deploy_source_warn "工作区 HEAD (${worktree_head:-unknown}) 不是 origin/main，产物仍按 origin/main 构建"

  export DEPLOY_GIT_SHA="$target_sha"
  export DEPLOY_GIT_TREE="$git_tree"
  export DEPLOY_REPOSITORY="$repository"
  export DEPLOY_CI_RUN_ID="$run_id"
  export DEPLOY_CI_RUN_URL="$run_url"
  printf 'deployment source gate: %s @ %s, CI %s\n' \
    "$repository" "$target_sha" "$run_url"
}

# 导出目标 commit 到临时目录并在那里装依赖。成功后 DEPLOY_BUILD_ROOT 指向可构建的干净源码树。
prepare_deploy_build_tree() {
  local component="$1"
  [[ "${DEPLOY_GIT_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || {
    deploy_source_error "source gate has not been prepared"
    return 1
  }
  local root
  root="$(mktemp -d "${DEPLOY_BUILD_ROOT_PREFIX}XXXXXX")" || {
    deploy_source_error "cannot create a build directory"
    return 1
  }
  # 先记住路径再做任何可能失败的事，失败时 trap 才能清掉它。
  DEPLOY_BUILD_ROOT="$root"
  printf '==> export %s -> %s\n' "$DEPLOY_GIT_SHA" "$root"
  git archive --format=tar "$DEPLOY_GIT_SHA" | tar -xf - -C "$root" || {
    deploy_source_error "cannot export the target commit into the build tree"
    return 1
  }
  reject_ignored_build_env "$component" "$root" || return 1

  printf '==> pnpm install --frozen-lockfile\n'
  local install_start install_seconds
  install_start="$SECONDS"
  (cd "$root" && pnpm install --frozen-lockfile) || {
    deploy_source_error "dependency install failed in the build tree"
    return 1
  }
  install_seconds="$((SECONDS - install_start))"
  printf '==> dependency install took %ss\n' "$install_seconds"
}

remove_deploy_build_tree() {
  local root="${DEPLOY_BUILD_ROOT:-}"
  [[ -n "$root" ]] || return 0
  case "$root" in
    "$DEPLOY_BUILD_ROOT_PREFIX"*) rm -rf -- "$root" ;;
    *)
      printf '!! refusing to clean unexpected build root: %s\n' "$root" >&2
      return 1
      ;;
  esac
}

recheck_deploy_source() {
  local component="$1"
  [[ "${DEPLOY_GIT_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || {
    deploy_source_error "source gate has not been prepared"
    return 1
  }
  [[ -n "${DEPLOY_BUILD_ROOT:-}" ]] || {
    deploy_source_error "build tree has not been prepared"
    return 1
  }
  reject_ignored_build_env "$component" "$DEPLOY_BUILD_ROOT" || return 1
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
