import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import type { NextSentence } from "@tsz/types";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import { SentenceReadingPreview } from "./SentenceReadingPreview";
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  usePermission: () => true
}));
vi.mock("@/features/dictionary/word-creation/PronunciationPreview", () => ({
  PronunciationPreviewProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  PronunciationPreviewControls: () => null
}));
const resource = (id: string, level: string): NextSentence => ({
  id,
  revision: 1,
  owner_id: "actor",
  target_language: "en",
  updated_at: "2026-11-15T00:00:00Z",
  reference_count: 1,
  draft: {
    schema_version: 1,
    variants: [
      {
        id: `variant-${id}`,
        locale: "en-GB",
        level,
        content: { version: 2, text: `${id} example.`, annotations: [] },
        translations: [0, 50, 100].map((freedom) => ({
          id: `${id}-${freedom}`,
          locale: "zh-Hans",
          style: "balanced_fluency",
          metadata: { freedom, sources: [] },
          content: { version: 2, text: `${id}译文${freedom}`, annotations: [] }
        }))
      }
    ]
  }
});
function setup(
  sentence = vi.fn(async (id: string) =>
    resource(id, id === "low" ? "A1" : "B1")
  )
) {
  const requests = {
    sentence,
    equivalentCatalog: vi.fn(async () => ({ registers: [], domains: [] }))
  } as unknown as LexiconNextRequests;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={client}>
      <SentenceReadingPreview
        ids={["low", "high"]}
        senseLevel="B1"
        target="en-GB"
        medium="zh-Hans"
        requests={requests}
      />
    </QueryClientProvider>
  );
  return { requests, client };
}
it("等级切换保留译文选择；滑块和键盘只选择已有译文，不发写请求", async () => {
  const { requests } = setup();
  await screen.findByText("high example.");
  expect(screen.getByText("high译文50")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "切换译文" }));
  expect(screen.getByText("high译文100")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "A1 · 1" }));
  await screen.findByText("low example.");
  fireEvent.click(screen.getByRole("button", { name: "B1 · 1" }));
  expect(screen.getByText("high译文100")).toBeVisible();
  fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowLeft" });
  expect(screen.getByText("high译文50")).toBeVisible();
  fireEvent.change(screen.getByRole("slider"), { target: { value: "8" } });
  expect(screen.getByText("high译文0")).toBeVisible();
  expect(requests.sentence).toHaveBeenCalledTimes(2);
});
it("加载失败显示重试，成功后显示原文", async () => {
  const sentence = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockImplementation(async (id: string) =>
      resource(id, id === "low" ? "A1" : "B1")
    );
  setup(sentence);
  await screen.findByText("例句加载失败");
  expect(screen.queryByText("当前筛选条件下暂无例句")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await screen.findAllByText("high example.");
});
