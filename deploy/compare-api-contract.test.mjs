import assert from "node:assert/strict";
import test from "node:test";
import { compareApiContract } from "./compare-api-contract.mjs";

test("deployed API may add endpoints but must retain required operations and schemas", () => {
  const expected = {
    paths: { "/used": ["get"] },
    operationHeaders: {},
    operationQueryParameters: {},
    operationSchemas: {},
    schemas: { Used: { type: "string" } }
  };
  const actual = structuredClone(expected);
  actual.paths["/new"] = ["get"];
  actual.schemas.New = { type: "number" };
  assert.doesNotThrow(() =>
    compareApiContract(
      actual,
      structuredClone(expected),
      "openapi.snapshot.json"
    )
  );
  delete actual.paths["/used"];
  assert.throws(
    () =>
      compareApiContract(
        actual,
        structuredClone(expected),
        "openapi.snapshot.json"
      ),
    /API method missing/
  );
  actual.paths["/used"] = ["get"];
  actual.schemas.Used.type = "number";
  assert.throws(
    () =>
      compareApiContract(
        actual,
        structuredClone(expected),
        "openapi.snapshot.json"
      ),
    /API contract differs/
  );
});

test("runtime schema comparison ignores source metadata but rejects structural drift", () => {
  const expected = {
    _source: "old",
    _source_sha256: "old",
    $defs: { A: { type: "string" } }
  };
  const actual = {
    _source: "new",
    _source_sha256: "new",
    $defs: { A: { type: "string" } }
  };
  assert.doesNotThrow(() =>
    compareApiContract(
      structuredClone(actual),
      structuredClone(expected),
      "runtime.json"
    )
  );
  actual.$defs.A.type = "number";
  assert.throws(
    () => compareApiContract(actual, expected, "runtime.json"),
    /differs/
  );
});
