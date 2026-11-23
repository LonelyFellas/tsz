import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import type { Dialect, RichTextV2, VoiceProfileV3 } from "@tsz/types";
import type {
  VoicePreviewResult,
  VoiceRecommendationArea
} from "@tsz/voice-editor/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PronunciationPreviewControls,
  PronunciationPreviewProvider,
  PronunciationPreviewVoiceList,
  PronunciationPreviewVoiceSummary,
  usePronunciationVoiceNotice
} from "./PronunciationPreview";
import { deferred } from "./wordCreation.test.helper";
import { V3EnglishTextPreview } from "../word-creation-v3/components/V3EnglishTextPreview";
import { queryClient } from "@/lib/queryClient";

const preview = vi.hoisted(() => ({
  enabled: true,
  mocked: false,
  listVoices: vi.fn(),
  synthesize: vi.fn(),
  resolveVoices: vi.fn(),
  resolveAudio: vi.fn()
}));

const message = vi.hoisted(() => ({
  error: vi.fn()
}));

vi.mock("@tsz/ui/admin/overlays", async (importOriginal) => {
  const antd = await importOriginal<typeof import("@tsz/ui/admin/overlays")>();
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
    synthesize: preview.synthesize,
    resolveVoices: preview.resolveVoices,
    resolveAudio: preview.resolveAudio
  },
  get voicePreviewIsMock() {
    return preview.mocked;
  }
}));

class AudioMock {
  static instances: AudioMock[] = [];
  readonly listeners = new Map<string, () => void>();
  play = vi.fn(async () => {});
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
  voiceProfile,
  recommendationArea,
  playbackOnly,
  assetOnly,
  audioAssetId,
  dialect = "common",
  readOnly = false,
  loadVoicesOnMount = true,
  resolveVoicesOnMount = true
}: {
  spelling?: string;
  content?: RichTextV2;
  voiceProfile?: VoiceProfileV3;
  recommendationArea?: VoiceRecommendationArea;
  playbackOnly?: boolean;
  assetOnly?: boolean;
  audioAssetId?: string;
  dialect?: Dialect;
  readOnly?: boolean;
  loadVoicesOnMount?: boolean;
  resolveVoicesOnMount?: boolean;
}) {
  return (
    <PronunciationPreviewProvider
      readOnly={readOnly}
      loadVoicesOnMount={loadVoicesOnMount}
      resolveVoicesOnMount={resolveVoicesOnMount}
    >
      <PronunciationPreviewControls
        pronunciationId="pronunciation-stable-id"
        spelling={spelling}
        content={content}
        voiceProfile={voiceProfile}
        recommendationArea={recommendationArea}
        playbackOnly={playbackOnly}
        assetOnly={assetOnly}
        audioAssetId={audioAssetId}
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
  return (
    <span data-testid="voice-notice" data-kind={notice?.kind}>
      {notice?.title ?? "无提示"}
    </span>
  );
}

function NoticeHarness({
  dialects = ["uk", "us"] as Dialect[]
}: {
  dialects?: Dialect[];
}) {
  return (
    <PronunciationPreviewProvider loadVoicesOnMount resolveVoicesOnMount>
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
  preview.resolveAudio.mockReset().mockResolvedValue(result());
  message.error.mockReset();
  AudioMock.instances = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([undefined, { voices: [] }])(
  "未配置快捷试听采用最新板块推荐，返回页面后刷新：%j",
  async (voiceProfile) => {
    const recommended = (rate: number) => [
      {
        voice_id: "british-voice",
        version_id: "current",
        locale: "en-GB",
        enabled: true,
        rate_percent: rate,
        volume_percent: 93
      }
    ];
    preview.resolveVoices.mockReset().mockResolvedValue({
      voices: recommended(-10),
      source: { kind: "catalog" }
    });
    render(
      <PreviewHarness recommendationArea="azure" voiceProfile={voiceProfile} />
    );
    await waitFor(() => expect(preview.resolveVoices).toHaveBeenCalled());
    expect(preview.resolveVoices.mock.calls[0]![0].profile).toMatchObject({
      voices: [],
      dubbing: {
        area: "azure",
        uk: { mode: "inherit" },
        us: { mode: "inherit" }
      }
    });
    fireEvent.click(screen.getByLabelText("获取语音"));
    await waitFor(() =>
      expect(preview.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({
          voiceId: "british-voice",
          ratePercent: -10,
          volumePercent: 93
        }),
        expect.anything()
      )
    );
    preview.resolveVoices.mockResolvedValue({
      voices: recommended(-25),
      source: { kind: "catalog" }
    });
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(preview.resolveVoices).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByLabelText("获取语音")).toBeEnabled()
    );
    fireEvent.click(screen.getByLabelText("获取语音"));
    await waitFor(() =>
      expect(preview.synthesize).toHaveBeenLastCalledWith(
        expect.objectContaining({ ratePercent: -25, volumePercent: 93 }),
        expect.anything()
      )
    );
  }
);

it("进入页面不读取音色目录，点击获取语音后才按需读取", async () => {
  render(
    <PreviewHarness loadVoicesOnMount={false} resolveVoicesOnMount={false} />
  );
  expect(preview.listVoices).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("获取语音"));
  await waitFor(() => expect(preview.listVoices).toHaveBeenCalledOnce());
  await waitFor(() => expect(preview.synthesize).toHaveBeenCalledOnce());
});

