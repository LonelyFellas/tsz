import { useState } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { NextGrammarStructure, VoiceProfileV3 } from "@tsz/types";
import type { VoiceEditorProps } from "@tsz/voice-editor/types";
import { App } from "@tsz/ui/admin/overlays";
import { GrammarStructures } from "./GrammarStructures";

vi.mock("@/features/dictionary/voice-editor/dataSource", () => ({
  adminVoicePreviewAdapter: { listVoices: async () => [] },
  adminAudioUploadAdapter: {},
  loadAdminVoiceRecommendations: async () => [],
  voicePreviewIsMock: false
}));
const profile: VoiceProfileV3 = {
  voices: [{ voice_id: "saved-voice", enabled: true, rate_percent: 25 }]
};
vi.mock("@tsz/voice-editor/editor", () => ({
  VoiceEditor: function VoiceEditor(props: VoiceEditorProps) {
    const [unavailable, setUnavailable] = useState(false);
    return (
      <>
        <output aria-label="配音入口">
          {JSON.stringify({
            locale: props.locale,
            area: props.recommendationArea,
            speech: props.speechSettingsEnabled,
            links: Boolean(props.renderAssociationPicker)
          })}
        </output>
        <button onClick={() => props.onVoiceProfileChange?.(profile)}>
          修改配音
        </button>
        <button
          onClick={() =>
            props.onChange({ version: 2, text: "a new job", annotations: [] })
          }
        >
          修改正文
        </button>
        <button onClick={() => setUnavailable(true)}>停用所有音色</button>
        {props.renderActions?.(
          true,
          () => true,
          () => {
            if (unavailable) throw new Error("当前口音没有可用音色");
            return {
              value: props.value,
              voiceProfile: props.voiceProfile,
              audioAssets: props.audioAssets
            };
          }
        )}
      </>
    );
  }
}));

it("配音和正文只在完成时一起写回，取消及切换方言保留另一侧配置", async () => {
  const initial: NextGrammarStructure[] = [
    {
      id: "grammar",
      part_of_speech: "noun",
      variants: [
        {
          id: "uk",
          locale: "en-GB",
          content: { version: 2, text: "a job", annotations: [] }
        },
        {
          id: "us",
          locale: "en-US",
          content: { version: 2, text: "a role", annotations: [] }
        }
      ]
    }
  ];
  function Harness() {
    const [rows, setRows] = useState(initial);
    const [target, setTarget] = useState("en-GB");
    const [disabled, setDisabled] = useState(false);
    return (
      <>
        <button onClick={() => setTarget("en-US")}>切换美式</button>
        <button onClick={() => setDisabled(true)}>撤销编辑权限</button>
        <GrammarStructures
          rows={rows}
          pos="noun"
          target={target}
          audioAvailable
          formLinksAvailable
          disabled={disabled}
          referenceCount={() => 0}
          onChange={setRows}
        />
        <output aria-label="语法草稿">{JSON.stringify(rows)}</output>
      </>
    );
  }
  render(
    <App>
      <Harness />
    </App>
  );
  const draft = () =>
    JSON.parse(screen.getByLabelText("语法草稿").textContent!);
  fireEvent.click(
    screen.getByRole("button", { name: "编辑语法结构 1 英式英语内容" })
  );
  expect(
    JSON.parse((await screen.findByLabelText("配音入口")).textContent!)
  ).toEqual({ locale: "en-GB", area: "grammar", speech: true, links: true });
  fireEvent.click(screen.getByRole("button", { name: "修改配音" }));
  fireEvent.click(screen.getByRole("button", { name: "修改正文" }));
  expect(draft()).toEqual(initial);
  fireEvent.click(screen.getByRole("button", { name: "停用所有音色" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "完成" })
  );
  expect(await screen.findByText("当前口音没有可用音色")).toBeVisible();
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(draft()).toEqual(initial);
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "取消" })
  );
  expect(draft()).toEqual(initial);
  fireEvent.click(
    screen.getByRole("button", { name: "编辑语法结构 1 英式英语内容" })
  );
  await screen.findByLabelText("配音入口");
  fireEvent.click(screen.getByRole("button", { name: "修改配音" }));
  fireEvent.click(screen.getByRole("button", { name: "修改正文" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "完成" })
  );
  expect(draft()[0].variants[0]).toMatchObject({
    content: { text: "a new job" },
    voice_profile: profile
  });
  expect(draft()[0].variants[1]).toEqual(initial[0]!.variants[1]);
  fireEvent.click(screen.getByRole("button", { name: "切换美式" }));
  fireEvent.click(
    screen.getByRole("button", { name: "编辑语法结构 1 美式英语内容" })
  );
  expect(
    JSON.parse((await screen.findByLabelText("配音入口")).textContent!)
  ).toEqual({ locale: "en-US", area: "grammar", speech: true, links: true });
  fireEvent.click(screen.getByRole("button", { name: "撤销编辑权限" }));
  expect(
    within(screen.getByRole("dialog")).getByRole("button", { name: "完成" })
  ).toBeDisabled();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "取消" })
  );
  expect(draft()[0].variants[1]).toEqual(initial[0]!.variants[1]);
});

