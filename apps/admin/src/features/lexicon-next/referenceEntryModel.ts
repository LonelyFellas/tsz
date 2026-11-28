import type { NextAgentSource } from "@tsz/types";

type ReferenceForm = { type?: string; text: string; indexed?: boolean };
type ReferenceExample = { english: string; translation?: string };
type ReferenceFormGroup =
  | { kind: "pos"; pos: string; forms: ReferenceForm[] }
  | { kind: "spellings" | "unassigned"; forms: ReferenceForm[] };

type ReferenceEntry = {
  partsOfSpeech?: string[];
  pronunciation?: { uk?: string; us?: string };
  reading?: string;
  forms?: ReferenceForm[];
  formsByPos?: { pos: string; forms: ReferenceForm[] }[];
  definitions?: string[];
  examples?: ReferenceExample[];
  grammarPatterns?: string[];
  grammarExamples?: string[];
  summary?: string;
  indexOnly?: boolean;
};

const partOfSpeechCodes: Readonly<Record<string, string>> = {
  "n.": "noun",
  "v.": "verb",
  "vt.": "verb",
  "vi.": "verb",
  "adj.": "adjective",
  "adv.": "adverb",
  "prep.": "preposition",
  "pron.": "pronoun",
  "conj.": "conjunction",
  "int.": "interjection",
  "det.": "determiner",
  "num.": "numeral",
  "art.": "article"
};

const formTypes: Readonly<Record<string, string>> = {
  原形: "base",
  复数: "plural",
  第三人称单数: "third_person_singular",
  现在分词: "present_participle",
  过去式: "past_tense",
  过去分词: "past_participle",
  比较级: "comparative",
  最高级: "superlative",
  英式拼写: "british_spelling",
  美式拼写: "american_spelling"
};

const positionOrder = [...new Set(Object.values(partOfSpeechCodes))];
const formOrder = Object.values(formTypes);
const positionsForForm: Readonly<Record<string, readonly string[]>> = {
  plural: ["noun", "pronoun"],
  third_person_singular: ["verb"],
  present_participle: ["verb"],
  past_tense: ["verb"],
  past_participle: ["verb"],
  comparative: ["adjective", "adverb"],
  superlative: ["adjective", "adverb"]
};

function rank(order: readonly string[], value: string) {
  const index = order.indexOf(value);
  return index === -1 ? order.length : index;
}

function orderedForms(forms: ReferenceForm[]): ReferenceForm[] {
  const unique = new Map<string, ReferenceForm>();
  for (const form of forms) {
    const key = JSON.stringify([form.type, form.text]);
    if (!unique.has(key)) unique.set(key, form);
  }
  return Array.from(unique.values()).sort(
    (a, b) => rank(formOrder, a.type ?? "") - rank(formOrder, b.type ?? "")
  );
}

/** Apply the same presentation groups to live results and older saved excerpts. */
export function dictionaryReferenceLayout(entry: ReferenceEntry) {
  const partsOfSpeech = Array.from(
    new Set([
      ...(entry.partsOfSpeech ?? []),
      ...(entry.formsByPos ?? []).map(({ pos }) => pos)
    ])
  ).sort((a, b) => rank(positionOrder, a) - rank(positionOrder, b));
  const byPos = new Map<string, ReferenceForm[]>();
  const spellings: ReferenceForm[] = [];
  const unassigned: ReferenceForm[] = [];

  function addForm(form: ReferenceForm, pos?: string) {
    if (form.type === "british_spelling" || form.type === "american_spelling") {
      spellings.push(form);
    } else if (pos) {
      const forms = byPos.get(pos) ?? [];
      forms.push(form);
      byPos.set(pos, forms);
    } else {
      unassigned.push(form);
    }
  }

  for (const { pos, forms } of entry.formsByPos ?? []) {
    byPos.set(pos, []);
    for (const form of forms) addForm(form, pos);
  }
  for (const form of entry.forms ?? []) {
    const eligible = positionsForForm[form.type ?? ""];
    const positions = eligible
      ? partsOfSpeech.filter((pos) => eligible.includes(pos))
      : partsOfSpeech;
    addForm(form, positions.length === 1 ? positions[0] : undefined);
  }

  const groups: ReferenceFormGroup[] = byPos.size
    ? partsOfSpeech.map((pos) => ({
        kind: "pos",
        pos,
        forms: orderedForms(byPos.get(pos) ?? [])
      }))
    : [];
  if (spellings.length)
    groups.push({ kind: "spellings", forms: orderedForms(spellings) });
  if (unassigned.length)
    groups.push({ kind: "unassigned", forms: orderedForms(unassigned) });
  return { partsOfSpeech, groups };
}

