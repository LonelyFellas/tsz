import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DialectRulesV3, WordConcreteFormV3 } from "@tsz/types";
import { PronunciationPreviewProvider } from "../../word-creation/PronunciationPreview";
import { commonFormFixture, formsFixture, ukUsFormFixture } from "../fixtures";
import { V3ConcreteFormRow } from "./V3ConcreteFormRow";

const preview = vi.hoisted(() => ({
  preference: "uk" as "uk" | "us",
  synthesize: vi.fn(),
  pause: vi.fn()
}));

vi.mock("@/features/settings/useDialectPreference", () => ({
  useDialectPreference: () => ({ preference: preview.preference })
}));
vi.mock("@/lib/env", () => ({
  env: { VOICE_PREVIEW: true, VOICE_EDITOR: false }
}));
vi.mock("../../voice-editor/dataSource", () => ({
  loadAdminVoiceRecommendations: vi.fn().mockResolvedValue([]),
  adminVoicePreviewAdapter: {
    listVoices: async () => [
      { id: "british-voice", locale: "en-GB" },
      { id: "american-voice", locale: "en-US" }
    ],
    synthesize: preview.synthesize
  },
  voicePreviewIsMock: false
}));

// 本处验证拼写行；发音列表有独立的合成输入与播放测试。
vi.mock("./V3PronunciationList", () => ({
  V3PronunciationList: () => null
}));

function Harness({
  form,
  rules
}: {
  form: WordConcreteFormV3;
  rules: DialectRulesV3;
}) {
  return (
    <App>
      <PronunciationPreviewProvider>
        <V3ConcreteFormRow
          content={formsFixture({ forms: [form], dialect_rules: rules })}
          dialectRules={rules}
          form={form}
          formLabel="原形"
          issues={[]}
          membershipCount={1}
          idFactory={() => "unused"}
          onChange={() => undefined}
        />
      </PronunciationPreviewProvider>
    </App>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  preview.preference = "uk";
  preview.synthesize.mockImplementation(async () => ({
    audioUrl: "https://audio.test/job.mp3",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    cached: false
  }));
  vi.stubGlobal(
    "Audio",
    class {
      play = async () => undefined;
      pause = preview.pause;
      addEventListener() {}
    }
  );
});

afterEach(() => vi.unstubAllGlobals());

it.each(["common", "uk_us"] as const)(
  "%s 共用拼写随全局口音切换播放和图标颜色，并丢弃旧音频",
  async (mode) => {
    const form =
      mode === "common"
        ? commonFormFixture({ spelling: "job" })
        : ukUsFormFixture({ uk: { spelling: "job" }, us: { spelling: "job" } });
    const rules: DialectRulesV3 = {
      spelling_mode: "unified",
      phonetic_mode: mode === "common" ? "unified" : "distinguish"
    };
    const view = render(<Harness form={form} rules={rules} />);
    const play = screen.getByLabelText("原形英美通用拼写 播放语音");
    await waitFor(() => expect(play).toBeEnabled());
    expect(play).toHaveAttribute("data-playback-dialect", "uk");
    fireEvent.click(play);
    await waitFor(() => expect(preview.synthesize).toHaveBeenCalledTimes(1));
    expect(preview.synthesize.mock.calls[0]![0]).toMatchObject({
      content: { text: "job" },
      voiceId: "british-voice"
    });

    preview.preference = "us";
    view.rerender(<Harness form={form} rules={rules} />);
    expect(play).toHaveAttribute("data-playback-dialect", "us");
    expect(preview.pause).toHaveBeenCalled();
    fireEvent.click(play);
    await waitFor(() => expect(preview.synthesize).toHaveBeenCalledTimes(2));
    expect(preview.synthesize.mock.calls[1]![0].voiceId).toBe("american-voice");
  }
);

it("独立英美拼写保持各自口音和图标颜色", async () => {
  preview.preference = "us";
  const view = render(
    <Harness
      form={ukUsFormFixture({
        uk: { spelling: "colour" },
        us: { spelling: "color" }
      })}
      rules={{ spelling_mode: "distinguish", phonetic_mode: "distinguish" }}
    />
  );
  for (const [label, dialect, text, voiceId] of [
    ["英式", "uk", "colour", "british-voice"],
    ["美式", "us", "color", "american-voice"]
  ]) {
    const play = screen.getByLabelText(`原形${label}拼写 播放语音`);
    await waitFor(() => expect(play).toBeEnabled());
    expect(play).toHaveAttribute("data-playback-dialect", dialect);
    fireEvent.click(play);
    await waitFor(() =>
      expect(preview.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({ text }),
          voiceId
        }),
        expect.anything()
      )
    );
  }
  view.unmount();
});
