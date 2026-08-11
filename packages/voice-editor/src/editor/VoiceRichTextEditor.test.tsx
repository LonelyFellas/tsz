import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RichTextV1 } from "@tsz/types";
import type {
  VoiceOption,
  VoicePreviewAdapter,
  VoicePreviewResult
} from "../types";
import { VoiceRichTextEditor } from "./VoiceRichTextEditor";

const VALUE: RichTextV1 = {
  version: 1,
  text: "hello world",
  spans: [],
  liaisons: []
};

const VOICES: VoiceOption[] = [
  {
    id: "sonia",
    label: "Sonia · 英式女声",
    locale: "en-GB",
    gender: "female",
    styles: ["cheerful"],
    supportsRate: true,
    supportsPitch: true,
    isDefault: true
  },
  {
    id: "aria",
    label: "Aria · 美式女声",
    locale: "en-US",
    gender: "female",
    styles: ["cheerful"],
    supportsRate: true,
    supportsPitch: true,
    isDefault: false
  },
  {
    id: "guy",
    label: "Guy · 美式男声",
    locale: "en-US",
    gender: "male",
    styles: [],
    supportsRate: false,
    supportsPitch: false,
    isDefault: false
  }
];

class AudioMock {
  static instances: AudioMock[] = [];
  static rejectedPlays = 0;
  readonly play = vi.fn(() =>
    AudioMock.rejectedPlays-- > 0
      ? Promise.reject(new Error("autoplay blocked"))
      : Promise.resolve()
  );
  readonly pause = vi.fn();

  constructor(public readonly src: string) {
    AudioMock.instances.push(this);
  }
}

function result(
  overrides: Partial<VoicePreviewResult> = {}
): VoicePreviewResult {
  return {
    audioUrl: "blob:preview",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    cached: false,
    ssml: "<speak/>",
    ...overrides
  };
}

function adapter(
  synthesize: VoicePreviewAdapter["synthesize"] = vi
    .fn()
    .mockResolvedValue(result())
): VoicePreviewAdapter {
  return {
    listVoices: vi.fn().mockResolvedValue(VOICES),
    synthesize
  };
}

function editorProps(
  overrides: Partial<Parameters<typeof VoiceRichTextEditor>[0]> = {}
) {
  return {
    open: true,
    value: VALUE,
    onApply: vi.fn(),
    onCancel: vi.fn(),
    ...overrides
  };
}

function actionButton(
  label: string,
  root: ParentNode = document
): HTMLButtonElement {
  const button = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) =>
      candidate.getAttribute("aria-label") === label ||
      candidate.textContent?.replaceAll(/\s/g, "") ===
        label.replaceAll(/\s/g, "")
  );
  if (!button) throw new Error(`button not found: ${label}`);
  return button;
}

async function selectOption(label: string, optionText: string) {
  fireEvent.mouseDown(screen.getByLabelText(label));
  const options = await screen.findAllByText(optionText, { exact: true });
  const option = options.find((candidate) =>
    candidate.closest(".ant-select-item-option")
  );
  if (!option) throw new Error(`option not found: ${optionText}`);
  fireEvent.click(option);
}

beforeEach(() => {
  AudioMock.instances = [];
  AudioMock.rejectedPlays = 0;
  vi.stubGlobal("Audio", AudioMock);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.spyOn(window, "print").mockImplementation(() => undefined);
});

