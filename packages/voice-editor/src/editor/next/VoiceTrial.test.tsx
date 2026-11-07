import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "@tsz/ui/admin/overlays";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { GrammarFormLinkV3, RichTextV2 } from "@tsz/types";
import { VoiceEditor } from "./VoiceEditor";

const capabilities = {
  supportsPhoneme: true,
  supportsPause: true,
  supportsSayAs: true,
  supportsSub: true
};
const link: GrammarFormLinkV3 = {
  id: "reading",
  source_segments: [],
  target_word_id: "word",
  target_pos_id: "verb",
  target_form_id: "base",
  target_variant_id: "uk",
  target_dialect: "uk"
};
function selectText(text: string) {
  const input = screen.getByRole("textbox", {
    name: "试听原文"
  }) as HTMLTextAreaElement;
  const offset = input.value.indexOf(text);
  input.setSelectionRange(offset, offset + text.length);
  fireEvent.select(input);
}
function mount(value: RichTextV2, caps = capabilities) {
  const observe = vi.fn();
  const readiness = vi.fn();
  function Host() {
    const [content, setContent] = useState(value);
    const [links, setLinks] = useState<GrammarFormLinkV3[]>([]);
    return (
      <VoiceEditor
        mode="voice-trial"
        contextLabel="试听原文"
        value={content}
        readingLinks={links}
        speechCapabilities={caps}
        onValidationChange={readiness}
        renderReadingPicker={({ segments, onSelect }) => (
          <button
            onClick={() => onSelect({ ...link, source_segments: segments })}
          >
            采用关联读法
          </button>
        )}
        onChange={(next, _, nextLinks) => {
          observe(next, nextLinks);
          setContent(next);
          setLinks(nextLinks ?? []);
        }}
      />
    );
  }
  render(
    <App>
      <Host />
    </App>
  );
  return { observe, readiness };
}

describe("固定音色试听编辑器", () => {
  it("指定音标使用码点区间，同一选区替换读法，清空与撤销保留正确标注", async () => {
    const { observe } = mount({
      version: 2,
      text: "🙂 record 123",
      annotations: []
    });
    expect(observe).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "发音" })).toBeNull();
    expect(screen.queryByRole("button", { name: "音频" })).toBeNull();
    selectText("record");
    fireEvent.click(screen.getByRole("button", { name: "输入音标" }));
    fireEvent.change(screen.getByLabelText("指定音标"), {
      target: { value: "rɪˈkɔːd" }
    });
    fireEvent.click(screen.getByRole("button", { name: "应用音标" }));
    await waitFor(() =>
      expect(observe.mock.lastCall?.[0].annotations).toEqual([
        {
          type: "phoneme",
          start: 2,
          end: 8,
          alphabet: "ipa",
          phoneme: "rɪˈkɔːd"
        }
      ])
    );
    selectText("record");
    fireEvent.click(screen.getByRole("button", { name: "特殊读法" }));
    fireEvent.click(screen.getByRole("button", { name: "应用特殊读法" }));
    await waitFor(() =>
      expect(observe.mock.lastCall?.[0].annotations).toEqual([
        { type: "say_as", start: 2, end: 8, interpret_as: "characters" }
      ])
    );
    fireEvent.click(screen.getByRole("button", { name: "清空标注" }));
    await waitFor(() =>
      expect(observe.mock.lastCall?.[0].annotations).toEqual([])
    );
    fireEvent.click(screen.getByRole("button", { name: "上一步" }));
    await waitFor(() =>
      expect(observe.mock.lastCall?.[0].annotations[0].type).toBe("say_as")
    );
  });

  it("关联单词与直接音标在各自选区共存，覆盖同一选区时清除原读法", async () => {
    const { observe } = mount({
      version: 2,
      text: "record again",
      annotations: [
        {
          type: "phoneme",
          start: 7,
          end: 12,
          alphabet: "ipa",
          phoneme: "əˈɡen"
        }
      ]
    });
    selectText("record");
    fireEvent.click(screen.getByRole("button", { name: "关联单词读法" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "采用关联读法" })
    );
    await waitFor(() =>
      expect(observe.mock.lastCall?.[1]?.[0]?.source_segments).toEqual([
        { start: 0, end: 6, surface: "record" }
      ])
    );
    expect(observe.mock.lastCall?.[0].annotations).toHaveLength(1);
    selectText("record");
    fireEvent.click(screen.getByRole("button", { name: "输入音标" }));
    fireEvent.change(screen.getByLabelText("指定音标"), {
      target: { value: "rɪˈkɔːd" }
    });
    fireEvent.click(screen.getByRole("button", { name: "应用音标" }));
    await waitFor(() => expect(observe.mock.lastCall?.[1]).toEqual([]));
    expect(observe.mock.lastCall?.[0].annotations).toHaveLength(2);
    selectText("record");
    fireEvent.click(screen.getByRole("button", { name: "关联单词读法" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "采用关联读法" })
    );
    await waitFor(() => expect(observe.mock.lastCall?.[1]).toHaveLength(1));
    expect(observe.mock.lastCall?.[0].annotations).toEqual([
      { type: "phoneme", start: 7, end: 12, alphabet: "ipa", phoneme: "əˈɡen" }
    ]);
    fireEvent.click(screen.getByRole("button", { name: "清空标注" }));
    await waitFor(() => expect(observe.mock.lastCall?.[1]).toEqual([]));
    expect(observe.mock.lastCall?.[0].annotations).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "上一步" }));
    await waitFor(() => expect(observe.mock.lastCall?.[1]).toHaveLength(1));
    expect(observe.mock.lastCall?.[0].annotations).toHaveLength(1);
  });

  it("不支持的工具禁用，已有标注保留并阻止完成，可清空后恢复", async () => {
    const { observe, readiness } = mount(
      {
        version: 2,
        text: "record again",
        annotations: [
          {
            type: "phoneme",
            start: 0,
            end: 6,
            alphabet: "ipa",
            phoneme: "rɪˈkɔːd"
          }
        ]
      },
      {
        supportsPhoneme: false,
        supportsPause: false,
        supportsSayAs: false,
        supportsSub: false
      }
    );
    selectText("record");
    for (const name of ["输入音标", "关联单词读法", "特殊读法", "停顿"])
      expect(screen.getByRole("button", { name })).toBeDisabled();
    expect(readiness).toHaveBeenLastCalledWith(false);
    expect(observe).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "清空标注" }));
    await waitFor(() => expect(readiness).toHaveBeenLastCalledWith(true));
    expect(observe.mock.lastCall?.[0].annotations).toEqual([]);
  });
});