it("进入页面不解析推荐音色，点击获取语音后才按需解析", async () => {
  preview.resolveVoices.mockResolvedValue({
    voices: [
      {
        voice_id: "british-voice",
        version_id: "current",
        locale: "en-GB",
        enabled: true,
        rate_percent: 0
      }
    ],
    source: { kind: "catalog" }
  });
  render(
    <PreviewHarness
      loadVoicesOnMount={false}
      resolveVoicesOnMount={false}
      dialect="uk"
      voiceProfile={{
        voices: [],
        dubbing: {
          area: "word",
          uk: { mode: "inherit" },
          us: { mode: "inherit" }
        }
      }}
    />
  );
  expect(preview.resolveVoices).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("获取语音"));
  await waitFor(() => expect(preview.resolveVoices).toHaveBeenCalledOnce());
  await waitFor(() => expect(preview.synthesize).toHaveBeenCalledOnce());
});

it("默认音色摘要与播放合并解析，保存推荐后同步新参数", async () => {
  const setting = {
    voice_id: "british-voice",
    version_id: "current",
    locale: "en-GB",
    enabled: true,
    rate_percent: -10
  };
  preview.resolveVoices
    .mockReset()
    .mockResolvedValue({ voices: [setting], source: { kind: "catalog" } });
  const content: RichTextV2 = { version: 2, text: "hello", annotations: [] };
  render(
    <PronunciationPreviewProvider loadVoicesOnMount resolveVoicesOnMount>
      <PronunciationPreviewVoiceSummary
        dialect="uk"
        recommendationArea="word"
        content={content}
        column="rate"
      />
      <PronunciationPreviewControls
        pronunciationId="default"
        dialect="uk"
        recommendationArea="word"
        content={content}
      />
    </PronunciationPreviewProvider>
  );
  expect(await screen.findByText("0.90×")).toBeVisible();
  expect(preview.resolveVoices).toHaveBeenCalledTimes(1);
  preview.resolveVoices.mockResolvedValue({
    voices: [{ ...setting, rate_percent: -25 }],
    source: { kind: "catalog" }
  });
  act(() =>
    queryClient.setQueryData(["admin-dubbing-groups-v3", "actor"], {
      revision: 2
    })
  );
  expect(await screen.findByText("0.75×")).toBeVisible();
  expect(preview.resolveVoices).toHaveBeenCalledTimes(2);
  queryClient.removeQueries({ queryKey: ["admin-dubbing-groups-v3", "actor"] });
});

