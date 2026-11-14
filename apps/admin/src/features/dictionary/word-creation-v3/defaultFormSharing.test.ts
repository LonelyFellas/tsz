import { describe, expect, it } from "vitest";
import { regionalVariants, expandFormContents } from "@tsz/shared";
import type { SharedFormsStepContentV3 } from "@tsz/types";
import { applyDefaultFormSharing } from "./defaultFormSharing";
import {
  applyFormsStructure,
  detachSharedFormContent
} from "./sharedFormsModel";
import { addPartOfSpeech, fillFormTypeTemplate } from "./operations";
import { partOfSpeechCatalogFixture } from "../word-creation/partOfSpeech.test.helper";
import { uuidFromInt } from "./fixtures";

function fixture() {
  const catalog = structuredClone(partOfSpeechCatalogFixture);
  const noun = catalog.items.find((item) => item.code === "noun")!;
  const verb = catalog.items.find((item) => item.code === "verb")!;
  // Use real catalog identities; display names deliberately play no role.
  catalog.form_types = [
    {
      id: "base",
      code: "base",
      name_zh: "x",
      name_en: "x",
      short_name_zh: "x",
      full_name_en: "x",
      abbreviation: "x",
      sort_order: 0
    },
    ...[noun, verb].flatMap((part) =>
      (part.allowed_form_types ?? []).map((code, index) => ({
        id: `${part.id}:${code}`,
        code,
        part_of_speech_id: part.id,
        name_zh: "x",
        name_en: "x",
        short_name_zh: "x",
        full_name_en: "x",
        abbreviation: "x",
        sort_order: index + 1
      }))
    )
  ];
  catalog.form_sharing = {
    revision: 1,
    groups: [
      {
        id: "bases",
        members: [noun, verb].map((part) => ({
          part_of_speech_id: part.id,
          form_type_id: "base"
        }))
      }
    ]
  };
  let seq = 100;
  const ids = () => uuidFromInt(seq++);
  const a = addPartOfSpeech({ pos: [] }, noun, ids);
  if (!a.ok) throw new Error("fixture");
  const b = addPartOfSpeech(a.value, verb, ids);
  if (!b.ok) throw new Error("fixture");
  const inline = fillFormTypeTemplate(b.value, catalog.items, ids);
  const forms = applyFormsStructure(
    { forms_format: "shared_v1", contents: [], pos: [] },
    inline
  ) as SharedFormsStepContentV3;
  const bases = forms.pos.map((pos) =>
    pos.forms.find((form) => form.form_type === "base")!
  );
  const newIds = new Set(
    forms.pos.flatMap((pos) => pos.forms.map((form) => form.id))
  );
  return { catalog, forms, bases, newIds, ids };
}
function content(forms: SharedFormsStepContentV3, formId: string) {
  const binding = forms.pos
    .flatMap((pos) => pos.forms)
    .find((form) => form.id === formId)!;
  return forms.contents.find((row) => row.id === binding.content_id)!;
}

