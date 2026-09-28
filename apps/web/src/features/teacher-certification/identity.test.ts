import { afterEach, expect, it, vi } from "vitest";
import {
  readWorkspaceIdentity,
  resolveWorkspaceIdentity,
  writeWorkspaceIdentity
} from "./identity";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it("remembers the chosen workspace only for that account", () => {
  writeWorkspaceIdentity("user-a", "teacher");
  expect(readWorkspaceIdentity("user-a")).toBe("teacher");
  expect(readWorkspaceIdentity("user-b")).toBe("student");
});

it("does not grant teacher access through a saved preference", () => {
  writeWorkspaceIdentity("user-a", "teacher");
  expect(resolveWorkspaceIdentity(readWorkspaceIdentity("user-a"), false)).toBe(
    "student"
  );
  expect(resolveWorkspaceIdentity(readWorkspaceIdentity("user-a"), true)).toBe(
    "teacher"
  );
});

it("falls back safely when browser storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(() => writeWorkspaceIdentity("user-a", "teacher")).not.toThrow();
  expect(readWorkspaceIdentity("user-a")).toBe("student");
});
