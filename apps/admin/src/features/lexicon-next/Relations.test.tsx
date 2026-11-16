import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { NextDraft, NextEntry } from "@tsz/types";
import { App } from "@tsz/ui/admin/overlays";
import { api } from "@/lib/auth";
import { MeaningsStep } from "./MeaningsStep";
import { Preview } from "./Preview";
import { previewDraft } from "./model";
import { Relations } from "./Relations";

const targetEntry: NextEntry = {
  id: "target",
  target_language: "en",
  medium_locale: "zh-Hans",
  kind: "word",
  owner_id: "owner",
  revision: 1,
  updated_at: "2026-11-15T00:00:00Z",
  draft: {
    schema_version: 1,
    headword: "work",
    forms: [],
    senses: [
      {
        id: "target-sense",
        part_of_speech: "noun",
        equivalents: [],
        definitions: [
          {
            id: "target-definition",
            locale: "zh-Hans",
            text: "工作",
            style: "definition"
          }
        ]
      }
    ]
  }
};

it("只读及编辑转保存中时禁用目标义项和排序，保留现有关系", async () => {
  const rows = ["first", "second"].map((id) => ({
    id,
    relation: "synonym",
    target_word_id: id,
    target_sense_id: "target-sense",
    score: "80"
  }));
  const before = structuredClone(rows);
  const get = vi
    .fn()
    .mockImplementation(async (id: string) => ({ ...targetEntry, id }));
  const onChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const content = (disabled: boolean) => (
    <QueryClientProvider client={client}>
      <Relations
        rows={rows}
        entryId="source"
        senseId="source-sense"
        target="en-GB"
        medium="zh-Hans"
        requests={{ ...api.lexiconNext, get }}
        disabled={disabled}
        onChange={onChange}
      />
    </QueryClientProvider>
  );
  const view = render(content(true));
  await waitFor(() =>
    expect(screen.getAllByLabelText("近义词目标词条")[0]).toHaveValue("work")
  );
  const handles = () => screen.getAllByRole("button", { name: /^拖动近义词/ });
  const assertDisabled = () => {
    for (const control of [
      ...screen.getAllByLabelText("近义词目标词义"),
      ...handles()
    ])
      expect(control).toBeDisabled();
    for (const handle of handles())
      expect(handle).toHaveAttribute("draggable", "false");
    fireEvent.keyDown(handles()[0]!, { key: "ArrowDown" });
    expect(onChange).not.toHaveBeenCalled();
  };
  assertDisabled();
  view.rerender(content(false));
  expect(screen.getAllByLabelText("近义词目标词义")[0]).toBeEnabled();
  fireEvent.keyDown(handles()[0]!, { key: "ArrowDown" });
  expect(onChange).toHaveBeenCalledTimes(1);
  onChange.mockClear();
  view.rerender(content(true));
  assertDisabled();
  expect(rows).toEqual(before);
});

it("已关联目标读取失败显示重试，恢复后回显且不改写草稿", async () => {
  const rows = [
    {
      id: "relation",
      relation: "synonym",
      target_word_id: "target",
      target_sense_id: "target-sense",
      score: "87.5"
    }
  ];
  const get = vi
    .fn()
    .mockRejectedValueOnce(new Error("暂时不可用"))
    .mockResolvedValue(targetEntry);
  const onChange = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Relations
        rows={rows}
        entryId="source"
        senseId="source-sense"
        target="en-GB"
        medium="zh-Hans"
        requests={{ ...api.lexiconNext, get }}
        disabled={false}
        onChange={onChange}
      />
    </QueryClientProvider>
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("关联词读取失败");
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() =>
    expect(screen.getByLabelText("近义词目标词条")).toHaveValue("work")
  );
  expect(screen.queryByRole("alert")).toBeNull();
  expect(get).toHaveBeenCalledTimes(2);
  expect(onChange).not.toHaveBeenCalled();
});

