import { lexiconEditorPanelMessages } from "../i18n/editor-panel-messages";

export class FormCopyError extends Error {
  constructor(readonly messageKey: keyof typeof lexiconEditorPanelMessages) {
    super(lexiconEditorPanelMessages[messageKey][0]);
  }
}
import { regionalVariants } from "@tsz/shared";
import type {
  FormContentV3,
  FormContentVariantV3,
  PronunciationSynthesisCandidateV3,
  PronunciationSynthesisV3,
  RichTextV2V3,
  SharedFormsStepContentV3,
  VoiceProfileV3,
  WordPronunciationV3
} from "@tsz/types";
import {
  pronunciationLocale,
  speechAccentGroup,
  synthesisForLocale
} from "@tsz/shared";
import {
  clearVoiceAudio,
  localVoiceProfile,
  newVoiceVersionId
} from "@tsz/voice-editor/core";
import { sharedContentForForm } from "./sharedFormsModel";

export type FormCopyKind = "phonetics" | "voices";
export type FormCopySide = "uk" | "us";

/** Keys are pronunciation content-slot IDs; null explicitly skips a target. */
export type FormCopyMapping = Partial<
  Record<FormCopySide, Record<string, string | null>>
>;

export interface FormCopyPronunciationReference {
  region: "common" | FormCopySide;
  variantId: string;
  pronunciationId: string;
  index: number;
  spelling: string;
}

export interface FormCopyPlan {
  kind: FormCopyKind;
  source: {
    formId: string;
    contentId: string;
    contentSnapshot: FormContentV3;
  };
  target: {
    formId: string;
    contentId: string;
    contentSnapshot: FormContentV3;
  };
  matches: {
    side: FormCopySide;
    source: FormCopyPronunciationReference | null;
    target: FormCopyPronunciationReference;
    requiresMapping: boolean;
  }[];
  counts: { source: number; target: number; matched: number; skipped: number };
  sameContent: boolean;
  needsMapping: boolean;
  warnings: string[];
}

/** Effective profiles are resolved by the caller against source.contentSnapshot. */
export interface ResolvedFormCopyProfile {
  side: FormCopySide;
  sourcePronunciationId: string;
  channel: "ipa" | "ups" | "fallback";
  profile: VoiceProfileV3;
  /** Profile entries have already been scoped using the current voice catalogue. */
  sideScoped?: boolean;
}

const SIDES = ["uk", "us"] as const;
const ALPHABETS = ["ipa", "ups"] as const;

export function variantForCopyReference(
  content: FormContentV3,
  ref: FormCopyPronunciationReference
) {
  const variant = regionalVariants(content.regional_variants).find(
    (row) => row.id === ref.variantId
  );
  if (!variant) throw new FormCopyError("copy_spelling_changed");
  return variant;
}

function reference(
  region: "common" | FormCopySide,
  variant: FormContentVariantV3,
  index: number
): FormCopyPronunciationReference {
  return {
    region,
    variantId: variant.id,
    pronunciationId: variant.pronunciations[index]!.id,
    index,
    spelling: variant.spelling
  };
}

