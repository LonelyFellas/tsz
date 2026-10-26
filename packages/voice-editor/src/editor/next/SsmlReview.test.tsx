import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type {
  VoicePreviewAdapter,
  VoicePreviewResult,
  VoiceSetting
} from "../../types";
import { SsmlReview } from "./SsmlReview";

const settings: VoiceSetting[] = [
  {
    voice_id: "sonia",
    version_id: "version",
    version_name: "自然",
    locale: "en-GB",
    enabled: true,
    rate_percent: 0
  }
];
const automatic = '<speak><voice name="Sonia">cat</voice></speak>';
const content = { version: 2 as const, text: "cat", annotations: [] };
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("手动试听、复制、下载使用同一原文，恢复自动生成且不修改版本配置", async () => {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true
  });
  let downloaded: Blob | undefined;
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    downloaded = blob as Blob;
    return "blob:download";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const synthesizeSsml = vi
    .fn()
    .mockRejectedValue(new Error("provider unavailable"));
  const adapter: VoicePreviewAdapter = {
    listVoices: vi.fn(),
    synthesize: vi.fn(),
    renderSsml: vi.fn().mockResolvedValue(automatic),
    synthesizeSsml
  };
  const original = structuredClone(settings);
  render(
    <SsmlReview
      adapter={adapter}
      settings={settings}
      content={content}
      onPlay={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "查看 SSML" }));
  await waitFor(() =>
    expect(screen.getByLabelText("SSML 原文")).toHaveValue(automatic)
  );
  fireEvent.click(screen.getByLabelText("手动编辑 SSML"));
  const raw =
    ' <speak>\n<voice name="Sonia"><sub alias="kitten">cat</sub></voice>\n</speak> ';
  fireEvent.change(screen.getByLabelText("SSML 原文"), {
    target: { value: raw }
  });
  fireEvent.click(screen.getByRole("button", { name: "试听 SSML" }));
  await screen.findByText("provider unavailable");
  expect(synthesizeSsml).toHaveBeenCalledWith(
    expect.objectContaining({ ssml: raw, voiceId: "sonia" }),
    expect.anything()
  );
  expect(screen.getByLabelText("SSML 原文")).toHaveValue(raw);
  fireEvent.click(screen.getByRole("button", { name: "复制 SSML" }));
  expect(writeText).toHaveBeenCalledWith(raw);
  fireEvent.click(screen.getByRole("button", { name: "下载 SSML" }));
  const fileText = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsText(downloaded!);
  });
  expect(fileText).toBe(raw);
  fireEvent.click(screen.getByRole("button", { name: "恢复自动生成" }));
  expect(screen.getByLabelText("SSML 原文")).toHaveValue(automatic);
  expect(settings).toEqual(original);
});

it("正文变化中止手动试听并释放迟到结果", async () => {
  let resolve!: (result: VoicePreviewResult) => void;
  const synthesizeSsml = vi.fn<
    NonNullable<VoicePreviewAdapter["synthesizeSsml"]>
  >(
    () =>
      new Promise<VoicePreviewResult>((done) => {
        resolve = done;
      })
  );
  const adapter: VoicePreviewAdapter = {
    listVoices: vi.fn(),
    synthesize: vi.fn(),
    renderSsml: vi.fn().mockResolvedValue(automatic),
    synthesizeSsml
  };
  const view = render(
    <SsmlReview
      adapter={adapter}
      settings={settings}
      content={content}
      onPlay={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "查看 SSML" }));
  await waitFor(() =>
    expect(screen.getByLabelText("SSML 原文")).toHaveValue(automatic)
  );
  fireEvent.click(screen.getByRole("button", { name: "试听 SSML" }));
  const signal = synthesizeSsml.mock.calls[0]?.[1]?.signal;
  view.rerender(
    <SsmlReview
      adapter={adapter}
      settings={settings}
      content={{ ...content, text: "dog" }}
      onPlay={vi.fn()}
    />
  );
  expect(signal?.aborted).toBe(true);
  const dispose = vi.fn();
  await act(async () =>
    resolve({
      audioUrl: "blob:late",
      expiresAt: "2099-01-01",
      cached: false,
      dispose
    })
  );
  expect(dispose).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText(/审听 .*SSML/)).not.toBeInTheDocument();
});
