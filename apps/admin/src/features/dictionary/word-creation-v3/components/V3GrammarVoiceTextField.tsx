import { useMemo } from "react";
import type {
  DraftFormsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  GrammarFormLinkV3
} from "@tsz/types";
import { toRichTextV2 } from "@tsz/voice-editor/core";
import {
  V3VoiceTextField,
  type V3VoiceTextFieldProps
} from "./V3VoiceTextField";
import { V3GrammarFormPicker } from "./V3GrammarFormPicker";
import { useReadingPreviewAdapter } from "./useReadingPreviewAdapter";
import { PronunciationPreviewControls } from "../../word-creation/PronunciationPreview";

const NO_LINKS: GrammarFormLinkV3[] = [];
export function V3GrammarVoiceTextField({
  wordId,
  forms,
  meanings,
  textLinks = NO_LINKS,
  ...props
}: V3VoiceTextFieldProps<GrammarFormLinkV3> & {
  wordId?: string;
  forms?: DraftFormsStepContentV3;
  meanings?: DraftMeaningsStepContentWritableV3;
}) {
  const createPreviewAdapter = useReadingPreviewAdapter(wordId, forms);
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
        <V3GrammarFormPicker
          {...pickerProps}
          wordId={wordId}
          forms={forms}
          meanings={meanings}
        />
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
