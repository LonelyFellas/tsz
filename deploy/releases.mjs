// 文件操作均在远端发布锁内调用；历史资源不混入当前制品。
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  writeFile,
  rename,
  symlink,
  readlink,
  rm,
  lstat
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.partial`, JSON.stringify(value, null, 2) + "\n");
  await rename(`${file}.partial`, file);
}
export async function point(root, target) {
  await rm(path.join(root, ".current.partial"), { force: true });
  await symlink(target, path.join(root, ".current.partial"));
  await rename(path.join(root, ".current.partial"), path.join(root, "current"));
}
async function files(root, prefix = "") {
  const result = [];
  for (const item of await readdir(path.join(root, prefix), {
    withFileTypes: true
  })) {
    const name = path.join(prefix, item.name);
    if (item.isDirectory()) result.push(...(await files(root, name)));
    else if (item.isFile()) result.push(name);
    else throw new Error(`Unsupported static asset: ${name}`);
  }
  return result;
}
const exists = async (file) =>
  !!(await lstat(file).catch((e) => {
    if (e.code !== "ENOENT") throw e;
  }));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const assetPath = (component) =>
  component === "admin" ? "assets" : "apps/web/.next/static";

export async function archive(root, artifact, component, id, now = Date.now()) {
  const source = path.join(artifact, assetPath(component));
  const records = {};
  if (await exists(source)) {
    for (const name of await files(source)) {
      const bytes = await readFile(path.join(source, name));
      const dest = path.join(root, "assets", name);
      const digest = hash(bytes);
      if (await exists(dest)) {
        if (hash(await readFile(dest)) !== digest)
          throw new Error(`Static asset collision: ${name}`);
      } else {
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(`${dest}.partial`, bytes);
        await rename(`${dest}.partial`, dest);
      }
      records[name] = digest;
    }
  }
  await atomicJson(path.join(root, "history", `${id}.json`), {
    id,
    usedAt: now,
    records
  });
}
export async function bootstrap(root, legacy, component) {
  await mkdir(root, { recursive: true });
  if (await exists(path.join(root, "current"))) return;
  if (!(await exists(legacy)))
    throw new Error(`Missing initial deployment: ${legacy}`);
  // 不移动或改写正在被旧服务读取的目录。
  const dest = path.join(root, "releases", "legacy");
  await rm(dest, { recursive: true, force: true });
  await cp(legacy, dest, { recursive: true, verbatimSymlinks: true });
  await archive(root, dest, component, "legacy");
  await point(root, dest);
}
// 先完整校验再删除；调用者必须从规划到执行一直持有发布锁。
export async function planPrune(root, now = Date.now()) {
  if (!Number.isSafeInteger(now) || now < 0)
    throw new Error("Invalid retention timestamp");
  root = path.resolve(root);
  for (const dir of [
    root,
    ...["releases", "history", "assets"].map((name) => path.join(root, name))
  ]) {
    if (!(await lstat(dir)).isDirectory())
      throw new Error(`Expected release directory: ${dir}`);
  }
  const target = path.resolve(root, await readlink(path.join(root, "current")));
  const active = path.basename(target);
  const previousFile = path.join(root, "previous");
  const previousStat = await lstat(previousFile).catch((e) => {
    if (e.code !== "ENOENT") throw e;
  });
  if (previousStat && !previousStat.isFile())
    throw new Error(`Invalid previous release: ${root}`);
  const previous = previousStat
    ? (await readFile(previousFile, "utf8")).trim()
    : "";
  const validId = (id) => typeof id === "string" && /^[a-zA-Z0-9-]+$/.test(id);
  if (
    path.dirname(target) !== path.join(root, "releases") ||
    !validId(active) ||
    (previousStat && !validId(previous))
  )
    throw new Error(`Invalid current/previous release: ${root}`);
  const keep = new Map();
  const expired = [];
  const expiredAssets = new Set();
  const recorded = new Set();
  for (const name of (await readdir(path.join(root, "history"))).sort()) {
    const history = path.join(root, "history", name);
    if (!(await lstat(history)).isFile())
      throw new Error(`Invalid release history: ${history}`);
    const record = JSON.parse(await readFile(history, "utf8"));
    if (
      !record ||
      !validId(record.id) ||
      name !== `${record.id}.json` ||
      !Number.isSafeInteger(record.usedAt) ||
      record.usedAt < 0 ||
      !record.records ||
      typeof record.records !== "object" ||
      Array.isArray(record.records)
    )
      throw new Error(`Invalid release history: ${history}`);
    recorded.add(record.id);
    const retained =
      record.id === active ||
      record.id === previous ||
      now - record.usedAt < 30 * 86400_000;
    const release = path.join(root, "releases", record.id);
    const stat = await lstat(release).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
    // 已过期目录可能在上次清理中已删；保留目录必须仍完整存在。
    if ((stat && !stat.isDirectory()) || (retained && !stat))
      throw new Error(`Invalid release directory: ${release}`);
    for (const [file, digest] of Object.entries(record.records)) {
      if (
        !file ||
        path.isAbsolute(file) ||
        file
          .split("/")
          .some((part) => !part || part === "." || part === "..") ||
        !/^[a-f0-9]{64}$/.test(digest)
      )
        throw new Error(`Invalid asset record: ${history}`);
      if (retained) {
        if (keep.has(file) && keep.get(file) !== digest)
          throw new Error(`Conflicting retained asset: ${file}`);
        keep.set(file, digest);
      } else expiredAssets.add(file);
    }
    if (!retained) expired.push({ history, release });
  }
  if (!recorded.has(active) || (previous && !recorded.has(previous)))
    throw new Error(`Missing current/previous history: ${root}`);
  // 无记录的目录可能来自中断发布，不能证明其资源已过期。
  for (const id of await readdir(path.join(root, "releases"))) {
    if (!recorded.has(id)) throw new Error(`Unrecorded release: ${id}`);
  }
  const assets = await files(path.join(root, "assets"));
  const present = new Set(assets);
  for (const [file, digest] of keep) {
    if (
      !present.has(file) ||
      hash(await readFile(path.join(root, "assets", file))) !== digest
    )
      throw new Error(`Missing or corrupt retained asset: ${file}`);
  }
  return {
    root,
    expired,
    // 未知文件、上传中断的 .partial 等不凭“无引用”猜测删除。
    assets: assets.filter((file) => expiredAssets.has(file) && !keep.has(file))
  };
}
export async function applyPrune({ root, expired, assets }) {
  // history 最后删除；失败/中断后仍能按相同记录重试。
  for (const file of assets)
    await rm(path.join(root, "assets", file), { force: true });
  for (const { release, history } of expired) {
    await rm(release, { recursive: true, force: true });
    await rm(history);
  }
  return {
    component: path.basename(root),
    releases: expired.length,
    assets: assets.length
  };
}
export async function prune(root, now = Date.now()) {
  return applyPrune(await planPrune(root, now));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [command, ...args] = process.argv.slice(2);
  const commands = { bootstrap, archive, point, prune };
  if (!commands[command]) throw new Error("Unknown release command");
  await commands[command](...args);
}
