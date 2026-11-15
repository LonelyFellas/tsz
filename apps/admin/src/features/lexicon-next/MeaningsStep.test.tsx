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
import { api } from "@/lib/auth";

vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  usePermission: () => true
}));

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
  fireEvent.click(screen.getAllByRole("button", { name: "删除词义 1" })[0]!);
  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByText("确定删除该词义吗？")).toBeVisible();
  act(() => completeBackgroundUpdate());
  expect(JSON.parse(screen.getByLabelText("当前草稿").textContent!)).toEqual(
    updated
  );
  fireEvent.click(dialog.getByRole("button", { name: "确认删除" }));
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

it("只读词义总体数据禁用输入、排序和键盘语境切换", async () => {
  const catalog = vi
    .spyOn(partOfSpeechDataSource, "catalog")
    .mockResolvedValue(partOfSpeechCatalogFixture);
  const onChange = vi.fn();
  const value: NextDraft = {
    schema_version: 1,
    headword: "job",
    forms: [],
    senses: [
      {
        id: "first",
        part_of_speech: "noun",
        level: "B2",
        frequency: "95.5",
        depends_on_context: false,
        definitions: [],
        equivalents: []
      },
      { id: "second", part_of_speech: "noun", definitions: [], equivalents: [] }
    ]
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App>
        <MeaningsStep
          value={value}
          kind="word"
          formEditorAvailable={false}
          senseMetadataAvailable
          target="en-GB"
          medium="zh-Hans"
          partOfSpeechCodes={["noun"]}
          disabled
          onChange={onChange}
        />
      </App>
    </QueryClientProvider>
  );
  expect(
    await screen.findByRole("spinbutton", { name: "释义 1 频率" })
  ).toBeDisabled();
  const toggle = screen.getByRole("switch", { name: "释义 1 是否依赖语境" });
  expect(toggle).toBeDisabled();
  fireEvent.keyDown(toggle.parentElement!, { key: "Enter" });
  fireEvent.keyDown(screen.getByRole("button", { name: "拖动词义 1" }), {
    key: "ArrowDown"
  });
  expect(screen.getByRole("button", { name: "删除词义 1" })).toBeDisabled();
  expect(onChange).not.toHaveBeenCalled();
  catalog.mockRestore();
});

it("已配置词性默认显示展开的词义与语法模板，切换英美保留同一草稿", async () => {
  const catalog = vi
    .spyOn(partOfSpeechDataSource, "catalog")
    .mockResolvedValue(partOfSpeechCatalogFixture);
  const initial: NextDraft = {
    schema_version: 1,
    headword: "centre",
    forms: [],
    senses: [],
    form_editor: {
      forms_format: "shared_v1",
      contents: [],
      pos: [{ pos_id: "noun", pos: "noun", forms: [], form_groups: [] }]
    }
  };
  function Harness() {
    const [draft, setDraft] = useState(initial);
    const [target, setTarget] = useState("en-GB");
    const [disabled, setDisabled] = useState(true);
    return (
      <>
        <button onClick={() => setTarget("en-US")}>切换美式</button>
        <button onClick={() => setDisabled(false)}>开启编辑</button>
        <MeaningsStep
          value={draft}
          kind="word"
          formEditorAvailable={false}
          grammarAvailable
          senseGroupsAvailable
          senseMetadataAvailable
          target={target}
          medium="zh-Hans"
          partOfSpeechCodes={["noun"]}
          disabled={disabled}
          onChange={setDraft}
        />
        <output aria-label="模板草稿">{JSON.stringify(draft)}</output>
      </>
    );
  }
  try {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App>
          <Harness />
        </App>
      </QueryClientProvider>
    );
    expect(JSON.parse(screen.getByLabelText("模板草稿").textContent!)).toEqual(
      initial
    );
    fireEvent.click(screen.getByRole("button", { name: "开启编辑" }));
    await screen.findByRole("combobox", { name: "语法结构 1 细分词性" });
    expect(
      screen.getByRole("button", { name: "添加英式英语释义" })
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "英式英语释义 1" })).toHaveValue(
      ""
    );
    expect(screen.getByRole("textbox", { name: "英式英语释义 2" })).toHaveValue(
      ""
    );
    expect(screen.getByRole("textbox", { name: "简体中文解释 1" })).toHaveValue(
      ""
    );
    expect(screen.getByRole("textbox", { name: "简体中文解释 2" })).toHaveValue(
      ""
    );
    expect(screen.getByRole("button", { name: "删除词义 1" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "删除语法结构 1" })
    ).toBeDisabled();
    const first: NextDraft = JSON.parse(
      screen.getByLabelText("模板草稿").textContent!
    );
    expect(first.senses).toHaveLength(1);
    expect(first.senses[0]).toMatchObject({
      part_of_speech: "noun",
      level: "A1",
      sense_group_id: first.sense_groups![0]!.id
    });
    expect(first.grammar_structures).toHaveLength(1);
    expect(
      first.grammar_structures![0]!.variants.map((row) => row.locale)
    ).toEqual(["en-GB", "en-US"]);
    fireEvent.click(screen.getByRole("button", { name: "切换美式" }));
    expect(
      await screen.findByRole("button", { name: "添加美式英语释义" })
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "美式英语释义 1" })).toHaveValue(
      ""
    );
    expect(screen.getByRole("textbox", { name: "美式英语释义 2" })).toHaveValue(
      ""
    );
    expect(JSON.parse(screen.getByLabelText("模板草稿").textContent!)).toEqual(
      first
    );
  } finally {
    catalog.mockRestore();
  }
});

