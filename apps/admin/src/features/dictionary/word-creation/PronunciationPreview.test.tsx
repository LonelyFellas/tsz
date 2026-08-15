import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { App as AntApp } from "antd";
import type { Dialect, RichTextV2 } from "@tsz/types";
import type { VoicePreviewResult } from "@tsz/voice-editor/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PronunciationPreviewControls,
  PronunciationPreviewProvider
} from "./PronunciationPreview";

const preview = vi.hoisted(() => ({
  enabled: true,
  listVoices: vi.fn(),
  synthesize: vi.fn()
}));

vi.mock("@/lib/env", () => ({
  env: {
    get VOICE_PREVIEW() {
      return preview.enabled;
    }
  }
}));

vi.mock("../voice-editor/dataSource", () => ({
  adminVoicePreviewAdapter: {
    listVoices: preview.listVoices,
    synthesize: preview.synthesize
  }
}));

class AudioMock {
  static instances: AudioMock[] = [];
  static playErrors: Error[] = [];
  readonly listeners = new Map<string, () => void>();
  play = vi.fn(() => {
    const error = AudioMock.playErrors.shift();
    return error ? Promise.reject(error) : Promise.resolve();
  });
  pause = vi.fn();

  constructor(readonly src: string) {
    AudioMock.instances.push(this);
  }

  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, listener);
  }

  emit(type: string) {
    this.listeners.get(type)?.();
  }
}

const voices = [
  {
    id: "common-default",
    label: "Common",
    locale: "en-AU",
    gender: "neutral" as const,
    styles: [],
    supportsRate: true,
    supportsPitch: true,
    isDefault: true
  },
  {
    id: "british-voice",
    label: "British",
    locale: "en-GB",
    gender: "female" as const,
    styles: [],
    supportsRate: true,
    supportsPitch: true,
    isDefault: false
  },
  {
    id: "american-voice",
    label: "American",
    locale: "en-US",
    gender: "male" as const,
    styles: [],
    supportsRate: true,
    supportsPitch: true,
    isDefault: false
  }
];

function result(
  overrides: Partial<VoicePreviewResult> = {}
): VoicePreviewResult {
  return {
    audioUrl: "https://audio.test/tomato.mp3",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    cached: false,
    ...overrides
  };
}

