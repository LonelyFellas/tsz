import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setTheme } from "@/lib/theme";
import { ThemeModeControl } from "./ThemeModeControl";

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })
  );
  setTheme("light");
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("dark");
});

it("点击三档外观选项同步更新主题和选中态，重新挂载保留选择", async () => {
  const actions = userEvent.setup();
  const view = render(<ThemeModeControl />);
  await actions.click(screen.getByRole("button", { name: "深色" }));
  expect(document.documentElement).toHaveClass("dark");
  expect(screen.getByRole("button", { name: "深色" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  view.unmount();
  render(<ThemeModeControl />);
  expect(screen.getByRole("button", { name: "深色" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  expect(document.documentElement).toHaveClass("dark");

  await actions.click(screen.getByRole("button", { name: "浅色" }));
  expect(document.documentElement).not.toHaveClass("dark");
  expect(screen.getByRole("button", { name: "浅色" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await actions.click(screen.getByRole("button", { name: "跟随系统" }));
  expect(document.documentElement).toHaveClass("dark");
  expect(screen.getByRole("button", { name: "跟随系统" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});
