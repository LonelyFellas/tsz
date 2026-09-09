import { VoicePanel } from "./ToolPanels";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RichTextV2 } from "@tsz/types";
import {
  AudioUploadError,
  type AudioAsset,
  type AudioUploadAdapter,
  type VoiceOption,
  type VoicePreviewAdapter,
  type VoicePreviewResult
} from "../../types";
import {
  DEFAULT_LIAISON_COLOR,
  getLiaisonColor,
  setLiaisonColor
} from "../../marks";
import { VoiceEditor } from "./VoiceEditor";

const TEXT = "a centre of the city";

const VOICES: VoiceOption[] = [
  {
    id: "sonia",
    label: "Sonia · 英式女声",
    locale: "en-GB",
    gender: "female",
    styles: [],
    supportsRate: true,
    supportsPitch: true,
    isDefault: true,
    rateRange: { min: -10, max: 10 }
  },
  {
    id: "guy",
    label: "Guy · 美式男声",
    locale: "en-US",
    gender: "male",
    styles: [],
    supportsRate: true,
    supportsPitch: false,
    isDefault: false
  }
];

class AudioMock {
  static instances: AudioMock[] = [];
  readonly play = vi.fn(() => Promise.resolve());
  readonly pause = vi.fn();
  readonly listeners = new Map<string, EventListener>();
  readonly addEventListener = vi.fn((type: string, listener: EventListener) => {
    this.listeners.set(type, listener);
  });
  constructor(public readonly src: string) {
    AudioMock.instances.push(this);
  }
  end() {
    this.listeners.get("ended")?.(new Event("ended"));
  }
}

function previewResult(): VoicePreviewResult {
  return {
    audioUrl: "blob:preview",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    cached: false
  };
}

function adapter(
  synthesize: VoicePreviewAdapter["synthesize"] = vi
    .fn()
    .mockResolvedValue(previewResult())
): VoicePreviewAdapter {
  return { listVoices: vi.fn().mockResolvedValue(VOICES), synthesize };
}

let assetSeq = 0;
function asset(overrides: Partial<AudioAsset> = {}): AudioAsset {
  assetSeq += 1;
  return {
    id: `asset-${assetSeq}`,
    locale: "en-GB",
    gender: "female",
    content_type: "audio/mpeg",
    size_bytes: 3,
    original_name: "a.mp3",
    created_at: "2026-09-06T00:00:00Z",
    ...overrides
  };
}

const mp3 = (name: string, size = 3) =>
  new File([new Uint8Array(size)], name, { type: "audio/mpeg" });

/** 上传适配器桩：默认直传一半时报一次进度，然后按传入的归属与文件名落成资产。 */
function audioAdapter(overrides: Partial<AudioUploadAdapter> = {}) {
  const upload = vi.fn(
    async ({
      file,
      locale,
      gender,
      onProgress
    }: Parameters<AudioUploadAdapter["upload"]>[0]) => {
      onProgress?.(0.5);
      return asset({ original_name: file.name, locale, gender });
    }
  );
  const resolveUrl = vi.fn(async (id: string) => ({
    url: `https://signed.example/${id}`,
    expiresAt: new Date(Date.now() + 300_000).toISOString()
  }));
  return { upload, resolveUrl, ...overrides } as AudioUploadAdapter & {
    upload: ReturnType<typeof vi.fn>;
    resolveUrl: ReturnType<typeof vi.fn>;
  };
}

function chooseFiles(files: File[]) {
  fireEvent.change(screen.getByLabelText("上传音频"), { target: { files } });
}

function props(overrides: Record<string, unknown> = {}) {
  return {
    mode: "grammar" as const,
    value: { version: 2, text: TEXT, annotations: [] } as RichTextV2,
    onChange: vi.fn(),
    ...overrides
  };
}

function button(label: string): HTMLButtonElement {
  const found = [
    ...document.querySelectorAll<HTMLButtonElement>("button")
  ].find(
    (candidate) =>
      candidate.getAttribute("aria-label") === label ||
      candidate.textContent?.replaceAll(/\s/g, "") ===
        label.replaceAll(/\s/g, "")
  );
  if (!found) throw new Error(`button not found: ${label}`);
  return found;
}

/** 标注带里的词按钮。 */
/** 标注带里的词；连读画笔下它是容器 span，其余画笔下是按钮。 */
function word(text: string): HTMLElement {
  const found = [
    ...document.querySelectorAll<HTMLElement>(".tsz-ve-token")
  ].find((candidate) => candidate.textContent === text);
  if (!found) throw new Error(`word not found: ${text}`);
  return found;
}

/** 一个词里的全部字母元素。 */
function wordLetters(text: string): HTMLElement[] {
  return [...word(text).querySelectorAll<HTMLElement>(".tsz-ve-letter")];
}

/** 一个词里字母们的语法结构分类（去重）；[] 表示没上色，多于一项表示词内混色。 */
function wordLevels(text: string): string[] {
  return [
    ...new Set(
      wordLetters(text).flatMap((letter) =>
        letter.dataset.level ? [letter.dataset.level] : []
      )
    )
  ];
}

/** 语法结构画笔下从一个字母拖到另一个字母松手，中间的字母一并上色。 */
function dragLetters(from: HTMLElement, to: HTMLElement) {
  fireEvent.mouseDown(from);
  if (to !== from) fireEvent.mouseEnter(to, { buttons: 1 });
  fireEvent.mouseUp(to);
}

/** 语法结构画笔下给整个词上色：从首字母拖到末字母。 */
function tapWord(text: string) {
  const letters = wordLetters(text);
  dragLetters(letters[0]!, letters[letters.length - 1]!);
}

/** 语法结构画笔下从一个词的首字母拖到另一个词的末字母，中间的词与空格一并上色。 */
function dragWords(...texts: string[]) {
  const last = wordLetters(texts[texts.length - 1]!);
  dragLetters(wordLetters(texts[0]!)[0]!, last[last.length - 1]!);
}

function gap(index: number): HTMLElement {
  const found = document.querySelectorAll<HTMLElement>(".tsz-ve-gap")[index];
  if (!found) throw new Error(`gap not found: ${index}`);
  return found;
}

/** 第 token 个词里的第 offset 个字母按钮（仅连读画笔下存在）。 */
function letter(token: number, offset: number): HTMLElement {
  const words = document.querySelectorAll(".tsz-ve-token");
  const found =
    words[token]?.querySelectorAll<HTMLElement>(".tsz-ve-letter")[offset];
  if (!found) throw new Error(`letter not found: ${token}:${offset}`);
  return found;
}

/**
 * 六个工具都收在浮层里：先点工具栏上的按钮开面板，再在面板里选具体选项。
 * 点开语法结构/连读/停顿的按钮同时就换上了那支笔。
 */
function openRoles() {
  fireEvent.click(document.querySelector(".tsz-ve-role-button")!);
}

function pickRole(label: string) {
  openRoles();
  fireEvent.click(button(`用${label}画笔`));
}

function useLiaisonBrush() {
  fireEvent.click(document.querySelector(".tsz-ve-liaison-button")!);
}

/** 连读面板上的「起点 / 终点」开关：接下来点的字母归这一端。 */
function chooseEnd(label: "起点" | "终点") {
  fireEvent.click(button(`选择${label}`));
}

/**
 * 音色收在工具栏「音色」工具的浮层里，取用前先点开。
 * 浮层渲染在 portal 且带入场动画，jsdom 算不出可见性，断言一律用
 * toBeInTheDocument 而不是 toBeVisible。
 */
function openTool(label: string) {
  const target = button(label);
  if (target.getAttribute("aria-expanded") !== "true") fireEvent.click(target);
}

function openVoices() {
  openTool("发音");
}

function usePauseBrush() {
  fireEvent.click(document.querySelector(".tsz-ve-pause-button")!);
}

function pickPause(label: string) {
  usePauseBrush();
  fireEvent.click(button(`用停顿画笔 ${label}`));
}

function applied(view: ReturnType<typeof props>): RichTextV2 {
  const calls = vi.mocked(view.onChange).mock.calls;
  return calls[calls.length - 1]![0] as RichTextV2;
}

beforeEach(() => {
  AudioMock.instances = [];
  vi.stubGlobal("Audio", AudioMock);
});

afterEach(() => {
  // vi.spyOn 对已监听的方法会复用同一个 spy，不还原的话调用记录会跨用例累积。
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("语法结构先选文本再选择分类，保持旧 wire 格式并支持撤销", () => {
  const view = props({ value: { version: 2, text: "a job", annotations: [] } });
  render(<VoiceEditor {...view} />);
  const input = screen.getByLabelText("语音编辑器") as HTMLTextAreaElement;
  input.setSelectionRange(2, 5);
  fireEvent.select(input);
  pickRole("固定核心词");
  expect(view.onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      annotations: [{ type: "emphasis", start: 2, end: 5, level: "core" }]
    })
  );
  expect(document.querySelector(".tsz-ve-canvas")).toHaveAttribute(
    "data-brush",
    "none"
  );
  input.setSelectionRange(2, 5);
  fireEvent.select(input);
  pickRole("词性提示符");
  expect(view.onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      annotations: [{ type: "emphasis", start: 2, end: 5, level: "grammar" }]
    })
  );
  fireEvent.click(screen.getByLabelText("上一步"));
  expect(view.onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      annotations: [{ type: "emphasis", start: 2, end: 5, level: "core" }]
    })
  );
});

