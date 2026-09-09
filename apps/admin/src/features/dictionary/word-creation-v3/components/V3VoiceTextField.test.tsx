import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EnglishTextV3, RichTextV3, TextLinkV3 } from "@tsz/types";
import { useState } from "react";
import type { AudioUploadAdapter } from "@tsz/voice-editor/types";

const state = vi.hoisted(() => ({
  flags: { VOICE_EDITOR: true, VOICE_PREVIEW: false, VOICE_AUDIO_UPLOAD: true },
  listVoices: vi.fn(),
  upload: vi.fn(),
  resolveUrl: vi.fn()
}));

vi.mock("@/lib/env", () => ({ env: state.flags }));
vi.mock("@/features/dictionary/voice-editor/dataSource", () => ({
  adminVoicePreviewAdapter: {
    listVoices: state.listVoices,
    synthesize: vi.fn()
  },
  voicePreviewIsMock: false,
  adminAudioUploadAdapter: {
    upload: (...args: Parameters<AudioUploadAdapter["upload"]>) =>
      state.upload(...args),
    resolveUrl: (...args: Parameters<AudioUploadAdapter["resolveUrl"]>) =>
      state.resolveUrl(...args)
  } satisfies AudioUploadAdapter
}));

import { V3VoiceTextField } from "./V3VoiceTextField";
import { V3LinkedEnglishTextField } from "./V3LinkedEnglishTextField";

const VALUE: RichTextV3 = { version: 2, text: "hello there", annotations: [] };

async function openAudioPanel() {
  fireEvent.click(screen.getByRole("button", { name: /^打开.*编辑器$/ }));
  // 编辑器是 lazy 代码块，整包并行跑时首次加载可能超过默认 1s
  await screen.findByRole(
    "toolbar",
    { name: "标注工具栏" },
    { timeout: 10_000 }
  );
  fireEvent.click(screen.getByRole("button", { name: "音频" }));
}

beforeEach(() => {
  state.flags.VOICE_EDITOR = true;
  state.flags.VOICE_PREVIEW = false;
  state.listVoices.mockResolvedValue([
    {
      id: "sonia",
      label: "Sonia",
      locale: "en-GB",
      gender: "female",
      styles: [],
      supportsRate: true,
      supportsPitch: false,
      isDefault: true
    }
  ]);
  state.flags.VOICE_AUDIO_UPLOAD = true;
  state.upload.mockReset();
  state.resolveUrl.mockReset();
});

describe("V3VoiceTextField 上传音频", () => {
  it("后端仅支持语法结构音频时，正文关联模式不开放上传", async () => {
    render(
      <V3VoiceTextField
        mode="association"
        ariaLabel="英文例句"
        field="value"
        nodeId="example"
        value={VALUE}
        onChange={vi.fn()}
        onAudioAssetsChange={vi.fn()}
      />
    );
    await openAudioPanel();
    expect(screen.getByRole("button", { name: "选择音频文件" })).toBeDisabled();
    expect(state.upload).not.toHaveBeenCalled();
  });
  it("开关开着时注入适配器：上传成功后把资产原样（wire 形状）抛到 audio_assets", async () => {
    state.upload.mockImplementation(async ({ file, locale, gender }) => ({
      id: "asset-1",
      locale,
      gender,
      content_type: file.type,
      size_bytes: file.size,
      duration_ms: null,
      original_name: file.name,
      created_at: "2026-09-06T00:00:00Z"
    }));
    const onAudioAssetsChange = vi.fn();
    render(
      <V3VoiceTextField
        ariaLabel="语法结构 1 通用内容"
        field="content"
        nodeId="variant-1"
        onChange={vi.fn()}
        onAudioAssetsChange={onAudioAssetsChange}
        value={VALUE}
      />
    );
    await openAudioPanel();
    fireEvent.change(screen.getByLabelText("上传音频"), {
      target: {
        files: [new File([new Uint8Array(3)], "a.mp3", { type: "audio/mpeg" })]
      }
    });
    await waitFor(() => expect(onAudioAssetsChange).toHaveBeenCalledTimes(1));
    expect(onAudioAssetsChange).toHaveBeenCalledWith([
      {
        id: "asset-1",
        locale: "en-GB",
        gender: "female",
        content_type: "audio/mpeg",
        size_bytes: 3,
        duration_ms: null,
        original_name: "a.mp3",
        created_at: "2026-09-06T00:00:00Z"
      }
    ]);
  });

  it("已有的 audio_assets 原样列出来；开关关着时面板置灰但列表仍在", async () => {
    state.flags.VOICE_AUDIO_UPLOAD = false;
    render(
      <V3VoiceTextField
        ariaLabel="语法结构 1 通用内容"
        field="content"
        nodeId="variant-1"
        onChange={vi.fn()}
        audioAssets={[
          {
            id: "asset-9",
            locale: "en-US",
            gender: "male",
            content_type: "audio/mpeg",
            size_bytes: 3,
            original_name: "old.mp3",
            created_at: "2026-09-06T00:00:00Z"
          }
        ]}
        value={VALUE}
      />
    );
    await openAudioPanel();
    expect(screen.getByLabelText("试听 old.mp3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择音频文件" })).toBeDisabled();
    expect(screen.getByText("音频上传未启用")).toBeInTheDocument();
  });
});

