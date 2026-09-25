import { PronunciationPreviewProvider } from "../../word-creation/PronunciationPreview";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor
} from "@testing-library/react";
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

const render = (
  ui: Parameters<typeof rtlRender>[0],
  options?: Parameters<typeof rtlRender>[1]
) => rtlRender(ui, { wrapper: PronunciationPreviewProvider, ...options });

const VALUE: RichTextV3 = { version: 2, text: "hello there", annotations: [] };

const fieldCss = readFileSync(
  resolve(
    process.cwd(),
    process.cwd().endsWith("/apps/admin")
      ? "src/features/dictionary/word-creation-v3/components/V3VoiceTextField.css"
      : "apps/admin/src/features/dictionary/word-creation-v3/components/V3VoiceTextField.css"
  ),
  "utf8"
);

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

describe("V3VoiceTextField 取消和收起态", () => {
  function Host() {
    const [value, setValue] = useState<RichTextV3>({
      version: 2,
      text: "hello there",
      annotations: [{ type: "pause", at: 5, duration_ms: 500 }]
    });
    return (
      <>
        <V3VoiceTextField
          mode="grammar"
          value={value}
          onChange={(next) => setValue(next as RichTextV3)}
          ariaLabel="测试语法"
          nodeId="cancel-test"
          field="content"
        />
        <output data-testid="cancel-value">{JSON.stringify(value)}</output>
      </>
    );
  }

  it("收起态隐藏停顿标签但不删除数据，编辑态仍可查看与调整", async () => {
    render(<Host />);
    expect(
      document.querySelector(".v3-grammar-preview-content")?.textContent
    ).not.toContain("500");
    expect(
      JSON.parse(screen.getByTestId("cancel-value").textContent!).annotations
    ).toHaveLength(1);
    fireEvent.click(screen.getByLabelText("打开测试语法编辑器"));
    expect(
      await screen.findByLabelText(
        "编辑第 1 处停顿 0.5 秒",
        {},
        { timeout: 10000 }
      )
    ).toBeInTheDocument();
  });

  it("取消恢复本次展开前的标注，完成保留本次修改，再次取消不回退前一会话", async () => {
    render(<Host />);
    const open = async () => {
      fireEvent.click(screen.getByLabelText("打开测试语法编辑器"));
      await screen.findByRole(
        "toolbar",
        { name: "标注工具栏" },
        { timeout: 10000 }
      );
    };
    await open();
    fireEvent.click(screen.getByLabelText("编辑第 1 处停顿 0.5 秒"));
    fireEvent.click(screen.getByLabelText("停顿 1 秒"));
    expect(
      JSON.parse(screen.getByTestId("cancel-value").textContent!).annotations[0]
        .duration_ms
    ).toBe(1000);
    fireEvent.click(screen.getByLabelText("取消测试语法编辑"));
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    expect(
      JSON.parse(screen.getByTestId("cancel-value").textContent!).annotations[0]
        .duration_ms
    ).toBe(500);
    await open();
    fireEvent.click(screen.getByLabelText("编辑第 1 处停顿 0.5 秒"));
    fireEvent.click(screen.getByLabelText("停顿 2 秒"));
    fireEvent.click(screen.getByLabelText("完成测试语法编辑"));
    await open();
    fireEvent.click(screen.getByLabelText("编辑第 1 处停顿 2 秒"));
    fireEvent.click(screen.getByRole("button", { name: "移除停顿" }));
    fireEvent.click(screen.getByLabelText("取消测试语法编辑"));
    expect(
      JSON.parse(screen.getByTestId("cancel-value").textContent!).annotations[0]
        .duration_ms
    ).toBe(2000);
  });
});