it("选区按码点标注，修改正文后不会沿用旧选区", () => {
  const view = props({
    value: { version: 2, text: "😀 a job", annotations: [] }
  });
  render(<VoiceEditor {...view} />);
  const input = screen.getByLabelText("语音编辑器") as HTMLTextAreaElement;
  input.setSelectionRange(5, 8);
  fireEvent.select(input);
  pickRole("可替换搭配");
  expect(view.onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      annotations: [{ type: "emphasis", start: 4, end: 7, level: "function" }]
    })
  );
  fireEvent.change(input, { target: { value: "new text" } });
  const calls = view.onChange.mock.calls.length;
  pickRole("固定核心词");
  expect(view.onChange).toHaveBeenCalledTimes(calls);
});

it("先选两个词再打开连读，选区生成端点并在确认后保存", () => {
  const view = props({ value: { version: 2, text: "a job", annotations: [] } });
  render(<VoiceEditor {...view} />);
  const input = screen.getByLabelText("语音编辑器") as HTMLTextAreaElement;
  input.setSelectionRange(0, 5);
  fireEvent.select(input);
  useLiaisonBrush();
  expect(view.onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("添加连读"));
  expect(view.onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      annotations: [
        expect.objectContaining({ type: "liaison", start: 0, end: 5 })
      ]
    })
  );
});

