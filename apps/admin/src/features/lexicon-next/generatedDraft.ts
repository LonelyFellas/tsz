import type {
  NextDraft,
  NextDialectSense,
  NextAgentResult,
  NextAgentGroup,
  NextSenseGroup,
  NextSentence,
  NextDefinition,
  PartOfSpeechCatalogResponse
} from "@tsz/types";
import type { GenerationTarget } from "./generationContext";
import { isSharedForms } from "@tsz/shared";
import { planFormCandidates } from "@/features/dictionary/assistant/formCandidatesModel";
import { normalizeSentenceSurface } from "@/features/sentences/associationModel";
import { emptyFormEditor } from "./FormsStep";
import {
  generalSense,
  grammarSubPosValid,
  newSense,
  newGrammarStructure
} from "./model";
import { newSentenceVariant } from "./sentenceDrafts";
import { equivalentKey } from "./equivalents";
import { generatedRelationCandidates } from "./generatedRelations";

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

function fillSenseGroups(
  draft: NextDraft,
  indexed: NextDraft["senses"],
  proposals: NextAgentGroup[]
) {
  if (!proposals.length) return;
  const groups = draft.sense_groups ?? [];
  const isBlank = (group: NextSenseGroup) =>
    !group.name_en.trim() && !group.name_zh.trim();
  const namedGroup = (row: NextAgentGroup) =>
    groups.find((g) => g.name_en === row.name_en && g.name_zh === row.name_zh);
  const bySense = new Map<string, NextAgentGroup>();
  for (const row of proposals) {
    const sense = indexed[row.sense];
    if (
      !sense ||
      bySense.has(sense.id) ||
      !validGeneratedText(row.name_zh, 200) ||
      !validGeneratedText(row.name_en, 200)
    )
      continue;
    const original = groups.find((g) => g.id === sense.sense_group_id);
    if (!original || isBlank(original)) bySense.set(sense.id, row);
  }
  if (!bySense.size) return;

  // Resolve shared placeholders before moving any sense. An unselected owner keeps its group.
  const vacated = new Set<string>();
  const unused: NextSenseGroup[] = [];
  for (const group of groups.filter(isBlank)) {
    const owners = draft.senses.filter((s) => s.sense_group_id === group.id);
    if (!owners.length) {
      unused.push(group);
      continue;
    }
    if (!owners.every((s) => bySense.has(s.id))) continue;
    const target = owners
      .map((s) => bySense.get(s.id)!)
      .find((row) => !namedGroup(row));
    if (target) {
      group.name_en = target.name_en;
      group.name_zh = target.name_zh;
    } else vacated.add(group.id);
  }

  for (const sense of draft.senses) {
    const row = bySense.get(sense.id);
    if (!row) continue;
    let group = namedGroup(row);
    if (!group) {
      // Preserve the existing empty-slot behavior for senses without a group.
      group = !sense.sense_group_id ? unused.shift() : undefined;
      if (!group) {
        group = {
          id: crypto.randomUUID(),
          name_en: row.name_en,
          name_zh: row.name_zh
        };
        groups.push(group);
      } else {
        group.name_en = row.name_en;
        group.name_zh = row.name_zh;
      }
    }
    sense.sense_group_id = group.id;
  }
  draft.sense_groups = groups.filter((g) => !vacated.has(g.id));
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
  binding?: GenerationTarget,
  sourceRunId = result.run_id
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
          dialect: section === "senses" ? result.proposals.dialect : [],
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
  fillSenseGroups(draft, indexed, proposals.groups);
  for (const row of proposals.grammar) {
    const pattern = row.pattern.trim();
    if (
      !validGeneratedText(pattern, 500) ||
      (binding?.pos && row.pos !== binding.pos)
    )
      continue;
    const grammars = (draft.grammar_structures ??= []);
    const samePos = grammars.filter((g) => g.part_of_speech === row.pos);
    const subPos = grammarSubPosValid(row.pos, row.sub_pos, catalog)
      ? row.sub_pos
      : undefined;
    const existing = samePos.find((grammar) =>
      grammar.variants.some(
        (v) =>
          (v.locale === target || v.locale === "en") &&
          v.content.text.trim() === pattern
      )
    );
    if (existing) {
      if (!existing.sub_pos && subPos) existing.sub_pos = subPos;
      continue;
    }

    const writable = samePos.flatMap((grammar) => {
      const variant = grammar.variants.find((v) => v.locale === target);
      if (
        !variant ||
        variant.content.text.trim() ||
        variant.audio_assets?.length ||
        variant.form_links?.length
      )
        return [];
      const { content } = variant;
      const annotated =
        content.version === 2
          ? content.annotations.length
          : content.spans.length || content.liaisons.length;
      return annotated ? [] : [{ grammar, variant }];
    });
    // Prefer the matching regional row before using a completely blank placeholder.
    const placeholder =
      writable.find(({ grammar }) =>
        grammar.variants.some((v) => v.content.text.trim() === pattern)
      ) ??
      writable.find(
        ({ grammar }) =>
          (!subPos || !grammar.sub_pos || grammar.sub_pos === subPos) &&
          grammar.variants.every((v) => !v.content.text.trim())
      );
    const content = { version: 2 as const, text: pattern, annotations: [] };
    if (placeholder) {
      placeholder.variant.content = content;
      if (!placeholder.grammar.sub_pos && subPos)
        placeholder.grammar.sub_pos = subPos;
    } else {
      const grammar = newGrammarStructure(row.pos);
      const variant = grammar.variants.find((v) => v.locale === target);
      if (!variant) continue;
      variant.content = content;
      if (subPos) grammar.sub_pos = subPos;
      grammars.push(grammar);
    }
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
  for (const row of generatedRelationCandidates(
    draft,
    proposals.relations,
    indexed.length
  )) {
    const sense = indexed[row.sense]!;
    const rels = (sense.relations ??= []);
    const key = normalizeSentenceSurface(row.word);
    const existing = rels.filter(
      (r) =>
        r.relation === row.kind &&
        ((row.target && r.target_word_id === row.target.entry_id) ||
          normalizeSentenceSurface(r.pending_target_headword ?? "") === key)
    );
    if (
      existing.length &&
      (row.kind !== "derivative" ||
        existing.some(
          (r) =>
            (row.target && r.target_sense_id === row.target.sense_id) ||
            r.pending_target_gloss?.trim() === row.gloss
        ))
    )
      continue;
    rels.push({
      id: crypto.randomUUID(),
      relation: row.kind,
      ...(row.target
        ? {
            target_word_id: row.target.entry_id,
            target_sense_id: row.target.sense_id
          }
        : {
            pending_target_headword:
              existing[0]?.pending_target_headword ?? row.word,
            pending_target_gloss: row.gloss
          }),
      score: existing[0]?.score ?? String(row.score)
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
          locator: sourceRunId
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
