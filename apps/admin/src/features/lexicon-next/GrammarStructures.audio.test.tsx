import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { NextGrammarStructure } from "@tsz/types";
import { App } from "@tsz/ui/admin/overlays";
import type { VoicePreviewAdapter } from "@tsz/voice-editor";
import { GrammarStructures } from "./GrammarStructures";

const speech = vi.hoisted(() => ({
  generate: vi.fn(),
  preview: vi.fn(),
  resolve: vi.fn()
}));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  usePermission: () => true
}));
vi.mock("@/features/dictionary/voice-editor/dataSource", () => {
  const adapter = {
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
    resolveVoices: speech.resolve,
    generateAudio: speech.generate,
    synthesize: speech.preview
  };
  return {
    adminVoicePreviewAdapter: adapter,
    adminGrammarVoicePreviewAdapter: adapter,
    adminAudioUploadAdapter: {},
    loadAdminVoiceRecommendations: async () => [],
    voicePreviewIsMock: false
  };
});

const initial: NextGrammarStructure[] = [
  {
    id: "grammar",
    part_of_speech: "noun",
    variants: [
      {
        id: "uk",
        locale: "en-GB",
        content: { version: 2, text: "", annotations: [] },
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
      }
    ]
  }
];
const asset = {
  id: "final-hha",
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
  speech.resolve.mockReset();
  speech.resolve.mockImplementation(async ({ profile }) => ({
    voices: profile.voices.length
      ? profile.voices
      : initial[0]!.variants[0]!.voice_profile!.voices,
    source: { kind: "local" }
  }));
});
function setup(input = initial) {
  const changed = vi.fn();
  function Draft() {
    const [rows, setRows] = useState(input);
    return (
      <>
        <GrammarStructures
          rows={rows}
          pos="noun"
          target="en-GB"
          disabled={false}
          audioAvailable
          referenceCount={() => 0}
          onChange={(update) => {
            setRows(update);
            changed();
          }}
        />
        <output aria-label="父草稿">{JSON.stringify(rows)}</output>
      </>
    );
  }
  render(
    <App>
      <Draft />
    </App>
  );
  return changed;
}
async function openEditor() {
  fireEvent.click(
    screen.getByRole("button", { name: "编辑语法结构 1 英式英语内容" })
  );
  const editor = await screen.findByRole("textbox", {
    name: "语法结构 1 英式英语内容"
  });
  await waitFor(() =>
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: "完成" })
    ).toBeEnabled()
  );
  return editor;
}

it("输入时保留继承音色，点击完成才解析最新正文并生成正式音频", async () => {
  const input = structuredClone(initial);
  delete input[0]!.variants[0]!.voice_profile;
  speech.generate.mockResolvedValue(asset);
  const changed = setup(input);
  const editor = await openEditor();
  const pool = screen.getByRole("region", { name: "英式已获取音色" });
  await within(pool).findByText("Sonia");
  speech.resolve.mockClear();

  for (const text of ["use", "use (it)", "use (it) carefully"]) {
    fireEvent.change(editor, { target: { value: text } });
    expect(within(pool).getByText("Sonia")).toBeVisible();
  }
  expect(speech.resolve).not.toHaveBeenCalled();
  expect(speech.generate).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "完成" }));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(speech.resolve).toHaveBeenCalledOnce();
  expect(speech.resolve).toHaveBeenCalledWith(
    expect.objectContaining({
      accent: "gb",
      content: expect.objectContaining({ text: "use (it) carefully" })
    }),
    expect.anything()
  );
  expect(speech.generate).toHaveBeenCalledOnce();
  expect(speech.resolve.mock.invocationCallOrder[0]).toBeLessThan(
    speech.generate.mock.invocationCallOrder[0]!
  );
  expect(speech.generate.mock.calls[0]![0]).toMatchObject({
    content: { text: "use (it) carefully" },
    setting: { voice_id: "sonia" }
  });
});

it("删除导致配音解析失败的停顿后，按最新正文重试且不自动生成音频", async () => {
  const input = structuredClone(initial);
  const variant = input[0]!.variants[0]!;
  variant.content = {
    version: 2,
    text: "a job and work",
    annotations: [{ type: "pause", at: 5, duration_ms: 500 }]
  };
  variant.voice_profile!.dubbing = {
    area: "grammar",
    uk: { mode: "local" },
    us: { mode: "inherit" }
  };
  const resolve = speech.resolve.getMockImplementation()!;
  speech.resolve.mockImplementation(
    async (
      request: Parameters<NonNullable<VoicePreviewAdapter["resolveVoices"]>>[0]
    ) => {
      if (request.content.annotations.some(({ type }) => type === "pause"))
        throw new Error("此音色不支持停顿");
      return resolve(request);
    }
  );
  const changed = setup(input);
  const editor = await openEditor();
  const error = await screen.findByText("此音色不支持停顿");

  fireEvent.click(screen.getByRole("button", { name: "清除模式" }));
  fireEvent.click(screen.getByLabelText("清除第 2 处停顿 0.5 秒"));
  fireEvent.click(screen.getByRole("button", { name: "清除模式" }));
  fireEvent.change(editor, { target: { value: "a job and some work" } });
  fireEvent.change(editor, { target: { value: "a job and some hard work" } });

  await waitFor(() => expect(error).not.toBeInTheDocument());
  expect(speech.resolve).toHaveBeenCalledTimes(2);
  expect(speech.resolve).toHaveBeenLastCalledWith(
    expect.objectContaining({
      content: { version: 2, text: "a job and some hard work", annotations: [] }
    }),
    expect.anything()
  );
  expect(speech.generate).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
});

