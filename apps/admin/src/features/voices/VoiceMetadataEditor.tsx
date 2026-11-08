import {
  useVoiceTranslation,
  VoiceText,
  voiceMessage,
  useVoiceMessageState
} from "./i18n";
import { PencilIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import { speechAccentGroup } from "@tsz/shared";
import type {
  AdminSpeechVoice,
  AdminVoiceLibraryItem,
  AdminVoiceLibraryResponse,
  VoiceAccent
} from "@tsz/types";
import { Alert, Button, Space } from "@tsz/ui/admin/display";
import { App, Tooltip } from "@tsz/ui/admin/overlays";
import { Form, Input, Select } from "@tsz/ui/admin/forms";
import { useEffect, useState, type ReactNode } from "react";
import { api, useAuthStore } from "@/lib/auth";

export interface MetadataEditorState {
  dirty: boolean;
  busy: boolean;
}

interface Props {
  voice: AdminSpeechVoice;
  item?: AdminVoiceLibraryItem;
  field: "description" | "accent";
  disabled: boolean;
  onStateChange?: (id: string, state: MetadataEditorState | null) => void;
  children: ReactNode;
}

export function VoiceMetadataEditor({
  voice,
  item,
  field,
  disabled,
  onStateChange,
  children
}: Props) {
  const { t } = useVoiceTranslation();
  const accountId = useAuthStore((state) => state.profile?.id);
  const client = useQueryClient();
  const { message } = App.useApp();
  const [form] = Form.useForm<{ value: string }>();
  const [baseline, setBaseline] = useState<{
    value: string;
    revision: number;
  }>();
  const [draft, setDraft] = useState("");
  const [action, setAction] = useState<"save" | "restore" | "reload" | null>(
    null
  );
  const [error, setError] = useVoiceMessageState();
  const id = `${voice.alias}:${field}`;
  const label = field === "description" ? t("description") : t("accent");
  const busy = action !== null;
  const editing = baseline !== undefined;
  const dirty = !!baseline && draft !== baseline.value;
  const queryKey = ["admin-speech-library", accountId];
  const currentAccount = () =>
    useAuthStore.getState().profile?.id === accountId;

  useEffect(() => {
    onStateChange?.(id, editing ? { dirty, busy } : null);
  }, [id, editing, dirty, busy, onStateChange]);
  useEffect(() => () => onStateChange?.(id, null), [id, onStateChange]);

  function start(latest: AdminVoiceLibraryItem | undefined) {
    const accent = speechAccentGroup(
      voice.locale,
      latest?.accent ?? voice.accent
    );
    const value =
      field === "description"
        ? (latest?.description_zh ?? "")
        : accent === "uk"
          ? "gb"
          : accent === "us"
            ? "us"
            : "none";
    const revision =
      field === "description"
        ? (latest?.description_revision ?? 0)
        : (latest?.accent_revision ?? 0);
    setBaseline({ value, revision });
    setDraft(value);
    form.setFieldsValue({ value });
    setError(undefined);
  }

  async function save(restore = false) {
    if (!baseline || busy || disabled) return;
    let value = draft;
    if (!restore) {
      try {
        value = (await form.validateFields()).value;
      } catch {
        return;
      }
    }
    if (!currentAccount()) return;
    setAction(restore ? "restore" : "save");
    setError(undefined);
    try {
      const saved =
        field === "accent"
          ? await api.speech.saveAccent(voice.alias, {
              accent: value as VoiceAccent,
              base_revision: baseline.revision
            })
          : restore
            ? await api.speech.restoreDescription(voice.alias, {
                base_revision: baseline.revision
              })
            : await api.speech.saveDescription(voice.alias, {
                description_zh: value,
                base_revision: baseline.revision
              });
      if (!currentAccount()) return;
      await Promise.all([
        client.cancelQueries({ queryKey, exact: true }),
        ...(field === "accent"
          ? [
              client.cancelQueries({
                queryKey: ["admin-speech-voices", accountId],
                exact: true
              })
            ]
          : [])
      ]);
      if (!currentAccount()) return;
      client.setQueryData<AdminVoiceLibraryResponse>(queryKey, (current) => {
        const items = current?.items ?? [];
        return {
          items: items.some((entry) => entry.voice_alias === voice.alias)
            ? items.map((entry) => {
                if (entry.voice_alias !== voice.alias) return entry;
                if (field === "description")
                  return saved.description_revision >=
                    entry.description_revision
                    ? {
                        ...entry,
                        description_zh: saved.description_zh,
                        description_revision: saved.description_revision
                      }
                    : entry;
                return (saved.accent_revision ?? 0) >=
                  (entry.accent_revision ?? 0)
                  ? {
                      ...entry,
                      accent: saved.accent,
                      accent_revision: saved.accent_revision
                    }
                  : entry;
              })
            : [...items, saved]
        };
      });
      if (field === "accent") {
        client.setQueryData<{ items: AdminSpeechVoice[] }>(
          ["admin-speech-voices", accountId],
          (current) =>
            current && {
              items: current.items.map((entry) =>
                entry.alias === voice.alias &&
                (saved.accent_revision ?? 0) >= (entry.accent_revision ?? 0)
                  ? {
                      ...entry,
                      accent: saved.accent,
                      accent_revision: saved.accent_revision
                    }
                  : entry
              )
            }
        );
        void client.invalidateQueries({
          queryKey: ["admin-speech-voices", accountId]
        });
      }
      setBaseline(undefined);
      void message.success(
        field === "accent" ? (
          <VoiceText message="accent_classification_saved" />
        ) : restore ? (
          <VoiceText message="official_description_restored" />
        ) : (
          <VoiceText message="chinese_description_saved_all_administrators_with_voice_viewing_p" />
        )
      );
    } catch (cause) {
      if (currentAccount())
        setError(
          cause instanceof HttpError && cause.status === 409
            ? voiceMessage(
                "this_information_changed_in_another_page_your_input_has_been_kept"
              )
            : voiceMessage("could_not_save_your_input_has_been_kept_try_again")
        );
    } finally {
      setAction(null);
    }
  }

  async function reload() {
    if (busy) return;
    setAction("reload");
    try {
      const latest = await client.fetchQuery({
        queryKey,
        queryFn: ({ signal }) => api.speech.library(signal),
        staleTime: 0
      });
      if (currentAccount())
        start(latest.items.find((entry) => entry.voice_alias === voice.alias));
    } catch {
      if (currentAccount())
        setError(
          voiceMessage("could_not_reload_your_input_has_been_kept_try_again")
        );
    } finally {
      setAction(null);
    }
  }

  if (!baseline)
    return (
      <div className="voice-catalog-editable">
        {children}
        <Tooltip
          title={
            field === "accent" && item?.accent_revision == null
              ? t("accent_classification_cannot_be_changed_for_this_voice_yet")
              : t("edit_field", { field: label })
          }
        >
          <Button
            type="text"
            size="small"
            icon={<PencilIcon />}
            aria-label={t("edit_voice_field", {
              name: voice.display_name,
              field: label
            })}
            disabled={
              disabled || (field === "accent" && item?.accent_revision == null)
            }
            onClick={() => start(item)}
          />
        </Tooltip>
      </div>
    );

  return (
    <Form
      form={form}
      layout="vertical"
      className="voice-catalog-editor"
      aria-label={t("edit_voice_field", {
        name: voice.display_name,
        field: label
      })}
      disabled={disabled || busy}
      onValuesChange={(_, values) => setDraft(values.value)}
      onFinish={() => void save()}
    >
      <Form.Item
        name="value"
        rules={
          field === "description"
            ? [
                {
                  message: (
                    <VoiceText message="descriptions_must_be_at_most_3000_characters" />
                  ),

                  validator: (_, value: string) =>
                    Array.from(value ?? "").length <= 3000
                      ? Promise.resolve()
                      : Promise.reject(
                          new Error(
                            "descriptions_must_be_at_most_3000_characters"
                          )
                        )
                }
              ]
            : [{ required: true }]
        }
      >
        {field === "description" ? (
          <Input.TextArea
            aria-label={t("chinese_description")}
            autoSize={{ minRows: 3, maxRows: 8 }}
          />
        ) : (
          <Select
            aria-label={t("current_accent_classification")}
            options={[
              { value: "gb", label: t("british") },
              { value: "us", label: t("american") },
              { value: "none", label: t("unclassified") }
            ]}
          />
        )}
      </Form.Item>
      <Space size={4} wrap>
        <Button
          size="small"
          type="primary"
          htmlType="submit"
          loading={action === "save"}
        >
          {field === "description" ? t("save_description") : t("save_accent")}
        </Button>
        <Button
          size="small"
          onClick={() => {
            setBaseline(undefined);
            setError(undefined);
          }}
        >
          {t("cancel")}
        </Button>
        {field === "description" && item?.description_zh != null && (
          <Button
            size="small"
            type="link"
            loading={action === "restore"}
            onClick={() => void save(true)}
          >
            {t("restore_official_description")}
          </Button>
        )}
      </Space>
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          action={
            <Button
              size="small"
              loading={action === "reload"}
              disabled={busy}
              onClick={() => void reload()}
            >
              {t("reload")}
            </Button>
          }
        />
      )}
    </Form>
  );
}
