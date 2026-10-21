import { afterEach, describe, expect, it, vi } from "vitest";
import { newWordNodeId } from "./primitives";

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