it("最新正文配音解析失败时保留输入，不生成音频或应用草稿", async () => {
  const input = structuredClone(initial);
  delete input[0]!.variants[0]!.voice_profile;
  const changed = setup(input);
  const editor = await openEditor();
  await within(
    screen.getByRole("region", { name: "英式已获取音色" })
  ).findByText("Sonia");
  speech.resolve.mockRejectedValueOnce(new Error("当前正文的配音设置不可用"));
  fireEvent.change(editor, { target: { value: "new grammar text" } });
  const complete = screen.getByRole("button", { name: "完成" });
  fireEvent.click(complete);
  await screen.findByText("当前正文的配音设置不可用");
  expect(editor).toHaveValue("new grammar text");
  expect(complete).toBeEnabled();
  expect(speech.generate).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
});

it("编辑和取消不生成语音，点击完成才生成最新正文并应用到父草稿", async () => {
  let finish!: (value: typeof asset) => void;
  speech.generate.mockImplementation(
    () => new Promise((resolve) => (finish = resolve))
  );
  const changed = setup();
  let editor = await openEditor();
  for (const text of ["h", "hh", "hha"]) {
    fireEvent.change(editor, { target: { value: text } });
    await act(async () => {});
  }
  expect(speech.generate).not.toHaveBeenCalled();
  expect(speech.preview).not.toHaveBeenCalled();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "取消" })
  );
  expect(changed).not.toHaveBeenCalled();
  editor = await openEditor();
  expect(editor).toHaveValue("");
  fireEvent.change(editor, { target: { value: "hha" } });
  const complete = within(screen.getByRole("dialog")).getByRole("button", {
    name: "完成"
  });
  fireEvent.click(complete);
  fireEvent.click(complete);
  await waitFor(() => expect(speech.generate).toHaveBeenCalledOnce());
  expect(speech.generate.mock.calls[0]![0].content.text).toBe("hha");
  expect(complete).toBeDisabled();
  expect(
    within(screen.getByRole("dialog")).getByRole("button", { name: "取消" })
  ).toBeDisabled();
  expect(changed).not.toHaveBeenCalled();
  await act(async () => finish(asset));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
  const applied = JSON.parse(screen.getByLabelText("父草稿").textContent!)[0]
    .variants[0];
  expect(applied.content.text).toBe("hha");
  expect(applied.voice_profile.voices[0].audio_asset_id).toBe("final-hha");
  expect(changed).toHaveBeenCalledOnce();
  await openEditor();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "完成" })
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
  expect(speech.generate).toHaveBeenCalledOnce();
});

it.each([93, 87])(
  "superior to 从旧音频生成音量 %i 的新版，正文仍带括号",
  async (volume) => {
    const input = structuredClone(initial);
    const variant = input[0]!.variants[0]!;
    variant.content.text = "(be) superior to…";
    Object.assign(variant.voice_profile!.voices[0]!, {
      rate_percent: -5,
      volume_percent: 93,
      audio_asset_id: "old-sonia"
    });
    speech.generate.mockResolvedValue(asset);
    const changed = setup(input);
    const editor = await openEditor();
    expect(editor).toHaveValue("(be) superior to…");
    expect(speech.generate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "修改 Sonia" }));
    const volumeInput = await screen.findByLabelText("当前音色音量");
    if (volume !== 93)
      fireEvent.change(volumeInput, { target: { value: String(volume) } });
    const regenerate = await screen.findByRole("button", {
      name: volume === 93 ? "重新生成音频" : "生成正式音频"
    });
    fireEvent.click(regenerate);
    await waitFor(() => expect(speech.generate).toHaveBeenCalledOnce());
    expect(speech.generate.mock.calls[0]![0]).toMatchObject({
      content: { text: "(be) superior to…" },
      setting: { rate_percent: -5, volume_percent: volume }
    });
    expect(speech.generate.mock.calls[0]![0].setting.audio_asset_id).toBe(
      volume === 93 ? "old-sonia" : undefined
    );
    const save = screen.getByRole("button", { name: "保存配音设置" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "完成" }));
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    const applied = JSON.parse(screen.getByLabelText("父草稿").textContent!)[0]
      .variants[0];
    expect(applied.content.text).toBe("(be) superior to…");
    expect(applied.voice_profile.voices[0].audio_asset_id).toBe(asset.id);
    expect(speech.generate).toHaveBeenCalledOnce();
  }
);

it("完成时生成失败保留弹窗与正文，再次完成重试并复用请求身份", async () => {
  speech.generate
    .mockRejectedValueOnce(new Error("Azure unavailable"))
    .mockResolvedValueOnce(asset);
  const changed = setup();
  const editor = await openEditor();
  fireEvent.change(editor, { target: { value: "hha" } });
  expect(speech.generate).not.toHaveBeenCalled();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "完成" })
  );
  await screen.findByText("Azure unavailable");
  expect(editor).toHaveValue("hha");
  expect(changed).not.toHaveBeenCalled();
  const request = speech.generate.mock.calls[0]![0].requestId;
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "完成" })
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
  expect(speech.generate.mock.calls[1]![0].requestId).toBe(request);
  expect(changed).toHaveBeenCalledOnce();
});
