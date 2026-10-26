import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "./release-artifact.mjs";

for (const flag of [
  "VOICE_EDITOR",
  "AZURE_PRONUNCIATION_INPUTS",
  "FORM_SPELLING_REGULARITY",
  "SENTENCE_FORMATTING"
]) {
  for (const value of ["true", "false"]) {
    test(`admin ${flag} selects immutable package settings: ${value}`, () => {
      assert.equal(
        buildConfig("admin", { [`DEPLOY_${flag}`]: value }).env[`VITE_${flag}`],
        value
      );
    });
  }
  test(`admin refuses invalid ${flag} instead of silently changing settings`, () => {
    assert.throws(
      () => buildConfig("admin", { [`DEPLOY_${flag}`]: "TRUE" }),
      /true or false/
    );
  });
}
