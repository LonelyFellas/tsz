import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import type {
  WordlistEntry,
  WordlistForm,
  WordlistDefinition
} from "@tsz/types";
import { ReadingEntry } from "./ReadingEntry";
const rich = (text: string) => ({
  version: 1 as const,
  text,
  spans: [],
  liaisons: []
});
const def = (id: string, level: string): WordlistDefinition => ({
  id,
  level,
  definition_mode: "zh_definition",
  grammar_structure_id: id,
  texts: [{ dialect: "common", content: rich(`释义-${id}`) }]
});
const form = (id: string, senses: string[]): WordlistForm => ({
  id,
  form_type: "base",
  label: `词形-${id}`,
  sense_ids: senses,
  variants: [
    {
      id: `${id}-uk`,
      dialect: "uk",
      spelling: `${id}-UK`,
      pronunciations: [
        { id: "one", dict_phonetic: "/riːd/" },
        { id: "two", dict_phonetic: "red" }
      ]
    },
    {
      id: `${id}-us`,
      dialect: "us",
      spelling: `${id}-US`,
      pronunciations: [{ id: "three", dict_phonetic: "ɹiːd" }]
    }
  ]
});
export const readingEntry: WordlistEntry = {
  entry_id: "entry",
  publication_id: "publication",
  label: "read",
  kind: "word",
  pos: [
    {
      pos_id: "pos",
      pos: "verb",
      label: "动词",
      forms: [
        form("general", ["sense-one", "sense-two"]),
        form("dedicated", ["sense-two"])
      ],
      senses: [
        {
          id: "sense-one",
          sub_pos: "transitive",
          sub_pos_label: "及物",
          level: "C2",
          definitions: [def("a1", "A1"), def("c2", "C2")]
        },
        {
          id: "sense-two",
          sub_pos: "intransitive",
          sub_pos_label: "不及物",
          level: "A1",
          definitions: [def("b2", "B2")]
        }
      ],
      grammar_structures: ["a1", "c2", "b2"].map((id) => ({
        id,
        variants: [{ dialect: "common", content: rich(`语法-${id}`) }]
      }))
    }
  ]
};
it("full mode preserves multiple pronunciations and dedicated sense mapping with selected grammar", () => {
  const view = render(
    <ReadingEntry entry={readingEntry} level="A1" variant="BrE" full />
  );
  expect(screen.getByText("释义-a1")).toBeVisible();
  expect(screen.getByText("语法-a1")).toBeVisible();
  expect(screen.queryByText("语法-c2")).not.toBeInTheDocument();
  expect(screen.getByText("暂无适合当前等级的释义")).toBeVisible();
  const firstSense = screen.getByText("及物").parentElement!;
  expect(within(firstSense).getByText("general-UK")).toBeVisible();
  expect(
    within(firstSense).queryByText("dedicated-UK")
  ).not.toBeInTheDocument();
  expect(screen.getByText("dedicated-UK")).toBeVisible();
  expect(screen.queryByText("general-US")).not.toBeInTheDocument();
  expect(screen.getAllByText("/riːd/").length).toBeGreaterThan(0);
  expect(screen.getAllByText("/red/").length).toBeGreaterThan(0);
  expect(view.container.textContent).not.toContain("//riːd//");
  view.rerender(
    <ReadingEntry entry={readingEntry} level="C2" variant="AmE" full />
  );
  expect(screen.getByText("释义-c2")).toBeVisible();
  expect(screen.getByText("语法-c2")).toBeVisible();
  expect(screen.getByText("dedicated-US")).toBeVisible();
  expect(screen.queryByText("general-UK")).not.toBeInTheDocument();
});
it("standard and phrase views do not display form rows; missing full data is explicit", () => {
  const view = render(
    <ReadingEntry entry={readingEntry} level="C2" variant={null} />
  );
  expect(screen.queryByText("词形变化")).not.toBeInTheDocument();
  view.rerender(
    <ReadingEntry
      entry={{ ...readingEntry, kind: "phrase" }}
      level="C2"
      variant={null}
      full
    />
  );
  expect(screen.queryByText("词形变化")).not.toBeInTheDocument();
  expect(screen.getByText("及物")).toBeVisible();
  view.rerender(
    <ReadingEntry
      entry={{
        ...readingEntry,
        pos: readingEntry.pos.map(({ forms: _forms, ...pos }) => pos)
      }}
      level="C2"
      variant={null}
      full
    />
  );
  expect(screen.getByRole("alert")).toHaveTextContent("完整内容暂不可用");
});
