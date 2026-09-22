import { describe, expect, it } from "vitest";
import type { ResolveSentenceTargetsV3Response } from "@tsz/types";
import { sentenceCandidate } from "./fixtures";
import {
  discoveryInput,
  discoveryResult,
  discoveredAnnotation
} from "./sentenceDiscovery";

const labels = {
  pos: (value: string) => value,
  form: (value: string) => value
};
function response(): ResolveSentenceTargetsV3Response {
  const published = sentenceCandidate("target", "make");
  published.publication_id = "publication";
  published.senses[0]!.publication_id = "publication";
  const draft = sentenceCandidate("target", "make");
  draft.senses[0]!.sense_id = "new-sense";
  return {
    schema_version: 3,
    sentence_hash: "hash",
    discovery_generation: 1,
    completeness: "complete",
    range_results: [
      {
        source_segments: [{ start: 3, end: 7, surface: "make" }],
        normalized_surface: "make",
        segments_fingerprint: "fingerprint",
        published_total: 1,
        draft_total: 1,
        published_matches: [published],
        draft_matches: [draft],
        next_cursor: "next"
      }
    ]
  };
}

describe("句中发现与例句保存适配", () => {
  it("同词条的发布与新增草稿节点保持独立身份及发布状态", () => {
    const result = discoveryResult(response(), "uk", labels);
    const occurrence = result.occurrences[0]!;
    expect(occurrence.nextCursor).toBe("next");
    expect(occurrence.candidates.map((candidate) => candidate.state)).toEqual([
      "published",
      "draft"
    ]);
    expect(
      new Set(occurrence.candidates.map((candidate) => candidate.id)).size
    ).toBe(2);
    const published = occurrence.candidates[0]!;
    const draft = occurrence.candidates[1]!;
    const saved = discoveredAnnotation(
      "uk",
      occurrence,
      published,
      published.senses[0]!
    );
    const dependency = discoveredAnnotation(
      "uk",
      occurrence,
      draft,
      draft.senses[0]!
    );
    expect(saved.target).toMatchObject({
      target_publication_id: "publication",
      target_sense_id: "sense"
    });
    expect(dependency).toMatchObject({
      source_dialect: "uk",
      source_segments: occurrence.segments,
      target: {
        state: "linked",
        target_entry_id: "target",
        target_pos_id: "pos",
        target_base_form_id: "base",
        target_form_id: "base",
        target_variant_id: "variant",
        target_sense_id: "new-sense"
      }
    });
    expect(dependency.target).not.toHaveProperty("target_publication_id");
    expect(dependency.target).not.toHaveProperty("target_gloss");
  });

  it("变形命中使用匹配词形而非词头猜测，并遵守词形的词义范围", () => {
    const value = response();
    const candidate = value.range_results[0]!.published_matches[0]!;
    candidate.matched_form_id = "past";
    candidate.matched_variant_id = "past-variant";
    candidate.matched_form_type = "past_tense";
    candidate.forms.push({
      form_id: "past",
      variant_id: "past-variant",
      form_type: "past_tense",
      spelling: "made",
      dialect: "common",
      base_form_ids: ["base"],
      allowed_sense_ids: ["sense"]
    });
    candidate.senses.push({
      ...candidate.senses[0]!,
      sense_id: "other-sense",
      gloss: "其他组的词义"
    });
    const occurrence = discoveryResult(value, "common", labels).occurrences[0]!;
    const mapped = occurrence.candidates[0]!;
    expect(mapped.baseForm).toBe("make");
    expect(mapped.matchedForm).toBe("made");
    expect(mapped.senses).toHaveLength(1);
    expect(
      discoveredAnnotation("common", occurrence, mapped, mapped.senses[0]!)
        .target
    ).toMatchObject({
      target_base_form_id: "base",
      target_form_id: "past",
      target_variant_id: "past-variant",
      target_sense_id: "sense"
    });
    expect(() =>
      discoveredAnnotation("common", occurrence, mapped, {
        id: "other-sense",
        gloss: "其他组"
      })
    ).toThrow("具体词义");
    candidate.forms = [];
    expect(() => discoveryResult(value, "common", labels)).toThrow(
      "候选词形身份不完整"
    );
  });

  it("自动只查发布，手动明确携带草稿范围且保留续页游标", () => {
    const common = {
      sentenceText: "We make stories.",
      dialect: "common" as const
    };
    expect(
      discoveryInput({ ...common, mode: "all_published_targets" })
    ).not.toHaveProperty("include_drafts");
    const segments = [{ start: 3, end: 7, surface: "make" }];
    expect(
      discoveryInput({
        ...common,
        mode: "selected_segments",
        scope: "published",
        segments
      })
    ).toMatchObject({ include_drafts: false });
    expect(
      discoveryInput({
        ...common,
        mode: "selected_segments",
        scope: "published_and_draft",
        segments,
        cursor: "next"
      })
    ).toEqual({
      schema_version: 3,
      sentence_text: common.sentenceText,
      source_dialect: "common",
      page_size_per_range: 50,
      mode: "selected_segments",
      include_drafts: true,
      selected_segments: segments,
      cursor: "next"
    });
  });
});
