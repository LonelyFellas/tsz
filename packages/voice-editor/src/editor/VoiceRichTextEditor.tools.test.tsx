import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { Schema } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import { VoiceRichTextEditor } from "./VoiceRichTextEditor";

interface EditorCallbacks {
  onUpdate?: (input: { editor: Editor }) => void;
  onSelectionUpdate?: (input: { editor: Editor }) => void;
  onTransaction?: (input: { editor: Editor }) => void;
}

const harness = vi.hoisted(() => ({
  editor: undefined as Editor | undefined,
  callbacks: undefined as EditorCallbacks | undefined
}));

vi.mock("@tiptap/react", () => ({
  useEditor: (callbacks: EditorCallbacks) => {
    harness.callbacks = callbacks;
    return harness.editor;
  },
  EditorContent: () => <div data-testid="mock-editor-content" />
}));

function button(label: string, root: ParentNode = document): HTMLButtonElement {
  const result = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) =>
      candidate.getAttribute("aria-label") === label ||
      candidate.textContent?.replaceAll(/\s/g, "") ===
        label.replaceAll(/\s/g, "")
  );
  if (!result) throw new Error(`button not found: ${label}`);
  return result;
}

function fakeEditor() {
  const chain = {
    focus: vi.fn(),
    toggleMark: vi.fn(),
    setMark: vi.fn(),
    unsetMark: vi.fn(),
    updateAttributes: vi.fn(),
    deleteSelection: vi.fn(),
    insertContent: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    run: vi.fn().mockReturnValue(true)
  };
  Object.values(chain).forEach((method) => {
    if (method !== chain.run) method.mockReturnValue(chain);
  });
  const schema = new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: { content: "inline*", group: "block" },
      text: { group: "inline" },
      voicePause: {
        inline: true,
        group: "inline",
        atom: true,
        attrs: { durationMs: { default: 300 } }
      }
    }
  });
  const textDoc = schema.node("doc", undefined, [
    schema.node("paragraph", undefined, [schema.text("hello world")])
  ]);
  const editor = {
    chain: vi.fn(() => chain),
    commands: {
      setContent: vi.fn(),
      setEditable: vi.fn()
    },
    setEditable: vi.fn(),
    getJSON: vi.fn(() => ({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "hello world" }] }
      ]
    })),
    getAttributes: vi.fn(() => ({})),
    isActive: vi.fn(() => false),
    can: vi.fn(() => ({ undo: () => true, redo: () => true })),
    state: {
      selection: TextSelection.create(textDoc, 1, 6),
      doc: textDoc
    }
  };
  return { editor: editor as unknown as Editor, chain, schema };
}

beforeEach(() => {
  const fake = fakeEditor();
  harness.editor = fake.editor;
  harness.callbacks = undefined;
});

