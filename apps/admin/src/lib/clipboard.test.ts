import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./clipboard";

/** 临时改写只读的 window.isSecureContext，返回还原函数。 */
function stubSecureContext(value: boolean) {
  const original = Object.getOwnPropertyDescriptor(window, "isSecureContext");
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value
  });
  return () => {
    if (original) Object.defineProperty(window, "isSecureContext", original);
    else delete (window as { isSecureContext?: boolean }).isSecureContext;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  // 清理可能被测试挂上的 clipboard / execCommand。
  delete (navigator as { clipboard?: unknown }).clipboard;
  delete (document as { execCommand?: unknown }).execCommand;
});

describe("copyText", () => {
  it("安全上下文优先走 Clipboard API，成功返回 true", async () => {
    const restore = stubSecureContext(true);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    await expect(copyText("secret")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("secret");
    restore();
  });

  it("Clipboard API 抛异常时降级到 execCommand", async () => {
    const restore = stubSecureContext(true);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });

    await expect(copyText("secret")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    restore();
  });

  it("非安全上下文直接走 execCommand，成功返回 true", async () => {
    const restore = stubSecureContext(false);
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });

    await expect(copyText("secret")).resolves.toBe(true);
    // 离屏 textarea 已清理，不残留。
    expect(document.querySelector("textarea")).toBeNull();
    restore();
  });

  it("execCommand 返回 false 时如实返回 false（不谎报成功）", async () => {
    const restore = stubSecureContext(false);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn().mockReturnValue(false)
    });

    await expect(copyText("secret")).resolves.toBe(false);
    restore();
  });

  it("execCommand 抛异常时返回 false 且清理 textarea", async () => {
    const restore = stubSecureContext(false);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn().mockImplementation(() => {
        throw new Error("boom");
      })
    });

    await expect(copyText("secret")).resolves.toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
    restore();
  });

  it("既无 Clipboard API 也无 execCommand（jsdom 默认）返回 false", async () => {
    // 不做任何桩：jsdom 下 isSecureContext=undefined、clipboard/execCommand 均缺失，
    // 恰好复现 tshb-test 非安全上下文最坏情形。
    await expect(copyText("secret")).resolves.toBe(false);
  });
});
