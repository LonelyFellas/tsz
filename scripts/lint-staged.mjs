#!/usr/bin/env node
// 对暂存的 .ts/.tsx 文件做按包分组的 eslint --fix。
//
// 为什么需要这个脚本:本仓是 monorepo,eslint 只装在各 app/包内,且采用 flat
// config(每个包有自己的 eslint.config.mjs,apps 用 next 配置、packages 用 lib
// 配置)。flat config 只认 cwd 下的单一配置、并忽略 base path 之外的文件,所以
// 无法在仓库根用一条 `eslint <files>` 正确 lint 跨包文件。这里把暂存文件按其所属
// 工作区分组,再在各自目录用该包的 eslint 跑(等价于 CI 的 `pnpm -r lint`)。
//
// 用法:node scripts/lint-staged.mjs <file>...(文件路径相对仓库根,由 lefthook 传入)

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();

/** 从文件向上找最近的、含 eslint.config.mjs 的目录,作为其所属工作区。 */
function findWorkspace(file) {
  let dir = path.dirname(path.resolve(repoRoot, file));
  while (dir.startsWith(repoRoot)) {
    if (existsSync(path.join(dir, "eslint.config.mjs"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const files = process.argv.slice(2).filter((f) => /\.(ts|tsx)$/.test(f));

if (files.length === 0) process.exit(0);

// workspace 目录 -> 该目录下的相对文件列表
const groups = new Map();
for (const file of files) {
  const ws = findWorkspace(file);
  if (!ws) continue; // 不属于任何带 eslint 配置的包(如仓库根的配置文件),跳过
  const rel = path.relative(ws, path.resolve(repoRoot, file));
  if (!groups.has(ws)) groups.set(ws, []);
  groups.get(ws).push(rel);
}

let failed = false;
for (const [ws, rels] of groups) {
  const result = spawnSync(
    "pnpm",
    ["-C", path.relative(repoRoot, ws), "exec", "eslint", "--fix", ...rels],
    { stdio: "inherit", cwd: repoRoot, shell: process.platform === "win32" }
  );
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
