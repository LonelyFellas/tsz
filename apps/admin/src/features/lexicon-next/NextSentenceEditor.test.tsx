import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { NextSentence } from "@tsz/types";
import { App } from "@tsz/ui/admin/overlays";
import { NextSentenceEditor } from "./NextSentenceEditor";
import type { LexiconNextRequests } from "@/pages/LexiconNext";

const speech = vi.hoisted(() => ({ generate: vi.fn(), preview: vi.fn() }));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  usePermission: () => true
}));
vi.mock("@/features/dictionary/voice-editor/dataSource", () => ({
  adminVoicePreviewAdapter: {
    listVoices: async () => [
      {
        id: "sonia",
        label: "Sonia",
        locale: "en-GB",
        gender: "female",
        styles: [],
        supportsRate: true,
        supportsPitch: true,
        isDefault: true
      }
    ],
    generateAudio: speech.generate,
    synthesize: speech.preview
  },
  adminAudioUploadAdapter: {},
  loadAdminVoiceRecommendations: async () => [],
  voicePreviewIsMock: false
}));

const source: NextSentence = {
  id: "sentence",
  target_language: "en",
  owner_id: "owner",
  revision: 3,
  updated_at: "2026-11-15T00:00:00Z",
  reference_count: 0,
  draft: {
    schema_version: 1,
    variants: [
      {
        id: "variant-uk",
        locale: "en-GB",
        level: "A2",
        content: { version: 2, text: "", annotations: [] },
        translations: [
          {
            id: "traditional",
            locale: "zh-Hant",
            style: "balanced_fluency",
            content: { version: 2, text: "保留繁體", annotations: [] }
          }
        ],
        voice_profile: {
          voices: [
            {
              voice_id: "sonia",
              version_id: "sonia-version",
              version_name: "Sonia",
              locale: "en-GB",
              enabled: true,
              rate_percent: 0
            }
          ]
        }
      },
      {
        id: "variant-us",
        locale: "en-US",
        level: "B1",
        content: { version: 2, text: "Keep American", annotations: [] },
        translations: []
      }
    ]
  }
};
const asset = {
  id: "generated-uk",
  locale: "en-GB",
  gender: "female",
  content_type: "audio/mpeg",
  size_bytes: 128,
  original_name: "generated.mp3",
  created_at: "2026-11-15T00:00:00Z"
};
beforeEach(() => {
  speech.generate.mockReset();
  speech.preview.mockReset();
});
function setup(detailsAvailable = false, input = source) {
  const saveSentence = vi.fn().mockResolvedValue(source);
  const sentence = vi.fn();
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App>
        <NextSentenceEditor
          source={input}
          detailsAvailable={detailsAvailable}
          target="en-GB"
          medium="zh-Hans"
          requests={
            {
              saveSentence,
              sentence,
              equivalentCatalog: async () => ({ registers: [], domains: [] })
            } as unknown as LexiconNextRequests
          }
          onSaved={onSaved}
          onClose={onClose}
        />
      </App>
    </QueryClientProvider>
  );
  return { saveSentence, sentence, onSaved, onClose };
}
it("编辑不请求 Azure，完成才生成当前目标语言并保存当前媒介范围", async () => {
  let finish!: (value: typeof asset) => void;
  speech.generate.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const { saveSentence, onSaved } = setup();
  expect(
    screen.getByText("保存将同步更新引用此例句的所有义项。")
  ).toBeVisible();
  const editor = await screen.findByRole("textbox", { name: "英式英语例句" });
  for (const text of ["h", "hh", "hha"]) {
    fireEvent.change(editor, { target: { value: text } });
    await act(async () => {});
  }
  expect(speech.generate).not.toHaveBeenCalled();
  expect(speech.preview).not.toHaveBeenCalled();
  const complete = screen.getByRole("button", { name: "完成" });
  await waitFor(() => expect(complete).toBeEnabled());
  fireEvent.click(complete);
  fireEvent.click(complete);
  await waitFor(() => expect(speech.generate).toHaveBeenCalledOnce());
  expect(speech.generate.mock.calls[0]![0].content.text).toBe("hha");
  expect(speech.generate.mock.calls[0]![0].setting.locale).toBe("en-GB");
  expect(complete).toBeDisabled();
  expect(saveSentence).not.toHaveBeenCalled();
  await act(async () => finish(asset));
  await waitFor(() => expect(saveSentence).toHaveBeenCalledOnce());
  expect(saveSentence.mock.calls[0]).toEqual([
    "sentence",
    expect.objectContaining({
      expected_revision: 3,
      target_locale: "en-GB",
      medium_locale: "zh-Hans",
      variant: expect.objectContaining({
        id: "variant-uk",
        locale: "en-GB",
        translations: [],
        content: expect.objectContaining({ text: "hha" })
      })
    })
  ]);
  expect(onSaved).toHaveBeenCalledWith(source);
});
it("取消不生成或保存；失败保留输入供重试", async () => {
  speech.generate.mockRejectedValue(new Error("Azure failed"));
  const { saveSentence, onClose } = setup();
  const editor = await screen.findByRole("textbox", { name: "英式英语例句" });
  fireEvent.change(editor, { target: { value: "Keep my input" } });
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(speech.generate).not.toHaveBeenCalled();
  expect(saveSentence).not.toHaveBeenCalled();
  const complete = screen.getByRole("button", { name: "完成" });
  await waitFor(() => expect(complete).toBeEnabled());
  fireEvent.click(complete);
  await screen.findByText("配音生成未完成，请重试或取消对应音色后完成。");
  expect(editor).toHaveValue("Keep my input");
  expect(saveSentence).not.toHaveBeenCalled();
});

