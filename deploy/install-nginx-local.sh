#!/usr/bin/env bash
set -euo pipefail
{
  stage="$1"
  conf_dir="$2"
  shift 2
  names=("$@")
  existed=" "
  trap 'rm -rf -- "$stage"' EXIT

  # 原来有没有这份配置按备份时的记录判断，不按备份文件还在不在推断：
  # 原来有而备份不见了只能算恢复失败，绝不能把线上文件删掉。
  rollback() {
    local name failed=0
    for name in "${names[@]}"; do
      if [[ "$existed" = *" $name "* ]]; then
        mv -f -- "$stage/backup/$name" "$conf_dir/$name" || failed=1
      else
        rm -f -- "$conf_dir/$name" || failed=1
      fi
    done
    if ((failed)); then
      trap - EXIT
      printf '!! %s，且恢复原配置失败；未 reload，配置状态未知，剩余备份（若有）在 %s/backup\n' "$1" "$stage" >&2
    else
      printf '!! %s：已恢复原配置，未 reload\n' "$1" >&2
    fi
    exit 1
  }

  mkdir -- "$stage/backup" || exit 1
  for name in "${names[@]}"; do
    if [[ -e "$conf_dir/$name" ]]; then
      cp -p -- "$conf_dir/$name" "$stage/backup/$name" || exit 1
      existed+="$name "
    fi
  done
  for name in "${names[@]}"; do
    mv -f -- "$stage/$name" "$conf_dir/$name" || rollback "替换 $name 失败"
  done
  nginx -t || rollback "nginx -t 未通过"
  systemctl reload nginx
}
