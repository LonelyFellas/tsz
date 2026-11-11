import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { EntryList } from "../../apps/admin/src/features/lexicon-next/EntryList";
import { api, useAuthStore } from "../../apps/admin/src/lib/auth";
import { Button } from "../../packages/ui/src/admin/display";
import "../../apps/admin/src/globals.css";
import "./preview.css";

useAuthStore.setState({
  profile: {
    id: "preview-editor",
    phone: "local-fixture",
    display_name: "本地预览",
    role: "admin",
    permission_version: 1,
    catalog_version: "preview",
    permissions: ["words.access", "words.create", "words.edit"],
    preferences: { dialect: "uk" }
  }
});
const samples = [
  ["centre", "word", "中心；中央；中心点", ["noun", "verb"]],
  ["serendipity", "word", "意外发现美好事物的机缘；不期而遇的幸运", ["noun"]],
  ["take into account", "phrase", "考虑到；把……计算在内", []],
  ["resilient", "word", "有适应力的；能迅速恢复的", ["adjective"]],
  ["a breath of fresh air", "phrase", "令人耳目一新的人或事物", []],
  [
    "extraordinarily long entry for checking line wrapping in the table",
    "phrase",
    "用于检查长词条换行与操作列显示的本地样例",
    []
  ]
].map(([headword, kind, gloss, part_of_speech], index) => ({
  id: `preview-${index}`,
  owner_id: "preview-editor",
  headword,
  kind,
  gloss,
  part_of_speech,
  target_language: "en",
  revision: 1,
  updated_at: "2026-11-11T08:20:00Z"
}));

function PreviewPage() {
  const initialQuery = new URLSearchParams(window.location.search);
  const scenario = initialQuery.get("scenario");
  initialQuery.delete("scenario");
  const [setup] = useState(() => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    const router = createMemoryRouter(
      [
        {
          path: "/lexicon-next",
          element: (
            <EntryList
              requests={{
                ...api.lexiconNext,
                list: async (query) => {
                  if (scenario === "请求失败")
                    throw new Error("无法连接词库服务，请重试。");
                  const items =
                    scenario === "无数据"
                      ? []
                      : samples.filter(
                          (row) =>
                            (!query.headword ||
                              String(row.headword).includes(query.headword)) &&
                            (!query.kind || row.kind === query.kind)
                        );
                  return {
                    items: items.slice(
                      ((query.page ?? 1) - 1) * (query.page_size ?? 20),
                      (query.page ?? 1) * (query.page_size ?? 20)
                    ),
                    pagination: {
                      total: items.length,
                      page: query.page ?? 1,
                      page_size: query.page_size ?? 20,
                      total_pages: Math.ceil(
                        items.length / (query.page_size ?? 20)
                      )
                    }
                  };
                }
              }}
            />
          )
        },
        {
          path: "*",
          element: (
            <div className="preview-destination">
              <h2>页面入口已验证</h2>
              <p>本地样例仅预览列表，不创建或保存词条。</p>
              <Button onClick={() => router.navigate("/lexicon-next")}>
                返回列表
              </Button>
            </div>
          )
        }
      ],
      { initialEntries: [`/lexicon-next?${initialQuery}`] }
    );
    return { client, router };
  });
  return (
    <main className="preview-page">
      <QueryClientProvider client={setup.client}>
        <RouterProvider router={setup.router} />
      </QueryClientProvider>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<PreviewPage />);
