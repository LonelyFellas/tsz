import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "@tsz/ui/admin/overlays";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DialectRulesV3, WordConcreteFormV3 } from "@tsz/types";
import { PronunciationPreviewProvider } from "../../word-creation/PronunciationPreview";
import {
  commonFormFixture,
  formsFixture,
  pronunciationFixture,
  ukUsFormFixture
} from "../fixtures";
import { V3ConcreteFormRow } from "./V3ConcreteFormRow";
import { V3FormContentOverview } from "./V3FormContentOverview";

const preview = vi.hoisted(() => ({
  preference: "uk" as "uk" | "us",
  resolveVoices: vi.fn(),
  synthesize: vi.fn(),
  pause: vi.fn()
}));

vi.mock("@/features/settings/useDialectPreference", () => ({
  useDialectPreference: () => ({ preference: preview.preference })
}));
vi.mock("@/lib/env", () => ({
  env: { VOICE_PREVIEW: true, VOICE_EDITOR: false }
}));
vi.mock("../../voice-editor/dataSource", () => ({
  loadAdminVoiceRecommendations: vi.fn().mockResolvedValue([]),
  adminVoicePreviewAdapter: {
    listVoices: async () => [
      {
        id: "british-voice",
        label: "British",
        displayName: "Sonia Test",
        locale: "en-GB",
        gender: "female"
      },
      {
        id: "british-voice-2",
        label: "British Alt",
        displayName: "Andrew Test",
        locale: "en-GB",
        gender: "male"
      },
      {
        id: "american-voice",
        label: "American",
        locale: "en-US",
        gender: "female"
      },
      {
        id: "american-andrew",
        label: "American Andrew",
        displayName: "Andrew Test",
        locale: "en-US",
        gender: "male"
      }
    ],
    synthesize: preview.synthesize,
    resolveVoices: preview.resolveVoices
  },
  voicePreviewIsMock: false
}));

// 本处验证拼写行；发音列表有独立的合成输入与播放测试。
vi.mock("./V3PronunciationList", () => ({
  V3PronunciationList: () => null
}));

function Harness({
  form,
  rules
}: {
  form: WordConcreteFormV3;
  rules: DialectRulesV3;
}) {
  return (
    <App>
      <PronunciationPreviewProvider loadVoicesOnMount resolveVoicesOnMount>
        <V3ConcreteFormRow
          content={formsFixture({ forms: [form], dialect_rules: rules })}
          dialectRules={rules}
          form={form}
          formLabel="原形"
          issues={[]}
          membershipCount={1}
          idFactory={() => "unused"}
          onChange={() => undefined}
        />
      </PronunciationPreviewProvider>
    </App>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  preview.preference = "uk";
  preview.resolveVoices.mockImplementation(async ({ accent }) => ({
    source: { kind: "catalog" },
    voices: [
      {
        voice_id: accent === "gb" ? "british-voice" : "american-voice",
        version_id: `recommended-${accent}`,
        locale: accent === "gb" ? "en-GB" : "en-US",
        enabled: true,
        rate_percent: accent === "gb" ? -10 : -25
      }
    ]
  }));
  preview.synthesize.mockImplementation(async () => ({
    audioUrl: "https://audio.test/job.mp3",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    cached: false
  }));
  vi.stubGlobal(
    "Audio",
    class {
      play = async () => undefined;
      pause = preview.pause;
      addEventListener() {}
    }
  );
});

afterEach(() => vi.unstubAllGlobals());

it("总览选择词形拼写后，无独立语音配置或正式音频也可播放", async () => {
  const form = ukUsFormFixture({
    uk: {
      spelling: "belonging",
      pronunciations: [
        pronunciationFixture({
          synthesis: { alphabet: "ipa", ipa: "", ups: "", use_spelling: true }
        })
      ]
    }
  });
  const pos = formsFixture({ forms: [form] }).pos[0]!;
  render(
    <App>
      <PronunciationPreviewProvider loadVoicesOnMount resolveVoicesOnMount>
        <V3FormContentOverview
          rows={[
            {
              membershipId: pos.form_groups[0]!.members[0]!.id,
              form,
              formLabel: "原形",
              formTypeAriaLabel: "词形类型",
              formTypeDisabled: false,
              formTypeOptions: ["base"],
              membershipCount: 1
            }
          ]}
          group={pos.form_groups[0]!}
          sharedCounts={new Map()}
          onEdit={() => undefined}
          onFormTypeChange={() => undefined}
          issues={[]}
        />
      </PronunciationPreviewProvider>
    </App>
  );
  const play = screen.getByLabelText("读法 1英式 播放语音");
  await waitFor(() => expect(play).toBeEnabled());
  fireEvent.click(play);
  await waitFor(() =>
    expect(preview.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        content: { version: 2, text: "belonging", annotations: [] },
        voiceId: "british-voice"
      }),
      expect.anything()
    )
  );
});

