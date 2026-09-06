import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LIAISON_COLOR,
  getLiaisonColor,
  isLiaisonColor,
  setLiaisonColor,
  subscribeLiaisonColor
} from "./liaisonColor";

describe("liaison colour preference", () => {
  afterEach(() => {
    setLiaisonColor(DEFAULT_LIAISON_COLOR);
    localStorage.clear();
  });

  it("only accepts hex colours, since the value lands in a CSS variable", () => {
    expect(isLiaisonColor("#1677ff")).toBe(true);
    expect(isLiaisonColor("#ABC")).toBe(true);
    expect(isLiaisonColor("#1677ff80")).toBe(true);
    expect(isLiaisonColor("red")).toBe(false);
    expect(isLiaisonColor("#12345")).toBe(false);
    expect(isLiaisonColor("url(x)")).toBe(false);
    expect(isLiaisonColor(undefined)).toBe(false);
  });

  it("starts from the default, notifies subscribers, and persists a change", () => {
    expect(getLiaisonColor()).toBe(DEFAULT_LIAISON_COLOR);
    const listener = vi.fn();
    const unsubscribe = subscribeLiaisonColor(listener);

    setLiaisonColor("#1677ff");
    expect(getLiaisonColor()).toBe("#1677ff");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("tsz-ve:liaison-color")).toBe("#1677ff");

    // 无效值与相同值都不惊动订阅者
    setLiaisonColor("blue");
    setLiaisonColor("#1677ff");
    expect(getLiaisonColor()).toBe("#1677ff");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setLiaisonColor("#000000");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("reads a stored preference on startup and ignores a corrupted one", async () => {
    localStorage.setItem("tsz-ve:liaison-color", "#00aa55");
    vi.resetModules();
    const fresh = await import("./liaisonColor");
    expect(fresh.getLiaisonColor()).toBe("#00aa55");

    localStorage.setItem("tsz-ve:liaison-color", "javascript:alert(1)");
    vi.resetModules();
    const corrupted = await import("./liaisonColor");
    expect(corrupted.getLiaisonColor()).toBe(DEFAULT_LIAISON_COLOR);
  });
});