it("缺少当前目标语言内容时仍提供稳定的编辑入口", async () => {
  const initial: NextGrammarStructure[] = [
    {
      id: "grammar",
      part_of_speech: "noun",
      variants: [
        {
          id: "uk",
          locale: "en-GB",
          content: { version: 2, text: "a job", annotations: [] }
        }
      ]
    }
  ];
  function Harness() {
    const [target, setTarget] = useState("en-US");
    const [rows, setRows] = useState(initial);
    return (
      <>
        <button onClick={() => setTarget("en-US")}>切换美式</button>
        <GrammarStructures
          rows={rows}
          pos="noun"
          target={target}
          audioAvailable
          disabled={false}
          referenceCount={() => 0}
          onChange={setRows}
        />
        <output aria-label="语法草稿">{JSON.stringify(rows)}</output>
      </>
    );
  }
  render(
    <App>
      <Harness />
    </App>
  );
  const button = screen.getByRole("button", {
    name: "编辑语法结构 1 美式英语内容"
  });
  expect(button).toBeVisible();
  fireEvent.click(button);
  await waitFor(() =>
    expect(
      JSON.parse(screen.getByLabelText("语法草稿").textContent!)[0].variants
    ).toHaveLength(2)
  );
});

it("通用英语不能吞掉缺失的美式语法变体", async () => {
  const initial: NextGrammarStructure[] = [
    {
      id: "grammar",
      part_of_speech: "noun",
      variants: [
        {
          id: "common",
          locale: "en",
          content: { version: 2, text: "a job", annotations: [] }
        },
        {
          id: "uk",
          locale: "en-GB",
          content: { version: 2, text: "a job", annotations: [] }
        }
      ]
    }
  ];
  function Harness() {
    const [rows, setRows] = useState(initial);
    return (
      <>
        <GrammarStructures
          rows={rows}
          pos="noun"
          target="en-US"
          audioAvailable
          disabled={false}
          referenceCount={() => 0}
          onChange={setRows}
        />
        <output aria-label="语法草稿">{JSON.stringify(rows)}</output>
      </>
    );
  }
  render(
    <App>
      <Harness />
    </App>
  );
  fireEvent.click(
    screen.getByRole("button", { name: "编辑语法结构 1 美式英语内容" })
  );
  const rows = JSON.parse(screen.getByLabelText("语法草稿").textContent!)[0]
    .variants;
  expect(rows).toHaveLength(3);
  expect(rows.map((row: { locale: string }) => row.locale)).toEqual([
    "en",
    "en-GB",
    "en-US"
  ]);
  expect(rows[0].content.text).toBe("a job");
});
