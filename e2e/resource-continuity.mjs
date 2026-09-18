// 两个真实 Vite 构建 + 仓库 Nginx 配置 + Chromium，验证已打开标签页跨发布。
import { chromium } from "@playwright/test";
import { build } from "../apps/admin/node_modules/vite/dist/node/index.js";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  cp,
  rm,
  readdir
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { archive, point } from "../deploy/releases.mjs";

const repo = path.resolve(import.meta.dirname, "..");
const temp = await mkdtemp(path.join(tmpdir(), "tsz-resource-browser-"));
const container = `tsz-resource-${process.pid}`;
let browser;
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
try {
  const admin = path.join(temp, "releases/admin");
  await mkdir(path.join(temp, "conf"), { recursive: true });
  await mkdir(path.join(temp, "cert"));
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-nodes",
      "-newkey",
      "rsa:2048",
      "-keyout",
      path.join(temp, "cert/key.pem"),
      "-out",
      path.join(temp, "cert/cert.pem"),
      "-days",
      "1",
      "-subj",
      "/CN=admin-test.tianshengzhi.com"
    ],
    { stdio: "ignore" }
  );
  const production = await readFile(
    path.join(repo, "apps/admin/dist/index.html"),
    "utf8"
  );
  const recovery = production.match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const id of ["A", "B"]) {
    const src = path.join(temp, `src-${id}`);
    await mkdir(src);
    const script = recovery.replace(/\}\)\("[^"]+",/, `})("${id}",`);
    await writeFile(
      path.join(src, "index.html"),
      `<html><head><meta charset="UTF-8"><script>${script}</script></head><body><button id="open">打开页面</button><input id="edit"><script type="module" src="/main.js"></script></body></html>`
    );
    await writeFile(
      path.join(src, "main.js"),
      `document.querySelector('#open').onclick = async () => { const m = await import('./lazy.js'); m.show(); }; window.dispatchEvent(new Event('tsz:app-ready'));`
    );
    await writeFile(
      path.join(src, "lazy.js"),
      `import './lazy.css'; export const show = () => {document.body.insertAdjacentHTML('beforeend', '<p id="result">版本 ${id}</p>');};`
    );
    await writeFile(
      path.join(src, "lazy.css"),
      `body { --version: '${id}'; background-image: url('./image.svg'); }`
    );
    await writeFile(
      path.join(src, "image.svg"),
      `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><text>${id}</text></svg>`
    );
    await build({
      root: src,
      configFile: false,
      logLevel: "silent",
      build: { outDir: path.join(admin, "releases", id), assetsInlineLimit: 0 }
    });
    await writeFile(
      path.join(admin, "releases", id, "version.json"),
      JSON.stringify({ release_id: id })
    );
  }
  await archive(admin, path.join(admin, "releases/A"), "admin", "A");
  // Container paths must be used for symlink targets visible inside Docker.
  await point(admin, "/opt/tsz-releases/admin/releases/A");
  for (const name of ["tshb-test.conf", "tshb-test-domains.conf"]) {
    let config = await readFile(path.join(repo, "deploy/nginx", name), "utf8");
    config = config
      .replace(/ssl_certificate .*?;/g, "ssl_certificate /test-cert/cert.pem;")
      .replace(
        /ssl_certificate_key .*?;/g,
        "ssl_certificate_key /test-cert/key.pem;"
      )
      .replace(/\s*include \/etc\/letsencrypt\/options-ssl-nginx.conf;/g, "")
      .replace(/\s*ssl_dhparam .*?;/g, "");
    await writeFile(path.join(temp, "conf", name), config);
  }
  await writeFile(
    path.join(temp, "upstream.inc"),
    "proxy_pass http://127.0.0.1:3000;\n"
  );
  docker(
    "run",
    "-d",
    "--name",
    container,
    "-p",
    "127.0.0.1::8081",
    "-p",
    "127.0.0.1::443",
    "-v",
    `${path.join(temp, "releases")}:/fixture:ro`,
    "-v",
    `${path.join(temp, "conf")}:/etc/nginx/conf.d:ro`,
    "-v",
    `${path.join(temp, "cert")}:/test-cert:ro`,
    "-v",
    `${path.join(temp, "upstream.inc")}:/etc/nginx/tsz-web-upstream.inc:ro`,
    "nginx:1.28-alpine",
    "sh",
    "-c",
    "cp -a /fixture /opt/tsz-releases && exec nginx -g 'daemon off;'"
  );
  const port = docker("port", container, "8081/tcp").split(":").at(-1);
  const tlsPort = docker("port", container, "443/tcp").split(":").at(-1);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  await archive(admin, path.join(admin, "releases/B"), "admin", "B");
  docker(
    "cp",
    `${path.join(admin, "assets")}/.`,
    `${container}:/opt/tsz-releases/admin/assets/`
  );
  docker(
    "exec",
    container,
    "sh",
    "-c",
    "ln -s /opt/tsz-releases/admin/releases/B /opt/tsz-releases/admin/.current && mv -Tf /opt/tsz-releases/admin/.current /opt/tsz-releases/admin/current"
  );
  await page.click("#open");
  await page.waitForSelector("#result");
  assert.equal(await page.textContent("#result"), "版本 A");
  assert.deepEqual(failures, []);
  const tlsGet = (url) => {
    const raw = execFileSync(
      "curl",
      [
        "--noproxy",
        "*",
        "-ksS",
        "--resolve",
        `admin-test.tianshengzhi.com:${tlsPort}:127.0.0.1`,
        "-D",
        "-",
        `https://admin-test.tianshengzhi.com:${tlsPort}${url}`
      ],
      { encoding: "utf8" }
    );
    const boundary = raw.indexOf("\r\n\r\n");
    return { headers: raw.slice(0, boundary), body: raw.slice(boundary + 4) };
  };
  const response = tlsGet("/version.json");
  assert.match(response.headers, /200 OK/);
  assert.equal(JSON.parse(response.body).release_id, "B");
  assert.match(response.headers, /no-store/);
  for (const name of await readdir(path.join(admin, "assets"))) {
    const asset = tlsGet(`/assets/${name}`);
    assert.match(asset.headers, /200 OK/);
    assert.match(asset.headers, /immutable/);
  }
  const missing = tlsGet("/assets/missing.js");
  assert.match(missing.headers, /404 Not Found/);
  assert.ok(!missing.headers.includes("immutable"));
  // First-entry JS failure must still show a usable native UI.
  const failedPage = await browser.newPage();
  await failedPage.route("**/assets/*.js", (route) => route.abort());
  await failedPage.goto(`http://127.0.0.1:${port}/`);
  await failedPage.waitForSelector("[data-resource-recovery]");
  assert.match(
    await failedPage.textContent("[data-resource-recovery]"),
    /资源/
  );
  console.log(
    "PASS: retained lazy JS/CSS/image, atomic shell switch, HTTPS cache/404, entry failure fallback"
  );
} catch (error) {
  try {
    execFileSync("docker", ["logs", container], { stdio: "inherit" });
    console.error(
      docker(
        "exec",
        container,
        "sh",
        "-c",
        "ls -l /opt/tsz-releases/admin/current/; cat /opt/tsz-releases/admin/current/version.json"
      )
    );
  } catch {}
  throw error;
} finally {
  await browser?.close();
  try {
    docker("rm", "-f", container);
  } catch {
    /* not started */
  }
  await rm(temp, { recursive: true, force: true });
}
