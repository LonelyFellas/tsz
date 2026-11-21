import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { V3StepActions } from "./V3StepActions";

afterEach(() => vi.restoreAllMocks());

it("窄窗口侧栏移到抽屉后，底栏仍贴住编辑区域底边并跟随滚动", () => {
  let bottom = 650;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("word-creation-shell")
        ? ({ left: 24, right: 824, bottom, width: 800 } as DOMRect)
        : ({ top: 580, bottom: 650, height: 70 } as DOMRect);
    }
  );
  const { unmount } = render(
    <div className="word-creation-shell" style={{ border: "1px solid" }}>
      <main>
        <V3StepActions status="有未保存修改">
          <button>保存草稿</button>
        </V3StepActions>
      </main>
    </div>
  );
  const bar = screen
    .getByRole("button", { name: "保存草稿" })
    .closest(".v3-step-actions");
  expect(bar).toHaveStyle({
    left: "25px",
    width: "798px",
    bottom: `${window.innerHeight - bottom + 1}px`
  });
  expect(bar).toHaveAttribute("data-at-end", "true");
  bottom = window.innerHeight + 100;
  act(() => window.dispatchEvent(new Event("scroll")));
  expect(bar).toHaveStyle({ bottom: "0px" });
  expect(bar).toHaveAttribute("data-at-end", "false");
  unmount();
  expect(document.querySelector(".v3-step-actions")).toBeNull();
});

it("inline模式把操作条留在内容流中并保留按钮交互", () => {
  const onClick = vi.fn();
  const { unmount } = render(
    <div className="word-creation-shell">
      <V3StepActions inline className="lexicon-next-basics-actions">
        <button onClick={onClick}>下一步</button>
      </V3StepActions>
    </div>
  );

  const button = screen.getByRole("button", { name: "下一步" });
  const bar = button.closest(".v3-step-actions");
  expect(bar).toHaveClass("v3-step-actions-inline");
  expect(bar).not.toHaveAttribute("data-at-end");
  expect(bar?.parentElement).toHaveClass("word-creation-shell");
  fireEvent.click(button);
  expect(onClick).toHaveBeenCalledTimes(1);
  unmount();
  expect(document.querySelector(".v3-step-actions")).toBeNull();
});
