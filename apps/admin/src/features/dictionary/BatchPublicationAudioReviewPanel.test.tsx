import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import type { PublicationAudioReview } from "@tsz/types";
import {
  BatchPublicationAudioReviewPanel,
  type PublicationAudioTarget
} from "./BatchPublicationAudioReviewPanel";

function target(
  id: string,
  owner: "entry" | "sentence" = "entry",
  revision = 3
): PublicationAudioTarget {
  return { id, owner, revision, lifecycleRevision: 2, label: `${owner} ${id}` };
}
function review(
  t: PublicationAudioTarget,
  confirmed = false
): PublicationAudioReview {
  return {
    manifest: {
      owner: t.owner === "entry" ? { entry: t.id } : { sentence: t.id },
      revision: t.revision,
      policy_version: 1,
      manifest_hash: "a".repeat(64),
      ready: true,
      items: [
        {
          target_id: t.id,
          content_id: null,
          source_path: "/forms/contents/0",
          default_for: ["uk"],
          setting: null,
          source: null,
          asset_id: `${t.id}-asset`,
          issue: null
        }
      ]
    },
    confirmed,
    receipt_id: confirmed ? `${t.id}-receipt` : null
  };
}

it("checks a mixed frozen selection serially and confirms only pending owners", async () => {
  const first = target("first");
  const second = target("second", "sentence", 7);
  let resolveFirst!: (value: PublicationAudioReview) => void;
  const firstCheck = vi.fn(
    () =>
      new Promise<PublicationAudioReview>((resolve) => {
        resolveFirst = resolve;
      })
  );
  const secondCheck = vi.fn().mockResolvedValue(review(second));
  const confirm = vi.fn().mockResolvedValue(review(second, true));
  const onReady = vi.fn();
  render(
    <BatchPublicationAudioReviewPanel
      targets={[first, second]}
      allowed
      locked={false}
      onStart={vi.fn()}
      onReady={onReady}
      requestsFor={(t) => ({
        check: t.id === first.id ? firstCheck : secondCheck,
        confirm
      })}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "检查所选音频" }));
  expect(firstCheck).toHaveBeenCalledWith(
    first.id,
    { base_revision: 3 },
    expect.any(AbortSignal)
  );
  expect(secondCheck).not.toHaveBeenCalled();
  await act(async () => resolveFirst(review(first, true)));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "确认所选音频" })).toBeEnabled()
  );
  expect(secondCheck).toHaveBeenCalledWith(
    second.id,
    { base_revision: 7 },
    expect.any(AbortSignal)
  );
  expect(onReady).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByRole("button", { name: "确认所选音频" }));
  await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
  expect(confirm).toHaveBeenCalledOnce();
  expect(confirm).toHaveBeenCalledWith(
    second.id,
    { base_revision: 7, manifest_hash: "a".repeat(64) },
    expect.any(AbortSignal)
  );
});

it("retains successful receipts and retries only an uncertain confirmation", async () => {
  const targets = [target("first"), target("second")];
  const checks = targets.map((t) => vi.fn().mockResolvedValue(review(t)));
  const confirms = [
    vi.fn().mockResolvedValue(review(targets[0]!, true)),
    vi
      .fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValue(review(targets[1]!, true))
  ];
  const onReady = vi.fn();
  render(
    <BatchPublicationAudioReviewPanel
      targets={targets}
      allowed
      locked={false}
      onStart={vi.fn()}
      onReady={onReady}
      requestsFor={(t) => {
        const i = targets.findIndex((row) => row.id === t.id);
        return { check: checks[i]!, confirm: confirms[i]! };
      }}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "检查所选音频" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "确认所选音频" })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "确认所选音频" }));
  await screen.findByText("response lost");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "确认所选音频" })).toBeEnabled()
  );
  expect(onReady).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByRole("button", { name: "确认所选音频" }));
  await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
  expect(confirms[0]).toHaveBeenCalledOnce();
  expect(confirms[1]).toHaveBeenCalledTimes(2);
  expect(confirms[1]!.mock.calls[0]!.slice(0, 2)).toEqual(
    confirms[1]!.mock.calls[1]!.slice(0, 2)
  );
  checks.forEach((check) => expect(check).toHaveBeenCalledOnce());
});

it("does not accept a late result from a previous frozen scope", async () => {
  const old = target("entry", "entry", 1);
  const current = target("entry", "entry", 2);
  let resolveOld!: (value: PublicationAudioReview) => void;
  const check = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        })
    )
    .mockResolvedValue(review(current));
  const endpoint = { check, confirm: vi.fn() };
  const onReady = vi.fn();
  const view = render(
    <BatchPublicationAudioReviewPanel
      targets={[old]}
      allowed
      locked={false}
      onStart={vi.fn()}
      onReady={onReady}
      requestsFor={() => endpoint}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "检查所选音频" }));
  view.rerender(
    <BatchPublicationAudioReviewPanel
      targets={[current]}
      allowed
      locked={false}
      onStart={vi.fn()}
      onReady={onReady}
      requestsFor={() => endpoint}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "检查所选音频" }));
  await screen.findByText("待集中审听确认");
  await act(async () => resolveOld(review(old, true)));
  expect(check.mock.calls[0]![2].aborted).toBe(true);
  expect(onReady).toHaveBeenLastCalledWith(false);
});

it("does not start an oversized or locked batch", () => {
  const endpoint = { check: vi.fn(), confirm: vi.fn() };
  const view = render(
    <BatchPublicationAudioReviewPanel
      targets={Array.from({ length: 51 }, (_, i) => target(String(i)))}
      allowed
      locked={false}
      onStart={vi.fn()}
      onReady={vi.fn()}
      requestsFor={() => endpoint}
    />
  );
  expect(screen.getByRole("button", { name: "检查所选音频" })).toBeDisabled();
  view.rerender(
    <BatchPublicationAudioReviewPanel
      targets={[target("one")]}
      allowed
      locked
      onStart={vi.fn()}
      onReady={vi.fn()}
      requestsFor={() => endpoint}
    />
  );
  expect(screen.getByRole("button", { name: "检查所选音频" })).toBeDisabled();
  expect(endpoint.check).not.toHaveBeenCalled();
});

it("rechecks legacy service rows after the API rollout instead of retaining a bypass", async () => {
  const t = target("legacy");
  const check = vi.fn().mockRejectedValue(new HttpError(404, "not found"));
  const confirm = vi.fn();
  const ready = vi.fn();
  render(
    <BatchPublicationAudioReviewPanel
      targets={[t]}
      allowed
      locked={false}
      onStart={vi.fn()}
      onReady={ready}
      requestsFor={() => ({ check, confirm })}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "检查所选音频" }));
  await waitFor(() => expect(ready).toHaveBeenLastCalledWith(true));
  expect(confirm).not.toHaveBeenCalled();
  check.mockResolvedValue(review(t));
  fireEvent.click(screen.getByRole("button", { name: "检查所选音频" }));
  await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(ready).toHaveBeenLastCalledWith(false));
  expect(screen.getByRole("button", { name: "确认所选音频" })).toBeEnabled();
});
