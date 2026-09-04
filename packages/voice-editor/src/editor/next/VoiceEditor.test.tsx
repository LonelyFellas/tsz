import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RichTextV2 } from "@tsz/types";
import type {
  VoiceOption,
  VoicePreviewAdapter,
  VoicePreviewResult
} from "../../types";
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

function props(overrides: Record<string, unknown> = {}) {
  return {
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

/**
 * 音色收在工具栏「音色」工具的浮层里，取用前先点开。
 * 浮层渲染在 portal 且带入场动画，jsdom 算不出可见性，断言一律用
 * toBeInTheDocument 而不是 toBeVisible。
 */
function openTool(label: string) {
  fireEvent.click(button(label));
}

function openVoices() {
  openTool("音色");
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
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  // vi.spyOn 对已监听的方法会复用同一个 spy，不还原的话调用记录会跨用例累积。
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

    pickRole("核心词");
    fireEvent.mouseDown(word("centre"));
    expect(word("centre")).toHaveClass("is-core");

    fireEvent.mouseDown(word("centre"));
    expect(word("centre")).not.toHaveClass("is-core");

    fireEvent.mouseDown(word("centre"));
    pickRole("语法词");
    fireEvent.mouseDown(word("centre"));
    // 替换而非叠加：只剩后一个分类。
    expect(word("centre")).toHaveClass("is-grammar");
    expect(word("centre")).not.toHaveClass("is-core");
  });

  it("每支画笔只让自己的靶子可点", () => {
    render(<VoiceEditor {...props()} />);

    // 语法结构：认词
    pickRole("核心词");
    expect(word("a")).toHaveAttribute("aria-disabled", "false");
    expect(gap(0)).toHaveAttribute("aria-disabled", "true");
    expect(document.querySelectorAll(".tsz-ve-letter")).toHaveLength(0);

    // 连读：认字母——此时词退为容器（span），字母才是按钮
    useLiaisonBrush();
    expect(word("a").tagName).toBe("SPAN");
    expect(gap(0)).toHaveAttribute("aria-disabled", "true");
    expect(document.querySelectorAll(".tsz-ve-letter").length).toBeGreaterThan(
      0
    );

    // 停顿：认词缝
    usePauseBrush();
    expect(gap(0)).toHaveAttribute("aria-disabled", "false");
    expect(word("a")).toHaveAttribute("aria-disabled", "true");
    expect(document.querySelectorAll(".tsz-ve-letter")).toHaveLength(0);
  });

  it("连读两段选：起点一个词、终点另一个词，确认后成线", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    useLiaisonBrush();

    fireEvent.mouseDown(letter(1, 5)); // centre 的 e
    expect(letter(1, 5)).toHaveClass("is-anchor-start");
    // 两端未齐前不能确认
    expect(button("添加连读")).toBeDisabled();

    fireEvent.mouseDown(letter(2, 0)); // of 的 o
    expect(letter(2, 0)).toHaveClass("is-anchor-end");
    expect(button("添加连读")).toBeEnabled();

    fireEvent.click(button("添加连读"));

    expect(applied(view).annotations).toEqual([
      { type: "liaison", start: 7, end: 10 }
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
    // wire 只存得下外缘区间：起点首字母 → 终点末字母。
    expect(applied(view).annotations).toEqual([
      { type: "liaison", start: 6, end: 11 }
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

  it("连读可跨越任意距离，不限相邻词", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    useLiaisonBrush();

    fireEvent.mouseDown(letter(0, 0)); // a
    fireEvent.mouseDown(letter(4, 3)); // city 的 y
    fireEvent.click(button("添加连读"));

    expect(applied(view).annotations).toEqual([
      { type: "liaison", start: 0, end: 20 }
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

  it("清空标注后所有标记归零", () => {
    const view = props();
    render(<VoiceEditor {...view} />);

    pickRole("核心词");
    fireEvent.mouseDown(word("a"));
    fireEvent.mouseDown(word("the"));
    expect(word("a")).toHaveClass("is-core");

    fireEvent.click(button("清空标注"));
    expect(word("a")).not.toHaveClass("is-core");
    expect(word("the")).not.toHaveClass("is-core");

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
    expect(button("用核心词画笔")).toBeDisabled();
  });
});

describe("VoiceEditor 文本与落盘", () => {
  it("改写某个词会连同它的标注一起丢弃，未动的词保留", () => {
    const view = props();
    render(<VoiceEditor {...view} />);

    pickRole("核心词");
    fireEvent.mouseDown(word("a"));
    fireEvent.mouseDown(word("centre"));

    fireEvent.change(screen.getByLabelText("语音编辑器"), {
      target: { value: "a middle of the city" }
    });

    expect(word("a")).toHaveClass("is-core");
    expect(word("middle")).not.toHaveClass("is-core");
  });

  it("落盘时把词标注折算成该词的码点区间", () => {
    const view = props();
    render(<VoiceEditor {...view} />);

    pickRole("核心词");
    fireEvent.mouseDown(word("centre"));

    expect(applied(view).annotations).toEqual([
      { type: "emphasis", start: 2, end: 8, level: "strong" }
    ]);
  });

  it("载入既有标注并还原到对应的词上", () => {
    const value: RichTextV2 = {
      version: 2,
      text: TEXT,
      annotations: [{ type: "emphasis", start: 2, end: 8, level: "strong" }]
    };
    render(<VoiceEditor {...props({ value })} />);
    expect(word("centre")).toHaveClass("is-core");
  });

  it("上一步 / 下一步能回退和重放标注", () => {
    const view = props();
    render(<VoiceEditor {...view} />);

    pickRole("核心词");
    // 初始无历史，两个按钮都不可用
    expect(button("上一步")).toBeDisabled();
    expect(button("下一步")).toBeDisabled();

    fireEvent.mouseDown(word("centre"));
    expect(word("centre")).toHaveClass("is-core");
    expect(button("上一步")).toBeEnabled();

    fireEvent.click(button("上一步"));
    expect(word("centre")).not.toHaveClass("is-core");
    expect(button("下一步")).toBeEnabled();

    fireEvent.click(button("下一步"));
    expect(word("centre")).toHaveClass("is-core");
  });

  it("撤销把文本和标注一起回退，两者不会各退各的", () => {
    render(<VoiceEditor {...props()} />);

    pickRole("核心词");
    fireEvent.mouseDown(word("centre"));

    // 改写 centre：它的标注应随之消失
    fireEvent.change(screen.getByLabelText("语音编辑器"), {
      target: { value: "a middle of the city" }
    });
    expect(word("middle")).not.toHaveClass("is-core");

    fireEvent.click(button("上一步"));
    expect(screen.getByLabelText("语音编辑器")).toHaveValue(TEXT);
    expect(word("centre")).toHaveClass("is-core");
  });

  it("新的改动会清掉重做栈", () => {
    render(<VoiceEditor {...props()} />);

    pickRole("核心词");
    fireEvent.mouseDown(word("centre"));
    fireEvent.click(button("上一步"));
    expect(button("下一步")).toBeEnabled();

    fireEvent.mouseDown(word("the"));
    expect(button("下一步")).toBeDisabled();
  });

  it("标注一落就实时抛给宿主，不必再点应用", () => {
    const view = props();
    render(<VoiceEditor {...view} />);
    expect(view.onChange).not.toHaveBeenCalled();

    pickRole("核心词");
    fireEvent.mouseDown(word("centre"));
    expect(view.onChange).toHaveBeenCalled();
    expect(applied(view).annotations).toEqual([
      { type: "emphasis", start: 2, end: 8, level: "strong" }
    ]);
  });

  it("父组件把抛上去的值回灌下来时，不重置画笔与撤销栈", () => {
    // 受控内联最容易出错的地方：自己 → 父 → 自己的回路会被当成外部改动。
    const view = props();
    const { rerender } = render(<VoiceEditor {...view} />);

    pickRole("语法词");
    fireEvent.mouseDown(word("centre"));
    const emitted = applied(view);
    expect(button("上一步")).toBeEnabled();

    // 父组件把刚收到的值原样灌回来
    rerender(<VoiceEditor {...view} value={emitted} />);

    expect(button("上一步")).toBeEnabled();
    expect(
      document.querySelector(".tsz-ve-role-button")!.getAttribute("aria-label")
    ).toBe("语法结构 语法词");
    expect(word("centre").className).toContain("is-grammar");
  });

  it("外部换了一份新值时，才重新灌入并清掉历史", () => {
    const view = props();
    const { rerender } = render(<VoiceEditor {...view} />);
    pickRole("核心词");
    fireEvent.mouseDown(word("centre"));
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
        annotations: [{ type: "emphasis", start: 0, end: 7, level: "strong" }]
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
    fireEvent.mouseDown(letter(1, 0));
    fireEvent.click(button("添加连读"));

    fireEvent.mouseDown(letter(1, 1));
    fireEvent.mouseDown(letter(2, 0));
    fireEvent.click(button("添加连读"));

    expect(applied(view).annotations).toEqual([
      { type: "liaison", start: 3, end: 6 },
      { type: "liaison", start: 6, end: 9 }
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
    fireEvent.mouseDown(letter(2, 0));
    fireEvent.click(button("添加连读"));

    fireEvent.mouseDown(letter(1, 5));
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
    pickRole("核心词");
    fireEvent.mouseDown(word("centre"));
    fireEvent.change(input(), { target: { value: "a centre of the city" } });

    fireEvent.click(button("上一步")); // 撤第二段输入
    expect(input()).toHaveValue("a centre of the town");
    expect(word("centre")).toHaveClass("is-core");

    fireEvent.click(button("上一步")); // 撤标注
    expect(word("centre")).not.toHaveClass("is-core");

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
    pickRole("核心词");
    expect(canvas).toHaveAttribute("data-target", "word");

    fireEvent.keyDown(document.querySelector(".tsz-ve-role-button")!, {
      key: "Escape"
    });
    expect(canvas).toHaveAttribute("data-target", "none");
  });

  it("默认空手：不取笔时点词不落标，鼠标归文本", () => {
    const view = props();
    render(<VoiceEditor {...view} />);

    // 文字和标注共用一块画布，没拿起笔时点击必须归文本，否则光标放不下去
    expect(document.querySelector(".tsz-ve-canvas")).toHaveAttribute(
      "data-target",
      "none"
    );
    fireEvent.mouseDown(word("centre"));
    expect(word("centre")).not.toHaveClass("is-core");
    expect(view.onChange).not.toHaveBeenCalled();
  });

  it("「文本」工具与 Esc 都能收笔", () => {
    render(<VoiceEditor {...props()} />);
    const canvas = document.querySelector(".tsz-ve-canvas")!;

    pickRole("核心词");
    expect(canvas).toHaveAttribute("data-target", "word");

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
    pickRole("核心词");
    fireEvent.mouseDown(word("centre"));

    // 改的是最后一个词，前面的标注要留住
    fireEvent.change(screen.getByLabelText("语音编辑器"), {
      target: { value: "a centre of the town" }
    });

    expect(word("centre")).toHaveClass("is-core");
    expect(applied(view).text).toBe("a centre of the town");
    expect(applied(view).annotations).toEqual([
      { type: "emphasis", start: 2, end: 8, level: "strong" }
    ]);
  });

  it("只读时不给画笔，也不往上抛改动", () => {
    const view = props({ readOnly: true });
    render(<VoiceEditor {...view} />);
    expect(word("a")).toHaveAttribute("aria-disabled", "true");
    // 六个工具的触发按钮一律禁用，浮层根本打不开
    expect(document.querySelector(".tsz-ve-role-button")).toBeDisabled();
    expect(document.querySelector(".tsz-ve-liaison-button")).toBeDisabled();
    expect(view.onChange).not.toHaveBeenCalled();
  });
});

describe("VoiceEditor 发音区", () => {
  it("音色按语种分组成行式清单，性别写在行内", async () => {
    render(<VoiceEditor {...props({ previewAdapter: adapter() })} />);
    openVoices();

    await waitFor(() => expect(screen.getByText("Sonia")).toBeInTheDocument());
    // 语种是分组小标题，不再是浮在卡角外的徽标（那种在浮层里必被切边）
    expect(
      [...document.querySelectorAll(".tsz-ve-pop-section-head")].map(
        (head) => head.textContent
      )
    ).toEqual(["BrE", "AmE"]);
    // 性别下沉到每一行，不再有重复两遍的女声/男声表头
    expect(
      [...document.querySelectorAll(".tsz-ve-pop-meta")].map(
        (meta) => meta.textContent
      )
    ).toEqual(["女声 ♀", "男声 ♂"]);
    expect(screen.getByText("Guy")).toBeInTheDocument();
  });

  it("可以取消勾选某个音色", async () => {
    render(<VoiceEditor {...props({ previewAdapter: adapter() })} />);
    openVoices();
    await waitFor(() => expect(screen.getByText("Sonia")).toBeInTheDocument());

    // 整行就是勾选靶子（role=checkbox），点名字也能勾，不必瞄准小方框
    const sonia = screen.getByLabelText("启用 Sonia · 英式女声");
    expect(sonia).toBeChecked();
    fireEvent.click(sonia);
    expect(sonia).not.toBeChecked();
  });

  it("逐音色试听，并把语速夹进该音色的范围", async () => {
    const synthesize = vi.fn().mockResolvedValue(previewResult());
    render(<VoiceEditor {...props({ previewAdapter: adapter(synthesize) })} />);
    // 0.50× = -50%，超出 Sonia 声明的 -10..10，必须夹到 -10。
    openTool("语速");
    fireEvent.click(button("语速 0.50 倍"));

    openVoices();
    await waitFor(() => expect(screen.getByText("Sonia")).toBeInTheDocument());
    fireEvent.click(button("试听 Sonia · 英式女声"));

    await waitFor(() => expect(synthesize).toHaveBeenCalledOnce());
    expect(synthesize.mock.calls[0]![0]).toMatchObject({
      voiceId: "sonia",
      ratePercent: -10
    });
    // 浮层内容在 jsdom 里带 antd 动效包装，可见性断言不可靠，只断言渲染出来
    await waitFor(() =>
      expect(screen.getByText(/播放中 Sonia/)).toBeInTheDocument()
    );
  });

  it("上传多个音频，各自记住添加时的语种与性别，并可移除", () => {
    render(<VoiceEditor {...props()} />);
    openTool("音频");
    const input = screen.getByLabelText("上传音频") as HTMLInputElement;
    expect(input.multiple).toBe(true);

    const wav = (name: string) =>
      new File([new Uint8Array([82, 73, 70, 70])], name, {
        type: "audio/wav"
      });
    fireEvent.change(input, {
      target: { files: [wav("a.wav"), wav("b.wav")] }
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    // 切换归属后再传，只影响之后添加的那条
    fireEvent.click(screen.getByLabelText("AmE"));
    fireEvent.change(input, { target: { files: [wav("c.wav")] } });
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(rows[0]).toContain("BrE");
    expect(rows[2]).toContain("AmE");

    fireEvent.click(screen.getByLabelText("移除 b.wav"));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("拒绝越界、非数字与空的自定义语速", () => {
    render(<VoiceEditor {...props()} />);
    openTool("语速");
    // 每次重新取输入框：报错横幅出现/消失会让浮层内容重挂，旧引用会失效。
    const rateInput = () => screen.getByLabelText("自定义语速倍数");
    const summary = () =>
      document.querySelector('[aria-label="语速"]')!.textContent;

    // 闭区间 0.50×–2.00× 之外、非数字、空值都要被拒
    for (const value of ["", "0.4", "2.1", "abc"]) {
      fireEvent.change(rateInput(), { target: { value } });
      fireEvent.keyDown(rateInput(), { key: "Enter" });
      expect(screen.getByText(/语速倍数必须在/)).toBeVisible();
      // 被拒后语速停在原值，不能半吊子地改掉
      expect(summary()).toContain("1.00×");
    }

    fireEvent.change(rateInput(), { target: { value: "1.5" } });
    fireEvent.keyDown(rateInput(), { key: "Enter" });
    expect(screen.queryByText(/语速倍数必须在/)).toBeNull();
    expect(summary()).toContain("1.50×");
  });

  it("试听上传的音频：再点一次停止，播放失败不留播放态", async () => {
    render(<VoiceEditor {...props()} />);
    openTool("音频");
    const input = screen.getByLabelText("上传音频");
    fireEvent.change(input, {
      target: {
        files: [
          new File([new Uint8Array([82, 73, 70, 70])], "a.wav", {
            type: "audio/wav"
          })
        ]
      }
    });

    fireEvent.click(button("试听 a.wav"));
    await waitFor(() => expect(AudioMock.instances).toHaveLength(1));
    const audio = AudioMock.instances[0]!;
    expect(audio.play).toHaveBeenCalledOnce();

    // 再点一次是停止，不该又起一路播放
    fireEvent.click(button("试听 a.wav"));
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(AudioMock.instances).toHaveLength(1);
  });

  it("没有 TTS 适配器时在音色面板里给出说明而不是空白", () => {
    render(<VoiceEditor {...props()} />);
    openVoices();
    expect(screen.getByText("TTS 后端未启用，仍可编辑")).toBeInTheDocument();
  });
});