describe("V3VoiceTextField 语种筛选", () => {
  async function openVoicePanel() {
    fireEvent.click(screen.getByRole("button", { name: /^打开.*编辑器$/ }));
    await screen.findByRole(
      "toolbar",
      { name: "标注工具栏" },
      { timeout: 10_000 }
    );
    fireEvent.click(screen.getByRole("button", { name: /发音/ }));
  }

  // uk 必须落 en-GB、us 必须落 en-US：映射写反了不会报错，只会静默上线。
  it("英式栏只留 BrE 音色，美式栏筛掉它", async () => {
    state.flags.VOICE_PREVIEW = true;
    const { unmount } = render(
      <V3VoiceTextField
        mode="dict-phonetic"
        dialect="uk"
        ariaLabel="字典音标"
        field="dict_phonetic"
        nodeId="pronunciation"
        value={VALUE}
        onChange={vi.fn()}
      />
    );
    await openVoicePanel();
    await waitFor(() => expect(screen.getByText("Sonia")).toBeInTheDocument());
    unmount();

    render(
      <V3VoiceTextField
        mode="dict-phonetic"
        dialect="us"
        ariaLabel="字典音标"
        field="dict_phonetic"
        nodeId="pronunciation"
        value={VALUE}
        onChange={vi.fn()}
      />
    );
    await openVoicePanel();
    await waitFor(() =>
      expect(document.querySelector(".tsz-ve-speech-panel")).not.toBeNull()
    );
    expect(screen.queryByText("Sonia")).toBeNull();
  });
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

it("页面只读、弹窗编辑；多行正文、关联和设置往返不丢失", async () => {
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
  expect(screen.getByLabelText("英文例句")).toHaveAttribute("readonly");
  fireEvent.click(screen.getByLabelText("打开英文例句编辑器"));
  await screen.findByRole("toolbar", { name: "标注工具栏" });
  expect(screen.getByRole("button", { name: "编辑文本" })).toBeInTheDocument();
  expect(screen.getByLabelText("英文例句")).not.toHaveAttribute("readonly");
  fireEvent.change(screen.getByLabelText("英文例句"), {
    target: { value: "oh hello\nthere" }
  });
  fireEvent.click(screen.getByLabelText("完成英文例句编辑"));
  expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  expect(screen.getByLabelText("英文例句")).toHaveValue("oh hello\nthere");
  expect(screen.getByLabelText("英文例句")).toHaveAttribute("readonly");
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

it("普通首次输入可保存，关闭能力或只读时不能打开编辑器", () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <V3VoiceTextField
      value={{ version: 2, text: "", annotations: [] }}
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

it("正文为空或仅空白也能打开编辑器进行首次录入", () => {
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
  expect(screen.getByLabelText("打开语法编辑器")).toBeEnabled();

  // 只有空白同样可以录入。
  rerender(
    <V3VoiceTextField
      value={{ version: 2, text: "   ", annotations: [] }}
      ariaLabel="语法"
      nodeId="v"
      field="content"
      onChange={onChange}
    />
  );
  expect(screen.getByLabelText("打开语法编辑器")).toBeEnabled();

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
  expect(screen.getByLabelText("正文撤销")).toHaveAttribute("readonly");
  fireEvent.click(screen.getByLabelText("打开正文撤销编辑器"));
  await screen.findByRole(
    "toolbar",
    { name: "标注工具栏" },
    { timeout: 10000 }
  );
  fireEvent.change(screen.getByLabelText("正文撤销"), {
    target: { value: "hello friend" }
  });
  expect(observe).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "保留原文" }));
  expect(screen.getByLabelText("正文撤销")).toHaveValue("hello there");
  fireEvent.change(screen.getByLabelText("正文撤销"), {
    target: { value: "hello friend" }
  });
  fireEvent.click(screen.getByRole("button", { name: "确认修改" }));
  expect(observe.mock.lastCall![1]).toEqual([]);
  fireEvent.click(screen.getByLabelText("上一步"));
  expect(observe.mock.lastCall).toEqual([initial, originalLinks]);
  fireEvent.click(screen.getByLabelText("下一步"));
  expect(observe.mock.lastCall![0].text).toBe("hello friend");
  expect(observe.mock.lastCall![1]).toEqual([]);
  fireEvent.click(screen.getByLabelText("取消正文撤销编辑"));
  expect(observe.mock.lastCall).toEqual([initial, originalLinks]);
});

it("关闭编辑器能力时，旧版正文撤销保留标注并可重做", () => {
  state.flags.VOICE_EDITOR = false;
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
  async (linksEnabled) => {
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
    fireEvent.click(screen.getByRole("button", { name: /^打开.*编辑器$/ }));
    await screen.findByRole("toolbar", { name: "标注工具栏" });
    const input = document.querySelector<HTMLTextAreaElement>(
      ".tsz-ve-canvas-input"
    )!;
    fireEvent.change(input, { target: { value: "hello there" } });
    fireEvent.click(screen.getByLabelText("上一步"));
    expect(input).toHaveValue("hello");
    const variant = observe.mock.lastCall![0].common;
    // 关闭能力时仍省略 wire 字段；支持关联时，恢复空关联须明确发送 []，不能让后端保留旧关联。
    if (linksEnabled) expect(variant.text_links).toEqual([]);
    else expect(variant).not.toHaveProperty("text_links");
    fireEvent.click(screen.getByLabelText("下一步"));
    expect(input).toHaveValue("hello there");
  }
);

const LIAISON_TEXT: RichTextV3 = {
  version: 2,
  text: "pick it up",
  annotations: [{ type: "liaison", start: 3, end: 6 }]
};

// 编辑器里怎么连，收起后就怎么显示：实际发音、语法结构、英文正文（释义）三类字段都叠。
it.each([
  [undefined, "默认语音字段"],
  ["pronunciation", "通用发音"],
  ["actual-pron", "实际发音"],
  ["grammar", "语法结构 1 英美通用内容"],
  ["association", "定义 1 英美通用内容"]
] as const)(
  "%s 收起态输入框上标出连读两端；改字去掉连读后弧线层撤掉，输入框仍是同一个节点",
  async (mode, label) => {
    function Harness() {
      const [value, setValue] = useState<RichTextV3>(LIAISON_TEXT);
      return (
        <V3VoiceTextField
          mode={mode}
          ariaLabel={label}
          field="content"
          nodeId="p"
          value={value}
          onChange={(next) => setValue(next)}
        />
      );
    }
    const { container } = render(<Harness />);
    const anchors = () =>
      Array.from(container.querySelectorAll(".tsz-ve-liaison-anchor")).map(
        (node) => [node.getAttribute("data-end"), node.textContent]
      );
    const input = screen.getByLabelText(label);
    expect(input.tagName).toBe("TEXTAREA");
    if (mode === "actual-pron") {
      expect(input).toHaveClass("v3-voice-text-large-preview");
      expect(input).not.toHaveClass("tsz-entry-en");
    }
    expect((input as HTMLTextAreaElement).style.paddingTop).toBe(
      mode === "grammar" ? "calc(0.5em + 4px)" : "1em"
    );
    expect(input).toHaveAttribute("data-v3-field", "content");
    expect(anchors()).toEqual([
      ["start", "k"],
      ["end", "i"]
    ]);

    fireEvent.click(screen.getByLabelText(`打开${label}编辑器`));
    await screen.findByRole("toolbar", { name: "标注工具栏" });
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: "pic it up" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认修改" }));
    fireEvent.click(screen.getByLabelText(`完成${label}编辑`));
    expect(anchors()).toEqual([]);
    expect(
      container.querySelector(".v3-voice-text-liaison-overlay")
    ).toBeNull();
    expect(screen.getByLabelText(label)).toBe(input);
    expect((input as HTMLTextAreaElement).style.paddingTop).toBe("");
  }
);

it("grammar 未聚焦展示颜色粗体和连读，聚焦改字、撤销后失焦恢复且不重挂输入框", () => {
  const initial: RichTextV3 = {
    ...LIAISON_TEXT,
    version: 2,
    annotations: [
      ...LIAISON_TEXT.annotations,
      { type: "emphasis", start: 0, end: 4, level: "core" }
    ]
  };
  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <V3VoiceTextField
        mode="grammar"
        ariaLabel="语法正文"
        nodeId="g"
        field="content"
        value={value}
        onChange={setValue}
        invalid
      />
    );
  }
  const { container } = render(<Harness />);
  const input = screen.getByLabelText("语法正文");
  const emphasis = () =>
    Array.from(container.querySelectorAll('strong[data-level="core"]'))
      .map((node) => node.textContent)
      .join("");
  expect(emphasis()).toBe("pick");
  expect(container.querySelector(".tsz-ve-liaison-anchor")).not.toBeNull();
  expect(input).toHaveAttribute("aria-invalid", "true");
  fireEvent.focus(input);
  expect(emphasis()).toBe("");
  fireEvent.change(input, { target: { value: "pic it up" } });
  fireEvent.keyDown(input, { key: "z", ctrlKey: true });
  expect(input).toHaveValue("pick it up");
  fireEvent.blur(input);
  expect(emphasis()).toBe("pick");
  expect(screen.getByLabelText("语法正文")).toBe(input);
});

it.each([true, false])("grammar 只读和空值兼容语音开关=%s", (enabled) => {
  state.flags.VOICE_EDITOR = enabled;
  const onChange = vi.fn();
  const props = {
    mode: "grammar" as const,
    ariaLabel: "语法",
    nodeId: "g",
    field: "content",
    onChange
  };
  const { container, rerender } = render(
    <V3VoiceTextField {...props} value={LIAISON_TEXT} readOnly />
  );
  const input = screen.getByLabelText("语法");
  expect(container.querySelector(".tsz-ve-liaison-anchor")).not.toBeNull();
  expect(input).toHaveAttribute("readonly");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "changed" } });
  expect(onChange).not.toHaveBeenCalled();
  rerender(
    <V3VoiceTextField
      {...props}
      value={{ version: 2, text: "", annotations: [] }}
    />
  );
  fireEvent.blur(input);
  expect(container.querySelector(".v3-grammar-preview-content")).toBeNull();
  fireEvent.change(input, { target: { value: "new grammar" } });
  expect(onChange).toHaveBeenCalledWith(
    { version: 2, text: "new grammar", annotations: [] },
    undefined
  );
});

