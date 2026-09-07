import type { EnglishTextV3 } from "@tsz/types";
import { Flex, Tag, Typography } from "antd";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { dialectLabel } from "../presentation";
import "@tsz/voice-editor/styles.css";

export function V3EnglishTextPreview({ value }: { value: EnglishTextV3 }) {
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
          <Tag>{dialectLabel(dialect)}</Tag>
          <RichTextReadOnly value={variant.value} />
          {variant.text_links?.map((link) => (
            <Typography.Text
              key={link.id}
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
