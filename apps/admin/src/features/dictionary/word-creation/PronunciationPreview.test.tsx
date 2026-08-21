import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import type { Dialect, RichTextV2 } from "@tsz/types";
import type { VoicePreviewResult } from "@tsz/voice-editor/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PronunciationPreviewControls,
  PronunciationPreviewProvider,
  usePronunciationVoiceNotice
} from "./PronunciationPreview";
import { deferred } from "./wordCreation.test.helper";

const preview = vi.hoisted(() => ({
  enabled: true,
  mocked: false,
  listVoices: vi.fn(),
  synthesize: vi.fn()
}));

const message = vi.hoisted(() => ({
  error: vi.fn()
}));

vi.mock("antd", async (importOriginal) => {
  const antd = await importOriginal<typeof import("antd")>();
  return {
    ...antd,
    App: {
      useApp: () => ({ message })
    }
  };
});

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
  },
  get voicePreviewIsMock() {
    return preview.mocked;
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

// 统一内容的发音人按管理员方言偏好挑（A1 阶段 5），测试里直接注入。
const dialectPreference = vi.hoisted(() => ({ value: "uk" as "uk" | "us" }));
vi.mock("@/features/settings/useDialectPreference", () => ({
  useDialectPreference: () => ({
    preference: dialectPreference.value,
    savePreference: vi.fn()
  })
}));

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
    <PronunciationPreviewProvider readOnly={readOnly}>
      <PronunciationPreviewControls
        pronunciationId="pronunciation-stable-id"
        spelling={spelling}
        content={content}
        dialect={dialect}
        disabled={readOnly}
        audioFactory={(src) =>
          new AudioMock(src) as unknown as HTMLAudioElement
        }
      />
    </PronunciationPreviewProvider>
  );
}

function VoiceNotice({ dialects }: { dialects: Dialect[] }) {
  const notice = usePronunciationVoiceNotice(dialects);
  return <span data-testid="voice-notice">{notice ?? "无提示"}</span>;
}

