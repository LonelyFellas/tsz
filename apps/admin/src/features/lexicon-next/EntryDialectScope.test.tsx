import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { PhonemeLocaleV3 } from "@tsz/types";
import { App } from "@tsz/ui/admin/overlays";
import { EntryDialectContext } from "@/features/settings/useDialectPreference";
import { useAuthStore } from "@/lib/auth";
import {
  PronunciationPreviewControls,
  PronunciationPreviewProvider
} from "@/features/dictionary/word-creation/PronunciationPreview";

const preview = vi.hoisted(() => ({
  listVoices: vi.fn(),
  synthesize: vi.fn()
}));
vi.mock("@/lib/env", async (original) => {
  const actual = await original<typeof import("@/lib/env")>();
  return { ...actual, env: { ...actual.env, VOICE_PREVIEW: true } };
});
vi.mock("@/features/dictionary/voice-editor/dataSource", () => ({
  adminVoicePreviewAdapter: preview,
  voicePreviewIsMock: false
}));

const audioFactory = () =>
  ({
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn()
  }) as unknown as HTMLAudioElement;

function Harness({ locale }: { locale: PhonemeLocaleV3 | null }) {
  return (
    <App>
      <EntryDialectContext.Provider value={locale}>
        <PronunciationPreviewProvider>
          <PronunciationPreviewControls
            pronunciationId="local-pronunciation"
            spelling="tomato"
            dialect="common"
            audioFactory={audioFactory}
          />
        </PronunciationPreviewProvider>
      </EntryDialectContext.Provider>
    </App>
  );
}

function accountPreference(dialect: "uk" | "us") {
  useAuthStore.getState().setProfile({
    id: "entry-dialect-test",
    phone: "10000000000",
    display_name: "编辑",
    role: "admin",
    permission_version: 1,
    catalog_version: "test",
    permissions: [],
    preferences: { dialect }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  preview.listVoices.mockResolvedValue(
    (["en-GB", "en-US"] as const).map((locale) => ({
      id: locale,
      label: locale,
      locale,
      gender: "female",
      styles: [],
      supportsRate: true,
      supportsPitch: true,
      isDefault: false
    }))
  );
  preview.synthesize.mockResolvedValue({
    audioUrl: "https://audio.invalid/local-fixture.mp3",
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    cached: false
  });
});

it.each(["en-GB", "en-US"] as const)(
  "词条内选择 %s 时，共用试听组件忽略账号口音及其变更",
  async (locale) => {
    accountPreference(locale === "en-GB" ? "us" : "uk");
    render(<Harness locale={locale} />);
    const button = await screen.findByLabelText("获取语音");
    await waitFor(() => expect(button).toBeEnabled());
    act(() => accountPreference(locale === "en-GB" ? "uk" : "us"));
    act(() => accountPreference(locale === "en-GB" ? "us" : "uk"));
    fireEvent.click(button);
    await waitFor(() => expect(preview.synthesize).toHaveBeenCalledOnce());
    expect(preview.synthesize.mock.calls[0]![0].voiceId).toBe(locale);
  }
);

it("同一词条内切换方言后，通用内容的试听随词条选择更新", async () => {
  accountPreference("uk");
  const view = render(<Harness locale="en-GB" />);
  const button = await screen.findByLabelText("获取语音");
  await waitFor(() => expect(button).toBeEnabled());
  view.rerender(<Harness locale="en-US" />);
  fireEvent.click(screen.getByLabelText("获取语音"));
  await waitFor(() => expect(preview.synthesize).toHaveBeenCalledOnce());
  expect(preview.synthesize.mock.calls[0]![0].voiceId).toBe("en-US");
  expect(useAuthStore.getState().profile?.preferences.dialect).toBe("uk");
});

it("旧编辑器没有词条口音上下文时仍沿用原来的账号偏好", async () => {
  accountPreference("us");
  render(<Harness locale={null} />);
  const button = await screen.findByLabelText("获取语音");
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(preview.synthesize).toHaveBeenCalledOnce());
  expect(preview.synthesize.mock.calls[0]![0].voiceId).toBe("en-US");
});
