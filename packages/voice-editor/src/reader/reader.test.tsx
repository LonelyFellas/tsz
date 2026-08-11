import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RichTextV1, RichTextV2 } from "@tsz/types";
import { RichTextReadOnly } from "./RichTextReadOnly";
import { VoiceRichTextField } from "./VoiceRichTextField";
import { segmentRichText } from "./segments";

const V1: RichTextV1 = {
  version: 1,
  text: "hello",
  spans: [{ start: 0, end: 2, type: "bold" }],
  liaisons: [2]
};

const V2: RichTextV2 = {
  version: 2,
  text: "hello",
  annotations: [
    { type: "emphasis", start: 0, end: 5, level: "strong" },
    { type: "phoneme", start: 0, end: 2, alphabet: "ipa", phoneme: "hə" },
    { type: "liaison", start: 2, end: 4 },
    { type: "highlight", start: 4, end: 5, color: "green" },
    { type: "pause", at: 2, duration_ms: 300 }
  ]
};

describe("RichText reader", () => {
  it("segments and renders V2 semantic classes, IPA, and pause without an editor", () => {
    expect(segmentRichText(V2)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "pause", at: 2, durationMs: 300 }),
        expect.objectContaining({ kind: "text", start: 0, end: 2, text: "he" })
      ])
    );
    const { container } = render(
      <RichTextReadOnly value={V2} className="custom-reader" />
    );

    expect(screen.getByText("⏸ 300ms")).toHaveAttribute(
      "data-duration-ms",
      "300"
    );
    expect(container.querySelector(".tsz-ve-emphasis")).not.toBeNull();
    expect(container.querySelector(".tsz-ve-phoneme")).toHaveAttribute(
      "data-phoneme",
      "hə"
    );
    expect(container.querySelector(".tsz-ve-liaison")).not.toBeNull();
    expect(container.querySelector(".tsz-ve-highlight")).toHaveAttribute(
      "data-color",
      "green"
    );
    expect(container.querySelector("[contenteditable]")).toBeNull();
    expect(screen.getByTestId("voice-rich-text-readonly")).toHaveClass(
      "custom-reader"
    );
  });

  it("renders V1, empty, and invalid values defensively", () => {
    const { container, rerender } = render(<RichTextReadOnly value={V1} />);
    expect(container.querySelector(".tsz-ve-emphasis")).not.toBeNull();

    rerender(
      <RichTextReadOnly
        value={{ version: 2, text: "", annotations: [] }}
        emptyText="空"
      />
    );
    expect(screen.getByText("空")).toBeInTheDocument();

    rerender(
      <RichTextReadOnly
        className="invalid-reader"
        value={{
          version: 2,
          text: "broken",
          annotations: [{ type: "emphasis", start: 8, end: 9, level: "strong" }]
        }}
      />
    );
    expect(screen.getByText("broken")).toHaveClass(
      "is-invalid",
      "invalid-reader"
    );

    rerender(
      <RichTextReadOnly
        value={{
          version: 2,
          text: "broken",
          annotations: [{ type: "emphasis", start: 8, end: 9, level: "strong" }]
        }}
      />
    );
    expect(screen.getByText("broken")).toHaveClass("is-invalid");
    expect(screen.getByText("broken")).not.toHaveClass("invalid-reader");
  });

  it("shows an editable field entry and hides it in read-only mode", () => {
    const onEdit = vi.fn();
    const { rerender } = render(
      <VoiceRichTextField
        value={V1}
        contextLabel="英文释义"
        dialectLabel="US"
        onEdit={onEdit}
      />
    );
    expect(screen.getByText("英文释义")).toBeInTheDocument();
    expect(screen.getByText("US")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "语音编辑" }));
    expect(onEdit).toHaveBeenCalledOnce();

    rerender(<VoiceRichTextField value={V1} readOnly onEdit={onEdit} />);
    expect(
      screen.queryByRole("button", { name: "语音编辑" })
    ).not.toBeInTheDocument();
  });
});
