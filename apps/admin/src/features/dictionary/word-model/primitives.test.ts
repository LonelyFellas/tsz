import type { RichText } from "@tsz/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cloneWordValue,
  emptyWordRichText,
  moveWordNode,
  newWordNodeId,
  toWordRichText
} from "./primitives";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("newWordNodeId", () => {
  it("优先原样使用 crypto.randomUUID", () => {
    const randomUUID = vi.fn(() => "12345678-1234-4234-8234-123456789abc");
    const getRandomValues = vi.fn();
    vi.stubGlobal("crypto", { randomUUID, getRandomValues });

    expect(newWordNodeId()).toBe("12345678-1234-4234-8234-123456789abc");
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it("randomUUID 不可用时用 16 bytes 生成 RFC 4122 v4/variant UUID", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(0xff);
      return bytes;
    });
    vi.stubGlobal("crypto", { randomUUID: undefined, getRandomValues });

    expect(newWordNodeId()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    const bytes = getRandomValues.mock.calls[0]![0];
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes).toHaveLength(16);
  });
});

describe("RichText primitives", () => {
  const original: RichText = {
    version: 1,
    text: "centre",
    spans: [{ start: 0, end: 6, type: "blue" }],
    liaisons: [2]
  };

  it("文本未变时复用原对象，避免丢失 code-point 标记", () => {
    expect(toWordRichText("centre", original)).toBe(original);
  });

  it("缺少原值或文本变化时创建干净 RichText", () => {
    expect(toWordRichText("center")).toEqual({
      version: 1,
      text: "center",
      spans: [],
      liaisons: []
    });
    expect(toWordRichText("center", original)).toEqual({
      version: 1,
      text: "center",
      spans: [],
      liaisons: []
    });
    expect(emptyWordRichText()).toEqual({
      version: 1,
      text: "",
      spans: [],
      liaisons: []
    });
  });
});

describe("tree value primitives", () => {
  it("cloneWordValue 深拷贝嵌套值且不污染原节点", () => {
    const original = {
      id: "root",
      children: [{ id: "child", values: [1, 2] }]
    };

    const cloned = cloneWordValue(original);
    cloned.children[0]!.values.push(3);

    expect(cloned).not.toBe(original);
    expect(cloned.children[0]).not.toBe(original.children[0]);
    expect(cloned.children[0]!.values).toEqual([1, 2, 3]);
    expect(original.children[0]!.values).toEqual([1, 2]);
  });

  it("moveWordNode 支持向前/向后移动且不改写输入数组", () => {
    const items = ["a", "b", "c"];

    expect(moveWordNode(items, 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveWordNode(items, 2, 0)).toEqual(["c", "a", "b"]);
    expect(items).toEqual(["a", "b", "c"]);
  });

  it.each([
    [-1, 0],
    [3, 0],
    [0, -1],
    [0, 3],
    [1, 1]
  ])("来源/目标 (%s -> %s) 越界或不变时返回原引用", (from, to) => {
    const items = ["a", "b", "c"];
    expect(moveWordNode(items, from, to)).toBe(items);
  });

  it("空数组移动保持原引用", () => {
    const items: string[] = [];
    expect(moveWordNode(items, 0, 0)).toBe(items);
  });
});
