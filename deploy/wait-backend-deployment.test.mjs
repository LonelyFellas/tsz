import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchBackendDeployment,
  fetchBackendMainSha,
  waitForBackendDeployment
} from "./wait-backend-deployment.mjs";

const SHA = "a".repeat(40);

function run(overrides = {}) {
  return {
    id: 123,
    name: "Deploy tshb-test",
    head_branch: "main",
    head_sha: SHA,
    event: "workflow_run",
    repository: { full_name: "LonelyFellas/tsz-rust" },
    run_attempt: 2,
    status: "in_progress",
    conclusion: null,
    created_at: "2026-11-19T00:00:00Z",
    ...overrides
  };
}

test("selects only the paired backend deployment run", async () => {
  const result = await fetchBackendDeployment({
    expectedSha: SHA,
    fetcher: async (url) => {
      assert.match(url, new RegExp(`head_sha=${SHA}`));
      return new Response(
        JSON.stringify({
          workflow_runs: [
            run({ id: 1, head_sha: "b".repeat(40) }),
            run({ id: 2, name: "CI" }),
            run({ id: 3 })
          ]
        })
      );
    }
  });
  assert.equal(result.id, 3);
});

test("waits without an implicit fifteen-minute deadline", async () => {
  const states = [run(), run({ status: "completed", conclusion: "success" })];
  const responses = states.map((state) => ({ workflow_runs: [state] }));
  let now = 0;
  const result = await waitForBackendDeployment({
    expectedSha: SHA,
    fetcher: async () => new Response(JSON.stringify(responses.shift())),
    sleep: async () => {
      now += 30_000;
    },
    now: () => now
  });
  assert.deepEqual(result, { expectedSha: SHA, runId: 123, attempt: 2 });
});

test("fails on a completed backend deployment failure", async () => {
  await assert.rejects(
    waitForBackendDeployment({
      expectedSha: SHA,
      fetcher: async () =>
        new Response(
          JSON.stringify({
            workflow_runs: [run({ status: "completed", conclusion: "failure" })]
          })
        )
    }),
    /ended with failure/
  );
});

test("rejects a target whose backend main has moved past it", async () => {
  let calls = 0;
  await assert.rejects(
    waitForBackendDeployment({
      expectedSha: SHA,
      fetcher: async () =>
        new Response(
          JSON.stringify(
            calls++ === 0 ? { workflow_runs: [] } : { sha: "b".repeat(40) }
          )
        )
    }),
    /was superseded by main/
  );
});

test("reads the authoritative backend main SHA", async () => {
  const result = await fetchBackendMainSha(async (url) => {
    assert.match(url, /tsz-rust\/commits\/main$/);
    return new Response(JSON.stringify({ sha: SHA }));
  });
  assert.equal(result, SHA);
});
