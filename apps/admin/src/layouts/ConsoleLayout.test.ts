import { describe, expect, it } from "vitest";
import { isWordCreationWorkspacePath } from "./ConsoleLayout";

describe("isWordCreationWorkspacePath", () => {
  it.each([
    "/words/new",
    "/words/word-center/wizard/forms",
    "/words/word-center/wizard/meanings",
    "/words/word-center/wizard/preview"
  ])("%s 使用宽编辑工作台", (pathname) => {
    expect(isWordCreationWorkspacePath(pathname)).toBe(true);
  });

  it.each([
    "/words",
    "/words/word-center/edit",
    "/words/word-center/wizard/unknown",
    "/users"
  ])("%s 保持普通后台布局", (pathname) => {
    expect(isWordCreationWorkspacePath(pathname)).toBe(false);
  });
});
