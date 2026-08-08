import type {
  AdminWordV2,
  DetectWordResponseV2,
  DraftFormsStepContent,
  DraftMeaningsStepContent,
  EnglishTextV2,
  WordHeadwordsV2
} from "@tsz/types";
import {
  createDetectionFixture,
  createInitialMeanings,
  richText
} from "../mock/fixtures";

export function detectionFixture(
  headword = "center",
  detectionId = `detection-${headword.replaceAll(" ", "-")}`
): DetectWordResponseV2 {
  // Detection responses are intentionally short-lived in production. Generate
  // them relative to the test clock so a fixture cannot silently expire as the
  // calendar advances.
  return createDetectionFixture(
    { language: "en", headword },
    detectionId,
    Date.now()
  );
}

function readyEnglishText(
  headwords: WordHeadwordsV2,
  text: string
): EnglishTextV2 {
  if (headwords.mode === "unified") {
    return {
      mode: "unified",
      common: { value: richText(text), origin: "manual" }
    };
  }
  return {
    mode: "distinguish",
    source_dialect: headwords.source_dialect,
    uk: {
      state: "ready",
      variant: {
        value: richText(text.replace("center", "centre")),
        origin: "manual"
      }
    },
    us: {
      state: "ready",
      variant: {
        value: richText(text.replace("centre", "center")),
        origin: "manual"
      }
    }
  };
}

export function completeMeanings(
  content: DraftMeaningsStepContent,
  headwords: WordHeadwordsV2
): DraftMeaningsStepContent {
  return {
    sense_groups: structuredClone(content.sense_groups),
    pos: content.pos.map((pos, posIndex) => ({
      ...pos,
      grammar_structures: pos.grammar_structures.map((grammar) => ({
        ...grammar,
        variants: grammar.variants.map((variant) => ({
          ...variant,
          content: richText(
            variant.dialect === "uk" ? "a centre" : "the center"
          )
        }))
      })),
      senses: pos.senses.map((sense, senseIndex) => ({
        ...sense,
        sub_pos: posIndex === 0 ? "N-COUNT" : "V-T",
        frequency: "12.5",
        definitions: sense.definitions.map((definition) => ({
          ...definition,
          definition_mode: "zh_definition" as const,
          content: richText(`测试释义 ${senseIndex + 1}`)
        })),
        sentences: sense.sentences.map((sentence) => ({
          ...sentence,
          en_text: readyEnglishText(headwords, "The center is here."),
          zh_text: richText("中心在这里。")
        }))
      }))
    }))
  };
}

interface WordFixtureOptions {
  headword?: string;
  id?: string;
  revision?: number;
  status?: AdminWordV2["status"];
  ready?: boolean;
  forms?: DraftFormsStepContent;
  meanings?: DraftMeaningsStepContent;
  completed_steps?: AdminWordV2["completed_steps"];
  max_reachable_step?: AdminWordV2["max_reachable_step"];
}

export function wordFixture(options: WordFixtureOptions = {}): AdminWordV2 {
  const detection = detectionFixture(options.headword ?? "center");
  if (detection.builtin_dictionary.status !== "matched") {
    throw new Error("word fixture requires a matched dictionary response");
  }
  const id = options.id ?? "word-center";
  const headwords = detection.builtin_dictionary.headwords;
  const forms = structuredClone(
    options.forms ?? detection.builtin_dictionary.suggested_forms
  );
  const status = options.status ?? "draft";
  const ready = options.ready ?? status === "published";
  const initialMeanings =
    options.meanings ?? createInitialMeanings(forms, headwords, id);
  const meanings = ready
    ? completeMeanings(initialMeanings, headwords)
    : structuredClone(initialMeanings);

  return {
    schema_version: 2,
    id,
    language: "en",
    kind: "word",
    status,
    revision: options.revision ?? 3,
    headwords,
    frequency: "12.5",
    detection_snapshot: {
      detection_id: detection.detection_id,
      request: detection.request,
      normalized_headword: detection.normalized_headword,
      entry_kind: "word",
      matched_dialect: detection.matched_dialect ?? "common",
      builtin_dictionary_status: "matched",
      smart_dictionary_status: "clear",
      headwords,
      suggested_pos: forms.pos.map((pos) => pos.pos),
      detected_at: "2026-08-02T03:00:00.000Z"
    },
    forms,
    meanings,
    completed_steps:
      options.completed_steps ??
      (ready ? ["basics", "forms", "meanings"] : ["basics"]),
    max_reachable_step:
      options.max_reachable_step ?? (ready ? "preview" : "forms"),
    created_by: "admin-test",
    created_at: "2026-08-02T03:00:00.000Z",
    updated_at: "2026-08-02T03:05:00.000Z",
    ...(status === "published"
      ? { published_at: "2026-08-02T03:10:00.000Z" }
      : {})
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
