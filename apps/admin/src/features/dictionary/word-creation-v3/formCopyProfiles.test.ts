import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedFormsStepContentV3, VoiceProfileV3 } from "@tsz/types";
import {
  commonFormFixture,
  formsFixture,
  pronunciationFixture,
  uuidFromInt
} from "./fixtures";
import { planFormCopy } from "./formCopyModel";
import { resolveFormCopyProfiles } from "./formCopyProfiles";
import { applyFormsStructure } from "./sharedFormsModel";

const resolve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ api: { speech: { resolve } } }));
function fixture(profile: VoiceProfileV3): SharedFormsStepContentV3 {
  return applyFormsStructure(
    { forms_format: "shared_v1", contents: [], pos: [] },
    formsFixture({
      forms: [
        commonFormFixture({
          pronunciations: [
            pronunciationFixture({
              voice_profile: profile,
              synthesis: {
                alphabet: "ipa",
                ipa: "s",
                ups: "S",
                uk: {
                  ipa: "s",
                  ups: "S",
                  ipa_speech: {
                    content: { version: 2, text: "centre", annotations: [] },
                    voice_profile: profile
                  }
                }
              }
            })
          ]
        }),
        commonFormFixture({
          id: uuidFromInt(900),
          spelling: "centres",
          form_type: "plural"
        })
      ]
    })
  ) as SharedFormsStepContentV3;
}
const profile: VoiceProfileV3 = {
  voices: [
    {
      voice_id: "stored",
      version_id: uuidFromInt(50),
      version_name: "stored",
      locale: "en-GB",
      enabled: false,
      rate_percent: -10,
      pitch_semitones: 1
    }
  ],
  dubbing: { mode: "inherit", area: "azure" }
};
beforeEach(() =>
  resolve.mockReset().mockResolvedValue({
    voices: [
      {
        voice_id: "resolved",
        version_id: uuidFromInt(51),
        version_name: "resolved",
        locale: "en-GB",
        enabled: true,
        rate_percent: 20,
        style_degree: 1.5,
        role: "YoungAdultFemale"
      }
    ]
  })
);

describe("复制前解析完整音色配置", () => {
  it("解析继承配音，保留未启用配置，并按口音和正文类型请求", async () => {
    const forms = fixture(profile);
    const plan = planFormCopy(
      forms,
      forms.pos[0]!.forms[0]!.id,
      forms.pos[0]!.forms[1]!.id,
      "voices"
    );
    const controller = new AbortController();
    const result = await resolveFormCopyProfiles(plan, controller.signal);
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        accent: "gb",
        source: expect.objectContaining({
          kind: "phoneme",
          phoneme_locale: "en-GB",
          phoneme: "s"
        })
      }),
      controller.signal
    );
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        accent: "us",
        source: expect.objectContaining({ kind: "text" })
      }),
      controller.signal
    );
    expect(
      result.find((item) => item.side === "uk" && item.channel === "ipa")
        ?.profile.voices
    ).toEqual([
      profile.voices[0],
      expect.objectContaining({
        voice_id: "resolved",
        rate_percent: 20,
        style_degree: 1.5,
        role: "YoungAdultFemale"
      })
    ]);
    expect(forms.contents[0]).toEqual(plan.source.contentSnapshot);
  });
  it("音标复制和显式局部参数无需请求；带继承语义的 local 仍解析实际配置", async () => {
    const forms = fixture({ voices: profile.voices });
    const source = forms.pos[0]!.forms[0]!.id,
      target = forms.pos[0]!.forms[1]!.id;
    await resolveFormCopyProfiles(
      planFormCopy(forms, source, target, "phonetics"),
      new AbortController().signal
    );
    await resolveFormCopyProfiles(
      planFormCopy(forms, source, target, "voices"),
      new AbortController().signal
    );
    expect(resolve).not.toHaveBeenCalled();
    const local = fixture({
      ...profile,
      dubbing: { mode: "local", area: "azure" }
    });
    await resolveFormCopyProfiles(
      planFormCopy(local, source, target, "voices"),
      new AbortController().signal
    );
    expect(resolve).toHaveBeenCalled();
  });
  it("任何通道解析失败都返回失败，调用者不能应用部分结果", async () => {
    resolve.mockRejectedValueOnce(new Error("配置已失效"));
    const forms = fixture(profile);
    const plan = planFormCopy(
      forms,
      forms.pos[0]!.forms[0]!.id,
      forms.pos[0]!.forms[1]!.id,
      "voices"
    );
    await expect(
      resolveFormCopyProfiles(plan, new AbortController().signal)
    ).rejects.toThrow("配置已失效");
  });
});
