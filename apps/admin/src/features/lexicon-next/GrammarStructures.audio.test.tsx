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
import { GrammarStructures } from "./GrammarStructures";

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
});
function setup() {
  const changed = vi.fn();
  function Draft() {
    const [rows, setRows] = useState(initial);
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