describe("PronunciationPreview", () => {
  it("局部合成回写后可直接播放，参数变更清除绑定后禁止复用旧音频", async () => {
    const setting = {
      voice_id: "british-voice",
      enabled: true,
      rate_percent: 0
    };
    const view = render(
      <PreviewHarness voiceProfile={{ voices: [setting] }} />
    );
    const play = screen.getByLabelText("播放语音");
    await waitFor(() =>
      expect(screen.getByLabelText("获取语音")).toBeEnabled()
    );
    expect(play).toBeDisabled();
    view.rerender(
      <PreviewHarness
        voiceProfile={{
          voices: [{ ...setting, audio_asset_id: "local-audio" }]
        }}
      />
    );
    expect(play).toBeEnabled();
    fireEvent.click(play);
    await waitFor(() =>
      expect(AudioMock.instances[0]?.play).toHaveBeenCalled()
    );
    expect(preview.resolveAudio).toHaveBeenCalledWith(
      "local-audio",
      expect.anything()
    );
    expect(preview.synthesize).not.toHaveBeenCalled();
    view.rerender(
      <PreviewHarness
        voiceProfile={{ voices: [{ ...setting, volume_percent: 65 }] }}
      />
    );
    expect(play).toBeDisabled();
    expect(AudioMock.instances[0]?.pause).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("获取语音"));
    await waitFor(() =>
      expect(preview.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({ volumePercent: 65 }),
        expect.anything()
      )
    );
    expect(preview.resolveAudio).toHaveBeenCalledOnce();
  });

  it("已有音频读取失败或地址过期时重新读取，不再次合成", async () => {
    vi.useFakeTimers();
    const dispose = vi.fn();
    preview.resolveAudio
      .mockRejectedValueOnce(new Error("正式音频暂不可用"))
      .mockResolvedValueOnce(
        result({
          expiresAt: new Date(Date.now() + 1_000).toISOString(),
          dispose
        })
      );
    render(
      <PreviewHarness
        voiceProfile={{
          voices: [
            {
              voice_id: "british-voice",
              enabled: true,
              rate_percent: 0,
              audio_asset_id: "local-audio"
            }
          ]
        }}
      />
    );
    await act(async () => Promise.resolve());
    const play = screen.getByLabelText("播放语音");
    expect(play).toBeEnabled();
    await act(async () => fireEvent.click(play));
    expect(message.error).toHaveBeenCalledWith("正式音频暂不可用");
    expect(play).toBeEnabled();
    await act(async () => fireEvent.click(play));
    expect(AudioMock.instances[0]?.play).toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(dispose).toHaveBeenCalledOnce();
    expect(play).toBeEnabled();
    await act(async () => fireEvent.click(play));
    expect(preview.resolveAudio).toHaveBeenCalledTimes(3);
    expect(preview.synthesize).not.toHaveBeenCalled();
  });

  it("音量摘要随继承解析更新，不显示旧快照或失败后的默认音量", async () => {
    const resolved = deferred<VoiceProfileV3["voices"]>();
    preview.resolveVoices.mockReturnValueOnce(
      resolved.promise.then((voices) => ({
        voices,
        source: { kind: "catalog" }
      }))
    );
    const voiceProfile: VoiceProfileV3 = {
      voices: [
        {
          voice_id: "british-voice",
          enabled: true,
          rate_percent: 0,
          volume_percent: 90
        }
      ],
      dubbing: {
        area: "word" as const,
        uk: { mode: "inherit" },
        us: { mode: "inherit" }
      }
    };
    const summary = (content: string) => (
      <PronunciationPreviewProvider loadVoicesOnMount resolveVoicesOnMount>
        <PronunciationPreviewVoiceSummary
          dialect="uk"
          column="volume"
          voiceProfile={voiceProfile}
          content={{ version: 2, text: content, annotations: [] }}
        />
      </PronunciationPreviewProvider>
    );
    const { rerender } = render(summary("tomato"));
    expect(screen.getByText("—")).toBeInTheDocument();
    await act(async () => {
      resolved.resolve([
        {
          voice_id: "british-voice",
          enabled: true,
          rate_percent: 0,
          volume_percent: 40
        }
      ]);
    });
    expect(await screen.findByText("40%")).toBeInTheDocument();
    preview.resolveVoices.mockRejectedValueOnce(new Error("读法已变化"));
    rerender(summary("tomatoes"));
    await waitFor(() => expect(preview.resolveVoices).toHaveBeenCalledTimes(2));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("40%")).not.toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
  });

  it("继承快捷播放采用当前解析结果且不使用旧快照默认", async () => {
    preview.resolveVoices.mockResolvedValue({
      voices: [
        {
          voice_id: "british-voice",
          version_id: "current",
          version_name: "current",
          locale: "en-GB",
          enabled: true,
          rate_percent: -27
        }
      ],
      source: { kind: "catalog" }
    });
    render(
      <PreviewHarness
        voiceProfile={{
          voices: [
            { voice_id: "british-voice", enabled: true, rate_percent: 0 }
          ],
          dubbing: {
            area: "word" as const,
            uk: { mode: "inherit" },
            us: { mode: "inherit" }
          }
        }}
      />
    );
    const getButton = screen.getByLabelText("获取语音");
    await waitFor(() => expect(getButton).toBeEnabled());
    fireEvent.click(getButton);
    await waitFor(() => expect(preview.synthesize).toHaveBeenCalled());
    expect(preview.synthesize.mock.calls[0]![0]).toMatchObject({
      voiceId: "british-voice",
      ratePercent: -27
    });
  });
  it("继承解析失败时禁用快捷播放，不退回目录默认音色", async () => {
    preview.resolveVoices.mockRejectedValue(new Error("读法已变化"));
    render(
      <PreviewHarness
        voiceProfile={{
          voices: [],
          dubbing: {
            area: "word" as const,
            uk: { mode: "inherit" },
            us: { mode: "inherit" }
          }
        }}
      />
    );
    await waitFor(() => expect(preview.resolveVoices).toHaveBeenCalled());
    expect(screen.getByLabelText("获取语音")).toBeDisabled();
    expect(preview.synthesize).not.toHaveBeenCalled();
  });
  it.each([
    ["uk", "en-GB", "en-gb-sonia"],
    ["us", "en-US", "en-us-aria"]
  ] as const)(
    "扩大 %s 目录后保留原默认音色",
    async (preference, locale, id) => {
      dialectPreference.value = preference;
      preview.listVoices.mockResolvedValue([
        { ...voices[0]!, id: "alphabetically-first", locale },
        { ...voices[0]!, id, locale }
      ]);
      render(<PreviewHarness />);
      const button = screen.getByLabelText("获取语音");
      await waitFor(() => expect(button).toBeEnabled());
      fireEvent.click(button);
      await waitFor(() => expect(preview.synthesize).toHaveBeenCalledTimes(1));
      expect(preview.synthesize.mock.calls[0]![0].voiceId).toBe(id);
    }
  );

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

  it("偏好侧发音人缺席时，通用内容也禁止跨口音回退", async () => {
    preview.listVoices.mockResolvedValue(
      voices.filter((voice) => voice.locale !== "en-GB")
    );
    render(<PreviewHarness />);

    const getButton = screen.getByLabelText("获取语音");
    await waitFor(() => expect(preview.listVoices).toHaveBeenCalled());
    expect(getButton).toBeDisabled();
    fireEvent.click(getButton);
    expect(preview.synthesize).not.toHaveBeenCalled();
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

  it("目录请求取消后，仍需音色的页面重新加载且不显示错误", async () => {
    preview.listVoices.mockImplementationOnce(() => new Promise(() => {}));
    render(<NoticeHarness />);
    await waitFor(() => expect(preview.listVoices).toHaveBeenCalledOnce());
    await act(async () => {
      await queryClient.cancelQueries({
        queryKey: ["admin-speech", "voices", "en"]
      });
    });
    expect(screen.getByTestId("voice-notice")).toHaveTextContent("无提示");
    await waitFor(() => expect(preview.listVoices).toHaveBeenCalledTimes(2));
  });

  it("推荐音色解析被取消后重新解析，仍可试听", async () => {
    preview.resolveVoices
      .mockReset()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue({
        voices: [{ voice_id: "british-voice", enabled: true, rate_percent: 0 }],
        source: { kind: "catalog" }
      });
    render(<PreviewHarness recommendationArea="azure" />);
    await waitFor(() => expect(preview.resolveVoices).toHaveBeenCalledOnce());
    await act(async () => {
      await queryClient.cancelQueries({ queryKey: ["pronunciation-preview"] });
    });
    await waitFor(() => expect(preview.resolveVoices).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByLabelText("获取语音")).toBeEnabled()
    );
    fireEvent.click(screen.getByLabelText("获取语音"));
    await waitFor(() => expect(preview.synthesize).toHaveBeenCalledOnce());
    expect(message.error).not.toHaveBeenCalled();
  });

  it("发音人目录为空时透出目录层面的原因", async () => {
    preview.listVoices.mockResolvedValue([]);
    render(<NoticeHarness />);

    await waitFor(() =>
      expect(screen.getByTestId("voice-notice")).toHaveTextContent(
        "暂无可用发音人"
      )
    );
    expect(screen.getByTestId("voice-notice")).toHaveAttribute(
      "data-kind",
      "missing"
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
    expect(screen.getByTestId("voice-notice")).toHaveAttribute(
      "data-kind",
      "load-error"
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

it.each(["uk", "us"] as const)(
  "英文正文审阅采用%s默认录音，取消后恢复原合成音频",
  async (side) => {
    vi.stubGlobal("Audio", AudioMock);
    dialectPreference.value = side;
    const value: import("@tsz/types").EnglishTextV3 = {
      mode: "unified",
      common: {
        id: "text",
        origin: "manual",
        value: { version: 2, text: "tomato", annotations: [] },
        voice_profile: {
          voices: (["en-GB", "en-US"] as const).map((locale) => ({
            voice_id: "voice-" + locale,
            locale,
            enabled: true,
            rate_percent: 0,
            audio_asset_id: "generated-" + locale
          }))
        },
        audio_assets: (["en-GB", "en-US"] as const).map((locale) => ({
          id: "recording-" + locale,
          is_default: true,
          locale,
          gender: "female",
          content_type: "audio/mpeg",
          size_bytes: 3,
          original_name: "fixture.mp3",
          created_at: "2026-11-10T00:00:00Z"
        }))
      }
    };
    const view = render(
      <PronunciationPreviewProvider loadVoicesOnMount resolveVoicesOnMount>
        <V3EnglishTextPreview value={value} showPlayback />
      </PronunciationPreviewProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: /播放语音/ }));
    const locale = side === "uk" ? "en-GB" : "en-US";
    await waitFor(() =>
      expect(preview.resolveAudio).toHaveBeenLastCalledWith(
        "recording-" + locale,
        expect.anything()
      )
    );
    value.common.audio_assets!.forEach((asset) => {
      delete asset.is_default;
    });
    view.rerender(
      <PronunciationPreviewProvider loadVoicesOnMount resolveVoicesOnMount>
        <V3EnglishTextPreview value={value} showPlayback />
      </PronunciationPreviewProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: /播放语音/ }));
    await waitFor(() =>
      expect(preview.resolveAudio).toHaveBeenLastCalledWith(
        "generated-" + locale,
        expect.anything()
      )
    );
    expect(preview.synthesize).not.toHaveBeenCalled();
  }
);

it("最终读音只读取正式资产，读取失败也不回退合成", async () => {
  preview.listVoices.mockResolvedValue([]);
  const view = render(<PreviewHarness playbackOnly audioAssetId="formal-us" />);
  const play = screen.getByRole("button", { name: "播放语音" });
  expect(play).toBeEnabled();
  fireEvent.click(play);
  await waitFor(() =>
    expect(preview.resolveAudio).toHaveBeenCalledWith(
      "formal-us",
      expect.anything()
    )
  );
  await waitFor(() => expect(AudioMock.instances[0]?.play).toHaveBeenCalled());
  expect(preview.synthesize).not.toHaveBeenCalled();
  preview.resolveAudio.mockRejectedValue(new Error("asset unavailable"));
  view.rerender(<PreviewHarness playbackOnly audioAssetId="another-formal" />);
  fireEvent.click(play);
  await waitFor(() => expect(message.error).toHaveBeenCalled());
  expect(preview.synthesize).not.toHaveBeenCalled();
});

it("重开词条后首次点击，会等待音色目录并播放已保存的正式音频", async () => {
  const catalog = deferred<typeof voices>();
  const formalAudio = deferred<VoicePreviewResult>();
  const setting = {
    voice_id: "american-voice",
    version_id: "current",
    locale: "en-US" as const,
    enabled: true,
    rate_percent: 0
  };
  preview.listVoices.mockReturnValueOnce(catalog.promise);
  preview.resolveAudio.mockReturnValueOnce(formalAudio.promise);
  preview.resolveVoices.mockResolvedValueOnce({
    voices: [setting],
    source: { kind: "catalog" }
  });
  render(
    <PreviewHarness
      dialect="us"
      playbackOnly
      loadVoicesOnMount={false}
      resolveVoicesOnMount={false}
      voiceProfile={{
        voices: [{ ...setting, audio_asset_id: "formal-us" }],
        dubbing: {
          area: "word",
          uk: { mode: "inherit" },
          us: { mode: "inherit" }
        }
      }}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "播放语音" }));
  await waitFor(() => expect(preview.listVoices).toHaveBeenCalledOnce());
  await act(async () => catalog.resolve(voices));

  await waitFor(() =>
    expect(preview.resolveAudio).toHaveBeenCalledExactlyOnceWith(
      "formal-us",
      expect.anything()
    )
  );
  await act(async () => formalAudio.resolve(result()));
  expect(AudioMock.instances).toHaveLength(1);
  expect(AudioMock.instances[0]!.play).toHaveBeenCalledOnce();
  expect(preview.synthesize).not.toHaveBeenCalled();
});

