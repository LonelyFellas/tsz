import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wordKeys } from "@/features/dictionary/api";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedCreateEntryStep } from "@/features/dictionary/word-creation/UnifiedCreateEntryStep";

const wired = vi.hoisted(() => ({
  props: undefined as ComponentProps<typeof UnifiedCreateEntryStep> | undefined
}));

vi.mock("@/features/dictionary/word-creation/UnifiedCreateEntryStep", () => ({
  UnifiedCreateEntryStep: (
    props: ComponentProps<typeof UnifiedCreateEntryStep>
  ) => {
    wired.props = props;
    return (
      <>
        <button
          onClick={() =>
            props.onCreated(
              {
                schema_version: 3,
                id: "created-v3"
              } as never,
              { creationSource: "dictionary" }
            )
          }
        >
          完成单词创建
        </button>
        <button
          onClick={() =>
            props.onCreated(
              {
                schema_version: 3,
                id: "created-phrase-v3",
                kind: "phrase"
              } as never,
              { creationSource: "blank" }
            )
          }
        >
          完成短语创建
        </button>
      </>
    );
  }
}));

import type { UnifiedCreateRequests } from "@/features/dictionary/word-creation/UnifiedCreateEntryStep";
import { WordCreatePage } from "./WordCreate";
import { useAuthStore } from "@/lib/auth";

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}|{JSON.stringify(location.state)}
    </output>
  );
}

beforeEach(() => {
  wired.props = undefined;
  useAuthStore.setState({
    profile: {
      id: "super-admin",
      phone: "13800138000",
      display_name: "测试超管",
      role: "super_admin",
      can_publish_lexicon: true,
      permissions: ["words.access"],
      preferences: { dialect: "uk" }
    }
  });
});

describe("WordCreatePage", () => {
  it("普通管理员直接进入创建页会返回列表，不挂载创建表单", () => {
    useAuthStore.setState({
      profile: {
        ...useAuthStore.getState().profile!,
        role: "admin",
        can_publish_lexicon: false
      }
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/words/new"]}>
          <Routes>
            <Route path="/words/new" element={<WordCreatePage />} />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/words|");
    expect(wired.props).toBeUndefined();
  });

  it.each([
    [
      "完成单词创建",
      '/words/created-v3/v3/wizard/forms|{"creationSource":"dictionary"}'
    ],
    [
      "完成短语创建",
      '/words/created-phrase-v3/v3/wizard/forms|{"creationSource":"blank"}'
    ]
  ])("按 canonical schema 进入对应原生编辑器", (action, expected) => {
    const requests = {} as UnifiedCreateRequests;
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 60_000 } }
    });
    const listKey = wordKeys.list({ page: 1 });
    client.setQueryData(listKey, {
      annotation: "1",
      annotation_visible: false
    });
    client.setQueryData(wordKeys.detail("existing"), {
      annotation_revision: 1
    });
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(false);
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/words/new"]}>
          <Routes>
            <Route
              path="/words/new"
              element={<WordCreatePage requests={requests} />}
            />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(wired.props?.requests).toBe(requests);
    fireEvent.click(screen.getByText(action));
    expect(screen.getByTestId("location")).toHaveTextContent(expected);
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(
      client.getQueryState(wordKeys.detail("existing"))?.isInvalidated
    ).toBe(true);
  });
});
