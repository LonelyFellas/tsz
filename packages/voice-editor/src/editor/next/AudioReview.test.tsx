import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AudioReview, loopPosition, waveformPeaks } from "./AudioReview";

class Media extends EventTarget {
  currentTime = 0;
  paused = true;
  playbackRate = 1;
  play = vi.fn(async () => {
    this.paused = false;
    this.dispatchEvent(new Event("play"));
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  });
}
const close = vi.fn(async () => {});
const decoded = {
  duration: 2,
  numberOfChannels: 1,
  getChannelData: () => new Float32Array([0, 0.25, -0.75, 0.5])
};
beforeEach(() => {
  vi.stubGlobal(
    "AudioContext",
    class {
      decodeAudioData = vi.fn(async () => decoded);
      close = close;
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  close.mockClear();
});

it("波形保留每个窗口所有声道的真实峰值，静音不伪造振幅", () => {
  expect(
    waveformPeaks(
      [
        new Float32Array([0, 0.2, -0.8, 0.5]),
        new Float32Array([-0.4, 0, 0, 0.9])
      ],
      2
    )
  ).toEqual([expect.closeTo(0.4), expect.closeTo(0.9)]);
  expect(waveformPeaks([new Float32Array(8)], 4)).toEqual([0, 0, 0, 0]);
  expect(loopPosition(1.5, 0.5, 1.5)).toBe(0.5);
  expect(loopPosition(1.49, 0.5, 1.5)).toBe(1.49);
});

it("解码真实字节后定位与循环，下载保持原始内容且卸载关闭解码器", async () => {
  const media = new Media();
  const blob = new Blob([new Uint8Array([82, 73, 70, 70])], {
    type: "audio/wav"
  });
  Object.defineProperty(blob, "arrayBuffer", {
    value: async () => new ArrayBuffer(4)
  });
  const loadAudio = vi.fn(async () => blob);
  let downloaded: Blob | undefined;
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn((value: Blob) => {
      downloaded = value;
      return "blob:download";
    }),
    revokeObjectURL: vi.fn()
  });
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  const view = render(
    <AudioReview
      media={{
        audio: media as unknown as HTMLAudioElement,
        name: "sample",
        result: {
          audioUrl: "blob:sample",
          expiresAt: "2099-01-01",
          cached: false,
          loadAudio
        }
      }}
    />
  );
  const waveform =
    await screen.findByLabelText("音频波形，点击定位或拖动选择区间");
  fireEvent.keyDown(waveform, { key: "ArrowRight" });
  expect(media.currentTime).toBeCloseTo(0.1);
  fireEvent.change(screen.getByLabelText("循环起点秒数"), {
    target: { value: "0.5" }
  });
  fireEvent.change(screen.getByLabelText("循环终点秒数"), {
    target: { value: "1.5" }
  });
  fireEvent.click(screen.getByLabelText("区间循环"));
  await act(() => media.play());
  act(() => {
    media.currentTime = 1.6;
    media.dispatchEvent(new Event("timeupdate"));
  });
  expect(media.currentTime).toBe(0.5);
  act(() => {
    media.paused = true;
    media.currentTime = 2;
    media.dispatchEvent(new Event("ended"));
  });
  await waitFor(() => expect(media.play).toHaveBeenCalledTimes(2));
  expect(media.currentTime).toBe(0.5);
  media.playbackRate = 2;
  fireEvent.click(screen.getByRole("button", { name: "下载原音频" }));
  expect(downloaded).toBe(blob);
  expect(click).toHaveBeenCalledOnce();
  view.unmount();
  expect(media.playbackRate).toBe(1);
  expect(close).toHaveBeenCalled();
});
