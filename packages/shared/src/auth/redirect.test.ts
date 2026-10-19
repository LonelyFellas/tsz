import { describe, expect, it } from "vitest";
import {
  safeRedirectPath,
  phoneBindingPath,
  phoneBindingRedirect
} from "./redirect";

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

describe("phone binding", () => {
  it("只有已登录未绑手机用户被拦截，退出、补绑与注销不形成循环", () => {
    expect(phoneBindingRedirect(null, "/student/practice")).toBeNull();
    expect(
      phoneBindingRedirect({ phone: "13800138000" }, "/student/practice")
    ).toBeNull();
    expect(phoneBindingRedirect({}, "/student/practice")).toBe(
      "/bind-phone?redirect=%2Fstudent%2Fpractice"
    );
    for (const path of [
      "/bind-phone",
      "/account/delete",
      "/login",
      "/register",
      "/privacy",
      "/terms"
    ])
      expect(phoneBindingRedirect({}, path)).toBeNull();
  });
  it("绑定流程过滤外站与循环目标，并保留正常查询与锚点", () => {
    for (const path of [
      "https://outside.example",
      "/bind-phone?redirect=/bind-phone",
      "/%62ind-phone",
      "/login",
      "/onboarding"
    ])
      expect(phoneBindingPath(path)).toBe("/bind-phone");
    expect(phoneBindingPath("/student/practice?unit=2#words")).toBe(
      "/bind-phone?redirect=%2Fstudent%2Fpractice%3Funit%3D2%23words"
    );
  });
});
