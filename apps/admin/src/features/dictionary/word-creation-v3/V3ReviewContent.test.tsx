import { render, screen, within } from "@testing-library/react";
import { Button } from "antd";
import type { AdminWordV3 } from "@tsz/types";
import { describe, expect, it, vi } from "vitest";
import { formsFixture } from "./fixtures";
import { V3ReviewContent } from "./V3ReviewContent";

function word(): AdminWordV3 {
  const forms = formsFixture();
  return {
    schema_version: 3,
    id: "word-internal-id",
    language: "en",
    kind: "word",
    status: "published",
    revision: 4,
    lifecycle_revision: 1,
    annotation: null,
    annotation_revision: 1,
    published_revision: 4,
    has_unpublished_changes: false,
    presentation: {
      label: "center",
      matched_surfaces: ["center"],
      strategy_version: "surface_summary_v1"
    },
    capabilities: {
      publication: { mode: "native" },
      pronunciation_normalization_version: "nfkc_trim_lower_v1"
    },
    forms,
    meanings: { sense_groups: [], pos: [] },
    completed_steps: ["basics", "forms", "meanings"],
    max_reachable_step: "preview",
    created_by: "admin-1",
    created_at: "2026-08-29T00:00:00Z",
    updated_at: "2026-08-29T00:00:00Z",
    published_at: "2026-08-29T00:00:00Z"
  };
}

describe("V3ReviewContent", () => {
  it("概览使用独立例句总数，未加载时不显示假零值", () => {
    const view = render(<V3ReviewContent word={word()} sentenceCount={4} />);
    const summary = screen.getByLabelText("内容概览");
    expect(
      within(summary).getByText("例句", { exact: false })
    ).toHaveTextContent("4 例句");
    view.rerender(<V3ReviewContent word={word()} sentenceCount={null} />);
    expect(
      within(summary).getByText("例句", { exact: false })
    ).toHaveTextContent("— 例句");
  });

  it("renders a production review hierarchy without exposing internal IDs", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    render(
      <V3ReviewContent
        actions={<Button>继续编辑</Button>}
        readiness={<div>当前内容已通过发布检查</div>}
        word={word()}
      />
    );

    expect(screen.getByRole("heading", { name: "center" })).toBeVisible();
    expect(screen.getByText("已发布", { exact: true })).toBeVisible();
    expect(screen.getByText("English 英语", { exact: true })).toBeVisible();
    expect(screen.getByRole("button", { name: "继续编辑" })).toBeVisible();
    expect(screen.getByText("当前内容已通过发布检查")).toBeVisible();
    expect(screen.getByText("内容概览")).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "词条阅读目录" })
    ).toBeVisible();
    expect(screen.getAllByRole("button", { name: /词形与发音/ }).length).toBe(
      2
    );
    expect(screen.getByRole("button", { name: /词义结构/ })).toBeVisible();
    expect(screen.queryByText("word-internal-id")).toBeNull();
    expect(
      consoleError.mock.calls.some((call) =>
        call.some((value) =>
          String(value).includes("List component is deprecated")
        )
      )
    ).toBe(false);
    consoleError.mockRestore();
  });
});
