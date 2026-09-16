// 两个真实 Next standalone 构建，验证旧客户端切换到新服务的导航及恢复脚本。
import { chromium } from "@playwright/test";
import { cp, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import net from "node:net";
import assert from "node:assert/strict";
const root = path.resolve(import.meta.dirname, "..");
const temp = await mkdtemp(path.join(tmpdir(), "tsz-next-continuity-"));
const children = [];
let browser;
let proxy;
const port = async () => {
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const number = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return number;
};
try {
  const versions = [];
  for (const id of ["test-web-A", "test-web-B"]) {
    const result = spawnSync("pnpm", ["--filter", "@tsz/web", "build"], {
      cwd: root,
      env: { ...process.env, TSZ_RELEASE_ID: id, NEXT_TELEMETRY_DISABLED: "1" },
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const artifact = path.join(temp, id);
    await cp(path.join(root, "apps/web/.next/standalone"), artifact, {
      recursive: true,
      verbatimSymlinks: true
    });
    await mkdir(path.join(artifact, "apps/web/.next/static"), {
      recursive: true
    });
    await cp(
      path.join(root, "apps/web/.next/static"),
      path.join(artifact, "apps/web/.next/static"),
      { recursive: true }
    );
    const number = await port();
    const child = spawn(
      process.execPath,
      [path.join(artifact, "apps/web/server.js")],
      {
        cwd: artifact,
        env: { ...process.env, PORT: String(number), HOSTNAME: "127.0.0.1" },
        stdio: "ignore"
      }
    );
    children.push(child);
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        if ((await fetch(`http://127.0.0.1:${number}/`)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, "standalone must boot without workspace dependencies");
    versions.push({ id, artifact, port: number });
  }
  let current = versions[0];
  proxy = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/version.json") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ release_id: current.id }));
      return;
    }
    if (url.pathname === "/client-resource-error") {
      res.writeHead(204).end();
      return;
    }
    if (url.pathname.startsWith("/_next/static/")) {
      for (const version of versions) {
        try {
          const bytes = await readFile(
            path.join(
              version.artifact,
              "apps/web/.next/static",
              url.pathname.slice("/_next/static/".length)
            )
          );
          const ext = path.extname(url.pathname);
          res.setHeader(
            "Content-Type",
            ext === ".css"
              ? "text/css"
              : ext === ".js"
                ? "text/javascript"
                : "application/octet-stream"
          );
          res.end(bytes);
          return;
        } catch {}
      }
      res.writeHead(404).end();
      return;
    }
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: current.port,
        path: req.url,
        method: req.method,
        headers: req.headers
      },
      (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      }
    );
    upstream.on("error", () => res.writeHead(502).end());
    req.pipe(upstream);
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${proxy.address().port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.route("**/*", (route) =>
    route.request().headers()["next-router-prefetch"] === "1"
      ? route.abort()
      : route.continue()
  );
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({
      status: 401,
      json: { error: { code: "unauthorized", message: "test" } }
    })
  );
  const errors = [];
  const missing = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/_next/static/") && response.status() !== 200)
      missing.push(response.url());
  });
  await page.goto(base, { waitUntil: "networkidle" });
  assert.equal(
    (await page.locator("script:not([src])").allTextContents()).some((text) =>
      text.includes(versions[0].id)
    ),
    true
  );
  current = versions[1];
  // Existing homepage uses Next links; a full location assignment would not test version skew.
  await page.locator('a[href="/login"]').first().click();
  await page.waitForURL("**/login");
  await page.waitForLoadState("networkidle");
  assert.equal(
    (await page.locator("script:not([src])").allTextContents()).some((text) =>
      text.includes(versions[1].id)
    ),
    true
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(missing, []);
  await page.evaluate(() =>
    window.dispatchEvent(new Event("tsz:resource-error"))
  );
  await page.locator("[data-resource-recovery]").waitFor();
  assert.match(
    await page.locator("[data-resource-recovery]").innerText(),
    /资源/
  );
  console.log(
    "PASS: actual Next A → B navigation, retained assets, hydration, standalone bootstrap recovery"
  );
} finally {
  await browser?.close();
  proxy?.closeAllConnections();
  if (proxy) await new Promise((resolve) => proxy.close(resolve));
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
  }
  await rm(temp, { recursive: true, force: true });
}
