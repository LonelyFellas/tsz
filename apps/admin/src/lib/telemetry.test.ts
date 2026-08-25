import { afterEach, describe, expect, it, vi } from "vitest";
import { reportClientError } from "./telemetry";

describe("reportClientError", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("把诊断交给浏览器 error 观测入口", () => {
    const reportError = vi.fn();
    const error = new Error("diagnostic");
    vi.stubGlobal("reportError", reportError);

    reportClientError(error);

    expect(reportError).toHaveBeenCalledWith(error);
  });

  it("宿主没有 error 观测入口时保持非致命", () => {
    vi.stubGlobal("reportError", undefined);
    expect(() => reportClientError(new Error("diagnostic"))).not.toThrow();
  });
});