function NoticeHarness({
  dialects = ["uk", "us"] as Dialect[]
}: {
  dialects?: Dialect[];
}) {
  return (
    <PronunciationPreviewProvider>
      <VoiceNotice dialects={dialects} />
    </PronunciationPreviewProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  preview.enabled = true;
  preview.mocked = false;
  dialectPreference.value = "uk";
  preview.listVoices.mockResolvedValue(voices);
  preview.synthesize.mockResolvedValue(result());
  message.error.mockReset();
  AudioMock.instances = [];
  AudioMock.playErrors = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PronunciationPreview", () => {
  it("偏好切到美式后，统一内容改挑 en-US 发音人", async () => {
    dialectPreference.value = "us";
    render(<PreviewHarness />);

    const getButton = screen.getByLabelText("获取语音");
    await waitFor(() => expect(getButton).toBeEnabled());
    fireEvent.click(getButton);

    await waitFor(() => expect(preview.synthesize).toHaveBeenCalledTimes(1));
    expect(preview.synthesize.mock.calls[0]![0].voiceId).toBe("american-voice");
  });

  it("明确标了方言的内容找不到对应发音人时不降级，直接禁用并说明", async () => {
    preview.listVoices.mockResolvedValue(
      voices.filter((voice) => voice.locale !== "en-GB")
    );
    render(<PreviewHarness dialect="uk" />);

    // 英式内容配不到 en-GB 发音人时保持禁用，不静默改用美式音朗读。
    await waitFor(() => expect(preview.listVoices).toHaveBeenCalled());
    expect(screen.getByLabelText("获取语音")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("获取语音"));
    expect(preview.synthesize).not.toHaveBeenCalled();
  });

  it("偏好侧发音人缺席时，统一内容回退目录默认，仍可试听", async () => {
    preview.listVoices.mockResolvedValue(
      voices.filter((voice) => voice.locale !== "en-GB")
    );
    render(<PreviewHarness />);

    const getButton = screen.getByLabelText("获取语音");
    await waitFor(() => expect(getButton).toBeEnabled());
    fireEvent.click(getButton);

    await waitFor(() => expect(preview.synthesize).toHaveBeenCalledTimes(1));
    expect(preview.synthesize.mock.calls[0]![0].voiceId).toBe("common-default");
  });

  it("统一内容按方言偏好挑发音人，获取后自动播放且可手动重播", async () => {
    const pending = deferred<VoicePreviewResult>();
    preview.synthesize.mockReturnValue(pending.promise);
    render(<PreviewHarness />);

    const getButton = screen.getByLabelText("获取语音");
    await waitFor(() => expect(getButton).toBeEnabled());
    fireEvent.click(getButton);

    await waitFor(() => expect(preview.synthesize).toHaveBeenCalledTimes(1));
    expect(preview.synthesize).toHaveBeenCalledWith(
      {
        language: "en",
        content: { version: 2, text: "tomato", annotations: [] },
        // 统一内容没有自己的方言，按管理员偏好（缺省英式）挑 en-GB 发音人。
        voiceId: "british-voice"
      },
      { signal: expect.any(AbortSignal) }
    );
    await act(async () => pending.resolve(result()));
    expect(AudioMock.instances).toHaveLength(1);
    expect(AudioMock.instances[0]!.play).toHaveBeenCalledTimes(1);
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
    await waitFor(() =>
      expect(screen.getByLabelText("播放语音")).toBeEnabled()
    );

    view.rerender(<PreviewHarness spelling="tomatoes" />);

    await waitFor(() =>
      expect(screen.getByLabelText("播放语音")).toBeDisabled()
    );
    expect(AudioMock.instances[0]?.pause).toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
  }, 10_000);

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
    const failed = deferred<VoicePreviewResult>();
    const succeeded = deferred<VoicePreviewResult>();
    preview.synthesize
      .mockReturnValueOnce(failed.promise)
      .mockReturnValueOnce(succeeded.promise);
    render(<PreviewHarness />);
    const getButton = screen.getByLabelText("获取语音");
    await waitFor(() => expect(getButton).toBeEnabled());

    fireEvent.click(getButton);
    await waitFor(() => expect(preview.synthesize).toHaveBeenCalledTimes(1));
    await act(async () =>
      failed.reject(new Error("语音或存储服务暂不可用，请稍后手动重试"))
    );
    expect(message.error).toHaveBeenCalledWith(
      "语音或存储服务暂不可用，请稍后手动重试"
    );
    expect(getButton).toBeEnabled();
    fireEvent.click(getButton);

    await waitFor(() => expect(preview.synthesize).toHaveBeenCalledTimes(2));
    await act(async () => succeeded.resolve(result()));
    expect(screen.getByLabelText("播放语音")).toBeEnabled();
  });

  it("请求在途时阻止重复点击", async () => {
    const pending = deferred<VoicePreviewResult>();
    preview.synthesize
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(result());
    render(<PreviewHarness />);
    const getButton = screen.getByLabelText("获取语音");
    await waitFor(() => expect(getButton).toBeEnabled());
    fireEvent.click(getButton);
    fireEvent.click(getButton);

    expect(preview.synthesize).toHaveBeenCalledTimes(1);
    expect(getButton).toBeDisabled();
    await act(async () => pending.resolve(result()));
    expect(getButton).toBeEnabled();

    fireEvent.click(getButton);
    await waitFor(() => expect(preview.synthesize).toHaveBeenCalledTimes(2));
  });

  it("URL 到期后释放结果并禁用播放", async () => {
    vi.useFakeTimers();
    const dispose = vi.fn();
    const pending = deferred<VoicePreviewResult>();
    preview.synthesize.mockReturnValue(pending.promise);
    const previewResult = result({
      expiresAt: new Date(Date.now() + 1_000).toISOString(),
      dispose
    });
    render(<PreviewHarness />);
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByLabelText("获取语音"));
    await act(async () => pending.resolve(previewResult));
    expect(screen.getByLabelText("播放语音")).toBeEnabled();

    await act(async () => vi.advanceTimersByTimeAsync(1_000));

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

    await waitFor(() =>
      expect(message.error).toHaveBeenCalledWith(
        "播放失败，请检查浏览器音频权限后重试"
      )
    );
    expect(screen.getByLabelText("播放语音")).toBeEnabled();
  });

  it("走真实 TTS 时不显示模拟标记", async () => {
    render(<PreviewHarness />);
    await waitFor(() =>
      expect(screen.getByLabelText("获取语音")).toBeEnabled()
    );

    expect(screen.queryByText("模拟")).toBeNull();
  });

  it("走 mock 适配器时显示模拟标记", async () => {
    preview.mocked = true;
    render(<PreviewHarness />);
    await waitFor(() =>
      expect(screen.getByLabelText("获取语音")).toBeEnabled()
    );

    expect(screen.getByText("模拟")).toBeVisible();
  });

  it("缺少某侧发音人时给出无需悬停的常驻说明", async () => {
    preview.listVoices.mockResolvedValue([voices[0], voices[2]]);
    render(<NoticeHarness />);

    await waitFor(() =>
      expect(screen.getByTestId("voice-notice")).toHaveTextContent(
        "英式（en-GB）暂无可用发音人，对应的「获取语音」已禁用"
      )
    );
  });

  it("两侧发音人齐全时不显示常驻说明", async () => {
    render(<NoticeHarness />);

    await waitFor(() => expect(preview.listVoices).toHaveBeenCalled());
    expect(screen.getByTestId("voice-notice")).toHaveTextContent("无提示");
  });

  it("试听功能关闭时不显示常驻说明", () => {
    preview.enabled = false;
    render(<NoticeHarness />);

    expect(screen.getByTestId("voice-notice")).toHaveTextContent("无提示");
    expect(preview.listVoices).not.toHaveBeenCalled();
  });

  it("发音人目录为空时透出目录层面的原因", async () => {
    preview.listVoices.mockResolvedValue([]);
    render(<NoticeHarness />);

    await waitFor(() =>
      expect(screen.getByTestId("voice-notice")).toHaveTextContent(
        "暂无可用发音人"
      )
    );
  });

  it("发音人目录加载失败时透出加载错误", async () => {
    preview.listVoices.mockRejectedValue(new Error("目录服务不可用"));
    render(<NoticeHarness />);

    await waitFor(() =>
      expect(screen.getByTestId("voice-notice")).toHaveTextContent(
        "目录服务不可用"
      )
    );
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