export function planFormCopy(
  forms: SharedFormsStepContentV3,
  sourceFormId: string,
  targetFormId: string,
  kind: FormCopyKind,
  mapping: FormCopyMapping = {}
): FormCopyPlan {
  const source = sharedContentForForm(forms, sourceFormId);
  const target = sharedContentForForm(forms, targetFormId);
  if (!source || !target) throw new FormCopyError("copy_form_missing");
  const matches: FormCopyPlan["matches"] = [];
  let sourceCount = 0;
  for (const side of SIDES) {
    const references = (content: FormContentV3) =>
      regionalVariants(content.regional_variants, side).flatMap((variant) =>
        variant.pronunciations.map((_, index) =>
          reference(
            content.regional_variants.mode === "common" ? "common" : side,
            variant,
            index
          )
        )
      );
    const from = references(source);
    const to = references(target);
    sourceCount += from.length;
    for (const [index, pronunciation] of to.entries()) {
      const explicit = mapping[side]?.[pronunciation.pronunciationId];
      const needsChoice = from.length > 0 && from.length !== to.length;
      const sourceIndex =
        explicit === null
          ? -1
          : explicit !== undefined
            ? from.findIndex((row) => row.pronunciationId === explicit)
            : needsChoice
              ? -1
              : index;
      if (explicit != null && sourceIndex < 0)
        throw new FormCopyError("copy_source_pronunciation_missing");
      matches.push({
        side,
        source: from[sourceIndex] ?? null,
        target: pronunciation,
        requiresMapping: needsChoice && explicit === undefined
      });
    }
  }

  const sameContent = source.id === target.id;
  const hasRecordings = matches.some((match) => {
    const variant = variantForCopyReference(target, match.target);
    return (
      match.source &&
      variant.pronunciations[match.target.index]?.audio_assets?.length
    );
  });
  return {
    kind,
    source: {
      formId: sourceFormId,
      contentId: source.id,
      contentSnapshot: structuredClone(source)
    },
    target: {
      formId: targetFormId,
      contentId: target.id,
      contentSnapshot: structuredClone(target)
    },
    matches,
    counts: {
      source: sourceCount,
      target: matches.length,
      matched: matches.filter((match) => match.source).length,
      skipped: matches.filter(
        (match) => !match.source && !match.requiresMapping
      ).length
    },
    sameContent,
    needsMapping:
      !sameContent && matches.some((match) => match.requiresMapping),
    warnings:
      !sameContent && kind === "phonetics" && hasRecordings
        ? ["目标真人录音将保留；复制音标后请重新审听，确认录音与新音标一致。"]
        : []
  };
}

function pronunciationAt(
  content: FormContentV3,
  ref: FormCopyPronunciationReference
) {
  const variant = variantForCopyReference(content, ref);
  const row = variant?.pronunciations.find(
    (item) => item.id === ref.pronunciationId
  );
  if (!row || variant?.id !== ref.variantId)
    throw new FormCopyError("copy_pronunciation_changed");
  return row;
}

function candidateForSide(
  row: WordPronunciationV3,
  region: FormCopyPronunciationReference["region"],
  side: FormCopySide
): PronunciationSynthesisCandidateV3 | undefined {
  if (!row.synthesis) return undefined;
  const synthesis = row.synthesis;
  if (synthesis[side]) return structuredClone(synthesis[side]);
  const locale = pronunciationLocale(side, "uk");
  const selected = synthesisForLocale(synthesis, locale, region);
  const ipaMatches = !selected.ipa_locale || selected.ipa_locale === locale;
  const upsMatches = !selected.ups_locale || selected.ups_locale === locale;
  const result: PronunciationSynthesisCandidateV3 = {
    ipa: ipaMatches ? selected.ipa : "",
    ups: upsMatches ? selected.ups : "",
    ...(upsMatches && selected.ups_words !== undefined
      ? { ups_words: selected.ups_words }
      : {}),
    ...(ipaMatches && selected.ipa_speech
      ? { ipa_speech: structuredClone(selected.ipa_speech) }
      : {}),
    ...(upsMatches && selected.ups_speech
      ? { ups_speech: structuredClone(selected.ups_speech) }
      : {})
  };
  return synthesis.use_spelling ||
    result.ipa ||
    result.ups ||
    result.ipa_speech ||
    result.ups_speech ||
    result.ups_words
    ? result
    : undefined;
}

