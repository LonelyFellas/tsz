import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Empty,
  Flex,
  Space,
  Typography
} from "@tsz/ui/admin/display";
import { Form, Select } from "@tsz/ui/admin/forms";
import { App } from "@tsz/ui/admin/overlays";
import type {
  FormSharingGroup,
  FormSharingTemplate,
  PartOfSpeechCatalogResponse
} from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import { usePermission } from "@/lib/auth";
import { useContentTranslation } from "@/features/content/i18n";
import { newWordNodeId } from "../word-model/primitives";
import { partOfSpeechDataSource } from "../dataSource";
import { partOfSpeechKeys, usePartOfSpeechCatalog } from "./api";
import { localizedCatalogName } from "./catalog";
import { errorMessage } from "./PartOfSpeechSettings";

const memberKey = (part: string, form: string) => `${part}:${form}`;
const formSharingKey = () => [...partOfSpeechKeys.all, "form-sharing"] as const;

export function FormSharingSettings() {
  const { t } = useContentTranslation();
  const catalog = usePartOfSpeechCatalog();
  // Old backends can return 403 for unknown paths. The catalog advertises support first.
  const supported = catalog.data?.form_sharing !== undefined;
  const template = useQuery({
    queryKey: formSharingKey(),
    queryFn: () => partOfSpeechDataSource.getFormSharing(),
    enabled: supported
  });
  if (
    (catalog.isError && !catalog.data) ||
    (template.isError && !template.data)
  )
    return (
      <Alert
        type="error"
        showIcon
        title={t("sharing_load_failed")}
        action={
          <Button
            onClick={() => {
              void catalog.refetch();
              if (supported) void template.refetch();
            }}
          >
            {t("retry_spaced")}
          </Button>
        }
      />
    );
  if (catalog.isPending) return <Card loading />;
  if (!supported) return <Alert type="info" title={t("sharing_unsupported")} />;
  if (!template.data) return <Card loading />;
  return <TemplateEditor catalog={catalog.data!} initial={template.data} />;
}

function TemplateEditor({
  catalog,
  initial
}: {
  catalog: PartOfSpeechCatalogResponse;
  initial: FormSharingTemplate;
}) {
  const { t, i18n } = useContentTranslation();
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const canEdit = usePermission("lexicon_settings.edit_form_sharing");
  // Clean editors follow query data; editing pins the groups and their server revision.
  const [draft, setDraft] = useState<FormSharingTemplate>();
  const { revision, groups } = draft ?? initial;
  const setGroups = (groups: FormSharingGroup[]) =>
    setDraft({ revision, groups });
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const options = catalog.items
    .filter((part) => part.kind === "word")
    .flatMap((part) =>
      (catalog.form_types ?? [])
        .filter(
          (form) => form.code === "base" || form.part_of_speech_id === part.id
        )
        .map((form) => ({
          value: memberKey(part.id, form.id),
          label: `${localizedCatalogName(part, i18n.language)} · ${localizedCatalogName(form, i18n.language)}`,
          member: { part_of_speech_id: part.id, form_type_id: form.id }
        }))
    );
  const used = new Map(
    groups.flatMap((group) =>
      group.members.map(
        (member) =>
          [
            memberKey(member.part_of_speech_id, member.form_type_id),
            group.id
          ] as const
      )
    )
  );
  const save = useMutation({
    mutationFn: () =>
      partOfSpeechDataSource.updateFormSharing({
        base_revision: revision,
        groups
      }),
    onSuccess: async (result) => {
      client.setQueryData(formSharingKey(), result);
      setDraft(undefined);
      setError(undefined);
      setConflict(false);
      await client.invalidateQueries({ queryKey: partOfSpeechKeys.all });
      void message.success(t("sharing_saved"));
    },
    onError: (cause) => {
      const stale =
        cause instanceof HttpError && cause.code === "revision_conflict";
      setConflict(stale);
      setError(stale ? t("sharing_conflict") : errorMessage(cause, t));
    }
  });
  const reload = useMutation({
    mutationFn: async () => {
      await client.cancelQueries({ queryKey: formSharingKey() });
      return partOfSpeechDataSource.getFormSharing();
    },
    onSuccess: (result) => {
      client.setQueryData(formSharingKey(), result);
      setDraft(undefined);
      setError(undefined);
      setConflict(false);
    },
    onError: (cause) => setError(errorMessage(cause, t))
  });
  const pending = save.isPending || reload.isPending;
  return (
    <Card size="small">
      <Form
        layout="vertical"
        onFinish={() => {
          if (!canEdit || pending || conflict) return;
          if (
            groups.some(
              (group) => group.members.length < 2 || group.members.length > 100
            )
          ) {
            setError(t("sharing_min_members"));
            return;
          }
          setError(undefined);
          setDraft({ revision, groups });
          save.mutate();
        }}
      >
        <Flex vertical gap={16}>
          <Typography.Text type="secondary">
            {t("sharing_scope_help")}
          </Typography.Text>
          {error && (
            <Alert
              type="error"
              showIcon
              title={error}
              action={
                conflict ? (
                  <Button
                    disabled={pending}
                    onClick={() =>
                      modal.confirm({
                        title: t("sharing_reload_title"),
                        content: t("sharing_reload_help"),
                        onOk: () => reload.mutateAsync(),
                        okText: t("sharing_reload"),
                        cancelText: t("cancel_spaced")
                      })
                    }
                  >
                    {t("sharing_reload")}
                  </Button>
                ) : undefined
              }
            />
          )}
          {!groups.length && <Empty description={t("sharing_empty")} />}
          {groups.map((group, index) => (
            <Flex key={group.id} gap={12} align="flex-start">
              <Form.Item
                label={t("sharing_group", { count: index + 1 })}
                style={{ flex: 1, minWidth: 0, marginBottom: 0 }}
              >
                <Select
                  mode="multiple"
                  aria-label={t("sharing_group", { count: index + 1 })}
                  showSearch
                  optionFilterProp="label"
                  value={group.members.map((member) =>
                    memberKey(member.part_of_speech_id, member.form_type_id)
                  )}
                  disabled={!canEdit || pending}
                  options={options.map((option) => ({
                    value: option.value,
                    label: option.label,
                    disabled:
                      used.has(option.value) &&
                      used.get(option.value) !== group.id
                  }))}
                  onChange={(values: string[]) =>
                    setGroups(
                      groups.map((row) =>
                        row.id === group.id
                          ? {
                              ...row,
                              members: values.map(
                                (value) =>
                                  options.find(
                                    (option) => option.value === value
                                  )!.member
                              )
                            }
                          : row
                      )
                    )
                  }
                />
              </Form.Item>
              <Button
                danger
                aria-label={t("sharing_delete_group", { count: index + 1 })}
                disabled={!canEdit || pending}
                onClick={() =>
                  setGroups(groups.filter((row) => row.id !== group.id))
                }
              >
                {t("delete_spaced")}
              </Button>
            </Flex>
          ))}
          <Space>
            <Button
              disabled={!canEdit || pending || groups.length >= 100}
              onClick={() =>
                setGroups([...groups, { id: newWordNodeId(), members: [] }])
              }
            >
              {t("sharing_add_group")}
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              disabled={!canEdit || pending || conflict}
              loading={save.isPending}
            >
              {t("save_spaced")}
            </Button>
          </Space>
        </Flex>
      </Form>
    </Card>
  );
}
