import type {
  DetectWordInputV2,
  DetectWordResponseV2,
  DraftFormsStepContent,
  DraftMeaningsStepContent,
  EnglishTextV2,
  RichText,
  SenseGroupV2,
  WordDerivedFormSlotV2,
  WordFormGroupV2,
  WordHeadwordsV2,
  WordPosFormsV2,
  WordPosMeaningsV2,
  WordPosTag,
  WordPronunciationV2
} from "@tsz/types";

export const ADMIN_WORDS_MOCK_STORAGE_SCHEMA = 9;

export function richText(text: string): RichText {
  return { version: 1, text, spans: [], liaisons: [] };
}

function pronunciation(id: string, phonetic: string): WordPronunciationV2 {
  return {
    id,
    dict_phonetic: phonetic,
    actual_pron: phonetic,
    style: "normal"
  };
}

function variants(
  prefix: string,
  values: Array<{
    dialect: "common" | "uk" | "us";
    spelling: string;
    phonetic: string;
  }>
) {
  return values.map(({ dialect, spelling, phonetic }) => ({
    id: `${prefix}-${dialect}`,
    dialect,
    spelling,
    origin: "dictionary" as const,
    pronunciations: [pronunciation(`${prefix}-${dialect}-pron`, phonetic)]
  }));
}

function group(
  id: string,
  slots: WordDerivedFormSlotV2[],
  isRegular = true
): WordFormGroupV2 {
  return { id, is_regular: isRegular, slots };
}

function centerForms(): DraftFormsStepContent {
  const noun: WordPosFormsV2 = {
    pos_id: "suggested-pos-noun",
    pos: "noun",
    dialect_rules: {
      spelling_mode: "distinguish",
      phonetic_mode: "distinguish"
    },
    base_form: {
      id: "suggested-base-noun",
      form_type: "base",
      variants: variants("suggested-base-noun", [
        { dialect: "uk", spelling: "centre", phonetic: "ˈsentə" },
        { dialect: "us", spelling: "center", phonetic: "ˈsentər" }
      ])
    },
    form_groups: [
      group("suggested-group-noun-1", [
        {
          id: "suggested-plural-noun",
          form_type: "plural",
          variants: variants("suggested-plural-noun", [
            { dialect: "uk", spelling: "centres", phonetic: "ˈsentəz" },
            { dialect: "us", spelling: "centers", phonetic: "ˈsentərz" }
          ])
        }
      ])
    ]
  };

  const verbEntries: Array<
    [WordDerivedFormSlotV2["form_type"], string, string, string, string]
  > = [
    ["third_person_singular", "centres", "centers", "ˈsentəz", "ˈsentərz"],
    ["present_participle", "centring", "centering", "ˈsentrɪŋ", "ˈsentərɪŋ"],
    ["past_tense", "centred", "centered", "ˈsentəd", "ˈsentərd"],
    ["past_participle", "centred", "centered", "ˈsentəd", "ˈsentərd"]
  ];
  const verbSlots: WordDerivedFormSlotV2[] = verbEntries.map(
    ([formType, uk, us, ukPhonetic, usPhonetic], index) => ({
      id: `suggested-verb-slot-${index + 1}`,
      form_type: formType,
      variants: variants(`suggested-verb-slot-${index + 1}`, [
        { dialect: "uk", spelling: uk, phonetic: ukPhonetic },
        { dialect: "us", spelling: us, phonetic: usPhonetic }
      ])
    })
  );

  const verb: WordPosFormsV2 = {
    pos_id: "suggested-pos-verb",
    pos: "verb",
    dialect_rules: {
      spelling_mode: "distinguish",
      phonetic_mode: "distinguish"
    },
    base_form: {
      id: "suggested-base-verb",
      form_type: "base",
      variants: variants("suggested-base-verb", [
        { dialect: "uk", spelling: "centre", phonetic: "ˈsentə" },
        { dialect: "us", spelling: "center", phonetic: "ˈsentər" }
      ])
    },
    form_groups: [group("suggested-group-verb-1", verbSlots)]
  };

  return { pos: [noun, verb] };
}

