import {
  cp,
  mkdir,
  writeFile,
  readFile,
  readlink,
  access,
  rm
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { createCandidateManifest } from "../provenance.mjs";
const file = (p) => readFile(p, "utf8");
async function stage(component, id) {
  const dir = `/opt/stage-${id}`;
  const artifact = `${dir}/artifact`;
  await mkdir(artifact, { recursive: true });
  for (const name of [
    "publish-release.sh",
    "releases.mjs",
    "provenance.mjs",
    "install-nginx-local.sh",
    "nginx",
    "systemd"
  ])
    await cp(`/repo/deploy/${name}`, `${dir}/${name}`, { recursive: true });
  // 测试证书不需要 DH 配置，线上配置的其他指令保持原样。
  const config = `${dir}/nginx/tshb-test-domains.conf`;
  await writeFile(
    config,
    (await file(config)).replace(/^.*ssl_dhparam.*\n/gm, "")
  );
  await writeFile(`${dir}/release-id`, id);
  await writeFile(
    `${artifact}/version.json`,
    JSON.stringify({ release_id: id })
  );
  if (component === "admin") {
    await mkdir(`${artifact}/assets`);
    await writeFile(`${artifact}/index.html`, id);
    await writeFile(`${artifact}/assets/${id}.js`, id);
  } else {
    await mkdir(`${artifact}/apps/web/.next/static`, { recursive: true });
    await writeFile(`${artifact}/apps/web/.next/static/${id}.js`, id);
    await writeFile(
      `${artifact}/apps/web/server.js`,
      `require('http').createServer((req,res)=>res.end('${id}')).listen(Number(process.env.PORT),'127.0.0.1')`
    );
  }
  await createCandidateManifest({
    component,
    repository: "LonelyFellas/tsz",
    gitSha: "a".repeat(40),
    gitTree: "b".repeat(40),
    ciRunId: 1,
    ciRunUrl: "https://github.com/LonelyFellas/tsz/actions/runs/1",
    artifactRoot: artifact,
    artifactPath: `/opt/tsz-releases/${component}/current`,
    outputPath: `${dir}/candidate.json`
  });
  return dir;
}
function publish(dir, component, success) {
  const result = spawnSync(
    "bash",
    [`${dir}/publish-release.sh`, dir, component],
    { encoding: "utf8" }
  );
  assert.equal(result.status === 0, success, result.stdout + result.stderr);
}
await stage("admin", "A");
publish("/opt/stage-A", "admin", true);
assert.match(await readlink("/opt/tsz-releases/admin/current"), /\/A$/);
assert.equal(
  await file("/opt/tsz-releases/admin/assets/legacy.css"),
  "old-css"
);
await stage("admin", "tampered");
await writeFile("/opt/stage-tampered/artifact/index.html", "wrong");
publish("/opt/stage-tampered", "admin", false);
assert.match(await readlink("/opt/tsz-releases/admin/current"), /\/A$/);
const accepted = await file("/opt/tsz-deploy-manifests/admin.json");
await stage("admin", "bad-config");
await writeFile(
  "/opt/stage-bad-config/nginx/tshb-test.conf",
  "not_a_directive;\n"
);
publish("/opt/stage-bad-config", "admin", false);
assert.match(await readlink("/opt/tsz-releases/admin/current"), /\/A$/);
assert.equal(await file("/opt/tsz-deploy-manifests/admin.json"), accepted);
await writeFile("/opt/tsz-frontend-transaction", "interrupted transaction");
publish("/opt/stage-tampered", "admin", false);
assert.match(await readlink("/opt/tsz-releases/admin/current"), /\/A$/);
await rm("/opt/tsz-frontend-transaction");

await stage("admin", "B");
await writeFile("/tmp/fail-api", "fail");
publish("/opt/stage-B", "admin", false);
assert.match(await readlink("/opt/tsz-releases/admin/current"), /\/A$/);
assert.equal(await file("/opt/tsz-deploy-manifests/admin.json"), accepted);
await assert.rejects(access("/opt/tsz-frontend-transaction"));
await rm("/tmp/fail-api");
await stage("web", "W1");
publish("/opt/stage-W1", "web", true);
assert.equal((await file("/opt/tsz-releases/web/port")).trim(), "3100");
assert.equal(await file("/opt/tsz-releases/web/assets/legacy.js"), "old-js");
assert.match(
  await file("/etc/nginx/conf.d/zentao-ip.conf"),
  /include \/etc\/nginx\/tsz-web-upstream/
);
const webAccepted = await file("/opt/tsz-deploy-manifests/web.json");
await stage("web", "W2");
await writeFile("/tmp/fail-api", "fail");
publish("/opt/stage-W2", "web", false);
assert.match(await readlink("/opt/tsz-releases/web/current"), /\/W1$/);
assert.match(await file("/etc/nginx/tsz-web-upstream.inc"), /3100/);
assert.equal(await file("/opt/tsz-deploy-manifests/web.json"), webAccepted);
await rm("/tmp/fail-api");
await stage("web", "W3");
publish("/opt/stage-W3", "web", true);
assert.equal((await file("/opt/tsz-releases/web/port")).trim(), "3101");
assert.match(await file("/tmp/systemctl-calls"), /disable --now tsz-web@3100/);
// 模拟上一次发布切流后未完成排空：备用端口仍运行旧 release。
assert.equal(
  spawnSync("systemctl", ["enable", "--now", "tsz-web@3100.service"]).status,
  0
);
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    if ((await fetch("http://127.0.0.1:3100/")).ok) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.equal(await (await fetch("http://127.0.0.1:3100/")).text(), "W1");
await stage("web", "W4");
publish("/opt/stage-W4", "web", true);
assert.equal(await (await fetch("http://127.0.0.1:3100/")).text(), "W4");
console.log(
  "PASS: first migration, accepted manifest, tamper rejection, admin/web HTTP failure rollback, web slot switch, legacy IP forwarding"
);
