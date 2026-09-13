import { useState } from "react";
import { Alert, Button, Flex, Input, Radio, Typography } from "antd";
import type { AssociationPickerProps } from "@tsz/voice-editor/types";
import type { Dialect, SharedSentenceAnnotation } from "@tsz/types";
import {
  V3TargetCascader,
  type ResolvedTarget
} from "../dictionary/word-creation-v3/components/V3TargetCascader";

export function SharedSentenceAssociationPicker({
  kind,
  segments,
  selected,
  onSelect,
  dialect,
  labels,
  onTargetLabel
}: AssociationPickerProps<SharedSentenceAnnotation> & {
  dialect: Dialect;
  labels: Record<string, string>;
  onTargetLabel: (id: string, label: string) => void;
}) {
  const literal = segments.map((segment) => segment.surface).join(" ");
  const [mode, setMode] = useState<"linked" | "pending">("linked");
  const [choice, setChoice] = useState<ResolvedTarget>();
  const [gloss, setGloss] = useState("");
  if (selected && selected.target.state !== "entry_only") {
    const target = selected.target;
    return (
      <Flex vertical gap="small" style={{ maxWidth: "min(460px, 85vw)" }}>
        <Typography.Text strong>{literal}</Typography.Text>
        <Typography.Text>
          {target.state === "linked"
            ? `已关联：${labels[`${target.target_entry_id}:${target.target_sense_id}`] ?? "具体词义"}`
            : `待关联：${target.headword}${target.gloss ? ` · ${target.gloss}` : ""}`}
        </Typography.Text>
        <Typography.Text type="secondary">
          清除后可以重新选择词形和词义。
        </Typography.Text>
        <Button size="small" onClick={() => onSelect(undefined)}>
          清除关联
        </Button>
      </Flex>
    );
  }
  return (
    <Flex
      role="group"
      aria-label={`${kind === "word" ? "关联单词" : "关联短语"}：${literal}`}
      vertical
      gap="small"
      style={{ maxWidth: "min(760px, 85vw)" }}
    >
      <Typography.Text strong>
        {segments.map((segment) => segment.surface).join(" … ")}
      </Typography.Text>
      {selected?.target.state === "entry_only" && (
        <Alert type="warning" title="旧关联尚未选择具体词义，请补全或清除。" />
      )}
      <Radio.Group
        value={mode}
        onChange={(event) => setMode(event.target.value)}
        options={[
          { value: "linked", label: "关联已有词义" },
          { value: "pending", label: "词条未创建，记为待关联" }
        ]}
      />
      {mode === "linked" ? (
        <V3TargetCascader
          literal={literal}
          targetKind={kind}
          phraseSelection="entry"
          sourceDialect={dialect}
          targets={choice ? [choice] : []}
          onReplace={(targets) => setChoice(targets[0])}
        />
      ) : (
        <>
          <Input
            aria-label="待关联词面"
            value={literal}
            readOnly
            title="由选中的正文片段确定"
          />
          <Input
            aria-label="待关联释义"
            placeholder="释义或上下文（可选）"
            value={gloss}
            maxLength={2000}
            onChange={(event) => setGloss(event.target.value)}
          />
        </>
      )}
      <Flex justify="end" gap="small">
        <Button size="small" onClick={() => onSelect(undefined)}>
          {selected ? "清除关联" : "取消选择"}
        </Button>
        <Button
          size="small"
          type="primary"
          disabled={mode === "linked" ? !choice : !literal.trim()}
          onClick={() => {
            if (mode === "linked" && choice)
              onTargetLabel(
                `${choice.target_word_id}:${choice.target_sense_id}`,
                `${choice.target_headword} · ${choice.target_gloss}`
              );
            onSelect({
              id: selected?.id ?? crypto.randomUUID(),
              source_dialect: dialect,
              source_segments: segments,
              target:
                mode === "linked" && choice
                  ? {
                      state: "linked",
                      target_entry_id: choice.target_word_id,
                      target_pos_id: choice.target_pos_id,
                      target_base_form_id: choice.target_base_form_id,
                      target_form_id: choice.target_form_id,
                      target_variant_id: choice.target_variant_id,
                      target_sense_id: choice.target_sense_id,
                      ...(choice.target_publication_id
                        ? {
                            target_publication_id: choice.target_publication_id
                          }
                        : {})
                    }
                  : {
                      state: "pending",
                      kind,
                      headword: literal.trim(),
                      gloss: gloss.trim() || null
                    }
            });
          }}
        >
          确认关联
        </Button>
      </Flex>
    </Flex>
  );
}
