import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AudioButton } from "./AudioButton";

const { generation, play, pause } = vi.hoisted(() => ({
  generation: vi.fn(),
  play: vi.fn(),
  pause: vi.fn()
}));
vi.mock("@/lib/auth", () => ({
  authRuntime: { tokens: { getSessionGeneration: generation } }
}));
let now: number;
let players: { onerror: (() => void) | null }[];
beforeEach(() => {
  vi.clearAllMocks();
  generation.mockReturnValue(1);
  play.mockResolvedValue(undefined);
  now = Date.parse("2026-10-28T12:00:00Z");
  vi.spyOn(Date, "now").mockImplementation(() => now);
  players = [];
  vi.stubGlobal(
    "Audio",
    class {
      play = play;
      pause = pause;
      onerror = null;
      constructor() {
        players.push(this);
      }
    }
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function signer() {
  return vi.fn().mockImplementation(async () => ({
    url: "https://audio.example.test/asset.mp3",
    expires_at: new Date(now + 60_000).toISOString()
  }));
}
async function click() {
  fireEvent.click(screen.getByRole("button", { name: "播放" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "播放" })).not.toBeDisabled()
  );
}

it("reuses a valid resource URL and refreshes near its actual expiry", async () => {
  const sign = signer();
  render(<AudioButton label="播放" sign={sign} resourceKey="entry:asset" />);
  await click();
  await click();
  expect(play).toHaveBeenCalledTimes(2);
  expect(sign).toHaveBeenCalledTimes(1);
  now += 56_000;
  await click();
  expect(sign).toHaveBeenCalledTimes(2);
});

it("does not reuse a URL across resources or login sessions", async () => {
  const sign = signer();
  const view = render(
    <AudioButton label="播放" sign={sign} resourceKey="entry:first" />
  );
  await click();
  generation.mockReturnValue(2);
  await click();
  expect(sign).toHaveBeenCalledTimes(2);
  view.rerender(
    <AudioButton label="播放" sign={sign} resourceKey="entry:second" />
  );
  await click();
  expect(sign).toHaveBeenCalledTimes(3);
});

it("discards a failed media URL and ignores errors from replaced players", async () => {
  const sign = signer();
  render(<AudioButton label="播放" sign={sign} resourceKey="entry:asset" />);
  await click();
  const oldError = players[0]!.onerror;
  await click();
  act(() => oldError?.());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  act(() => players[1]!.onerror?.());
  expect(screen.getByRole("alert")).toBeInTheDocument();
  await click();
  expect(sign).toHaveBeenCalledTimes(2);
});

it("ignores an in-flight signature returned after a session change", async () => {
  let resolve!: (value: { url: string; expires_at: string }) => void;
  const sign = vi.fn(
    () =>
      new Promise<{ url: string; expires_at: string }>((done) => {
        resolve = done;
      })
  );
  render(<AudioButton label="播放" sign={sign} resourceKey="entry:asset" />);
  fireEvent.click(screen.getByRole("button", { name: "播放" }));
  generation.mockReturnValue(2);
  await act(async () =>
    resolve({
      url: "https://audio.example.test/old.mp3",
      expires_at: new Date(now + 60_000).toISOString()
    })
  );
  expect(play).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "播放" })).not.toBeDisabled();
});

it.each([undefined, "invalid"])(
  "does not invent a lifetime when expiry is %s",
  async (expiry) => {
    const sign = vi.fn().mockResolvedValue({
      url: "https://audio.example.test/a.mp3",
      expires_at: expiry
    });
    render(<AudioButton label="播放" sign={sign} resourceKey="entry:asset" />);
    await click();
    await click();
    expect(sign).toHaveBeenCalledTimes(2);
  }
);