describe("VoiceEditor 标注带", () => {
  it("把文本摊成可点的词，词缝比词少一个", () => {
    render(<VoiceEditor {...props()} />);
    expect(
      [...document.querySelectorAll(".tsz-ve-token")].map((n) => n.textContent)
    ).toEqual(["a", "centre", "of", "the", "city"]);
    expect(document.querySelectorAll(".tsz-ve-gap")).toHaveLength(4);
  });

  it("点词落标、再点同词取消、换画笔则替换", () => {
    const view = props();
    render(<VoiceEditor {...view} />);

    pickRole("固定核心词");
    tapWord("centre");
    expect(wordLevels("centre")).toEqual(["core"]);

    tapWord("centre");
    expect(wordLevels("centre")).not.toContain("core");

    tapWord("centre");
    pickRole("词性提示符");
    tapWord("centre");
    // 替换而非叠加：只剩后一个分类。
    expect(wordLevels("centre")).toEqual(["grammar"]);
    expect(wordLevels("centre")).not.toContain("core");
  });

  it("每支画笔只让自己的靶子可点", () => {
    render(<VoiceEditor {...props()} />);

    // 语法结构：认字母（粒度到字母，词只是容器）
    pickRole("固定核心词");
    expect(letter(0, 0)).toHaveAttribute("aria-disabled", "false");
    expect(gap(0)).toHaveAttribute("aria-disabled", "true");

    // 连读：同样认字母
    useLiaisonBrush();
    expect(word("a").tagName).toBe("SPAN");
    expect(letter(0, 0)).toHaveAttribute("aria-disabled", "false");
    expect(gap(0)).toHaveAttribute("aria-disabled", "true");

    // 停顿：认词缝，字母不可点
    usePauseBrush();
    expect(gap(0)).toHaveAttribute("aria-disabled", "false");
    expect(letter(0, 0)).toHaveAttribute("aria-disabled", "true");
  });

  it("连读两段选：起点一个词、终点另一个词，确认后成线", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    useLiaisonBrush();

    fireEvent.mouseDown(letter(1, 5)); // centre 的 e
    expect(letter(1, 5)).toHaveClass("is-anchor-start");
    // 两端未齐前不能确认
    expect(button("添加连读")).toBeDisabled();

    chooseEnd("终点");
    fireEvent.mouseDown(letter(2, 0)); // of 的 o
    expect(letter(2, 0)).toHaveClass("is-anchor-end");
    expect(button("添加连读")).toBeEnabled();

    fireEvent.click(button("添加连读"));

    expect(applied(view).annotations).toEqual([
      {
        type: "liaison",
        start: 7,
        end: 10,
        start_len: 1,
        end_len: 1
      }
    ]);
  });

  it("两端都能扩成多字母锚点，并在工具栏按单词回显", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    useLiaisonBrush();

    // 起点：centre 的 "re"
    fireEvent.mouseDown(letter(1, 4));
    fireEvent.mouseDown(letter(1, 5));
    expect(letter(1, 4)).toHaveClass("is-anchor-start");
    expect(letter(1, 5)).toHaveClass("is-anchor-start");

    // 终点：of 的 "of"
    chooseEnd("终点");
    fireEvent.mouseDown(letter(2, 0));
    fireEvent.mouseDown(letter(2, 1));
    expect(letter(2, 1)).toHaveClass("is-anchor-end");

    // 锚点回显已并入工具栏，不再是标注带下方的独立一行
    const slots = [...document.querySelectorAll(".tsz-ve-anchor-slot")].map(
      (slot) => slot.textContent
    );
    expect(slots[0]).toContain("centre");
    expect(slots[0]).toContain("re");
    expect(slots[1]).toContain("of");

    fireEvent.click(button("添加连读"));
    // 两端各自的宽度也存得下：起点 "re"、终点 "of" 各占 2 个码点。
    expect(applied(view).annotations).toEqual([
      { type: "liaison", start: 6, end: 11, start_len: 2, end_len: 2 }
    ]);
  });

  it("点不相邻的字母会重开锚点，而不是选出一段断开的选区", () => {
    render(<VoiceEditor {...props()} />);
    useLiaisonBrush();

    fireEvent.mouseDown(letter(1, 0));
    fireEvent.mouseDown(letter(1, 3)); // 跳开的字母
    expect(letter(1, 0)).not.toHaveClass("is-anchor-start");
    expect(letter(1, 3)).toHaveClass("is-anchor-start");
  });

  it("同一个词里点第二下只是改起点，不会被当成终点", () => {
    render(<VoiceEditor {...props()} />);
    useLiaisonBrush();

    fireEvent.mouseDown(letter(1, 0));
    fireEvent.mouseDown(letter(1, 1));
    expect(document.querySelectorAll(".is-anchor-end")).toHaveLength(0);
    expect(button("添加连读")).toBeDisabled();
  });

  it.each([false, true])(
    "同词 part-time 的两个 t 可以连接并保存回显，反向选择=%s",
    (reverse) => {
      const view = props({
        value: { version: 2, text: "part-time", annotations: [] }
      });
      const mounted = render(<VoiceEditor {...view} />);
      useLiaisonBrush();
      fireEvent.mouseDown(letter(0, reverse ? 5 : 3));
      chooseEnd("终点");
      fireEvent.mouseDown(letter(0, reverse ? 3 : 5));
      expect(button("添加连读")).toBeEnabled();
      fireEvent.click(button("添加连读"));
      const saved = view.onChange.mock.calls.at(-1)![0];
      expect(saved.annotations).toEqual([
        { type: "liaison", start: 3, end: 6, start_len: 1, end_len: 1 }
      ]);
      mounted.unmount();
      render(<VoiceEditor {...props({ value: saved })} />);
      useLiaisonBrush();
      fireEvent.mouseDown(letter(0, 3));
      chooseEnd("终点");
      fireEvent.mouseDown(letter(0, 5));
      fireEvent.click(button("添加连读"));
      expect(screen.getByText("这两处已经连过了")).toBeInTheDocument();
    }
  );

  it("端别由面板开关手选，不按点击先后推断：先定终点再回头选起点也行", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    useLiaisonBrush();
    expect(button("选择起点")).toHaveAttribute("aria-pressed", "true");

    // 点到另一个词也不会被当成终点：开关还在「起点」上，只是换了起点
    fireEvent.mouseDown(letter(1, 5));
    fireEvent.mouseDown(letter(2, 0));
    expect(letter(2, 0)).toHaveClass("is-anchor-start");
    expect(document.querySelectorAll(".is-anchor-end")).toHaveLength(0);

    chooseEnd("终点");
    expect(button("选择终点")).toHaveAttribute("aria-pressed", "true");
    fireEvent.mouseDown(letter(3, 0)); // the 的 t
    expect(letter(3, 0)).toHaveClass("is-anchor-end");

    // 回头改起点，终点原样保留
    chooseEnd("起点");
    fireEvent.mouseDown(letter(1, 5));
    expect(letter(1, 5)).toHaveClass("is-anchor-start");
    expect(letter(3, 0)).toHaveClass("is-anchor-end");

    fireEvent.click(button("添加连读"));
    expect(applied(view).annotations).toEqual([
      { type: "liaison", start: 7, end: 13, start_len: 1, end_len: 1 }
    ]);
    // 成线后开关回到「起点」
    expect(button("选择起点")).toHaveAttribute("aria-pressed", "true");
  });

  it("连读弧颜色是本机偏好：面板里有取色器，改一次弧线层立即换色", () => {
    render(<VoiceEditor {...props()} />);
    useLiaisonBrush();
    expect(document.querySelector(".ant-color-picker-trigger")).not.toBeNull();
    const layer = () =>
      document.querySelector<SVGElement>(".tsz-ve-arc-layer")!;
    expect(layer().style.getPropertyValue("--tsz-ve-liaison")).toBe(
      DEFAULT_LIAISON_COLOR
    );

    act(() => setLiaisonColor("#1677ff"));
    expect(layer().style.getPropertyValue("--tsz-ve-liaison")).toBe("#1677ff");
    expect(getLiaisonColor()).toBe("#1677ff");
    act(() => setLiaisonColor(DEFAULT_LIAISON_COLOR));
  });

  it("连读可跨越任意距离，不限相邻词", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    useLiaisonBrush();

    fireEvent.mouseDown(letter(0, 0)); // a
    chooseEnd("终点");
    fireEvent.mouseDown(letter(4, 3)); // city 的 y
    fireEvent.click(button("添加连读"));

    expect(applied(view).annotations).toEqual([
      {
        type: "liaison",
        start: 0,
        end: 20,
        start_len: 1,
        end_len: 1
      }
    ]);
  });

  it("重选清空草稿，换画笔或改文本也清空", () => {
    render(<VoiceEditor {...props()} />);
    useLiaisonBrush();

    fireEvent.mouseDown(letter(0, 0));
    fireEvent.click(button("重选"));
    expect(document.querySelectorAll(".is-anchor-start")).toHaveLength(0);

    // 换画笔
    fireEvent.mouseDown(letter(0, 0));
    usePauseBrush();
    useLiaisonBrush();
    expect(document.querySelectorAll(".is-anchor-start")).toHaveLength(0);

    // 改文本也丢弃未拼完的草稿：锚点按词序号存，词一变就不再可信
    fireEvent.mouseDown(letter(0, 0));
    fireEvent.change(screen.getByLabelText("语音编辑器"), {
      target: { value: "a centre of the town" }
    });
    useLiaisonBrush();
    expect(document.querySelectorAll(".is-anchor-start")).toHaveLength(0);
  });

  it("停顿画笔按所选时长落到词缝上", () => {
    const view = props();
    render(<VoiceEditor {...view} />);

    usePauseBrush();
    fireEvent.mouseDown(gap(1));
    // 记号绘在词缝下方且 aria-hidden，可及信息走 aria-label
    expect(gap(1).querySelector(".tsz-ve-gap-pause")).not.toBeNull();
    expect(gap(1)).toHaveAttribute(
      "aria-label",
      expect.stringContaining("停顿 500ms")
    );

    expect(applied(view).annotations).toEqual([
      { type: "pause", at: 8, duration_ms: 500 }
    ]);
  });

  it("点时长一步完成「启用停顿 + 设为该时长」", () => {
    const view = props();
    render(<VoiceEditor {...view} />);

    // 不需要先激活画笔再调时长
    pickPause("2s");
    // 选完就收起面板，当前时长直接写在工具栏按钮上
    expect(
      document.querySelector(".tsz-ve-pause-button")!.textContent
    ).toContain("2s");
    usePauseBrush();
    expect(button("用停顿画笔 2s")).toHaveAttribute("aria-checked", "true");

    fireEvent.mouseDown(gap(1));
    expect(applied(view).annotations).toEqual([
      { type: "pause", at: 8, duration_ms: 2000 }
    ]);
  });

  it("自定义时长补成一枚按钮，当前值始终看得见", () => {
    render(<VoiceEditor {...props()} />);
    usePauseBrush();
    const input = screen.getByLabelText("自定义停顿毫秒");
    fireEvent.change(input, { target: { value: "750" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(
      document.querySelector(".tsz-ve-pause-button")!.textContent
    ).toContain("750ms");
    usePauseBrush();
    expect(button("用停顿画笔 750ms")).toHaveAttribute("aria-checked", "true");
  });

  it("自定义停顿按毫秒生效，并落到词缝上", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    usePauseBrush();
    const input = screen.getByLabelText("自定义停顿毫秒");
    fireEvent.change(input, { target: { value: "750" } });
    fireEvent.keyDown(input, { key: "Enter" });

    fireEvent.mouseDown(gap(1));
    expect(applied(view).annotations).toEqual([
      { type: "pause", at: 8, duration_ms: 750 }
    ]);
  });

  it("拒绝越界、非整数与空的自定义停顿", () => {
    render(<VoiceEditor {...props()} />);
    usePauseBrush();
    const input = screen.getByLabelText("自定义停顿毫秒");

    for (const value of ["", "0", "6000", "12.5", "abc"]) {
      fireEvent.change(input, { target: { value } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(screen.getByText(/停顿时长必须是/)).toBeVisible();
    }

    // 被拒绝后画笔仍停在原来的预设上
    fireEvent.mouseDown(gap(1));
    expect(gap(1)).toHaveAttribute(
      "aria-label",
      expect.stringContaining("停顿 500ms")
    );
  });

  it("拖过一段字母松手整段上色，落盘是一条 emphasis；拖过几个词则连空格一起", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    pickRole("固定核心词");

    dragWords("centre", "the");
    // centre(2-8) of(9-11) the(12-15)：一条区间，含中间的空格
    expect(applied(view).annotations).toEqual([
      { type: "emphasis", start: 2, end: 15, level: "core" }
    ]);
    // 区间内每个字母都上色，区间外的不动；标记只改字色，词缝不带任何类
    expect(letter(1, 0)).toHaveClass("is-core");
    expect(letter(2, 0)).toHaveClass("is-core");
    expect(letter(3, 2)).toHaveClass("is-core");
    expect(letter(4, 0)).not.toHaveClass("is-core");
    expect(gap(1).className).toBe("tsz-ve-gap");
  });

  it("粒度到字母：只给 centre 的 re 标词性提示符，其余字母不受影响", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    pickRole("词性提示符");
    dragLetters(letter(1, 4), letter(1, 5));
    expect(applied(view).annotations).toEqual([
      { type: "emphasis", start: 6, end: 8, level: "grammar" }
    ]);
    expect(letter(1, 3)).not.toHaveAttribute("data-level");
    expect(letter(1, 4)).toHaveAttribute("data-level", "grammar");

    // 同一个词里再给 cent 标固定核心词：词内两种颜色并存
    pickRole("固定核心词");
    dragLetters(letter(1, 0), letter(1, 3));
    expect(applied(view).annotations).toEqual([
      { type: "emphasis", start: 2, end: 6, level: "core" },
      { type: "emphasis", start: 6, end: 8, level: "grammar" }
    ]);
    expect(wordLevels("centre")).toEqual(["core", "grammar"]);
  });

  it("一个字母一个字母地点：相邻同色接成一段，锚点清空后再点已上色的字母即取消", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    pickRole("固定核心词");
    dragLetters(letter(1, 0), letter(1, 0)); // c：锚点
    dragLetters(letter(1, 1), letter(1, 1)); // e：与 c 接上，锚点清空
    dragLetters(letter(1, 2), letter(1, 2)); // n：单独上色，成为新锚点
    expect(applied(view).annotations).toEqual([
      { type: "emphasis", start: 2, end: 5, level: "core" }
    ]);

    // 锚点还在 n 上：再点 e 是把 e..n 接上（本就相连，没有变化），并清空锚点
    dragLetters(letter(1, 1), letter(1, 1));
    expect(applied(view).annotations).toEqual([
      { type: "emphasis", start: 2, end: 5, level: "core" }
    ]);
    expect(document.querySelector(".is-role-anchor")).toBeNull();

    // 没有锚点时再点已上色的 e 才是取消它
    dragLetters(letter(1, 1), letter(1, 1));
    expect(applied(view).annotations).toEqual([
      { type: "emphasis", start: 2, end: 3, level: "core" },
      { type: "emphasis", start: 4, end: 5, level: "core" }
    ]);
  });

  it("同一个词里先后单击两个字母，中间的字母自动接上，接上后锚点清空", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    pickRole("固定核心词");

    dragLetters(letter(1, 0), letter(1, 0)); // c
    expect(letter(1, 0)).toHaveClass("is-role-anchor");
    dragLetters(letter(1, 5), letter(1, 5)); // e：c 到 e 之间一并上色
    expect(applied(view).annotations).toEqual([
      { type: "emphasis", start: 2, end: 8, level: "core" }
    ]);
    expect(document.querySelector(".is-role-anchor")).toBeNull();

    // 锚点已清空：再点一个已上色的字母是取消它，不是再连一次
    dragLetters(letter(1, 2), letter(1, 2));
    expect(applied(view).annotations).toEqual([
      { type: "emphasis", start: 2, end: 4, level: "core" },
      { type: "emphasis", start: 5, end: 8, level: "core" }
    ]);
  });

  it("隔着别的词的两次单击各自独立，不会被连成一大段；拖选之后也不留锚点", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    pickRole("固定核心词");

    dragLetters(letter(1, 0), letter(1, 0)); // centre 的 c
    dragLetters(letter(3, 0), letter(3, 0)); // the 的 t：另一个词，各自一个字母
    expect(applied(view).annotations).toEqual([
      { type: "emphasis", start: 2, end: 3, level: "core" },
      { type: "emphasis", start: 12, end: 13, level: "core" }
    ]);

    dragLetters(letter(4, 0), letter(4, 1)); // 拖选 ci
    dragLetters(letter(4, 3), letter(4, 3)); // 再单击 y：不与拖选的那段接上
    expect(applied(view).annotations).toEqual([
      { type: "emphasis", start: 2, end: 3, level: "core" },
      { type: "emphasis", start: 12, end: 13, level: "core" },
      { type: "emphasis", start: 16, end: 18, level: "core" },
      { type: "emphasis", start: 19, end: 20, level: "core" }
    ]);
  });

  it("拖过换行的区间按行各自上色，不会让编辑器进入「不保存」", () => {
    const view = props({
      value: { version: 2, text: "a centre\nof the city", annotations: [] }
    });
    render(<VoiceEditor {...view} />);
    pickRole("固定核心词");
    dragLetters(letter(1, 0), letter(2, 1)); // centre → of，中间隔着换行
    expect(applied(view).annotations).toEqual([
      { type: "emphasis", start: 2, end: 8, level: "core" },
      { type: "emphasis", start: 9, end: 11, level: "core" }
    ]);
    expect(screen.queryByText(/不会被保存/)).toBeNull();
  });

  it("与音标区间交叉的语法结构落笔被当场拒掉并说明，而不是让编辑器停止回写", () => {
    const view = props({
      value: {
        version: 2,
        text: TEXT,
        annotations: [
          {
            type: "phoneme",
            start: 2,
            end: 8,
            alphabet: "ipa",
            phoneme: "ˈsentə"
          }
        ]
      }
    });
    render(<VoiceEditor {...view} />);
    pickRole("词性提示符");
    dragLetters(letter(1, 4), letter(1, 5)); // 只标 centre 的 re，与音标交叉
    expect(view.onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/IPA/)).toBeInTheDocument();
    expect(screen.queryByText(/不会被保存/)).toBeNull();

    // 完整覆盖音标区间则允许
    dragLetters(letter(1, 0), letter(1, 5));
    expect(applied(view).annotations).toEqual(
      expect.arrayContaining([
        { type: "emphasis", start: 2, end: 8, level: "grammar" }
      ])
    );
  });

  it("右键不落笔；主键没按着时扫过字母会作废悬着的圈选", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    pickRole("固定核心词");
    fireEvent.mouseDown(letter(1, 0), { button: 2 });
    fireEvent.mouseUp(letter(1, 0), { button: 2 });
    expect(view.onChange).not.toHaveBeenCalled();

    fireEvent.mouseDown(letter(1, 0));
    fireEvent.mouseEnter(letter(1, 3)); // buttons 缺省 0：像右键菜单吞掉 mouseup 之后
    expect(letter(1, 3)).not.toHaveClass("is-selecting");
    fireEvent.mouseUp(document.body);
    expect(view.onChange).not.toHaveBeenCalled();
  });

  it("拖选压到已有颜色时按当前笔统一改色，一个字母只属于一种分类", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    pickRole("固定核心词");
    tapWord("the");
    pickRole("可替换搭配");
    dragWords("centre", "the");
    expect(applied(view).annotations).toEqual([
      { type: "emphasis", start: 2, end: 15, level: "function" }
    ]);
  });

  it("拖到标注带外面松手也照常落笔，不会留下悬着的圈选", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    pickRole("固定核心词");
    fireEvent.mouseDown(letter(1, 0));
    fireEvent.mouseEnter(letter(2, 1), { buttons: 1 });
    expect(letter(2, 0)).toHaveClass("is-selecting");
    fireEvent.mouseUp(document.body);
    expect(letter(2, 0)).not.toHaveClass("is-selecting");
    expect(applied(view).annotations).toEqual([
      { type: "emphasis", start: 2, end: 11, level: "core" }
    ]);
  });

  it("清空标注后所有标记归零", () => {
    const view = props();
    render(<VoiceEditor {...view} />);

    pickRole("固定核心词");
    tapWord("a");
    tapWord("the");
    expect(wordLevels("a")).toEqual(["core"]);

    fireEvent.click(button("清空标注"));
    expect(wordLevels("a")).not.toContain("core");
    expect(wordLevels("the")).not.toContain("core");

    expect(applied(view).annotations).toEqual([]);
  });

  it("空文本时给出引导而不是一排死按钮", () => {
    render(
      <VoiceEditor
        {...props({ value: { version: 2, text: "", annotations: [] } })}
      />
    );
    expect(
      screen.getByLabelText("语音编辑器").getAttribute("placeholder")
    ).toMatch(/直接输入/);
    openRoles();
    expect(button("用固定核心词画笔")).toBeDisabled();
  });
});