it("保存冲突保留输入，显式重新加载后按最新 revision 保存", async () => {
  speech.generate.mockResolvedValue(asset);
  const { saveSentence, sentence } = setup();
  saveSentence.mockRejectedValueOnce(new Error("例句已更新"));
  const editor = await screen.findByRole("textbox", { name: "英式英语例句" });
  fireEvent.change(editor, { target: { value: "Local edit" } });
  const complete = screen.getByRole("button", { name: "完成" });
  await waitFor(() => expect(complete).toBeEnabled());
  fireEvent.click(complete);
  await screen.findByText("例句已更新");
  expect(editor).toHaveValue("Local edit");
  const fresh = structuredClone(source);
  fresh.revision = 4;
  fresh.draft.variants[0]!.content.text = "Server latest";
  fresh.draft.variants[0]!.voice_profile = { voices: [] };
  sentence.mockResolvedValue(fresh);
  fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
  const confirm = screen.getAllByRole("dialog").at(-1)!;
  fireEvent.click(within(confirm).getByRole("button", { name: "重新加载" }));
  await waitFor(() => expect(editor).toHaveValue("Server latest"));
  fireEvent.click(complete);
  await waitFor(() => expect(saveSentence).toHaveBeenCalledTimes(2));
  expect(saveSentence.mock.calls[1]![1].expected_revision).toBe(4);
});

it("人工自由度及原文和译文来源一起保存，非法精度阻止生成和写入", async () => {
  const input = structuredClone(source);
  input.draft.variants[0]!.content.text = "A useful example.";
  input.draft.variants[0]!.translations.push({
    id: "simplified",
    locale: "zh-Hans",
    style: "balanced_fluency",
    content: { version: 2, text: "一个例句。", annotations: [] }
  });
  speech.generate.mockResolvedValue(asset);
  const { saveSentence } = setup(true, input);
  const freedom = await screen.findByRole("spinbutton", {
    name: "译文 1 自由度"
  });
  fireEvent.change(freedom, { target: { value: "33.33" } });
  const complete = screen.getByRole("button", { name: "完成" });
  await waitFor(() => expect(complete).toBeEnabled());
  fireEvent.click(complete);
  await screen.findByText("翻译自由度须为 0–100%，最多一位小数");
  expect(speech.generate).not.toHaveBeenCalled();
  expect(saveSentence).not.toHaveBeenCalled();
  expect(screen.getByText("一个例句。")).toBeVisible();
  fireEvent.change(freedom, { target: { value: "66.7" } });
  fireEvent.click(screen.getByRole("button", { name: "添加原文来源" }));
  fireEvent.change(screen.getByRole("textbox", { name: "原文来源 1 名称" }), {
    target: { value: "人工原句" }
  });
  fireEvent.click(screen.getByRole("button", { name: "添加译文 1 来源" }));
  fireEvent.change(
    screen.getByRole("textbox", { name: "译文 1 来源 1 名称" }),
    { target: { value: "人工翻译" } }
  );
  fireEvent.click(complete);
  await waitFor(() => expect(saveSentence).toHaveBeenCalledOnce());
  const variant = saveSentence.mock.calls[0]![1].variant;
  expect(variant.metadata.sources).toEqual([
    expect.objectContaining({
      title: "人工原句",
      source_type: "human_composed"
    })
  ]);
  expect(variant.translations).toEqual([
    expect.objectContaining({
      id: "simplified",
      style: "adapted_creation",
      metadata: {
        freedom: 66.7,
        sources: [expect.objectContaining({ title: "人工翻译" })]
      }
    })
  ]);
});