it("总览明确显示停配侧且不借用旧读法音色，另一侧仍独立", async () => {
  const form = commonFormFixture({
    spelling: "job",
    pronunciations: [
      pronunciationFixture({
        voice_profile: {
          voices: [
            {
              voice_id: "british-voice",
              enabled: true,
              rate_percent: -27,
              locale: "en-GB"
            }
          ]
        },
        synthesis: {
          alphabet: "ipa",
          ipa: "",
          ups: "",
          use_spelling: true,
          uk: { source: "none", ipa: "dʒɒb", ups: "JH AA B" },
          us: { source: "spelling", ipa: "dʒɑb", ups: "JH AA B" }
        }
      })
    ]
  });
  const pos = formsFixture({ forms: [form] }).pos[0]!;
  render(
    <App>
      <PronunciationPreviewProvider loadVoicesOnMount resolveVoicesOnMount>
        <V3FormContentOverview
          rows={[
            {
              membershipId: pos.form_groups[0]!.members[0]!.id,
              form,
              formLabel: "原形",
              formTypeAriaLabel: "词形类型",
              formTypeDisabled: false,
              formTypeOptions: ["base"],
              membershipCount: 1
            }
          ]}
          group={pos.form_groups[0]!}
          sharedCounts={new Map()}
          onEdit={() => undefined}
          onFormTypeChange={() => undefined}
          issues={[]}
        />
      </PronunciationPreviewProvider>
    </App>
  );
  expect(await screen.findByText("本侧暂不配置")).toBeVisible();
  expect(screen.getByLabelText("读法 1英式 播放语音")).toBeDisabled();
  expect(screen.queryByText("British")).not.toBeInTheDocument();
  expect(preview.synthesize).not.toHaveBeenCalled();
});

it("总览音色列按启用音色逐行展示，并让语速和音量保持同一行", async () => {
  const form = commonFormFixture({
    spelling: "dignity",
    pronunciations: [
      pronunciationFixture({
        voice_profile: {
          voices: [
            {
              voice_id: "british-voice",
              enabled: true,
              rate_percent: -10,
              volume_percent: 93,
              locale: "en-GB"
            },
            {
              voice_id: "british-voice-2",
              enabled: true,
              rate_percent: -45,
              volume_percent: 100,
              locale: "en-GB"
            }
          ]
        }
      })
    ]
  });
  const pos = formsFixture({ forms: [form] }).pos[0]!;
  render(
    <App>
      <PronunciationPreviewProvider loadVoicesOnMount resolveVoicesOnMount>
        <V3FormContentOverview
          rows={[
            {
              membershipId: pos.form_groups[0]!.members[0]!.id,
              form,
              formLabel: "原形",
              formTypeAriaLabel: "词形类型",
              formTypeDisabled: false,
              formTypeOptions: ["base"],
              membershipCount: 1
            }
          ]}
          group={pos.form_groups[0]!}
          sharedCounts={new Map()}
          onEdit={() => undefined}
          onFormTypeChange={() => undefined}
          issues={[]}
        />
      </PronunciationPreviewProvider>
    </App>
  );
  expect(screen.getAllByText("配音")[0]).toBeVisible();
  expect(await screen.findByText("Sonia Test")).toBeVisible();
  expect(screen.getByText("Andrew Test")).toBeVisible();
  expect(
    screen.getByText("Sonia Test").closest(".v3-voice-inline-name")
  ).toHaveTextContent("Sonia Test♀");
  expect(
    screen.getByText("Andrew Test").closest(".v3-voice-inline-name")
  ).toHaveTextContent("Andrew Test♂");
  expect(screen.getByText("0.90×")).toBeVisible();
  expect(screen.getByText("0.55×")).toBeVisible();
  expect(screen.getByText("93%")).toBeVisible();
  expect(screen.getByText("100%")).toBeVisible();
});

