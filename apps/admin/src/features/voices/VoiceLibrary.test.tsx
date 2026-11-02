import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import type {
  AdminSpeechPreviewResponse,
  AdminSpeechVoice,
  AdminVoiceLibraryResponse,
  AdminProfile,
  GrammarFormLinkV3
} from "@tsz/types";
import { App, ConfigProvider } from "antd";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { HttpError } from "@tsz/api-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, useAuthStore } from "@/lib/auth";
import { VoicesPage } from "@/pages/Voices";
import { readingRevision } from "@tsz/shared";
import * as trialEditor from "./VoiceTrialEditor";

const linkedSynthesis = {
  alphabet: "ipa" as const,
  use_spelling: false,
  ipa: "",
  ups: "",
  uk: { ipa: "rɛkɔd", ups: "" },
  us: { ipa: "rɛkɔrd", ups: "" }
};

vi.mock(
  "@/features/dictionary/word-creation-v3/components/useReadingPreviewAdapter",
  async () => {
    const { createGrammarFormPreviewAdapter } =
      await import("@/features/dictionary/word-creation-v3/components/grammarFormPreview");
    const { adminVoicePreviewAdapter } =
      await import("@/features/dictionary/voice-editor/dataSource");
    const create = (links: GrammarFormLinkV3[]) =>
      createGrammarFormPreviewAdapter(
        adminVoicePreviewAdapter,
        async () =>
          links.map((link) => ({
            source_segments: link.source_segments,
            dialect: link.target_dialect,
            reading_reference: link.reading_reference,
            pronunciations: [
              {
                id: "00000000-0000-4000-8000-000000000015",
                dict_phonetic: "",
                actual_pron: "",
                synthesis: linkedSynthesis
              }
            ]
          })),
        links,
        { preserveDirectPhonemes: true }
      );
    return { useReadingPreviewAdapter: () => create };
  }
);

vi.mock(
  "@/features/dictionary/word-creation-v3/components/V3GrammarFormPicker",
  () => ({
    V3GrammarFormPicker: (
      props: import("@tsz/voice-editor/types").AssociationPickerProps<GrammarFormLinkV3> & {
        locale?: "en-GB" | "en-US";
      }
    ) => (
      <button
        type="button"
        onClick={() => {
          const locale = props.locale ?? "en-GB";
          props.onSelect({
            id: "00000000-0000-4000-8000-000000000010",
            source_segments: props.segments,
            target_word_id: "00000000-0000-4000-8000-000000000011",
            target_pos_id: "00000000-0000-4000-8000-000000000012",
            target_form_id: "00000000-0000-4000-8000-000000000013",
            target_variant_id: "00000000-0000-4000-8000-000000000014",
            target_dialect: locale === "en-GB" ? "uk" : "us",
            reading_reference: {
              [locale === "en-GB" ? "uk" : "us"]: {
                pronunciation_id: "00000000-0000-4000-8000-000000000015",
                alphabet: "ipa",
                locale,
                revision: readingRevision(
                  linkedSynthesis,
                  locale,
                  locale === "en-GB" ? "uk" : "us",
                  "ipa"
                )
              }
            }
          });
          props.onCancel?.();
        }}
      >
        确认测试关联词形
      </button>
    )
  })
);

const sonia: AdminSpeechVoice = {
  alias: "en-GB-SoniaNeural",
  display_name: "Sonia",
  locale: "en-GB",
  gender: "Female",
  is_common: true,
  capabilities: {
    styles: ["cheerful"],
    min_rate_percent: -50,
    max_rate_percent: 50,
    min_pitch_semitones: -10,
    max_pitch_semitones: 10
  }
};
const guy: AdminSpeechVoice = {
  ...sonia,
  alias: "en-US-GuyNeural",
  display_name: "Guy",
  locale: "en-US",
  gender: "Male",
  is_common: false,
  capabilities: { ...sonia.capabilities, styles: [] }
};
const verifiedSonia: AdminSpeechVoice = {
  ...sonia,
  metadata: {
    provider_voice_id: sonia.alias,
    model: "neural",
    age_group: "Adult",
    description: null,
    personalities: [],
    scenarios: [],
    roles: [],
    source_url: "https://speech.microsoft.com/portal/voicegallery",
    checked_at: "2026-10-25"
  }
};
// AntD 测量表头带 aria-hidden；直接排除隐藏副本，避免 jsdom 对整张表计算样式。
function labelledControl(
  label: string,
  container: HTMLElement = document.body
) {
  const matches = within(container)
    .getAllByLabelText(label)
    .filter((node) => !node.closest('[aria-hidden="true"], [hidden], [inert]'));
  expect(matches).toHaveLength(1);
  return matches[0]!;
}
function namedButton(
  name: string | RegExp,
  container: HTMLElement = document.body
) {
  const view = within(container);
  const labelled = view
    .queryAllByLabelText(name)
    .filter((node) => node.matches('button, [role="button"]'));
  const matches = [
    ...new Set(
      (labelled.length ? labelled : view.getAllByText(name))
        .map((node) => node.closest<HTMLElement>('button, [role="button"]'))
        .filter(
          (node): node is HTMLElement =>
            !!node && !node.closest('[aria-hidden="true"], [hidden], [inert]')
        )
    )
  ];
  expect(matches).toHaveLength(1);
  return matches[0]!;
}
async function selectTrialText(value: string) {
  const input = screen.getByLabelText("本次试听文本") as HTMLTextAreaElement;
  const start = input.value.indexOf(value);
  fireEvent.mouseDown(input);
  act(() => input.focus());
  input.setSelectionRange(start, start + value.length);
  fireEvent.mouseUp(input);
  fireEvent.select(input);
  await waitFor(() => expect(namedButton("输入音标")).toBeEnabled());
}
const clients: QueryClient[] = [];
const routers: ReturnType<typeof createMemoryRouter>[] = [];
function setPermissions(permissions: AdminProfile["permissions"]) {
  useAuthStore.getState().setProfile({
    id: "voice-editor-admin",
    phone: "13800138000",
    display_name: "内容管理员",
    role: "admin",
    preferences: { dialect: "uk" },
    permission_version: 1,
    catalog_version: "test",
    permissions
  });
}
function mount(openLibrary = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  clients.push(client);
  const router = createMemoryRouter(
    [
      { path: "/voices", element: <VoicesPage /> },
      { path: "/voices/library", element: <VoicesPage /> }
    ],
    { initialEntries: [openLibrary ? "/voices/library" : "/voices"] }
  );
  routers.push(router);
  const view = render(
    <QueryClientProvider client={client}>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <App>
          <RouterProvider router={router} />
        </App>
      </ConfigProvider>
    </QueryClientProvider>
  );
  return { ...view, router };
}
function editDescription() {
  if (!screen.queryByLabelText("中文介绍")) {
    fireEvent.click(labelledControl("编辑 Sonia 介绍"));
  }
}