it("最终读音缺正式资产时保持禁用而不新合成", async () => {
  render(<PreviewHarness playbackOnly assetOnly />);
  await waitFor(() => expect(preview.listVoices).toHaveBeenCalled());
  expect(screen.getByLabelText("播放语音")).toBeDisabled();
  expect(preview.synthesize).not.toHaveBeenCalled();
});

it("音色配置按实际口音过滤，而不是取第一个启用项", async () => {
  render(
    <PreviewHarness
      dialect="uk"
      voiceProfile={{
        voices: [
          { voice_id: "american-voice", enabled: true, rate_percent: 25 },
          { voice_id: "british-voice", enabled: true, rate_percent: -10 }
        ]
      }}
    />
  );
  const button = screen.getByLabelText("获取语音");
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(preview.synthesize).toHaveBeenCalledOnce());
  expect(preview.synthesize.mock.calls[0]![0]).toMatchObject({
    voiceId: "british-voice",
    ratePercent: -10
  });
});
it("仅启用了另一口音时禁用，切换到匹配口音后才能试听", async () => {
  const profile = {
    voices: [{ voice_id: "american-voice", enabled: true, rate_percent: 25 }]
  };
  const view = render(<PreviewHarness dialect="uk" voiceProfile={profile} />);
  await waitFor(() => expect(preview.listVoices).toHaveBeenCalled());
  expect(screen.getByLabelText("获取语音")).toBeDisabled();
  expect(preview.synthesize).not.toHaveBeenCalled();
  view.rerender(<PreviewHarness dialect="us" voiceProfile={profile} />);
  await waitFor(() => expect(screen.getByLabelText("获取语音")).toBeEnabled());
});
it("切换通用栏口音时停止旧音频并丢弃缓存，下一次只请求新口音", async () => {
  const dispose = vi.fn();
  preview.resolveAudio.mockResolvedValue(result({ dispose }));
  const profile: VoiceProfileV3 = {
    voices: [
      {
        voice_id: "british-voice",
        enabled: true,
        rate_percent: 0,
        locale: "en-GB",
        audio_asset_id: "formal-uk"
      },
      {
        voice_id: "american-voice",
        enabled: true,
        rate_percent: 0,
        locale: "en-US",
        audio_asset_id: "formal-us"
      }
    ]
  };
  const view = render(
    <PreviewHarness playbackOnly assetOnly voiceProfile={profile} />
  );
  const play = screen.getByLabelText("播放语音");
  await waitFor(() => expect(play).toBeEnabled());
  fireEvent.click(play);
  await waitFor(() => expect(AudioMock.instances[0]?.play).toHaveBeenCalled());
  const oldAudio = AudioMock.instances[0]!;
  dialectPreference.value = "us";
  view.rerender(
    <PreviewHarness playbackOnly assetOnly voiceProfile={profile} />
  );
  await waitFor(() => expect(oldAudio.pause).toHaveBeenCalled());
  expect(dispose).toHaveBeenCalled();
  fireEvent.click(play);
  await waitFor(() => expect(preview.resolveAudio).toHaveBeenCalledTimes(2));
  expect(preview.resolveAudio.mock.calls[0]![0]).toBe("formal-uk");
  expect(preview.resolveAudio.mock.calls[1]![0]).toBe("formal-us");
  expect(preview.synthesize).not.toHaveBeenCalled();
});
it("仅调速但不勾选仍可试听，并使用默认音色自己的语速", async () => {
  render(
    <PreviewHarness
      dialect="uk"
      voiceProfile={{
        voices: [
          { voice_id: "british-voice", enabled: false, rate_percent: -10 },
          { voice_id: "american-voice", enabled: false, rate_percent: 25 }
        ]
      }}
    />
  );
  const button = screen.getByLabelText("获取语音");
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(preview.synthesize).toHaveBeenCalledOnce());
  expect(preview.synthesize.mock.calls[0]![0]).toMatchObject({
    voiceId: "british-voice",
    ratePercent: -10
  });
});

