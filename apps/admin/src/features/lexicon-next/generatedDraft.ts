import type {
  NextDraft,
  NextDialectSense,
  NextAgentResult,
  NextSentence,
  NextDefinition,
  PartOfSpeechCatalogResponse
} from "@tsz/types";
import type { GenerationTarget } from "./generationContext";
import { isSharedForms } from "@tsz/shared";
import { planFormCandidates } from "@/features/dictionary/assistant/formCandidatesModel";
import { emptyFormEditor } from "./FormsStep";
import { generalSense, newSense, newGrammarStructure } from "./model";
import { newSentenceVariant } from "./sentenceDrafts";
import { equivalentKey } from "./equivalents";

function validGeneratedText(text: string, limit: number, multiline = false) {
  return (
    !!text.trim() &&
    [...text].length <= limit &&
    !/\p{Cc}/u.test(multiline ? text.replace(/[\r\n]/g, "") : text)
  );
}

export function generationSenses(
  draft: NextDraft,
  medium: string,
  target?: GenerationTarget
) {
  if (target?.section === "forms") return [];
  return draft.senses
    .filter((s) => {
      if (!s.part_of_speech || (target?.pos && s.part_of_speech !== target.pos))
        return false;
      if (target?.senseId) return s.id === target.senseId;
      if (target?.section === "groups") return true;
      return (
        s.definitions.some((d) => d.text.trim()) ||
        s.equivalents.some((e) => e.text.trim()) ||
        !!s.sentence_ids?.length ||
        !!s.relations?.length
      );
    })
    .map((s) => ({
      id: s.id,
      pos: s.part_of_speech!,
      gloss: Array.from(
        s.definitions.find((d) => d.locale === medium && d.text.trim())?.text ||
          s.definitions.find((d) => d.text.trim())?.text ||
          s.equivalents.find((e) => e.text.trim())?.text ||
          ""
      )
        .slice(0, 500)
        .join("")
    }));
}

