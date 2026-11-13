import { useEffect, useState } from "react";
import { ArrowLeftRightIcon, Undo2Icon } from "lucide-react";
import { Button, Flex, Typography } from "@tsz/ui/admin/display";
import { Input } from "@tsz/ui/admin/forms";
import { App, Modal } from "@tsz/ui/admin/overlays";
import type { Dialect, WordPronunciationV3 } from "@tsz/types";
import { useContentEditPermissions } from "../../contentEditPermissions";
import { useLexiconEditorTranslation } from "../../i18n/editor";
import {
  planPronunciationConversion,
  pronunciationConversionRevision,
  type ConversionField,
  type PronunciationConversionPlan
} from "../pronunciationConversion";
import { localPhoneticDiagnostic } from "./localPhoneticDiagnostic";

export function V3PronunciationConvertAll({
  pronunciation,
  spelling,
  dialect,
  onMissingSpelling,
  onChange
}: {
  pronunciation: WordPronunciationV3;
  spelling: string;
  dialect: Dialect;
  onMissingSpelling?: () => void;
  onChange: (patch: Partial<WordPronunciationV3>) => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const { message } = App.useApp();
  const { edit: canEdit } = useContentEditPermissions();
  const [pending, setPending] = useState<{
    plan: PronunciationConversionPlan;
    revision: string;
  }>();
  const [history, setHistory] = useState<{
    plan: PronunciationConversionPlan;
    revision: string;
  }>();
  const revision = pronunciationConversionRevision(
    pronunciation,
    spelling,
    dialect
  );
  useEffect(() => {
    if (history && history.revision !== revision) setHistory(undefined);
  }, [history, revision]);
  const fieldLabel = (field: ConversionField) => {
    if (field === "actual_pron") return t("actual_pronunciation");
    const [side, alphabet] = field.split(".");
    return `${t(side === "uk" ? "dialect_uk" : "dialect_us")} Azure ${alphabet!.toUpperCase()}`;
  };
  const apply = (plan: PronunciationConversionPlan) => {
    setHistory({
      plan,
      revision: pronunciationConversionRevision(
        { ...pronunciation, ...plan.patch },
        spelling,
        dialect
      )
    });
    onChange(plan.patch);
    setPending(undefined);
  };
  return (
    <>
      <Button
        icon={<ArrowLeftRightIcon />}
        disabled={!canEdit || !pronunciation.dict_phonetic.trim()}
        onClick={() => {
          if (!canEdit) return;
          if (!spelling.trim()) {
            onMissingSpelling?.();
            return;
          }
          const result = planPronunciationConversion(
            pronunciation,
            spelling,
            dialect
          );
          if (!result.ok) {
            void message.error(
              `${fieldLabel(result.field)}：${localPhoneticDiagnostic(result.message, t)}`
            );
            return;
          }
          if (result.plan.requiresConfirmation)
            setPending({ plan: result.plan, revision });
          else apply(result.plan);
        }}
      >
        {t("panel_convert_all")}
      </Button>
      {canEdit && history?.revision === revision && (
        <Button
          icon={<Undo2Icon />}
          aria-label={t("panel_undo_convert_all")}
          title={t("panel_undo_convert_all")}
          onClick={() => {
            if (!canEdit || history.revision !== revision) return;
            onChange(history.plan.undo);
            setHistory(undefined);
          }}
        />
      )}
      <Modal
        open={Boolean(pending)}
        title={t("panel_convert_all")}
        okText={t("creation_apply_conversion")}
        cancelText={t("batch_cancel")}
        okButtonProps={{ disabled: !canEdit }}
        onCancel={() => setPending(undefined)}
        onOk={() => {
          if (!pending || !canEdit) return;
          if (pending.revision !== revision) {
            void message.error(
              t(
                "creation_the_source_accent_or_target_content_has_changed_convert_again"
              )
            );
            setPending(undefined);
            return;
          }
          apply(pending.plan);
        }}
      >
        <Typography.Paragraph>
          {t("panel_convert_all_overwrite")}
        </Typography.Paragraph>
        <Flex vertical gap="middle">
          <Flex gap="middle">
            <Typography.Text style={{ flex: 1 }}>
              {t("conversion_current_value")}
            </Typography.Text>
            <Typography.Text style={{ flex: 1 }}>
              {t("conversion_proposed_value")}
            </Typography.Text>
          </Flex>
          {pending?.plan.rows.map((row) => (
            <Flex vertical gap="small" key={row.field}>
              <Typography.Text strong>{fieldLabel(row.field)}</Typography.Text>
              <Flex gap="middle">
                <Input.TextArea
                  aria-label={`${fieldLabel(row.field)} ${t("conversion_current_value")}`}
                  className="tsz-phonetics"
                  readOnly
                  autoSize
                  value={row.before}
                />
                <Input.TextArea
                  aria-label={`${fieldLabel(row.field)} ${t("conversion_proposed_value")}`}
                  className="tsz-phonetics"
                  readOnly
                  autoSize
                  value={row.after}
                />
              </Flex>
            </Flex>
          ))}
        </Flex>
      </Modal>
    </>
  );
}
