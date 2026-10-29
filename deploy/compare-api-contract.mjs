import assert from "node:assert/strict";

export function compareApiContract(actual, expected, name) {
  for (const value of [actual, expected]) {
    delete value._source;
    delete value._generatedAt;
    delete value._source_sha256;
  }
  if (name === "openapi.snapshot.json") {
    for (const [path, methods] of Object.entries(expected.paths)) {
      assert.ok(
        Array.isArray(actual.paths[path]) &&
          methods.every((method) => actual.paths[path].includes(method)),
        `API method missing at ${path}`
      );
    }
    for (const section of [
      "operationHeaders",
      "operationQueryParameters",
      "operationSchemas",
      "schemas"
    ]) {
      for (const [key, value] of Object.entries(expected[section])) {
        assert.ok(
          JSON.stringify(actual[section][key]) === JSON.stringify(value),
          `API contract differs: ${section} ${key}`
        );
      }
    }
  } else {
    assert.ok(
      JSON.stringify(actual) === JSON.stringify(expected),
      `${name} differs from deployed API`
    );
  }
}