function farForms(): DraftFormsStepContent {
  const base = (pos: WordPosTag, posId: string): WordPosFormsV2 => ({
    pos_id: posId,
    pos,
    dialect_rules: {
      spelling_mode: "unified",
      phonetic_mode: "distinguish"
    },
    base_form: {
      id: `${posId}-base`,
      form_type: "base",
      variants: variants(`${posId}-base`, [
        { dialect: "uk", spelling: "far", phonetic: "fɑː" },
        { dialect: "us", spelling: "far", phonetic: "fɑːr" }
      ])
    },
    form_groups: [
      group(`${posId}-farther`, [
        {
          id: `${posId}-farther-comparative`,
          form_type: "comparative",
          variants: variants(`${posId}-farther-comparative`, [
            { dialect: "uk", spelling: "farther", phonetic: "ˈfɑːðə" },
            { dialect: "us", spelling: "farther", phonetic: "ˈfɑːrðər" }
          ])
        },
        {
          id: `${posId}-farther-superlative`,
          form_type: "superlative",
          variants: variants(`${posId}-farther-superlative`, [
            { dialect: "uk", spelling: "farthest", phonetic: "ˈfɑːðɪst" },
            { dialect: "us", spelling: "farthest", phonetic: "ˈfɑːrðɪst" }
          ])
        }
      ]),
      group(
        `${posId}-further`,
        [
          {
            id: `${posId}-further-comparative`,
            form_type: "comparative",
            variants: variants(`${posId}-further-comparative`, [
              { dialect: "uk", spelling: "further", phonetic: "ˈfɜːðə" },
              { dialect: "us", spelling: "further", phonetic: "ˈfɜːrðər" }
            ])
          },
          {
            id: `${posId}-further-superlative`,
            form_type: "superlative",
            variants: variants(`${posId}-further-superlative`, [
              { dialect: "uk", spelling: "furthest", phonetic: "ˈfɜːðɪst" },
              { dialect: "us", spelling: "furthest", phonetic: "ˈfɜːrðɪst" }
            ])
          }
        ],
        false
      )
    ]
  });

  return {
    pos: [
      base("adjective", "suggested-pos-adjective"),
      base("adverb", "suggested-pos-adverb")
    ]
  };
}

function genericForms(headword: string): DraftFormsStepContent {
  return {
    pos: [
      {
        pos_id: "suggested-pos-noun",
        pos: "noun",
        dialect_rules: {
          spelling_mode: "unified",
          phonetic_mode: "unified"
        },
        base_form: {
          id: "suggested-base-noun",
          form_type: "base",
          variants: variants("suggested-base-noun", [
            { dialect: "common", spelling: headword, phonetic: "mock" }
          ])
        },
        form_groups: [group("suggested-group-noun", [])]
      }
    ]
  };
}

function matchedResponse(
  input: DetectWordInputV2,
  detectionId: string,
  expiresAt: string,
  normalized: string,
  headwords: WordHeadwordsV2,
  suggestedForms: DraftFormsStepContent,
  options: {
    entryKind?: "word" | "phrase";
    smart?: DetectWordResponseV2["smart_dictionary"];
    matchedDialect?: "uk" | "us" | "common";
  } = {}
): DetectWordResponseV2 {
  return {
    detection_id: detectionId,
    expires_at: expiresAt,
    request: input,
    normalized_headword: normalized,
    entry_kind: options.entryKind ?? "word",
    matched_dialect: options.matchedDialect ?? "common",
    builtin_dictionary: {
      status: "matched",
      headwords,
      suggested_forms: suggestedForms
    },
    smart_dictionary: options.smart ?? { status: "clear", duplicates: [] }
  };
}