function PairedPreview() {
  return (
    <PronunciationPreviewProvider loadVoicesOnMount resolveVoicesOnMount>
      {["IPA", "UPS"].map((name) => (
        <PronunciationPreviewControls
          key={name}
          pronunciationId="same-pronunciation"
          spelling="cat"
          dialect="uk"
          playbackOnly
          audioAssetId={`formal-${name}`}
          ariaLabelPrefix={name}
          audioFactory={(src) =>
            new AudioMock(src) as unknown as HTMLAudioElement
          }
        />
      ))}
    </PronunciationPreviewProvider>
  );
}

it("开始另一行试听会停止正在播放的音频", async () => {
  render(<PairedPreview />);
  await waitFor(() =>
    expect(screen.getByLabelText("IPA 播放语音")).toBeEnabled()
  );
  fireEvent.click(screen.getByLabelText("IPA 播放语音"));
  await waitFor(() => expect(AudioMock.instances).toHaveLength(1));
  const first = AudioMock.instances[0]!;
  fireEvent.click(screen.getByLabelText("UPS 播放语音"));
  await waitFor(() => expect(AudioMock.instances).toHaveLength(2));
  expect(first.pause).toHaveBeenCalled();
  expect(AudioMock.instances[1]!.play).toHaveBeenCalledOnce();
});

