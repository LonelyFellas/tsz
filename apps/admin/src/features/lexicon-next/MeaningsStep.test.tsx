import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { NextDraft } from "@tsz/types";
import { App } from "@tsz/ui/admin/overlays";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { partOfSpeechDataSource } from "@/features/dictionary/dataSource";
import { partOfSpeechCatalogFixture } from "@/features/dictionary/word-creation/partOfSpeech.test.helper";
import { MeaningsStep } from "./MeaningsStep";

it("确认删除义项只移除目标，保留弹窗打开期间回写的草稿和音频", async () => {
  const initial: NextDraft = {
    schema_version: 1,
    headword: "centre",
    forms: [],
    senses: [
      {
        id: "remove",
        part_of_speech: "noun",
        definitions: [],
        equivalents: []
      },
      {
        id: "keep",
        part_of_speech: "noun",
        definitions: [],
        equivalents: []
      }
    ],
    form_editor: { forms_format: "shared_v1", contents: [], pos: [] }
  };
  const updated = structuredClone(initial);
  updated.headword = "center";
  updated.form_editor!.contents = [
    {
      id: "content",
      dialect_rules: { spelling_mode: "unified", phonetic_mode: "unified" },
      regional_variants: {
        mode: "common",
        common: {
          id: "variant",
          spelling: "center",
          origin: "manual",
          pronunciations: [
            {
              id: "pronunciation",
              style: "normal",
              dict_phonetic: "",
              actual_pron: "",
              voice_profile: {
                voices: [
                  {
                    voice_id: "voice",
                    enabled: true,
                    rate_percent: 0,
                    audio_asset_id: "audio"
                  }
                ]
              }
            }
          ]
        }
      }
    }
  ];
  let completeBackgroundUpdate!: () => void;
  function Harness() {
    const [draft, setDraft] = useState(initial);
    completeBackgroundUpdate = () => setDraft(updated);
    return (
      <>
        <MeaningsStep
          value={draft}
          kind="word"
          formEditorAvailable={false}
          target="en-GB"
          medium="zh-Hans"
          partOfSpeechCodes={["noun"]}
          disabled={false}
          onChange={setDraft}
        />
        <output aria-label="当前草稿">{JSON.stringify(draft)}</output>
      </>
    );
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App>
        <Harness />
      </App>
    </QueryClientProvider>
  );
  fireEvent.click(screen.getAllByRole("button", { name: "删除义项" })[0]!);
  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByText("删除义项 1？")).toBeVisible();
  act(() => completeBackgroundUpdate());
  expect(JSON.parse(screen.getByLabelText("当前草稿").textContent!)).toEqual(
    updated
  );
  fireEvent.click(dialog.getByRole("button", { name: "删除义项" }));
  expect(JSON.parse(screen.getByLabelText("当前草稿").textContent!)).toEqual({
    ...updated,
    senses: [updated.senses[1]]
  });
});

it("新词库语法富文本与细分词性绑定，改绑保留引用并筛选候选", async () => {
  const catalog = vi
    .spyOn(partOfSpeechDataSource, "catalog")
    .mockResolvedValue(partOfSpeechCatalogFixture);
  const initial: NextDraft = {
    schema_version: 1,
    headword: "job",
    forms: [],
    grammar_structures: [
      {
        id: "grammar",
        part_of_speech: "noun",
        sub_pos: "N-COUNT",
        variants: [
          {
            id: "gb",
            locale: "en-GB",
            content: {
              version: 2,
              text: "a job",
              annotations: [
                { type: "emphasis", start: 2, end: 5, level: "core" }
              ]
            }
          },
          {
            id: "us",
            locale: "en-US",
            content: { version: 2, text: "a role", annotations: [] }
          }
        ]
      }
    ],
    senses: [
      {
        id: "sense",
        part_of_speech: "noun",
        sub_pos: "N-COUNT",
        definitions: [
          {
            id: "def",
            locale: "zh-Hans",
            style: "definition",
            text: "工作",
            grammar_structure_id: "grammar"
          }
        ],
        equivalents: []
      }
    ]
  };
  function Harness() {
    const [value, setValue] = useState(initial);
    const [target, setTarget] = useState("en-GB");
    return (
      <>
        <button onClick={() => setTarget("en-US")}>切换美式</button>
        <MeaningsStep
          value={value}
          kind="word"
          formEditorAvailable={false}
          grammarAvailable
          target={target}
          medium="zh-Hans"
          partOfSpeechCodes={["noun"]}
          disabled={false}
          onChange={setValue}
        />
        <output aria-label="语法草稿">{JSON.stringify(value)}</output>
      </>
    );
  }
  try {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <App>
          <Harness />
        </App>
      </QueryClientProvider>
    );
    const binding = await screen.findByRole("combobox", {
      name: "语法结构 1 细分词性"
    });
    expect(screen.getByText("job", { selector: "strong" })).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "编辑语法结构 1 英式英语内容" })
      ).toBeEnabled()
    );
    fireEvent.click(
      screen.getByRole("button", { name: "编辑语法结构 1 英式英语内容" })
    );
    const toolbar = await screen.findByRole(
      "toolbar",
      { name: "标注工具栏" },
      { timeout: 10_000 }
    );
    const dialog = toolbar.closest('[role="dialog"]') as HTMLElement;
    const editor = within(dialog).getByRole("textbox", {
      name: "语法结构 1 英式英语内容"
    });
    fireEvent.input(editor, {
      target: { value: "a new job" },
      inputType: "insertText"
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(
      JSON.parse(screen.getByLabelText("语法草稿").textContent!)
        .grammar_structures
    ).toEqual(initial.grammar_structures);
    fireEvent.click(screen.getByRole("button", { name: "切换美式" }));
    expect(screen.getByText("a role")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "编辑语法结构 1 美式英语内容" })
    ).toBeVisible();
    fireEvent.mouseDown(binding);
    const option = await screen.findByText("不可数名词", {
      selector: ".ui-select-item-option-content"
    });
    fireEvent.click(option);
    const saved = JSON.parse(screen.getByLabelText("语法草稿").textContent!);
    expect(saved.grammar_structures[0].sub_pos).toBe("N-UNCOUNT");
    expect(saved.grammar_structures[0].variants).toEqual(
      initial.grammar_structures![0]!.variants
    );
    expect(saved.senses[0].definitions[0].grammar_structure_id).toBe("grammar");
    expect(
      screen
        .getByRole("combobox", { name: "简体中文解释 1 语法结构" })
        .closest(".ui-select")
    ).toHaveTextContent("细分词性不匹配");
  } finally {
    catalog.mockRestore();
  }
}, 15_000);