function referenceForms(text: string): ReferenceForm[] {
  const labels = [
    ...text.matchAll(
      /(?:^|[\s、])(原形|英式拼写|美式拼写|复数|第三人称单数|现在分词|过去式|过去分词|比较级|最高级)\s+/g
    )
  ];
  if (!labels.length || labels[0]!.index !== 0) {
    return text
      .split("、")
      .map((value) => ({ text: value.trim() }))
      .filter((form) => form.text);
  }
  return labels
    .map((label, i) => ({
      type: formTypes[label[1]!],
      text: text
        .slice(label.index + label[0].length, labels[i + 1]?.index)
        .trim()
    }))
    .filter((form) => form.text);
}

function readLegacyExample(text: string): ReferenceExample {
  const parts = text.split(" — ");
  // The old format used the same dash in the sentence and between languages.
  const translation = parts.findIndex(
    (part, index) => index > 0 && /\p{Script=Han}/u.test(part)
  );
  if (translation < 0) return { english: text };
  return {
    english: parts.slice(0, translation).join(" — "),
    translation: parts.slice(translation).join(" — ")
  };
}

function readStructured(
  excerpt: string,
  headword: string
): ReferenceEntry | undefined {
  const [word, ...fields] = excerpt.split(" · ");
  if (word?.toLowerCase() !== headword.toLowerCase() || !fields.length) {
    return undefined;
  }

  const entry: ReferenceEntry = {};
  const formsByPos = new Map<string, ReferenceForm[]>();
  const unknown: string[] = [];
  let hasFacts = false;
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index]!;
    const phonetics = field.match(
      /^(?:英 (\[[^\]]+\]))?(?:\s*\/\s*)?(?:美 (\[[^\]]+\]))?$/
    );
    const group = /^(词形|索引词形) (.+?) \[(.*)\]$/.exec(field);
    if (phonetics?.[1] || phonetics?.[2]) {
      hasFacts = true;
      entry.pronunciation = { uk: phonetics[1], us: phonetics[2] };
    } else if (field.startsWith("词性 ")) {
      hasFacts = true;
      const parts = field
        .slice(3)
        .split("、")
        .map((part) => part.trim())
        .filter(Boolean);
      entry.partsOfSpeech = [
        ...new Set(
          parts.map((part) =>
            Object.hasOwn(partOfSpeechCodes, part)
              ? partOfSpeechCodes[part]!
              : part
          )
        )
      ];
    } else if (group) {
      hasFacts = true;
      const [, kind, pos, forms] = group;
      const parsed = referenceForms(forms!);
      formsByPos.set(pos!, [
        ...(formsByPos.get(pos!) ?? []),
        ...(kind === "索引词形"
          ? parsed.map((form) => ({ ...form, indexed: true }))
          : parsed)
      ]);
    } else if (field.startsWith("[") && field.endsWith("]")) {
      const forms = field.slice(1, -1).trim();
      if (forms) {
        hasFacts = true;
        entry.forms = referenceForms(forms);
      }
    } else if (field.startsWith("读音标记 ")) {
      hasFacts = true;
      entry.reading = field.slice("读音标记 ".length);
    } else if (field.startsWith("释义 ")) {
      hasFacts = true;
      (entry.definitions ??= []).push(field.slice("释义 ".length));
    } else if (field.startsWith("例句原文 ")) {
      hasFacts = true;
      const example: ReferenceExample = {
        english: field.slice("例句原文 ".length)
      };
      const next = fields[index + 1];
      if (next?.startsWith("例句译文 ")) {
        example.translation = next.slice("例句译文 ".length);
        index++;
      }
      (entry.examples ??= []).push(example);
    } else if (field.startsWith("例句 ")) {
      hasFacts = true;
      (entry.examples ??= []).push(
        readLegacyExample(field.slice("例句 ".length))
      );
    } else if (
      field.startsWith("句型 ") &&
      field.slice("句型 ".length).trim()
    ) {
      hasFacts = true;
      (entry.grammarPatterns ??= []).push(field.slice("句型 ".length).trim());
    } else if (
      field.startsWith("例句证据 ") &&
      field.slice("例句证据 ".length).trim()
    ) {
      hasFacts = true;
      (entry.grammarExamples ??= []).push(
        field.slice("例句证据 ".length).trim()
      );
    } else if (field.startsWith("来源摘要 ")) {
      unknown.push(field.slice("来源摘要 ".length));
    } else {
      unknown.push(field);
    }
  }
  if (formsByPos.size) {
    const positions = new Set([
      ...(entry.partsOfSpeech ?? []),
      ...formsByPos.keys()
    ]);
    entry.formsByPos = Array.from(positions, (pos) => ({
      pos,
      forms: formsByPos.get(pos) ?? []
    }));
  }
  if (unknown.length) entry.summary = unknown.join(" · ");
  return hasFacts ? entry : undefined;
}