it("降级文本框在插入文本后平移原标注和关联", () => {
  state.flags.VOICE_EDITOR = false;
  const onChange = vi.fn();
  render(
    <V3VoiceTextField
      mode="association"
      ariaLabel="例句正文"
      field="value"
      nodeId="v"
      onChange={onChange}
      value={{
        version: 2,
        text: "hello there",
        annotations: [{ type: "emphasis", start: 6, end: 11, level: "core" }]
      }}
      textLinks={[
        {
          id: "link",
          source_segments: [{ start: 6, end: 11, surface: "there" }],
          target_word_id: "w",
          target_publication_id: "p",
          target_pos_id: "pos",
          target_base_form_id: "b",
          target_form_id: "f",
          target_variant_id: "v",
          target_sense_id: "s"
        }
      ]}
    />
  );
  fireEvent.change(screen.getByLabelText("例句正文"), {
    target: { value: "oh hello there" }
  });
  expect(onChange.mock.lastCall![0].annotations).toEqual([
    { type: "emphasis", start: 9, end: 14, level: "core" }
  ]);
  expect(onChange.mock.lastCall![1][0].source_segments).toEqual([
    { start: 9, end: 14, surface: "there" }
  ]);
});

it("正文在外部输入框编辑，内部只做标注；多行正文、关联和设置往返不丢失", async () => {
  state.flags.VOICE_PREVIEW = true;
  const observe = vi.fn();
  function Host() {
    const [value, setValue] = useState<RichTextV3>({
      version: 2,
      text: "hello\nthere",
      annotations: [{ type: "emphasis", start: 6, end: 11, level: "core" }]
    });
    const [links, setLinks] = useState<TextLinkV3[]>([
      {
        id: "link",
        source_segments: [{ start: 6, end: 11, surface: "there" }],
        target_word_id: "w",
        target_publication_id: "p",
        target_pos_id: "pos",
        target_base_form_id: "b",
        target_form_id: "f",
        target_variant_id: "v",
        target_sense_id: "s"
      }
    ]);
    return (
      <V3VoiceTextField
        mode="association"
        ariaLabel="英文例句"
        field="value"
        nodeId="example"
        value={value}
        textLinks={links}
        voiceProfile={{
          voices: [{ voice_id: "sonia", enabled: false, rate_percent: 25 }]
        }}
        onChange={(next, nextLinks) => {
          setValue(next);
          setLinks(nextLinks ?? []);
          observe(next, nextLinks);
        }}
      />
    );
  }
  render(<Host />);
  expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  expect(screen.getByLabelText("英文例句")).toHaveValue("hello\nthere");
  expect(observe).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("英文例句"), {
    target: { value: "oh hello\nthere" }
  });
  fireEvent.click(screen.getByLabelText("打开英文例句编辑器"));
  await screen.findByRole("toolbar", { name: "标注工具栏" });
  expect(
    screen.queryByRole("button", { name: "编辑文本" })
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("英文例句")).toHaveAttribute("readonly");
  fireEvent.change(screen.getByLabelText("英文例句"), {
    target: { value: "不会覆盖原文" }
  });
  fireEvent.click(screen.getByLabelText("完成英文例句编辑"));
  expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  expect(screen.getByLabelText("英文例句")).toHaveValue("oh hello\nthere");
  expect(screen.getByLabelText("英文例句")).not.toHaveAttribute("readonly");
  expect(screen.getByLabelText("英文例句")).toHaveAttribute(
    "data-v3-node-id",
    "example"
  );
  expect(observe.mock.lastCall?.[0].annotations).toEqual([
    { type: "emphasis", start: 9, end: 14, level: "core" }
  ]);
  expect(observe.mock.lastCall?.[1][0].source_segments).toEqual([
    { start: 9, end: 14, surface: "there" }
  ]);
  fireEvent.click(screen.getByLabelText("打开英文例句编辑器"));
  await screen.findByRole("toolbar", { name: "标注工具栏" });
  expect(screen.getByLabelText("英文例句")).toHaveValue("oh hello\nthere");
  fireEvent.click(screen.getByLabelText("发音"));
  expect(await screen.findByLabelText("设置 Sonia 的语速")).toHaveTextContent(
    "1.25×"
  );
  expect(document.querySelectorAll(".tsz-ve-letter.is-linked")).toHaveLength(5);
});

