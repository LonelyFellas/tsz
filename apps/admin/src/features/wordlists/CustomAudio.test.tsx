import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import type { InterfaceLocale } from "@tsz/shared/i18n";
import type { WordlistCustomAudio } from "@tsz/types";
import { CustomAudio } from "./CustomAudio";
const mock = vi.hoisted(() => ({ url: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  api: { wordlists: { reviewCustomAudioUrl: mock.url } }
}));
it("四语切换不取消签名请求、不重建播放器或改变音频 locale，失败提示随当前语言显示", async () => {
  let finish!: (value: { url: string }) => void;
  mock.url.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const player = {
    pause: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    onerror: null as null | (() => void)
  };
  const audioConstructor = vi.fn(function () {
    return player;
  });
  vi.stubGlobal("Audio", audioConstructor);
  try {
    const audio = {
      item_id: "original-item",
      job_id: "original-job",
      status: "ready",
      locales: ["en-GB", "en-US"]
    } as WordlistCustomAudio;
    const content = (locale: InterfaceLocale) => (
      <InterfaceI18nProvider locale={locale}>
        <CustomAudio
          listId="original-list"
          requestId="original-review"
          audio={audio}
        />
      </InterfaceI18nProvider>
    );
    const view = render(content("zh-Hans"));
    const button = screen.getByRole("button", { name: "播放英式语音" });
    fireEvent.click(button);
    const signal = mock.url.mock.calls[0]![4].signal as AbortSignal;
    view.rerender(content("en-GB"));
    expect(screen.getByRole("button", { name: "Play British audio" })).toBe(
      button
    );
    expect(button).toBeDisabled();
    expect(signal.aborted).toBe(false);
    expect(mock.url).toHaveBeenCalledWith(
      "original-list",
      "original-review",
      "original-item",
      "en-GB",
      { signal }
    );
    await act(async () =>
      finish({ url: "https://example.invalid/test-only-audio" })
    );
    for (const locale of ["zh-Hant", "en-US", "zh-Hans"] as const)
      view.rerender(content(locale));
    expect(audioConstructor).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.pause).not.toHaveBeenCalled();
    expect(mock.url).toHaveBeenCalledTimes(1);
    act(() => player.onerror?.());
    expect(screen.getByRole("alert")).toHaveTextContent("播放失败，请重试");
    view.rerender(content("en-US"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Playback failed. Try again."
    );
    view.unmount();
    expect(player.pause).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