it("grammar 富文本位于紧凑组背景上方，透明输入框覆盖长预览以承接尾行点击", () => {
  // jsdom 不做布局；对应的长文本尾行点击和可见性另用 Chromium 验证。
  expect(fieldCss).toMatch(
    /\.v3-grammar-preview-content\s*\{[^}]*z-index:\s*5;/su
  );
  expect(fieldCss).toMatch(
    /\.v3-grammar-preview\s*>\s*textarea\.ant-input\s*\{[^}]*height:\s*100%\s*!important;[^}]*max-height:\s*none\s*!important;/su
  );
});

it("字典音标收起态不叠弧线层", () => {
  const { container } = render(
    <V3VoiceTextField
      mode="dict-phonetic"
      ariaLabel="字典音标"
      field="dict_phonetic"
      nodeId="d"
      value={LIAISON_TEXT}
      onChange={vi.fn()}
    />
  );
  expect(screen.getByLabelText("字典音标").tagName).toBe("TEXTAREA");
  expect(container.querySelector(".v3-voice-text-liaison-overlay")).toBeNull();
  expect(container.querySelector(".tsz-ve-liaison-anchor")).toBeNull();
});

// Ubuntu 缺 ə ʌ ɪ 等音标字形：录词条英文的字段用 Ubuntu，两种音标字段不能用。
// 类挂在外层包裹上也会经 globals.css 的后代选择器传到 textarea，所以查整条祖先链。
it.each([
  ["association", true],
  ["grammar", true],
  ["dict-phonetic", false],
  ["actual-pron", false]
] as const)("%s 收起态输入框使用词条英文字体：%s", (mode, english) => {
  render(
    <V3VoiceTextField
      mode={mode}
      ariaLabel="内容"
      field="content"
      nodeId="f"
      value={VALUE}
      onChange={vi.fn()}
    />
  );
  const input = screen.getByLabelText("内容");
  expect(input.tagName).toBe("TEXTAREA");
  expect(input.closest(".tsz-entry-en") !== null).toBe(english);
});

