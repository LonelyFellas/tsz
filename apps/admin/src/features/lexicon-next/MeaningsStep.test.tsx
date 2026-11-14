import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import type { NextDraft } from "@tsz/types";
import { App } from "@tsz/ui/admin/overlays";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