it("总览继承音色时按当前读法解析推荐音色", async () => {
  preview.resolveVoices.mockImplementation(async ({ accent, content }) => ({
    source: { kind: "recommendation" },
    voices: [
      {
        voice_id:
          accent === "gb" || content.text !== "center"
            ? "british-voice"
            : "american-andrew",
        version_id: `recommended-${accent}`,
        locale: accent === "gb" ? "en-GB" : "en-US",
        enabled: true,
        rate_percent: 0
      }
    ]
  }));
  const inherited = {
    voices: [],
    dubbing: {
      area: "azure" as const,
      uk: { mode: "inherit" as const },
      us: { mode: "inherit" as const }
    }
  };
  const form = ukUsFormFixture({
    us: {
      spelling: "center",
      pronunciations: [
        pronunciationFixture({
          synthesis: {
            alphabet: "ipa",
            ipa: "",
            ups: "",
            us: {
              source: "ipa",
              ipa: "ˈsɛntɚ",
              ups: "S EH N T ER",
              ipa_speech: {
                content: { version: 2, text: "center", annotations: [] },
                voice_profile: inherited
              }
            }
          }
        })
      ]
    }
  });
  const pos = formsFixture({ forms: [form] }).pos[0]!;
  render(
    <App>
      <PronunciationPreviewProvider loadVoicesOnMount resolveVoicesOnMount>
        <V3FormContentOverview
          rows={[
            {
              membershipId: pos.form_groups[0]!.members[0]!.id,
              form,
              formLabel: "原形",
              formTypeAriaLabel: "词形类型",
              formTypeDisabled: false,
              formTypeOptions: ["base"],
              membershipCount: 1
            }
          ]}
          group={pos.form_groups[0]!}
          sharedCounts={new Map()}
          onEdit={() => undefined}
          onFormTypeChange={() => undefined}
          issues={[]}
        />
      </PronunciationPreviewProvider>
    </App>
  );
  await waitFor(() =>
    expect(
      preview.resolveVoices.mock.calls.some(
        ([input]) => input.accent === "us" && input.content?.text === "center"
      )
    ).toBe(true)
  );
  expect(await screen.findByText("Andrew Test")).toBeVisible();
  expect(
    screen.getByText("Andrew Test").closest(".v3-voice-inline-name")
  ).toHaveTextContent("Andrew Test♂");
});

it("总览上传音频行显示来源文件，语速和音量不伪造合成值", async () => {
  const form = ukUsFormFixture({
    uk: {
      spelling: "dignity",
      pronunciations: [
        pronunciationFixture({
          synthesis: {
            alphabet: "ipa",
            ipa: "",
            ups: "",
            uk: { source: "upload", ipa: "", ups: "" }
          },
          audio_assets: [
            {
              id: "recording-uk",
              locale: "en-GB",
              gender: "male",
              content_type: "audio/mpeg",
              size_bytes: 1024,
              original_name: "dignity-andrew.mp3",
              created_at: "2026-11-11T07:00:00Z",
              is_default: true
            }
          ]
        })
      ]
    }
  });
  const pos = formsFixture({ forms: [form] }).pos[0]!;
  render(
    <App>
      <PronunciationPreviewProvider loadVoicesOnMount resolveVoicesOnMount>
        <V3FormContentOverview
          rows={[
            {
              membershipId: pos.form_groups[0]!.members[0]!.id,
              form,
              formLabel: "原形",
              formTypeAriaLabel: "词形类型",
              formTypeDisabled: false,
              formTypeOptions: ["base"],
              membershipCount: 1
            }
          ]}
          group={pos.form_groups[0]!}
          sharedCounts={new Map()}
          onEdit={() => undefined}
          onFormTypeChange={() => undefined}
          issues={[]}
        />
      </PronunciationPreviewProvider>
    </App>
  );
  expect(await screen.findByText("上传音频")).toBeVisible();
  expect(screen.getByText("dignity-andrew.mp3")).toBeVisible();
  expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
});

it.each(["common", "uk_us"] as const)("%s 拼写行不显示独立试听入口", (mode) => {
  const form =
    mode === "common"
      ? commonFormFixture({ spelling: "job" })
      : ukUsFormFixture({ uk: { spelling: "job" }, us: { spelling: "job" } });
  const rules: DialectRulesV3 = {
    spelling_mode: "unified",
    phonetic_mode: mode === "common" ? "unified" : "distinguish"
  };
  render(<Harness form={form} rules={rules} />);
  expect(
    screen.queryByLabelText("原形英美通用拼写 播放语音")
  ).not.toBeInTheDocument();
});