it("普通输入也同步迁移标注，关闭能力或只读时不能打开编辑器", () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <V3VoiceTextField
      value={VALUE}
      ariaLabel="语法"
      nodeId="v"
      field="content"
      onChange={onChange}
    />
  );
  fireEvent.change(screen.getByLabelText("语法"), {
    target: { value: "changed" }
  });
  expect(onChange.mock.lastCall?.[0].text).toBe("changed");
  rerender(
    <V3VoiceTextField
      value={VALUE}
      ariaLabel="语法"
      nodeId="v"
      field="content"
      onChange={onChange}
      readOnly
    />
  );
  expect(screen.getByLabelText("打开语法编辑器")).toBeDisabled();
  expect(screen.getByLabelText("语法")).toHaveAttribute("readonly");
  state.flags.VOICE_EDITOR = false;
  rerender(
    <V3VoiceTextField
      value={VALUE}
      ariaLabel="语法"
      nodeId="v"
      field="content"
      onChange={onChange}
    />
  );
  expect(screen.queryByLabelText("打开语法编辑器")).not.toBeInTheDocument();
});

it("正文为空时编辑器按钮置灰，敲进内容后才可点", () => {
  const onChange = vi.fn();
  const blank: RichTextV3 = { version: 2, text: "", annotations: [] };
  const { rerender } = render(
    <V3VoiceTextField
      value={blank}
      ariaLabel="语法"
      nodeId="v"
      field="content"
      onChange={onChange}
    />
  );
  // 空画布没有东西可标注
  expect(screen.getByLabelText("打开语法编辑器")).toBeDisabled();

  // 只有空白同样算空
  rerender(
    <V3VoiceTextField
      value={{ version: 2, text: "   ", annotations: [] }}
      ariaLabel="语法"
      nodeId="v"
      field="content"
      onChange={onChange}
    />
  );
  expect(screen.getByLabelText("打开语法编辑器")).toBeDisabled();

  rerender(
    <V3VoiceTextField
      value={VALUE}
      ariaLabel="语法"
      nodeId="v"
      field="content"
      onChange={onChange}
    />
  );
  expect(screen.getByLabelText("打开语法编辑器")).toBeEnabled();
});