export function normalizeFixtureHeadword(value: string): {
  display: string;
  key: string;
} {
  const display = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  const key = display
    .replace(/[‘’ʼ]/gu, "'")
    .replace(/[‐‑‒–—−]/gu, "-")
    .toLocaleLowerCase("en");
  return { display, key };
}

/** Contract-shaped detection fixtures consumed only by the mock data source. */
export function createDetectionFixture(
  input: DetectWordInputV2,
  detectionId: string,
  nowMs: number
): DetectWordResponseV2 {
  const normalized = normalizeFixtureHeadword(input.headword);
  const request = { ...input, headword: normalized.display };
  const expiresAt = new Date(
    normalized.key === "expired" ? nowMs - 1 : nowMs + 5 * 60_000
  ).toISOString();
  const base = {
    detection_id: detectionId,
    expires_at: expiresAt,
    request,
    normalized_headword: normalized.key,
    entry_kind: "word" as const,
    smart_dictionary: { status: "clear" as const, duplicates: [] as [] }
  };

  if (normalized.key === "not-found") {
    return { ...base, builtin_dictionary: { status: "not_found" } };
  }
  if (normalized.key === "builtin-unavailable") {
    return {
      ...base,
      builtin_dictionary: { status: "unavailable", retry_after_seconds: 3 }
    };
  }

  if (normalized.key === "center") {
    return matchedResponse(
      request,
      detectionId,
      expiresAt,
      normalized.key,
      { mode: "distinguish", uk: "centre", us: "center", source_dialect: "us" },
      centerForms(),
      { matchedDialect: "us" }
    );
  }
  if (normalized.key === "far") {
    return matchedResponse(
      request,
      detectionId,
      expiresAt,
      normalized.key,
      { mode: "unified", common: "far" },
      farForms()
    );
  }
  if (normalized.key === "in front of") {
    return matchedResponse(
      request,
      detectionId,
      expiresAt,
      normalized.key,
      { mode: "unified", common: normalized.display },
      genericForms(normalized.display),
      { entryKind: "phrase" }
    );
  }
  if (normalized.display.includes(" ")) {
    return {
      ...base,
      entry_kind: "phrase",
      builtin_dictionary: { status: "not_found" }
    };
  }
  if (normalized.key === "color" || normalized.key === "colour") {
    return matchedResponse(
      request,
      detectionId,
      expiresAt,
      normalized.key,
      {
        mode: "distinguish",
        uk: "colour",
        us: "color",
        source_dialect: normalized.key === "color" ? "us" : "uk"
      },
      genericForms(normalized.display),
      { matchedDialect: normalized.key === "color" ? "us" : "uk" }
    );
  }
  if (normalized.key === "smart-unavailable") {
    return matchedResponse(
      request,
      detectionId,
      expiresAt,
      normalized.key,
      { mode: "unified", common: normalized.display },
      genericForms(normalized.display),
      { smart: { status: "unavailable", duplicates: [] } }
    );
  }

  return matchedResponse(
    request,
    detectionId,
    expiresAt,
    normalized.key,
    { mode: "unified", common: normalized.display },
    genericForms(normalized.display)
  );
}

function emptyEnglishText(
  headwords: WordHeadwordsV2,
  nodeKey: string
): EnglishTextV2 {
  if (headwords.mode === "unified") {
    return {
      mode: "unified",
      common: {
        id: `${nodeKey}-en-common`,
        value: richText(""),
        origin: "manual"
      }
    };
  }
  const source = {
    state: "ready" as const,
    variant: {
      id: `${nodeKey}-en-${headwords.source_dialect}`,
      value: richText(""),
      origin: "manual" as const
    }
  };
  return {
    mode: "distinguish",
    source_dialect: headwords.source_dialect,
    uk: headwords.source_dialect === "uk" ? source : { state: "missing" },
    us: headwords.source_dialect === "us" ? source : { state: "missing" }
  };
}

