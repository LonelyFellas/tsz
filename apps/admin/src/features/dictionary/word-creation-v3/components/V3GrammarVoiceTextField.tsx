import { useCallback, useMemo } from "react";
import { expandFormContents } from "@tsz/shared";
import type { DraftFormsStepContentV3, GrammarFormLinkV3 } from "@tsz/types";
import { toRichTextV2 } from "@tsz/voice-editor/core";
import {
  V3VoiceTextField,
  type V3VoiceTextFieldProps
} from "./V3VoiceTextField";
import { V3GrammarFormPicker } from "./V3GrammarFormPicker";
import { createGrammarFormPreviewAdapter } from "./grammarFormPreview";
import { createV3WordRequests } from "../api";
import { adminVoicePreviewAdapter } from "../../voice-editor/dataSource";
import { PronunciationPreviewControls } from "../../word-creation/PronunciationPreview";

const NO_LINKS: GrammarFormLinkV3[] = [];
export function V3GrammarVoiceTextField({
  wordId,
  forms,
  textLinks = NO_LINKS,
  ...props
}: V3VoiceTextFieldProps<GrammarFormLinkV3> & {
  wordId?: string;
  forms?: DraftFormsStepContentV3;
}) {
  const requests = useMemo(() => createV3WordRequests(), []);
  const createPreviewAdapter = useCallback(
    (links: GrammarFormLinkV3[]) =>
      createGrammarFormPreviewAdapter(
        adminVoicePreviewAdapter,
        async () => {
          const targets = new Map<string, Promise<DraftFormsStepContentV3>>();
          return Promise.all(
            links.map(async (link) => {
              const key = `${link.target_word_id}:${link.target_publication_id ?? "draft"}`;
              if (!targets.has(key)) {
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
              }
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
              const variant =
                variants.find(
                  (variant) => variant.id === link.target_variant_id
                ) ??
                variants.find(
                  (variant) =>
                    variant.dialect === link.target_dialect ||
                    variant.dialect === "common"
                );
              if (!variant)
                throw new Error(
                  `“${link.source_segments[0]?.surface ?? ""}”关联的词形已失效，请重新关联`
                );
              return {
                source_segments: link.source_segments,
                dialect: variant.dialect,
                pronunciations: variant.pronunciations
              };
            })
          );
        },
        links
      ),
    [requests, forms, wordId]
  );
  const previewAdapter = useMemo(
    () => createPreviewAdapter(textLinks),
    [createPreviewAdapter, textLinks]
  );
  return (
    <V3VoiceTextField<GrammarFormLinkV3>
      {...props}
      mode="grammar"
      textLinks={textLinks}
      previewAdapter={previewAdapter}
      createPreviewAdapter={createPreviewAdapter}
      renderAssociationPicker={(pickerProps) => (
        <V3GrammarFormPicker {...pickerProps} wordId={wordId} forms={forms} />
      )}
      leadingAction={
        <PronunciationPreviewControls
          playbackOnly
          pronunciationId={props.nodeId}
          dialect={props.dialect ?? "common"}
          ariaLabelPrefix={props.ariaLabel}
          content={toRichTextV2(props.value)}
          voiceProfile={props.voiceProfile ?? undefined}
          previewAdapter={previewAdapter}
        />
      }
    />
  );
}
