import { toRichTextV2 } from "@tsz/voice-editor/core";
import type { EnglishTextV3 } from "@tsz/types";
import { ConfigProvider, Flex, Tag, Typography } from "antd";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { dialectLabel } from "../presentation";
import "@tsz/voice-editor/styles.css";
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
    <Flex vertical gap={4}>
      {rows.map(({ dialect, variant }) => (
        <div key={variant.id}>
          <Flex align="stretch">
            {showPlayback && (
              <div className="v3-english-preview-playback">
                <ConfigProvider wave={{ disabled: true }}>
                  <PronunciationPreviewControls
                    pronunciationId={variant.id}
                    content={toRichTextV2(variant.value)}
                    voiceProfile={variant.voice_profile ?? undefined}
                    dialect={dialect}
                    ariaLabelPrefix="整句"
                    playbackOnly
                  />
                </ConfigProvider>
              </div>
            )}
            <div
              className={showPlayback ? "v3-english-preview-text" : undefined}
            >
              {(!hideCommonDialect || dialect !== "common") && (
                <Tag>{dialectLabel(dialect)}</Tag>
              )}
              <RichTextReadOnly
                className="tsz-entry-en"
                value={variant.value}
              />
            </div>
          </Flex>
          {variant.text_links?.map((link) => (
            <Typography.Text
              key={link.id}
              className="tsz-entry-en"
              type="secondary"
              style={{ display: "block" }}
            >
              {link.source_segments
                .map((segment) => segment.surface)
                .join(" … ")}{" "}
              → {link.target_headword ?? "已关联词条"} ·{" "}
              {link.target_gloss ?? "词义"}
            </Typography.Text>
          ))}
        </div>
      ))}
    </Flex>
  );
}
