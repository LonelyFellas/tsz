import { toRichTextV2 } from "@tsz/voice-editor/core";
import type { EnglishTextV3 } from "@tsz/types";
import { Chip, Stack, Typography } from "@mui/material";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { dialectLabel } from "../presentation";
import "@tsz/voice-editor/reader.css";
import "./V3EnglishTextPreview.css";
import { PronunciationPreviewControls } from "../../word-creation/PronunciationPreview";

export function V3EnglishTextPreview({
  value,
  hideCommonDialect = false,
  showPlayback = false
}: {
  value: EnglishTextV3;
  hideCommonDialect?: boolean;
  showPlayback?: boolean;
}) {
  const rows =
    value.mode === "unified"
      ? [{ dialect: "common" as const, variant: value.common }]
      : (["uk", "us"] as const).flatMap((dialect) => {
          const slot = value[dialect];
          return slot.state === "ready"
            ? [{ dialect, variant: slot.variant }]
            : [];
        });
  return (
    <Stack spacing={0.5}>
      {rows.map(({ dialect, variant }) => (
        <div key={variant.id}>
          <Stack direction="row" alignItems="stretch">
            {showPlayback && (
              <div className="v3-english-preview-playback">
                <PronunciationPreviewControls
                  pronunciationId={variant.id}
                  content={toRichTextV2(variant.value)}
                  voiceProfile={variant.voice_profile ?? undefined}
                  dialect={dialect}
                  ariaLabelPrefix="整句"
                  playbackOnly
                />
              </div>
            )}
            <div
              className={showPlayback ? "v3-english-preview-text" : undefined}
            >
              {(!hideCommonDialect || dialect !== "common") && (
                <Chip label={dialectLabel(dialect)} />
              )}
              <RichTextReadOnly
                className="tsz-entry-en"
                value={variant.value}
              />
            </div>
          </Stack>
          {variant.text_links?.map((link) => (
            <Typography
              component="span"
              key={link.id}
              className="tsz-entry-en"
              color="text.secondary"
              style={{ display: "block" }}
            >
              {link.source_segments
                .map((segment) => segment.surface)
                .join(" … ")}{" "}
              → {link.target_headword ?? "已关联词条"} ·{" "}
              {link.target_gloss ?? "词义"}
            </Typography>
          ))}
        </div>
      ))}
    </Stack>
  );
}
