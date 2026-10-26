import { useCallback, useMemo } from "react";
import { expandFormContents } from "@tsz/shared";
import type { DraftFormsStepContentV3, GrammarFormLinkV3 } from "@tsz/types";
import { createV3WordRequests } from "../api";
import { adminVoicePreviewAdapter } from "../../voice-editor/dataSource";
import { createGrammarFormPreviewAdapter } from "./grammarFormPreview";

export function useReadingPreviewAdapter(
  wordId?: string,
  forms?: DraftFormsStepContentV3
) {
  const requests = useMemo(() => createV3WordRequests(), []);
  return useCallback(
    (links: GrammarFormLinkV3[]) =>
      createGrammarFormPreviewAdapter(
        adminVoicePreviewAdapter,
        async () => {
          const targets = new Map<string, Promise<DraftFormsStepContentV3>>();
          return Promise.all(
            links.map(async (link) => {
              const key = `${link.target_word_id}:${link.target_publication_id ?? "draft"}`;
              if (!targets.has(key))
                targets.set(
                  key,
                  (async () => {
                    if (
                      !link.target_publication_id &&
                      link.target_word_id === wordId &&
                      forms
                    )
                      return forms;
                    if (!link.target_publication_id)
                      return expandFormContents(
                        (await requests.get(link.target_word_id)).word.forms
                      );
                    const target = (
                      await requests.getPublication(
                        link.target_word_id,
                        link.target_publication_id
                      )
                    ).publication.word;
                    if (target.schema_version !== 3)
                      throw new Error("关联词形的数据版本不支持，请重新关联");
                    return expandFormContents(target.forms);
                  })()
                );
              const targetForms = await targets.get(key)!;
              const form = targetForms.pos
                .find((pos) => pos.pos_id === link.target_pos_id)
                ?.forms.find((form) => form.id === link.target_form_id);
              const regional = form?.regional_variants;
              const variants = regional
                ? regional.mode === "common"
                  ? [regional.common]
                  : [regional.uk, regional.us]
                : [];
              const variant = variants.find(
                (variant) => variant.id === link.target_variant_id
              );
              if (!variant)
                throw new Error(
                  `“${link.source_segments[0]?.surface ?? ""}”关联的词形已失效，请重新关联`
                );
              return {
                source_segments: link.source_segments,
                dialect: variant.dialect,
                pronunciations: variant.pronunciations,
                reading_reference: link.reading_reference
              };
            })
          );
        },
        links
      ),
    [requests, wordId, forms]
  );
}
