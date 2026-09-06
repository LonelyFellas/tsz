import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client/http";
import type { AdminWordListItemV3 } from "@tsz/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ api: { words: { updateAnnotation: update } } }));
import { EditEntryAnnotation } from "./EditEntryAnnotation";

const entry: AdminWordListItemV3 = {
  annotation_visible: false,
  annotation: "中心",
  annotation_revision: 1,
  schema_version: 3,
  id: "entry",
  kind: "word",
  presentation: {
    label: "center",
    matched_surfaces: [],
    strategy_version: "surface_summary_v1"
  },
  dialects: ["common"],
  revision: 1,
  lifecycle_revision: 1,
  gloss: "中心",
  pos_list: [],
  levels: [],
  status: "draft",
  has_unpublished_changes: true,
  max_reachable_step: "forms",
  created_by_name: "admin",
  created_by: "admin",
  reference_summary: { total: 0, previews: [], truncated: false },
  created_at: "2026-09-06T00:00:00Z",
  updated_at: "2026-09-06T00:00:00Z"
};

beforeEach(() => update.mockReset());

describe("编辑标注", () => {
  it("圆标隐藏时仍展示保存的前导0标注供编辑", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EditEntryAnnotation
          entry={{ ...entry, annotation: "007", annotation_visible: false }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>
    );
    expect(screen.getByLabelText("center标注")).toHaveValue("007");
    expect(update).not.toHaveBeenCalled();
  });

  it("失败保留输入、重试成功后失效列表和详情缓存", async () => {
    update
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce({
        entry_id: "entry",
        annotation: "002",
        annotation_revision: 2
      });
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const close = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <EditEntryAnnotation entry={entry} onClose={close} />
      </QueryClientProvider>
    );
    fireEvent.change(screen.getByLabelText("center标注"), {
      target: { value: " 002 " }
    });
    fireEvent.click(screen.getByText("保存标注"));
    await screen.findByText(/保存失败/);
    expect(screen.getByLabelText("center标注")).toHaveValue(" 002 ");
    fireEvent.click(screen.getByText("保存标注"));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(update).toHaveBeenLastCalledWith("entry", {
      annotation: "002",
      base_annotation_revision: 1
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin-words"] });
  });

  it("修订冲突展示最新标注，用户再次确认后使用新revision", async () => {
    update
      .mockRejectedValueOnce(
        new HttpError(409, "conflict", [], "annotation_conflict", [], {
          annotation_conflict: {
            reason: "revision_conflict",
            groups: [],
            entries: [
              {
                entry_id: "entry",
                annotation: "003",
                annotation_revision: 2,
                presentation: entry.presentation,
                pos_labels: [],
                gloss_previews: [],
                updated_at: entry.updated_at,
                inbound_relations: {
                  total: 0,
                  by_type: { synonym: 0, antonym: 0, derivative: 0 },
                  previews: [],
                  truncated: false
                }
              }
            ]
          }
        })
      )
      .mockResolvedValueOnce({
        entry_id: "entry",
        annotation: "003",
        annotation_revision: 2
      });
    const close = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EditEntryAnnotation entry={entry} onClose={close} />
      </QueryClientProvider>
    );
    fireEvent.change(screen.getByLabelText("center标注"), {
      target: { value: "004" }
    });
    fireEvent.click(screen.getByText("保存标注"));
    await screen.findByText(/标注或原型分组已变化/);
    expect(screen.getByLabelText("center标注")).toHaveValue("003");
    expect(update).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("保存标注"));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(update).toHaveBeenLastCalledWith("entry", {
      annotation: "003",
      base_annotation_revision: 2
    });
  });
});
