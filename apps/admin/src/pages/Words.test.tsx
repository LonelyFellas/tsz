import { render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SmartDictionary } from "@/features/dictionary/SmartDictionary";
import { WordsPage } from "./Words";

const wired = vi.hoisted(() => ({
  props: undefined as ComponentProps<typeof SmartDictionary> | undefined
}));

vi.mock("@/features/dictionary/SmartDictionary", () => ({
  SmartDictionary: (props: ComponentProps<typeof SmartDictionary>) => {
    wired.props = props;
    return <div>smart-dictionary</div>;
  }
}));

describe("WordsPage presentation observation wiring", () => {
  beforeEach(() => {
    wired.props = undefined;
    vi.unstubAllGlobals();
  });

  it("正式页面把未知 strategy 接到浏览器错误观测入口", () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);

    render(<WordsPage />);
    wired.props?.reportUnknownPresentationStrategy?.({
      entry_id: "entry-v3",
      strategy_version: "future_strategy_9"
    });

    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "UnknownPresentationStrategyError",
        message: expect.stringContaining("future_strategy_9")
      })
    );
  });
});
