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
import type { NextDefinition } from "@tsz/types";
import { App } from "@tsz/ui/admin/overlays";
import { PronunciationPreviewProvider } from "@/features/dictionary/word-creation/PronunciationPreview";
import { DefinitionText } from "./DefinitionText";

const speech = vi.hoisted(() => ({
  generate: vi.fn(),
  preview: vi.fn(),
  canGenerate: true
}));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  usePermission: (permission: string) =>
    permission !== "speech.generate" || speech.canGenerate
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

const initial: NextDefinition = {
  id: "uk",
  locale: "en-GB",
  text: "",
  style: "definition",
  level: "B1",
  grammar_unbound: true,
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
};
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
  speech.canGenerate = true;
  speech.generate.mockReset();
  speech.preview.mockReset();
});
function setup(disabled = false) {
  const changed = vi.fn();
  let leaveGuard: (() => Promise<boolean>) | undefined;
  const registerLeaveGuard = (guard?: () => Promise<boolean>) => {
    leaveGuard = guard;
  };
  function Draft() {
    const [row, setRow] = useState(initial);
    return (
      <>
        <DefinitionText
          definition={row}
          label="英文释义 1"
          disabled={disabled}
          registerLeaveGuard={registerLeaveGuard}
          onChange={(next) => {
            setRow(next);
            changed(next);
          }}
        />
        <output aria-label="父草稿">{JSON.stringify(row)}</output>
      </>
    );
  }
  render(
    <App>
      <PronunciationPreviewProvider>
        <Draft />
      </PronunciationPreviewProvider>
    </App>
  );
  return { changed, leave: () => leaveGuard?.() };
}
async function openEditor() {
  fireEvent.click(screen.getByRole("button", { name: "编辑英文释义 1" }));
  const editor = await screen.findByRole("textbox", {
    name: "英文释义 1"
  });
  await waitFor(() =>
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "应用正文与配音"
      })
    ).toBeEnabled()
  );
  return editor;
}

it("编辑和取消不生成语音，点击完成才生成最新正文并应用到父草稿", async () => {
  let finish!: (value: typeof asset) => void;
  speech.generate.mockImplementation(
    () => new Promise((resolve) => (finish = resolve))
  );
  const { changed, leave } = setup();
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
    name: "应用正文与配音"
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
  expect(await leave()).toBe(false);
  await act(async () => finish(asset));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
  const applied = JSON.parse(screen.getByLabelText("父草稿").textContent!);
  expect(applied.content.text).toBe("hha");
  expect(applied.voice_profile.voices[0].audio_asset_id).toBe("final-hha");
  expect(changed).toHaveBeenCalledOnce();
  await openEditor();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "应用正文与配音"
    })
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
  const { changed } = setup();
  const editor = await openEditor();
  fireEvent.change(editor, { target: { value: "hha" } });
  expect(speech.generate).not.toHaveBeenCalled();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "应用正文与配音"
    })
  );
  await screen.findByText("Azure unavailable");
  expect(editor).toHaveValue("hha");
  expect(changed).not.toHaveBeenCalled();
  const request = speech.generate.mock.calls[0]![0].requestId;
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "应用正文与配音"
    })
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
  expect(speech.generate.mock.calls[1]![0].requestId).toBe(request);
  expect(changed).toHaveBeenCalledOnce();
});

it("只读不能打开释义编辑或修改宿主草稿", async () => {
  const readonly = setup(true);
  expect(screen.getByRole("button", { name: "编辑英文释义 1" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "编辑英文释义 1" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(readonly.changed).not.toHaveBeenCalled();
});
it("未应用的局部草稿阻止离开，继续编辑保留输入，明确放弃才关闭", async () => {
  const { changed, leave } = setup();
  const editor = await openEditor();
  fireEvent.change(editor, { target: { value: "new body" } });
  let decision!: Promise<boolean>;
  act(() => {
    decision = leave()!;
  });
  const confirm = await screen.findByText("放弃释义修改？");
  const dialog = within(confirm.closest('[role="dialog"]') as HTMLElement);
  fireEvent.click(dialog.getByRole("button", { name: "继续编辑" }));
  expect(await decision).toBe(false);
  expect(editor).toHaveValue("new body");
  act(() => {
    decision = leave()!;
  });
  fireEvent.click(
    within(
      (await screen.findByText("放弃释义修改？")).closest(
        '[role="dialog"]'
      ) as HTMLElement
    ).getByRole("button", { name: "放弃修改" })
  );
  expect(await decision).toBe(true);
  expect(changed).not.toHaveBeenCalled();
  expect(speech.generate).not.toHaveBeenCalled();
});
it("没有合成权限时保留正文和配音设置，不生成正式音频", async () => {
  speech.canGenerate = false;
  const { changed } = setup();
  const editor = await openEditor();
  fireEvent.change(editor, { target: { value: "text only" } });
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "应用正文与配音"
    })
  );
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(changed.mock.calls[0]![0]).toMatchObject({
    text: "text only",
    content: { text: "text only" },
    level: "B1",
    grammar_unbound: true
  });
  expect(speech.generate).not.toHaveBeenCalled();
});