/** Offsets are Unicode code points; only explicit word boundaries are transferable. */
function rebindSpeechContent(
  content: RichTextV2V3,
  source: string,
  target: string
): RichTextV2V3 {
  if (content.text !== source)
    throw new FormCopyError("copy_source_text_mismatch");
  const words = (text: string) =>
    [...text.matchAll(/\S+/gu)].map((match) => ({
      start: Array.from(text.slice(0, match.index)).length,
      end: Array.from(text.slice(0, match.index + match[0].length)).length
    }));
  const from = words(source);
  const to = words(target);
  const fail = () => new FormCopyError("copy_annotation_boundary_mismatch");
  if (
    source !== target &&
    content.annotations.length &&
    from.length !== to.length
  )
    throw fail();
  const annotations = content.annotations.map((mark) => {
    if (!["pause", "say_as", "sub"].includes(mark.type)) throw fail();
    if (mark.type === "pause") {
      if (mark.at === 0) return { ...mark, at: 0 };
      if (mark.at === Array.from(source).length)
        return { ...mark, at: Array.from(target).length };
      const index = from.findIndex((word) => word.end === mark.at);
      if (index < 0) throw fail();
      return { ...mark, at: to[index]!.end };
    }
    if (mark.type !== "say_as" && mark.type !== "sub") throw fail();
    const first = from.findIndex((word) => word.start === mark.start);
    const last = from.findIndex((word) => word.end === mark.end);
    if (first < 0 || last < first) throw fail();
    return { ...mark, start: to[first]!.start, end: to[last]!.end };
  });
  return { version: 2, text: target, annotations };
}

function rebindUpsWords(
  candidate: PronunciationSynthesisCandidateV3,
  source: string,
  target: string
) {
  const from = source.match(/\S+/gu) ?? [];
  const to = target.match(/\S+/gu) ?? [];
  const words = candidate.ups_words;
  if (words == null) {
    if (candidate.ups.trim() && (from.length > 1 || to.length > 1))
      throw new FormCopyError("copy_ups_boundaries_missing");
    return words;
  }
  if (
    words.length !== from.length ||
    words.length !== to.length ||
    words.some(
      (word, index) => word.text !== from[index] || !word.phoneme.trim()
    ) ||
    words.map((word) => word.phoneme).join(" ") !== candidate.ups.trim()
  )
    throw new FormCopyError("copy_ups_target_mismatch");
  return words.map((word, index) => ({ ...word, text: to[index]! }));
}

function phoneticFields(row: WordPronunciationV3) {
  return {
    dict_phonetic: row.dict_phonetic,
    ...(row.dict_phonetic_rich
      ? { dict_phonetic_rich: row.dict_phonetic_rich }
      : {}),
    actual_pron: row.actual_pron,
    ...(row.actual_pron_rich ? { actual_pron_rich: row.actual_pron_rich } : {})
  };
}

function emptySynthesis(): PronunciationSynthesisV3 {
  return { alphabet: "ipa", ipa: "", ups: "", use_spelling: false };
}

