import assert from "node:assert/strict";

function differencePath(actual, expected, path) {
  const child = (key) =>
    `${path}/${String(key).replaceAll("~", "~0").replaceAll("/", "~1")}`;
  if (Array.isArray(actual) && Array.isArray(expected)) {
    for (
      let index = 0;
      index < Math.min(actual.length, expected.length);
      index++
    ) {
      if (JSON.stringify(actual[index]) !== JSON.stringify(expected[index])) {
        return differencePath(actual[index], expected[index], child(index));
      }
    }
  } else if (
    actual &&
    expected &&
    typeof actual === "object" &&
    typeof expected === "object"
  ) {
    for (const key of Object.keys(expected)) {
      if (!Object.hasOwn(actual, key)) return child(key);
      if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) {
        return differencePath(actual[key], expected[key], child(key));
      }
    }
    for (const key of Object.keys(actual)) {
      if (!Object.hasOwn(expected, key)) return child(key);
    }
  }
  return path || "/";
}

function assertSameContract(actual, expected, message, path = "") {
  // Keep the original acceptance rule, including serialized property order.
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    assert.ok(false, `${message} at ${differencePath(actual, expected, path)}`);
  }
}

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
        assertSameContract(
          actual[section][key],
          value,
          `API contract differs: ${section} ${key}`,
          `/${section}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`
        );
      }
    }
  } else {
    assertSameContract(actual, expected, `${name} differs from selected API`);
  }
}