export function fillGeneratedDraft(
  current: NextDraft,
  result: NextAgentResult,
  catalog: PartOfSpeechCatalogResponse,
  target: string,
  medium: string,
  owner: string,
  existingExamples: NextSentence[] = [],
  sentenceResources: Record<string, NextSentence> = {},
  existingDialect: NextDialectSense[] = [],
  binding?: GenerationTarget
) {
  const draft = structuredClone(current);
  // Only the clicked section may write, even when the supervisor returns prerequisites.
  const section = binding?.section;
  const proposals =
    section && section !== "all"
      ? ({
          forms: [],
          senses: [],
          groups: [],
          grammar: [],
          definitions: [],
          equivalents: [],
          relations: [],
          dialect: [],
          examples: [],
          translations: [],
          [section]: result.proposals[section]
        } as NextAgentResult["proposals"])
      : result.proposals;
  const originals = generationSenses(current, medium, binding);
  const ids = originals.map((s) => s.id);
  const resources: NextSentence[] = [];
  const forms = planFormCandidates(
    draft.form_editor ?? emptyFormEditor(),
    proposals.forms,
    catalog.items
  );
  if (forms.changed && isSharedForms(forms.forms))
    draft.form_editor = forms.forms;
  const definition = (locale: string, text: string): NextDefinition => ({
    id: crypto.randomUUID(),
    locale,
    text,
    style: "definition"
  });
  const fillDefinition = (
    sense: NextDraft["senses"][number],
    locale: string,
    text: string
  ) => {
    if (!validGeneratedText(text, 5000, true)) return;
    // A regional definition also inherits the common English row.
    if (
      sense.definitions.some(
        (d) =>
          (d.locale === locale ||
            (locale.startsWith("en-") && d.locale === "en")) &&
          d.text.trim()
      )
    )
      return;
    const blank = sense.definitions.find(
      (d) => d.locale === locale && !d.content?.text && !d.audio_assets?.length
    );
    if (blank) {
      blank.text = text;
      if (blank.content) blank.content = { version: 2, text, annotations: [] };
    } else sense.definitions.push(definition(locale, text));
  };
  for (const row of proposals.senses) {
    if (binding?.pos && row.pos !== binding.pos) continue;
    const matching = originals.find(
      (s) => s.pos === row.pos && s.gloss.trim() === row.gloss.trim()
    );
    if (matching) {
      ids.push(matching.id);
      continue;
    }
    // Preserve editor-owned IDs and metadata on placeholders created from detected POS.
    const existing = draft.senses.find(
      (s) =>
        s.part_of_speech === row.pos &&
        !ids.includes(s.id) &&
        !s.definitions.some((d) => d.text.trim()) &&
        !s.equivalents.some((e) => e.text.trim())
    );
    const sense = existing ?? newSense(row.pos, undefined, true);
    if (!existing) {
      sense.level = row.level;
      draft.senses.push(sense);
    }
    ids.push(sense.id);
    // Keep the identifying gloss when the separate definition agent has no explanation.
    if (!proposals.definitions.some((d) => d.sense === ids.length - 1))
      fillDefinition(sense, medium, row.gloss);
  }
  const indexed = ids.map((id) => draft.senses.find((s) => s.id === id)!);
  for (const row of proposals.groups) {
    const sense = indexed[row.sense];
    if (
      !sense ||
      !validGeneratedText(row.name_zh, 200) ||
      !validGeneratedText(row.name_en, 200)
    )
      continue;
    const original = draft.sense_groups?.find(
      (g) => g.id === sense.sense_group_id
    );
    if (original && (original.name_en.trim() || original.name_zh.trim()))
      continue;
    const groups = (draft.sense_groups ??= []);
    let group = groups.find(
      (g) => g.name_en === row.name_en && g.name_zh === row.name_zh
    );
    if (!group) {
      group = {
        id: crypto.randomUUID(),
        name_en: row.name_en,
        name_zh: row.name_zh
      };
      groups.push(group);
    }
    sense.sense_group_id = group.id;
  }
  for (const row of proposals.grammar) {
    if (binding?.pos && row.pos !== binding.pos) continue;
    const grammars = (draft.grammar_structures ??= []);
    if (
      grammars.some(
        (g) =>
          g.part_of_speech === row.pos &&
          g.variants.some(
            (v) =>
              (v.locale === target || v.locale === "en") &&
              v.content.text.trim()
          )
      )
    )
      continue;
    let grammar = grammars.find(
      (g) =>
        g.part_of_speech === row.pos &&
        g.variants.some(
          (v) =>
            v.locale === target &&
            !v.content.text.trim() &&
            !v.audio_assets?.length
        )
    );
    if (!grammar) {
      grammar = newGrammarStructure(row.pos);
      grammars.push(grammar);
    }
    const variant = grammar.variants.find((v) => v.locale === target)!;
    variant.content = { version: 2, text: row.pattern, annotations: [] };
  }
  for (const row of proposals.definitions) {
    const sense = indexed[row.sense];
    if (sense) {
      if (!binding?.locale || binding.locale === target)
        fillDefinition(sense, target, row.english);
      if (!binding?.locale || binding.locale === medium)
        fillDefinition(sense, medium, row.explanation);
    }
  }
  for (const row of proposals.equivalents) {
    const sense = indexed[row.sense];
    if (
      !sense ||
      !validGeneratedText(row.word, 200) ||
      sense.no_equivalents?.includes(medium) ||
      sense.equivalents.some(
        (e) =>
          e.locale === medium &&
          equivalentKey(e.text) === equivalentKey(row.word)
      )
    )
      continue;
    const blank = sense.equivalents.find(
      (e) => e.locale === medium && !e.text.trim()
    );
    if (blank) blank.text = row.word;
    else
      sense.equivalents.push({
        id: crypto.randomUUID(),
        locale: medium,
        text: row.word
      });
  }
  for (const row of proposals.relations) {
    const sense = indexed[row.sense];
    if (!sense) continue;
    const rels = (sense.relations ??= []);
    if (
      !rels.some(
        (r) =>
          r.relation === row.kind &&
          r.pending_target_headword?.toLowerCase() === row.word.toLowerCase()
      )
    )
      rels.push({
        id: crypto.randomUUID(),
        relation: row.kind,
        pending_target_headword: row.word,
        pending_target_gloss: row.gloss,
        score: String(row.score)
      });
  }
  const translationsFor = (index: number) =>
    proposals.translations
      .filter((t) => t.example === index)
      .map((t) => ({
        id: crypto.randomUUID(),
        locale: medium,
        style: "balanced_fluency" as const,
        content: { version: 2 as const, text: t.text, annotations: [] },
        metadata: { freedom: 50, sources: [] }
      }));
  for (const [i, source] of existingExamples.entries()) {
    const variant = source.draft.variants.find((v) => v.locale === target);
    const additions = translationsFor(i);
    if (
      !variant ||
      !additions.length ||
      variant.translations.some(
        (t) => t.locale === medium && t.content.text.trim()
      )
    )
      continue;
    let consumed = 0;
    const translations = variant.translations.map((row) => {
      if (row.locale !== medium || consumed >= additions.length) return row;
      const candidate = additions[consumed++]!;
      return { ...row, content: candidate.content };
    });
    resources.push({
      ...source,
      draft: {
        ...source.draft,
        variants: [
          {
            ...variant,
            translations: [...translations, ...additions.slice(consumed)]
          }
        ]
      }
    });
  }
  for (const [i, row] of proposals.examples.entries()) {
    const sense = indexed[row.sense];
    if (!sense) continue;
    const duplicate = sense.sentence_ids?.some((id) =>
      (
        sentenceResources[id] ?? resources.find((s) => s.id === id)
      )?.draft.variants.some(
        (v) => v.locale === target && v.content.text.trim() === row.text.trim()
      )
    );
    if (duplicate) continue;
    const variant = newSentenceVariant(target);
    if (variant.metadata)
      variant.metadata.sources = [
        {
          id: crypto.randomUUID(),
          source_type: "ai_composed",
          title: "智能词库 Agent",
          url: "",
          locator: result.run_id
        }
      ];
    variant.level = row.level;
    variant.content.text = row.text;
    variant.translations = translationsFor(existingExamples.length + i);
    const resource: NextSentence = {
      id: crypto.randomUUID(),
      target_language: "en",
      owner_id: owner,
      revision: 0,
      updated_at: "",
      reference_count: 0,
      draft: { schema_version: 1, variants: [variant] }
    };
    resources.push(resource);
    (sense.sentence_ids ??= []).push(resource.id);
  }
  const dialect: Record<string, NextDialectSense> = {};
  for (const row of proposals.dialect) {
    const id = ids[row.sense];
    if (
      id &&
      row.usage !== "general" &&
      !existingDialect.some((s) => s.sense_id === id) &&
      !dialect[id]
    ) {
      dialect[id] = { ...generalSense(id), usage: row.usage };
    }
  }
  return { draft, resources, dialect };
}