it("等待音色目录的试听不会打断后来点播的正式音频", async () => {
  const catalog = deferred<typeof voices>();
  preview.listVoices.mockReturnValueOnce(catalog.promise);
  render(
    <PronunciationPreviewProvider>
      <PronunciationPreviewControls
        pronunciationId="audition"
        spelling="cat"
        dialect="uk"
        playbackOnly
        ariaLabelPrefix="试听"
      />
      <PronunciationPreviewControls
        pronunciationId="formal"
        dialect="uk"
        playbackOnly
        audioAssetId="formal-uk"
        ariaLabelPrefix="正式音频"
        audioFactory={(src) =>
          new AudioMock(src) as unknown as HTMLAudioElement
        }
      />
    </PronunciationPreviewProvider>
  );
  fireEvent.click(screen.getByLabelText("试听 播放语音"));
  await waitFor(() => expect(preview.listVoices).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByLabelText("正式音频 播放语音"));
  await waitFor(() => expect(AudioMock.instances).toHaveLength(1));
  await act(async () => catalog.resolve(voices));
  expect(AudioMock.instances[0]!.pause).not.toHaveBeenCalled();
  expect(preview.synthesize).not.toHaveBeenCalled();
});

it("加载音色期间编辑发音会取消旧点播，新内容等待再次点击", async () => {
  const catalog = deferred<typeof voices>();
  preview.listVoices.mockReturnValueOnce(catalog.promise);
  const previewFor = (spelling: string) => (
    <PreviewHarness
      dialect="uk"
      spelling={spelling}
      playbackOnly
      loadVoicesOnMount={false}
      resolveVoicesOnMount={false}
    />
  );
  const view = render(previewFor("cat"));
  fireEvent.click(screen.getByLabelText("播放语音"));
  await waitFor(() => expect(preview.listVoices).toHaveBeenCalledOnce());
  view.rerender(previewFor("dog"));
  await act(async () => catalog.resolve(voices));
  expect(preview.synthesize).not.toHaveBeenCalled();

  fireEvent.click(screen.getByLabelText("播放语音"));
  await waitFor(() => expect(preview.synthesize).toHaveBeenCalledOnce());
  expect(preview.synthesize.mock.calls[0]![0].content.text).toBe("dog");
});