function notesInput(container?: HTMLElement) {
  const view = container ? within(container) : screen;
  const toggle = namedButton("我的听感", container);
  if (toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
  return view.getByLabelText("我的听感");
}

function result(name: string): AdminSpeechPreviewResponse {
  return {
    cache_status: "generated",
    audio_url: `https://audio.example.test/${name}.wav`,
    expires_at: new Date(Date.now() + 600_000).toISOString(),
    url_expires_in_seconds: 600
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  setPermissions(["words.access", "speech.generate"]);
  vi.spyOn(api.speech, "voices").mockResolvedValue({ items: [sonia, guy] });
  vi.spyOn(api.speech, "preview").mockResolvedValue(result("sonia"));
  vi.spyOn(api.speech, "library").mockResolvedValue({
    items: [sonia, guy].map((voice) => ({
      voice_alias: voice.alias,
      description_zh: null,
      description_revision: 0,
      parameters: null,
      notes: "",
      personal_revision: 0
    }))
  });
  vi.spyOn(api.speech, "groupsV3").mockResolvedValue({
    groups: [],
    revision: 0,
    order_revision: 0
  });
  vi.spyOn(api.speech, "audioUpdateSettings").mockResolvedValue({
    wait_seconds: 60,
    revision: 0
  });
  vi.spyOn(api.speech, "audioUpdates").mockResolvedValue({ updates: [] });
  vi.spyOn(api.speech, "allAudioUpdates").mockResolvedValue({ updates: [] });
  vi.spyOn(api.speech, "saveSettings");
  vi.spyOn(api.speech, "saveDescription");
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  routers.splice(0).forEach((router) => router.dispose());
  clients.splice(0).forEach((client) => client.clear());
  useAuthStore.getState().setProfile(null);
  vi.restoreAllMocks();
});

describe("配音中心", () => {
  it("HD Flash资料提示真实限制，并禁用音量语速音调控件", async () => {
    vi.mocked(api.speech.voices).mockResolvedValue({
      items: [
        {
          ...sonia,
          capabilities: {
            ...sonia.capabilities,
            min_rate_percent: 0,
            max_rate_percent: 0,
            min_pitch_semitones: 0,
            max_pitch_semitones: 0,
            supports_volume_percent: false,
            supports_pause: false,
            supports_phoneme: false
          }
        }
      ]
    });
    mount();
    fireEvent.click(await screen.findByLabelText("调节 Sonia 声音"));
    expect(screen.getByLabelText("合成音量")).toBeDisabled();
    expect(screen.getByLabelText("合成语速")).toBeDisabled();
    expect(screen.getByLabelText("音调")).toBeDisabled();
    expect(
      within(screen.getByRole("region", { name: "声音参数" })).getByRole(
        "alert"
      )
    ).toBeVisible();
  });
  it("分组与音色库可通过独立地址访问，页面不再重复显示入口页签", async () => {
    setPermissions([
      "words.access",
      "speech.generate",
      "speech.global_dubbing"
    ]);
    const { router } = mount(false);
    await screen.findByText("尚未设置分组推荐");
    expect(namedButton("新增分组")).toBeVisible();
    expect(screen.queryByLabelText("共用试听文本")).toBeNull();
    expect(screen.queryByRole("button", { name: /刷新音色/ })).toBeNull();
    expect(api.speech.audioUpdateSettings).not.toHaveBeenCalled();
    expect(api.speech.allAudioUpdates).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("搜索音色")).toBeNull();
    expect(screen.queryByRole("tab", { name: "分组配音" })).toBeNull();
    await act(() => router.navigate("/voices/library"));
    expect(await screen.findByLabelText("试听 Sonia")).toBeVisible();
    expect(screen.getByLabelText("共用试听文本")).toBeVisible();
    expect(namedButton(/刷新音色/)).toBeVisible();
    expect(screen.queryByRole("tab", { name: "音色库" })).toBeNull();
    expect(screen.queryByText("尚未设置分组推荐")).toBeNull();
  });

  it("音色库加入推荐后切回工作台，完整草稿仍在且没有提前写入服务器", async () => {
    // 本例验证跨入口草稿；富文本输入与标注由下方完整试听用例覆盖。
    vi.spyOn(trialEditor, "VoiceTrialEditor").mockImplementation(() => <></>);
    setPermissions([
      "words.access",
      "speech.generate",
      "speech.global_dubbing"
    ]);
    vi.mocked(api.speech.groupsV3).mockResolvedValue({
      revision: 1,
      order_revision: 1,
      groups: [
        {
          id: "transfer-group",
          name: "测试推荐组",
          revision: 1,
          is_global: false,
          areas: ["word"],
          recommendations: { format: "paired", pairs: [] }
        }
      ]
    });
    const save = vi.spyOn(api.speech, "savePairedGroup");
    const { router } = mount();
    fireEvent.click(await screen.findByLabelText("调节 Sonia 声音"));
    fireEvent.click(namedButton("加入分组推荐"));
    fireEvent.mouseDown(await screen.findByLabelText("推荐分组"));
    fireEvent.click(
      await screen.findByText("测试推荐组", {
        selector: ".ant-select-item-option-content"
      })
    );
    fireEvent.click(namedButton("创建整套推荐"));
    fireEvent.click(
      within(await screen.findByLabelText("美式音色滚动列表")).getByRole(
        "radio",
        { name: "Guy 男声" }
      )
    );
    fireEvent.click(namedButton("保存整套推荐"));
    await screen.findByText(/已应用到分组草稿/);
    fireEvent.click(namedButton(/^完\s*成$/));
    await act(() => router.navigate("/voices"));
    const panel = await screen.findByRole("region", {
      name: "测试推荐组 分组配置"
    });
    expect(within(panel).getByLabelText("推荐名称 1")).toHaveValue("Sonia");
    expect(
      within(panel).getByRole("button", { name: /保存当前组/ })
    ).toBeEnabled();
    expect(save).not.toHaveBeenCalled();
  }, 15000);
  it("音色库切换到分组菜单前确认未保存的听感，取消保留输入", async () => {
    const { router } = mount();
    fireEvent.click(await screen.findByLabelText("调节 Sonia 声音"));
    fireEvent.change(notesInput(), {
      target: { value: "尚未保存的听感" }
    });
    await act(() => router.navigate("/voices"));
    await waitFor(() =>
      expect(screen.getByText("还有未保存的音色设置")).toBeVisible()
    );
    expect(router.state.location.pathname).toBe("/voices/library");
    fireEvent.click(namedButton("继续编辑"));
    expect(notesInput()).toHaveValue("尚未保存的听感");
    await act(() => router.navigate("/voices"));
    fireEvent.click(await waitFor(() => namedButton("放弃并离开")));
    await screen.findByText("尚未设置分组推荐");
    expect(router.state.location.pathname).toBe("/voices");
  });

  it("清空音量后输入框与控件组关联表单错误", async () => {
    mount();
    fireEvent.click(await screen.findByLabelText("调节 Sonia 声音"));
    const input = labelledControl("合成音量");
    expect(input).toHaveAttribute("aria-required", "true");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(namedButton("试听当前参数"));
    await screen.findByText("请输入 0 至 100 的整数");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("请输入 0 至 100 的整数");
    expect(
      screen.getByRole("group", { name: "音量" })
    ).toHaveAccessibleDescription("请输入 0 至 100 的整数");
    expect(api.speech.saveSettings).not.toHaveBeenCalled();
  });
  it("音量仅在本次页面保留，保存听感不保存试听参数，恢复默认清除旧音频", async () => {
    vi.mocked(api.speech.saveSettings).mockImplementation(
      async (alias, input) => ({
        voice_alias: alias,
        ...input,
        personal_revision: 1,
        description_zh: null,
        description_revision: 0
      })
    );
    mount();
    const open = await screen.findByLabelText("调节 Sonia 声音");
    fireEvent.click(open);
    const drawer = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const drawerButton = (text: string) => namedButton(text, drawer);
    const volume = within(drawer).getByDisplayValue("100");
    expect(volume).toHaveAttribute("aria-label", "合成音量");
    expect(volume).toHaveValue("100");
    await waitFor(() => expect(drawerButton("恢复默认参数")).toBeDisabled());
    fireEvent.change(volume, { target: { value: "65" } });
    await waitFor(() => expect(drawerButton("恢复默认参数")).toBeEnabled());
    expect(within(drawer).getByLabelText("合成音量滑块")).toHaveAttribute(
      "aria-valuenow",
      "65"
    );
    fireEvent.click(drawerButton("试听当前参数"));
    await waitFor(() =>
      expect(api.speech.preview).toHaveBeenLastCalledWith(
        expect.objectContaining({ volume_percent: 65 }),
        expect.any(AbortSignal)
      )
    );
    await screen.findByLabelText("Sonia 试听播放器");
    notesInput(drawer);
    fireEvent.click(drawerButton("保存听感"));
    await screen.findByText("听感已保存，仅你可见。");
    expect(api.speech.saveSettings).toHaveBeenLastCalledWith(
      sonia.alias,
      expect.objectContaining({
        parameters: null
      })
    );
    fireEvent.click(within(drawer).getByLabelText("Close"));
    await waitFor(() =>
      expect(document.querySelector('[role="dialog"]')).toBeNull()
    );
    fireEvent.click(open);
    const reopened = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const reset = labelledControl("恢复默认参数", reopened);
    const reopenedVolume = within(reopened).getByDisplayValue("65");
    expect(reopenedVolume).toHaveAttribute("aria-label", "合成音量");
    expect(reopenedVolume).toHaveValue("65");
    fireEvent.click(reset);
    expect(reopenedVolume).toHaveValue("100");
    fireEvent.change(reopenedVolume, { target: { value: "0" } });
    expect(await screen.findByText("已静音")).toBeVisible();
    fireEvent.click(within(reopened).getByLabelText("试听当前参数"));
    await waitFor(() =>
      expect(api.speech.preview).toHaveBeenLastCalledWith(
        expect.objectContaining({ volume_percent: 0 }),
        expect.any(AbortSignal)
      )
    );
    await screen.findByLabelText("Sonia 试听播放器");
    fireEvent.click(reset);
    expect(screen.queryByLabelText("Sonia 试听播放器")).toBeNull();
  }, 15000);

  it("重新进入页面恢复默认试听参数，历史个人参数不被写回或清除", async () => {
    const saved = {
      voice_alias: sonia.alias,
      parameters: { rate_percent: -25, pitch_semitones: 2, style: "cheerful" },
      notes: "历史听感",
      personal_revision: 3,
      description_zh: null,
      description_revision: 0
    };
    vi.mocked(api.speech.library).mockResolvedValue({ items: [saved] });
    const first = mount();
    fireEvent.click(await screen.findByLabelText("调节 Sonia 声音"));
    expect(screen.getByLabelText("合成语速")).toHaveValue("1.00");
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "0.80" }
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByLabelText("Close"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    first.unmount();
    mount();
    fireEvent.click(await screen.findByLabelText("调节 Sonia 声音"));
    expect(screen.getByLabelText("合成语速")).toHaveValue("1.00");
    expect(notesInput()).toHaveValue("历史听感");
    expect(api.speech.saveSettings).not.toHaveBeenCalled();
  });

  it.each(["personal", "description"] as const)(
    "%s 保存完成后，保存期间发起的旧查询不能覆盖新设置",
    async (kind) => {
      setPermissions([
        "words.access",
        "speech.generate",
        "speech.global_dubbing"
      ]);
      const saved = {
        voice_alias: sonia.alias,
        parameters: { rate_percent: -25, pitch_semitones: 0, style: null },
        notes: "清晰慢读",
        personal_revision: 2,
        description_zh: "自然清晰",
        description_revision: 2
      };
      const put = deferred<typeof saved>();
      const get = deferred<AdminVoiceLibraryResponse>();
      const method =
        kind === "personal"
          ? api.speech.saveSettings
          : api.speech.saveDescription;
      vi.mocked(method).mockImplementationOnce(() => put.promise);
      mount();
      const adjust = await screen.findByLabelText("调节 Sonia 声音");
      if (kind === "personal") fireEvent.click(adjust);
      const client = clients.at(-1)!;
      const queryKey = ["admin-speech-library", "voice-editor-admin"];
      const old = client.getQueryData<AdminVoiceLibraryResponse>(queryKey)!;
      if (kind === "personal") {
        fireEvent.change(screen.getByLabelText("合成语速"), {
          target: { value: "0.75" }
        });
        fireEvent.change(notesInput(), {
          target: { value: saved.notes }
        });
      } else {
        editDescription();
        fireEvent.change(screen.getByLabelText("中文介绍"), {
          target: { value: saved.description_zh }
        });
      }
      fireEvent.click(
        screen.getByText(kind === "personal" ? "保存听感" : "保存介绍")
      );
      await waitFor(() => expect(method).toHaveBeenCalledTimes(1));
      vi.mocked(api.speech.library).mockImplementationOnce(() => get.promise);
      act(() => {
        void client.refetchQueries({ queryKey, exact: true });
      });
      await waitFor(() => expect(api.speech.library).toHaveBeenCalledTimes(2));
      await act(async () => put.resolve(saved));
      await screen.findByText(
        kind === "personal"
          ? "听感已保存，仅你可见。"
          : "中文介绍已保存，所有有权查看音色的管理员可见。"
      );
      await act(async () => get.resolve(old));
      if (kind === "personal") {
        fireEvent.click(
          within(screen.getByRole("dialog")).getByLabelText("Close")
        );
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        fireEvent.click(screen.getByLabelText("调节 Sonia 声音"));
      }
      if (kind === "personal") {
        expect(screen.getByLabelText("合成语速")).toHaveValue("0.75");
        expect(notesInput()).toHaveValue(saved.notes);
      } else {
        editDescription();
        expect(screen.getByLabelText("中文介绍")).toHaveValue(
          saved.description_zh
        );
      }
    }
  );

  it.each(["personal", "description"] as const)(
    "%s 保存目录新增音色后，重新打开仍能读到保存值与版本",
    async (kind) => {
      setPermissions([
        "words.access",
        "speech.generate",
        "speech.global_dubbing"
      ]);
      vi.mocked(api.speech.library).mockResolvedValue({ items: [] });
      const saved = {
        voice_alias: sonia.alias,
        parameters: { rate_percent: -25, pitch_semitones: 0, style: null },
        notes: "新音色笔记",
        personal_revision: 1,
        description_zh: "新音色介绍",
        description_revision: 1
      };
      const method =
        kind === "personal"
          ? api.speech.saveSettings
          : api.speech.saveDescription;
      vi.mocked(method).mockResolvedValue(saved);
      mount();
      const adjust = await screen.findByLabelText("调节 Sonia 声音");
      if (kind === "personal") fireEvent.click(adjust);
      if (kind === "personal") {
        fireEvent.change(screen.getByLabelText("合成语速"), {
          target: { value: "0.75" }
        });
        fireEvent.change(notesInput(), {
          target: { value: saved.notes }
        });
      } else {
        editDescription();
        fireEvent.change(screen.getByLabelText("中文介绍"), {
          target: { value: saved.description_zh }
        });
      }
      const saveLabel = kind === "personal" ? "保存听感" : "保存介绍";
      fireEvent.click(screen.getByText(saveLabel));
      await screen.findByText(
        kind === "personal"
          ? "听感已保存，仅你可见。"
          : "中文介绍已保存，所有有权查看音色的管理员可见。"
      );
      if (kind === "personal") {
        fireEvent.click(
          within(screen.getByRole("dialog")).getByLabelText("Close")
        );
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        fireEvent.click(screen.getByLabelText("调节 Sonia 声音"));
      }
      if (kind === "personal") {
        expect(screen.getByLabelText("合成语速")).toHaveValue("0.75");
        expect(notesInput()).toHaveValue(saved.notes);
      } else {
        editDescription();
        expect(screen.getByLabelText("中文介绍")).toHaveValue(
          saved.description_zh
        );
      }
      fireEvent.click(screen.getByText(saveLabel));
      await waitFor(() =>
        expect(method).toHaveBeenLastCalledWith(
          sonia.alias,
          expect.objectContaining({ base_revision: 1 })
        )
      );
    }
  );

  it("历史个人参数仍可读取，但首次试听使用默认参数", async () => {
    const pending = deferred<AdminVoiceLibraryResponse>();
    vi.mocked(api.speech.library).mockImplementationOnce(() => pending.promise);
    mount();
    const button = await screen.findByLabelText("试听 Sonia");
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(api.speech.preview).not.toHaveBeenCalled();
    await act(async () =>
      pending.resolve({
        items: [
          {
            voice_alias: sonia.alias,
            parameters: {
              rate_percent: -25,
              pitch_semitones: 2,
              style: "cheerful"
            },
            notes: "",
            personal_revision: 1,
            description_zh: null,
            description_revision: 0
          }
        ]
      })
    );
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() =>
      expect(api.speech.preview).toHaveBeenCalledWith(
        expect.objectContaining({
          rate_percent: 0,
          pitch_semitones: 0
        }),
        expect.any(AbortSignal)
      )
    );
  });

  it("表格编辑介绍不中断试听，调参才清除音频", async () => {
    setPermissions([
      "words.access",
      "speech.generate",
      "speech.global_dubbing"
    ]);
    const pending = deferred<AdminSpeechPreviewResponse>();
    vi.mocked(api.speech.preview).mockImplementationOnce(() => pending.promise);
    mount();
    fireEvent.click(await screen.findByLabelText("试听 Sonia"));
    await waitFor(() => expect(api.speech.preview).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(api.speech.preview).mock.calls[0]![1]!;
    editDescription();
    fireEvent.change(screen.getByLabelText("中文介绍"), {
      target: { value: "自然清晰" }
    });
    expect(signal.aborted).toBe(false);
    await act(async () => pending.resolve(result("sonia")));
    const audio = await screen.findByLabelText("Sonia 试听播放器");
    fireEvent.play(audio);
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
    fireEvent.change(screen.getByLabelText("中文介绍"), {
      target: { value: "声音清晰" }
    });
    expect(screen.getByLabelText("Sonia 试听播放器")).toBe(audio);
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("调节 Sonia 声音"));
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "0.75" }
    });
    expect(screen.queryByLabelText("Sonia 试听播放器")).toBeNull();
  });

  it("刷新目录不覆盖本次试听参数，保存听感期间参数不可编辑", async () => {
    const info = {
      voice_alias: sonia.alias,
      parameters: { rate_percent: -25, pitch_semitones: 0, style: null },
      notes: "",
      personal_revision: 1,
      description_revision: 0,
      description_zh: null
    };
    const pending = deferred<typeof info>();
    vi.mocked(api.speech.saveSettings).mockImplementationOnce(
      () => pending.promise
    );
    mount();
    fireEvent.click(await screen.findByLabelText("调节 Sonia 声音"));
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "0.75" }
    });
    fireEvent.click(screen.getByText("保存听感"));
    await waitFor(() => expect(api.speech.saveSettings).toHaveBeenCalled());
    expect(screen.getByLabelText("合成语速")).toBeDisabled();
    expect(screen.getByLabelText("音调")).toBeDisabled();
    await act(async () => pending.resolve(info));
    fireEvent.click(within(screen.getByRole("dialog")).getByLabelText("Close"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const latest = {
      ...info,
      personal_revision: 2,
      parameters: { ...info.parameters, rate_percent: 20 }
    };
    vi.mocked(api.speech.library).mockResolvedValue({ items: [latest] });
    fireEvent.click(screen.getByText("刷新音色"));
    await waitFor(() => expect(api.speech.library).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByLabelText("调节 Sonia 声音"));
    expect(screen.getByLabelText("合成语速")).toHaveValue("0.75");
  }, 15000);

  it("关闭未保存听感时提示，重新载入期间不能切换音色", async () => {
    vi.mocked(api.speech.saveSettings).mockRejectedValue(
      new HttpError(409, "conflict")
    );
    mount();
    fireEvent.click(await screen.findByLabelText("调节 Sonia 声音"));
    fireEvent.change(notesInput(), {
      target: { value: "不能丢失的笔记" }
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByLabelText("Close"));
    expect(
      await screen.findByText("关闭会丢弃尚未保存的听感。")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("继续编辑"));
    await waitFor(() =>
      expect(screen.queryByText("关闭会丢弃尚未保存的听感。")).toBeNull()
    );
    expect(notesInput()).toHaveValue("不能丢失的笔记");
    fireEvent.click(screen.getByText("保存听感"));
    const reload = await screen.findByText("重新载入设置");
    const pending = deferred<{ items: [] }>();
    vi.mocked(api.speech.library).mockImplementationOnce(() => pending.promise);
    fireEvent.click(reload);
    fireEvent.click(within(screen.getByRole("dialog")).getByLabelText("Close"));
    expect(notesInput()).toHaveValue("不能丢失的笔记");
    expect(screen.getByLabelText("合成语速")).toBeDisabled();
    await act(async () => pending.resolve({ items: [] }));
  }, 15000);

  it("听感保存保留历史参数，重新打开读回，冲突保留输入且不覆盖版本", async () => {
    const saved = {
      voice_alias: sonia.alias,
      parameters: { rate_percent: -25, pitch_semitones: 0, style: null },
      notes: "清晰慢读",
      personal_revision: 1,
      description_zh: null,
      description_revision: 0
    };
    vi.mocked(api.speech.library).mockResolvedValue({
      items: [{ ...saved, notes: "", personal_revision: 0 }]
    });
    vi.mocked(api.speech.saveSettings)
      .mockResolvedValueOnce(saved)
      .mockRejectedValueOnce(
        new HttpError(409, "conflict", [], "revision_conflict")
      );
    mount();
    const open = await screen.findByLabelText("调节 Sonia 声音");
    await waitFor(() => expect(open).toBeEnabled());
    fireEvent.click(open);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("合成语速"), {
      target: { value: "0.75" }
    });
    fireEvent.change(notesInput(dialog), { target: { value: "清晰慢读" } });
    fireEvent.click(namedButton("保存听感", dialog));
    await screen.findByText("听感已保存，仅你可见。");
    expect(api.speech.saveSettings).toHaveBeenCalledWith(sonia.alias, {
      parameters: saved.parameters,
      notes: "清晰慢读",
      base_revision: 0
    });
    fireEvent.click(namedButton("Close", dialog));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(open);
    const reopened = await screen.findByRole("dialog");
    expect(notesInput(reopened)).toHaveValue("清晰慢读");
    fireEvent.change(notesInput(reopened), { target: { value: "我的新笔记" } });
    fireEvent.click(namedButton("保存听感", reopened));
    await screen.findByText(
      "设置已在其他页面修改。当前输入已保留，请重新载入最新设置后再编辑。"
    );
    expect(notesInput(reopened)).toHaveValue("我的新笔记");
    expect(api.speech.saveSettings).toHaveBeenLastCalledWith(
      sonia.alias,
      expect.objectContaining({ base_revision: 1 })
    );
    expect(
      within(reopened).queryByRole("button", { name: "保存介绍" })
    ).toBeNull();
  }, 15_000);

  it("从服务目录筛选，清空条件恢复完整列表", async () => {
    mount();
    await screen.findByLabelText("试听 Sonia");
    const list = labelledControl("音色列表");
    expect(within(list).getByLabelText("试听 Sonia")).toBeVisible();
    expect(within(list).getByLabelText("试听 Guy")).toBeVisible();
    fireEvent.change(labelledControl("搜索音色"), {
      target: { value: "guy" }
    });
    expect(screen.queryByLabelText("试听 Sonia")).toBeNull();
    expect(screen.getByLabelText("试听 Guy")).toBeEnabled();
    fireEvent.click(namedButton("音色筛选和排序"));
    fireEvent.click(screen.getByLabelText("只看常用"));
    expect(screen.getByText("未找到符合条件的数据")).toBeVisible();
    fireEvent.click(namedButton("清除筛选"));
    expect(screen.getByLabelText("试听 Sonia")).toBeVisible();
    expect(screen.getByLabelText("试听 Guy")).toBeVisible();
  }, 10_000);

  it("在后续页筛选或清空条件时回到第一页", async () => {
    vi.mocked(api.speech.voices).mockResolvedValue({
      items: Array.from({ length: 12 }, (_, index) => ({
        ...sonia,
        alias: `voice-${index + 1}`,
        display_name: `Voice ${index + 1}`
      }))
    });
    mount();
    await screen.findByLabelText("试听 Voice 1");
    fireEvent.click(screen.getByTitle("2"));
    expect(screen.getByLabelText("试听 Voice 11")).toBeVisible();
    expect(screen.queryByLabelText("试听 Voice 1")).toBeNull();
    fireEvent.change(labelledControl("搜索音色"), {
      target: { value: "Voice 12" }
    });
    expect(screen.getByLabelText("试听 Voice 12")).toBeVisible();
    fireEvent.click(namedButton("清除筛选"));
    expect(screen.getByLabelText("试听 Voice 1")).toBeVisible();
    expect(screen.queryByLabelText("试听 Voice 12")).toBeNull();
  });

  it("调节入口直接显示声音参数，不再展示资料页签和重复资料", async () => {
    mount();
    fireEvent.click(await screen.findByLabelText("调节 Sonia 声音"));
    const details = within(screen.getByRole("dialog"));
    expect(details.getByText("调节声音", { exact: false })).toBeVisible();
    expect(details.queryByRole("tab")).toBeNull();
    expect(details.queryByRole("region", { name: "音色资料" })).toBeNull();
    expect(details.queryByText("英国")).toBeNull();
    const rate = details.getByLabelText("合成语速");
    expect(rate).toHaveValue("1.00");
    expect(rate).toHaveAttribute("aria-label", "合成语速");
    expect(rate).toBeVisible();
    fireEvent.change(rate, { target: { value: "0.75" } });
    fireEvent.click(screen.getByLabelText("试听当前参数"));
    expect(await screen.findByLabelText("Sonia 试听播放器")).toBeVisible();
    expect(rate).toHaveValue("0.75");
    expect(api.speech.preview).toHaveBeenCalledTimes(1);
  });

  it("表格介绍草稿离开页面前确认，取消导航保留输入", async () => {
    setPermissions(["words.access", "speech.global_dubbing"]);
    const { router } = mount();
    await screen.findByLabelText("调节 Sonia 声音");
    editDescription();
    fireEvent.change(screen.getByLabelText("中文介绍"), {
      target: { value: "新介绍" }
    });
    expect(labelledControl("搜索音色")).toBeDisabled();
    act(() => {
      void router.navigate("/voices");
    });
    await waitFor(() =>
      expect(screen.getByText("还有未保存的音色设置")).toBeVisible()
    );
    fireEvent.click(namedButton("继续编辑"));
    expect(screen.getByLabelText("中文介绍")).toHaveValue("新介绍");
    expect(router.state.location.pathname).toBe("/voices/library");
  });

  it("表格介绍保存期间不能放弃离开", async () => {
    setPermissions(["words.access", "speech.global_dubbing"]);
    const saved = {
      voice_alias: sonia.alias,
      description_zh: "新介绍",
      description_revision: 1,
      notes: "",
      parameters: null,
      personal_revision: 0
    };
    const pending = deferred<typeof saved>();
    vi.mocked(api.speech.saveDescription).mockImplementationOnce(
      () => pending.promise
    );
    const { router } = mount();
    await screen.findByLabelText("调节 Sonia 声音");
    editDescription();
    fireEvent.change(screen.getByLabelText("中文介绍"), {
      target: { value: "新介绍" }
    });
    fireEvent.click(screen.getByText("保存介绍"));
    await waitFor(() => expect(api.speech.saveDescription).toHaveBeenCalled());
    act(() => {
      void router.navigate("/voices");
    });
    expect(await waitFor(() => namedButton("放弃并离开"))).toBeDisabled();
    await act(async () => pending.resolve(saved));
    fireEvent.click(namedButton("继续编辑"));
    await waitFor(() => expect(screen.queryByLabelText("中文介绍")).toBeNull());
    await waitFor(() => expect(labelledControl("搜索音色")).toBeEnabled());
  });

  it("取消生成后，迟到的音频不会重新出现", async () => {
    const pending = deferred<AdminSpeechPreviewResponse>();
    vi.mocked(api.speech.preview).mockImplementationOnce(() => pending.promise);
    mount();
    fireEvent.click(await screen.findByLabelText("试听 Sonia"));
    const signal = vi.mocked(api.speech.preview).mock.calls[0]![1]!;
    fireEvent.click(namedButton(/取\s*消/));
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(result("cancelled")));
    expect(screen.queryByLabelText("Sonia 试听播放器")).toBeNull();
  });

  it("全局配音管理员可维护音色，但不自动获得试听权限", async () => {
    setPermissions(["speech.global_dubbing"]);
    mount();
    expect(await screen.findByLabelText("试听 Sonia")).toBeDisabled();
    editDescription();
    expect(screen.getByLabelText("中文介绍")).not.toHaveAttribute("readonly");
    expect(screen.getByText("保存介绍")).toBeEnabled();
  });

  it("首次编辑采用最新介绍版本，后续刷新不覆盖草稿及其版本", async () => {
    setPermissions([
      "words.access",
      "speech.generate",
      "speech.global_dubbing"
    ]);
    const original = {
      voice_alias: sonia.alias,
      description_zh: "旧介绍",
      description_revision: 1,
      parameters: null,
      notes: "",
      personal_revision: 0
    };
    vi.mocked(api.speech.library).mockResolvedValue({ items: [original] });
    vi.mocked(api.speech.saveDescription).mockRejectedValue(
      new HttpError(409, "conflict")
    );
    mount();
    await screen.findByLabelText("调节 Sonia 声音");
    const client = clients.at(-1)!;
    const queryKey = ["admin-speech-library", "voice-editor-admin"];
    const refresh = async (description: string, revision: number) => {
      vi.mocked(api.speech.library).mockResolvedValue({
        items: [
          {
            ...original,
            description_zh: description,
            description_revision: revision
          }
        ]
      });
      await act(async () => {
        await client.refetchQueries({ queryKey, exact: true });
      });
    };
    await refresh("最新介绍", 2);
    expect(await screen.findByText("最新介绍")).toBeVisible();
    editDescription();
    const description = screen.getByLabelText("中文介绍");
    expect(description).toHaveValue("最新介绍");
    fireEvent.change(description, { target: { value: "我的介绍草稿" } });
    await refresh("其他管理员再次更新", 3);

    expect(description).toHaveValue("我的介绍草稿");
    fireEvent.click(screen.getByText("保存介绍"));
    await waitFor(() =>
      expect(api.speech.saveDescription).toHaveBeenCalledWith(sonia.alias, {
        description_zh: "我的介绍草稿",
        base_revision: 2
      })
    );
    await screen.findByText(/资料已在其他页面修改/);
    expect(description).toHaveValue("我的介绍草稿");
  });

  it("按听感筛选后保存新听感仍保留表格介绍草稿，取消编辑后恢复筛选", async () => {
    setPermissions([
      "words.access",
      "speech.generate",
      "speech.global_dubbing"
    ]);
    vi.mocked(api.speech.library).mockResolvedValue({
      items: [
        {
          voice_alias: sonia.alias,
          parameters: null,
          notes: "独有旧听感",
          personal_revision: 0,
          description_zh: null,
          description_revision: 0
        }
      ]
    });
    vi.mocked(api.speech.saveSettings).mockResolvedValue({
      voice_alias: sonia.alias,
      parameters: null,
      notes: "新听感",
      personal_revision: 1,
      description_zh: null,
      description_revision: 0
    });
    mount();
    await screen.findByLabelText("调节 Sonia 声音");
    await screen.findByText("我的听感：独有旧听感");
    fireEvent.change(labelledControl("搜索音色"), {
      target: { value: "独有旧听感" }
    });
    editDescription();
    fireEvent.change(screen.getByLabelText("中文介绍"), {
      target: { value: "清晰自然" }
    });
    fireEvent.click(screen.getByLabelText("调节 Sonia 声音"));
    const drawer = screen.getByRole("dialog");
    expect(within(drawer).queryByLabelText("中文介绍")).toBeNull();
    expect(within(drawer).queryByLabelText("当前口音归属")).toBeNull();
    fireEvent.change(notesInput(drawer), {
      target: { value: "新听感" }
    });
    fireEvent.click(within(drawer).getByText("保存听感"));
    await screen.findByText("听感已保存，仅你可见。");
    expect(api.speech.saveDescription).not.toHaveBeenCalled();
    fireEvent.click(within(drawer).getByLabelText("Close"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText("中文介绍")).toHaveValue("清晰自然");
    fireEvent.click(namedButton(/^取\s*消$/));
    await waitFor(() =>
      expect(screen.queryByLabelText("调节 Sonia 声音")).toBeNull()
    );
    fireEvent.change(labelledControl("搜索音色"), {
      target: { value: "" }
    });
    expect(await screen.findByText("我的听感：新听感")).toBeVisible();
  }, 15000);

  it("表格保存口音只更新口音，不覆盖听感与介绍的较新版本", async () => {
    setPermissions(["words.access", "speech.global_dubbing"]);
    const original = {
      voice_alias: sonia.alias,
      parameters: null,
      notes: "保留听感",
      personal_revision: 3,
      description_zh: "保留介绍",
      description_revision: 4,
      accent: "gb" as const,
      accent_revision: 2
    };
    vi.mocked(api.speech.library).mockResolvedValue({ items: [original] });
    const saveAccent = vi.spyOn(api.speech, "saveAccent").mockResolvedValue({
      ...original,
      notes: "过期听感",
      personal_revision: 1,
      description_zh: "过期介绍",
      description_revision: 1,
      accent: "us",
      accent_revision: 3
    });
    mount();
    fireEvent.click(await screen.findByLabelText("编辑 Sonia 口音"));
    const select = labelledControl("当前口音归属");
    fireEvent.mouseDown(select);
    const choice = await waitFor(() => {
      const match = Array.from(
        document.querySelectorAll(
          ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content"
        )
      ).find((node) => node.textContent === "美式");
      expect(match).toBeDefined();
      return match!;
    });
    fireEvent.click(choice);
    fireEvent.keyDown(select, { key: "Escape" });
    vi.mocked(api.speech.voices).mockResolvedValue({
      items: [{ ...sonia, accent: "us" }, guy]
    });
    fireEvent.click(screen.getByText("保存口音"));
    await screen.findByText("口音归属已保存。");
    expect(saveAccent).toHaveBeenCalledWith(sonia.alias, {
      accent: "us",
      base_revision: 2
    });
    const cached = clients
      .at(-1)!
      .getQueryData<AdminVoiceLibraryResponse>([
        "admin-speech-library",
        "voice-editor-admin"
      ]);
    expect(cached?.items[0]).toMatchObject({
      notes: "保留听感",
      personal_revision: 3,
      description_zh: "保留介绍",
      description_revision: 4,
      accent: "us",
      accent_revision: 3
    });
    const row = screen.getByLabelText("调节 Sonia 声音").closest("tr")!;
    expect(within(row).getByText("英国")).toBeVisible();
    expect(within(row).getByText("美式")).toBeVisible();
  });

  it("介绍列可恢复官方介绍，不改变个人设置", async () => {
    setPermissions(["words.access", "speech.global_dubbing"]);
    const original = {
      voice_alias: sonia.alias,
      parameters: null,
      notes: "保留听感",
      personal_revision: 3,
      description_zh: "自定义介绍",
      description_revision: 4
    };
    vi.mocked(api.speech.library).mockResolvedValue({ items: [original] });
    const restore = vi
      .spyOn(api.speech, "restoreDescription")
      .mockResolvedValue({
        ...original,
        description_zh: null,
        description_revision: 5
      });
    mount();
    await screen.findByLabelText("调节 Sonia 声音");
    editDescription();
    fireEvent.click(screen.getByText("恢复官方介绍"));
    await screen.findByText("已恢复官方介绍。");
    expect(restore).toHaveBeenCalledWith(sonia.alias, { base_revision: 4 });
    expect(api.speech.saveDescription).not.toHaveBeenCalled();
    expect(
      clients
        .at(-1)!
        .getQueryData<AdminVoiceLibraryResponse>([
          "admin-speech-library",
          "voice-editor-admin"
        ])?.items[0]
    ).toMatchObject({
      description_zh: null,
      description_revision: 5,
      notes: "保留听感",
      personal_revision: 3
    });
  });

  it("账号切换后不接纳旧介绍保存响应", async () => {
    setPermissions(["words.access", "speech.global_dubbing"]);
    const saved = {
      voice_alias: sonia.alias,
      parameters: null,
      notes: "",
      personal_revision: 0,
      description_zh: "旧账号迟到介绍",
      description_revision: 1
    };
    const pending = deferred<typeof saved>();
    vi.mocked(api.speech.saveDescription).mockImplementationOnce(
      () => pending.promise
    );
    mount();
    await screen.findByLabelText("调节 Sonia 声音");
    editDescription();
    fireEvent.change(screen.getByLabelText("中文介绍"), {
      target: { value: saved.description_zh }
    });
    fireEvent.click(screen.getByText("保存介绍"));
    await waitFor(() => expect(api.speech.saveDescription).toHaveBeenCalled());
    act(() =>
      useAuthStore
        .getState()
        .setProfile({ ...useAuthStore.getState().profile!, id: "other-admin" })
    );
    await act(async () => pending.resolve(saved));
    expect(screen.queryByLabelText("中文介绍")).toBeNull();
    expect(screen.queryByText(saved.description_zh)).toBeNull();
    const client = clients.at(-1)!;
    expect(
      client.getQueryData<AdminVoiceLibraryResponse>([
        "admin-speech-library",
        "voice-editor-admin"
      ])?.items[0]?.description_zh
    ).toBeNull();
    expect(
      client.getQueryData<AdminVoiceLibraryResponse>([
        "admin-speech-library",
        "other-admin"
      ])?.items[0]?.description_zh
    ).not.toBe(saved.description_zh);
  });

  it("合并后的语速预设只提供服务支持的值，并原样提交百分比", async () => {
    mount();
    fireEvent.click(await screen.findByLabelText("调节 Sonia 声音"));
    expect(screen.queryByRole("combobox", { name: "语速常用值" })).toBeNull();
    fireEvent.click(namedButton("语速常用值"));
    expect(screen.queryByRole("menuitem", { name: "0.30×" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "1.70×" })).toBeNull();
    fireEvent.click(await screen.findByRole("menuitem", { name: "0.75×" }));
    expect(screen.getByLabelText("合成语速")).toHaveValue("0.75");
    fireEvent.click(namedButton("试听当前参数"));
    await waitFor(() =>
      expect(api.speech.preview).toHaveBeenCalledWith(
        expect.objectContaining({ rate_percent: -25 }),
        expect.any(AbortSignal)
      )
    );
    fireEvent.click(namedButton("试听原参数"));
    await waitFor(() => expect(api.speech.preview).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.speech.preview).mock.calls[1]![0]).toMatchObject({
      rate_percent: 0
    });
    expect(screen.getByLabelText("合成语速")).toHaveValue("0.75");
  });

  it("展开直接显示 SSML，折叠时中止试听但保留手动原文", async () => {
    const automatic = '<speak><voice name="Sonia">cat</voice></speak>';
    const renderSsml = vi
      .spyOn(api.speech, "renderSsml")
      .mockResolvedValue({ ssml: automatic });
    const pending = deferred<AdminSpeechPreviewResponse>();
    const manualPreview = vi
      .spyOn(api.speech, "manualPreview")
      .mockImplementation(() => pending.promise);
    mount();
    fireEvent.click(await screen.findByLabelText("调节 Sonia 声音"));
    expect(screen.queryByText("查看 SSML")).toBeNull();
    expect(renderSsml).not.toHaveBeenCalled();
    const tools = namedButton("SSML");
    fireEvent.click(tools);
    expect(screen.queryByText("查看 SSML")).toBeNull();
    expect(screen.queryByText("收起 SSML")).toBeNull();
    await waitFor(() =>
      expect(screen.getByLabelText("SSML 原文")).toHaveValue(automatic)
    );
    expect(screen.queryByLabelText("SSML 配音版本")).toBeNull();
    fireEvent.click(screen.getByLabelText("手动编辑 SSML"));
    const manual = '<speak><voice name="Sonia">kitten</voice></speak>';
    fireEvent.change(screen.getByLabelText("SSML 原文"), {
      target: { value: manual }
    });
    fireEvent.click(namedButton("试听 SSML"));
    await waitFor(() => expect(manualPreview).toHaveBeenCalled());
    const signal = manualPreview.mock.calls[0]![1]!;
    fireEvent.click(tools);
    expect(signal.aborted).toBe(true);
    fireEvent.click(tools);
    await waitFor(() =>
      expect(screen.getByLabelText("SSML 原文")).toBeVisible()
    );
    expect(screen.getByLabelText("SSML 原文")).toHaveValue(manual);
    await act(async () => pending.resolve(result("late-ssml")));
    expect(screen.queryByLabelText(/审听 .*SSML/)).toBeNull();
  }, 15000);
  it("切换音色或关闭后重开，保留本页各声音的手动 SSML", async () => {
    // 本例验证宿主暂存 SSML，富文本组件不参与原文的编辑与恢复。
    vi.spyOn(trialEditor, "VoiceTrialEditor").mockImplementation(() => <></>);
    vi.spyOn(api.speech, "renderSsml").mockResolvedValue({
      ssml: "<speak>automatic</speak>"
    });
    mount();
    for (const [name, raw] of [
      ["Sonia", "<speak>Sonia draft</speak>"],
      ["Guy", "<speak>Guy draft</speak>"]
    ]) {
      fireEvent.click(await screen.findByLabelText(`调节 ${name} 声音`));
      fireEvent.click(namedButton("SSML"));
      await waitFor(() =>
        expect(screen.getByLabelText("SSML 原文")).toHaveValue(
          "<speak>automatic</speak>"
        )
      );
      fireEvent.click(screen.getByLabelText("手动编辑 SSML"));
      fireEvent.change(screen.getByLabelText("SSML 原文"), {
        target: { value: raw }
      });
      fireEvent.click(screen.getByLabelText("Close"));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
    fireEvent.click(screen.getByLabelText("调节 Sonia 声音"));
    fireEvent.click(namedButton("SSML"));
    await waitFor(() =>
      expect(screen.getByLabelText("SSML 原文")).toHaveValue(
        "<speak>Sonia draft</speak>"
      )
    );
    expect(screen.getByLabelText("手动编辑 SSML")).toBeChecked();
  }, 15000);

  it("每个音色保留独立试听文本、标注、格式与参数，列表使用保留草稿", async () => {
    vi.mocked(api.speech.voices).mockResolvedValue({
      items: [verifiedSonia, guy]
    });
    mount();
    fireEvent.click(await screen.findByLabelText("调节 Sonia 声音"));
    fireEvent.change(labelledControl("本次试听文本"), {
      target: { value: "record again" }
    });
    await selectTrialText("record");
    fireEvent.click(namedButton("输入音标"));
    fireEvent.change(screen.getByLabelText("指定音标"), {
      target: { value: "rɪˈkɔːd" }
    });
    fireEvent.click(namedButton("应用音标"));
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "0.75" }
    });
    fireEvent.mouseDown(labelledControl("试听输出格式"));
    fireEvent.click(await screen.findByText("WAV"));
    fireEvent.click(namedButton("保留本次试听"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.change(screen.getByLabelText("共用试听文本"), {
      target: { value: " " }
    });
    expect(screen.getByLabelText("试听 Sonia")).toBeEnabled();
    expect(screen.getByLabelText("试听 Guy")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("共用试听文本"), {
      target: { value: "new shared text" }
    });
    fireEvent.click(screen.getByLabelText("试听 Sonia"));
    await waitFor(() =>
      expect(api.speech.preview).toHaveBeenCalledWith(
        expect.objectContaining({
          output_format: "wav",
          rate_percent: -25,
          content: {
            version: 2,
            text: "record again",
            annotations: [
              {
                type: "phoneme",
                start: 0,
                end: 6,
                alphabet: "ipa",
                phoneme: "rɪˈkɔːd"
              }
            ]
          }
        }),
        expect.any(AbortSignal)
      )
    );
    fireEvent.click(screen.getByLabelText("调节 Guy 声音"));
    expect(labelledControl("本次试听文本")).toHaveValue("new shared text");
    expect(screen.getByLabelText("合成语速")).toHaveValue("1.00");
    fireEvent.click(within(screen.getByRole("dialog")).getByLabelText("Close"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByLabelText("调节 Sonia 声音"));
    expect(labelledControl("本次试听文本")).toHaveValue("record again");
    expect(screen.getByLabelText("合成语速")).toHaveValue("0.75");
  }, 15000);

  it("关联词形经服务端编译后试听，直接音标仍原样送入编译请求", async () => {
    vi.mocked(api.speech.voices).mockResolvedValue({ items: [verifiedSonia] });
    const ssml =
      '<speak><voice name="Sonia">compiled linked reading</voice></speak>';
    const renderSsml = vi
      .spyOn(api.speech, "renderSsml")
      .mockResolvedValue({ ssml });
    const manualPreview = vi
      .spyOn(api.speech, "manualPreview")
      .mockResolvedValue(result("linked"));
    mount();
    fireEvent.click(await screen.findByLabelText("调节 Sonia 声音"));
    await selectTrialText("Please");
    fireEvent.click(namedButton("输入音标"));
    fireEvent.change(screen.getByLabelText("指定音标"), {
      target: { value: "pliːz" }
    });
    fireEvent.click(namedButton("应用音标"));
    await selectTrialText("record");
    fireEvent.click(namedButton("关联单词读法"));
    fireEvent.click(await screen.findByText("确认测试关联词形"));
    fireEvent.click(namedButton("试听当前参数"));
    await waitFor(() =>
      expect(manualPreview).toHaveBeenCalledWith(
        { voice_alias: sonia.alias, ssml, output_format: "mp3" },
        expect.any(AbortSignal)
      )
    );
    expect(api.speech.preview).not.toHaveBeenCalled();
    expect(renderSsml).toHaveBeenCalledWith(
      {
        source: {
          kind: "text",
          content: {
            version: 2,
            text: "Please record the interview before the meeting starts.",
            annotations: [
              {
                type: "phoneme",
                start: 0,
                end: 6,
                alphabet: "ipa",
                phoneme: "pliːz"
              },
              {
                type: "phoneme",
                start: 7,
                end: 13,
                alphabet: "ipa",
                phoneme: "rɛkɔd"
              }
            ]
          }
        },
        setting: expect.objectContaining({
          voice_id: sonia.alias,
          rate_percent: 0,
          output_format: "mp3"
        })
      },
      expect.any(AbortSignal)
    );
  }, 15000);

  it("关联读法编译期间改字会取消请求，迟到编译结果不会触发合成", async () => {
    vi.mocked(api.speech.voices).mockResolvedValue({ items: [verifiedSonia] });
    const pending = deferred<{ ssml: string }>();
    const renderSsml = vi
      .spyOn(api.speech, "renderSsml")
      .mockImplementation(() => pending.promise);
    const manualPreview = vi
      .spyOn(api.speech, "manualPreview")
      .mockResolvedValue(result("should-not-run"));
    mount();
    fireEvent.click(await screen.findByLabelText("调节 Sonia 声音"));
    await selectTrialText("record");
    fireEvent.click(namedButton("关联单词读法"));
    fireEvent.click(await screen.findByText("确认测试关联词形"));
    fireEvent.click(namedButton("试听当前参数"));
    await waitFor(() => expect(renderSsml).toHaveBeenCalled());
    const signal = renderSsml.mock.calls[0]![1]!;
    fireEvent.change(labelledControl("本次试听文本"), {
      target: { value: "Please record again." }
    });
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ ssml: "<speak>late</speak>" }));
    expect(manualPreview).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Sonia 试听播放器")).toBeNull();
  }, 15000);

  it("加入推荐前校验参数，错误不会被弹窗遮住", async () => {
    setPermissions([
      "words.access",
      "speech.generate",
      "speech.global_dubbing"
    ]);
    mount();
    fireEvent.click(await screen.findByLabelText("调节 Sonia 声音"));
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "" }
    });
    fireEvent.click(screen.getByText("加入分组推荐"));
    expect(await screen.findByText("请输入 0.50 至 1.50 倍速")).toBeVisible();
    expect(
      screen.queryByRole("dialog", { name: "将 Sonia 加入分组推荐" })
    ).toBeNull();
  });

  it("目录访问和生成权限分别判断，无权限时不请求目录", async () => {
    setPermissions(["sentences.access"]);
    const view = mount();
    expect(await screen.findByLabelText("试听 Sonia")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("试听 Sonia"));
    expect(api.speech.preview).not.toHaveBeenCalled();
    view.unmount();
    vi.mocked(api.speech.voices).mockClear();
    setPermissions(["speech.generate"]);
    mount();
    expect(screen.getByText("无权限")).toBeVisible();
    expect(api.speech.voices).not.toHaveBeenCalled();
  });

  it("空白及超长文本不能生成，修改文本清除旧音频", async () => {
    mount();
    const button = await screen.findByLabelText("试听 Sonia");
    const text = screen.getByLabelText("共用试听文本");
    fireEvent.change(text, { target: { value: "   " } });
    expect(button).toBeDisabled();
    fireEvent.change(text, { target: { value: "a".repeat(501) } });
    expect(button).toBeDisabled();
    fireEvent.change(text, { target: { value: "Hello world." } });
    fireEvent.click(button);
    expect(await screen.findByLabelText("Sonia 试听播放器")).toHaveAttribute(
      "src",
      result("sonia").audio_url
    );
    expect(api.speech.preview).toHaveBeenCalledWith(
      {
        content: { version: 2, text: "Hello world.", annotations: [] },
        voice_alias: sonia.alias,
        rate_percent: 0,
        pitch_semitones: 0
      },
      expect.any(AbortSignal)
    );
    fireEvent.change(text, { target: { value: "Another sentence." } });
    expect(screen.queryByLabelText("Sonia 试听播放器")).toBeNull();
  });

  it("快速切换音色时取消旧请求，迟到响应不能覆盖新声音", async () => {
    const first = deferred<AdminSpeechPreviewResponse>();
    const second = deferred<AdminSpeechPreviewResponse>();
    vi.mocked(api.speech.preview)
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    mount();
    fireEvent.click(await screen.findByLabelText("试听 Sonia"));
    const signal = vi.mocked(api.speech.preview).mock.calls[0]![1]!;
    fireEvent.click(screen.getByLabelText("试听 Guy"));
    expect(signal.aborted).toBe(true);
    await act(async () => second.resolve(result("guy")));
    expect(await screen.findByLabelText("Guy 试听播放器")).toHaveAttribute(
      "src",
      result("guy").audio_url
    );
    await act(async () => first.resolve(result("old-sonia")));
    expect(screen.queryByLabelText("Sonia 试听播放器")).toBeNull();
    expect(screen.getByLabelText("Guy 试听播放器")).toHaveAttribute(
      "src",
      result("guy").audio_url
    );
  });

  it("调参按服务能力校验，原样提交百分比和半音，关闭后不留旧播放器", async () => {
    mount();
    fireEvent.click(await screen.findByLabelText("调节 Sonia 声音"));
    const drawer = await screen.findByRole("dialog");
    fireEvent.change(within(drawer).getByLabelText("合成语速"), {
      target: { value: "0.75" }
    });
    fireEvent.change(within(drawer).getByLabelText("音调"), {
      target: { value: "2" }
    });
    fireEvent.click(within(drawer).getByLabelText("试听当前参数"));
    await waitFor(() =>
      expect(api.speech.preview).toHaveBeenCalledWith(
        expect.objectContaining({ rate_percent: -25, pitch_semitones: 2 }),
        expect.any(AbortSignal)
      )
    );
    expect(
      await within(drawer).findByLabelText("Sonia 试听播放器")
    ).toBeVisible();
    fireEvent.change(within(drawer).getByLabelText("合成语速"), {
      target: { value: "" }
    });
    fireEvent.click(within(drawer).getByLabelText("试听当前参数"));
    await within(drawer).findByText("请输入 0.50 至 1.50 倍速");
    expect(api.speech.preview).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Sonia 试听播放器")).toBeNull();
  });

  it("加载失败可重试，音频加载失败有恢复提示", async () => {
    vi.mocked(api.speech.voices).mockRejectedValueOnce(new Error("offline"));
    mount();
    expect(await screen.findByText("音色列表加载失败，请重试。")).toBeVisible();
    fireEvent.click(namedButton(/重\s*试/));
    fireEvent.click(await screen.findByLabelText("试听 Sonia"));
    fireEvent.error(await screen.findByLabelText("Sonia 试听播放器"));
    expect(
      screen.getByText("音频加载失败或链接已过期，请重新生成试听。")
    ).toBeVisible();
  });

  it("生成中撤销权限会取消请求且不接纳迟到音频", async () => {
    const pending = deferred<AdminSpeechPreviewResponse>();
    vi.mocked(api.speech.preview).mockImplementationOnce(() => pending.promise);
    mount();
    fireEvent.click(await screen.findByLabelText("试听 Sonia"));
    const signal = vi.mocked(api.speech.preview).mock.calls[0]![1]!;
    act(() => setPermissions(["words.access"]));
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(result("old")));
    expect(screen.queryByLabelText("Sonia 试听播放器")).toBeNull();
    expect(screen.getByLabelText("试听 Sonia")).toBeDisabled();
  });
});
