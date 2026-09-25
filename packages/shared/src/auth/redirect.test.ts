import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it.each([
    null,
    "",
    "wordlists",
    "https://outside.example/",
    "//outside.example/",
    "///outside.example/",
    "javascript:void(0)",
    "data:text/html,test",
    "/\\outside.example/",
    "/\t/outside.example/",
    "/\n/outside.example/",
    "/a/..//outside.example/",
    "/%2foutside.example/",
    "/%5coutside.example/",
    "/%09/outside.example/",
    "/%ZZ"
  ])("非法目标 %s 回退首页", (value) => {
    expect(safeRedirectPath(value)).toBe("/");
  });

  it.each([
    ["/", "/"],
    ["/wordlists", "/wordlists"],
    ["/student/practice?unit=2#words", "/student/practice?unit=2#words"],
    ["/wordlists?q=hello%20world", "/wordlists?q=hello%20world"],
    [
      "/wordlists?next=https://outside.example",
      "/wordlists?next=https://outside.example"
    ],
    ["/student/../wordlists", "/wordlists"],
    ["/student/%2e%2e/wordlists", "/wordlists"]
  ])("保留合法站内目标 %s", (value, expected) => {
    expect(safeRedirectPath(value)).toBe(expected);
  });
});
