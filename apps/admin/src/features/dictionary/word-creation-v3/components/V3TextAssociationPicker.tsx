import { Button, Flex, Typography } from "antd";
import type { AssociationPickerProps } from "@tsz/voice-editor/types";
import { V3TargetCascader } from "./V3TargetCascader";
import { newWordNodeId } from "../../word-model/primitives";

export function V3TextAssociationPicker({
  kind,
  segments,
  selected,
  onSelect,
  wordId
}: AssociationPickerProps & { wordId?: string }) {
  const literal = segments.map((segment) => segment.surface).join(" ");
  if (selected) {
    return (
      <Flex vertical gap="small" style={{ maxWidth: "min(360px, 85vw)" }}>
        <Typography.Text strong>{literal}</Typography.Text>
        <Typography.Text>
          已关联：{selected.target_headword ?? "词条"} ·{" "}
          {selected.target_gloss ?? "词义"}
        </Typography.Text>
        <Typography.Text type="secondary">
          这些单词已有关联，请先清除原关联再重新选择。
        </Typography.Text>
        <Button size="small" onClick={() => onSelect(undefined)}>
          清除关联
        </Button>
      </Flex>
    );
  }
  return (
    <Flex vertical gap="small" style={{ maxWidth: "min(760px, 85vw)" }}>
      <Typography.Text strong>{literal}</Typography.Text>
      <V3TargetCascader
        key={`${kind}:${literal}`}
        literal={literal.trim()}
        targets={[]}
        selfEntryId={wordId}
        targetKind={kind}
        onReplace={(next, viaPhrase) => {
          const chosen = next[0];
          if (!chosen) {
            onSelect(undefined);
            return;
          }
          onSelect({
            id: newWordNodeId(),
            source_segments: segments,
            target_word_id: chosen.target_word_id,
            target_publication_id: chosen.target_publication_id,
            target_pos_id: chosen.target_pos_id,
            target_base_form_id: chosen.target_base_form_id,
            target_form_id: chosen.target_form_id,
            target_variant_id: chosen.target_variant_id,
            target_sense_id: chosen.target_sense_id,
            target_headword: chosen.target_headword,
            target_gloss: chosen.target_gloss,
            ...(viaPhrase ? { via_phrase: viaPhrase } : {})
          });
        }}
      />
    </Flex>
  );
}
