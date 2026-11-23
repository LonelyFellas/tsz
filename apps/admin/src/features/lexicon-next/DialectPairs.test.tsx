import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { api } from "@/lib/auth";
import { DialectEditor } from "./DialectPairs";
import { generalSense } from "./model";
import {
  focusPublicationIssue,
  publicationIssueLocation
} from "./publicationIssueFocus";

it.each(["dialect_pairs", "relations"])(
  "没有 %s 字段锚点时定位词义不改变方言配对",
  async (field) => {
    const row = {
      ...generalSense("sense"),
      usage: "en-US" as const,
      paired: true
    };
    const draft = {
      schema_version: 1 as const,
      headword: "apartment",
      forms: [],
      senses: []
    };
    const update = vi.fn(),
      done = vi.fn();
    const ui = render(
      <div data-v3-node-id="sense" data-v3-field="sense" tabIndex={-1}>
        <DialectEditor
          row={row}
          onChange={update}
          draft={draft}
          localTargets={[]}
          entryId="source"
          medium="zh-Hans"
          requests={api.lexiconNext}
          disabled={false}
        />
      </div>
    );
    const previousScroll = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    try {
      focusPublicationIssue(
        publicationIssueLocation(
          draft,
          { node_id: "sense", field, message: "" },
          "en-US"
        ),
        new AbortController().signal,
        done
      );
      await waitFor(() => expect(done).toHaveBeenCalledOnce());
      expect(ui.container).toContainElement(
        document.activeElement as HTMLElement
      );
      expect(update).not.toHaveBeenCalled();
    } finally {
      HTMLElement.prototype.scrollIntoView = previousScroll;
    }
  }
);

it("只为专用词义展示另一方言；切换用法不沿用上一侧的无对应说明", () => {
  function Editor() {
    const [row, setRow] = useState(() => generalSense("source-sense"));
    return (
      <DialectEditor
        row={row}
        onChange={setRow}
        draft={{ schema_version: 1, headword: "flat", forms: [], senses: [] }}
        localTargets={[]}
        entryId="source"
        medium="zh-Hans"
        requests={api.lexiconNext}
        disabled={false}
      />
    );
  }
  render(<Editor />);
  expect(screen.getByRole("radio", { name: "英美通用" })).toBeChecked();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "英式专用" }));
  expect(screen.getByRole("group", { name: "对应的美式词义" })).toBeVisible();
  fireEvent.click(screen.getByRole("checkbox", { name: "确认无对应词义" }));
  fireEvent.change(screen.getByRole("textbox", { name: "无对应词义的说明" }), {
    target: { value: "仅限英式用法" }
  });
  fireEvent.click(screen.getByRole("radio", { name: "美式专用" }));
  expect(screen.getByRole("group", { name: "对应的英式词义" })).toBeVisible();
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("textbox")).toHaveValue("");
  fireEvent.click(screen.getByRole("radio", { name: "英美通用" }));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});

it("同一草稿内已选的目标词义不能再选，解除后可重新选用", async () => {
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
  fireEvent.click(screen.getByRole("button", { name: "选择对应词义" }));
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
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "配对词义" }));
  fireEvent.click(
    await screen.findByText(/noun · 公寓 · 已被配对/, {
      selector: ".ui-select-item-option-content"
    })
  );
  expect(screen.getByRole("button", { name: "选用此词义" })).toBeDisabled();
  ui.rerender(editor([]));
  fireEvent.click(
    await screen.findByText("noun · 公寓", {
      selector: ".ui-select-item-option-content"
    })
  );
  fireEvent.click(screen.getByRole("button", { name: "选用此词义" }));
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({
      target: expect.objectContaining({ sense_id: target, revision: 7 })
    })
  );
});