function copyPhonetics(
  target: WordPronunciationV3,
  matches: FormCopyPlan["matches"],
  source: FormContentV3
) {
  const before = structuredClone(target);
  const previousCandidates = Object.fromEntries(
    SIDES.map((side) => [
      side,
      candidateForSide(before, matches[0]!.target.region, side)
    ])
  ) as Record<FormCopySide, PronunciationSynthesisCandidateV3 | undefined>;
  const rows = matches.map((match) =>
    match.source ? pronunciationAt(source, match.source) : before
  );
  const fields = rows.map(phoneticFields);
  if (
    fields.some((value) => JSON.stringify(value) !== JSON.stringify(fields[0]))
  )
    throw new FormCopyError("copy_transcriptions_differ");
  const candidates = matches.map((match, index) =>
    match.source
      ? candidateForSide(rows[index]!, match.source.region, match.side)
      : undefined
  );
  const selections = rows.flatMap((row, index) =>
    candidates[index]?.source
      ? []
      : [candidates[index] ? row.synthesis : before.synthesis]
  );
  const selected =
    selections.find((value) => value !== undefined) ?? before.synthesis;
  if (
    selections.some(
      (value) =>
        value !== undefined &&
        (value.alphabet !== selected?.alphabet ||
          Boolean(value.use_spelling) !== Boolean(selected?.use_spelling))
    )
  )
    throw new FormCopyError("copy_synthesis_sources_differ");
  delete target.dict_phonetic_rich;
  delete target.actual_pron_rich;
  Object.assign(target, structuredClone(fields[0]));
  if (target.voice_profile)
    target.voice_profile = clearVoiceAudio(target.voice_profile);
  if (before.synthesis && candidates.some(Boolean)) {
    target.synthesis = {
      alphabet: before.synthesis.alphabet,
      use_spelling: before.synthesis.use_spelling,
      ipa: "",
      ups: "",
      ...(previousCandidates.uk ? { uk: previousCandidates.uk } : {}),
      ...(previousCandidates.us ? { us: previousCandidates.us } : {})
    };
  }
  for (const [index, match] of matches.entries()) {
    if (!match.source) continue;
    const previous = previousCandidates[match.side];
    for (const alphabet of ALPHABETS) {
      const speech = previous?.[`${alphabet}_speech`];
      if (speech) speech.voice_profile = clearVoiceAudio(speech.voice_profile);
    }
    const candidate = candidates[index];
    if (!candidate) {
      for (const alphabet of ALPHABETS) {
        const speech = target.synthesis?.[match.side]?.[`${alphabet}_speech`];
        if (speech)
          speech.voice_profile = clearVoiceAudio(speech.voice_profile);
      }
      continue;
    }
    const copiedSource =
      candidate.source === "upload" ? previous?.source : candidate.source;
    const next: PronunciationSynthesisCandidateV3 = {
      ...(copiedSource ? { source: copiedSource } : {}),
      ipa: candidate.ipa,
      ups: candidate.ups,
      ...(candidate.ups_words !== undefined
        ? {
            ups_words: rebindUpsWords(
              candidate,
              match.source.spelling,
              match.target.spelling
            )
          }
        : {})
    };
    // A multiword UPS without boundaries cannot be silently moved to another body.
    if (candidate.ups_words === undefined)
      rebindUpsWords(candidate, match.source.spelling, match.target.spelling);
    for (const alphabet of ALPHABETS) {
      const key = `${alphabet}_speech` as const;
      const voice = previous?.[key]?.voice_profile ?? target.voice_profile;
      const speech = candidate[key];
      if (speech || previous?.[key]) {
        next[key] = {
          content: speech
            ? rebindSpeechContent(
                speech.content,
                match.source.spelling,
                match.target.spelling
              )
            : { version: 2, text: match.target.spelling, annotations: [] },
          voice_profile: clearVoiceAudio(voice ?? { voices: [] })
        };
      }
    }
    target.synthesis ??= emptySynthesis();
    target.synthesis[match.side] = next;
  }
  if (target.synthesis && selected && candidates.some(Boolean)) {
    target.synthesis.alphabet = selected.alphabet;
    target.synthesis.use_spelling = selected.use_spelling;
    const sourceChanged =
      Boolean(before.synthesis?.use_spelling) !==
        Boolean(selected.use_spelling) ||
      (!selected.use_spelling &&
        before.synthesis?.alphabet !== selected.alphabet);
    if (sourceChanged) {
      const profiles = matches.map((match) => {
        const previous = previousCandidates[match.side];
        const profile =
          !before.synthesis?.use_spelling && before.synthesis
            ? (previous?.[`${before.synthesis.alphabet}_speech`]
                ?.voice_profile ?? before.voice_profile)
            : before.voice_profile;
        return profile ? clearVoiceAudio(profile) : undefined;
      });
      if (selected.use_spelling) {
        if (
          profiles.some(
            (profile) => JSON.stringify(profile) !== JSON.stringify(profiles[0])
          )
        )
          throw new FormCopyError("copy_target_voices_differ");
        if (profiles[0]) target.voice_profile = structuredClone(profiles[0]);
        else delete target.voice_profile;
      } else {
        for (const [index, match] of matches.entries()) {
          const candidate = target.synthesis[match.side];
          if (!candidate) continue;
          const key = `${selected.alphabet}_speech` as const;
          candidate[key] = {
            content: candidate[key]?.content ?? {
              version: 2,
              text: match.target.spelling,
              annotations: []
            },
            voice_profile: structuredClone(profiles[index] ?? { voices: [] })
          };
        }
      }
    }
  }
}

