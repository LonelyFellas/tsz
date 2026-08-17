import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  acquireSingleInstanceLock,
  withSingleInstanceLock
} from "./coverage-lock.mjs";

async function temporaryDirectory() {
  return mkdtemp(join(tmpdir(), "tsz-coverage-lock-"));
}

function runWorker({ label, lockDirectory, eventLog }) {
  const moduleUrl = new URL("./coverage-lock.mjs", import.meta.url).href;
  const source = `
    import { appendFile } from "node:fs/promises";
    import { setTimeout as delay } from "node:timers/promises";
    import { withSingleInstanceLock } from ${JSON.stringify(moduleUrl)};
    await withSingleInstanceLock(
      { lockDirectory: ${JSON.stringify(lockDirectory)}, pollMs: 5, timeoutMs: 2000 },
      async () => {
        await appendFile(${JSON.stringify(eventLog)}, ${JSON.stringify(`${label}:start\n`)});
        await delay(50);
        await appendFile(${JSON.stringify(eventLog)}, ${JSON.stringify(`${label}:end\n`)});
      }
    );
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--input-type=module", "--eval", source],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`worker ${label} exited ${code}: ${stderr}`));
    });
  });
}

test("concurrent processes execute the protected section serially", async () => {
  const root = await temporaryDirectory();
  const lockDirectory = join(root, "lock");
  const eventLog = join(root, "events.log");
  try {
    await Promise.all([
      runWorker({ label: "A", lockDirectory, eventLog }),
      runWorker({ label: "B", lockDirectory, eventLog })
    ]);
    const events = await readFile(eventLog, "utf8");
    assert.match(
      events,
      /^(A:start\nA:end\nB:start\nB:end\n|B:start\nB:end\nA:start\nA:end\n)$/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("callback failure releases the lock and preserves the error", async () => {
  const root = await temporaryDirectory();
  const lockDirectory = join(root, "lock");
  const expectedError = new Error("coverage failed");
  try {
    await assert.rejects(
      withSingleInstanceLock({ lockDirectory }, async () => {
        throw expectedError;
      }),
      expectedError
    );
    const nextLock = await acquireSingleInstanceLock({
      lockDirectory,
      timeoutMs: 50,
      pollMs: 5
    });
    await nextLock.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dead wrapper and child owner fail closed without deleting the lock", async () => {
  const root = await temporaryDirectory();
  const lockDirectory = join(root, "lock");
  try {
    await mkdir(lockDirectory);
    await writeFile(
      join(lockDirectory, "owner.json"),
      JSON.stringify({
        token: "stale",
        wrapper_pid: 999_999,
        child_pid: 999_998,
        started_at: "2026-01-01T00:00:00.000Z"
      })
    );
    await assert.rejects(
      acquireSingleInstanceLock({
        lockDirectory,
        ownerIsAlive: () => false,
        timeoutMs: 50,
        pollMs: 5
      }),
      /Stale coverage lock detected.*Verify no coverage process is running/
    );
    const owner = JSON.parse(
      await readFile(join(lockDirectory, "owner.json"), "utf8")
    );
    assert.equal(owner.token, "stale");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("normal release during stale detection retries instead of failing", async () => {
  const root = await temporaryDirectory();
  const lockDirectory = join(root, "lock");
  try {
    await mkdir(lockDirectory);
    await writeFile(
      join(lockDirectory, "owner.json"),
      JSON.stringify({
        token: "departing",
        wrapper_pid: 999_999,
        child_pid: null,
        started_at: "2026-01-01T00:00:00.000Z"
      })
    );
    let simulatedRelease = false;
    const lock = await acquireSingleInstanceLock({
      lockDirectory,
      ownerIsAlive: () => {
        if (!simulatedRelease) {
          simulatedRelease = true;
          rmSync(lockDirectory, { recursive: true, force: true });
        }
        return false;
      },
      timeoutMs: 50,
      pollMs: 5
    });
    assert.notEqual(lock.owner.token, "departing");
    await lock.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release before the first owner read retries instead of failing", async () => {
  const root = await temporaryDirectory();
  const lockDirectory = join(root, "lock");
  try {
    await mkdir(lockDirectory);
    let firstRead = true;
    const lock = await acquireSingleInstanceLock({
      lockDirectory,
      ownerReader: async () => {
        if (firstRead) {
          firstRead = false;
          await rm(lockDirectory, { recursive: true, force: true });
        }
        return undefined;
      },
      orphanGraceMs: 0,
      timeoutMs: 50,
      pollMs: 5
    });
    await lock.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("active owner times out without deleting its lock", async () => {
  const root = await temporaryDirectory();
  const lockDirectory = join(root, "lock");
  try {
    const activeLock = await acquireSingleInstanceLock({ lockDirectory });
    await assert.rejects(
      acquireSingleInstanceLock({
        lockDirectory,
        ownerIsAlive: () => true,
        timeoutMs: 20,
        pollMs: 5
      }),
      /Timed out waiting for coverage lock \(wrapper /
    );
    const owner = JSON.parse(
      await readFile(join(lockDirectory, "owner.json"), "utf8")
    );
    assert.equal(owner.token, activeLock.owner.token);
    await activeLock.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the canonical coverage command always enters through the locked runner", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8")
  );
  assert.equal(
    packageJson.scripts["test:cov"],
    "pnpm check:node && pnpm test:node-runtime && pnpm test:coverage-lock && pnpm test:deploy-provenance && node scripts/run-coverage-locked.mjs"
  );
});
