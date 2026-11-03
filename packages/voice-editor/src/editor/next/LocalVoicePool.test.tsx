import { App, ConfigProvider } from "antd";
import { useCallback, useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AudioAsset,
  AudioUploadAdapter,
  VoiceOption,
  VoicePreviewAdapter,
  VoicePreviewResult,
  VoiceProfile,
  VoiceRecommendation,
  VoiceSetting,
  VoiceEditorProps
} from "../../types";
import { VoiceEditor } from "./VoiceEditor";

const options: VoiceOption[] = [
  {
    id: "a",
    provider: "azure",
    providerVoiceId: "en-GB-ANeural",
    displayName: "Alpha 阿尔法",
    label: "Alpha",
    locale: "en-GB",
    accent: "gb",
    gender: "female",
    styles: ["neutral", "cheerful"],
    supportsRate: true,
    supportsPitch: true,
    supportsVolume: true,
    supportsStyleDegree: true,
    roles: ["Girl"],
    isDefault: false,
    rateRange: { min: -50, max: 100 }
  },
  {
    id: "b",
    provider: "azure",
    providerVoiceId: "en-GB-BNeural",
    displayName: "Beta",
    label: "Beta",
    locale: "en-GB",
    accent: "gb",
    gender: "female",
    styles: [],
    supportsRate: true,
    supportsPitch: true,
    isDefault: false
  },
  {
    id: "us",
    provider: "azure",
    providerVoiceId: "en-US-USNeural",
    displayName: "American",
    label: "American",
    locale: "en-US",
    accent: "us",
    gender: "male",
    styles: [],
    supportsRate: true,
    supportsPitch: true,
    isDefault: false
  }
];
const version = (id: string, rate = 0): VoiceSetting => ({
  voice_id: id,
  version_id: `${id}-version`,
  version_name: id,
  enabled: true,
  rate_percent: rate,
  locale: id === "us" ? "en-US" : "en-GB"
});
const pool = (voices: VoiceSetting[]): VoiceProfile => ({
  voices,
  dubbing: { mode: "local", area: "meaning", pool_version: "provider_id_v1" }
});
const recommendation = (id: string, pair: string): VoiceRecommendation => ({
  id: `${pair}-${id}`,
  groupId: "group",
  pairId: pair,
  name: pair,
  groupName: "释义组",
  locale: id === "us" ? "en-US" : "en-GB",
  setting: { voice_id: id, enabled: true, rate_percent: -10 }
});
class AudioMock extends EventTarget {
  static instances: AudioMock[] = [];
  constructor(readonly src = "") {
    super();
    AudioMock.instances.push(this);
  }
  currentTime = 0;
  duration = 2;
  paused = true;
  playbackRate = 1;
  play = vi.fn(async () => {
    this.paused = false;
    this.dispatchEvent(new Event("play"));
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  });
}
beforeEach(() => {
  AudioMock.instances = [];
  vi.stubGlobal("Audio", AudioMock);
});
function adapter(
  synthesize = vi.fn().mockResolvedValue({
    audioUrl: "blob:audio",
    expiresAt: "2099-01-01",
    cached: false
  })
): VoicePreviewAdapter {
  return { listVoices: vi.fn().mockResolvedValue(options), synthesize };
}
function Harness({
  initial = pool([version("a"), version("us")]),
  preview = adapter(),
  recommendations = [],
  onProfile = vi.fn(),
  readOnly = false,
  target = "target-a",
  content = { version: 2 as const, text: "hello", annotations: [] },
  audioAssets,
  audioAdapter,
  mode,
  locale
}: {
  initial?: VoiceProfile;
  preview?: VoicePreviewAdapter;
  recommendations?: VoiceRecommendation[];
  onProfile?: (profile: VoiceProfile) => void;
  readOnly?: boolean;
  target?: string;
  content?: { version: 2; text: string; annotations: [] };
  audioAssets?: AudioAsset[];
  audioAdapter?: AudioUploadAdapter;
  mode?: VoiceEditorProps["mode"];
  locale?: `en-${string}`;
}) {
  const [profile, setProfile] = useState(initial);
  const loadRecommendations = useCallback(
    async () => recommendations,
    [recommendations]
  );
  return (
    <ConfigProvider theme={{ token: { motion: false } }}>
      <App>
        <VoiceEditor
          mode={mode}
          locale={locale}
          value={content}
          onChange={vi.fn()}
          voiceProfile={profile}
          onVoiceProfileChange={(next) => {
            setProfile(next);
            onProfile(next);
          }}
          previewAdapter={preview}
          audioAssets={audioAssets}
          audioUploadAdapter={audioAdapter}
          loadRecommendations={loadRecommendations}
          recommendationArea="meaning"
          readOnly={readOnly}
          contextLabel="释义编辑"
          inputDataAttributes={{
            "data-v3-node-id": target,
            "data-v3-field": "definition"
          }}
        />
      </App>
    </ConfigProvider>
  );
}
async function detail(name = "a") {
  const button = await screen.findByRole("button", { name: `修改 ${name}` });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  const dialog = await screen.findByRole("dialog");
  await waitFor(() => expect(dialog).toBeVisible());
  return dialog;
}

