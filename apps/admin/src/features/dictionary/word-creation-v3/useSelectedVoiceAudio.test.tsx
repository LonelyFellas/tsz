import { act, renderHook, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import type { RichTextV2, VoiceProfileV3 } from "@tsz/types";
import type { AudioAsset, VoicePreviewAdapter } from "@tsz/voice-editor/types";
import { VoiceSaveContext } from "./voiceSaveContext";
import { useSelectedVoiceAudio } from "./useSelectedVoiceAudio";

const content: RichTextV2 = { version: 2, text: "hello", annotations: [] };
const setting = {
  voice_id: "sonia",
  version_id: "version-uk",
  locale: "en-GB" as const,
  enabled: true,
  rate_percent: -25
};
const initial: VoiceProfileV3 = { voices: [setting] };
function setup(adapter: VoicePreviewAdapter, profile = initial) {
  const audioTasks = new Map<string, () => Promise<boolean>>();
  const changed = vi.fn();
  const view = renderHook(
    ({ content, enabled = true, defer = false }) => {
      const [profile, setProfile] = useState<VoiceProfileV3>(initialProfile);
      const generation = useSelectedVoiceAudio({
        target: "fixture-field",
        content,
        profile,
        adapter,
        enabled,
        defer,
        locale: "en-GB",
        onChange: (next) => {
          setProfile(next);
          changed(next);
        }
      });
      return { ...generation, profile, setProfile };
    },
    {
      initialProps: { content, enabled: true, defer: false },
      wrapper: ({ children }: { children: ReactNode }) => (
        <VoiceSaveContext.Provider
          value={{ save: async () => true, audioTasks }}
        >
          {children}
        </VoiceSaveContext.Provider>
      )
    }
  );
  return { ...view, changed, audioTasks };
  // 捕获本次 fixture，不让 rerender 将受控草稿重置。
  function initialProfile() {
    return profile;
  }
}
function asset(id: string): AudioAsset {
  return {
    id,
    locale: "en-GB",
    gender: "female",
    content_type: "audio/mpeg",
    size_bytes: 10,
    original_name: "generated.mp3",
    created_at: "2026-11-12T00:00:00Z"
  };
}
function adapter(
  generateAudio: NonNullable<VoicePreviewAdapter["generateAudio"]> = vi
    .fn()
    .mockResolvedValue(asset("generated"))
): VoicePreviewAdapter {
  return { listVoices: vi.fn(), synthesize: vi.fn(), generateAudio };
}

it("继承缓存重新成为有效推荐时启用声音并复用已存资产", async () => {
  const generate = vi.fn();
  const resolveVoices = vi.fn().mockResolvedValue([setting]);
  const preview = { ...adapter(generate), resolveVoices };
  const view = setup(preview, {
    voices: [{ ...setting, enabled: false, audio_asset_id: "stored-audio" }],
    dubbing: { mode: "inherit", area: "word" }
  });
  await waitFor(() => expect(resolveVoices).toHaveBeenCalled());
  await waitFor(() => expect(view.result.current.busy).toBe(false));
  expect(view.result.current.profile.voices[0]).toMatchObject({
    enabled: true,
    audio_asset_id: "stored-audio"
  });
  expect(generate).not.toHaveBeenCalled();
});

it("保存等待在途的默认音频并取得资产回写，不重复发起生成", async () => {
  let finish!: (asset: AudioAsset) => void;
  const generate = vi.fn(
    () =>
      new Promise<AudioAsset>((resolve) => {
        finish = resolve;
      })
  );
  const view = setup(adapter(generate));
  await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
  let saved = false;
  const wait = view.audioTasks.get("fixture-field")!().then((ready) => {
    saved = ready;
  });
  expect(saved).toBe(false);
  await act(async () => {
    finish(asset("formal"));
    await wait;
  });
  expect(saved).toBe(true);
  expect(view.result.current.profile.voices[0]!.audio_asset_id).toBe("formal");
  expect(generate).toHaveBeenCalledTimes(1);
});

it("失败保留勾选并停止自动重试，显式重试复用请求身份", async () => {
  const generate = vi
    .fn()
    .mockRejectedValueOnce(new Error("Azure unavailable"))
    .mockResolvedValue(asset("retried"));
  const view = setup(adapter(generate));
  await waitFor(() => expect(view.result.current.error).toBeInstanceOf(Error));
  expect(view.result.current.profile).toEqual(initial);
  expect(generate).toHaveBeenCalledTimes(1);
  await act(async () => {
    expect(await view.result.current.retry()).toBe(true);
  });
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls[1]![0].requestId).toBe(
    generate.mock.calls[0]![0].requestId
  );
  expect(view.result.current.profile.voices[0]!.audio_asset_id).toBe("retried");
});