function createInitialPosMeanings(
  formsPos: WordPosFormsV2,
  headwords: WordHeadwordsV2,
  wordId: string,
  nodeKey: string,
  count: number,
  large: boolean,
  senseGroupId: string
): WordPosMeaningsV2 {
  const grammarId = `mock-grammar-${nodeKey}`;
  const grammarDialects =
    headwords.mode === "unified"
      ? (["common"] as const)
      : (["uk", "us"] as const);
  return {
    pos_id: formsPos.pos_id,
    grammar_structures: [
      {
        id: grammarId,
        variants: grammarDialects.map((dialect) => ({
          id: `${grammarId}-${dialect}`,
          dialect,
          content: richText(large ? "the large fixture" : "")
        }))
      }
    ],
    senses: Array.from({ length: count }, (_, index) => {
      const senseId = `mock-sense-${nodeKey}-${index + 1}`;
      return {
        id: senseId,
        sub_pos: large
          ? formsPos.pos === "verb"
            ? ("V-T" as const)
            : ("N-COUNT" as const)
          : ("" as const),
        level: "A1" as const,
        sense_group_id: senseGroupId,
        frequency: large ? "1" : undefined,
        depends_on_context: false,
        definitions: [
          {
            id: `${senseId}-definition`,
            level: "A1" as const,
            definition_mode: "zh_definition" as const,
            content_id: `${senseId}-definition-content`,
            content: richText(large ? `大数据词义 ${index + 1}` : "")
          }
        ],
        sentences: [
          {
            id: `${senseId}-sentence`,
            level: "A1" as const,
            en_text: large
              ? headwords.mode === "unified"
                ? {
                    mode: "unified" as const,
                    common: {
                      id: `${senseId}-sentence-en-common`,
                      value: richText(`Large fixture example ${index + 1}.`),
                      origin: "manual" as const
                    }
                  }
                : emptyEnglishText(headwords, `${senseId}-sentence`)
              : emptyEnglishText(headwords, `${senseId}-sentence`),
            zh_text_id: `${senseId}-sentence-zh`,
            zh_text: richText(large ? `大数据例句 ${index + 1}` : ""),
            links: [
              { word_id: wordId, sense_id: senseId, role: "focus" as const }
            ]
          }
        ],
        relations: []
      };
    })
  };
}

/**
 * Initialize meanings for a POS added after word creation. The POS id is the
 * stable namespace, so its generated descendants cannot reuse positional ids
 * already present on the word.
 */
export function createInitialMeaningsForAddedPos(
  formsPos: WordPosFormsV2,
  headwords: WordHeadwordsV2,
  wordId: string,
  senseGroupId: string
): WordPosMeaningsV2 {
  return createInitialPosMeanings(
    formsPos,
    headwords,
    wordId,
    `pos-${encodeURIComponent(formsPos.pos_id)}`,
    1,
    false,
    senseGroupId
  );
}

export function createInitialSenseGroup(
  wordId: string,
  complete = false
): SenseGroupV2 {
  return {
    id: `mock-sense-group-${encodeURIComponent(wordId)}-1`,
    name_zh: complete ? "默认语义区间" : "",
    name_en: complete ? "Default semantic range" : ""
  };
}

export function createInitialMeanings(
  forms: DraftFormsStepContent,
  headwords: WordHeadwordsV2,
  wordId: string,
  large = false
): DraftMeaningsStepContent {
  const count = large ? 38 : 1;
  const defaultSenseGroup = createInitialSenseGroup(wordId, large);
  const pos = forms.pos.map((formsPos, posIndex) =>
    createInitialPosMeanings(
      formsPos,
      headwords,
      wordId,
      String(posIndex + 1),
      posIndex === 0 ? count : 1,
      large,
      defaultSenseGroup.id
    )
  );
  return { sense_groups: [defaultSenseGroup], pos };
}