it("切换试听会取消旧请求，旧响应不会抢播，且原按钮可以重试", async () => {
  const pending = deferred<VoicePreviewResult>();
  preview.resolveAudio.mockImplementationOnce(() => pending.promise);
  render(<PairedPreview />);
  await waitFor(() =>
    expect(screen.getByLabelText("IPA 播放语音")).toBeEnabled()
  );
  fireEvent.click(screen.getByLabelText("IPA 播放语音"));
  const signal = preview.resolveAudio.mock.calls[0]![1].signal as AbortSignal;
  fireEvent.click(screen.getByLabelText("UPS 播放语音"));
  await waitFor(() => expect(AudioMock.instances).toHaveLength(1));
  expect(signal.aborted).toBe(true);
  const dispose = vi.fn();
  await act(async () => pending.resolve(result({ dispose })));
  expect(dispose).toHaveBeenCalledOnce();
  expect(AudioMock.instances).toHaveLength(1);
  expect(screen.getByLabelText("IPA 播放语音")).toBeEnabled();
});

it("saved profile audio remains playable without a live voice catalog or synthesis service", async () => {
  preview.enabled = false;
  preview.listVoices.mockResolvedValue([]);
  const asset = "00000000-0000-4000-8000-000000000123";
  render(
    <PreviewHarness
      playbackOnly
      assetOnly
      voiceProfile={{
        voices: [
          {
            voice_id: "retired-voice",
            enabled: true,
            rate_percent: 0,
            locale: "en-GB",
            audio_asset_id: asset
          }
        ]
      }}
    />
  );
  const button = screen.getByLabelText("播放语音");
  expect(button).toBeEnabled();
  fireEvent.click(button);
  await waitFor(() =>
    expect(preview.resolveAudio).toHaveBeenCalledWith(asset, expect.anything())
  );
  expect(preview.synthesize).not.toHaveBeenCalled();
});