function copiedProfile(
  profile: VoiceProfileV3 | undefined,
  match: FormCopyPlan["matches"][number],
  channel: ResolvedFormCopyProfile["channel"],
  resolved: readonly ResolvedFormCopyProfile[],
  versions: Map<string, string>
): VoiceProfileV3 | undefined {
  const effective = resolved.find(
    (item) =>
      item.side === match.side &&
      item.sourcePronunciationId === match.source!.pronunciationId &&
      item.channel === channel
  )?.profile;
  if (profile?.dubbing && !effective)
    throw new FormCopyError("copy_source_voice_unresolved");
  const value = effective ?? profile;
  if (!value?.voices.length) return undefined;
  const local = localVoiceProfile(value.voices, [], value.dubbing?.area, value);
  return clearVoiceAudio({
    ...local,
    voices: local.voices.map((setting) => {
      if (!setting.version_id) return setting;
      const key = `${setting.voice_id}:${setting.version_id}`;
      let id = versions.get(key);
      if (!id) {
        id = newVoiceVersionId();
        versions.set(key, id);
      }
      return { ...setting, version_id: id };
    }),
    ...(local.dubbing
      ? {
          dubbing: {
            ...local.dubbing,
            uk: { mode: "local" },
            us: { mode: "local" }
          }
        }
      : {})
  });
}

function profileSide(locale: string | undefined): FormCopySide | undefined {
  const group = speechAccentGroup(locale);
  return group === "uk" || group === "us" ? group : undefined;
}

