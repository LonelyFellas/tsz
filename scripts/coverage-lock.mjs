import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function isProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function readOwner(lockDirectory) {
  try {
    return JSON.parse(
      await readFile(join(lockDirectory, "owner.json"), "utf8")
    );
  } catch {
    return undefined;
  }
}

async function isStaleLock({
  lockDirectory,
  owner,
  ownerIsAlive,
  orphanGraceMs
}) {
  const ownerPids = [owner?.wrapper_pid, owner?.child_pid].filter(
    (pid) => Number.isSafeInteger(pid) && pid > 0
  );
  if (ownerPids.length > 0) {
    return ownerPids.every((pid) => !ownerIsAlive(pid));
  }

  // mkdir 与 owner.json 写入之间存在极短窗口。只有无 owner 的目录超过宽限期，
  // 才把它视为进程在写 owner 前被强杀留下的陈旧锁。
  try {
    const lockStat = await stat(lockDirectory);
    return Date.now() - lockStat.mtimeMs >= orphanGraceMs;
  } catch {
    return true;
  }
}

function describeOwner(owner) {
  if (!owner) return "unknown owner";
  const child = owner.child_pid ? `, child ${owner.child_pid}` : "";
  return `wrapper ${owner.wrapper_pid}${child}, started ${owner.started_at}`;
}

export async function acquireSingleInstanceLock({
  lockDirectory,
  timeoutMs = 15 * 60_000,
  pollMs = 250,
  orphanGraceMs = 5_000,
  ownerIsAlive = isProcessAlive,
  ownerReader = readOwner,
  onWait = () => {}
}) {
  const waitStartedAt = Date.now();
  const token = randomUUID();

  while (true) {
    try {
      await mkdir(lockDirectory);
      const owner = {
        token,
        wrapper_pid: process.pid,
        child_pid: null,
        started_at: new Date().toISOString()
      };
      await writeFile(
        join(lockDirectory, "owner.json"),
        `${JSON.stringify(owner)}\n`,
        "utf8"
      );

      return {
        owner,
        async setChildPid(childPid) {
          const currentOwner = await readOwner(lockDirectory);
          if (currentOwner?.token !== token) {
            throw new Error("Coverage lock ownership changed unexpectedly");
          }
          owner.child_pid = childPid;
          await writeFile(
            join(lockDirectory, "owner.json"),
            `${JSON.stringify(owner)}\n`,
            "utf8"
          );
        },
        async release() {
          const currentOwner = await readOwner(lockDirectory);
          if (currentOwner?.token === token) {
            await rm(lockDirectory, { recursive: true, force: true });
          }
        }
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }

    const existingOwner = await ownerReader(lockDirectory);
    if (
      await isStaleLock({
        lockDirectory,
        owner: existingOwner,
        ownerIsAlive,
        orphanGraceMs
      })
    ) {
      try {
        await stat(lockDirectory);
      } catch (error) {
        if (error?.code === "ENOENT") continue;
        throw error;
      }
      const confirmedOwner = await ownerReader(lockDirectory);
      if (confirmedOwner?.token !== existingOwner?.token) continue;
      throw new Error(
        `Stale coverage lock detected (${describeOwner(existingOwner)}). Verify no coverage process is running, remove ${lockDirectory}, and retry.`
      );
    }

    if (Date.now() - waitStartedAt >= timeoutMs) {
      throw new Error(
        `Timed out waiting for coverage lock (${describeOwner(existingOwner)})`
      );
    }

    onWait(existingOwner);
    await sleep(pollMs);
  }
}

export async function withSingleInstanceLock(options, callback) {
  const lock = await acquireSingleInstanceLock(options);
  try {
    return await callback(lock);
  } finally {
    await lock.release();
  }
}