describe("VoiceEditor 文本与落盘", () => {
  it("改写某个词会连同它的标注一起丢弃，未动的词保留", () => {
    const view = props();
    render(<VoiceEditor {...view} />);

    pickRole("固定核心词");
    tapWord("a");
    tapWord("centre");

    fireEvent.change(screen.getByLabelText("语音编辑器"), {
      target: { value: "a middle of the city" }
    });

    expect(wordLevels("a")).toEqual(["core"]);
    expect(wordLevels("middle")).not.toContain("core");
  });

  it("落盘时把词标注折算成该词的码点区间", () => {
    const view = props();
    render(<VoiceEditor {...view} />);

    pickRole("固定核心词");
    tapWord("centre");

    expect(applied(view).annotations).toEqual([
      { type: "emphasis", start: 2, end: 8, level: "core" }
    ]);
  });

  it("载入既有标注并还原到对应的词上", () => {
    const value: RichTextV2 = {
      version: 2,
      text: TEXT,
      annotations: [{ type: "emphasis", start: 2, end: 8, level: "core" }]
    };
    render(<VoiceEditor {...props({ value })} />);
    expect(wordLevels("centre")).toEqual(["core"]);
  });

  it("上一步 / 下一步能回退和重放标注", () => {
    const view = props();
    render(<VoiceEditor {...view} />);

    pickRole("固定核心词");
    // 初始无历史，两个按钮都不可用
    expect(button("上一步")).toBeDisabled();
    expect(button("下一步")).toBeDisabled();

    tapWord("centre");
    expect(wordLevels("centre")).toEqual(["core"]);
    expect(button("上一步")).toBeEnabled();

    fireEvent.click(button("上一步"));
    expect(wordLevels("centre")).not.toContain("core");
    expect(button("下一步")).toBeEnabled();

    fireEvent.click(button("下一步"));
    expect(wordLevels("centre")).toEqual(["core"]);
  });

  it("撤销把文本和标注一起回退，两者不会各退各的", () => {
    render(<VoiceEditor {...props()} />);

    pickRole("固定核心词");
    tapWord("centre");

    // 改写 centre：它的标注应随之消失
    fireEvent.change(screen.getByLabelText("语音编辑器"), {
      target: { value: "a middle of the city" }
    });
    expect(wordLevels("middle")).not.toContain("core");

    fireEvent.click(button("上一步"));
    expect(screen.getByLabelText("语音编辑器")).toHaveValue(TEXT);
    expect(wordLevels("centre")).toEqual(["core"]);
  });

  it("新的改动会清掉重做栈", () => {
    render(<VoiceEditor {...props()} />);

    pickRole("固定核心词");
    tapWord("centre");
    fireEvent.click(button("上一步"));
    expect(button("下一步")).toBeEnabled();

    tapWord("the");
    expect(button("下一步")).toBeDisabled();
  });

  it("标注一落就实时抛给宿主，不必再点应用", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    expect(view.onChange).not.toHaveBeenCalled();

    pickRole("固定核心词");
    tapWord("centre");
    expect(view.onChange).toHaveBeenCalled();
    expect(applied(view).annotations).toEqual([
      { type: "emphasis", start: 2, end: 8, level: "core" }
    ]);
  });

  it("父组件把抛上去的值回灌下来时，不重置画笔与撤销栈", () => {
    // 受控内联最容易出错的地方：自己 → 父 → 自己的回路会被当成外部改动。
    const view = props();
    const { rerender } = render(<VoiceEditor {...view} />);

    pickRole("词性提示符");
    tapWord("centre");
    const emitted = applied(view);
    expect(button("上一步")).toBeEnabled();

    // 父组件把刚收到的值原样灌回来
    rerender(<VoiceEditor {...view} value={emitted} />);

    expect(button("上一步")).toBeEnabled();
    expect(
      document.querySelector(".tsz-ve-role-button")!.getAttribute("aria-label")
    ).toBe("语法结构 词性提示符");
    expect(wordLevels("centre")).toEqual(["grammar"]);
  });

  it("外部换了一份新值时，才重新灌入并清掉历史", () => {
    const view = props();
    const { rerender } = render(<VoiceEditor {...view} />);
    pickRole("固定核心词");
    tapWord("centre");
    expect(button("上一步")).toBeEnabled();

    rerender(
      <VoiceEditor
        {...view}
        value={{ version: 2, text: "a different line", annotations: [] }}
      />
    );

    expect(button("上一步")).toBeDisabled();
    expect(word("different")).toBeInTheDocument();
  });

  /*
   * 两层对齐的根不变量：下层渲染出来的字符必须和 textarea 里的文本**逐字相同**。
   * 少一个空格、吞掉一段空白，光标就会和字错开——而这类错位在 jsdom 里看不出
   * 排版，只能靠比对文本本身来守。
   */
  it.each([
    ["普通句子", "a centre of the city"],
    ["前导与尾随空白", "  a centre  "],
    ["词间多个空格", "a   centre    of the  city"],
    ["换行", "first line\nsecond line"],
    ["超长单词", "pneumonoultramicroscopicsilicovolcanoconiosis is long"],
    ["代理对与重音符", "café 🎧 naïve résumé"],
    ["纯空白", "   "],
    ["空文本", ""]
  ])("标注层渲染的字符与文本框完全一致：%s", (_name, text) => {
    render(
      <VoiceEditor
        {...props({ value: { version: 2, text, annotations: [] } })}
      />
    );
    const input = screen.getByLabelText("语音编辑器") as HTMLTextAreaElement;
    expect(input.value).toBe(text);
    expect(document.querySelector(".tsz-ve-strip")!.textContent).toBe(text);
  });

  /*
   * 内联受控最危险的一条：人还没动手，编辑器就把宿主的数据改了。
   * annotationsToMarks → marksToAnnotations 的往返不是恒等（跨词 emphasis 会被
   * 拆成逐词、认不出的 liaison 会被丢），一旦把这份「整理」当成用户改动抛出去，
   * 打开页面即改写历史标注、表单立刻变脏。
   */
  it.each([
    [
      "跨词 emphasis 不被拆开抛回",
      {
        version: 2,
        text: "the cat sat",
        annotations: [{ type: "emphasis", start: 0, end: 7, level: "core" }]
      }
    ],
    [
      "v1 连读不被丢掉抛回",
      { version: 1, text: "hello world", spans: [], liaisons: [4] }
    ],
    ["干净 v2", { version: 2, text: "the cat", annotations: [] }]
  ])("挂载不改写宿主数据：%s", (_name, value) => {
    const view = props({ value });
    render(<VoiceEditor {...view} />);
    expect(view.onChange).not.toHaveBeenCalled();
  });

  it("读不出的历史标注只降级保留正文，不把整页炸掉", () => {
    // 越界的 liaison：migrate 后区间落在正文外，normalize 会 throw。
    // 内联后每条例句都挂一份编辑器，一条坏数据不能白屏整个第 3 步。
    const view = props({
      value: { version: 1, text: "hello", spans: [], liaisons: [4] }
    });
    expect(() => render(<VoiceEditor {...view} />)).not.toThrow();

    expect(screen.getByLabelText("语音编辑器")).toHaveValue("hello");
    expect(screen.getByText(/原有标注读不出来/)).toBeInTheDocument();
    // 降级不等于替宿主做主：没得到用户指令前不回写
    expect(view.onChange).not.toHaveBeenCalled();
  });

  it("在已连读的两词之间敲回车，连读被撤掉而不是卡住回写", () => {
    // wire 不接受跨换行的标注。若把这条连读留着，本地就折算不出合法 wire，
    // 之后**所有**文本改动都会静默停止回写：用户看着新文本，表单存的是旧的。
    const view = props();
    render(<VoiceEditor {...view} />);
    useLiaisonBrush();
    fireEvent.mouseDown(letter(1, 5));
    chooseEnd("终点");
    fireEvent.mouseDown(letter(2, 0));
    fireEvent.click(button("添加连读"));
    expect(applied(view).annotations).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("语音编辑器"), {
      target: { value: "a centre\nof the city" }
    });

    expect(applied(view).text).toBe("a centre\nof the city");
    expect(applied(view).annotations).toEqual([]);

    // 回写没被卡住：继续改还能继续抛出去
    fireEvent.change(screen.getByLabelText("语音编辑器"), {
      target: { value: "a centre\nof the town" }
    });
    expect(applied(view).text).toBe("a centre\nof the town");
  });

  it("跨换行的连读在添加时就被挡掉，并说明原因", () => {
    const view = props({
      value: { version: 2, text: "a centre\nof the city", annotations: [] }
    });
    render(<VoiceEditor {...view} />);
    useLiaisonBrush();
    fireEvent.mouseDown(letter(1, 5));
    chooseEnd("终点");
    fireEvent.mouseDown(letter(2, 0));
    fireEvent.click(button("添加连读"));

    expect(screen.getByText(/连读不能跨越换行/)).toBeInTheDocument();
    expect(view.onChange).not.toHaveBeenCalled();
  });

  it("连读链 pick‿it‿up 落盘是两条弧，不会被并成一条长弧", () => {
    // 两条首尾相接的连读曾被 normalize 合并成 [3,9)，屏幕上两道弧、数据里一条，
    // 重新载入就变成 pick→up 一道错弧。连读链正是最常见的用法。
    const view = props({
      value: { version: 2, text: "pick it up", annotations: [] }
    });
    render(<VoiceEditor {...view} />);
    useLiaisonBrush();

    fireEvent.mouseDown(letter(0, 3));
    chooseEnd("终点");
    fireEvent.mouseDown(letter(1, 0));
    fireEvent.click(button("添加连读"));

    fireEvent.mouseDown(letter(1, 1));
    chooseEnd("终点");
    fireEvent.mouseDown(letter(2, 0));
    fireEvent.click(button("添加连读"));

    expect(applied(view).annotations).toEqual([
      {
        type: "liaison",
        start: 3,
        end: 6,
        start_len: 1,
        end_len: 1
      },
      {
        type: "liaison",
        start: 6,
        end: 9,
        start_len: 1,
        end_len: 1
      }
    ]);
  });

  it("拿不同时长的笔点已有停顿的缝是改时长，不是删掉", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    pickPause("500ms");
    fireEvent.mouseDown(gap(1));
    expect(applied(view).annotations).toEqual([
      { type: "pause", at: 8, duration_ms: 500 }
    ]);

    pickPause("2s");
    fireEvent.mouseDown(gap(1));
    expect(applied(view).annotations).toEqual([
      { type: "pause", at: 8, duration_ms: 2000 }
    ]);

    // 点同一个时长才是取消
    fireEvent.mouseDown(gap(1));
    expect(applied(view).annotations).toEqual([]);
  });

  it("同一对锚点不会被重复连读", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    useLiaisonBrush();
    fireEvent.mouseDown(letter(1, 5));
    chooseEnd("终点");
    fireEvent.mouseDown(letter(2, 0));
    fireEvent.click(button("添加连读"));

    // 添加成功后开关回到「起点」，第二条从头选
    fireEvent.mouseDown(letter(1, 5));
    chooseEnd("终点");
    fireEvent.mouseDown(letter(2, 0));
    fireEvent.click(button("添加连读"));

    expect(screen.getByText(/已经连过了/)).toBeInTheDocument();
    expect(applied(view).annotations).toHaveLength(1);
  });

  it("连着敲的一串字只占一步撤销", () => {
    // 每个按键推一个快照的话，MAX_HISTORY 一百来个字符就被填满，
    // 早先的标注操作会被挤出栈、再也撤不回来。
    render(<VoiceEditor {...props()} />);
    const input = () => screen.getByLabelText("语音编辑器");
    for (const value of ["a c", "a ce", "a cen", "a cent"]) {
      fireEvent.change(input(), { target: { value } });
    }
    expect(input()).toHaveValue("a cent");

    fireEvent.click(button("上一步"));
    expect(input()).toHaveValue(TEXT);
    expect(button("上一步")).toBeDisabled();
  });

  it("中间做了标注就断开连击，两段输入各占一步", () => {
    render(<VoiceEditor {...props()} />);
    const input = () => screen.getByLabelText("语音编辑器");

    fireEvent.change(input(), { target: { value: "a centre of the town" } });
    pickRole("固定核心词");
    tapWord("centre");
    fireEvent.change(input(), { target: { value: "a centre of the city" } });

    fireEvent.click(button("上一步")); // 撤第二段输入
    expect(input()).toHaveValue("a centre of the town");
    expect(wordLevels("centre")).toEqual(["core"]);

    fireEvent.click(button("上一步")); // 撤标注
    expect(wordLevels("centre")).not.toContain("core");

    fireEvent.click(button("上一步")); // 撤第一段输入
    expect(input()).toHaveValue(TEXT);
  });

  it("停手超过合并窗口后再敲，另起一步撤销", () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000);
    render(<VoiceEditor {...props()} />);
    const input = () => screen.getByLabelText("语音编辑器");

    fireEvent.change(input(), { target: { value: "a centre of the town" } });
    // 隔了 2 秒才继续敲：算两段
    now.mockReturnValue(3_000);
    fireEvent.change(input(), { target: { value: "a centre of the city" } });

    fireEvent.click(button("上一步"));
    expect(input()).toHaveValue("a centre of the town");
  });

  it("关掉连读面板即收笔，不会留下够不着「添加」的草稿", () => {
    render(<VoiceEditor {...props()} />);
    const canvas = document.querySelector(".tsz-ve-canvas")!;
    useLiaisonBrush();
    expect(canvas).toHaveAttribute("data-target", "letter");

    // 再点一次 = 关面板；面板是它的工作台，关掉就该收笔
    useLiaisonBrush();
    expect(canvas).toHaveAttribute("data-target", "none");
  });

  it("焦点在工具栏上时 Esc 也能收笔", () => {
    // Esc 处理挂在编辑器根节点而非画布：落笔时 preventDefault 会把焦点留在按钮上，
    // 挂画布上就收不到这个键。
    render(<VoiceEditor {...props()} />);
    const canvas = document.querySelector(".tsz-ve-canvas")!;
    pickRole("固定核心词");
    expect(canvas).toHaveAttribute("data-target", "letter");

    fireEvent.keyDown(document.querySelector(".tsz-ve-role-button")!, {
      key: "Escape"
    });
    expect(canvas).toHaveAttribute("data-target", "none");
  });

  it.each([
    ["可替换搭配", "function"],
    ["固定核心词", "core"],
    ["词性提示符", "grammar"]
  ])("三分类各自落盘并读得回来：%s", (label, level) => {
    // 后端枚举放开前，三类一律写成 strong、读回来全变固定核心词——分类等于白做。
    const view = props();
    const { rerender } = render(<VoiceEditor {...view} />);
    pickRole(label);
    tapWord("centre");

    const saved = applied(view);
    expect(saved.annotations).toEqual([
      { type: "emphasis", start: 2, end: 8, level }
    ]);

    // 存回去再读出来，分类不能变
    rerender(<VoiceEditor {...view} value={saved} />);
    expect(wordLevels("centre")).toEqual([level]);
  });

  it("存量 strong 读回来按固定核心词理解", () => {
    render(
      <VoiceEditor
        {...props({
          value: {
            version: 2,
            text: TEXT,
            annotations: [
              { type: "emphasis", start: 2, end: 8, level: "strong" }
            ]
          }
        })}
      />
    );
    expect(wordLevels("centre")).toEqual(["core"]);
  });

  it("默认空手：不取笔时点词不落标，鼠标归文本", () => {
    const view = props();
    render(<VoiceEditor {...view} />);

    // 文字和标注共用一块画布，没拿起笔时点击必须归文本，否则光标放不下去
    expect(document.querySelector(".tsz-ve-canvas")).toHaveAttribute(
      "data-target",
      "none"
    );
    tapWord("centre");
    expect(wordLevels("centre")).not.toContain("core");
    expect(view.onChange).not.toHaveBeenCalled();
  });

  it("「文本」工具与 Esc 都能收笔", () => {
    render(<VoiceEditor {...props()} />);
    const canvas = document.querySelector(".tsz-ve-canvas")!;

    pickRole("固定核心词");
    expect(canvas).toHaveAttribute("data-target", "letter");

    fireEvent.keyDown(canvas, { key: "Escape" });
    expect(canvas).toHaveAttribute("data-target", "none");

    usePauseBrush();
    expect(canvas).toHaveAttribute("data-target", "gap");
    fireEvent.click(button("编辑文本"));
    expect(canvas).toHaveAttribute("data-target", "none");
  });

  it("直接在画布上打字，标注按词跟着重挂", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    pickRole("固定核心词");
    tapWord("centre");

    // 改的是最后一个词，前面的标注要留住
    fireEvent.change(screen.getByLabelText("语音编辑器"), {
      target: { value: "a centre of the town" }
    });

    expect(wordLevels("centre")).toEqual(["core"]);
    expect(applied(view).text).toBe("a centre of the town");
    expect(applied(view).annotations).toEqual([
      { type: "emphasis", start: 2, end: 8, level: "core" }
    ]);
  });

  it("只读时不给画笔，也不往上抛改动", () => {
    const view = props({ readOnly: true });
    render(<VoiceEditor {...view} />);
    expect(letter(0, 0)).toHaveAttribute("aria-disabled", "true");
    // 六个工具的触发按钮一律禁用，浮层根本打不开
    expect(document.querySelector(".tsz-ve-role-button")).toBeDisabled();
    expect(document.querySelector(".tsz-ve-liaison-button")).toBeDisabled();
    expect(view.onChange).not.toHaveBeenCalled();
  });
});

