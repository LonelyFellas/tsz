import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export async function contractFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "tsz-api-contract."));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packageRoot = join(root, "packages/api-client");
  const bin = join(root, "bin");
  const calls = join(root, "calls");
  const specFile = join(root, "backend.json");
  const manifestFile = join(root, "manifest.json");
  const targetFile = join(root, "target with spaces.json");
  await mkdir(join(packageRoot, "scripts"), { recursive: true });
  await mkdir(join(packageRoot, "src"));
  await mkdir(bin);
  const sha = "a".repeat(40);
  const target = {
    version: 1,
    environment: "tshb-test",
    repository: "LonelyFellas/tsz-rust",
    sha
  };
  const contract = {
    "openapi.snapshot.json": {
      paths: { "/used": ["get"] },
      operationHeaders: {},
      operationQueryParameters: {},
      operationSchemas: {},
      schemas: { Used: { type: "string" } }
    },
    "admin-word-v3.runtime-schema.json": { $defs: { Used: { type: "string" } } }
  };
  const spec = { openapi: "3.1.0", fixture: contract };
  await writeFile(specFile, JSON.stringify(spec));
  await writeFile(targetFile, JSON.stringify(target));
  await writeFile(
    manifestFile,
    JSON.stringify({
      component: "api",
      source: {
        repository: target.repository,
        remote_ref: "refs/heads/main",
        git_sha: sha
      }
    })
  );
  for (const [name, value] of Object.entries(contract)) {
    await writeFile(
      join(packageRoot, "src", name),
      JSON.stringify({ ...value, _source: "tracked source" })
    );
  }
  // A small trusted generator isolates orchestration tests from the real schema
  // generator, which is exercised separately against the pinned public API.
  await writeFile(
    join(packageRoot, "scripts/sync-openapi.mjs"),
    `
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
if (process.env.SYNC_OPENAPI_RUNTIME_ONLY !== '0') process.exit(9);
const data=JSON.parse(readFileSync(process.env.OPENAPI_SOURCE,'utf8'));
if (data.fail_generator) { console.error('fixture generation failed'); process.exit(8); }
for (const [name,value] of Object.entries(data.fixture)) writeFileSync(resolve(fileURLToPath(new URL('../src/',import.meta.url)),name),JSON.stringify({...value,_source:'generated source'}));
console.log('fixture-generator-complete');
`
  );
  const command = async (name, code) =>
    writeFile(
      join(bin, name),
      `#!/usr/bin/env node\nconst fs=require('node:fs');\nfs.appendFileSync(${JSON.stringify(calls)},${JSON.stringify(name + " ")}+JSON.stringify(process.argv.slice(2))+'\\n');\n${code}\n`,
      { mode: 0o755 }
    );
  await command(
    "ssh",
    `if(process.env.TEST_FORBID_SSH==='1')process.exit(97);if(process.env.TEST_SSH_FAIL==='1')process.exit(17);process.stdout.write(fs.readFileSync(${JSON.stringify(manifestFile)},'utf8'));`
  );
  await command(
    "gh",
    `if(!process.argv.some(arg=>arg.includes(${JSON.stringify(`?ref=${sha}`)})))process.exit(98);process.stdout.write(fs.readFileSync(${JSON.stringify(specFile)},'utf8'));`
  );
  const shim = join(root, "fetch-shim.mjs");
  await writeFile(
    shim,
    `import {appendFileSync,readFileSync} from 'node:fs';
globalThis.fetch=async(url,options)=>{appendFileSync(${JSON.stringify(calls)},'fetch '+JSON.stringify({url,headers:options.headers,redirect:options.redirect})+'\\n');return new Response(readFileSync(${JSON.stringify(specFile)}),{status:200});};\n`
  );
  return {
    root,
    packageRoot,
    sha,
    target,
    contract,
    spec,
    specFile,
    manifestFile,
    targetFile,
    calls: () => readFile(calls, "utf8").catch(() => ""),
    run(name, { args = [], env = {}, shimFetch = false } = {}) {
      return spawnSync(
        process.execPath,
        [
          ...(shimFetch ? ["--import", shim] : []),
          fileURLToPath(new URL(`./${name}`, import.meta.url)),
          ...args
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            GITHUB_STEP_SUMMARY: join(root, "summary.md"),
            ...env
          },
          encoding: "utf8",
          timeout: 20000
        }
      );
    }
  };
}
