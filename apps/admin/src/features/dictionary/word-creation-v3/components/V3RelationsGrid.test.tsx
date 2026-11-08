import { fireEvent, render, screen } from "@testing-library/react";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import type { InterfaceLocale } from "@tsz/shared/i18n";
import type { DraftMeaningsStepContentWritableV3 } from "@tsz/types";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { V3RelationsGrid } from "./V3RelationsGrid";

vi.mock("../../relatedSuggestions", () => ({
  useRelatedSuggestions: () => ({
    words: [],
    isFetching: false,
    isError: false,
    refetch: vi.fn()
  }),
  useRelatedWordSenses: () => ({
    data: undefined,
    isFetching: false,
    isError: false,
    refetch: vi.fn()
  })
}));

it("关联动作完整翻译，切换语言保留待关联输入、关系类型和稳定 ID", () => {
  const observe = vi.fn();
  const initial: DraftMeaningsStepContentWritableV3 = {
    sense_groups: [],
    pos: [
      {
        pos_id: "pos",
        grammar_structures: [],
        senses: [
          {
            id: "sense",
            sub_pos: "",
            level: "A1",
            depends_on_context: false,
            definitions: [],
            sentences: [],
            relations: []
          }
        ]
      }
    ]
  };
  function Host() {
    const [draft, setDraft] = useState(initial);
    return (
      <>
        <V3RelationsGrid
          sense={draft.pos[0]!.senses[0]!}
          posIndex={0}
          senseIndex={0}
          idFactory={() => "stable-relation"}
          change={(mutation) => {
            const next = structuredClone(draft);
            mutation(next);
            observe(next);
            setDraft(next);
          }}
        />
        <output data-testid="relations">{JSON.stringify(draft)}</output>
      </>
    );
  }
  const content = (locale: InterfaceLocale) => (
    <InterfaceI18nProvider locale={locale}>
      <Host />
    </InterfaceI18nProvider>
  );
  const view = render(content("en-GB"));
  expect(screen.getByText("No synonyms yet")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Add synonym" }));
  const input = screen.getByPlaceholderText("Search related entries");
  fireEvent.change(input, { target: { value: "keep" } });
  const snapshot = screen.getByTestId("relations").textContent;
  expect(JSON.parse(snapshot!).pos[0].senses[0].relations[0]).toMatchObject({
    id: "stable-relation",
    relation: "synonym",
    pending_target_headword: "keep"
  });
  observe.mockClear();
  for (const locale of ["zh-Hant", "en-US", "zh-Hans"] as const) {
    view.rerender(content(locale));
    expect(screen.getByDisplayValue("keep")).toBe(input);
    expect(screen.getByTestId("relations").textContent).toBe(snapshot);
    expect(observe).not.toHaveBeenCalled();
  }
});
