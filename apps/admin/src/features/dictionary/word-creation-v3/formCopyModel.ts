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
import { pronunciationLocale, synthesisForLocale } from "@tsz/shared";
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
}

const SIDES = ["uk", "us"] as const;
const ALPHABETS = ["ipa", "ups"] as const;

function variantForSide(content: FormContentV3, side: FormCopySide) {
  const regions = content.regional_variants;
  return regions.mode === "common"
    ? { region: "common" as const, variant: regions.common }
    : { region: side, variant: regions[side] };
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
  if (!source || !target) throw new Error("来源或目标词形已不存在，请重新选择");
  const matches: FormCopyPlan["matches"] = [];
  let sourceCount = 0;
  for (const side of SIDES) {
    const from = variantForSide(source, side);
    const to = variantForSide(target, side);
    sourceCount += from.variant.pronunciations.length;
    for (const [index, pronunciation] of to.variant.pronunciations.entries()) {
      const explicit = mapping[side]?.[pronunciation.id];
      const needsChoice =
        from.variant.pronunciations.length > 0 &&
        from.variant.pronunciations.length !== to.variant.pronunciations.length;
      const sourceIndex =
        explicit === null
          ? -1
          : explicit !== undefined
            ? from.variant.pronunciations.findIndex(
                (row) => row.id === explicit
              )
            : needsChoice
              ? -1
              : index;
      if (explicit != null && sourceIndex < 0)
        throw new Error("所选来源发音已不存在，请重新选择");
      matches.push({
        side,
        source: from.variant.pronunciations[sourceIndex]
          ? reference(from.region, from.variant, sourceIndex)
          : null,
        target: reference(to.region, to.variant, index),
        requiresMapping: needsChoice && explicit === undefined
      });
    }
  }
  const sameContent = source.id === target.id;
  const hasRecordings = matches.some((match) => {
    const variant = variantForSide(target, match.side).variant;
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
  const variants = content.regional_variants;
  const variant =
    variants.mode === "common"
      ? variants.common
      : ref.region === "common"
        ? undefined
        : variants[ref.region];
  const row = variant?.pronunciations.find(
    (item) => item.id === ref.pronunciationId
  );
  if (!row || variant?.id !== ref.variantId)
    throw new Error("发音版本已变化，请重新发起复制");
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
    throw new Error("来源合成正文与拼写不一致，请先修正后再复制");
  const words = (text: string) =>
    [...text.matchAll(/\S+/gu)].map((match) => ({
      start: Array.from(text.slice(0, match.index)).length,
      end: Array.from(text.slice(0, match.index + match[0].length)).length
    }));
  const from = words(source);
  const to = words(target);
  const fail = () =>
    new Error("语音标注无法对应目标词界，请先调整拼写或语音标注后再复制");
  if (
    source !== target &&
    content.annotations.length &&
    from.length !== to.length
  )
    throw fail();
  const annotations = content.annotations.map((mark) => {
    if (!["pause", "say_as", "sub"].includes(mark.type)) throw fail();
    if (mark.type === "pause") {
      const index = from.findIndex((word) => word.end === mark.at);
      if (index < 0 || index >= from.length - 1) throw fail();
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
      throw new Error(
        "来源 UPS 缺少逐词边界，无法对应目标拼写，请先完善 UPS 后再复制"
      );
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
    throw new Error("UPS 逐词内容无法对应目标拼写，请先调整后再复制");
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
    throw new Error(
      "来源英美字典音标或实际发音不同，请先将目标切换为英美区分后再复制"
    );
  const candidates = matches.map((match, index) =>
    match.source
      ? candidateForSide(rows[index]!, match.source.region, match.side)
      : undefined
  );
  const selections = rows.map((row, index) =>
    candidates[index] ? row.synthesis : before.synthesis
  );
  const selected = selections.find((value) => value !== undefined);
  if (
    selections.some(
      (value) =>
        value !== undefined &&
        (value.alphabet !== selected?.alphabet ||
          Boolean(value.use_spelling) !== Boolean(selected?.use_spelling))
    )
  )
    throw new Error("来源英美发音源选择不同，请先将目标切换为英美区分后再复制");
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
    const next: PronunciationSynthesisCandidateV3 = {
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
    throw new Error("来源音色需要先解析当前有效配置，请重新发起复制");
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
          dubbing: { ...local.dubbing, mode: "local", recommendation_order: [] }
        }
      : {})
  });
}

function profileSide(locale: string | undefined): FormCopySide | undefined {
  return locale === "en-GB" ? "uk" : locale === "en-US" ? "us" : undefined;
}

function mergeFallbacks(
  target: VoiceProfileV3 | undefined,
  matches: FormCopyPlan["matches"],
  values: { match: FormCopyPlan["matches"][number]; profile: VoiceProfileV3 }[]
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
    values.some((item) =>
      item.profile.voices.some((voice) => !profileSide(voice.locale))
    ) ||
    unchanged.some((voice) => !profileSide(voice.locale)) ||
    (!complete && target?.dubbing?.mode === "inherit")
  )
    throw new Error(
      "音色口音不明确，无法合并英美音色或保留跳过侧，请先明确音色口音或将目标切换为英美区分"
    );
  const voices = values.flatMap(({ match, profile }) =>
    profile.voices.filter((voice) => profileSide(voice.locale) === match.side)
  );
  voices.push(
    ...unchanged.filter(
      (voice) => !replacedSides.has(profileSide(voice.locale)!)
    )
  );
  const seen = new Set<string>();
  return {
    ...values[0]!.profile,
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
  matches: FormCopyPlan["matches"],
  source: FormContentV3,
  resolved: readonly ResolvedFormCopyProfile[],
  versions: Map<string, string>
): boolean {
  let copied = false;
  const before = structuredClone(target);
  const fallbacks: {
    match: FormCopyPlan["matches"][number];
    profile: VoiceProfileV3;
  }[] = [];
  for (const match of matches) {
    if (!match.source) continue;
    const from = pronunciationAt(source, match.source);
    const fallback = copiedProfile(
      from.voice_profile,
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
    const selectedAlphabet = from.synthesis?.alphabet ?? "ipa";
    const effectiveFallback =
      before.synthesis?.use_spelling && !from.synthesis?.use_spelling
        ? (copiedProfile(
            fromCandidate?.[`${selectedAlphabet}_speech`]?.voice_profile,
            match,
            selectedAlphabet,
            resolved,
            versions
          ) ?? fallback)
        : fallback;
    if (effectiveFallback)
      fallbacks.push({ match, profile: effectiveFallback });
    const previous = candidateForSide(before, match.target.region, match.side);
    for (const alphabet of ALPHABETS) {
      const key = `${alphabet}_speech` as const;
      const ownProfile = fromCandidate?.[key]?.voice_profile;
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
        throw new Error("目标合成正文与拼写不一致，请先修正后再复制音色");
      target.synthesis ??= emptySynthesis();
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
      throw new Error("来源或目标内容已变化，请重新发起复制");
  }
  if (plan.sameContent) return forms;
  if (plan.needsMapping)
    throw new Error("发音版本数量不同，请为每个目标版本选择来源或跳过");
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
  for (const matches of grouped.values()) {
    if (!matches.some((match) => match.source)) continue;
    const row = pronunciationAt(target, matches[0]!.target);
    if (plan.kind === "phonetics")
      copyPhonetics(row, matches, plan.source.contentSnapshot);
    else
      copiedVoices =
        copyVoices(
          row,
          matches,
          plan.source.contentSnapshot,
          resolvedProfiles,
          versions
        ) || copiedVoices;
  }
  if (plan.kind === "voices" && !copiedVoices)
    throw new Error("来源未配置可复制的音色，请先配置来源音色");
  return {
    ...forms,
    contents: forms.contents.map((content) =>
      content.id === target.id ? target : content
    )
  };
}
