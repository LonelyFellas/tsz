import { useLexiconEditorTranslation } from "../../i18n/editor";
import { Button, Flex, Typography } from "@tsz/ui/admin/display";
import type { AssociationPickerProps } from "@tsz/voice-editor/types";
import type {
  Dialect,
  DraftFormsStepContentV3,
  DraftMeaningsStepContentWritableV3
} from "@tsz/types";
import { V3TargetCascader } from "./V3TargetCascader";
import { newWordNodeId } from "../../word-model/primitives";

export function V3TextAssociationPicker({
  kind,
  segments,
  selected,
  onSelect,
  wordId,
  dialect,
  forms,
  meanings
}: AssociationPickerProps & {
  wordId?: string;
  dialect?: Dialect;
  forms?: DraftFormsStepContentV3;
  meanings?: DraftMeaningsStepContentWritableV3;
}) {
  const { t } = useLexiconEditorTranslation();
  const literal = segments.map((segment) => segment.surface).join(" ");
  if (selected) {
    return (
      <Flex vertical gap="small" style={{ maxWidth: "min(360px, 85vw)" }}>
        <Typography.Text className="tsz-words" strong>
          {literal}
        </Typography.Text>
        <Typography.Text className="tsz-entry-en">
          {t("panel_linked_2")}
          <span className="tsz-words">
            {selected.target_headword ?? t("panel_entry")}
          </span>{" "}
          · {selected.target_gloss ?? t("panel_meanings_2")}
          {selected.target_word_id === wordId
            ? t("panel_current_entry_2")
            : selected.target_publication_id
              ? null
              : t("panel_draft_2")}
        </Typography.Text>
        <Typography.Text type="secondary">
          {t(
            "panel_these_words_are_already_linked_clear_their_links_before_selecting_again"
          )}
        </Typography.Text>
        <Button size="small" onClick={() => onSelect(undefined)}>
          {t("panel_clear_link")}
        </Button>
      </Flex>
    );
  }
  return (
    <Flex vertical gap="small" style={{ maxWidth: "min(760px, 85vw)" }}>
      <Typography.Text className="tsz-words" strong>
        {literal}
      </Typography.Text>
      <V3TargetCascader
        key={`${kind}:${literal}`}
        literal={literal.trim()}
        targets={[]}
        prioritizedEntryId={wordId}
        currentDraft={wordId ? { id: wordId, forms, meanings } : undefined}
        targetKind={kind}
        phraseSelection="entry"
        sourceDialect={dialect}
        onReplace={(next) => {
          const chosen = next[0];
          if (!chosen) {
            onSelect(undefined);
            return;
          }
          onSelect({
            id: newWordNodeId(),
            source_segments: segments,
            target_word_id: chosen.target_word_id,
            // 草稿目标没有发布版本，不写这个键；后端按「缺省即草稿」校验。
            ...(chosen.target_publication_id
              ? { target_publication_id: chosen.target_publication_id }
              : {}),
            target_pos_id: chosen.target_pos_id,
            target_base_form_id: chosen.target_base_form_id,
            target_form_id: chosen.target_form_id,
            target_variant_id: chosen.target_variant_id,
            // 记录目标方言侧：变体 id 会随英美结构切换而变，引用按「词形 + 方言侧」重解析。
            ...(chosen.target_dialect
              ? { target_dialect: chosen.target_dialect }
              : {}),
            target_sense_id: chosen.target_sense_id,
            target_headword: chosen.target_headword,
            target_gloss: chosen.target_gloss
          });
        }}
      />
    </Flex>
  );
}