describe("VoiceEditor 发音区", () => {
  it("音色按语种分组，再按男女声分列", async () => {
    render(<VoiceEditor {...props({ previewAdapter: adapter() })} />);
    openVoices();

    await waitFor(() => expect(screen.getByText("Sonia")).toBeInTheDocument());
    // 语种是分组小标题，不再是浮在卡角外的徽标（那种在浮层里必被切边）
    expect(
      [...document.querySelectorAll(".tsz-ve-pop-section-head")].map(
        (head) => head.textContent
      )
    ).toEqual(["BrE", "AmE"]);
    expect(screen.getByLabelText("BrE 女声 ♀")).toContainElement(
      screen.getByText("Sonia")
    );
    expect(screen.getByLabelText("AmE 男声 ♂")).toContainElement(
      screen.getByText("Guy")
    );
    expect(screen.getByText("Guy")).toBeInTheDocument();
  });

  it("未配置时默认不勾选，试听不改变C端音色选择", async () => {
    const onVoiceProfileChange = vi.fn();
    const synthesize = vi.fn().mockResolvedValue(previewResult());
    render(
      <VoiceEditor
        {...props({
          previewAdapter: adapter(synthesize),
          onVoiceProfileChange
        })}
      />
    );
    openVoices();
    const sonia = await screen.findByLabelText("启用 Sonia · 英式女声");
    expect(sonia).not.toBeChecked();
    expect(screen.getByLabelText("启用 Guy · 美式男声")).not.toBeChecked();
    fireEvent.click(button("试听 Sonia · 英式女声"));
    await waitFor(() => expect(synthesize).toHaveBeenCalledOnce());
    expect(sonia).not.toBeChecked();
    expect(onVoiceProfileChange).not.toHaveBeenCalled();
    fireEvent.click(sonia);
    expect(onVoiceProfileChange).toHaveBeenLastCalledWith({
      voices: [{ voice_id: "sonia", enabled: true, rate_percent: 0 }]
    });
  });

  it("更多音色默认折叠，展开可选择且收起不丢失选择", () => {
    const onToggleVoice = vi.fn();
    const view = {
      voices: [
        { ...VOICES[0]!, isCommon: true },
        { ...VOICES[1]!, isCommon: false }
      ],
      voicesLoading: false,
      enabledVoiceIds: [] as string[],
      onToggleVoice,
      canAudition: true,
      onAudition: vi.fn(),
      auditionStatus: ""
    };
    const { rerender } = render(<VoicePanel {...view} />);
    const guy = screen.getByLabelText("启用 Guy · 美式男声");
    expect(guy).not.toBeVisible();
    fireEvent.click(screen.getByText("更多音色（1）"));
    expect(guy).toBeVisible();
    expect(guy).not.toBeChecked();
    fireEvent.click(guy);
    expect(onToggleVoice).toHaveBeenLastCalledWith("guy");
    rerender(<VoicePanel {...view} enabledVoiceIds={["guy"]} />);
    fireEvent.click(screen.getByText("更多音色（1） · 已选 1"));
    expect(guy).not.toBeVisible();
    fireEvent.click(screen.getByText("更多音色（1） · 已选 1"));
    expect(guy).toBeVisible();
    expect(guy).toBeChecked();
  });

  it("可以取消勾选某个音色", async () => {
    render(
      <VoiceEditor
        {...props({
          previewAdapter: adapter(),
          voiceProfile: {
            voices: [{ voice_id: "sonia", enabled: true, rate_percent: 0 }]
          }
        })}
      />
    );
    openVoices();
    await waitFor(() => expect(screen.getByText("Sonia")).toBeInTheDocument());

    // 整行就是勾选靶子（role=checkbox），点名字也能勾，不必瞄准小方框
    const sonia = screen.getByLabelText("启用 Sonia · 英式女声");
    expect(sonia).toBeChecked();
    fireEvent.click(sonia);
    expect(sonia).not.toBeChecked();
  });

  it("各音色独立调速，取消勾选保留速度，改其他音色不中断当前试听", async () => {
    const synthesize = vi.fn().mockResolvedValue(previewResult());
    const onVoiceProfileChange = vi.fn();
    const source = adapter(synthesize);
    vi.mocked(source.listVoices).mockResolvedValue(
      VOICES.map((voice) => ({ ...voice, rateRange: { min: -50, max: 100 } }))
    );
    const view = props({ previewAdapter: source, onVoiceProfileChange });
    const { rerender } = render(<VoiceEditor {...view} />);
    openVoices();
    const setRate = async (label: string, multiplier: string) => {
      fireEvent.click(await screen.findByLabelText(`设置 ${label} 的语速`));
      const panel = await screen.findByRole("group", {
        name: `${label} 语速设置`
      });
      fireEvent.click(within(panel).getByLabelText(`语速 ${multiplier} 倍`));
    };
    await setRate("Sonia · 英式女声", "0.75");
    expect(screen.getByLabelText("启用 Sonia · 英式女声")).not.toBeChecked();
    fireEvent.click(button("试听 Sonia · 英式女声"));
    await waitFor(() => expect(AudioMock.instances).toHaveLength(1));
    await setRate("Guy · 美式男声", "1.25");
    expect(AudioMock.instances[0]!.pause).not.toHaveBeenCalled();
    fireEvent.click(button("试听 Guy · 美式男声"));
    await waitFor(() => expect(synthesize).toHaveBeenCalledTimes(2));
    expect(
      synthesize.mock.calls.map(([request]) => [
        request.voiceId,
        request.ratePercent
      ])
    ).toEqual([
      ["sonia", -25],
      ["guy", 25]
    ]);
    fireEvent.click(screen.getByLabelText("启用 Guy · 美式男声"));
    fireEvent.click(screen.getByLabelText("启用 Guy · 美式男声"));
    const saved = onVoiceProfileChange.mock.calls.at(-1)![0];
    expect(saved).toEqual({
      voices: [
        { voice_id: "sonia", enabled: false, rate_percent: -25 },
        { voice_id: "guy", enabled: false, rate_percent: 25 }
      ]
    });
    rerender(<VoiceEditor {...view} voiceProfile={saved} />);
    expect(
      screen.getByLabelText("设置 Sonia · 英式女声 的语速")
    ).toHaveTextContent("0.75×");
    expect(
      screen.getByLabelText("设置 Guy · 美式男声 的语速")
    ).toHaveTextContent("1.25×");
  });

  it("逐音色试听使用自己的语速，并按目标音色范围夹取", async () => {
    const synthesize = vi.fn().mockResolvedValue(previewResult());
    render(
      <VoiceEditor
        {...props({
          previewAdapter: adapter(synthesize),
          voiceProfile: {
            voices: [
              { voice_id: "sonia", enabled: false, rate_percent: -50 },
              { voice_id: "guy", enabled: true, rate_percent: -25 }
            ]
          }
        })}
      />
    );
    openVoices();
    await screen.findByText("Sonia");
    fireEvent.click(button("试听 Sonia · 英式女声"));
    await waitFor(() => expect(synthesize).toHaveBeenCalledOnce());
    expect(synthesize.mock.calls[0]![0]).toMatchObject({
      voiceId: "sonia",
      ratePercent: -10
    });
    fireEvent.click(button("试听 Guy · 美式男声"));
    await waitFor(() => expect(synthesize).toHaveBeenCalledTimes(2));
    expect(synthesize.mock.calls[1]![0]).toMatchObject({
      voiceId: "guy",
      ratePercent: -25,
      content: { text: TEXT, annotations: [] }
    });
  });

  it("没有上传适配器时「音频」面板置灰并说明原因，不再假装能本地上传", () => {
    render(<VoiceEditor {...props()} />);
    openTool("音频");
    expect(button("选择音频文件")).toBeDisabled();
    expect(screen.getByLabelText("上传音频")).toBeDisabled();
    expect(screen.getByText("音频上传未启用")).toBeInTheDocument();
  });

  it("上传：预检不过的不发请求，合格的走适配器，成功后按当次归属落成资产并抛出", async () => {
    const adapter = audioAdapter();
    const onAudioAssetsChange = vi.fn();
    render(
      <VoiceEditor
        {...props({ audioUploadAdapter: adapter, onAudioAssetsChange })}
      />
    );
    openTool("音频");
    fireEvent.click(screen.getByLabelText("AmE"));
    chooseFiles([
      mp3("a.mp3"),
      new File([new Uint8Array(3)], "b.txt", { type: "text/plain" }),
      new File([new Uint8Array(3)], "c.wav", { type: "audio/wav" })
    ]);

    // 只有 a.mp3 与 c.wav 走到适配器，b.txt 在预检就被挡下
    await waitFor(() => expect(adapter.upload).toHaveBeenCalledTimes(2));
    expect(adapter.upload.mock.calls[0]![0]).toMatchObject({
      locale: "en-US",
      gender: "female"
    });
    expect(
      screen.getByText("仅支持 mp3 / m4a / wav / ogg")
    ).toBeInTheDocument();

    await waitFor(() => expect(onAudioAssetsChange).toHaveBeenCalledTimes(2));
    const emitted = onAudioAssetsChange.mock.calls.at(-1)![0] as AudioAsset[];
    expect(emitted.map((item) => item.original_name)).toEqual([
      "a.mp3",
      "c.wav"
    ]);
    expect(emitted[0]).toMatchObject({ locale: "en-US", gender: "female" });
    // 列表：两条资产 + 一条失败；资产行带归属标签
    expect(screen.getByLabelText("试听 a.mp3")).toBeInTheDocument();
    expect(screen.getByLabelText("移除 b.txt")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("AmE")])
    );
    // 工具栏计数只算落成的
    expect(
      document.querySelector('[aria-label="音频"]')!.textContent
    ).toContain("2");
  });

  it("超过大小或条数上限的直接进失败列表，不占名额", async () => {
    const adapter = audioAdapter();
    render(
      <VoiceEditor
        {...props({ audioUploadAdapter: adapter, audioAssetLimit: 2 })}
      />
    );
    openTool("音频");
    chooseFiles([
      mp3("big.mp3", 10 * 1024 * 1024 + 1),
      mp3("1.mp3"),
      mp3("2.mp3"),
      mp3("3.mp3")
    ]);
    await waitFor(() => expect(adapter.upload).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/不能超过 10 MiB/)).toBeInTheDocument();
    expect(screen.getByText("最多只能挂 2 条音频")).toBeInTheDocument();
    // 不可重试的失败没有「重试」，只能移除
    expect(screen.queryByLabelText("重试 big.mp3")).toBeNull();
    fireEvent.click(screen.getByLabelText("移除 big.mp3"));
    expect(screen.queryByText(/不能超过 10 MiB/)).toBeNull();
  });

  it("上传失败留在队列可重试；适配器报存储未开通则整块置灰", async () => {
    const adapter = audioAdapter();
    adapter.upload.mockRejectedValueOnce(
      new AudioUploadError("upload_failed", "直传失败，请重试", true)
    );
    const onAudioAssetsChange = vi.fn();
    render(
      <VoiceEditor
        {...props({ audioUploadAdapter: adapter, onAudioAssetsChange })}
      />
    );
    openTool("音频");
    chooseFiles([mp3("a.mp3")]);
    await waitFor(() =>
      expect(screen.getByText("直传失败，请重试")).toBeInTheDocument()
    );
    expect(onAudioAssetsChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("重试 a.mp3"));
    await waitFor(() => expect(onAudioAssetsChange).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("直传失败，请重试")).toBeNull();
    expect(screen.getByLabelText("试听 a.mp3")).toBeInTheDocument();

    // 存储未开通由适配器记一次，编辑器每次渲染直接问它
    adapter.upload.mockRejectedValueOnce(
      new AudioUploadError("storage_unavailable", "音频存储未开通")
    );
    adapter.isStorageUnavailable = () => true;
    chooseFiles([mp3("b.mp3")]);
    await waitFor(() =>
      expect(
        screen.getByText("音频存储尚未开通，暂时不能上传")
      ).toBeInTheDocument()
    );
    expect(button("选择音频文件")).toBeDisabled();
  });

  it("上传完成时用最新的 onAudioAssetsChange，不用发起那一帧捕获的旧回调", async () => {
    let finish!: (value: AudioAsset) => void;
    const adapter = audioAdapter({
      upload: vi.fn(
        () => new Promise<AudioAsset>((resolve) => (finish = resolve))
      )
    });
    const stale = vi.fn();
    const fresh = vi.fn();
    const view = props({ audioUploadAdapter: adapter });
    const { rerender } = render(
      <VoiceEditor {...view} onAudioAssetsChange={stale} />
    );
    openTool("音频");
    chooseFiles([mp3("slow.mp3")]);
    await waitFor(() => expect(adapter.upload).toHaveBeenCalledTimes(1));

    // 上传期间宿主重渲染换了回调（内联箭头函数每次都是新的）
    rerender(<VoiceEditor {...view} onAudioAssetsChange={fresh} />);
    finish(asset({ original_name: "slow.mp3" }));
    await waitFor(() => expect(fresh).toHaveBeenCalledTimes(1));
    expect(stale).not.toHaveBeenCalled();
  });

  it("只读态下队列行的「移除」也不可用", async () => {
    const adapter = audioAdapter({
      upload: vi.fn(() => new Promise<AudioAsset>(() => {}))
    });
    const view = props({ audioUploadAdapter: adapter });
    const { rerender } = render(<VoiceEditor {...view} />);
    openTool("音频");
    chooseFiles([mp3("a.mp3")]);
    await waitFor(() => expect(adapter.upload).toHaveBeenCalledTimes(1));
    rerender(<VoiceEditor {...view} readOnly />);
    expect(screen.getByLabelText("移除 a.mp3")).toBeDisabled();
  });

  it("外部给的 audioAssets 列出来；自己抛出去再灌回来不重置、不重复抛", async () => {
    const adapter = audioAdapter();
    const onAudioAssetsChange = vi.fn();
    const existing = asset({ original_name: "old.mp3", locale: "en-US" });
    const view = props({
      audioUploadAdapter: adapter,
      audioAssets: [existing],
      onAudioAssetsChange
    });
    const { rerender } = render(<VoiceEditor {...view} />);
    openTool("音频");
    expect(screen.getByLabelText("试听 old.mp3")).toBeInTheDocument();

    chooseFiles([mp3("new.mp3")]);
    await waitFor(() => expect(onAudioAssetsChange).toHaveBeenCalledTimes(1));
    const emitted = onAudioAssetsChange.mock.calls[0]![0] as AudioAsset[];
    expect(emitted.map((item) => item.original_name)).toEqual([
      "old.mp3",
      "new.mp3"
    ]);

    rerender(<VoiceEditor {...view} audioAssets={emitted} />);
    expect(screen.getAllByLabelText(/^试听 /)).toHaveLength(2);
    expect(onAudioAssetsChange).toHaveBeenCalledTimes(1);

    // 外部真换了一份值才重灌
    rerender(<VoiceEditor {...view} audioAssets={[]} />);
    expect(screen.queryByLabelText(/^试听 /)).toBeNull();
  });

  it("移除资产要确认：取消则保留，确认后从草稿去掉引用并抛出", async () => {
    const onAudioAssetsChange = vi.fn();
    const existing = asset({ original_name: "old.mp3" });
    render(
      <VoiceEditor
        {...props({
          audioUploadAdapter: audioAdapter(),
          audioAssets: [existing],
          onAudioAssetsChange
        })}
      />
    );
    openTool("音频");
    fireEvent.click(screen.getByLabelText("移除 old.mp3"));
    // antd 在两字按钮之间插了空格，可及名是「取 消」/「移 除」
    fireEvent.click(await screen.findByRole("button", { name: "取 消" }));
    expect(screen.getByLabelText("试听 old.mp3")).toBeInTheDocument();
    expect(onAudioAssetsChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("移除 old.mp3"));
    // 行按钮的可及名是「移除 old.mp3」，只有确认框的按钮叫「移 除」
    fireEvent.click(await screen.findByRole("button", { name: "移 除" }));
    expect(screen.queryByLabelText("试听 old.mp3")).toBeNull();
    expect(onAudioAssetsChange).toHaveBeenLastCalledWith([]);
  });

  it("试听资产：取签名 URL 后播放，未过期复用，再点一次停止", async () => {
    const adapter = audioAdapter();
    const existing = asset({ original_name: "old.mp3" });
    render(
      <VoiceEditor
        {...props({ audioUploadAdapter: adapter, audioAssets: [existing] })}
      />
    );
    openTool("音频");

    fireEvent.click(screen.getByLabelText("试听 old.mp3"));
    await waitFor(() => expect(AudioMock.instances).toHaveLength(1));
    expect(adapter.resolveUrl).toHaveBeenCalledWith(existing.id, {
      signal: expect.any(AbortSignal)
    });
    expect(AudioMock.instances[0]!.src).toBe(
      `https://signed.example/${existing.id}`
    );
    await waitFor(() =>
      expect(screen.getByLabelText("试听 old.mp3")).toHaveAttribute(
        "data-playing",
        "true"
      )
    );

    // 再点一次是停止，不该又起一路播放
    fireEvent.click(screen.getByLabelText("试听 old.mp3"));
    expect(AudioMock.instances[0]!.pause).toHaveBeenCalledOnce();

    // 第三次点：URL 没过期，直接复用，不再向适配器要
    fireEvent.click(screen.getByLabelText("试听 old.mp3"));
    await waitFor(() => expect(AudioMock.instances).toHaveLength(2));
    expect(adapter.resolveUrl).toHaveBeenCalledTimes(1);
  });

  it("签名 URL 过期后再试听会重新取一张", async () => {
    const adapter = audioAdapter();
    adapter.resolveUrl.mockResolvedValueOnce({
      url: "https://signed.example/expired",
      expiresAt: new Date(Date.now() - 1_000).toISOString()
    });
    const existing = asset({ original_name: "old.mp3" });
    render(
      <VoiceEditor
        {...props({ audioUploadAdapter: adapter, audioAssets: [existing] })}
      />
    );
    openTool("音频");
    fireEvent.click(screen.getByLabelText("试听 old.mp3"));
    await waitFor(() => expect(AudioMock.instances).toHaveLength(1));
    fireEvent.click(screen.getByLabelText("试听 old.mp3")); // 停
    fireEvent.click(screen.getByLabelText("试听 old.mp3")); // 已过期 → 重取
    await waitFor(() => expect(adapter.resolveUrl).toHaveBeenCalledTimes(2));
  });

  it("取签名 URL 期间再点是停止：URL 回来后不开播，也不起第二路", async () => {
    let release!: (value: { url: string; expiresAt: string }) => void;
    const adapter = audioAdapter({
      resolveUrl: vi.fn(
        () =>
          new Promise<{ url: string; expiresAt: string }>((resolve) => {
            release = resolve;
          })
      )
    });
    const existing = asset({ original_name: "old.mp3" });
    render(
      <VoiceEditor
        {...props({ audioUploadAdapter: adapter, audioAssets: [existing] })}
      />
    );
    openTool("音频");
    fireEvent.click(screen.getByLabelText("试听 old.mp3"));
    expect(screen.getByLabelText("试听 old.mp3")).toHaveAttribute(
      "data-playing",
      "true"
    );
    fireEvent.click(screen.getByLabelText("试听 old.mp3"));
    expect(screen.getByLabelText("试听 old.mp3")).toHaveAttribute(
      "data-playing",
      "false"
    );
    release({
      url: "https://signed.example/late",
      expiresAt: new Date(Date.now() + 300_000).toISOString()
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(AudioMock.instances).toHaveLength(0);
    expect(adapter.resolveUrl).toHaveBeenCalledTimes(1);
  });

  it("外部回灌把正在播的那条拿掉时停播；试听失败只在面板里说明，不当阻断性错误", async () => {
    const adapter = audioAdapter();
    const existing = asset({ original_name: "old.mp3" });
    const view = props({
      audioUploadAdapter: adapter,
      audioAssets: [existing]
    });
    const { rerender } = render(<VoiceEditor {...view} />);
    openTool("音频");
    fireEvent.click(screen.getByLabelText("试听 old.mp3"));
    await waitFor(() => expect(AudioMock.instances).toHaveLength(1));
    rerender(<VoiceEditor {...view} audioAssets={[]} />);
    expect(AudioMock.instances[0]!.pause).toHaveBeenCalledOnce();

    const other = asset({ original_name: "other.mp3" });
    adapter.resolveUrl.mockRejectedValueOnce(new Error("boom"));
    rerender(<VoiceEditor {...view} audioAssets={[other]} />);
    fireEvent.click(screen.getByLabelText("试听 other.mp3"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("音频暂时无法试听")
    );
    expect(document.querySelector(".ant-alert-error")).toBeNull();
    expect(screen.getByLabelText("试听 other.mp3")).toHaveAttribute(
      "data-playing",
      "false"
    );
    // 下一次试听成功即清掉说明
    fireEvent.click(screen.getByLabelText("试听 other.mp3"));
    await waitFor(() => expect(AudioMock.instances).toHaveLength(2));
    expect(screen.queryByText("音频暂时无法试听，请稍后重试")).toBeNull();
  });

  it("单个音色拒绝越界自定义语速，合法值不改勾选", async () => {
    const onVoiceProfileChange = vi.fn();
    render(
      <VoiceEditor
        {...props({ previewAdapter: adapter(), onVoiceProfileChange })}
      />
    );
    openVoices();
    fireEvent.click(await screen.findByLabelText("设置 Guy · 美式男声 的语速"));
    const input = await screen.findByLabelText("自定义语速倍数");
    for (const value of ["", "0.4", "2.1", "abc"]) {
      fireEvent.change(input, { target: { value } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(onVoiceProfileChange).not.toHaveBeenCalled();
    }
    fireEvent.change(input, { target: { value: "1.5" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onVoiceProfileChange).toHaveBeenLastCalledWith({
      voices: [{ voice_id: "guy", enabled: false, rate_percent: 50 }]
    });
    expect(
      screen.getByLabelText("设置 Guy · 美式男声 的语速")
    ).toHaveTextContent("1.50×");
    expect(screen.getByLabelText("启用 Guy · 美式男声")).not.toBeChecked();
  });

  it("勾选音色与调语速都抛出 voice_profile", async () => {
    const onVoiceProfileChange = vi.fn();
    render(
      <VoiceEditor
        {...props({ previewAdapter: adapter(), onVoiceProfileChange })}
      />
    );
    openVoices();
    await waitFor(() => expect(screen.getByText("Sonia")).toBeInTheDocument());

    // 没动过不抛配置；用户点击后只保存明确选中的音色。
    expect(onVoiceProfileChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("启用 Guy · 美式男声"));
    expect(onVoiceProfileChange).toHaveBeenLastCalledWith({
      voices: [{ voice_id: "guy", enabled: true, rate_percent: 0 }]
    });

    fireEvent.click(screen.getByLabelText("设置 Guy · 美式男声 的语速"));
    fireEvent.click(await screen.findByLabelText("语速 1.25 倍"));
    expect(onVoiceProfileChange).toHaveBeenLastCalledWith({
      voices: [{ voice_id: "guy", enabled: true, rate_percent: 25 }]
    });
  });

  it("传入的 voice_profile 回填到面板上", async () => {
    render(
      <VoiceEditor
        {...props({
          previewAdapter: adapter(),
          voiceProfile: {
            voices: [{ voice_id: "guy", enabled: true, rate_percent: -25 }]
          }
        })}
      />
    );
    // 已配过就不必等清单拉回来才报数
    expect(
      document.querySelector('[aria-label="发音"]')!.textContent
    ).toContain("已选 1 个音色");

    openVoices();
    await waitFor(() => expect(screen.getByText("Sonia")).toBeInTheDocument());
    expect(screen.getByLabelText("启用 Sonia · 英式女声")).not.toBeChecked();
    expect(screen.getByLabelText("启用 Guy · 美式男声")).toBeChecked();
    expect(
      screen.getByLabelText("设置 Guy · 美式男声 的语速")
    ).toHaveTextContent("0.75×");
  });

  it("父组件把 voice_profile 回灌下来时不重置面板", async () => {
    const onVoiceProfileChange = vi.fn();
    const view = props({ previewAdapter: adapter(), onVoiceProfileChange });
    const { rerender } = render(<VoiceEditor {...view} />);
    openVoices();
    await waitFor(() => expect(screen.getByText("Sonia")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("启用 Sonia · 英式女声"));

    const emitted = onVoiceProfileChange.mock.calls.at(-1)![0];
    rerender(<VoiceEditor {...view} voiceProfile={emitted} />);

    expect(screen.getByLabelText("启用 Sonia · 英式女声")).toBeChecked();
    expect(onVoiceProfileChange).toHaveBeenCalledTimes(1);
  });

  it("只读时不抛 voice_profile", async () => {
    const onVoiceProfileChange = vi.fn();
    render(
      <VoiceEditor
        {...props({
          previewAdapter: adapter(),
          readOnly: true,
          onVoiceProfileChange
        })}
      />
    );
    expect(document.querySelector('[aria-label="发音"]')).toBeDisabled();
    expect(onVoiceProfileChange).not.toHaveBeenCalled();
  });

  it("没有 TTS 适配器时在音色面板里给出说明而不是空白", () => {
    render(<VoiceEditor {...props()} />);
    openVoices();
    expect(screen.getByText("TTS 后端未启用，仍可编辑")).toBeInTheDocument();
  });
});

it("默认发音编辑器不带语法工具，仅语法区域显式开启", () => {
  const view = props();
  const { rerender } = render(<VoiceEditor {...view} mode={undefined} />);
  expect(screen.queryByRole("button", { name: /语法结构/ })).toBeNull();
  for (const name of ["连读", "停顿", "发音", "音频"])
    expect(
      screen.getByRole("button", { name: new RegExp(name) })
    ).toBeInTheDocument();
  rerender(<VoiceEditor {...view} mode="grammar" />);
  expect(screen.getByRole("button", { name: /语法结构/ })).toBeInTheDocument();
});
