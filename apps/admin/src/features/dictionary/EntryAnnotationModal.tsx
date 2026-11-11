import { useLexiconEditorTranslation } from "./i18n/editor";
import {
  defaultLexiconEditorTranslation as creationDefaultT,
  type LexiconEditorTranslation as CreationTranslation
} from "./i18n/editor";
import { useState } from "react";
import type { EntryAnnotationGroup } from "@tsz/types";
import {
  Alert,
  Button,
  Card,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { Form, Input } from "@tsz/ui/admin/forms";
import { Modal } from "@tsz/ui/admin/overlays";
import dayjs from "dayjs";
import { usePartOfSpeechLabel } from "./part-of-speech/PartOfSpeechLabels";
import "./EntryAnnotationModal.css";

export interface AnnotationRow {
  key: string;
  label: string;
  annotation: string | null;
  posLabels?: string[];
  glossPreviews?: string[];
  createdByName?: string;
  updatedAt?: string;
  referenceCount?: number;
  href?: string;
  incoming?: boolean;
  readOnly?: boolean;
  /** 只读的理由；不给就只剩一个没有解释的灰输入框。 */
  readOnlyHint?: string;
}

export function annotationErrors(
  rows: AnnotationRow[],
  values: Record<string, string>,
  groups: EntryAnnotationGroup[],
  required: boolean,
  t: CreationTranslation = creationDefaultT
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const row of rows) {
    if (row.readOnly) continue;
    const value = (values[row.key] ?? "").trim();
    if (!value && required) errors[row.key] = t("creation_enter_an_annotation");
    else if (value && !/^[0-9]+$/.test(value))
      errors[row.key] = t("creation_annotations_must_contain_digits_only");
    else if (value.length > 20)
      errors[row.key] = t("creation_annotations_cannot_exceed_20_digits");
  }
  for (const group of groups) {
    const members = rows.filter(
      (row) => row.incoming || group.entry_ids.includes(row.key)
    );
    for (const row of members) {
      if (row.readOnly || errors[row.key]) continue;
      const value = (values[row.key] ?? "").trim().toLowerCase();
      if (
        value &&
        members.some(
          (other) =>
            other.key !== row.key &&
            (values[other.key] ?? "").trim().toLowerCase() === value
        )
      )
        errors[row.key] = t(
          "creation_annotations_in_the_same_group_must_be_unique"
        );
    }
  }
  return errors;
}

