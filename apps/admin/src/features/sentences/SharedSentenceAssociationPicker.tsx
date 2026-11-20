import { useLexiconEditorTranslation } from "../dictionary/i18n/editor";
import { useState } from "react";
import { linkedSentenceAnnotation } from "./associationModel";
import { Alert, Button, Flex, Typography } from "@tsz/ui/admin/display";
import { Input, Radio } from "@tsz/ui/admin/forms";
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
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import { NextTargetPicker } from "@/features/lexicon-next/NextTargetPicker";

export interface SentenceTargetLabel {
  headword: string;
  gloss?: string | null;
}

export function SharedSentenceAssociationPicker({
  kind,
  segments,
  selected,
  onSelect,
  onCancel,
  dialect,
  labels,
  sourceEntryId,
  sourceSenseId,
  sourcePosId,
  sourceForms,
  onTargetLabel,
  nextRequests,
  nextTargetLocale,
  nextMediumLocale
}: AssociationPickerProps<SharedSentenceAnnotation> & {
  dialect: Dialect;
  labels: Record<string, SentenceTargetLabel>;
  /** 例句所处词条／词义：候选排序时默认置顶（任务 #34）。 */
  sourceEntryId?: string;
  sourceSenseId?: string;
  sourcePosId?: string;
  sourceForms?: AdminWordV3["forms"];
  onTargetLabel: (id: string, label: SentenceTargetLabel) => void;
  nextRequests?: LexiconNextRequests;
  nextTargetLocale?: string;
  nextMediumLocale?: string;
}) {
  const { t } = useLexiconEditorTranslation();
  const literal = segments.map((segment) => segment.surface).join(" ");
  const [mode, setMode] = useState<"linked" | "pending">("linked");
  const [choice, setChoice] = useState<ResolvedTarget>();
  const [gloss, setGloss] = useState("");
  const [source, setSource] = useState<"v3" | "lexicon_next">("v3");
  if (nextRequests && source === "lexicon_next") {
    return (
      <Flex vertical gap="small">
        <Button size="small" onClick={() => setSource("v3")}>
          选择 V3 词条
        </Button>
        <NextTargetPicker
          literal={literal}
          targetLocale={
            nextTargetLocale ?? (dialect === "uk" ? "en-GB" : "en-US")
          }
          mediumLocale={nextMediumLocale ?? "zh-Hans"}
          requests={nextRequests}
          onSelect={(next) =>
            onSelect({
              id: selected?.id ?? crypto.randomUUID(),
              source_dialect: dialect,
              source_segments: segments,
              target: {
                state: "linked",
                target_source: "lexicon_next",
                target_entry_id: next.target_word_id,
                target_pos_id: next.target_pos_id,
                target_base_form_id: next.target_base_form_id,
                target_form_id: next.target_form_id,
                target_variant_id: next.target_variant_id,
                target_sense_id: next.target_sense_id,
                target_dialect: next.target_dialect
              }
            })
          }
          onCancel={onCancel}
        />
      </Flex>
    );
  }
  if (
    selected?.target.state === "linked" &&
    selected.target.target_source === "lexicon_next"
  ) {
    return (
      <Flex vertical gap="small" style={{ maxWidth: "min(760px, 85vw)" }}>
        <Typography.Text className="tsz-words" strong>
          {literal}
        </Typography.Text>
        <Typography.Text type="secondary">
          已关联新版词条的具体词义和词形。
        </Typography.Text>
        <Flex justify="end" gap="small">
          <Button size="small" onClick={() => onSelect(undefined)}>
            清除关联
          </Button>
          {onCancel && (
            <Button size="small" onClick={onCancel}>
              关闭
            </Button>
          )}
        </Flex>
      </Flex>
    );
  }
  if (selected && selected.target.state !== "entry_only") {
    const target = selected.target;
    const label =
      target.state === "linked"
        ? labels[`${target.target_entry_id}:${target.target_sense_id}`]
        : target;
    return (
      <Flex vertical gap="small" style={{ maxWidth: "min(760px, 85vw)" }}>
        <Typography.Text className="tsz-words" strong>
          {literal}
        </Typography.Text>
        <Typography.Text className="tsz-entry-en">
          {target.state === "linked"
            ? t("panel_linked_3", {
                p0: label ? "" : t("panel_specific_meaning")
              })
            : t("panel_pending_link_2", {
                p0: "",
                p1: ""
              })}
          {label && (
            <>
              <span className="tsz-words">{label.headword}</span>
              {label.gloss ? ` · ${label.gloss}` : ""}
            </>
          )}
        </Typography.Text>
        <Typography.Text type="secondary">
          {t(
            "panel_view_linked_entries_clear_a_link_to_select_a_different_form_and_meaning"
          )}
        </Typography.Text>
        <V3TargetCascader
          literal={literal}
          targetKind={kind}
          phraseSelection="entry"
          draftOnly
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
        <Flex justify="end" gap="small">
          <Button size="small" onClick={() => onSelect(undefined)}>
            {t("panel_clear_link")}
          </Button>
          <Button
            size="small"
            aria-label={t("panel_close_link_details")}
            onClick={onCancel}
          >
            {t("panel_close")}
          </Button>
        </Flex>
      </Flex>
    );
  }
  return (
    <Flex
      role="group"
      aria-label={t("panel_label_5", {
        p0: kind === "word" ? t("panel_link_word") : t("panel_link_phrase"),
        p1: literal
      })}
      vertical
      gap="small"
      style={{ maxWidth: "min(760px, 85vw)" }}
    >
      <Typography.Text className="tsz-words" strong>
        {segments.map((segment) => segment.surface).join(" … ")}
      </Typography.Text>
      {nextRequests && (
        <Button size="small" onClick={() => setSource("lexicon_next")}>
          选择新版词条
        </Button>
      )}
      {selected?.target.state === "entry_only" && (
        <Alert
          type="warning"
          title={t(
            "panel_this_historical_link_has_no_specific_meaning_complete_or_clear_it"
          )}
        />
      )}
      <Radio.Group
        value={mode}
        onChange={(event) => setMode(event.target.value)}
        options={[
          { value: "linked", label: t("panel_link_an_existing_meaning") },
          {
            value: "pending",
            label: t("panel_entry_not_created_store_as_pending_link")
          }
        ]}
      />
      {mode === "linked" ? (
        <V3TargetCascader
          literal={literal}
          targetKind={kind}
          phraseSelection="entry"
          draftOnly
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
          <Input
            aria-label={t("panel_pending_surface")}
            className="tsz-words"
            value={literal}
            readOnly
            title={t("panel_determined_by_the_selected_text_segments")}
          />
          <Input
            aria-label={t("panel_pending_definition")}
            placeholder={t("panel_definition_or_context_optional")}
            value={gloss}
            maxLength={2000}
            onChange={(event) => setGloss(event.target.value)}
          />
        </>
      )}
      <Flex justify="end" gap="small">
        <Button size="small" onClick={() => onSelect(undefined)}>
          {selected ? t("panel_clear_link") : t("panel_cancel_selection")}
        </Button>
        <Button
          size="small"
          type="primary"
          disabled={mode === "linked" ? !choice : !literal.trim()}
          onClick={() => {
            if (mode === "linked" && choice)
              onTargetLabel(
                `${choice.target_word_id}:${choice.target_sense_id}`,
                {
                  headword: choice.target_headword,
                  gloss: choice.target_gloss
                }
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
        >
          {t("panel_confirm_link")}
        </Button>
      </Flex>
    </Flex>
  );
}