it.each([false, true])(
  "未指定词性的空草稿不能新增语法结构或词义（词性编辑器：%s）",
  async (formEditorAvailable) => {
    const catalog = vi
      .spyOn(partOfSpeechDataSource, "catalog")
      .mockResolvedValue(partOfSpeechCatalogFixture);
    const changed = vi.fn();
    try {
      render(
        <QueryClientProvider client={new QueryClient()}>
          <App>
            <MeaningsStep
              value={{
                schema_version: 1,
                headword: "word",
                forms: [],
                senses: []
              }}
              kind="word"
              formEditorAvailable={formEditorAvailable}
              grammarAvailable
              target="en-GB"
              medium="zh-Hans"
              partOfSpeechCodes={["noun"]}
              disabled={false}
              onChange={changed}
            />
          </App>
        </QueryClientProvider>
      );
      await waitFor(() =>
        expect(partOfSpeechDataSource.catalog).toHaveBeenCalled()
      );
      expect(
        screen.getByRole("button", { name: "添加语法结构" })
      ).toBeDisabled();
      expect(screen.getByRole("button", { name: "添加词义" })).toBeDisabled();
      const beforeClick = changed.mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: "添加词义" }));
      expect(changed).toHaveBeenCalledTimes(beforeClick);
    } finally {
      catalog.mockRestore();
    }
  }
);

it("未指定词性的旧义项保留内容并锁定下方录入，指定词性后开放", async () => {
  const catalog = vi
    .spyOn(partOfSpeechDataSource, "catalog")
    .mockResolvedValue(partOfSpeechCatalogFixture);
  const initial: NextDraft = {
    schema_version: 1,
    headword: "word",
    forms: [],
    senses: [
      {
        id: "unassigned",
        part_of_speech: null,
        definitions: [
          {
            id: "definition",
            locale: "en-GB",
            style: "definition",
            text: "existing definition"
          }
        ],
        equivalents: [{ id: "equivalent", locale: "zh-Hans", text: "原有译词" }]
      }
    ]
  };
  const requests = {
    ...api.lexiconNext,
    equivalentCatalog: vi.fn().mockResolvedValue({ registers: [], domains: [] })
  };
  function Harness() {
    const [draft, setDraft] = useState(initial);
    return (
      <>
        <MeaningsStep
          value={draft}
          kind="word"
          formEditorAvailable={false}
          grammarAvailable
          definitionDetailsAvailable
          senseMetadataAvailable
          equivalentMetadataAvailable
          sentencesAvailable
          requests={requests}
          target="en-GB"
          medium="zh-Hans"
          partOfSpeechCodes={["noun"]}
          disabled={false}
          onChange={setDraft}
        />
        <output aria-label="词性前置草稿">{JSON.stringify(draft)}</output>
      </>
    );
  }
  try {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App>
          <Harness />
        </App>
      </QueryClientProvider>
    );
    await waitFor(() => expect(requests.equivalentCatalog).toHaveBeenCalled());
    for (const name of [
      "添加词义",
      "添加英式英语释义",
      "添加简体中文解释",
      "添加例句",
      "引用已有例句"
    ]) {
      expect(screen.getByRole("button", { name, exact: true })).toBeDisabled();
    }
    expect(
      screen.getByRole("textbox", { name: "批量录入常见译词" })
    ).toBeDisabled();
    expect(
      JSON.parse(screen.getByLabelText("词性前置草稿").textContent!)
    ).toEqual(initial);
    const pos = screen.getByRole("combobox", { name: "词义 1 词性" });
    expect(pos).toBeEnabled();
    fireEvent.mouseDown(pos);
    fireEvent.click(
      await screen.findByText("名词", {
        selector: ".ui-select-item-option-content"
      })
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "添加词义" })).toBeEnabled()
    );
    for (const name of [
      "添加语法结构",
      "添加英式英语释义",
      "添加简体中文解释",
      "添加例句",
      "引用已有例句"
    ]) {
      expect(screen.getByRole("button", { name, exact: true })).toBeEnabled();
    }
    expect(
      screen.getByRole("textbox", { name: "批量录入常见译词" })
    ).toBeEnabled();
    const saved = JSON.parse(screen.getByLabelText("词性前置草稿").textContent!)
      .senses[0];
    expect(saved.part_of_speech).toBe("noun");
    expect(saved.definitions).toEqual(initial.senses[0]!.definitions);
    expect(saved.equivalents).toEqual(initial.senses[0]!.equivalents);
  } finally {
    catalog.mockRestore();
  }
});
