import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { api } from "@/lib/auth";
import { DialectEditor } from "./DialectPairs";
import { generalSense } from "./model";

it("同一草稿内已选的目标义项不能再选，解除后可重新选用", async () => {
  const target = "peer-sense";
  const draft = {
    schema_version: 1 as const,
    headword: "apartment",
    forms: [],
    senses: [
      {
        id: target,
        part_of_speech: "noun",
        definitions: [],
        equivalents: [{ id: "gloss", locale: "zh-Hans", text: "公寓" }]
      }
    ]
  };
  const requests = {
    ...api.lexiconNext,
    workspaceList: vi.fn().mockResolvedValue({
      items: [{ id: "peer", headword: "apartment", status: "draft" }],
      pagination: { total_pages: 1 }
    }),
    get: vi.fn().mockResolvedValue({
      id: "peer",
      revision: 7,
      draft,
      dialect_senses: [{ ...generalSense(target), usage: "en-US" }]
    })
  };
  const update = vi.fn(),
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const editor = (occupied: string[]) => (
    <QueryClientProvider client={client}>
      <DialectEditor
        localTargets={occupied}
        entryId="source"
        row={{ ...generalSense("second"), usage: "en-GB" }}
        draft={draft}
        medium="zh-Hans"
        requests={requests}
        disabled={false}
        onChange={update}
      />
    </QueryClientProvider>
  );
  const ui = render(editor([target]));
  fireEvent.click(screen.getByRole("button", { name: "选择配对词义" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索配对词条" }), {
    target: { value: "apartment" }
  });
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "配对词条" }));
  fireEvent.click(
    await screen.findByText("apartment", {
      selector: ".ui-select-item-option-content"
    })
  );
  await waitFor(() => expect(requests.get).toHaveBeenCalledWith("peer"));
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "配对义项" }));
  fireEvent.click(
    await screen.findByText(/noun · 公寓 · 已被配对/, {
      selector: ".ui-select-item-option-content"
    })
  );
  expect(screen.getByRole("button", { name: "选用此义项" })).toBeDisabled();
  ui.rerender(editor([]));
  fireEvent.click(
    await screen.findByText("noun · 公寓", {
      selector: ".ui-select-item-option-content"
    })
  );
  fireEvent.click(screen.getByRole("button", { name: "选用此义项" }));
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({
      target: expect.objectContaining({ sense_id: target, revision: 7 })
    })
  );
});
