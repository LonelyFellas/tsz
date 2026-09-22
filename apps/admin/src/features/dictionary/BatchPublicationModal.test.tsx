import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import type { AdminWordListItemAny } from "@tsz/types";
import { BatchPublicationModal } from "./BatchPublicationModal";

const { publish } = vi.hoisted(() => ({ publish: vi.fn() }));
vi.mock("@/lib/auth", () => ({ api: { words: { publishBatchV3: publish } } }));
function row(id: string, revision: number): AdminWordListItemAny {
  return {
    schema_version: 3,
    id,
    revision,
    lifecycle_revision: 2,
    presentation: {
      label: id,
      matched_surfaces: [id],
      strategy_version: "surface_summary_v1"
    }
  } as AdminWordListItemAny;
}
function mount() {
  const onPublished = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={client}>
      <BatchPublicationModal
        rows={[row("first-page", 3), row("second-page", 7)]}
        onClose={vi.fn()}
        onPublished={onPublished}
      />
    </QueryClientProvider>
  );
  return onPublished;
}
beforeEach(() => {
  publish.mockReset();
});

describe("原子批次发布确认", () => {
  it("只提交显式选中范围及确认时版本，成功后统一刷新", async () => {
    publish.mockResolvedValue({ words: [] });
    const done = mount();
    fireEvent.click(await screen.findByRole("button", { name: "发布所选" }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(publish).toHaveBeenCalledWith(expect.any(String), {
      schema_version: 3,
      items: [
        {
          entry_id: "first-page",
          base_revision: 3,
          base_lifecycle_revision: 2
        },
        {
          entry_id: "second-page",
          base_revision: 7,
          base_lifecycle_revision: 2
        }
      ]
    });
  });
  it("结果未知重试复用同一幂等键和版本，不重复提交并发请求", async () => {
    publish
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValue({ words: [] });
    const done = mount();
    fireEvent.click(await screen.findByRole("button", { name: "发布所选" }));
    await screen.findByText(/发布结果暂时未知/);
    fireEvent.click(await screen.findByRole("button", { name: "发布所选" }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(publish.mock.calls[1]).toEqual(publish.mock.calls[0]);
  });
  it("版本冲突保留范围并阻止自动取新版本重发", async () => {
    publish.mockRejectedValue(
      new HttpError(409, "revision changed", undefined, "revision_conflict")
    );
    const done = mount();
    fireEvent.click(await screen.findByRole("button", { name: "发布所选" }));
    await screen.findByText(/刷新列表并重新选择/);
    expect(
      await screen.findByRole("button", { name: "发布所选" })
    ).toBeDisabled();
    expect(publish).toHaveBeenCalledOnce();
    expect(done).not.toHaveBeenCalled();
    expect(screen.getByText("first-page")).toBeInTheDocument();
    expect(screen.getByText("second-page")).toBeInTheDocument();
  });
});