it("弧线层内层扣掉输入框滚动条宽度，并随输入框滚动和尺寸变化跟进", () => {
  let resizeInput: (() => void) | undefined;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        // 只接住第一个观察输入框的，即弧线层在布局副作用里建的那个；antd 自适应高度的共享观察器
        // 在被动副作用里才观察输入框，单独跑本用例时由桩创建，不能让它覆盖掉。
        if (target instanceof HTMLTextAreaElement && !resizeInput)
          resizeInput = () =>
            this.callback([], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    }
  );
  try {
    const { container } = render(
      <V3VoiceTextField
        mode="association"
        ariaLabel="英文例句"
        field="value"
        nodeId="s"
        value={LIAISON_TEXT}
        onChange={vi.fn()}
      />
    );
    const input = screen.getByLabelText("英文例句");
    const content = container.querySelector<HTMLElement>(
      ".v3-voice-text-liaison-content"
    );
    expect(content).not.toBeNull();
    // 宽度不能写死成取整的 clientWidth：内层自动撑满，只用右外边距扣滚动条。
    expect(content!.style.width).toBe("");
    const style = getComputedStyle(input);
    const borders =
      (Number.parseFloat(style.borderLeftWidth) || 0) +
      (Number.parseFloat(style.borderRightWidth) || 0);
    const define = (key: string, value: number) =>
      Object.defineProperty(input, key, { configurable: true, value });

    // jsdom 不做布局：直接给出输入框出现 15px 滚动条、往下滚两行之后的读数。
    define("clientWidth", 184);
    define("offsetWidth", 184 + 15 + borders);
    define("scrollTop", 44);
    fireEvent.scroll(input);
    expect(content!.style.marginRight).toBe("15px");
    expect(content!.style.transform).toBe("translateY(-44px)");

    // 删短内容后滚动条消失、scrollTop 归零，只保证有尺寸变化回调。
    define("offsetWidth", 184 + borders);
    define("scrollTop", 0);
    expect(resizeInput).toBeDefined();
    resizeInput!();
    expect(content!.style.marginRight).toBe("0px");
    expect(content!.style.transform).toBe("translateY(0px)");
  } finally {
    vi.unstubAllGlobals();
  }
});

it("弧线层压在紧凑组员之上、点击穿透，并按输入框视口裁剪", () => {
  // jsdom 不做布局，层级、穿透和裁剪的回归单测拦不住，只能断言样式本身。
  const overlayRule =
    /\.v3-voice-text-liaison-overlay\s*\{([^}]*)\}/su.exec(fieldCss)?.[1] ?? "";
  expect(overlayRule).toMatch(/z-index:\s*5;/u);
  expect(overlayRule).toMatch(/pointer-events:\s*none;/u);
  expect(overlayRule).toMatch(/overflow:\s*hidden;/u);
  expect(overlayRule).toMatch(/color:\s*transparent;/u);
  expect(fieldCss).toMatch(
    /\.v3-voice-text-field-input\s*\{[^}]*margin-inline-end:\s*-1px;/su
  );
});
