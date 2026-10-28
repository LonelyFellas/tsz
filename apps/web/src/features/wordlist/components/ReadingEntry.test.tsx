import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import type {
  WordlistEntry,
  WordlistForm,
  WordlistDefinition
} from "@tsz/types";
import { ReadingEntry, ReadingTable } from "./ReadingEntry";
import { richReadingEntries } from "./readingEntry.fixture";
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
function Entry(props: ComponentProps<typeof ReadingEntry>) {
  return (
    <ReadingTable full={props.full ?? false} simple={props.simple}>
      <tbody>
        <ReadingEntry {...props} />
      </tbody>
    </ReadingTable>
  );
}
it("full mode groups forms once per basic part of speech and shows only the first pronunciation", () => {
  const view = render(
    <Entry entry={readingEntry} level="A1" variant="BrE" full />
  );
  expect(screen.getAllByRole("columnheader")).toHaveLength(6);
  expect(screen.getByRole("heading", { name: "VERB" })).toBeVisible();
  const firstSense = screen.getByText("释义-a1").closest("tr")!;
  expect(within(firstSense).getByText("语法-a1")).toBeVisible();
  expect(
    screen.getByText("释义-a1").closest("[data-text-role]")
  ).toHaveAttribute("data-text-role", "definition");
  expect(
    screen.getByText("语法-a1").closest("[data-text-role]")
  ).toHaveAttribute("data-text-role", "body");
  expect(screen.queryByText("语法-c2")).not.toBeInTheDocument();
  expect(screen.getByText("暂无适合当前等级的释义")).toBeVisible();
  const forms = screen.getByText("general-UK").closest("td")!;
  expect(forms).not.toHaveAttribute("rowspan");
  expect(
    within(firstSense).queryByText("dedicated-UK")
  ).not.toBeInTheDocument();
  const secondSense = screen.getByText("不及物").closest("tr")!;
  expect(within(secondSense).getByText("dedicated-UK")).toBeVisible();
  expect(screen.getAllByText("general-UK")).toHaveLength(1);
  expect(screen.queryByText("general-US")).not.toBeInTheDocument();
  expect(screen.getAllByText("/riːd/").length).toBeGreaterThan(0);
  expect(screen.queryByText("/red/")).not.toBeInTheDocument();
  expect(screen.queryByText(/读音 \d/)).not.toBeInTheDocument();
  expect(view.container.textContent).not.toContain("//riːd//");
  view.rerender(<Entry entry={readingEntry} level="C2" variant="AmE" full />);
  expect(screen.getByText("释义-c2")).toBeVisible();
  expect(screen.getByText("语法-c2")).toBeVisible();
  expect(screen.getByText("dedicated-US")).toBeVisible();
  expect(screen.queryByText("general-UK")).not.toBeInTheDocument();
});
it("standard mode has four columns with abbreviated basic parts of speech and aligned senses", () => {
  const entry = {
    ...readingEntry,
    pos: [
      ...readingEntry.pos,
      {
        pos_id: "noun",
        pos: "noun",
        label: "名词",
        senses: [
          {
            id: "noun-sense",
            sub_pos: "countable",
            level: "A1",
            definitions: [def("noun", "A1")]
          }
        ],
        grammar_structures: []
      }
    ]
  };
  render(<Entry entry={entry} level="C2" variant={null} />);
  expect(screen.getAllByRole("columnheader")).toHaveLength(4);
  expect(screen.getByRole("heading", { name: "v." })).toBeVisible();
  expect(screen.getByRole("heading", { name: "n." })).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "read" }).closest("td")
  ).toHaveAttribute("rowspan", "3");
  const secondSense = screen.getByText("释义-b2").closest("tr")!;
  expect(within(secondSense).getByText("语法-b2")).toBeVisible();
  expect(screen.queryByText("及物")).not.toBeInTheDocument();
  expect(screen.queryByText("词形变化")).not.toBeInTheDocument();
  expect(screen.queryByText("general-UK")).not.toBeInTheDocument();
  expect(screen.queryByText("/riːd/")).not.toBeInTheDocument();
});
it("简洁模式保留全部义项、等级和词性合并，并按偏好选择富文本释义", () => {
  const view = render(
    <Entry entry={readingEntry} level="A1" variant="BrE" simple />
  );
  expect(screen.getByRole("table", { name: "简洁模式词条列表" })).toBeVisible();
  expect(
    screen.getAllByRole("columnheader").map((cell) => cell.textContent)
  ).toEqual(["英文词条", "词性", "多维释义"]);
  expect(
    screen.getByRole("heading", { name: "read" }).closest("td")
  ).toHaveAttribute("rowspan", "2");
  expect(
    screen.getByRole("heading", { name: "v." }).closest("td")
  ).toHaveAttribute("rowspan", "2");
  expect(screen.getByText("释义-a1")).toBeVisible();
  expect(screen.getByText("A1")).toBeVisible();
  expect(screen.getByText("暂无适合当前等级的释义")).toBeVisible();
  expect(screen.queryByText("语法-a1")).not.toBeInTheDocument();
  expect(screen.queryByText("词形变化")).not.toBeInTheDocument();
  expect(screen.queryByText("及物")).not.toBeInTheDocument();

  view.rerender(
    <ReadingTable full={false} simple>
      {richReadingEntries.map((entry) => (
        <tbody key={entry.entry_id}>
          <ReadingEntry entry={entry} level="C2" variant="BrE" simple />
        </tbody>
      ))}
    </ReadingTable>
  );
  expect(view.container.querySelectorAll("tbody tr")).toHaveLength(16);
  const phrase = screen
    .getByRole("heading", { name: "work out" })
    .closest("tbody")!;
  expect(within(phrase).getByRole("heading", { name: "v." })).toBeVisible();
  expect(within(phrase).getByRole("heading", { name: "n." })).toBeVisible();
  const definition = screen
    .getByRole("heading", { name: "center" })
    .closest("tr")!
    .querySelector('[data-text-role="definition"]')!;
  expect(definition.querySelector(".tsz-ve-bold")).toHaveTextContent("为中心");
  expect(definition.querySelector(".tsz-ve-italic")).toHaveTextContent("重点");
});
it("preserves rich definitions, grammar annotations and all sense rows in both modes", () => {
  const content = (full: boolean) => (
    <ReadingTable full={full}>
      {richReadingEntries.map((entry) => (
        <tbody key={entry.entry_id}>
          <ReadingEntry entry={entry} level="C2" variant="BrE" full={full} />
        </tbody>
      ))}
    </ReadingTable>
  );
  const view = render(content(false));
  const verify = (full: boolean) => {
    expect(view.container.querySelectorAll("tbody tr")).toHaveLength(16);
    const phrase = screen
      .getByRole("heading", { name: "work out" })
      .closest("tbody")!;
    expect(
      within(phrase).getByRole("heading", { name: full ? "VERB" : "v." })
    ).toBeVisible();
    expect(
      within(phrase).getByRole("heading", { name: full ? "NOUN" : "n." })
    ).toBeVisible();
    expect(phrase.textContent).not.toMatch(/phrase_|PHRASE_/);
    expect(
      screen.getByRole("heading", { name: "center" }).closest("td")
    ).toHaveAttribute("rowspan", "7");
    const firstRow = screen
      .getByRole("heading", { name: "center" })
      .closest("tr")!;
    const readers = within(firstRow).getAllByTestId("voice-rich-text-readonly");
    const definition = readers.find(
      (reader) => reader.dataset.textRole === "definition"
    )!;
    expect(definition.querySelector(".tsz-ve-bold")).toHaveTextContent(
      "为中心"
    );
    expect(definition.querySelector(".tsz-ve-italic")).toHaveTextContent(
      "重点"
    );
    const grammar = readers.find((reader) =>
      reader.textContent?.startsWith("something")
    )!;
    expect(grammar).toHaveTextContent("The discussion centers on education.");
    expect(grammar.querySelector('[data-level="function"]')).toHaveTextContent(
      "something"
    );
    expect(grammar.querySelector('[data-level="core"]')).toHaveTextContent(
      "center"
    );
    expect(
      Array.from(
        grammar.querySelectorAll('[data-level="grammar"]'),
        (node) => node.textContent
      ).join("")
    ).toBe("on");
    expect(grammar.querySelector(".tsz-ve-bold")).toHaveTextContent(
      "education"
    );
    expect(grammar.querySelector(".tsz-ve-italic")).toHaveTextContent(
      "discussion"
    );
    expect(grammar.querySelector(".tsz-ve-underline")).toHaveTextContent(
      "education"
    );
    expect(grammar.querySelectorAll('[data-color="yellow"]')).toHaveLength(2);
    expect(
      grammar.querySelectorAll('[data-color="yellow"]')[1]
    ).toHaveTextContent("education");
    expect(grammar.querySelector('[data-phoneme="ˈsentəz"]')).not.toBeNull();
    expect(grammar.querySelectorAll(".tsz-ve-liaison-anchor")).toHaveLength(2);
    expect(screen.getByText("0.3 s")).toHaveAttribute(
      "data-duration-ms",
      "300"
    );
    expect(view.container.querySelector(".is-invalid")).toBeNull();
    expect(view.container.querySelector("[contenteditable]")).toBeNull();
    expect(screen.queryByText("/SECOND-READING/")).not.toBeInTheDocument();
    expect(
      screen.getByText("一套；一组配套使用的物品。").closest("tr")
    ).toHaveTextContent("a set of keys / tools / instructions");
  };
  verify(false);
  view.rerender(content(true));
  verify(true);
});
it("phrase forms stay hidden and missing full data remains explicit", () => {
  const view = render(
    <Entry
      entry={{ ...readingEntry, kind: "phrase" }}
      level="C2"
      variant={null}
      full
    />
  );
  expect(screen.queryByText("general-UK")).not.toBeInTheDocument();
  expect(screen.getByText("及物")).toBeVisible();
  view.rerender(
    <Entry
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
