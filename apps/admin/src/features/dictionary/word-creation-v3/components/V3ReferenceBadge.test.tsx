import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildReferenceIndex } from "../referenceGuard";
import {
  draftRelationReference,
  inboundReferences,
  sharedSentenceReference
} from "../referenceGuard.test.helper";
import {
  V3ReferenceGuardProvider,
  type V3ReferenceGuard
} from "../referenceGuardContext";
import { V3ReferenceBadge } from "./V3ReferenceBadge";
import { V3ReferenceList } from "./V3ReferenceList";

const target = {
  pos_id: "pos-1",
  form_id: "form-1",
  variant_id: "variant-1",
  sense_id: "sense-1"
};

function renderWithGuard(
  node: React.ReactNode,
  overrides: Partial<V3ReferenceGuard> = {}
) {
  const guard: V3ReferenceGuard = {
    index: buildReferenceIndex(
      inboundReferences([
        sharedSentenceReference(target, {
          text: "A wonderful flower.",
          surface: "wonderful"
        }),
        draftRelationReference("sense-1")
      ])
    ),
    openReference: vi.fn(),
    refresh: vi.fn(),
    registerNavigator: vi.fn(),
    ...overrides
  };
  render(
    <V3ReferenceGuardProvider value={guard}>{node}</V3ReferenceGuardProvider>
  );
  return guard;
}

describe("V3ReferenceBadge", () => {
  it("没有引用时不渲染", () => {
    renderWithGuard(<V3ReferenceBadge nodeIds={["unreferenced"]} />);
    expect(screen.queryByRole("button", { name: /被引用/ })).toBeNull();
  });

  it("按完整计数显示，点开列出引用、高亮片段并提供跳转", () => {
    const guard = renderWithGuard(
      <V3ReferenceBadge label="词义" nodeIds={["sense-1"]} />
    );
    const badge = screen.getByRole("button", { name: "被引用 2" });
    fireEvent.click(badge);
    // jsdom 里 antd 弹层的进场动画不结束，只能断言内容已挂到 DOM。
    expect(screen.getByText("词义被 2 处引用")).toBeInTheDocument();
    expect(screen.getByText("多维例句")).toBeInTheDocument();
    expect(screen.getByText("近义词")).toBeInTheDocument();
    expect(document.querySelector("mark")?.textContent).toBe("wonderful");
    expect(screen.getByText("circle")).toBeInTheDocument();
    expect(screen.getByText("圆圈")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看例句" }));
    expect(guard.openReference).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "shared_sentence" })
    );
    expect(
      screen.getByRole("link", { name: "在例句库打开" }).getAttribute("href")
    ).toBe("/sentences?sentence=sentence-1");
    expect(
      screen.getByRole("link", { name: "打开来源词条" }).getAttribute("href")
    ).toBe("/words/entry-source/v3/wizard/meanings?focus_node=relation-1");
  });

  it("明细被截断时说明只显示了前面若干条，并标出失效项", () => {
    const stale = sharedSentenceReference(target, { stale: true });
    render(<V3ReferenceList references={[stale]} total={7} emptyText="无" />);
    expect(screen.getByText("共 7 处，显示前 1 条")).toBeInTheDocument();
    expect(screen.getByText("已失效")).toBeInTheDocument();
  });
});