/** Each opening mounts a fresh edit session; failed requests keep this session. */
export function EntryAnnotationModal({
  rows,
  groups,
  creating = false,
  busy = false,
  frozen = false,
  saveDisabled = false,
  error,
  onSave,
  onClose
}: {
  rows: AnnotationRow[];
  groups: EntryAnnotationGroup[];
  creating?: boolean;
  busy?: boolean;
  frozen?: boolean;
  saveDisabled?: boolean;
  error?: string;
  onSave: (values: Record<string, string>) => void;
  onClose: () => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const posLabel = usePartOfSpeechLabel();
  const existingRows = rows.filter((row) => !row.incoming);
  const incomingRows = rows.filter((row) => row.incoming);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.key, row.annotation ?? ""]))
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const errors = annotationErrors(
    rows,
    values,
    groups,
    creating || groups.length > 0,
    t
  );
  const renderRow = (row: AnnotationRow, index: number) => {
    const fieldError = errors[row.key];
    const showError =
      fieldError && (touched[row.key] || values[row.key]?.trim());
    return (
      <div key={row.key} className="entry-annotation-row" data-annotation-row>
        <div className="entry-annotation-details">
          <Space size={8} wrap>
            <Typography.Text className="tsz-words" strong>
              {row.label}
            </Typography.Text>
            {!row.incoming ? (
              <Tag>{t("creation_existing_index", { index: index + 1 })}</Tag>
            ) : null}
            {row.readOnly && row.readOnlyHint ? (
              <Tag>{row.readOnlyHint}</Tag>
            ) : null}
          </Space>
          {!row.incoming ? (
            <>
              {row.posLabels?.length ? (
                <Space size={[4, 4]} wrap>
                  {row.posLabels.map((pos) => (
                    <Tag key={pos}>
                      {/^[a-z_]+$/.test(pos) ? posLabel(pos) : pos}
                    </Tag>
                  ))}
                </Space>
              ) : null}
              <Typography.Text type="secondary">
                {row.glossPreviews?.length
                  ? row.glossPreviews.join("；")
                  : row.posLabels?.length
                    ? t("panel_no_definitions_yet")
                    : t("creation_no_part_of_speech_or_definition")}
              </Typography.Text>
              {row.referenceCount ? (
                <Typography.Text type="secondary">
                  {t("creation_reference_count", { count: row.referenceCount })}
                </Typography.Text>
              ) : null}
              {row.createdByName || row.updatedAt || row.href ? (
                <div className="entry-annotation-meta">
                  {row.createdByName ? (
                    <Typography.Text
                      type="secondary"
                      className="entry-annotation-creator"
                      title={t("creation_creator_label", {
                        name: row.createdByName
                      })}
                    >
                      {row.createdByName}
                    </Typography.Text>
                  ) : null}
                  {row.updatedAt ? (
                    <Typography.Text
                      type="secondary"
                      className="entry-annotation-updated"
                    >
                      <time
                        dateTime={row.updatedAt}
                        title={t("creation_updated_label", {
                          time: dayjs(row.updatedAt).format("YYYY-MM-DD HH:mm")
                        })}
                      >
                        {dayjs(row.updatedAt).format("MM-DD HH:mm")}
                      </time>
                    </Typography.Text>
                  ) : null}
                  {row.href ? (
                    <Button
                      type="link"
                      size="small"
                      className="entry-annotation-view"
                      aria-label={t("creation_view_entry", {
                        label: row.label
                      })}
                      href={row.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("creation_view")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        <Form.Item
          label={t("creation_numeric_annotation")}
          required={!row.readOnly && (creating || groups.length > 0)}
          layout="vertical"
          style={{ marginBottom: 0 }}
          validateStatus={showError ? "error" : undefined}
          help={showError ? fieldError : undefined}
        >
          <Input
            aria-label={t("creation_annotation_field", {
              label: row.incoming ? t("creation_new_entry_d4dfcf") : row.label
            })}
            placeholder={
              row.readOnly ? t("creation_no_annotation") : t("creation_e_g_001")
            }
            inputMode="numeric"
            className="entry-annotation-input"
            value={values[row.key] ?? ""}
            disabled={busy || frozen || row.readOnly}
            onBlur={() =>
              setTouched((current) => ({ ...current, [row.key]: true }))
            }
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                [row.key]: event.target.value
              }))
            }
          />
        </Form.Item>
      </div>
    );
  };
  return (
    <Modal
      title={
        creating
          ? t("creation_set_entry_annotations")
          : t("creation_edit_entry_annotations")
      }
      cancelText={t("batch_cancel")}
      open
      centered
      width={760}
      onCancel={onClose}
      closable={!busy && !frozen}
      maskClosable={!busy && !frozen}
      keyboard={!busy && !frozen}
      cancelButtonProps={{ disabled: busy || frozen }}
      onOk={() => {
        if (busy || frozen || saveDisabled || Object.keys(errors).length)
          return;
        const normalized = Object.fromEntries(
          Object.entries(values).map(([id, value]) => [id, value.trim()])
        );
        onSave(normalized);
      }}
      okText={
        creating
          ? t("creation_save_annotations_and_create")
          : t("creation_save_annotations")
      }
      confirmLoading={busy}
      okButtonProps={{
        disabled:
          busy || frozen || saveDisabled || Object.keys(errors).length > 0
      }}
      destroyOnHidden
    >
      {error ? (
        <Alert
          showIcon
          type="error"
          title={error}
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <div className="entry-annotation-content">
        <div className="entry-annotation-intro">
          <Typography.Text type="secondary">
            {t(
              "creation_entries_with_the_same_base_form_need_different_numeric_annotations_of_up_to_20_digits"
            )}
          </Typography.Text>
        </div>
        {existingRows.length > 0 ? (
          <section aria-label={t("creation_existing_entries")}>
            <Typography.Text strong className="entry-annotation-section-title">
              {t("creation_existing_count", { count: existingRows.length })}
            </Typography.Text>
            <Card size="small" styles={{ body: { padding: 0 } }}>
              {existingRows.map(renderRow)}
            </Card>
          </section>
        ) : null}
        {incomingRows.length > 0 ? (
          <section aria-label={t("creation_new_in_this_request")}>
            <Typography.Text strong className="entry-annotation-section-title">
              {t("creation_new_in_this_request")}
            </Typography.Text>
            <Card
              size="small"
              className="entry-annotation-incoming"
              styles={{ body: { padding: 0 } }}
            >
              {incomingRows.map(renderRow)}
            </Card>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
