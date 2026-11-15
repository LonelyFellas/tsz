import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { useAuthStore } from "@/lib/auth";
import type { NextSentence } from "@tsz/types";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import { SenseSentenceExamples } from "./SenseSentenceExamples";
vi.mock("./NextSentenceEditor", () => ({
  sentenceStyles: { balanced_fluency: "均衡意译" },
  NextSentenceEditor: ({ source }: { source: NextSentence }) => (
    <output aria-label="编辑资源">
      {source.revision}:{source.reference_count}
    </output>
  )
}));
const source: NextSentence = {
  id: "example",
  owner_id: "actor",
  target_language: "en",
  revision: 1,
  reference_count: 0,
  updated_at: "2026-11-15T00:00:00Z",
  draft: {
    schema_version: 1,
    variants: [
      {
        id: "uk",
        locale: "en-GB",
        level: "A2",
        content: { version: 2, text: "Shared example", annotations: [] },
        translations: []
      }
    ]
  }
};
it("打开编辑前重新读取资源修订和共享范围，读取期间不打开旧缓存", async () => {
  useAuthStore.setState({
    profile: {
      id: "actor",
      phone: "test-only",
      display_name: "Test",
      role: "super_admin",
      permission_version: 1,
      catalog_version: "test",
      permissions: [],
      preferences: { dialect: "uk" }
    }
  });
  let finish!: (value: NextSentence) => void;
  const sentence = vi
    .fn()
    .mockResolvedValueOnce(source)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
  const requests = { sentence } as unknown as LexiconNextRequests;
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <SenseSentenceExamples
        ids={[source.id]}
        target="en-GB"
        medium="zh-Hans"
        disabled={false}
        requests={requests}
        onChange={vi.fn()}
      />
    </QueryClientProvider>
  );
  const edit = await screen.findByRole("button", { name: "编辑例句" });
  fireEvent.click(edit);
  await waitFor(() => expect(sentence).toHaveBeenCalledTimes(2));
  expect(screen.queryByLabelText("编辑资源")).toBeNull();
  expect(edit).toBeDisabled();
  expect(screen.getByRole("button", { name: "移除引用" })).toBeDisabled();
  await act(async () => finish({ ...source, revision: 2, reference_count: 2 }));
  expect(await screen.findByLabelText("编辑资源")).toHaveTextContent("2:2");
});
