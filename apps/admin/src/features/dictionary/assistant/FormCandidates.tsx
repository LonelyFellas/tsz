import {
  useLexiconEditorTranslation,
  useLexiconEditorMessageState,
  createLexiconEditorMessage as uiMessage
} from "../i18n/editor";
import { useFormTypeLabel } from "../part-of-speech/FormTypeLabels";
import { usePartOfSpeechLabel } from "../part-of-speech/PartOfSpeechLabels";
import { primaryRegionalVariant } from "@tsz/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Flex,
  Space,
  Spin,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { App, Modal } from "@tsz/ui/admin/overlays";
import { Checkbox } from "@tsz/ui/admin/forms";
import { Table } from "@tsz/ui/admin/table";
import { ImportIcon, RotateCwIcon } from "lucide-react";
import { HttpError, LexiconAssistantResponseError } from "@tsz/api-client";
import type { LexiconFormCandidatesResponse } from "@tsz/types";
import { expandFormContents, isSharedForms } from "@tsz/shared";
import { api } from "@/lib/auth";
import { newWordNodeId } from "../word-model/primitives";
import { assistantSnapshot, type AssistantEditorContext } from "./context";
import {
  planFormCandidates,
  type CandidateImportRow
} from "./formCandidatesModel";

interface Preview {
  response: LexiconFormCandidatesResponse;
  formsSnapshot: string;
  catalogSnapshot: string;
}