it("外部改字移除关联后，撤销和重做同时恢复正文、标注与关联", async () => {
  const initial: RichTextV3 = {
    version: 2,
    text: "hello there",
    annotations: [{ type: "emphasis", start: 6, end: 11, level: "core" }]
  };
  const originalLinks: TextLinkV3[] = [
    {
      id: "link",
      source_segments: [{ start: 6, end: 11, surface: "there" }],
      target_word_id: "w",
      target_publication_id: "p",
      target_pos_id: "pos",
      target_base_form_id: "b",
      target_form_id: "f",
      target_variant_id: "v",
      target_sense_id: "s"
    }
  ];
  const observe = vi.fn();
  function Host() {
    const [value, setValue] = useState(initial);
    const [links, setLinks] = useState(originalLinks);
    return (
      <V3VoiceTextField
        mode="association"
        ariaLabel="正文撤销"
        nodeId="v"
        field="value"
        value={value}
        textLinks={links}
        onChange={(next, nextLinks) => {
          setValue(next);
          setLinks(nextLinks ?? []);
          observe(next, nextLinks);
        }}
      />
    );
  }
  render(<Host />);
  fireEvent.change(screen.getByLabelText("正文撤销"), {
    target: { value: "hello friend" }
  });
  expect(observe.mock.lastCall![1]).toEqual([]);
  expect(
    await screen.findByText("已移除受改字影响的关联或标注，可撤销恢复")
  ).toBeInTheDocument();
  fireEvent.keyDown(screen.getByLabelText("正文撤销"), {
    key: "z",
    metaKey: true
  });
  expect(observe.mock.lastCall).toEqual([initial, originalLinks]);
  fireEvent.keyDown(screen.getByLabelText("正文撤销"), {
    key: "z",
    metaKey: true,
    shiftKey: true
  });
  expect(observe.mock.lastCall![0].text).toBe("hello friend");
  expect(observe.mock.lastCall![1]).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "打开正文撤销编辑器" }));
  await screen.findByRole(
    "toolbar",
    { name: "标注工具栏" },
    { timeout: 10000 }
  );
  fireEvent.click(screen.getByRole("button", { name: "完成正文撤销编辑" }));
  fireEvent.keyDown(screen.getByLabelText("正文撤销"), {
    key: "z",
    ctrlKey: true
  });
  expect(observe.mock.lastCall).toEqual([initial, originalLinks]);
});

it("旧版正文改字后的撤销保留旧标注，并可继续重做", () => {
  const observe = vi.fn();
  function Host() {
    const [value, setValue] = useState<RichTextV3>({
      version: 1,
      text: "hello",
      spans: [{ type: "bold", start: 0, end: 5 }],
      liaisons: []
    });
    return (
      <V3VoiceTextField
        ariaLabel="旧版正文"
        nodeId="old"
        field="value"
        value={value}
        onChange={(next) => {
          setValue(next);
          observe(next);
        }}
      />
    );
  }
  render(<Host />);
  fireEvent.change(screen.getByLabelText("旧版正文"), {
    target: { value: "goodbye" }
  });
  fireEvent.keyDown(screen.getByLabelText("旧版正文"), {
    key: "z",
    ctrlKey: true
  });
  expect(observe.mock.lastCall![0]).toMatchObject({
    version: 2,
    text: "hello",
    annotations: [
      expect.objectContaining({ type: "emphasis", start: 0, end: 5 })
    ]
  });
  fireEvent.keyDown(screen.getByLabelText("旧版正文"), {
    key: "y",
    ctrlKey: true
  });
  expect(observe.mock.lastCall![0].text).toBe("goodbye");
});

it.each([false, true])(
  "真实英文宿主无初始关联时可撤销重做，能力开关=%s",
  (linksEnabled) => {
    const observe = vi.fn();
    function Host() {
      const [value, setValue] = useState<EnglishTextV3>({
        mode: "unified",
        common: {
          id: "v",
          origin: "manual",
          value: { version: 2, text: "hello", annotations: [] }
        }
      });
      return (
        <V3LinkedEnglishTextField
          value={value}
          label="英文"
          suffix=""
          linksEnabled={linksEnabled}
          onChange={(next) => {
            setValue(next);
            observe(next);
          }}
        />
      );
    }
    render(<Host />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "hello there" }
    });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "z", ctrlKey: true });
    expect(screen.getByRole("textbox")).toHaveValue("hello");
    const variant = observe.mock.lastCall![0].common;
    // 关闭能力时仍省略 wire 字段；支持关联时，恢复空关联须明确发送 []，不能让后端保留旧关联。
    if (linksEnabled) expect(variant.text_links).toEqual([]);
    else expect(variant).not.toHaveProperty("text_links");
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "y", ctrlKey: true });
    expect(screen.getByRole("textbox")).toHaveValue("hello there");
  }
);
