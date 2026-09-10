import { toRichTextV2 } from "@tsz/voice-editor/core";
import { PronunciationPreviewControls } from "../../word-creation/PronunciationPreview";
import type { Dialect, EnglishTextV3, RichTextVariantV3 } from "@tsz/types";
import { Flex } from "antd";
import { editableEnglishText } from "../meaningsModel";
import { dialectLabel } from "../presentation";
import { V3VoiceTextField } from "./V3VoiceTextField";
import { V3TextAssociationPicker } from "./V3TextAssociationPicker";

function variantAt(
  content: EnglishTextV3,
  dialect: Dialect
): RichTextVariantV3 {
  if (content.mode === "unified") return content.common;
  const slot = dialect === "us" ? content.us : content.uk;
  if (slot.state !== "ready")
    throw new Error("The selected text variant is missing");
  return slot.variant;
}

export function V3LinkedEnglishTextField({
  value,
  label,
  suffix,
  placeholder,
  wordId,
  readOnly,
  linksEnabled,
  onChange
}: {
  value: EnglishTextV3;
  label: string;
  suffix: string;
  placeholder?: string;
  wordId?: string;
  readOnly?: boolean;
  linksEnabled: boolean;
  onChange: (next: EnglishTextV3) => void;
}) {
  const update = (dialect: Dialect, patch: Partial<RichTextVariantV3>) => {
    if (readOnly) return;
    const next = structuredClone(value);
    Object.assign(variantAt(next, dialect), patch);
    onChange(next);
  };
  return (
    <Flex vertical gap={6} style={{ width: "100%" }}>
      {editableEnglishText(value).map((row) => {
        const variant = variantAt(value, row.dialect);
        return (
          <V3VoiceTextField
            key={row.variant_id}
            value={variant.value}
            placeholder={placeholder}
            mode="association"
            dialect={row.dialect}
            leadingAction={
              <PronunciationPreviewControls
                playbackOnly
                pronunciationId={row.variant_id}
                dialect={row.dialect}
                ariaLabelPrefix={`${label} ${dialectLabel(row.dialect)}${suffix}`}
                content={toRichTextV2(variant.value)}
                voiceProfile={variant.voice_profile ?? undefined}
              />
            }
            textLinks={variant.text_links}
            ariaLabel={`${label} ${dialectLabel(row.dialect)}${suffix}`}
            nodeId={row.variant_id}
            field="value"
            readOnly={readOnly}
            voiceProfile={variant.voice_profile}
            onVoiceProfileChange={(voice_profile) =>
              update(row.dialect, { voice_profile })
            }
            audioAssets={variant.audio_assets}
            onAudioAssetsChange={(audio_assets) =>
              update(row.dialect, { audio_assets })
            }
            renderAssociationPicker={
              linksEnabled
                ? (props) => (
                    <V3TextAssociationPicker {...props} wordId={wordId} />
                  )
                : undefined
            }
            onChange={(text, text_links) =>
              update(row.dialect, {
                value: text,
                ...(linksEnabled || variant.text_links ? { text_links } : {})
              })
            }
          />
        );
      })}
    </Flex>
  );
}