function readOxford(excerpt: string, headword: string): ReferenceEntry {
  const index = excerpt.match(
    /^Definition of (.+?) in (?:the )?Oxford (?:Advanced )?Learner['’]s Dictionary\.\s*(.*)$/i
  );
  if (!index) return { summary: excerpt };
  const part = index[1]!;
  const matchesWord = part.toLowerCase() === headword.toLowerCase();
  const matchesWordAndPos = part
    .toLowerCase()
    .startsWith(headword.toLowerCase() + " ");
  if (!matchesWord && !matchesWordAndPos) return { summary: excerpt };
  const pos = matchesWordAndPos ? part.slice(headword.length + 1) : undefined;
  const summary = index[2]!;
  const indexOnly =
    !summary ||
    /^Meaning, pronunciation, picture, example sentences, grammar, usage notes, synonyms and more\.?$/i.test(
      summary
    );
  return {
    partsOfSpeech: pos ? [pos] : undefined,
    indexOnly,
    summary: indexOnly ? undefined : summary
  };
}

function labelWebsterVerbForms(
  forms: ReferenceForm[],
  headword: string
): ReferenceForm[] {
  const word = headword.toLowerCase();
  if (!/^[a-z]+$/.test(word)) return forms;

  const consonantY = /[^aeiou]y$/.test(word);
  const thirdPerson = consonantY
    ? word.slice(0, -1) + "ies"
    : word + (/(?:[sxz]|[cs]h)$/.test(word) ? "es" : "s");
  const dropsE = word.endsWith("e") && !/(?:ee|oe|ye)$/.test(word);
  const presentStem = word.endsWith("ie")
    ? word.slice(0, -2) + "y"
    : dropsE
      ? word.slice(0, -1)
      : word;
  const past = consonantY
    ? word.slice(0, -1) + "ied"
    : word + (word.endsWith("e") ? "d" : "ed");
  const pastTypes = ["past_tense", "past_participle"];
  const candidates = new Map([
    [thirdPerson, ["third_person_singular"]],
    [presentStem + "ing", ["present_participle"]],
    [past, pastTypes]
  ]);
  if (/[b-df-hj-np-tv-z][aeiou][b-df-hj-np-tvz]$/.test(word)) {
    const doubled = word + word.slice(-1);
    candidates.set(doubled + "ing", ["present_participle"]);
    candidates.set(doubled + "ed", pastTypes);
  }

  return forms.flatMap((form) => {
    const types = form.type
      ? undefined
      : candidates.get(form.text.toLowerCase());
    return types ? types.map((type) => ({ ...form, type })) : [form];
  });
}

function readMerriamWebster(excerpt: string, headword: string): ReferenceEntry {
  const prefix = `The meaning of ${headword} is `;
  if (!excerpt.toLowerCase().startsWith(prefix.toLowerCase()))
    return { summary: excerpt };
  let definition = excerpt.slice(prefix.length);
  const footer = ` How to use ${headword} in a sentence.`;
  if (definition.toLowerCase().endsWith(footer.toLowerCase())) {
    definition = definition.slice(0, -footer.length);
  }
  return { definitions: [definition] };
}

function readCambridge(excerpt: string, headword: string): ReferenceEntry {
  const prefix = `${headword} definition:`;
  if (!excerpt.toLowerCase().startsWith(prefix.toLowerCase()))
    return { summary: excerpt };
  const text = excerpt
    .slice(prefix.length)
    .replace(/\s*Learn more\.?$/i, "")
    .trim();
  const markers = [...text.matchAll(/(?:^|\s)(\d+)\.\s+/g)];
  if (
    !markers.length ||
    markers.some((marker, i) => Number(marker[1]) !== i + 1) ||
    markers[0]!.index !== 0
  ) {
    return { summary: text || excerpt };
  }
  return {
    definitions: markers
      .map((marker, i) =>
        text
          .slice(marker.index + marker[0].length, markers[i + 1]?.index)
          .trim()
      )
      .filter(Boolean)
  };
}

/** Format the evidence actually returned for this run. Keep unknown excerpts intact. */
export function dictionaryReferenceEntry(
  source: NextAgentSource | undefined,
  headword: string
): ReferenceEntry {
  if (source?.status !== "found") return {};
  const excerpt = source.excerpt.trim();
  const word = headword.trim();
  if (!excerpt) return {};
  const structured = readStructured(excerpt, word);
  if (source.source === "Merriam-Webster" && structured?.formsByPos) {
    structured.formsByPos = structured.formsByPos.map((group) =>
      group.pos === "verb"
        ? { ...group, forms: labelWebsterVerbForms(group.forms, word) }
        : group
    );
  }
  const summary = structured ? structured.summary : excerpt;
  if (!summary) return structured ?? {};

  let reference: ReferenceEntry;
  switch (source.source) {
    case "Oxford Learner’s Dictionaries":
      reference = readOxford(summary, word);
      break;
    case "Merriam-Webster":
      reference = readMerriamWebster(summary, word);
      break;
    case "Cambridge Dictionary":
      reference = readCambridge(summary, word);
      break;
    default:
      reference = { summary };
  }
  if (structured) {
    const { summary: _raw, ...facts } = structured;
    return { ...reference, ...facts };
  }
  return reference;
}