function PreviewHarness({
  spelling = "tomato",
  content,
  dialect = "common",
  readOnly = false
}: {
  spelling?: string;
  content?: RichTextV2;
  dialect?: Dialect;
  readOnly?: boolean;
}) {
  return (
    <AntApp>
      <PronunciationPreviewProvider readOnly={readOnly}>
        <PronunciationPreviewControls
          pronunciationId="pronunciation-stable-id"
          spelling={spelling}
          content={content}
          dialect={dialect}
          disabled={readOnly}
        />
      </PronunciationPreviewProvider>
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  preview.enabled = true;
  preview.listVoices.mockResolvedValue(voices);
  preview.synthesize.mockResolvedValue(result());
  AudioMock.instances = [];
  AudioMock.playErrors = [];
  vi.stubGlobal("Audio", AudioMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PronunciationPreview", { timeout: 10_000 }, () => {
  it("tomato 使用目录默认 voice 获取并自动播放，随后可手动重播", async () => {
    render(<PreviewHarness />);

    const getButton = screen.getByLabelText("获取语音");
    await waitFor(() => expect(getButton).toBeEnabled());
    fireEvent.click(getButton);

    await waitFor(() => expect(preview.synthesize).toHaveBeenCalledTimes(1));
    expect(preview.synthesize).toHaveBeenCalledWith(
      {
        language: "en",
        content: { version: 2, text: "tomato", annotations: [] },
        voiceId: "common-default"
      },
      { signal: expect.any(AbortSignal) }
    );
    await waitFor(
      () => expect(AudioMock.instances[0]?.play).toHaveBeenCalled(),
      { timeout: 5_000 }
    );
    expect(screen.getByLabelText("播放语音")).toBeEnabled();

    fireEvent.click(screen.getByLabelText("播放语音"));
    await waitFor(() => expect(AudioMock.instances).toHaveLength(2));
    expect(AudioMock.instances[1]?.play).toHaveBeenCalled();
  });

  it.each([
    ["uk", "colour", "british-voice"],
    ["us", "color", "american-voice"]
  ] as const)(
    "%s 使用匹配 locale 的 voice",
    async (dialect, spelling, voiceId) => {
      render(<PreviewHarness dialect={dialect} spelling={spelling} />);
      await waitFor(() =>
        expect(screen.getByLabelText("获取语音")).toBeEnabled()
      );
      fireEvent.click(screen.getByLabelText("获取语音"));
      await waitFor(() =>
        expect(preview.synthesize).toHaveBeenCalledWith(
          expect.objectContaining({
            content: { version: 2, text: spelling, annotations: [] },
            voiceId
          }),
          expect.anything()
        )
      );
    }
  );

  it("spelling 变化会取消并释放旧结果，禁止播放", async () => {
    const dispose = vi.fn();
    preview.synthesize.mockResolvedValue(result({ dispose }));
    const view = render(<PreviewHarness spelling="tomato" />);
    await waitFor(() =>
      expect(screen.getByLabelText("获取语音")).toBeEnabled()
    );
    fireEvent.click(screen.getByLabelText("获取语音"));
    await waitFor(
      () => expect(screen.getByLabelText("播放语音")).toBeEnabled(),
      { timeout: 5_000 }
    );

    view.rerender(<PreviewHarness spelling="tomatoes" />);

    await waitFor(() =>
      expect(screen.getByLabelText("播放语音")).toBeDisabled()
    );
    expect(AudioMock.instances[0]?.pause).toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("富文本标注变化会释放旧结果并把完整内容发送给真实 adapter", async () => {
    const dispose = vi.fn();
    preview.synthesize.mockResolvedValue(result({ dispose }));
    const initial: RichTextV2 = {
      version: 2,
      text: "a record",
      annotations: []
    };
    const view = render(<PreviewHarness content={initial} dialect="uk" />);
    await waitFor(() =>
      expect(screen.getByLabelText("获取语音")).toBeEnabled()
    );
    fireEvent.click(screen.getByLabelText("获取语音"));
    await waitFor(() =>
      expect(screen.getByLabelText("播放语音")).toBeEnabled()
    );

    const annotated: RichTextV2 = {
      ...initial,
      annotations: [{ type: "emphasis", start: 2, end: 8, level: "strong" }]
    };
    view.rerender(<PreviewHarness content={annotated} dialect="uk" />);

    await waitFor(() =>
      expect(screen.getByLabelText("播放语音")).toBeDisabled()
    );
    expect(dispose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText("获取语音"));
    await waitFor(() =>
      expect(preview.synthesize).toHaveBeenLastCalledWith(
        expect.objectContaining({ content: annotated }),
        expect.anything()
      )
    );
  });

  it("失败后恢复按钮并允许重试", async () => {
    preview.synthesize
      .mockRejectedValueOnce(
        new Error("语音或存储服务暂不可用，请稍后手动重试")
      )
      .mockResolvedValueOnce(result());
    render(<PreviewHarness />);
    const getButton = screen.getByLabelText("获取语音");
    await waitFor(() => expect(getButton).toBeEnabled());

    fireEvent.click(getButton);
    expect(
      await screen.findByText("语音或存储服务暂不可用，请稍后手动重试")
    ).toBeInTheDocument();
    await waitFor(() => expect(getButton).toBeEnabled());
    fireEvent.click(getButton);

    await waitFor(() => expect(preview.synthesize).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("播放语音")).toBeEnabled();
  });

  it("请求在途时阻止重复点击", async () => {
    let resolvePreview!: (value: VoicePreviewResult) => void;
    preview.synthesize.mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve;
      })
    );
    render(<PreviewHarness />);
    const getButton = screen.getByLabelText("获取语音");
    await waitFor(() => expect(getButton).toBeEnabled());
    fireEvent.click(getButton);
    fireEvent.click(getButton);

    expect(preview.synthesize).toHaveBeenCalledTimes(1);
    expect(getButton).toBeDisabled();
    await act(async () => resolvePreview(result()));
  });

  it("URL 到期后释放结果并禁用播放", async () => {
    vi.useFakeTimers();
    const dispose = vi.fn();
    preview.synthesize.mockResolvedValue(
      result({
        expiresAt: new Date(Date.now() + 1_000).toISOString(),
        dispose
      })
    );
    render(<PreviewHarness />);
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByLabelText("获取语音"));
    await act(async () => Promise.resolve());
    expect(screen.getByLabelText("播放语音")).toBeEnabled();

    act(() => vi.advanceTimersByTime(1_000));

    expect(screen.getByLabelText("播放语音")).toBeDisabled();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("不可解析的过期时间会释放结果且不播放", async () => {
    const dispose = vi.fn();
    preview.synthesize.mockResolvedValue(
      result({ expiresAt: "not-a-date", dispose })
    );
    render(<PreviewHarness />);
    await waitFor(() =>
      expect(screen.getByLabelText("获取语音")).toBeEnabled()
    );

    fireEvent.click(screen.getByLabelText("获取语音"));

    await waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
    expect(AudioMock.instances).toHaveLength(0);
    expect(screen.getByLabelText("播放语音")).toBeDisabled();
  });

  it.each([
    ["功能开关关闭", false, false],
    ["只读模式", true, true]
  ])("%s 时安全禁用且不加载 voice", (_label, readOnly, enabled) => {
    preview.enabled = enabled;
    render(<PreviewHarness readOnly={readOnly} />);

    expect(screen.getByLabelText("获取语音")).toBeDisabled();
    expect(screen.getByLabelText("播放语音")).toBeDisabled();
    expect(preview.listVoices).not.toHaveBeenCalled();
  });

  it("卸载时 abort 在途请求", async () => {
    let signal: AbortSignal | undefined;
    preview.synthesize.mockImplementation((_input, options) => {
      signal = options?.signal;
      return new Promise(() => undefined);
    });
    const view = render(<PreviewHarness />);
    await waitFor(() =>
      expect(screen.getByLabelText("获取语音")).toBeEnabled()
    );
    fireEvent.click(screen.getByLabelText("获取语音"));
    await waitFor(() => expect(signal).toBeDefined());

    view.unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("自动播放拒绝后保留结果，手动播放拒绝显示错误", async () => {
    AudioMock.playErrors = [
      new Error("autoplay blocked"),
      new Error("play blocked")
    ];
    render(<PreviewHarness />);
    await waitFor(() =>
      expect(screen.getByLabelText("获取语音")).toBeEnabled()
    );
    fireEvent.click(screen.getByLabelText("获取语音"));
    await waitFor(() =>
      expect(screen.getByLabelText("播放语音")).toBeEnabled()
    );

    fireEvent.click(screen.getByLabelText("播放语音"));

    expect(
      await screen.findByText("播放失败，请检查浏览器音频权限后重试")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("播放语音")).toBeEnabled();
  });

  it("目标 locale 无 voice 或 spelling 为空时不请求合成", async () => {
    preview.listVoices.mockResolvedValue([voices[0]]);
    const view = render(<PreviewHarness dialect="uk" />);
    await waitFor(() => expect(preview.listVoices).toHaveBeenCalled());
    expect(screen.getByLabelText("获取语音")).toBeDisabled();

    view.rerender(<PreviewHarness spelling=" " />);
    expect(screen.getByLabelText("获取语音")).toBeDisabled();
    expect(preview.synthesize).not.toHaveBeenCalled();
  });
});
