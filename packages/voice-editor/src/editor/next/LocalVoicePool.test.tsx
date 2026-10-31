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
  VoiceOption,
  VoicePreviewAdapter,
  VoicePreviewResult,
  VoiceProfile,
  VoiceRecommendation,
  VoiceSetting
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
  currentTime = 0;
  duration = 2;
  paused = true;
  playbackRate = 1;
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
}
beforeEach(() => vi.stubGlobal("Audio", AudioMock));
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
  content = { version: 2 as const, text: "hello", annotations: [] }
}: {
  initial?: VoiceProfile;
  preview?: VoicePreviewAdapter;
  recommendations?: VoiceRecommendation[];
  onProfile?: (profile: VoiceProfile) => void;
  readOnly?: boolean;
  target?: string;
  content?: { version: 2; text: string; annotations: [] };
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
          value={content}
          onChange={vi.fn()}
          voiceProfile={profile}
          onVoiceProfileChange={(next) => {
            setProfile(next);
            onProfile(next);
          }}
          previewAdapter={preview}
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
    fireEvent.click(screen.getByRole("radio", { name: "不选择推荐" }));
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
    const search = screen.getByRole("searchbox", { name: "搜索局部音色目录" });
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
      within(dialog).getByRole("region", { name: "常用参数" })
    ).toBeVisible();
    expect(
      within(dialog).getByRole("region", { name: "其他参数" })
    ).toBeVisible();
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
    await waitFor(() => expect(generate).toBeEnabled());
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
});
