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
});

describe("WordCreatePage", () => {
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
    render(
      <MemoryRouter initialEntries={["/words/new"]}>
        <Routes>
          <Route
            path="/words/new"
            element={<WordCreatePage requests={requests} />}
          />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(wired.props?.requests).toBe(requests);
    fireEvent.click(screen.getByText(action));
    expect(screen.getByTestId("location")).toHaveTextContent(expected);
  });

  it("Pending 创建目标预填词头并在创建后保留 gloss 与 returnTo", () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/words/create",
            state: {
              pendingSentenceTarget: {
                associationId: "association-1",
                headword: "center of the wall",
                gloss: "墙的中心位置",
                returnTo: "/words/source/v3/wizard/meanings?mode=edit"
              }
            }
          }
        ]}
      >
        <Routes>
          <Route path="/words/create" element={<WordCreatePage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      (
        wired.props as typeof wired.props & {
          initialPendingTarget?: unknown;
        }
      )?.initialPendingTarget
    ).toEqual({
      associationId: "association-1",
      headword: "center of the wall",
      gloss: "墙的中心位置",
      returnTo: "/words/source/v3/wizard/meanings?mode=edit"
    });
    fireEvent.click(screen.getByText("完成短语创建"));
    expect(screen.getByTestId("location")).toHaveTextContent(
      '/words/created-phrase-v3/v3/wizard/forms|{"creationSource":"blank","pendingSentenceTarget":{"associationId":"association-1","headword":"center of the wall","gloss":"墙的中心位置","returnTo":"/words/source/v3/wizard/meanings?mode=edit"}}'
    );
  });
});
