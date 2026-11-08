import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { CircleHelpIcon, TriangleAlertIcon } from "lucide-react";
import { Button, Empty, Flex, Tag, Typography } from "@tsz/ui/admin/display";
import { Checkbox } from "@tsz/ui/admin/forms";
import { Popover } from "@tsz/ui/admin/overlays";
import { useState } from "react";
import type {
  WordFormGroupV3,
  WordPosFormsV3,
  WordSenseWritableV3
} from "@tsz/types";
import { boundFormGroupIds, definitionSummary } from "../meaningsModel";

export function V3FormGroupSenseEditor({
  pos,
  group,
  senses: allSenses,
  savedSenseIds,
  onConfirm,
  onCancel,
  onGoToMeanings,
  onRestoreGeneral
}: {
  pos: WordPosFormsV3;
  group: WordFormGroupV3;
  senses: readonly WordSenseWritableV3[];
  savedSenseIds?: ReadonlySet<string>;
  onConfirm: (senseIds: string[]) => void;
  onCancel: () => void;
  onGoToMeanings?: () => void;
  onRestoreGeneral?: () => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const senses = allSenses.filter(
    (sense) =>
      savedSenseIds?.has(sense.id) ||
      boundFormGroupIds(sense).length > 0 ||
      definitionSummary(sense) !== "待填写释义"
  );
  const [selected, setSelected] = useState(() =>
    senses
      .filter((sense) => boundFormGroupIds(sense).includes(group.id))
      .map((sense) => sense.id)
  );
  const available = senses.filter(
    (sense) => !savedSenseIds || savedSenseIds.has(sense.id)
  );
  const validIds = selected.filter((id) =>
    available.some((sense) => sense.id === id)
  );
  const editing = group.scope === "dedicated";
  return (
    <section
      className="v3-group-sense-editor"
      aria-label={t("dedicated_group_editor", {
        group: pos.form_groups.findIndex((item) => item.id === group.id) + 1
      })}
    >
      <Flex align="center" justify="space-between" gap="small" wrap>
        <Flex align="center" gap={4}>
          <Typography.Text strong>{t("dedicated_senses")}</Typography.Text>
          <Popover
            trigger="click"
            placement="bottomLeft"
            destroyOnHidden
            content={
              <Typography.Paragraph
                type="secondary"
                style={{
                  maxWidth: "min(360px, calc(100vw - 48px))",
                  marginBottom: 0
                }}
              >
                <Typography.Text type="warning">
                  <TriangleAlertIcon aria-hidden="true" />
                </Typography.Text>{" "}
                {t("dedicated_help")}
                <br />
                {t("dedicated_requirements")}
              </Typography.Paragraph>
            }
          >
            <Button
              type="text"
              size="small"
              icon={<CircleHelpIcon />}
              aria-label={t("dedicated_help_label")}
            />
          </Popover>
        </Flex>
        <Typography.Text type="secondary">
          {t("selected_meanings", { count: validIds.length })}
        </Typography.Text>
      </Flex>
      <Flex vertical gap="middle">
        {senses.length === 0 ? (
          <Empty description={t("no_senses_yet")}>
            {onGoToMeanings ? (
              <Button type="primary" onClick={onGoToMeanings}>
                {t("go_add_senses")}
              </Button>
            ) : null}
          </Empty>
        ) : (
          <Flex vertical gap="small" className="v3-group-sense-options">
            {senses.map((sense, index) => {
              const unsaved = savedSenseIds && !savedSenseIds.has(sense.id);
              return (
                <Checkbox
                  key={sense.id}
                  checked={validIds.includes(sense.id)}
                  disabled={Boolean(unsaved)}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...validIds, sense.id]
                        : validIds.filter((id) => id !== sense.id)
                    )
                  }
                >
                  <span className="v3-group-sense-option">
                    <span>
                      <Tag>{sense.level}</Tag>
                      {index + 1}. {definitionSummary(sense)}
                    </span>
                    {unsaved ? (
                      <Typography.Text type="secondary">
                        {t("save_senses_first")}
                      </Typography.Text>
                    ) : null}
                  </span>
                </Checkbox>
              );
            })}
          </Flex>
        )}
        {savedSenseIds &&
        senses.some((sense) => !savedSenseIds.has(sense.id)) &&
        onGoToMeanings ? (
          <Button type="link" onClick={onGoToMeanings}>
            {t("go_save_senses")}
          </Button>
        ) : null}
        {editing && validIds.length === 0 ? (
          <Typography.Text type="warning">
            {t("dedicated_one_required")}
          </Typography.Text>
        ) : null}
      </Flex>
      <Flex
        className="v3-group-sense-editor-actions"
        align="center"
        justify="space-between"
        gap="small"
        wrap
      >
        {editing && onRestoreGeneral ? (
          <Button type="text" onClick={onRestoreGeneral}>
            {t("all_meanings")}
          </Button>
        ) : (
          <span />
        )}
        <Flex gap="small">
          <Button onClick={onCancel}>{t("cancel")}</Button>
          <Button
            type="primary"
            disabled={validIds.length === 0}
            onClick={() => onConfirm(validIds)}
          >
            {t("confirm_selection")}
          </Button>
        </Flex>
      </Flex>
    </section>
  );
}
