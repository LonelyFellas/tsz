import assert from "node:assert/strict";
import test from "node:test";
import { waitForApiContract } from "./wait-api-contract.mjs";

const SHA = "a".repeat(40);

test("waits through unavailable API and resolves when the expected SHA is active", async () => {
  const calls = [];
  let now = 0;
  const result = await waitForApiContract({
    expectedSha: SHA,
    check: async () => {
      calls.push(calls.length);
      if (calls.length === 1) throw new Error("deployment_in_progress");
      return SHA;
    },
    sleep: async () => {
      now += 20;
    },
    timeoutMs: 100,
    intervalMs: 20,
    now: () => now
  });
  assert.equal(result, SHA);
  assert.equal(calls.length, 2);
});

test("does not accept a different deployed API SHA", async () => {
  let now = 0;
  await assert.rejects(
    waitForApiContract({
      expectedSha: SHA,
      check: async () => "b".repeat(40),
      sleep: async () => {
        now += 20;
      },
      timeoutMs: 20,
      intervalMs: 20,
      now: () => now
    }),
    /did not reach/
  );
});
