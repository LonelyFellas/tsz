import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VoiceRichTextEditor } from "./VoiceRichTextEditor";

vi.mock("../core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core")>();
  return {
    ...actual,
    buildSsmlPreview: () => {
      throw new Error("SSML 生成失败");
    }
  };
});

describe("VoiceRichTextEditor SSML fallback", () => {
  it("keeps the editor usable when SSML rendering fails", () => {
    render(
      <VoiceRichTextEditor
        open
        value={{ version: 2, text: "hello", annotations: [] }}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("高级：SSML 预览"));
    expect(screen.getByText("SSML 生成失败")).toBeInTheDocument();
    expect(screen.getByLabelText("语音富文本正文")).toBeInTheDocument();
  });
});
