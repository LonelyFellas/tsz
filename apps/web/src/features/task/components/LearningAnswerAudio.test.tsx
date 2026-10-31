import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
const mocks = vi.hoisted(() => ({
  audio: vi.fn(),
  play: vi.fn(),
  pause: vi.fn()
}));
vi.mock("@/lib/request", () => ({ api: { learning: { audio: mocks.audio } } }));
vi.mock("@/lib/auth", () => ({
  authRuntime: { tokens: { getSessionGeneration: () => 1 } }
}));
import { LearningAnswerAudio } from "./LearningAnswerAudio";
const props = {
  runId: "r1",
  questionId: "q1",
  userId: "u1",
  available: true,
  accent: "uk" as const
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.play.mockResolvedValue(undefined);
  vi.stubGlobal(
    "Audio",
    class {
      play = mocks.play;
      pause = mocks.pause;
    }
  );
});
it("does not request unavailable sources and names a missing formal recording", async () => {
  const view = renderWithProviders(
    <LearningAnswerAudio {...props} available={false} />
  );
  expect(screen.getByText("暂无可用的正式音频")).toBeVisible();
  expect(mocks.audio).not.toHaveBeenCalled();
  mocks.audio.mockResolvedValue({
    policy_version: "harmonic_v1",
    occurrence: 1,
    audio: null
  });
  view.rerender(<LearningAnswerAudio {...props} />);
  await waitFor(() => expect(mocks.audio).toHaveBeenCalledTimes(1));
  expect(
    screen.queryByRole("button", { name: "播放答案发音" })
  ).not.toBeInTheDocument();
});
it("uses question-bound signing on playback and isolates a new question", async () => {
  mocks.audio.mockResolvedValue({
    policy_version: "harmonic_v1",
    occurrence: 2,
    audio: {
      asset_id: "a1",
      url: "https://audio.example.test/formal.mp3",
      expires_at: "2099-01-01T00:00:00Z"
    }
  });
  const view = renderWithProviders(<LearningAnswerAudio {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: "播放答案发音" }));
  await waitFor(() => expect(mocks.play).toHaveBeenCalledTimes(1));
  expect(mocks.audio).toHaveBeenLastCalledWith(
    "r1",
    "q1",
    "uk",
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
  mocks.audio.mockResolvedValue({
    policy_version: "harmonic_v1",
    occurrence: 3,
    audio: null
  });
  view.rerender(<LearningAnswerAudio {...props} questionId="q2" />);
  await screen.findByText("暂无可用的正式音频");
  expect(mocks.pause).toHaveBeenCalled();
});