describe("VoiceRichTextEditor selection tools", () => {
  it("drives selection marks, highlight toggle, IPA precedence/clear, and undo/redo", async () => {
    const fake = harness.editor!;
    render(
      <VoiceRichTextEditor
        open
        value={{ version: 1, text: "hello world", spans: [], liaisons: [] }}
        pronunciationHints={{ hello: "hint-ipa" }}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    act(() => {
      harness.callbacks?.onSelectionUpdate?.({ editor: fake });
      harness.callbacks?.onTransaction?.({ editor: fake });
    });
    await waitFor(() =>
      expect(screen.getByText("已选中：“hello”")).toBeVisible()
    );

    fireEvent.click(button("加重音"));
    fireEvent.click(button("加连读"));
    fireEvent.click(button("绿色高亮"));
    expect(fake.chain().toggleMark).toHaveBeenCalledWith("emphasis", {
      level: "strong"
    });
    expect(fake.chain().toggleMark).toHaveBeenCalledWith("liaison");
    expect(fake.chain().setMark).toHaveBeenCalledWith("voiceHighlight", {
      color: "green"
    });

    vi.mocked(fake.isActive).mockReturnValue(true);
    vi.mocked(fake.getAttributes).mockReturnValue({ color: "green" });
    fireEvent.click(button("绿色高亮"));
    expect(fake.chain().unsetMark).toHaveBeenCalledWith("voiceHighlight");

    vi.mocked(fake.getAttributes).mockReturnValue({ phoneme: "existing-ipa" });
    fireEvent.click(button("IPA"));
    const input = await screen.findByLabelText("IPA 读音");
    expect(input).toHaveValue("existing-ipa");
    fireEvent.change(input, { target: { value: "" } });
    const popover = input.closest(".ant-popover");
    if (!popover) throw new Error("IPA popover missing");
    fireEvent.click(button("应用", popover));
    expect(fake.chain().unsetMark).toHaveBeenCalledWith("phoneme");

    vi.mocked(fake.getAttributes).mockReturnValue({});
    fireEvent.click(button("IPA"));
    const hintedInput = await screen.findByLabelText("IPA 读音");
    expect(hintedInput).toHaveValue("hint-ipa");
    fireEvent.keyDown(hintedInput, { key: "Enter" });
    expect(fake.chain().setMark).toHaveBeenCalledWith("phoneme", {
      phoneme: "hint-ipa"
    });

    fireEvent.click(button("IPA"));
    const escapeInput = await screen.findByLabelText("IPA 读音");
    fireEvent.keyDown(escapeInput, { key: "Escape" });
    fireEvent.click(button("IPA"));
    const cancelInput = await screen.findByLabelText("IPA 读音");
    const cancelPopover = cancelInput.closest(".ant-popover");
    if (!cancelPopover) throw new Error("IPA cancel popover missing");
    fireEvent.click(button("取消", cancelPopover));

    fireEvent.click(button("清除标注"));
    expect(fake.chain().unsetMark).toHaveBeenCalledWith("emphasis");
    expect(fake.chain().unsetMark).toHaveBeenCalledWith("liaison");
    fireEvent.click(button("撤销"));
    fireEvent.click(button("重做"));
    expect(fake.chain().undo).toHaveBeenCalled();
    expect(fake.chain().redo).toHaveBeenCalled();
  });

  it("edits, validates, and deletes an atomic pause selection", async () => {
    const fake = harness.editor!;
    const schema = fake.state.doc.type.schema;
    const pauseDoc = schema.node("doc", undefined, [
      schema.node("paragraph", undefined, [schema.node("voicePause")])
    ]);
    (
      fake.state as unknown as {
        selection: NodeSelection;
        doc: typeof pauseDoc;
      }
    ).doc = pauseDoc;
    (fake.state as unknown as { selection: NodeSelection }).selection =
      NodeSelection.create(pauseDoc, 1);
    render(
      <VoiceRichTextEditor
        open
        value={{ version: 2, text: "", annotations: [] }}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    act(() => harness.callbacks?.onSelectionUpdate?.({ editor: fake }));

    fireEvent.click(await screen.findByText("编辑停顿"));
    const input = await screen.findByLabelText("自定义停顿时长");
    const popover = input.closest(".ant-popover");
    if (!popover) throw new Error("pause popover missing");
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.click(button("应用", popover));
    expect(
      await screen.findByText("停顿时长必须是 1–5000ms 的整数")
    ).toBeVisible();

    fireEvent.change(input, { target: { value: "750" } });
    fireEvent.click(button("应用", popover));
    expect(fake.chain().updateAttributes).toHaveBeenCalledWith("voicePause", {
      durationMs: 750
    });
    fireEvent.click(button("500ms", popover));
    expect(fake.chain().updateAttributes).toHaveBeenCalledWith("voicePause", {
      durationMs: 500
    });
    fireEvent.change(input, { target: { value: "800" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(fake.chain().updateAttributes).toHaveBeenCalledWith("voicePause", {
      durationMs: 800
    });
    fireEvent.click(button("删除", popover));
    expect(fake.chain().deleteSelection).toHaveBeenCalled();
  });

  it("surfaces validation, ordinary, and unknown update errors", async () => {
    const fake = harness.editor!;
    const onApply = vi.fn();
    const onDirtyChange = vi.fn();
    render(
      <VoiceRichTextEditor
        open
        value={{ version: 2, text: "hello", annotations: [] }}
        onApply={onApply}
        onCancel={vi.fn()}
        onDirtyChange={onDirtyChange}
      />
    );
    vi.mocked(fake.getJSON).mockReturnValue({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "voicePause", attrs: { durationMs: 0 } }]
        }
      ]
    } as unknown as ReturnType<Editor["getJSON"]>);
    act(() => harness.callbacks?.onUpdate?.({ editor: fake }));
    expect(
      await screen.findByText(/停顿位置必须合法，时长必须是/)
    ).toBeVisible();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    vi.mocked(fake.getJSON).mockImplementationOnce(() => {
      throw new Error("mapping failed");
    });
    act(() => harness.callbacks?.onUpdate?.({ editor: fake }));
    expect(await screen.findByText("mapping failed")).toBeVisible();

    vi.mocked(fake.getJSON).mockImplementationOnce(() => {
      throw { reason: "unknown" };
    });
    act(() => harness.callbacks?.onUpdate?.({ editor: fake }));
    expect(await screen.findByText("操作失败，请重试")).toBeVisible();

    vi.mocked(fake.getJSON).mockReturnValue({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "hello" }] }
      ]
    } as unknown as ReturnType<Editor["getJSON"]>);
    act(() => harness.callbacks?.onUpdate?.({ editor: fake }));
    await waitFor(() =>
      expect(screen.queryByText("操作失败，请重试")).not.toBeInTheDocument()
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    vi.mocked(fake.getJSON).mockImplementationOnce(() => {
      throw new Error("apply mapping failed");
    });
    fireEvent.click(button("应用"));
    expect(await screen.findByText("apply mapping failed")).toBeVisible();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("keeps IPA empty without a saved value or pronunciation hint", async () => {
    const fake = harness.editor!;
    render(
      <VoiceRichTextEditor
        open
        value={{ version: 2, text: "hello", annotations: [] }}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    act(() => harness.callbacks?.onSelectionUpdate?.({ editor: fake }));
    fireEvent.click(button("IPA"));
    expect(await screen.findByLabelText("IPA 读音")).toHaveValue("");
  });

  it("does not apply while TipTap is still unavailable", () => {
    harness.editor = undefined;
    const onApply = vi.fn();
    render(
      <VoiceRichTextEditor
        open
        value={{ version: 2, text: "hello", annotations: [] }}
        onApply={onApply}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(button("应用"));
    expect(onApply).not.toHaveBeenCalled();
  });
});
