import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DictionaryAudio } from "@tsz/types";
import { preferredAudio, TargetAudio } from "./Content";

const { sign, play, pause } = vi.hoisted(() => ({
  sign: vi.fn(),
  play: vi.fn(),
  pause: vi.fn()
}));
vi.mock("@/lib/request", () => ({ api: { dictionary: { audio: sign } } }));
vi.mock("@tsz/voice-editor/reader", () => ({ RichTextReadOnly: () => null }));
const audio: DictionaryAudio[] = [
  { target_id: "text", asset_id: "au", locale: "en-AU", accent_group: "uk" },
  { target_id: "text", asset_id: "ca", locale: "en-CA", accent_group: "us" },
  { target_id: "text", asset_id: "in", locale: "en-IN", accent_group: "other" },
  {
    target_id: "another",
    asset_id: "ie",
    locale: "en-IE",
    accent_group: "other"
  }
];
beforeEach(() => {
  vi.clearAllMocks();
  sign.mockResolvedValue({ url: "https://audio.example.test/audio.mp3" });
  play.mockResolvedValue(undefined);
  vi.stubGlobal(
    "Audio",
    class {
      play = play;
      pause = pause;
      onerror = null;
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("字典内容音频", () => {
  it("同target补充音频按实际正文来源方言筛选，不以声音locale猜正文", async () => {
    const items: DictionaryAudio[] = [
      {
        target_id: "text",
        asset_id: "uk-in",
        locale: "en-IN",
        accent_group: "other",
        source_dialect: "uk"
      },
      {
        target_id: "text",
        asset_id: "us-in",
        locale: "en-IN",
        accent_group: "other",
        source_dialect: "us"
      }
    ];
    const view = render(
      <TargetAudio
        entryId="entry"
        targetId="text"
        audio={items}
        variant="BrE"
        sourceDialects={["uk"]}
        label="播放例句"
      />
    );
    expect(view.container.querySelectorAll("button")).toHaveLength(1);
    fireEvent.click(screen.getByText("其他音色"));
    fireEvent.click(screen.getByLabelText("播放例句（印度补充音色 1）"));
    await waitFor(() =>
      expect(sign).toHaveBeenLastCalledWith("entry", "uk-in", {
        signal: expect.any(AbortSignal)
      })
    );
    view.rerender(
      <TargetAudio
        entryId="entry"
        targetId="text"
        audio={items}
        variant="AmE"
        sourceDialects={["us"]}
        label="播放例句"
      />
    );
    expect(view.container.querySelectorAll("button")).toHaveLength(1);
    fireEvent.click(screen.getByLabelText("播放例句（印度补充音色 1）"));
    await waitFor(() =>
      expect(sign).toHaveBeenLastCalledWith("entry", "us-in", {
        signal: expect.any(AbortSignal)
      })
    );
    view.rerender(
      <TargetAudio
        entryId="entry"
        targetId="text"
        audio={items.map(({ source_dialect: _, ...item }) => item)}
        variant="BrE"
        sourceDialects={["uk"]}
        label="播放例句"
      />
    );
    expect(view.container.querySelectorAll("button")).toHaveLength(0);
  });
  it("同口音多个版本按持久顺序默认播放，其余版本可单独播放", async () => {
    const versions = [audio[0]!, { ...audio[0]!, asset_id: "second" }];
    render(
      <TargetAudio
        entryId="entry"
        targetId="text"
        audio={versions}
        variant="BrE"
        label="播放词形"
      />
    );
    fireEvent.click(screen.getByLabelText("播放词形（澳大利亚）"));
    await waitFor(() =>
      expect(sign).toHaveBeenLastCalledWith("entry", "au", {
        signal: expect.any(AbortSignal)
      })
    );
    fireEvent.click(screen.getByText("其他音色"));
    fireEvent.click(screen.getByLabelText("播放词形（澳大利亚补充音色 1）"));
    await waitFor(() =>
      expect(sign).toHaveBeenLastCalledWith("entry", "second", {
        signal: expect.any(AbortSignal)
      })
    );
  });
  it("按分类选择AU/CA，兼容旧响应，缺侧不回退到补充声音", () => {
    expect(preferredAudio(audio, "text", "BrE")?.asset_id).toBe("au");
    expect(preferredAudio(audio, "text", "AmE")?.asset_id).toBe("ca");
    const legacy = audio.map(({ accent_group: _, ...item }) => item);
    expect(preferredAudio(legacy, "text", "BrE")?.asset_id).toBe("au");
    expect(preferredAudio(legacy, "text", "AmE")?.asset_id).toBe("ca");
    expect(
      preferredAudio(
        audio.filter((item) => item.asset_id !== "au"),
        "text",
        "BrE"
      )
    ).toBeUndefined();
  });
  it("只有补充音频也能明确展开选播，按目标签名，收起不卸载播放器", async () => {
    const { container } = render(
      <TargetAudio
        entryId="entry"
        targetId="text"
        audio={audio.filter((item) => item.accent_group === "other")}
        variant="BrE"
        label="播放例句"
      />
    );
    const summary = screen.getByText("其他音色");
    const details = summary.closest("details")!;
    expect(sign).not.toHaveBeenCalled();
    fireEvent.click(summary);
    details.open = true;
    expect(screen.queryByLabelText(/爱尔兰/)).toBeNull();
    fireEvent.click(screen.getByLabelText("播放例句（印度补充音色 1）"));
    await waitFor(() =>
      expect(sign).toHaveBeenCalledWith("entry", "in", {
        signal: expect.any(AbortSignal)
      })
    );
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    const button = screen.getByLabelText("播放例句（印度补充音色 1）");
    details.open = false;
    fireEvent(details, new Event("toggle"));
    expect(container.contains(button)).toBe(true);
    expect(pause).not.toHaveBeenCalled();
  });
});
