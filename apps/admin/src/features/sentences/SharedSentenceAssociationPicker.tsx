import { OutlinedInput as MuiOutlinedInput } from "@mui/material";
import {
  Alert as MuiAlert,
  Button as MuiButton,
  Stack as MuiStack,
  Typography as MuiTypography
} from "@mui/material";
import { useState } from "react";
import { linkedSentenceAnnotation } from "./associationModel";
import { RadioGroup, Radio, FormControlLabel } from "@mui/material";
import type { AssociationPickerProps } from "@tsz/voice-editor/types";
import type {
  AdminWordV3,
  Dialect,
  SharedSentenceAnnotation
} from "@tsz/types";
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
  sourceEntryId,
  sourceSenseId,
  sourcePosId,
  sourceForms,
  onTargetLabel
}: AssociationPickerProps<SharedSentenceAnnotation> & {
  dialect: Dialect;
  labels: Record<string, string>;
  /** 例句所处词条／词义：候选排序时默认置顶（任务 #34）。 */
  sourceEntryId?: string;
  sourceSenseId?: string;
  sourcePosId?: string;
  sourceForms?: AdminWordV3["forms"];
  onTargetLabel: (id: string, label: string) => void;
}) {
  const literal = segments.map((segment) => segment.surface).join(" ");
  const [mode, setMode] = useState<"linked" | "pending">("linked");
  const [choice, setChoice] = useState<ResolvedTarget>();
  const [gloss, setGloss] = useState("");
  if (selected && selected.target.state !== "entry_only") {
    const target = selected.target;
    return (
      <MuiStack
        style={{ maxWidth: "min(760px, 85vw)" }}
        direction="column"
        spacing={1}
      >
        <MuiTypography
          className="tsz-entry-en"
          component="span"
          fontWeight={600}
        >
          {literal}
        </MuiTypography>
        <MuiTypography className="tsz-entry-en" component="span">
          {target.state === "linked"
            ? `已关联：${labels[`${target.target_entry_id}:${target.target_sense_id}`] ?? "具体词义"}`
            : `待关联：${target.headword}${target.gloss ? ` · ${target.gloss}` : ""}`}
        </MuiTypography>
        <MuiTypography component="span" color="text.secondary">
          可查看关联列表，清除后可以重新选择词形和词义。
        </MuiTypography>
        <V3TargetCascader
          literal={literal}
          targetKind={kind}
          phraseSelection="entry"
          sourceDialect={dialect}
          prioritizedEntryId={sourceEntryId}
          prioritizedSenseId={sourceSenseId}
          prioritizedPosId={sourcePosId}
          prioritizedForms={sourceForms}
          selectedTarget={
            target.state === "linked"
              ? {
                  target_word_id: target.target_entry_id,
                  target_pos_id: target.target_pos_id,
                  target_form_id: target.target_form_id,
                  target_variant_id: target.target_variant_id,
                  target_sense_id: target.target_sense_id
                }
              : undefined
          }
          targets={[]}
          onReplace={() => {}}
          readOnly
        />
        <MuiButton size="small" onClick={() => onSelect(undefined)}>
          清除关联
        </MuiButton>
      </MuiStack>
    );
  }
  return (
    <MuiStack
      role="group"
      aria-label={`${kind === "word" ? "关联单词" : "关联短语"}：${literal}`}
      style={{ maxWidth: "min(760px, 85vw)" }}
      direction="column"
      spacing={1}
    >
      <MuiTypography className="tsz-entry-en" component="span" fontWeight={600}>
        {segments.map((segment) => segment.surface).join(" … ")}
      </MuiTypography>
      {selected?.target.state === "entry_only" && (
        <MuiAlert severity={"warning"}>
          {"旧关联尚未选择具体词义，请补全或清除。"}
        </MuiAlert>
      )}
      <RadioGroup
        row
        value={mode}
        onChange={(_, value) => setMode(value as "linked" | "pending")}
      >
        <FormControlLabel
          value="linked"
          control={<Radio />}
          label="关联已有词义"
        />
        <FormControlLabel
          value="pending"
          control={<Radio />}
          label="词条未创建，记为待关联"
        />
      </RadioGroup>
      {mode === "linked" ? (
        <V3TargetCascader
          literal={literal}
          targetKind={kind}
          phraseSelection="entry"
          sourceDialect={dialect}
          prioritizedEntryId={sourceEntryId}
          prioritizedSenseId={sourceSenseId}
          prioritizedPosId={sourcePosId}
          prioritizedForms={sourceForms}
          targets={choice ? [choice] : []}
          onReplace={(targets) => setChoice(targets[0])}
        />
      ) : (
        <>
          <MuiOutlinedInput
            data-admin-input
            className="tsz-entry-en"
            readOnly
            title="由选中的正文片段确定"
            inputProps={{
              "aria-label": "待关联词面"
            }}
            value={literal ?? ""}
            size="small"
          />
          <MuiOutlinedInput
            data-admin-input
            placeholder="释义或上下文（可选）"
            onChange={(event) => setGloss(event.target.value)}
            inputProps={{
              "aria-label": "待关联释义",
              maxLength: 2000
            }}
            value={gloss ?? ""}
            size="small"
          />
        </>
      )}
      <MuiStack direction="row" spacing={1} justifyContent={"end"}>
        <MuiButton size="small" onClick={() => onSelect(undefined)}>
          {selected ? "清除关联" : "取消选择"}
        </MuiButton>
        <MuiButton
          size="small"
          disabled={mode === "linked" ? !choice : !literal.trim()}
          onClick={() => {
            if (mode === "linked" && choice)
              onTargetLabel(
                `${choice.target_word_id}:${choice.target_sense_id}`,
                `${choice.target_headword} · ${choice.target_gloss}`
              );
            onSelect(
              mode === "linked" && choice
                ? linkedSentenceAnnotation(
                    dialect,
                    segments,
                    choice,
                    selected?.id
                  )
                : {
                    id: selected?.id ?? crypto.randomUUID(),
                    source_dialect: dialect,
                    source_segments: segments,
                    target: {
                      state: "pending",
                      kind,
                      headword: literal.trim(),
                      gloss: gloss.trim() || null
                    }
                  }
            );
          }}
          variant={"contained"}
        >
          确认关联
        </MuiButton>
      </MuiStack>
    </MuiStack>
  );
}