afterEach(() => {
  document.body.classList.remove("tsz-ve-printing");
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("VoiceRichTextEditor", () => {
  it("degrades without TTS, applies a legal V2 value, and closes without dirty confirmation", () => {
    const props = editorProps();
    render(<VoiceRichTextEditor {...props} />);

    expect(screen.getByText("TTS 后端未启用，仍可编辑和导出")).toBeVisible();
    expect(actionButton("生成试听")).toBeDisabled();
    expect(screen.getByRole("button", { name: "加重音" })).toBeDisabled();
    fireEvent.click(actionButton("应用"));
    expect(props.onApply).toHaveBeenCalledWith({
      version: 2,
      text: "hello world",
      annotations: []
    });

    fireEvent.click(actionButton("取消"));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(props.onCancel).toHaveBeenCalledOnce();
  });

  it("tracks dirty pause insertion and guards cancellation", async () => {
    const onDirtyChange = vi.fn();
    const onCancel = vi.fn();
    vi.mocked(window.confirm)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    render(
      <VoiceRichTextEditor {...editorProps({ onDirtyChange, onCancel })} />
    );

    fireEvent.click(actionButton("插入停顿"));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    expect(document.querySelector(".ProseMirror .tsz-ve-pause")).not.toBeNull();

    fireEvent.click(actionButton("取消"));
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(actionButton("取消"));
    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledOnce();
      expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    });
  });

  it("loads capabilities, synthesizes once, autoplays, replays, marks stale, and disposes", async () => {
    let resolvePreview: ((value: VoicePreviewResult) => void) | undefined;
    const pending = new Promise<VoicePreviewResult>((resolve) => {
      resolvePreview = resolve;
    });
    const synthesize = vi.fn().mockReturnValue(pending);
    const previewAdapter = adapter(synthesize);
    const dispose = vi.fn();
    const props = editorProps({ previewAdapter });
    const view = render(<VoiceRichTextEditor {...props} />);

    await waitFor(() => expect(actionButton("生成试听")).toBeEnabled());
    expect(screen.getByLabelText("说话风格")).toBeEnabled();
    expect(screen.getByLabelText("整体语速")).toBeEnabled();
    expect(screen.getByLabelText("整体音高")).toBeEnabled();
    const generateButton = actionButton("生成试听");
    fireEvent.click(generateButton);
    fireEvent.click(generateButton);
    expect(synthesize).toHaveBeenCalledOnce();
    resolvePreview?.(result({ cached: true, dispose }));

    await waitFor(() =>
      expect(screen.getByText("播放中（缓存命中）")).toBeVisible()
    );
    expect(AudioMock.instances[0]!.play).toHaveBeenCalledOnce();
    fireEvent.click(actionButton("重播"));
    expect(AudioMock.instances[1]!.play).toHaveBeenCalledOnce();

    fireEvent.click(actionButton("插入停顿"));
    await waitFor(() =>
      expect(
        screen.getByText("内容或语音参数已变化，请重新生成试听")
      ).toBeVisible()
    );
    expect(actionButton("重播")).toBeDisabled();

    view.rerender(<VoiceRichTextEditor {...props} open={false} />);
    expect(AudioMock.instances.at(-1)!.pause).toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("shows adapter failures, aborts a pending request, and disables expired replay", async () => {
    const failureAdapter = adapter(
      vi.fn().mockRejectedValue(new Error("TTS down"))
    );
    const view = render(
      <VoiceRichTextEditor
        {...editorProps({ previewAdapter: failureAdapter })}
      />
    );
    await waitFor(() => expect(actionButton("生成试听")).toBeEnabled());
    fireEvent.click(actionButton("生成试听"));
    await waitFor(() => expect(screen.getByText("TTS down")).toBeVisible());

    const abortObserved = vi.fn();
    const lateDispose = vi.fn();
    let resolvePending: ((value: VoicePreviewResult) => void) | undefined;
    const pendingAdapter = adapter(
      vi.fn((_input, options) => {
        options?.signal?.addEventListener("abort", abortObserved);
        return new Promise<VoicePreviewResult>((resolve) => {
          resolvePending = resolve;
        });
      })
    );
    view.rerender(
      <VoiceRichTextEditor
        {...editorProps({ previewAdapter: pendingAdapter })}
      />
    );
    await waitFor(() => expect(actionButton("生成试听")).toBeEnabled());
    fireEvent.click(actionButton("生成试听"));
    view.rerender(
      <VoiceRichTextEditor
        {...editorProps({ previewAdapter: pendingAdapter })}
        open={false}
      />
    );
    expect(abortObserved).toHaveBeenCalledOnce();
    resolvePending?.(result({ dispose: lateDispose }));
    await waitFor(() => expect(lateDispose).toHaveBeenCalledOnce());

    const expiredAdapter = adapter(
      vi
        .fn()
        .mockResolvedValue(
          result({ expiresAt: new Date(Date.now() - 1000).toISOString() })
        )
    );
    view.rerender(
      <VoiceRichTextEditor
        {...editorProps({ previewAdapter: expiredAdapter })}
      />
    );
    await waitFor(() => expect(actionButton("生成试听")).toBeEnabled());
    fireEvent.click(actionButton("生成试听"));
    await waitFor(() =>
      expect(screen.getByText("试听已过期，请重新生成")).toBeVisible()
    );
    expect(actionButton("重播")).toBeDisabled();
  });

  it("aborts and ignores an in-flight preview when content changes", async () => {
    const abortObserved = vi.fn();
    const lateDispose = vi.fn();
    let resolvePending: ((value: VoicePreviewResult) => void) | undefined;
    const pendingAdapter = adapter(
      vi.fn((_input, options) => {
        options?.signal?.addEventListener("abort", abortObserved);
        return new Promise<VoicePreviewResult>((resolve) => {
          resolvePending = resolve;
        });
      })
    );
    render(
      <VoiceRichTextEditor
        {...editorProps({ previewAdapter: pendingAdapter })}
      />
    );

    await waitFor(() => expect(actionButton("生成试听")).toBeEnabled());
    fireEvent.click(actionButton("生成试听"));
    fireEvent.click(actionButton("插入停顿"));

    await waitFor(() => expect(abortObserved).toHaveBeenCalledOnce());
    expect(actionButton("生成试听")).toBeEnabled();
    expect(
      screen.getByText("内容或语音参数已变化，请重新生成试听")
    ).toBeVisible();

    resolvePending?.(result({ dispose: lateDispose }));
    await waitFor(() => expect(lateDispose).toHaveBeenCalledOnce());
    expect(AudioMock.instances).toHaveLength(0);
    expect(actionButton("重播")).toBeDisabled();
  });

  it("suppresses a synthesis rejection after the request is aborted", async () => {
    const abortedAdapter = adapter(
      vi.fn(
        (_input, options) =>
          new Promise<VoicePreviewResult>((_resolve, reject) => {
            options?.signal?.addEventListener("abort", () => {
              reject(new Error("request aborted"));
            });
          })
      )
    );
    const view = render(
      <VoiceRichTextEditor
        {...editorProps({ previewAdapter: abortedAdapter })}
      />
    );
    await waitFor(() => expect(actionButton("生成试听")).toBeEnabled());
    fireEvent.click(actionButton("生成试听"));
    view.rerender(
      <VoiceRichTextEditor
        {...editorProps({ previewAdapter: abortedAdapter })}
        open={false}
      />
    );
    await waitFor(() =>
      expect(screen.queryByText("request aborted")).not.toBeInTheDocument()
    );
  });

  it("preserves supported voice settings, clears unsupported settings, and maps select controls", async () => {
    const synthesize = vi.fn().mockResolvedValue(result());
    render(
      <VoiceRichTextEditor
        {...editorProps({ previewAdapter: adapter(synthesize) })}
      />
    );
    await waitFor(() => expect(actionButton("生成试听")).toBeEnabled());
    await selectOption("发音人", "Aria · 美式女声");
    await selectOption("说话风格", "cheerful");
    await selectOption("整体语速", "语速：+5%");
    await selectOption("整体音高", "音高：+1st");
    await selectOption("发音人", "Sonia · 英式女声");
    fireEvent.click(actionButton("生成试听"));
    await waitFor(() => expect(synthesize).toHaveBeenCalledOnce());
    expect(synthesize.mock.calls[0]![0]).toMatchObject({
      voiceId: "sonia",
      style: "cheerful",
      ratePercent: 5,
      pitchSemitones: 1
    });

    await selectOption("发音人", "Guy · 美式男声");
    expect(screen.getByLabelText("说话风格")).toBeDisabled();
    expect(screen.getByLabelText("整体语速")).toBeDisabled();
    expect(screen.getByLabelText("整体音高")).toBeDisabled();
  });

  it("handles empty, fallback, failed, and aborted voice catalogs", async () => {
    const noDefaultAdapter = adapter();
    vi.mocked(noDefaultAdapter.listVoices).mockResolvedValueOnce([VOICES[1]!]);
    const view = render(
      <VoiceRichTextEditor
        {...editorProps({ previewAdapter: noDefaultAdapter })}
      />
    );
    await waitFor(() => expect(actionButton("生成试听")).toBeEnabled());

    const emptyAdapter = adapter();
    vi.mocked(emptyAdapter.listVoices).mockResolvedValueOnce([]);
    view.rerender(
      <VoiceRichTextEditor {...editorProps({ previewAdapter: emptyAdapter })} />
    );
    expect(await screen.findByText("暂无可用发音人")).toBeVisible();

    const failedAdapter = adapter();
    vi.mocked(failedAdapter.listVoices).mockRejectedValueOnce({
      reason: "unknown"
    });
    view.rerender(
      <VoiceRichTextEditor
        {...editorProps({ previewAdapter: failedAdapter })}
      />
    );
    expect(await screen.findByText("操作失败，请重试")).toBeVisible();

    let rejectVoices: ((error: Error) => void) | undefined;
    const pendingCatalog = adapter();
    vi.mocked(pendingCatalog.listVoices).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectVoices = reject;
      })
    );
    view.rerender(
      <VoiceRichTextEditor
        {...editorProps({ previewAdapter: pendingCatalog })}
      />
    );
    view.rerender(
      <VoiceRichTextEditor
        {...editorProps({ previewAdapter: pendingCatalog })}
        open={false}
      />
    );
    rejectVoices?.(new Error("catalog aborted"));
    await waitFor(() =>
      expect(screen.queryByText("catalog aborted")).not.toBeInTheDocument()
    );

    let resolveVoices: ((voices: VoiceOption[]) => void) | undefined;
    const resolvingCatalog = adapter();
    vi.mocked(resolvingCatalog.listVoices).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveVoices = resolve;
      })
    );
    view.rerender(
      <VoiceRichTextEditor
        {...editorProps({ previewAdapter: resolvingCatalog })}
      />
    );
    view.rerender(
      <VoiceRichTextEditor
        {...editorProps({ previewAdapter: resolvingCatalog })}
        open={false}
      />
    );
    resolveVoices?.(VOICES);
    await Promise.resolve();
  });

  it("reports autoplay failures for generation/replay and supports read-only close", async () => {
    AudioMock.rejectedPlays = 2;
    const onCancel = vi.fn();
    const previewAdapter = adapter(
      vi.fn().mockResolvedValue(result({ cached: true }))
    );
    const view = render(
      <VoiceRichTextEditor {...editorProps({ previewAdapter, onCancel })} />
    );
    await waitFor(() => expect(actionButton("生成试听")).toBeEnabled());
    fireEvent.click(actionButton("生成试听"));
    expect(await screen.findByText("已生成（缓存命中）")).toBeVisible();

    const uncachedAdapter = adapter();
    view.rerender(
      <VoiceRichTextEditor
        {...editorProps({ previewAdapter: uncachedAdapter, onCancel })}
      />
    );
    await waitFor(() => expect(actionButton("生成试听")).toBeEnabled());
    fireEvent.click(actionButton("生成试听"));
    expect(await screen.findByText("已生成试听")).toBeVisible();

    AudioMock.rejectedPlays = 1;
    fireEvent.click(actionButton("重播"));
    expect(
      await screen.findByText("浏览器阻止自动播放，请再次点击重播")
    ).toBeVisible();

    view.rerender(
      <VoiceRichTextEditor
        {...editorProps({ previewAdapter, onCancel, readOnly: true })}
      />
    );
    expect(actionButton("关闭")).toBeVisible();
    expect(document.querySelector('[aria-label="加重音"]')).toBeNull();
    expect(document.querySelector(".ProseMirror")).toHaveAttribute(
      "contenteditable",
      "false"
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledOnce());
  });

  it("cleans print state through afterprint and the fallback timer", () => {
    vi.useFakeTimers();
    const view = render(<VoiceRichTextEditor {...editorProps()} />);
    fireEvent.click(actionButton("导出 PDF"));
    expect(window.print).toHaveBeenCalledOnce();
    expect(document.body).toHaveClass("tsz-ve-printing");
    window.dispatchEvent(new Event("afterprint"));
    expect(document.body).not.toHaveClass("tsz-ve-printing");

    fireEvent.click(actionButton("导出 PDF"));
    vi.advanceTimersByTime(1000);
    expect(document.body).not.toHaveClass("tsz-ve-printing");
    view.unmount();
  });
});