function mergeFallbacks(
  target: VoiceProfileV3 | undefined,
  matches: FormCopyPlan["matches"],
  values: {
    match: FormCopyPlan["matches"][number];
    profile: VoiceProfileV3;
    sideScoped?: boolean;
  }[]
): VoiceProfileV3 {
  if (matches.length === 1) return values[0]!.profile;
  const complete = values.length === matches.length;
  if (
    complete &&
    values.every(
      (item) =>
        JSON.stringify(item.profile) === JSON.stringify(values[0]!.profile)
    )
  )
    return values[0]!.profile;
  const replacedSides = new Set(values.map((item) => item.match.side));
  const unchanged = complete ? [] : (target?.voices ?? []);
  if (
    values.some(
      (item) =>
        !item.sideScoped &&
        (item.profile.dubbing?.uk.mode === "inherit" ||
          item.profile.dubbing?.us.mode === "inherit" ||
          item.profile.voices.some((voice) => !profileSide(voice.locale)))
    ) ||
    unchanged.some((voice) => !profileSide(voice.locale))
  )
    throw new FormCopyError("copy_voice_accent_unknown");
  const voices = values.flatMap(({ match, profile, sideScoped }) =>
    sideScoped
      ? profile.voices
      : profile.voices.filter(
          (voice) => profileSide(voice.locale) === match.side
        )
  );
  voices.push(
    ...unchanged.filter(
      (voice) => !replacedSides.has(profileSide(voice.locale)!)
    )
  );
  const seen = new Set<string>();
  return {
    ...values[0]!.profile,
    ...(target?.dubbing
      ? {
          dubbing: {
            ...target.dubbing,
            ...Object.fromEntries(
              values.map(({ match }) => [
                match.side,
                { mode: "local" as const }
              ])
            )
          }
        }
      : {}),
    voices: voices.filter((voice) => {
      const key = voice.version_id ?? voice.voice_id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  };
}

function copyVoices(
  target: WordPronunciationV3,
  targetVariant: FormContentVariantV3,
  matches: FormCopyPlan["matches"],
  source: FormContentV3,
  resolved: readonly ResolvedFormCopyProfile[],
  versions: Map<string, string>,
  spellingCopies: Map<string, VoiceProfileV3>
): boolean {
  let copied = false;
  const before = structuredClone(target);
  const fallbacks: {
    match: FormCopyPlan["matches"][number];
    profile: VoiceProfileV3;
    sideScoped?: boolean;
  }[] = [];
  const spellingFallbacks: typeof fallbacks = [];
  for (const match of matches) {
    if (!match.source) continue;
    const from = pronunciationAt(source, match.source);
    const fromVariant = variantForCopyReference(source, match.source);
    const sourceSelection =
      from.synthesis &&
      synthesisForLocale(
        from.synthesis,
        match.side === "uk" ? "en-GB" : "en-US",
        match.source.region
      );
    if (
      sourceSelection?.source === "none" ||
      sourceSelection?.source === "upload"
    )
      continue;
    const targetSelection =
      before.synthesis &&
      synthesisForLocale(
        before.synthesis,
        match.side === "uk" ? "en-GB" : "en-US",
        match.target.region
      );
    const fromSpelling = Boolean(sourceSelection?.use_spelling);
    const targetSpelling = Boolean(targetSelection?.use_spelling);
    const fallback = copiedProfile(
      fromSpelling
        ? fromVariant.spelling_speech?.voice_profile
        : from.voice_profile,
      match,
      "fallback",
      resolved,
      versions
    );
    const fromCandidate = candidateForSide(
      from,
      match.source.region,
      match.side
    );
    const selectedAlphabet = sourceSelection?.alphabet ?? "ipa";
    const effectiveFallback =
      targetSpelling && !fromSpelling
        ? (copiedProfile(
            fromCandidate?.[`${selectedAlphabet}_speech`]?.voice_profile,
            match,
            selectedAlphabet,
            resolved,
            versions
          ) ?? fallback)
        : fallback;
    if (effectiveFallback) {
      const channel =
        targetSpelling &&
        !fromSpelling &&
        fromCandidate?.[`${selectedAlphabet}_speech`]?.voice_profile
          ? selectedAlphabet
          : "fallback";
      (targetSpelling ? spellingFallbacks : fallbacks).push({
        match,
        profile: effectiveFallback,
        sideScoped: resolved.some(
          (item) =>
            item.side === match.side &&
            item.sourcePronunciationId === match.source!.pronunciationId &&
            item.channel === channel &&
            item.sideScoped
        )
      });
    }
    const previous = candidateForSide(before, match.target.region, match.side);
    for (const alphabet of ALPHABETS) {
      const key = `${alphabet}_speech` as const;
      const ownProfile = fromSpelling
        ? undefined
        : fromCandidate?.[key]?.voice_profile;
      const profile =
        copiedProfile(ownProfile, match, alphabet, resolved, versions) ??
        (!ownProfile ? fallback : undefined);
      if (!profile) continue;
      const candidate = target.synthesis?.[match.side] ??
        previous ?? { ipa: "", ups: "" };
      const content = candidate[key]?.content ?? {
        version: 2 as const,
        text: match.target.spelling,
        annotations: []
      };
      if (content.text !== match.target.spelling)
        throw new FormCopyError("copy_target_text_mismatch");
      target.synthesis ??= emptySynthesis();
      // 写入首个分侧候选前，保留旧格式在两侧实际可用的内容。
      if (!target.synthesis.uk && !target.synthesis.us) {
        for (const side of SIDES) {
          const candidate = candidateForSide(before, match.target.region, side);
          if (candidate) target.synthesis[side] = candidate;
        }
      }
      target.synthesis[match.side] = {
        ...candidate,
        [key]: { content: structuredClone(content), voice_profile: profile }
      };
      copied = true;
    }
  }
  if (fallbacks.length) {
    target.voice_profile = mergeFallbacks(
      before.voice_profile,
      matches,
      fallbacks
    );
    copied = true;
  }
  if (spellingFallbacks.length) {
    const spelling = mergeFallbacks(
      targetVariant.spelling_speech?.voice_profile,
      matches,
      spellingFallbacks
    );
    spellingCopies.set(target.id, spelling);
    if (
      !fallbacks.length &&
      matches.every(
        (match) =>
          before.synthesis &&
          synthesisForLocale(
            before.synthesis,
            match.side === "uk" ? "en-GB" : "en-US",
            match.target.region
          ).use_spelling
      )
    )
      target.voice_profile = spelling;
    copied = true;
  }
  return copied;
}

export function applyFormCopy(
  forms: SharedFormsStepContentV3,
  plan: FormCopyPlan,
  resolvedProfiles: readonly ResolvedFormCopyProfile[] = []
): SharedFormsStepContentV3 {
  for (const ref of [plan.source, plan.target]) {
    const current = sharedContentForForm(forms, ref.formId);
    if (
      current?.id !== ref.contentId ||
      JSON.stringify(current) !== JSON.stringify(ref.contentSnapshot)
    )
      throw new FormCopyError("copy_content_changed");
  }
  if (plan.sameContent) return forms;
  if (plan.needsMapping) throw new FormCopyError("copy_mapping_required");
  if (!plan.matches.some((match) => match.source)) return forms;
  const target = structuredClone(plan.target.contentSnapshot);
  const grouped = new Map<string, FormCopyPlan["matches"]>();
  for (const match of plan.matches) {
    const group = grouped.get(match.target.pronunciationId) ?? [];
    group.push(match);
    grouped.set(match.target.pronunciationId, group);
  }
  let copiedVoices = false;
  const versions = new Map<string, string>();
  const spellingCopies = new Map<string, VoiceProfileV3>();
  for (const matches of grouped.values()) {
    if (!matches.some((match) => match.source)) continue;
    const row = pronunciationAt(target, matches[0]!.target);
    if (plan.kind === "phonetics")
      copyPhonetics(row, matches, plan.source.contentSnapshot);
    else
      copiedVoices =
        copyVoices(
          row,
          variantForCopyReference(target, matches[0]!.target),
          matches,
          plan.source.contentSnapshot,
          resolvedProfiles,
          versions,
          spellingCopies
        ) || copiedVoices;
  }
  if (plan.kind === "voices" && !copiedVoices)
    throw new FormCopyError("copy_source_voice_missing");
  const regions = target.regional_variants;
  for (const variant of regionalVariants(regions)) {
    if (!variant.pronunciations.some((row) => spellingCopies.has(row.id)))
      continue;
    const profiles = variant.pronunciations
      .filter(
        (row) =>
          row.synthesis &&
          SIDES.some(
            (side) =>
              synthesisForLocale(
                row.synthesis!,
                side === "uk" ? "en-GB" : "en-US",
                "common"
              ).use_spelling
          )
      )
      .map(
        (row) =>
          spellingCopies.get(row.id) ?? variant.spelling_speech?.voice_profile
      );
    const profile = profiles[0];
    if (
      !profile ||
      profiles.some(
        (value) => JSON.stringify(value) !== JSON.stringify(profile)
      )
    )
      throw new FormCopyError("copy_shared_spelling_mapping_conflict");
    variant.spelling_speech = {
      ...variant.spelling_speech,
      content: variant.spelling_speech?.content ?? {
        version: 2,
        text: variant.spelling,
        annotations: []
      },
      voice_profile: structuredClone(profile)
    };
  }
  return {
    ...forms,
    contents: forms.contents.map((content) =>
      content.id === target.id ? target : content
    )
  };
}
