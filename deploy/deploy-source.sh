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

# 本地 boot 闸起的子进程句柄：verify_standalone_boot 起服务前写入，收进程只走
# stop_standalone_boot 一条路径（deploy-web.sh 的 EXIT trap 里再兜一次）。
DEPLOY_BOOT_PID=""

stop_standalone_boot() {
  local pid="${DEPLOY_BOOT_PID:-}"
  [[ -n "$pid" ]] || return 0
  DEPLOY_BOOT_PID=""
  # 整段包起来重定向 stderr：被 kill 的后台任务，bash 会在下一个命令边界（这里是轮询用的
  # sleep）往 stderr 打一行 "Terminated: 15"，只重定向 wait 挡不住，部署日志里看着像出事了。
  local tick
  {
    kill "$pid" 2>/dev/null || true
    # 先给 SIGTERM 两秒收尾，赖着不走再 SIGKILL：trap 里绝不能无限 wait。
    for ((tick = 0; tick < 20; tick++)); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.1
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
    wait "$pid" || true
  } 2>/dev/null
  return 0
}

# 用 node 自己绑一次来判端口空不空：本机不一定有 lsof/ss，而 node 是部署脚本的硬前置。
port_is_free() {
  node -e 'const s = require("net").createServer();
s.once("error", () => process.exit(1));
s.listen(Number(process.argv[1]), "127.0.0.1", () => s.close(() => process.exit(0)));' "$1" 2>/dev/null
}

# 把 staged 产物在本地真起一次，再决定要不要 rsync。CI 只跑 pnpm build，e2e 的 webServer
# 用 next start（走完整 workspace node_modules），两条流水线都不碰裁剪后的 standalone 产物：
# 2026-08-21 @swc/helpers 0.5.23 的 exports 新增 module-sync 条件，require() 命中未被 file
# tracing 追到的 esm/，产物启动即 MODULE_NOT_FOUND，就是这样一路全绿到服务器上才炸的。
# 而 rsync --delete 一旦跑完，服务器上原本能用的那份已被覆盖，脚本又只认 origin/main、
# 退不回去，站点只能一直 502——所以这道闸必须在写服务器之前。
verify_standalone_boot() {
  local artifact_root="${1%/}"
  local entry="$2"
  [[ -n "$artifact_root" && -n "$entry" ]] || {
    deploy_source_error "artifact root and entry are required"
    return 1
  }
  [[ -f "$artifact_root/$entry" ]] || {
    deploy_source_error "staged standalone entry is missing: $artifact_root/$entry"
    return 1
  }

  local attempt port url deadline
  local status="" boot_alive="" boot_started=""
  # 日志落在产物目录「旁边」而不是 /tmp 里：产物目录归调用方的 trap 清理，中途被 Ctrl-C
  # 打断也不会留垃圾；同时绝不能落进产物内部，那会被 rsync 送上服务器。
  local log="${artifact_root}.boot.log"

  for ((attempt = 1; attempt <= 3; attempt++)); do
    # 高位随机端口 + 换端口重试：本机可能正跑着 dev server 或上一次部署的残留。
    port=$((40000 + RANDOM % 20000))
    url="http://127.0.0.1:${port}/"
    # 起之前先自己绑一次探真空：端口上若已有人，对方的 200 会被误记成产物起来了。
    if ! port_is_free "$port"; then
      deploy_source_warn "本地 boot 端口 ${port} 被占用，换端口重试"
      continue
    fi
    : >"$log"
    # 只绑回环，且与构建一样跑在干净 env 里：产物起不起得来只能取决于产物自身，
    # 不能取决于跑脚本这台机器的环境变量。
    (
      cd "$artifact_root" || exit 1
      exec env -i PATH="$PATH" TMPDIR="${TMPDIR:-/tmp}" \
        NODE_ENV=production HOSTNAME=127.0.0.1 PORT="$port" node "$entry"
    ) >"$log" 2>&1 &
    DEPLOY_BOOT_PID=$!
    boot_started=1

    status=""
    boot_alive=1
    # 墙钟上限（默认 45s，测试可调短），且进程一死立刻收工：
    # 起不来的产物不该把部署挂在这里。
    deadline=$((SECONDS + ${DEPLOY_BOOT_TIMEOUT_SECONDS:-45}))
    while ((SECONDS < deadline)); do
      if ! kill -0 "$DEPLOY_BOOT_PID" 2>/dev/null; then
        boot_alive=""
        break
      fi
      status="$(curl -sS -m 5 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)"
      if [[ "$status" = 200 ]]; then
        # 收下这个 200 之前再确认产物进程还活着：探真空到起服务之间端口仍可能被别人抢走，
        # 那样应答的就不是产物，这个 200 不能算数。
        kill -0 "$DEPLOY_BOOT_PID" 2>/dev/null || boot_alive=""
        break
      fi
      sleep 0.5
    done
    stop_standalone_boot

    if [[ "$status" = 200 && -n "$boot_alive" ]]; then
      rm -f -- "$log"
      printf '==> staged standalone boot: GET / -> 200 (127.0.0.1:%s)\n' "$port"
      return 0
    fi
    if grep -q EADDRINUSE "$log"; then
      deploy_source_warn "本地 boot 端口 ${port} 被占用，换端口重试"
      continue
    fi
    break
  done

  if [[ -z "$boot_started" ]]; then
    rm -f -- "$log"
    deploy_source_error "no free local port for the boot check after 3 tries; artifact unverified"
    return 1
  fi

  printf '%s\n' '---- staged standalone boot log ----' >&2
  tail -n 40 -- "$log" >&2 || true
  rm -f -- "$log"
  # curl 连不上时 %{http_code} 是 000，照抄进结论里反而费解；产物进程已经死了的话，
  # 拿到的状态码也不是它应答的，同样不该写进结论。
  local outcome="${status:-no-response}"
  [[ "$outcome" != 000 ]] || outcome="no-response"
  [[ -n "$boot_alive" ]] || outcome="process exited"
  deploy_source_error "staged standalone artifact failed to boot locally (GET / -> ${outcome})"
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