it("late catalog arrival does not interrupt an immutable saved-asset playback", async () => {
  const pending = deferred<typeof voices>();
  preview.listVoices.mockImplementationOnce(() => pending.promise);
  render(
    <PreviewHarness
      playbackOnly
      assetOnly
      voiceProfile={{
        voices: [
          {
            voice_id: "british-voice",
            enabled: true,
            rate_percent: -25,
            locale: "en-GB",
            audio_asset_id: "00000000-0000-4000-8000-000000000124"
          }
        ]
      }}
    />
  );
  fireEvent.click(screen.getByLabelText("播放语音"));
  await waitFor(() => expect(AudioMock.instances[0]?.play).toHaveBeenCalled());
  const audio = AudioMock.instances[0]!;
  await act(async () => pending.resolve(voices));
  expect(audio.pause).not.toHaveBeenCalled();
  expect(preview.resolveAudio).toHaveBeenCalledOnce();
  expect(preview.synthesize).not.toHaveBeenCalled();
});

it("compact editable preview may synthesize while asset-only reading never does", async () => {
  render(<PreviewHarness playbackOnly />);
  const button = screen.getByLabelText("播放语音");
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(preview.synthesize).toHaveBeenCalledOnce());
});

it("音色目录首次失败后可在原控件手动重试", async () => {
  preview.listVoices.mockRejectedValueOnce(new Error());
  render(
    <PreviewHarness dialect="uk" playbackOnly loadVoicesOnMount={false} />
  );
  const button = screen.getByLabelText("播放语音");
  await act(async () => fireEvent.click(button));
  expect(preview.listVoices).toHaveBeenCalledTimes(1);
  expect(preview.synthesize).not.toHaveBeenCalled();
  expect(button).toBeEnabled();
  fireEvent.click(button);
  await waitFor(() => expect(preview.synthesize).toHaveBeenCalledTimes(1));
  expect(preview.listVoices).toHaveBeenCalledTimes(2);
});

it("音色列表自动加载失败后等待用户手动重试", async () => {
  const catalog = deferred<typeof voices>();
  preview.listVoices.mockReturnValueOnce(catalog.promise);
  render(
    <PronunciationPreviewProvider>
      <PronunciationPreviewVoiceList dialect="uk" />
      <PronunciationPreviewControls
        dialect="uk"
        pronunciationId="retry"
        spelling="cat"
      />
    </PronunciationPreviewProvider>
  );
  await act(async () => catalog.reject(new Error("音色目录暂不可用")));
  expect(preview.listVoices).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByLabelText("获取语音"));
  await waitFor(() => expect(preview.synthesize).toHaveBeenCalledOnce());
  expect(preview.listVoices).toHaveBeenCalledTimes(2);
});

it("另一条试听的目录错误不会取消本次等待推荐音色的点播", async () => {
  preview.listVoices.mockRejectedValueOnce(new Error("目录暂不可用"));
  const setting = { voice_id: "british-voice", enabled: true, rate_percent: 0 };
  preview.resolveVoices.mockResolvedValue({
    voices: [setting],
    source: { kind: "catalog" }
  });
  render(
    <PronunciationPreviewProvider>
      <PronunciationPreviewControls
        dialect="uk"
        pronunciationId="first"
        spelling="cat"
        voiceProfile={{ voices: [setting] }}
        ariaLabelPrefix="本地"
      />
      <PronunciationPreviewControls
        dialect="uk"
        pronunciationId="second"
        spelling="dog"
        recommendationArea="azure"
        ariaLabelPrefix="推荐"
      />
    </PronunciationPreviewProvider>
  );
  await act(async () =>
    fireEvent.click(screen.getByLabelText("本地 获取语音"))
  );
  expect(preview.listVoices).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByLabelText("推荐 获取语音"));
  await waitFor(() => expect(preview.synthesize).toHaveBeenCalledOnce());
  expect(preview.listVoices).toHaveBeenCalledTimes(2);
});