export function FormCandidates({
  context,
  disabled,
  onBusyChange
}: {
  context: AssistantEditorContext;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const formTypeLabel = useFormTypeLabel();
  const partOfSpeechLabel = usePartOfSpeechLabel();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<Preview>();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useLexiconEditorMessageState();
  const request = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => request.current?.abort(), []);
  const allowed =
    !!context.applyForms && !!context.catalog && isSharedForms(context.forms);
  const stale =
    !!preview &&
    (preview.formsSnapshot !== JSON.stringify(context.forms) ||
      preview.catalogSnapshot !== JSON.stringify(context.catalog) ||
      preview.response.base_revision !== context.word.revision ||
      preview.response.entry_id !== context.word.id);
  const plan = useMemo(() => {
    if (!preview || !context.catalog || stale) return undefined;
    try {
      return planFormCandidates(
        context.forms,
        preview.response.pos.filter((row) => selected.includes(row.pos)),
        context.catalog.items
      );
    } catch {
      return undefined;
    }
  }, [preview, selected, context.forms, context.catalog, stale]);
  const generate = async () => {
    if (!allowed || disabled || request.current || !context.catalog) return;
    const snapshot = assistantSnapshot(context);
    const forms = expandFormContents(context.forms);
    const base = forms.pos
      .flatMap((pos) => pos.forms)
      .find((form) => form.form_type === "base")?.regional_variants;
    const baseSpelling = base
      ? base.mode === "common"
        ? base.common.spelling
        : primaryRegionalVariant(base, "us").spelling.trim() ||
          primaryRegionalVariant(base, "uk").spelling
      : "";
    const headword = (
      baseSpelling.trim() ||
      (context.word.presentation.matched_surfaces.find(
        (value) => value.trim() && !/^未命名词条/u.test(value)
      ) ??
        context.word.presentation.label)
    ).trim();
    if (!headword || /^未命名词条/u.test(headword)) {
      setError(uiMessage("candidate_headword_required"));
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    onBusyChange(true);
    setError(undefined);
    const formsSnapshot = JSON.stringify(context.forms),
      catalogSnapshot = JSON.stringify(context.catalog);
    try {
      const response = await api.lexiconAssistant.formCandidates(
        {
          entry_id: context.word.id,
          base_revision: context.word.revision,
          context_id: newWordNodeId(),
          catalog_version: context.catalog.catalog_version,
          headword,
          local_content: snapshot.local_content
        },
        controller.signal
      );
      if (request.current !== controller || controller.signal.aborted) return;
      setPreview({ response, formsSnapshot, catalogSnapshot });
      setSelected(response.pos.map((row) => row.pos));
    } catch (cause) {
      if (request.current === controller && !controller.signal.aborted)
        setError(
          cause instanceof LexiconAssistantResponseError
            ? uiMessage(`assistant_client_${cause.diagnostic}`)
            : cause instanceof HttpError && cause.status === 409
              ? uiMessage("candidate_conflict")
              : cause instanceof HttpError
                ? cause.message
                : uiMessage("candidate_failed")
        );
    } finally {
      if (request.current === controller) {
        request.current = undefined;
        setPending(false);
        onBusyChange(false);
      }
    }
  };
  const close = () => {
    request.current?.abort();
    request.current = undefined;
    setPending(false);
    onBusyChange(false);
    setOpen(false);
  };
  const apply = () => {
    if (!plan?.changed || !preview || stale || !allowed || pending || disabled)
      return;
    if (!context.applyForms?.(plan.forms, preview.formsSnapshot)) {
      setError(uiMessage("candidate_draft_changed"));
      return;
    }
    setOpen(false);
    void message.success(t("candidate_imported", { count: plan.changed }));
  };
  const pronunciation = (side: "uk" | "us", row: CandidateImportRow) => (
    <Flex vertical gap={4}>
      <Typography.Text strong>{row[side].spelling}</Typography.Text>
      <Typography.Text>
        {row[side].dict_phonetic || t("candidate_phonetic_missing")}
      </Typography.Text>
      <Typography.Text type="secondary">
        {t("candidate_actual", {
          value: row[`${side}_actual`] || t("candidate_conversion_missing")
        })}
      </Typography.Text>
    </Flex>
  );
  return (
    <>
      <Button
        icon={<ImportIcon />}
        disabled={!allowed || disabled || pending}
        onClick={() => {
          setOpen(true);
          void generate();
        }}
      >
        {t("candidate_generate")}
      </Button>
      <Modal
        title={t("candidate_preview")}
        centered
        styles={{
          body: { maxHeight: "calc(100dvh - 200px)", overflowY: "auto" }
        }}
        open={open}
        onCancel={close}
        width="min(960px, calc(100vw - 32px))"
        footer={
          <Space wrap>
            <Button aria-label={t("candidate_cancel")} onClick={close}>
              {t("candidate_cancel")}
            </Button>
            <Button
              icon={<RotateCwIcon />}
              loading={pending}
              disabled={!allowed || disabled}
              onClick={() => void generate()}
            >
              {t("candidate_regenerate")}
            </Button>
            <Button
              type="primary"
              disabled={
                !allowed || disabled || pending || stale || !plan?.changed
              }
              onClick={apply}
            >
              {plan?.changed
                ? t("candidate_import_count", { count: plan.changed })
                : t("candidate_import")}
            </Button>
          </Space>
        }
      >
        <Flex vertical gap={16}>
          <Alert
            type="info"
            showIcon
            title={t("candidate_review")}
            description={t("candidate_review_help")}
          />
          {error && <Alert type="error" showIcon title={error} />}
          {stale && (
            <Alert type="warning" showIcon title={t("candidate_stale")} />
          )}
          {pending && (
            <Spin description={t("candidate_pending")}>
              <div style={{ minHeight: 100 }} />
            </Spin>
          )}
          {preview && (
            <>
              <Typography.Text type="secondary">
                {t("candidate_summary", {
                  headword: preview.response.headword,
                  model: preview.response.usage.model
                })}
              </Typography.Text>
              <Checkbox.Group
                value={selected}
                onChange={(value) => setSelected(value as string[])}
                options={preview.response.pos.map((row) => ({
                  value: row.pos,
                  label: partOfSpeechLabel(row.pos)
                }))}
                disabled={pending || stale}
              />
              <Table<CandidateImportRow>
                size="small"
                pagination={false}
                rowKey="key"
                scroll={{ x: 700 }}
                dataSource={plan?.rows ?? []}
                columns={[
                  {
                    title: t("candidate_form"),
                    key: "form",
                    width: 140,
                    render: (_, row) => (
                      <Flex vertical>
                        <span>{partOfSpeechLabel(row.pos)}</span>
                        <span>{formTypeLabel(row.form_type)}</span>
                      </Flex>
                    )
                  },
                  {
                    title: t("candidate_uk"),
                    key: "uk",
                    render: (_, row) => pronunciation("uk", row)
                  },
                  {
                    title: t("candidate_us"),
                    key: "us",
                    render: (_, row) => pronunciation("us", row)
                  },
                  {
                    title: t("candidate_result"),
                    key: "result",
                    width: 180,
                    render: (_, row) => (
                      <>
                        <Tag color={row.changed ? "blue" : "default"}>
                          {row.changed
                            ? t("candidate_to_import")
                            : t("candidate_keep")}
                        </Tag>
                        <div>{row.message && t(row.message)}</div>
                      </>
                    )
                  }
                ]}
              />
              {preview.response.notes.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  title={t("candidate_notes")}
                  description={preview.response.notes.join("；")}
                />
              )}
              {!pending && !stale && !plan?.changed && (
                <Typography.Text type="secondary">
                  {t("candidate_empty")}
                </Typography.Text>
              )}
            </>
          )}
        </Flex>
      </Modal>
    </>
  );
}
