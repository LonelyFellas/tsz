import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EnglishTextV3,
  WordSentenceWritableV3,
  WordSentenceTranslationV3
} from "@tsz/types";
import { SentenceEditor } from "./SentenceEditor";
import { api } from "@/lib/auth";

vi.mock("../dictionary/word-creation/PronunciationPreview", () => ({
  PronunciationPreviewProvider: ({
    children
  }: {
    children: import("react").ReactNode;
  }) => <>{children}</>
}));
vi.mock("@/lib/auth", () => ({
  api: {
    sentences: { create: vi.fn(), update: vi.fn() },
    words: {
      list: vi.fn().mockResolvedValue({
        words: [],
        page: { page: 1, page_size: 50, total: 0 }
      })
    }
  }
}));
vi.mock(
  "../dictionary/word-creation-v3/components/V3LinkedEnglishTextField",
  () => ({
    V3LinkedEnglishTextField: ({
      value,
      onChange
    }: {
      value: EnglishTextV3;
      onChange: (next: EnglishTextV3) => void;
    }) =>
      value.mode === "unified" ? (
        <textarea
          aria-label="英文"
          value={value.common.value.text}
          onChange={(e) =>
            onChange({
              ...value,
              common: {
                ...value.common,
                value: { version: 2, text: e.target.value, annotations: [] }
              }
            })
          }
        />
      ) : null
  })
);
vi.mock(
  "../dictionary/word-creation-v3/components/V3SentenceTranslationsField",
  () => ({
    V3SentenceTranslationsField: ({
      sentence,
      onChange
    }: {
      sentence: WordSentenceWritableV3;
      onChange: (next: WordSentenceTranslationV3[]) => void;
    }) => (
      <input
        aria-label="译文"
        value={sentence.zh_translations[0]?.content.text ?? ""}
        onChange={(e) =>
          onChange(
            sentence.zh_translations.map((t, i) =>
              i === 0
                ? {
                    ...t,
                    content: {
                      version: 2,
                      text: e.target.value,
                      annotations: []
                    }
                  }
                : t
            )
          )
        }
      />
    )
  })
);

function setup() {
  const saved = vi.fn();
  const close = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <App>
        <SentenceEditor
          sourceEntryId="source-entry"
          onClose={close}
          onSaved={saved}
        />
      </App>
    </QueryClientProvider>
  );
  return { saved, close };
}
function fill() {
  fireEvent.change(screen.getByLabelText("英文"), {
    target: { value: "A wonderful flower." }
  });
  fireEvent.change(screen.getByLabelText("译文"), {
    target: { value: "一朵美丽的花。" }
  });
}

describe("独立例句完成", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.words.list).mockResolvedValue({
      words: [],
      page: { page: 1, page_size: 50, total: 0 }
    });
  });
  it("输入及准备待关联都不写入，完成即带具体来源和标注独立发布", async () => {
    vi.mocked(api.sentences.create).mockResolvedValue({} as never);
    const { saved } = setup();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "flower" }));
    fireEvent.click(screen.getByText("词条未创建，记为待关联"));
    fireEvent.click(screen.getByRole("button", { name: /完\s*成/ }));
    expect(api.sentences.create).not.toHaveBeenCalled();
    expect(
      screen.getByText("请先确认当前句内标注，或取消所选片段。")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认这处标注" }));
    expect(api.sentences.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /完\s*成/ }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(api.sentences.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source_entry_id: "source-entry",
        content: expect.objectContaining({
          annotations: [
            expect.objectContaining({
              source_segments: [{ start: 12, end: 18, surface: "flower" }],
              target: {
                state: "pending",
                kind: "word",
                headword: "flower",
                gloss: null
              }
            })
          ]
        })
      })
    );
    expect(
      vi.mocked(api.sentences.create).mock.calls[0]![0].content.sentence
        .zh_translations
    ).toHaveLength(1);
  });
  it("失败保留输入，重试沿用相同创建 ID，不创建额外例句", async () => {
    vi.mocked(api.sentences.create)
      .mockRejectedValueOnce(new Error("网络中断"))
      .mockResolvedValueOnce({} as never);
    const { saved } = setup();
    fill();
    fireEvent.click(screen.getByRole("button", { name: /完\s*成/ }));
    await screen.findByText("网络中断");
    expect(screen.getByLabelText("英文")).toHaveValue("A wonderful flower.");
    expect(saved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /完\s*成/ }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(vi.mocked(api.sentences.create).mock.calls[0]![0]).toEqual(
      vi.mocked(api.sentences.create).mock.calls[1]![0]
    );
  });
  it("可以跨过前50个匹配结果选择具体词条", async () => {
    const targetId = "00000000-0000-4000-8000-000000000051";
    vi.mocked(api.words.list).mockImplementation(
      async (query) =>
        ({
          words: (query?.page === 2
            ? [51]
            : Array.from({ length: 50 }, (_, i) => i + 1)
          ).map((n) => ({
            id: n === 51 ? targetId : `result-${n}`,
            kind: "word",
            presentation: { label: `flower ${n}` },
            gloss: "花",
            annotation: null,
            status: "draft"
          })),
          page: { page: query?.page ?? 1, page_size: 50, total: 51 }
        }) as Awaited<ReturnType<typeof api.words.list>>
    );
    vi.mocked(api.sentences.create).mockResolvedValue({} as never);
    const { saved } = setup();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "flower" }));
    fireEvent.click(await screen.findByTitle("2"));
    await waitFor(() =>
      expect(api.words.list).toHaveBeenLastCalledWith({
        q: "flower",
        page: 2,
        page_size: 50
      })
    );
    fireEvent.mouseDown(screen.getByLabelText("选择具体词条"));
    fireEvent.click(await screen.findByText(/flower 51 ·/));
    fireEvent.click(screen.getByRole("button", { name: "确认这处标注" }));
    fireEvent.click(screen.getByRole("button", { name: /完\s*成/ }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(
      vi.mocked(api.sentences.create).mock.calls[0]![0].content.annotations[0]!
        .target
    ).toEqual({ state: "linked", target_entry_id: targetId });
  });
});
