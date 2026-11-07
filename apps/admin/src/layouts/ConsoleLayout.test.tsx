import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONSOLE_HEADER_Z_INDEX, ConsoleLayout } from "./ConsoleLayout";

vi.mock("@/features/dictionary/part-of-speech/FormTypeLabels", () => ({
  DictionaryFormTypeLabels: ({ children }: { children: React.ReactNode }) =>
    children
}));
vi.mock("@/features/dictionary/part-of-speech/PartOfSpeechLabels", () => ({
  DictionaryPartOfSpeechLabels: ({ children }: { children: React.ReactNode }) =>
    children
}));
vi.mock("@/features/auth/AdminRouteGuard", () => ({
  AdminRouteGuard: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock("@/features/auth/AdminHeader", () => ({
  AdminHeader: () => <div>header</div>
}));
vi.mock("@/features/console/ConsoleSidebar", () => ({
  ConsoleSidebar: ({ onNavigate }: { onNavigate?: () => void }) => {
    const navigate = useNavigate();
    return (
      <button
        onClick={() => {
          navigate("/users");
          onNavigate?.();
        }}
      >
        用户管理
      </button>
    );
  }
}));

function renderLayout(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width
  });
  return render(
    <MemoryRouter initialEntries={["/words"]}>
      <ConsoleLayout />
    </MemoryRouter>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("ConsoleLayout 顶部导航", () => {
  it.each([1440, 900, 375])(
    "%ipx 下默认收起，通过顶栏展开并在跳转后关闭",
    async (width) => {
      const { container } = renderLayout(width);
      expect(container.querySelector("aside")).not.toBeInTheDocument();
      const trigger = screen.getByRole("button", { name: "后台导航" });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      fireEvent.click(trigger);
      expect(
        await screen.findByRole("dialog", { name: "后台导航" })
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "用户管理" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    }
  );

  it("支持 Escape 关闭并归还焦点", async () => {
    renderLayout(1440);
    const trigger = screen.getByRole("button", { name: "后台导航" });
    fireEvent.click(trigger);
    const panel = await screen.findByRole("dialog", { name: "后台导航" });
    fireEvent.keyDown(panel, { key: "Escape" });
    await vi.waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("顶栏层级高于表格固定列", () => {
    const { container } = renderLayout(1440);
    expect(CONSOLE_HEADER_Z_INDEX).toBeGreaterThan(12);
    expect(
      Number(getComputedStyle(container.querySelector("header")!).zIndex)
    ).toBe(CONSOLE_HEADER_Z_INDEX);
  });
});
