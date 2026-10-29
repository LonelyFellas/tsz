import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import type { PublicationAudioReview } from "@tsz/types";
import { PublicationAudioReviewPanel } from "./PublicationAudioReviewPanel";

const { synthesize } = vi.hoisted(() => ({ synthesize: vi.fn() }));
vi.mock("@/lib/auth", () => ({ api: { speech: { synthesize } } }));
const id = "00000000-0000-4000-8000-000000000001";
const asset = "00000000-0000-4000-8000-000000000002";
function review(revision = 1): PublicationAudioReview {
  return {
    manifest: {
      owner: { entry: id },
      revision,
      policy_version: 1,
      ready: true,
      manifest_hash: "a".repeat(64),
      items: [
        {
          target_id: id,
          content_id: null,
          source_path: "/forms/contents/0",
          default_for: ["uk"],
          setting: null,
          asset_id: asset,
          source: null,
          issue: null
        }
      ]
    },
    confirmed: false,
    receipt_id: null
  };
}
function requests(value = review()) {
  return {
    check: vi.fn().mockResolvedValue(value),
    confirm: vi
      .fn()
      .mockResolvedValue({ ...value, confirmed: true, receipt_id: id })
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "Audio",
    class {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      pause = vi.fn();
      play = vi.fn(async () => {
        queueMicrotask(() => this.onended?.());
      });
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

it("auditions only registered assets then explicitly confirms the exact batch", async () => {
  const value = review();
  value.manifest.items.push({
    ...value.manifest.items[0]!,
    source_path: "/forms/contents/1"
  });
  const endpoint = requests(value);
  const resolveAudio = vi
    .fn()
    .mockResolvedValue({ url: "https://audio.example.test/form.mp3" });
  const onReady = vi.fn();
  render(
    <PublicationAudioReviewPanel
      owner="entry"
      id={id}
      revision={1}
      canConfirm
      onReady={onReady}
      requests={endpoint}
      resolveAudio={resolveAudio}
    />
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "连续试听" })).not.toBeDisabled()
  );
  expect(
    screen.getAllByRole("button", { name: /试听第 .* 条正式音频/ })
  ).toHaveLength(1);
  expect(endpoint.confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "连续试听" }));
  await waitFor(() => expect(resolveAudio).toHaveBeenCalledTimes(1));
  expect(resolveAudio).toHaveBeenCalledWith(asset, expect.any(AbortSignal));
  expect(synthesize).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "确认本批音频" }));
  await screen.findByText("本批音频已确认");
  expect(endpoint.confirm).toHaveBeenCalledWith(
    id,
    { base_revision: 1, manifest_hash: "a".repeat(64) },
    expect.any(AbortSignal)
  );
  expect(onReady).toHaveBeenLastCalledWith(true);
});

it("missing audio cannot be auditioned or confirmed and never starts synthesis", async () => {
  const value = review();
  value.manifest.ready = false;
  value.manifest.items[0]!.asset_id = null;
  value.manifest.items[0]!.issue = "missing_asset";
  const endpoint = requests(value);
  const onReady = vi.fn();
  render(
    <PublicationAudioReviewPanel
      owner="entry"
      id={id}
      revision={1}
      canConfirm
      onReady={onReady}
      requests={endpoint}
    />
  );
  await screen.findByText("仍有音频待完成");
  expect(screen.getByRole("button", { name: "确认本批音频" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "试听第 1 条正式音频" })
  ).toBeDisabled();
  expect(endpoint.confirm).not.toHaveBeenCalled();
  expect(synthesize).not.toHaveBeenCalled();
  expect(onReady).toHaveBeenLastCalledWith(false);
});

it("discards an old revision's late response", async () => {
  let resolveOld!: (value: PublicationAudioReview) => void;
  const endpoint = requests();
  const missing = review(2);
  missing.manifest.ready = false;
  endpoint.check
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        })
    )
    .mockResolvedValue(missing);
  const onReady = vi.fn();
  const view = render(
    <PublicationAudioReviewPanel
      owner="entry"
      id={id}
      revision={1}
      canConfirm
      onReady={onReady}
      requests={endpoint}
    />
  );
  view.rerender(
    <PublicationAudioReviewPanel
      owner="entry"
      id={id}
      revision={2}
      canConfirm
      onReady={onReady}
      requests={endpoint}
    />
  );
  await screen.findByText("仍有音频待完成");
  await act(async () =>
    resolveOld({ ...review(), confirmed: true, receipt_id: id })
  );
  expect(endpoint.check.mock.calls[0]![2].aborted).toBe(true);
  expect(onReady).toHaveBeenLastCalledWith(false);
});

it("a media failure blocks confirmation and does not fall back to synthesis", async () => {
  const endpoint = requests();
  const onReady = vi.fn();
  const resolveAudio = vi.fn().mockRejectedValue(new Error("正式音频读取失败"));
  render(
    <PublicationAudioReviewPanel
      owner="entry"
      id={id}
      revision={1}
      canConfirm
      onReady={onReady}
      requests={endpoint}
      resolveAudio={resolveAudio}
    />
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "连续试听" })).not.toBeDisabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "连续试听" }));
  await screen.findByText("正式音频读取失败");
  expect(screen.getByRole("button", { name: "确认本批音频" })).toBeDisabled();
  expect(synthesize).not.toHaveBeenCalled();
  expect(onReady).toHaveBeenLastCalledWith(false);
});

it("viewers may audition but cannot confirm", async () => {
  render(
    <PublicationAudioReviewPanel
      owner="entry"
      id={id}
      revision={1}
      canConfirm={false}
      onReady={vi.fn()}
      requests={requests()}
    />
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "连续试听" })).not.toBeDisabled()
  );
  expect(
    screen.queryByRole("button", { name: "确认本批音频" })
  ).not.toBeInTheDocument();
});

it("identifies a missing shared pronunciation by business ID and preserves its accent", async () => {
  const value = review();
  value.manifest.ready = false;
  value.manifest.items[0] = {
    ...value.manifest.items[0]!,
    asset_id: null,
    issue: "missing_configuration"
  };
  const content = {
    forms: {
      contents: [
        {
          id: asset,
          regional_variants: {
            uk: { spelling: "endurance", pronunciations: [{ id }] }
          }
        }
      ]
    }
  };
  render(
    <PublicationAudioReviewPanel
      owner="entry"
      id={id}
      revision={1}
      canConfirm
      content={content}
      onReady={vi.fn()}
      requests={requests(value)}
    />
  );
  expect(await screen.findByText("endurance")).toBeInTheDocument();
  expect(screen.getByText("英式 · 尚未选择发音配置")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "确认本批音频" })).toBeDisabled();
  expect(synthesize).not.toHaveBeenCalled();
});

it("supports frontend-first rollout only when the old API endpoint is absent", async () => {
  const endpoint = requests();
  endpoint.check.mockRejectedValue(new HttpError(404, "not found"));
  const ready = vi.fn();
  render(
    <PublicationAudioReviewPanel
      owner="entry"
      id={id}
      revision={1}
      canConfirm
      onReady={ready}
      requests={endpoint}
    />
  );
  expect(
    await screen.findByText("当前服务版本尚未提供音频确认")
  ).toBeInTheDocument();
  expect(ready).toHaveBeenLastCalledWith(true);
  expect(endpoint.confirm).not.toHaveBeenCalled();
  endpoint.check.mockRejectedValue(new HttpError(503, "unavailable"));
  fireEvent.click(await screen.findByRole("button", { name: "重新检查音频" }));
  await screen.findByText("unavailable");
  expect(ready).toHaveBeenLastCalledWith(false);
});
