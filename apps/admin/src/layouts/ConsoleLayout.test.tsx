import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ConsoleLayout,
  isWordCreationWorkspacePath,
  modeOf
} from "./ConsoleLayout";

vi.mock("@/features/auth/AdminRouteGuard", () => ({
  AdminRouteGuard: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock("@/features/auth/AdminHeader", () => ({
  AdminHeader: () => <div>header</div>
}));
vi.mock("@/features/console/ConsoleSidebar", () => ({
  ConsoleSidebar: ({ collapsed }: { collapsed?: boolean }) => (
    <div data-testid="sidebar">{collapsed ? "rail" : "full"}</div>
  )
}));

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width
  });
  fireEvent(window, new Event("resize"));
}

function renderLayout(pathname: string, width: number) {
  setViewport(width);
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <ConsoleLayout />
    </MemoryRouter>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("isWordCreationWorkspacePath", () => {
  it.each([
    "/words/new",
    "/words/word-center/wizard/basics",
    "/words/word-center/wizard/forms",
    "/words/word-center/wizard/meanings",
    "/words/word-center/wizard/preview",
    "/words/word-center/v3/wizard/basics",
    "/words/word-center/v3/wizard/forms",
    "/words/word-center/v3/wizard/meanings",
    "/words/word-center/v3/wizard/preview"
  ])("%s 使用宽编辑工作台", (pathname) => {
    expect(isWordCreationWorkspacePath(pathname)).toBe(true);
  });

  it.each(["/words", "/words/word-center/wizard/unknown", "/users"])(
    "%s 保持普通后台布局",
    (pathname) => {
      expect(isWordCreationWorkspacePath(pathname)).toBe(false);
    }
  );
});

describe("modeOf", () => {
  it("为创建向导保留至少 1200px 内容宽度后再完整展开导航", () => {
    expect(modeOf(1468, true)).toBe("full");
    expect(modeOf(1467, true)).toBe("rail");
    expect(modeOf(768, true)).toBe("rail");
    expect(modeOf(767, true)).toBe("drawer");
  });

  it("不改变非向导页面的既有断点", () => {
    expect(modeOf(992, false)).toBe("full");
    expect(modeOf(991, false)).toBe("rail");
    expect(modeOf(767, false)).toBe("drawer");
  });
});

describe("ConsoleLayout", () => {
  it("向导在超宽、宽中、小屏分别使用 full、rail、drawer", () => {
    const view = renderLayout("/words/word-center/wizard/forms", 1536);
    expect(screen.getByTestId("sidebar")).toHaveTextContent("full");

    setViewport(1200);
    expect(screen.getByTestId("sidebar")).toHaveTextContent("rail");

    setViewport(640);
    expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "打开菜单" })
    ).toBeInTheDocument();
    view.unmount();
  });

  it("同一向导断点内保留用户手动切换结果", () => {
    renderLayout("/words/word-center/wizard/meanings", 1200);
    expect(screen.getByTestId("sidebar")).toHaveTextContent("rail");

    fireEvent.click(screen.getByRole("button", { name: "展开侧栏" }));
    expect(screen.getByTestId("sidebar")).toHaveTextContent("full");

    setViewport(1300);
    expect(screen.getByTestId("sidebar")).toHaveTextContent("full");
  });

  it("普通页面在相同宽度仍按原规则完整展开", () => {
    renderLayout("/words", 1200);
    expect(screen.getByTestId("sidebar")).toHaveTextContent("full");
  });
});