it("独立英美拼写不显示顶部试听入口", () => {
  render(
    <Harness
      form={ukUsFormFixture({
        uk: { spelling: "colour" },
        us: { spelling: "color" }
      })}
      rules={{ spelling_mode: "distinguish", phonetic_mode: "distinguish" }}
    />
  );
  expect(
    screen.queryByLabelText("原形英式拼写 播放语音")
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText("原形美式拼写 播放语音")
  ).not.toBeInTheDocument();
});

it("英美独立增删拼写并用键盘排序，移动保持拼写、发音和身份", () => {
  const form = ukUsFormFixture({
    uk: { spelling: "centre" },
    us: { spelling: "center" }
  });
  const rules: DialectRulesV3 = {
    spelling_mode: "distinguish",
    phonetic_mode: "distinguish"
  };
  let latest = formsFixture({ forms: [form], dialect_rules: rules });
  function ListHarness() {
    const [content, setContent] = useState(latest);
    return (
      <App>
        <PronunciationPreviewProvider loadVoicesOnMount resolveVoicesOnMount>
          <V3ConcreteFormRow
            content={content}
            form={content.pos[0]!.forms[0]!}
            dialectRules={rules}
            formLabel="原形"
            presentation="content"
            showRegularity={false}
            issues={[]}
            membershipCount={1}
            multipleSpellingsAvailable
            idFactory={() => crypto.randomUUID()}
            spellingRemovalReason={(id) =>
              id === form.regional_variants.uk.id ? "请先解除关联" : undefined
            }
            onChange={(next) => {
              latest = next;
              setContent(next);
            }}
          />
        </PronunciationPreviewProvider>
      </App>
    );
  }
  render(<ListHarness />);
  fireEvent.click(
    screen.getByRole("button", { name: "在英式第 1 条拼写后新增拼写" })
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "原形第 2 条英式拼写" }),
    { target: { value: "alternate" } }
  );
  fireEvent.click(
    screen.getByRole("button", { name: "在美式第 1 条拼写后新增拼写" })
  );
  fireEvent.click(
    screen.getByRole("button", { name: "在美式第 2 条拼写后新增拼写" })
  );
  const before = latest.pos[0]!.forms[0]!.regional_variants;
  if (before.mode !== "uk_us_many") throw new Error("fixture");
  expect(before.uk).toHaveLength(2);
  expect(before.us).toHaveLength(3);
  const moved = structuredClone(before.uk[1]!);
  fireEvent.keyDown(
    screen.getByRole("button", { name: "移动英式第 2 条拼写" }),
    { key: "ArrowUp" }
  );
  const sorted = latest.pos[0]!.forms[0]!.regional_variants;
  if (sorted.mode !== "uk_us_many") throw new Error("fixture");
  expect(sorted.uk[0]).toEqual(moved);
  expect(
    screen.getByRole("button", { name: "删除英式第 2 条拼写" })
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "删除英式第 1 条拼写" }));
  const deleted = latest.pos[0]!.forms[0]!.regional_variants;
  if (deleted.mode !== "uk_us_many") throw new Error("fixture");
  expect(deleted.uk).toEqual([form.regional_variants.uk]);
  expect(deleted.us).toEqual(before.us);
});

it("旧服务未声明多条拼写能力时保留单条编辑并禁用新增", () => {
  const form = ukUsFormFixture();
  const rules: DialectRulesV3 = {
    spelling_mode: "distinguish",
    phonetic_mode: "distinguish"
  };
  const onChange = vi.fn();
  render(
    <App>
      <PronunciationPreviewProvider loadVoicesOnMount resolveVoicesOnMount>
        <V3ConcreteFormRow
          content={formsFixture({ forms: [form], dialect_rules: rules })}
          form={form}
          dialectRules={rules}
          presentation="content"
          issues={[]}
          membershipCount={1}
          idFactory={() => crypto.randomUUID()}
          onChange={onChange}
        />
      </PronunciationPreviewProvider>
    </App>
  );
  const add = screen.getByRole("button", {
    name: "在英式第 1 条拼写后新增拼写"
  });
  expect(add).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "在美式第 1 条拼写后新增拼写" })
  ).toBeDisabled();
  fireEvent.click(add);
  expect(onChange).not.toHaveBeenCalled();
});