it("取消勾选使在途结果失效，迟到资产不能重新启用或绑定", async () => {
  let finish!: (asset: AudioAsset) => void;
  const generate = vi.fn(
    () =>
      new Promise<AudioAsset>((resolve) => {
        finish = resolve;
      })
  );
  const view = setup(adapter(generate));
  await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
  await act(async () =>
    view.result.current.setProfile({ voices: [{ ...setting, enabled: false }] })
  );
  await act(async () => finish(asset("late")));
  expect(view.changed).not.toHaveBeenCalled();
  expect(view.result.current.profile.voices).toEqual([
    { ...setting, enabled: false }
  ]);
});

it("打开编辑器中止折叠字段请求，关闭后自动继续未完成的已选音频", async () => {
  let finish!: (asset: AudioAsset) => void;
  const generate = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<AudioAsset>((resolve) => {
          finish = resolve;
        })
    )
    .mockResolvedValue(asset("resumed"));
  const view = setup(adapter(generate));
  await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
  view.rerender({ content, enabled: false, defer: false });
  view.rerender({ content, enabled: true, defer: false });
  await act(async () => finish(asset("cancelled")));
  await waitFor(() =>
    expect(view.result.current.profile.voices[0]!.audio_asset_id).toBe(
      "resumed"
    )
  );
  expect(generate).toHaveBeenCalledTimes(2);
});

it("改字后清除旧资产并自动生成新文本，现有匹配资产不请求", async () => {
  const generate = vi.fn().mockResolvedValue(asset("new-content"));
  const view = setup(adapter(generate), {
    voices: [{ ...setting, audio_asset_id: "old-content" }]
  });
  await act(async () => {});
  expect(generate).not.toHaveBeenCalled();
  view.rerender({
    content: { ...content, text: "changed" },
    enabled: true,
    defer: false
  });
  await waitFor(() =>
    expect(view.result.current.profile.voices[0]!.audio_asset_id).toBe(
      "new-content"
    )
  );
  expect(generate).toHaveBeenCalledWith(
    expect.objectContaining({ content: { ...content, text: "changed" } }),
    expect.anything()
  );
});

it("后端读回只改变 JSON 字段顺序时复用已有资产，不误报来源变化", async () => {
  const generate = vi.fn();
  const view = setup(adapter(generate), {
    voices: [{ ...setting, audio_asset_id: "cached" }]
  });
  await act(async () => {});
  view.rerender({
    content: { annotations: [], text: content.text, version: 2 },
    enabled: true,
    defer: false
  });
  await act(async () => {});
  expect(generate).not.toHaveBeenCalled();
  expect(view.result.current.profile.voices[0]!.audio_asset_id).toBe("cached");
});

it("参数改变后不会沿用旧资产，自动生成新参数的正式音频", async () => {
  const generate = vi.fn().mockResolvedValue(asset("new-volume"));
  const view = setup(adapter(generate), {
    voices: [{ ...setting, audio_asset_id: "old-volume" }]
  });
  await act(async () => {});
  expect(generate).not.toHaveBeenCalled();
  act(() =>
    view.result.current.setProfile({
      voices: [{ ...setting, volume_percent: 65, audio_asset_id: "old-volume" }]
    })
  );
  await waitFor(() =>
    expect(view.result.current.profile.voices[0]!.audio_asset_id).toBe(
      "new-volume"
    )
  );
  expect(generate).toHaveBeenCalledWith(
    expect.objectContaining({
      setting: expect.objectContaining({ volume_percent: 65 })
    }),
    expect.anything()
  );
});