describe("新版局部主页和唯一声音草稿", () => {
  it.each(["spelling", "phoneme-settings"] as const)(
    "%s 目录试听遵循普通文本与音素的原生地区边界",
    async (mode) => {
      const australian: VoiceOption = {
        ...options[0]!,
        id: "au",
        label: "Australian",
        displayName: "Australian",
        locale: "en-AU",
        providerVoiceId: "en-AU-ANeural"
      };
      const synthesize = vi.fn().mockResolvedValue({
        audioUrl: "blob:audio",
        expiresAt: "2099-01-01",
        cached: false
      });
      render(
        <Harness
          mode={mode}
          locale="en-GB"
          initial={pool([])}
          preview={{
            ...adapter(synthesize),
            listVoices: vi.fn().mockResolvedValue([australian])
          }}
        />
      );
      fireEvent.click(screen.getByText("完整音色目录"));
      const preview = await screen.findByRole("button", {
        name: "试听目录音色 Australian"
      });
      if (mode === "phoneme-settings") {
        expect(preview).toBeDisabled();
        fireEvent.click(preview);
        expect(synthesize).not.toHaveBeenCalled();
      } else {
        expect(preview).toBeEnabled();
        fireEvent.click(preview);
        await waitFor(() =>
          expect(synthesize).toHaveBeenCalledWith(
            expect.objectContaining({ voiceId: "au" }),
            expect.anything()
          )
        );
      }
    }
  );
  it("未选音色时显示简短说明，隐藏空表头", () => {
    render(<Harness initial={pool([])} />);
    const side = screen.getByRole("region", { name: "英式已获取音色" });
    expect(within(side).getByText("暂无已选音色")).toBeVisible();
    expect(within(side).queryByText("排序")).toBeNull();
  });
  it("完整音色目录默认收起，展开后可选音色，收起再展开保留选择", async () => {
    render(<Harness initial={pool([])} />);
    const disclosure = screen.getByText("完整音色目录");
    const catalog = disclosure.closest("details")!;
    expect(catalog).not.toHaveAttribute("open");
    fireEvent.click(disclosure);
    expect(catalog).toHaveAttribute("open");
    const voice = await screen.findByRole("checkbox", { name: "选用 Beta" });
    fireEvent.click(voice);
    expect(voice).toBeChecked();
    fireEvent.click(disclosure);
    expect(catalog).not.toHaveAttribute("open");
    fireEvent.click(disclosure);
    expect(voice).toBeChecked();
  });
  it("目录试听使用该音色的默认参数，不改变已选音色", async () => {
    const synthesize = vi.fn().mockResolvedValue({
      audioUrl: "blob:audio",
      expiresAt: "2099-01-01",
      cached: false
    });
    const onProfile = vi.fn();
    render(
      <Harness
        initial={pool([])}
        preview={adapter(synthesize)}
        onProfile={onProfile}
      />
    );
    fireEvent.click(screen.getByText("完整音色目录"));
    const audition = await screen.findByRole("button", {
      name: "试听目录音色 Beta"
    });
    await waitFor(() => expect(audition).toBeEnabled());
    fireEvent.click(audition);
    await waitFor(() => expect(synthesize).toHaveBeenCalled());
    expect(
      screen.getByRole("checkbox", { name: "选用 Beta" })
    ).not.toBeChecked();
    expect(onProfile).not.toHaveBeenCalled();
  });
  it("目录试听失败会显示原因，重新试听成功后可以停止", async () => {
    const synthesize = vi
      .fn()
      .mockRejectedValueOnce(new Error("试听服务暂不可用"))
      .mockResolvedValue({
        audioUrl: "blob:audio",
        expiresAt: "2099-01-01",
        cached: false
      });
    render(<Harness initial={pool([])} preview={adapter(synthesize)} />);
    fireEvent.click(screen.getByText("完整音色目录"));
    const audition = await screen.findByRole("button", {
      name: "试听目录音色 Beta"
    });
    fireEvent.click(audition);
    expect(await screen.findByText("试听服务暂不可用")).toBeVisible();
    fireEvent.click(audition);
    const stop = await screen.findByRole("button", { name: "停止试听" });
    await waitFor(() =>
      expect(AudioMock.instances.at(-1)?.play).toHaveBeenCalled()
    );
    fireEvent.click(stop);
    expect(AudioMock.instances.at(-1)?.pause).toHaveBeenCalled();
    expect(screen.queryAllByText(/^播放中/)).toHaveLength(0);
  });
  it("目录搜索无结果时显示提示，清空后恢复音色", async () => {
    render(<Harness initial={pool([])} />);
    fireEvent.click(screen.getByText("完整音色目录"));
    await screen.findByRole("checkbox", { name: "选用 Beta" });
    const search = screen.getByRole("searchbox", { name: "英式女声目录搜索" });
    expect(screen.getAllByRole("searchbox")).toHaveLength(4);
    fireEvent.change(search, { target: { value: "不存在的音色" } });
    expect(screen.getAllByText("没有匹配的音色")).toHaveLength(1);
    expect(
      screen.getByRole("checkbox", { name: "选用 American" }).closest("label")
    ).toBeVisible();
    fireEvent.change(search, { target: { value: "" } });
    expect(
      screen.getByRole("checkbox", { name: "选用 Beta" }).closest("label")
    ).toBeVisible();
  });
  it("正文为空时目录试听使用示例文本，不修改正文和音色配置", async () => {
    const synthesize = vi.fn().mockResolvedValue({
      audioUrl: "blob:audio",
      expiresAt: "2099-01-01",
      cached: false
    });
    const onProfile = vi.fn();
    render(
      <Harness
        initial={pool([])}
        content={{ version: 2, text: "", annotations: [] }}
        preview={adapter(synthesize)}
        onProfile={onProfile}
      />
    );
    fireEvent.click(screen.getByText("完整音色目录"));
    const audition = await screen.findByRole("button", {
      name: "试听目录音色 Beta"
    });
    await waitFor(() => expect(audition).toBeEnabled());
    fireEvent.click(audition);
    await waitFor(() =>
      expect(synthesize).toHaveBeenCalledWith(
        expect.objectContaining({
          voiceId: "b",
          content: {
            version: 2,
            text: "Hello, this is a voice preview.",
            annotations: []
          }
        }),
        expect.anything()
      )
    );
    expect(
      screen.getByRole("checkbox", { name: "选用 Beta" })
    ).not.toBeChecked();
    expect(onProfile).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "全局推荐仅在没有适用分组时展示（仅兜底：%s）",
    async (fallbackOnly) => {
      const global = ["a", "us"].map((id) => ({
        ...recommendation(id, "全局兜底"),
        groupId: "global",
        groupName: "全局常用",
        fallbackOnly
      }));
      render(
        <Harness
          recommendations={[
            ...(fallbackOnly
              ? [
                  recommendation("a", "板块推荐"),
                  recommendation("us", "板块推荐")
                ]
              : []),
            ...global,
            {
              ...global[0]!,
              id: "legacy-global",
              pairId: undefined,
              name: "历史全局兜底"
            }
          ]}
        />
      );
      fireEvent.click(screen.getByText("完整音色目录"));
      await screen.findByRole("checkbox", { name: "选用 Alpha 阿尔法" });
      if (fallbackOnly) {
        expect(
          (await screen.findByRole("radio", { name: /板块推荐/ })).closest(
            "label"
          )
        ).toBeVisible();
        expect(screen.queryByRole("radio", { name: /全局兜底/ })).toBeNull();
        expect(
          screen.queryByRole("region", { name: "历史未配对推荐" })
        ).toBeNull();
      } else {
        expect(
          (await screen.findByRole("radio", { name: /全局兜底/ })).closest(
            "label"
          )
        ).toBeVisible();
        expect(await screen.findByText("历史全局兜底")).toBeVisible();
      }
    }
  );
  it.each(["focus", "restore"] as const)(
    "继承分组时 %s 重新解析最近保存配置，不把旧参数继续作为默认",
    async (trigger) => {
      let latestRate = 0;
      const resolveVoices = vi.fn(async ({ accent }: { accent: string }) => [
        {
          ...version(accent === "gb" ? "a" : "us"),
          rate_percent: accent === "gb" ? latestRate : 0
        }
      ]);
      const onProfile = vi.fn();
      render(
        <Harness
          initial={{
            voices: [],
            dubbing: {
              mode: "inherit",
              area: "meaning",
              pool_version: "provider_id_v1",
              recommendation_order: []
            }
          }}
          preview={{ ...adapter(), resolveVoices }}
          onProfile={onProfile}
        />
      );
      await waitFor(() => expect(resolveVoices).toHaveBeenCalledTimes(2));
      await screen.findByLabelText("英式池 a");
      latestRate = -27;
      if (trigger === "focus") fireEvent(window, new Event("focus"));
      else
        fireEvent.click(screen.getByRole("button", { name: "恢复默认推荐" }));
      await waitFor(() => expect(resolveVoices).toHaveBeenCalledTimes(4));
      expect(screen.getByLabelText("英式池 a").textContent).toContain("0.73");
      if (trigger === "focus") expect(onProfile).not.toHaveBeenCalled();
      else
        expect(onProfile).toHaveBeenLastCalledWith(
          expect.objectContaining({
            voices: [],
            dubbing: expect.objectContaining({ mode: "inherit" })
          })
        );
    }
  );
  it("推荐单选及不选保留额外音色，取消再选恢复参数，四列不重挂且保留各自滚动", async () => {
    const onProfile = vi.fn();
    render(
      <Harness
        initial={pool([version("b", -27)])}
        recommendations={[
          recommendation("a", "第一套"),
          recommendation("us", "第一套"),
          recommendation("b", "第二套"),
          recommendation("us", "第二套")
        ]}
        onProfile={onProfile}
      />
    );
    const first = await screen.findByRole("radio", { name: /第一套/ });
    await waitFor(() => expect(first).toBeEnabled());
    fireEvent.click(screen.getByText("完整音色目录"));
    const columns = [
      ...document.querySelectorAll<HTMLElement>(".tsz-ve-pool-catalog-list")
    ];
    expect(columns).toHaveLength(4);
    columns.forEach((column, index) => {
      column.scrollTop = 20 + index;
      fireEvent.scroll(column);
    });
    fireEvent.click(first);
    expect(
      screen
        .getByRole("checkbox", { name: "选用 Alpha 阿尔法", hidden: true })
        .closest("[hidden]")
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /第二套/ }));
    expect(screen.getByText(/已保留现有局部参数/)).toBeVisible();
    expect(
      onProfile.mock.calls
        .at(-1)![0]
        .voices.find((item: VoiceSetting) => item.voice_id === "b").rate_percent
    ).toBe(-27);
    expect(screen.getByText("来源分组")).toBeVisible();
    expect(screen.getAllByText("释义组")[0]).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: "不使用推荐配音" }));
    expect(
      onProfile.mock.calls
        .at(-1)![0]
        .voices.filter((item: VoiceSetting) => item.enabled)
        .map((item: VoiceSetting) => item.voice_id)
    ).toEqual(["b"]);
    const b = screen.getByRole("checkbox", { name: "选用 Beta" });
    fireEvent.click(b);
    fireEvent.click(b);
    expect(
      onProfile.mock.calls
        .at(-1)![0]
        .voices.find((item: VoiceSetting) => item.voice_id === "b")
    ).toMatchObject({
      enabled: true,
      rate_percent: -27,
      version_id: "b-version"
    });
    const search = screen.getByRole("searchbox", { name: "英式女声目录搜索" });
    fireEvent.change(search, { target: { value: "Alpha" } });
    fireEvent.change(search, { target: { value: "" } });
    expect([...document.querySelectorAll(".tsz-ve-pool-catalog-list")]).toEqual(
      columns
    );
    expect(columns.map((column) => column.scrollTop)).toEqual([20, 21, 22, 23]);
    expect(
      screen.queryByRole("button", { name: "应用到当前文本" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "查看 SSML" })
    ).not.toBeInTheDocument();
  });
  it("铅笔只打开当前音色，取消丢草稿，保存0.73倍和格式仅替换当前声音", async () => {
    const onProfile = vi.fn();
    render(
      <Harness
        initial={pool([version("a"), version("b", 10), version("us", 20)])}
        onProfile={onProfile}
      />
    );
    let dialog = await detail();
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("combobox", { name: "SSML 配音版本" })
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("region", { name: "声音参数" })
    ).toBeVisible();
    expect(within(dialog).getByText("高级参数")).toBeVisible();
    fireEvent.change(
      within(dialog).getByRole("spinbutton", { name: "当前音色音量" }),
      { target: { value: "65" } }
    );
    fireEvent.click(within(dialog).getByRole("button", { name: /^取\s*消$/ }));
    expect(onProfile).not.toHaveBeenCalled();
    dialog = await detail();
    expect(
      within(dialog).getByRole("spinbutton", { name: "当前音色音量" })
    ).toHaveValue("100");
    fireEvent.change(
      within(dialog).getByRole("spinbutton", { name: "当前音色语速" }),
      { target: { value: "0.73" } }
    );
    fireEvent.change(
      within(dialog).getByRole("spinbutton", { name: "当前音色音量" }),
      { target: { value: "65" } }
    );
    fireEvent.mouseDown(
      within(dialog).getByRole("combobox", { name: "当前音色输出格式" })
    );
    fireEvent.click(
      await screen.findByText("WAV", {
        selector: ".ant-select-item-option-content"
      })
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "保存配音设置" })
      ).toBeEnabled()
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "保存配音设置" })
    );
    expect(onProfile).toHaveBeenCalledTimes(1);
    expect(onProfile.mock.calls[0]![0].voices).toEqual([
      {
        ...version("a", -27),
        volume_percent: 65,
        output_format: "wav",
        audio_asset_id: undefined
      },
      version("b", 10),
      version("us", 20)
    ]);
    expect(document.querySelectorAll(".tsz-ve-pool-catalog-list")).toHaveLength(
      4
    );
  });
  it("共用参数表单清空必填值时禁止保存，修正后保留其他字段及原语速上限", async () => {
    const onProfile = vi.fn();
    const synthesize = vi.fn();
    const generateAudio = vi.fn();
    render(
      <Harness
        initial={pool([version("a")])}
        onProfile={onProfile}
        preview={{ ...adapter(synthesize), generateAudio }}
      />
    );
    const dialog = await detail();
    const rate = within(dialog).getByRole("spinbutton", {
      name: "当前音色语速"
    });
    const save = within(dialog).getByRole("button", { name: "保存配音设置" });
    fireEvent.change(rate, { target: { value: "" } });
    await waitFor(() => expect(save).toBeDisabled());
    const preview = within(dialog).getByRole("button", {
      name: "试听当前音色"
    });
    const generate = within(dialog).getByRole("button", {
      name: "生成正式音频"
    });
    expect(preview).toBeDisabled();
    expect(generate).toBeDisabled();
    fireEvent.click(preview);
    fireEvent.click(generate);
    expect(synthesize).not.toHaveBeenCalled();
    expect(generateAudio).not.toHaveBeenCalled();
    fireEvent.change(
      within(dialog).getByRole("spinbutton", { name: "当前音色音量" }),
      { target: { value: "65" } }
    );
    expect(rate).toHaveValue("");
    expect(save).toBeDisabled();
    fireEvent.change(rate, { target: { value: "2.00" } });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    expect(onProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        voices: [
          expect.objectContaining({
            voice_id: "a",
            rate_percent: 100,
            volume_percent: 65
          })
        ]
      })
    );
  });

  it("相同正文换目标会卸载旧草稿并中止试听，迟到结果释放且不会串到新对象", async () => {
    let finish!: (result: VoicePreviewResult) => void;
    const synthesize = vi.fn<VoicePreviewAdapter["synthesize"]>(
      () =>
        new Promise<VoicePreviewResult>((resolve) => {
          finish = resolve;
        })
    );
    const preview = adapter(synthesize);
    const onProfile = vi.fn();
    const view = render(<Harness preview={preview} onProfile={onProfile} />);
    const dialog = await detail();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "试听当前音色" })
    );
    await waitFor(() => expect(synthesize).toHaveBeenCalled());
    const signal = synthesize.mock.calls[0]![1]!.signal!;
    view.rerender(
      <Harness preview={preview} onProfile={onProfile} target="target-b" />
    );
    expect(signal.aborted).toBe(true);
    const dispose = vi.fn();
    await act(async () =>
      finish({
        audioUrl: "blob:old",
        expiresAt: "2099-01-01",
        cached: false,
        dispose
      })
    );
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onProfile).not.toHaveBeenCalled();
    const next = await detail();
    expect(within(next).queryByLabelText(/波形/)).not.toBeInTheDocument();
  });
  it("历史同声多版本明确选择前不转换，保留选择的资产及另一侧，原快照不变", async () => {
    const old: VoiceProfile = {
      voices: [
        { ...version("a", -27), version_name: "慢读" },
        {
          ...version("a", 10),
          version_id: "fast",
          version_name: "快读",
          audio_asset_id: "old-asset"
        },
        version("us")
      ],
      dubbing: { mode: "local", area: "meaning" }
    };
    const snapshot = structuredClone(old);
    const onProfile = vi.fn();
    render(
      <Harness
        initial={old}
        onProfile={onProfile}
        preview={{
          ...adapter(),
          resolveAudio: vi.fn().mockResolvedValue({
            audioUrl: "blob:old",
            expiresAt: "2099-01-01",
            cached: true
          })
        }}
      />
    );
    await screen.findByRole("region", { name: "历史音色冲突" });
    expect(
      screen.getByRole("button", { name: "按选择转换为新池" })
    ).toBeDisabled();
    expect(onProfile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: /快读/ }));
    fireEvent.click(screen.getByRole("button", { name: "按选择转换为新池" }));
    expect(onProfile.mock.calls.at(-1)![0]).toMatchObject({
      voices: [old.voices[1], old.voices[2]],
      dubbing: { pool_version: "provider_id_v1" }
    });
    expect(old).toEqual(snapshot);
  });
  it("正文资格过滤只计算有效已选池，服务端拒绝的声音不参与概率或重新生成", async () => {
    const preview = {
      ...adapter(),
      resolveVoices: vi.fn(async ({ accent }: { accent: string }) =>
        accent === "gb" ? [version("b")] : [version("us")]
      )
    };
    render(
      <Harness
        initial={pool([version("a"), version("b"), version("us")])}
        preview={preview}
      />
    );
    const row = await screen.findByLabelText("英式池 a");
    await waitFor(() =>
      expect(
        within(screen.getByLabelText("英式池 b")).getByText("100.0%")
      ).toBeVisible()
    );
    expect(within(row).getByText("—")).toBeVisible();
    expect(within(row).getByText(/不参与概率/)).toBeVisible();
    const dialog = await detail();
    expect(
      within(dialog).getByRole("button", { name: "试听当前音色" })
    ).toBeDisabled();
  });
  it("权限变化中止当前生成，迟到资产不绑定，保存继续禁用", async () => {
    let finish!: (asset: { id: string }) => void;
    const generateAudio = vi.fn(
      () =>
        new Promise<never>((resolve) => {
          finish = resolve as never;
        })
    );
    const preview = { ...adapter(), generateAudio };
    const onProfile = vi.fn();
    const view = render(<Harness preview={preview} onProfile={onProfile} />);
    const dialog = await detail();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "生成正式音频" })
    );
    await waitFor(() => expect(generateAudio).toHaveBeenCalled());
    view.rerender(<Harness preview={preview} onProfile={onProfile} readOnly />);
    await act(async () => finish({ id: "late-asset" }));
    expect(onProfile).not.toHaveBeenCalled();
    expect(
      within(dialog).getByRole("button", { name: "保存配音设置" })
    ).toBeDisabled();
  });
  it("正式生成按唯一草稿重试复用请求身份，保存前不改主池，保存只绑定该版本", async () => {
    const generateAudio = vi
      .fn()
      .mockRejectedValueOnce(new Error("存储暂不可用"))
      .mockResolvedValueOnce({ id: "asset-a" });
    const onProfile = vi.fn();
    render(
      <Harness
        preview={{ ...adapter(), generateAudio }}
        onProfile={onProfile}
      />
    );
    const dialog = await detail();
    const generate = within(dialog).getByRole("button", {
      name: "生成正式音频"
    });
    fireEvent.click(generate);
    await within(dialog).findByText("存储暂不可用");
    await waitFor(() => {
      expect(generate).toBeEnabled();
      expect(generate).not.toHaveClass("ant-btn-loading");
    });
    fireEvent.click(generate);
    await waitFor(() => expect(generateAudio).toHaveBeenCalledTimes(2));
    await within(dialog).findByRole("button", { name: "播放正式音频" });
    expect(generateAudio.mock.calls[0]![0].requestId).toBe(
      generateAudio.mock.calls[1]![0].requestId
    );
    expect(
      generateAudio.mock.calls[0]![0].profile.voices.map(
        (item: VoiceSetting) => item.version_id
      )
    ).toEqual(["a-version", "us-version"]);
    expect(onProfile).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "保存配音设置" })
    );
    expect(onProfile.mock.calls.at(-1)![0].voices).toEqual([
      { ...version("a"), audio_asset_id: "asset-a" },
      version("us")
    ]);
  });
  it("当前人工归属与单侧正文不符时保留旧配置并显示说明，不补声也不计概率", async () => {
    const onProfile = vi.fn();
    render(
      <VoiceEditor
        value={{ version: 2, text: "hello", annotations: [] }}
        onChange={vi.fn()}
        locale="en-GB"
        recommendationArea="meaning"
        voiceProfile={pool([version("a", -27)])}
        onVoiceProfileChange={onProfile}
        previewAdapter={{
          ...adapter(),
          listVoices: vi
            .fn()
            .mockResolvedValue([{ ...options[0]!, accent: "us" }])
        }}
      />
    );
    await screen.findByText(/音色归属与当前正文口音不符/);
    expect(screen.getByRole("button", { name: /^试听 Alpha/ })).toHaveAttribute(
      "data-accent",
      "us"
    );
    expect(onProfile).not.toHaveBeenCalled();
    expect(
      within(
        screen.getByRole("region", { name: "英式已获取音色" })
      ).queryByText(/100.0%/)
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消启用失效音色 a" }));
    expect(onProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        voices: [{ ...version("a", -27), enabled: false }]
      })
    );
  });
  it.each(["tts", "ssml"] as const)(
    "真人录音接管详情%s时停止已播声音并中止在途请求，迟到结果不叠播",
    async (mode) => {
      const recorded: AudioAsset = {
        id: "recording",
        locale: "en-GB",
        gender: "female",
        content_type: "audio/mpeg",
        size_bytes: 3,
        original_name: "recording.mp3",
        created_at: "2026-10-31T00:00:00Z"
      };
      const sample = () =>
        Promise.resolve(new Blob([new Uint8Array(3)], { type: "audio/mpeg" }));
      const audioAdapter: AudioUploadAdapter = {
        upload: vi.fn(),
        resolveUrl: vi.fn().mockResolvedValue({
          url: "blob:recording",
          expiresAt: "2099-01-01"
        }),
        loadAudio: sample
      };
      const activeResult: VoicePreviewResult = {
        audioUrl: "blob:detail-active",
        expiresAt: "2099-01-01",
        cached: false,
        loadAudio: sample,
        dispose: vi.fn()
      };
      let finish!: (result: VoicePreviewResult) => void;
      const pending = new Promise<VoicePreviewResult>((resolve) => {
        finish = resolve;
      });
      const synthesize = vi
        .fn<VoicePreviewAdapter["synthesize"]>()
        .mockResolvedValueOnce(activeResult)
        .mockReturnValueOnce(pending);
      const synthesizeSsml = vi
        .fn<NonNullable<VoicePreviewAdapter["synthesizeSsml"]>>()
        .mockResolvedValueOnce(activeResult)
        .mockReturnValueOnce(pending);
      const preview = {
        ...adapter(synthesize),
        renderSsml: vi
          .fn()
          .mockResolvedValue(
            '<speak><voice name="Alpha">hello</voice></speak>'
          ),
        synthesizeSsml
      };
      render(
        <Harness
          preview={preview}
          audioAdapter={audioAdapter}
          audioAssets={[recorded]}
        />
      );
      const dialog = await detail();
      if (mode === "ssml")
        fireEvent.click(
          within(dialog).getByRole("button", { name: "查看 SSML" })
        );
      const play = await within(dialog).findByRole("button", {
        name: mode === "tts" ? "试听当前音色" : "试听 SSML"
      });
      await waitFor(() => expect(play).toBeEnabled());
      fireEvent.click(play);
      await waitFor(() =>
        expect(
          AudioMock.instances.some(
            (audio) => audio.src === activeResult.audioUrl && !audio.paused
          )
        ).toBe(true)
      );
      const activeAudio = AudioMock.instances.find(
        (audio) => audio.src === activeResult.audioUrl
      )!;
      fireEvent.click(within(dialog).getByLabelText("试听 recording.mp3"));
      await waitFor(() =>
        expect(
          AudioMock.instances.some(
            (audio) => audio.src === "blob:recording" && !audio.paused
          )
        ).toBe(true)
      );
      expect(activeAudio.paused).toBe(true);
      fireEvent.click(play);
      const calls =
        mode === "tts" ? synthesize.mock.calls : synthesizeSsml.mock.calls;
      await waitFor(() => expect(calls).toHaveLength(2));
      const signal = calls[1]![1]!.signal!;
      fireEvent.click(within(dialog).getByLabelText("试听 recording.mp3"));
      expect(signal.aborted).toBe(true);
      const dispose = vi.fn();
      await act(async () =>
        finish({
          audioUrl: "blob:detail-late",
          expiresAt: "2099-01-01",
          cached: false,
          dispose,
          loadAudio: sample
        })
      );
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(
        AudioMock.instances.some((audio) => audio.src === "blob:detail-late")
      ).toBe(false);
    }
  );
});