describe("默认共享模板", () => {
  it("只合并实际存在的指定新标签，不添加词性或关闭的词形", () => {
    const { catalog, forms, bases, newIds } = fixture();
    const before = structuredClone(forms);
    const next = applyDefaultFormSharing(forms, catalog, newIds);
    expect(content(next, bases[0]!.id).id).toBe(content(next, bases[1]!.id).id);
    expect(
      next.pos.map((pos) => ({
        id: pos.pos_id,
        groups: pos.form_groups,
        labels: pos.forms.map((form) => [form.id, form.form_type])
      }))
    ).toEqual(
      forms.pos.map((pos) => ({
        id: pos.pos_id,
        groups: pos.form_groups,
        labels: pos.forms.map((form) => [form.id, form.form_type])
      }))
    );
    expect(forms).toEqual(before);
  });
  it("没有新标签或旧 catalog 缺模板时原样返回，重开不合并", () => {
    const { catalog, forms, newIds } = fixture();
    expect(applyDefaultFormSharing(forms, catalog, new Set())).toBe(forms);
    delete catalog.form_sharing;
    expect(applyDefaultFormSharing(forms, catalog, newIds)).toBe(forms);
  });
  it.each(["spelling", "phonetic", "reading", "audio", "markup"])(
    "相同拼写也不覆盖不同的 %s",
    (kind) => {
      const { catalog, forms, bases, newIds } = fixture();
      for (const base of bases) {
        const row = regionalVariants(
          content(forms, base.id).regional_variants
        )[0]!;
        row.origin = "dictionary";
        row.spelling = "read";
        row.pronunciations[0]!.dict_phonetic = "riːd";
      }
      const row = regionalVariants(
        content(forms, bases[1]!.id).regional_variants
      )[0]!;
      if (kind === "spelling") row.spelling = "reads";
      if (kind === "phonetic") row.pronunciations[0]!.dict_phonetic = "red";
      if (kind === "reading") {
        row.pronunciations.push({
          ...row.pronunciations[0]!,
          id: "another",
          style: "normal"
        });
        regionalVariants(bases[1]!.regional_bindings)[0]!.pronunciations.push({
          id: "new-reference",
          content_slot_id: "another"
        });
      }
      if (kind === "audio")
        row.pronunciations[0]!.audio_assets = [
          {
            id: "different-recording",
            locale: "en-GB",
            gender: "female",
            content_type: "audio/mpeg",
            size_bytes: 12,
            original_name: "test.mp3",
            created_at: "2026-11-14T00:00:00Z"
          }
        ];
      if (kind === "markup")
        row.spelling_rich = { version: 2, text: "read", annotations: [] };
      expect(applyDefaultFormSharing(forms, catalog, newIds)).toBe(forms);
    }
  );
  it("新增空标签接入已有内容，旧内容及全部旧绑定原样保留", () => {
    const { catalog, forms, bases } = fixture();
    const existing = content(forms, bases[0]!.id);
    regionalVariants(
      existing.regional_variants
    )[0]!.pronunciations[0]!.actual_pron = "saved pronunciation";
    const old = structuredClone(forms.pos[0]);
    const next = applyDefaultFormSharing(
      forms,
      catalog,
      new Set([bases[1]!.id])
    );
    expect(content(next, bases[1]!.id)).toEqual(existing);
    expect(next.pos[0]).toEqual(old);
  });
  it("只处理首个默认组；关闭默认生成的标签不因共享配置而改绑", () => {
    const { catalog, forms, bases, newIds } = fixture();
    forms.pos[1]!.form_groups[0]!.scope = "dedicated";
    expect(applyDefaultFormSharing(forms, catalog, newIds)).toBe(forms);
    forms.pos[1]!.form_groups[0]!.scope = "general";
    bases[1]!.form_type = catalog.items.find(
      (part) => part.code === "verb"
    )!.allowed_form_types![0]!;
    catalog.form_sharing!.groups[0]!.members[1]!.form_type_id = `${catalog.items.find((part) => part.code === "verb")!.id}:${bases[1]!.form_type}`;
    catalog.items.find((part) => part.code === "verb")!.default_form_types = [];
    expect(applyDefaultFormSharing(forms, catalog, newIds)).toBe(forms);
  });
  it("独立编辑复制全部内容和槽位，保留公开引用 ID、组成员与其他标签；刷新不会重合并", () => {
    const { catalog, forms, bases, newIds, ids } = fixture();
    const shared = applyDefaultFormSharing(forms, catalog, newIds);
    const source = content(shared, bases[1]!.id);
    const variant = regionalVariants(source.regional_variants)[0]!;
    source.pronunciation_slots = [
      {
        id: ids(),
        common: {
          id: variant.pronunciations[0]!.id,
          variant_slot_id: variant.id
        }
      }
    ];
    const before = expandFormContents(shared);
    const detached = detachSharedFormContent(shared, bases[1]!.id, ids);
    expect(expandFormContents(detached)).toEqual(before);
    expect(detached.pos[0]).toEqual(shared.pos[0]);
    expect(detached.pos.map((pos) => pos.form_groups)).toEqual(
      shared.pos.map((pos) => pos.form_groups)
    );
    const copied = content(detached, bases[1]!.id);
    expect(copied.id).not.toBe(source.id);
    expect(copied.pronunciation_slots![0]!.common!.variant_slot_id).toBe(
      regionalVariants(copied.regional_variants)[0]!.id
    );
    regionalVariants(copied.regional_variants)[0]!.spelling = "independent";
    expect(content(detached, bases[0]!.id)).toEqual(source);
    expect(applyDefaultFormSharing(detached, catalog, new Set())).toBe(
      detached
    );
  });
});
