import { useAdminDisabled } from "@tsz/ui/admin/context";
import type { ReactNode } from "react";
import type {
  PartOfSpeechCatalogItem,
  V3DraftValidationIssue
} from "@tsz/types";
import { Typography } from "@tsz/ui/admin/display";
import { InputNumber, Select, Switch } from "@tsz/ui/admin/forms";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { CEFR_OPTIONS } from "../../labels";
import { v3IssueMessage } from "../presentationErrors";

export interface SenseMetadata {
  level?: string;
  sense_group_id?: string;
  sub_pos?: string;
  frequency?: string;
  depends_on_context?: boolean;
}

export function V3SenseMetadataFields({
  sense,
  index,
  catalogPos,
  groupOptions,
  subPosIssue,
  frequencyIssue,
  groupsAvailable = true,
  subPosAvailable = true,
  onChange,
  children
}: {
  sense: SenseMetadata & { id: string };
  index: number;
  catalogPos?: PartOfSpeechCatalogItem;
  groupOptions: { value: string; label: string }[];
  subPosIssue?: V3DraftValidationIssue;
  frequencyIssue?: V3DraftValidationIssue;
  groupsAvailable?: boolean;
  subPosAvailable?: boolean;
  onChange: (patch: Partial<SenseMetadata>) => void;
  children?: ReactNode;
}) {
  const { t } = useLexiconEditorTranslation();
  const disabled = useAdminDisabled();
  const parts = catalogPos?.sub_parts ?? [];
  const selected = parts.find((part) => part.code === sense.sub_pos);
  const extensible = catalogPos?.sub_parts_extensible ?? true;
  const required = catalogPos?.sub_pos_required ?? true;
  const issueHelp = (issue?: V3DraftValidationIssue) =>
    issue ? (
      <Typography.Text className="word-field-help" type="danger">
        {v3IssueMessage(issue, t)}
      </Typography.Text>
    ) : null;
  return (
    <div className="word-sense-meta-grid">
      <label className="word-sense-field">
        <Typography.Text type="secondary">{t("sense_level")}</Typography.Text>
        <Select
          aria-label={t("sense_level_label", { index: index + 1 })}
          data-v3-field="level"
          data-v3-node-id={sense.id}
          onChange={(level: string) => onChange({ level })}
          options={CEFR_OPTIONS}
          value={sense.level}
        />
      </label>
      {groupsAvailable && (
        <label className="word-sense-field word-sense-field-group">
          <Typography.Text type="secondary">
            {t("sense_groups")}
          </Typography.Text>
          <Select
            aria-label={t("sense_group_label", { index: index + 1 })}
            data-v3-field="sense_group_id"
            data-v3-node-id={sense.id}
            onChange={(id: string) =>
              onChange({ sense_group_id: id || undefined })
            }
            options={[
              { label: t("no_sense_group"), value: "" },
              ...groupOptions
            ]}
            labelRender={({ value }) =>
              value === ""
                ? t("no_sense_group")
                : (groupOptions.find((option) => option.value === value)
                    ?.label ?? "")
            }
            placeholder={t("select_group")}
            value={
              groupOptions.some(
                (option) => option.value === sense.sense_group_id
              )
                ? sense.sense_group_id
                : undefined
            }
          />
        </label>
      )}
      {subPosAvailable &&
        (extensible || Boolean(sense.sub_pos) || Boolean(subPosIssue)) && (
          <label className="word-sense-field word-sense-field-pos">
            <Typography.Text type="secondary">{t("sub_pos")}</Typography.Text>
            {extensible ? (
              <Select
                aria-label={t("sense_sub_pos_label", { index: index + 1 })}
                data-v3-field="sub_pos"
                data-v3-node-id={sense.id}
                onChange={(sub_pos: string) => onChange({ sub_pos })}
                options={[
                  ...(required ? [] : [{ label: t("no_sub_pos"), value: "" }]),
                  ...(!sense.sub_pos || selected
                    ? []
                    : [
                        {
                          label: t("sub_pos_unconfigured"),
                          value: sense.sub_pos
                        }
                      ]),
                  ...parts.map((part) => ({
                    label: part.name_zh,
                    value: part.code
                  }))
                ]}
                placeholder={t("select_sub_pos")}
                status={subPosIssue ? "error" : undefined}
                value={required && !sense.sub_pos ? undefined : sense.sub_pos}
              />
            ) : (
              <Typography.Text
                data-v3-field="sub_pos"
                data-v3-node-id={sense.id}
              >
                {selected?.name_zh ?? sense.sub_pos}
              </Typography.Text>
            )}
            {issueHelp(subPosIssue)}
          </label>
        )}
      <label className="word-sense-field word-sense-field-frequency">
        <Typography.Text type="secondary">{t("frequency")}</Typography.Text>
        <InputNumber
          aria-label={t("sense_frequency_label", { index: index + 1 })}
          data-v3-field="frequency"
          data-v3-node-id={sense.id}
          placeholder="0–100"
          max={100}
          min={0}
          onChange={(value) =>
            onChange({ frequency: value === null ? undefined : String(value) })
          }
          precision={2}
          step={0.01}
          suffix="%"
          status={frequencyIssue ? "error" : undefined}
          value={sense.frequency === undefined ? null : Number(sense.frequency)}
        />
        {issueHelp(frequencyIssue)}
      </label>
      <div className="word-sense-context-toggle">
        <Typography.Text type="secondary">
          {t("context_dependent")}
        </Typography.Text>
        <div
          className="word-sense-context-control"
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onChange({ depends_on_context: !sense.depends_on_context });
          }}
        >
          <Switch
            aria-label={t("sense_context_label", { index: index + 1 })}
            checked={sense.depends_on_context ?? false}
            onChange={(depends_on_context) => onChange({ depends_on_context })}
          />
        </div>
      </div>
      {children}
    </div>
  );
}
