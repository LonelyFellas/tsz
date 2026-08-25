import type {
  DraftFormsStepContentV3,
  TextOriginV3,
  WordCommonFormVariantV3,
  WordConcreteFormV3,
  WordFormGroupV3,
  WordFormTypeV3,
  WordPronunciationV3,
  WordUkFormVariantV3,
  WordUsFormVariantV3
} from "@tsz/types";

export const UUIDS = Object.freeze({
  pos: "00000000-0000-4000-8000-000000000001",
  pos_2: "00000000-0000-4000-8000-000000000002",
  group: "00000000-0000-4000-8000-000000000011",
  group_2: "00000000-0000-4000-8000-000000000012",
  group_3: "00000000-0000-4000-8000-000000000013",
  membership: "00000000-0000-4000-8000-000000000021",
  membership_2: "00000000-0000-4000-8000-000000000022",
  membership_3: "00000000-0000-4000-8000-000000000023",
  form: "00000000-0000-4000-8000-000000000031",
  form_2: "00000000-0000-4000-8000-000000000032",
  common_variant: "00000000-0000-4000-8000-000000000041",
  common_variant_2: "00000000-0000-4000-8000-000000000042",
  uk_variant: "00000000-0000-4000-8000-000000000043",
  us_variant: "00000000-0000-4000-8000-000000000044",
  pronunciation: "00000000-0000-4000-8000-000000000051",
  pronunciation_2: "00000000-0000-4000-8000-000000000052",
  pronunciation_3: "00000000-0000-4000-8000-000000000053"
});

export function uuidFromInt(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("uuid fixture value must be a non-negative safe integer");
  }
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
}

function derivedUuid(seed: string, role: number): string {
  let hash = role;
  for (const character of seed) {
    hash = (Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0) + role;
  }
  const high = hash.toString(16).padStart(8, "0");
  const low = ((hash ^ (role * 2654435761)) >>> 0)
    .toString(16)
    .padStart(8, "0");
  return `${high.slice(0, 8)}-${low.slice(0, 4)}-4${low.slice(5, 8)}-8${high.slice(1, 4)}-${high.slice(4)}${low}`;
}

export function uuidSequence(...ids: string[]): () => string {
  let index = 0;
  return () => {
    const id = ids[index];
    if (!id) throw new Error("UUID fixture sequence exhausted");
    index += 1;
    return id;
  };
}

export function pronunciationFixture(
  overrides: Partial<WordPronunciationV3> = {}
): WordPronunciationV3 {
  return {
    id: UUIDS.pronunciation,
    dict_phonetic: "sen-tre",
    actual_pron: "centre",
    style: "normal",
    ...overrides
  };
}

export type CommonFormFixture = WordConcreteFormV3 & {
  regional_variants: {
    mode: "common";
    common: WordCommonFormVariantV3;
  };
};

export function commonFormFixture(
  overrides: {
    id?: string;
    form_type?: WordFormTypeV3;
    variant_id?: string;
    spelling?: string;
    origin?: TextOriginV3;
    pronunciations?: WordPronunciationV3[];
  } = {}
): CommonFormFixture {
  const id = overrides.id ?? UUIDS.form;
  const isDefault = id === UUIDS.form;
  return {
    id,
    form_type: overrides.form_type ?? "base",
    regional_variants: {
      mode: "common",
      common: {
        id:
          overrides.variant_id ??
          (isDefault ? UUIDS.common_variant : derivedUuid(id, 41)),
        dialect: "common",
        spelling: overrides.spelling ?? "centre",
        origin: overrides.origin ?? "dictionary",
        pronunciations: overrides.pronunciations ?? [
          pronunciationFixture({
            id: isDefault ? UUIDS.pronunciation : derivedUuid(id, 51)
          })
        ]
      }
    }
  };
}

export type UkUsFormFixture = WordConcreteFormV3 & {
  regional_variants: {
    mode: "uk_us";
    uk: WordUkFormVariantV3;
    us: WordUsFormVariantV3;
  };
};

export function ukUsFormFixture(
  overrides: {
    id?: string;
    form_type?: WordFormTypeV3;
    uk?: Partial<WordUkFormVariantV3>;
    us?: Partial<WordUsFormVariantV3>;
  } = {}
): UkUsFormFixture {
  const id = overrides.id ?? UUIDS.form_2;
  return {
    id,
    form_type: overrides.form_type ?? "base",
    regional_variants: {
      mode: "uk_us",
      uk: {
        id: UUIDS.uk_variant,
        dialect: "uk",
        spelling: "centre",
        origin: "dictionary",
        pronunciations: [pronunciationFixture({ id: UUIDS.pronunciation_2 })],
        ...overrides.uk
      },
      us: {
        id: UUIDS.us_variant,
        dialect: "us",
        spelling: "center",
        origin: "dictionary",
        pronunciations: [pronunciationFixture({ id: UUIDS.pronunciation_3 })],
        ...overrides.us
      }
    }
  };
}

function defaultGroups(forms: WordConcreteFormV3[]): WordFormGroupV3[] {
  return [
    {
      id: UUIDS.group,
      is_regular: true,
      members: forms.map((form, index) => ({
        id: index === 0 ? UUIDS.membership : derivedUuid(form.id, 21 + index),
        form_id: form.id
      }))
    }
  ];
}

export function formsFixture(
  options: {
    forms?: WordConcreteFormV3[];
    groups?: WordFormGroupV3[];
    pos_id?: string;
    pos?: string;
  } = {}
): DraftFormsStepContentV3 {
  const forms = options.forms ?? [commonFormFixture()];
  return {
    pos: [
      {
        pos_id: options.pos_id ?? UUIDS.pos,
        pos: options.pos ?? "noun",
        forms,
        form_groups: options.groups ?? defaultGroups(forms)
      }
    ]
  };
}
