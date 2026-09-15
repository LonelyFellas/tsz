import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { SharedSentence } from "@tsz/types";
import { V3ReviewSentences } from "./V3ReviewSentences";

const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/auth", () => ({ api: { sentences: { list } } }));
vi.mock("./components/V3EnglishTextPreview", () => ({
  V3EnglishTextPreview: ({
    value
  }: {
    value: { common: { value: { text: string } } };
  }) => <p>{value.common.value.text}</p>
}));

function sentence(id: string, text: string): SharedSentence {
  return {
    id,
    revision: 1,
    created_by: "admin",
    created_at: "",
    updated_at: "",
    entries: [],
    content: {
      annotations: [],
      sentence: {
        id,
        level: "B1",
        en_text: {
          mode: "unified",
          common: {
            id: `${id}-en`,
            origin: "manual",
            value: { version: 2, text, annotations: [] }
          }
        },
        zh_text_id: `${id}-zh`,
        zh_text: { version: 2, text: "中文例句", annotations: [] },
        zh_translations: [
          {
            id: `${id}-translation`,
            language: "zh",
            band: "balanced_fluency",
            content: { version: 2, text: "这是分层译文。", annotations: [] }
          }
        ],
        links: []
      }
    }
  };
}
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <V3ReviewSentences entryId="book" senseId="reserve" revision={3} />
    </QueryClientProvider>
  );
}

describe("词义预览的独立例句", () => {
  it("按词义分页，显示服务端总数、正文和分层译文", async () => {
    list
      .mockReset()
      .mockResolvedValueOnce({
        items: [sentence("one", "Book a room.")],
        total: 6
      })
      .mockResolvedValueOnce({
        items: [sentence("six", "Book a table.")],
        total: 6
      });
    mount();
    expect(await screen.findByText("Book a room.")).toBeVisible();
    expect(screen.getByText("这是分层译文。")).toBeVisible();
    expect(screen.getByText("6 条")).toBeVisible();
    expect(list).toHaveBeenCalledWith({
      entry_id: "book",
      sense_id: "reserve",
      page: 1,
      page_size: 5
    });
    fireEvent.click(screen.getByTitle("2"));
    expect(await screen.findByText("Book a table.")).toBeVisible();
    expect(screen.queryByText("Book a room.")).toBeNull();
    expect(list).toHaveBeenLastCalledWith({
      entry_id: "book",
      sense_id: "reserve",
      page: 2,
      page_size: 5
    });
  });
  it("加载失败显示重试，不伪装成零条或空状态", async () => {
    list
      .mockReset()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [], total: 0 });
    mount();
    expect(await screen.findByText("例句加载失败")).toBeVisible();
    expect(screen.queryByText("暂无关联例句")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /重\s*试/ }));
    await waitFor(() => expect(screen.getByText("暂无关联例句")).toBeVisible());
    expect(screen.getByText("0 条")).toBeVisible();
  });
});