it("继承推荐先解析实际选择，再生成并绑定解析出的音色", async () => {
  const preview = {
    ...adapter(),
    resolveVoices: vi.fn().mockResolvedValue([setting])
  };
  const view = setup(preview, {
    dubbing: { mode: "inherit", area: "word", pool_version: "provider_id_v1" },
    voices: []
  });
  await waitFor(() =>
    expect(view.result.current.profile.voices[0]?.audio_asset_id).toBe(
      "generated"
    )
  );
  expect(preview.resolveVoices).toHaveBeenCalledWith(
    expect.objectContaining({ accent: "gb", content }),
    expect.anything()
  );
  expect(preview.synthesize).not.toHaveBeenCalled();
});

it.each([true, false])(
  "原生美式音色人工归为英式时，已解析的有效选择不被地区过滤（局部配置=%s）",
  async (local) => {
    const reassigned = {
      ...setting,
      voice_id: "guy",
      locale: "en-US" as const
    };
    const generate = vi.fn().mockResolvedValue(asset("reassigned"));
    const preview = {
      ...adapter(generate),
      resolveVoices: vi.fn().mockResolvedValue([reassigned])
    };
    const profile: VoiceProfileV3 = {
      voices: [reassigned],
      ...(local
        ? {
            dubbing: {
              mode: "local",
              area: "grammar",
              pool_version: "provider_id_v1"
            } as const
          }
        : {})
    };
    const view = setup(preview, profile);
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(preview.resolveVoices).toHaveBeenCalledWith(
      expect.objectContaining({ accent: "gb" }),
      expect.anything()
    );
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ setting: reassigned }),
      expect.anything()
    );
    expect(view.result.current.profile.voices[0]!.audio_asset_id).toBe(
      "reassigned"
    );
  }
);

it("保存等待空继承配置物化首个有效音色，同一次保存承诺完成而不被自身回写作废", async () => {
  let finish!: (asset: AudioAsset) => void;
  const generate = vi.fn(
    () =>
      new Promise<AudioAsset>((resolve) => {
        finish = resolve;
      })
  );
  const preview = {
    ...adapter(generate),
    resolveVoices: vi.fn().mockResolvedValue([setting])
  };
  const view = setup(preview, {
    voices: [],
    dubbing: { mode: "inherit", area: "word", pool_version: "provider_id_v1" }
  });
  await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
  const waiting = view.audioTasks.get("fixture-field")!();
  await act(async () => {
    finish(asset("inherited"));
    expect(await waiting).toBe(true);
  });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(view.result.current.profile.voices[0]!.audio_asset_id).toBe(
    "inherited"
  );
});

it("补充地区的已选声音没有英美默认归属时仍会正式生成", async () => {
  const other = { ...setting, voice_id: "neerja", locale: "en-IN" as const };
  const generate = vi
    .fn()
    .mockResolvedValue({ ...asset("other"), locale: "en-IN" });
  const preview = {
    ...adapter(generate),
    resolveVoices: vi.fn().mockRejectedValue(new Error("当前口音没有已选推荐"))
  };
  const view = setup(preview, { voices: [other] });
  await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
  expect(view.result.current.profile.voices[0]!.audio_asset_id).toBe("other");
});

it("输入期间暂缓生成，保存仍可主动等待；卸载清除登记并中止请求", async () => {
  let finish!: (asset: AudioAsset) => void;
  const generate = vi.fn(
    () =>
      new Promise<AudioAsset>((resolve) => {
        finish = resolve;
      })
  );
  const view = setup(adapter(generate), { voices: [] });
  view.rerender({ content, enabled: true, defer: true });
  await act(async () => view.result.current.setProfile(initial));
  expect(generate).not.toHaveBeenCalled();
  let pending!: Promise<boolean>;
  act(() => {
    pending = view.audioTasks.get("fixture-field")!();
  });
  await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
  view.unmount();
  expect(view.audioTasks.size).toBe(0);
  await act(async () => {
    finish(asset("unmounted"));
    expect(await pending).toBe(false);
  });
  expect(view.changed).not.toHaveBeenCalled();
});