it("新版接入 V1 拓展词，候选按语言隔离，关联保存回读与预览保留其他义项", async () => {
  const initial: NextDraft = {
    schema_version: 1,
    headword: "job",
    forms: [],
    senses: [
      {
        id: "source-sense",
        part_of_speech: "noun",
        definitions: [],
        equivalents: []
      },
      {
        id: "other-sense",
        part_of_speech: "verb",
        definitions: [],
        equivalents: []
      }
    ]
  };
  const list = vi.fn().mockResolvedValue({
    items: [{ id: "source" }, { id: "target" }],
    pagination: { page: 1, page_size: 4, total: 2, total_pages: 1 }
  });
  const get = vi.fn().mockResolvedValue(targetEntry);
  const requests = { ...api.lexiconNext, list, get };
  let saved: NextDraft | undefined;
  function Host() {
    const [draft, setDraft] = useState(initial);
    const [readBack, setReadBack] = useState(false);
    return (
      <>
        {readBack ? (
          <Preview
            requests={requests}
            view={previewDraft(draft, "en-GB", "zh-Hans")}
          />
        ) : (
          <MeaningsStep
            entryId="source"
            relationsAvailable
            requests={requests}
            value={draft}
            kind="word"
            formEditorAvailable={false}
            target="en-GB"
            medium="zh-Hans"
            partOfSpeechCodes={["noun", "verb"]}
            disabled={false}
            onChange={setDraft}
          />
        )}
        <button
          onClick={() => {
            saved = structuredClone(draft);
            setDraft(JSON.parse(JSON.stringify(draft)));
            setReadBack(true);
          }}
        >
          回读预览
        </button>
        <output aria-label="当前草稿">{JSON.stringify(draft)}</output>
      </>
    );
  }
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <App>
        <Host />
      </App>
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "添加近义词" }));
  fireEvent.focus(screen.getByPlaceholderText("搜索关联词"));
  fireEvent.change(screen.getByPlaceholderText("搜索关联词"), {
    target: { value: "work" }
  });
  const option = (await screen.findAllByText("work")).at(-1)!;
  expect(list).toHaveBeenCalledWith({
    target_language: "en",
    medium_locale: "zh-Hans",
    headword: "work",
    page_size: 4
  });
  expect(get).toHaveBeenCalledWith("target");
  expect(get).not.toHaveBeenCalledWith("source");
  fireEvent.click(option);
  const senseSelect = screen.getByRole("combobox", { name: "近义词目标词义" });
  fireEvent.mouseDown(senseSelect);
  fireEvent.click((await screen.findAllByText("工作")).at(-1)!);
  fireEvent.change(screen.getByRole("spinbutton", { name: "相似度" }), {
    target: { value: "87.5" }
  });
  await waitFor(() =>
    expect(
      JSON.parse(screen.getByLabelText("当前草稿").textContent!).senses[0]
        .relations[0]
    ).toMatchObject({
      relation: "synonym",
      target_word_id: "target",
      target_sense_id: "target-sense",
      score: "87.5"
    })
  );
  fireEvent.click(screen.getByRole("button", { name: "回读预览" }));
  expect(saved!.senses[1]).toEqual(initial.senses[1]);
  const section = within(screen.getByRole("region", { name: "拓展词" }));
  expect(await section.findByText("work")).toBeVisible();
  expect(section.getByText(/工作.*87.5%/)).toBeVisible();
});

it("发布预览仅显示冻结的关联词文本，不请求后来变化的目标草稿", () => {
  const get = vi
    .fn()
    .mockRejectedValue(new Error("should not read live draft"));
  const data: NextDraft = {
    schema_version: 1,
    headword: "job",
    forms: [],
    senses: [
      {
        id: "source",
        part_of_speech: "noun",
        definitions: [],
        equivalents: [],
        relations: [
          {
            id: "relation",
            relation: "synonym",
            target_word_id: "target",
            target_sense_id: "target-sense",
            score: "80"
          }
        ]
      }
    ]
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Preview
        view={previewDraft(data, "en-GB", "zh-Hans")}
        requests={{ ...api.lexiconNext, get }}
        relationTargets={[
          {
            entry_id: "target",
            sense_id: "target-sense",
            publication_id: "frozen",
            headword: "work",
            gloss: "发布时的含义"
          }
        ]}
      />
    </QueryClientProvider>
  );
  expect(screen.getByText("work")).toBeVisible();
  expect(screen.getByText(/发布时的含义/)).toBeVisible();
  expect(get).not.toHaveBeenCalled();
});
