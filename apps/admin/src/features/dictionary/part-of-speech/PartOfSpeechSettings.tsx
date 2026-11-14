import {
  useContentTranslation,
  ContentText,
  defaultContentTranslation,
  type ContentTranslation,
  type ContentKey
} from "@/features/content/i18n";
import { AdminTable as Table } from "@/components/AdminTable";
import { TableEmptyState } from "@/components/TableEmptyState";
import { useIsSuperAdmin, usePermission } from "@/lib/auth";
import { FormSharingSettings } from "./FormSharingSettings";
import { FormTypeSettings } from "./FormTypeSettings";
import { PlusIcon, RotateCwIcon, SearchIcon } from "lucide-react";
import {
  Alert,
  Breadcrumb,
  PageHeader,
  Button,
  Card,
  Flex,
  Space,
  Tag,
  Tabs,
  Typography
} from "@tsz/ui/admin/display";
import { App, Tooltip } from "@tsz/ui/admin/overlays";
import { Form, Input, Segmented, Select } from "@tsz/ui/admin/forms";
import { FullNameEnCell } from "./FullNameEnCell";
import { type TableColumnsType } from "@tsz/ui/admin/table";
import { HttpError } from "@tsz/api-client";
import type { AdminWordKind, PartOfSpeechConfig } from "@tsz/types";
import dayjs from "dayjs";
import { useRef, useState } from "react";
import {
  usePartOfSpeechCatalog,
  usePartOfSpeechConfigList,
  useRemovePartOfSpeech
} from "./api";
import { nextSortOrder } from "./catalog";
import { PartOfSpeechFormModal } from "./PartOfSpeechFormModal";
import { SubPartOfSpeechPanel } from "./SubPartOfSpeechDrawer";
import type { SubPartOfSpeechPanelHandle } from "./SubPartOfSpeechDrawer";

// 后端 409 冲突会带上撞车的字段名。
const CONFLICT_FIELD_LABEL: Record<string, ContentKey> = {
  name_zh: "name_zh",
  name_en: "name_en",
  abbreviation: "abbreviation",
  short_name_zh: "short_name_zh",
  full_name_en: "full_name_en"
};

function conflictMessage(
  kind: string,
  field: string | null | undefined,
  t: ContentTranslation
) {
  if (field === "code") {
    return t("conflict_code", { kind });
  }
  const label = field ? CONFLICT_FIELD_LABEL[field] : undefined;
  return label
    ? t("conflict_field", { label: t(label), kind })
    : t("conflict_name", { kind });
}

export function errorMessage(
  error: unknown,
  t: ContentTranslation = defaultContentTranslation
): string {
  if (error instanceof HttpError) {
    if (
      (error.code === "form_type_in_use" ||
        error.code === "part_of_speech_in_use") &&
      error.problem?.field === "form_sharing"
    )
      return t("sharing_remove_reference");
    if (
      error.code === "form_type_in_use" &&
      error.problem?.field === "part_of_speech_id"
    )
      return t("sharing_reparent_blocked");
    if (error.code === "form_type_conflict")
      return conflictMessage(t("form_type"), error.problem?.field, t);
    if (error.code === "form_type_in_use") return t("form_in_use");
    if (error.code === "form_type_required") return t("base_required");
    if (error.code === "form_type_not_found") return t("form_not_found");
    if (error.code === "invalid_form_type") return t("invalid_form");
    if (error.code === "part_of_speech_conflict")
      return conflictMessage(t("basic_part"), error.problem?.field, t);
    if (error.code === "sub_part_of_speech_conflict")
      return error.problem?.field === "code"
        ? t("internal_conflict")
        : conflictMessage(t("sub_part"), error.problem?.field, t);
    if (error.code === "part_of_speech_in_use") return t("part_in_use");
    if (error.code === "part_of_speech_has_form_types")
      return t("part_has_forms");
    if (error.code === "part_of_speech_has_sub_parts")
      return t("part_has_subs");
    if (error.code === "sub_part_of_speech_in_use") return t("sub_in_use");
    if (error.code === "sub_part_of_speech_not_allowed")
      return t("sub_not_allowed");
    if (error.code === "revision_conflict") return t("revision_conflict");
    if (error.code === "part_of_speech_not_found") return t("part_not_found");
    if (error.code === "sub_part_of_speech_not_found")
      return t("sub_not_found");
    if (error.code === "invalid_part_of_speech") return t("invalid_part");
    if (error.code === "invalid_request_body") return t("invalid_body");
    if (error.code === "invalid_query") return t("invalid_query");
  }
  return error instanceof Error ? error.message : t("action_failed");
}

export function PartOfSpeechSettings() {
  const { t } = useContentTranslation();
  const canEdit = usePermission("lexicon_settings.edit_basic");
  const canEditSub = usePermission("lexicon_settings.edit_sub");
  const canDelete = useIsSuperAdmin();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<{ q?: string }>();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PartOfSpeechConfig>();
  const [activeTab, setActiveTab] = useState<
    "basic" | "detailed" | "forms" | "sharing"
  >("basic");
  // 单词与短语共用这一套配置界面，只是各看各的一侧；短语没有词形变化。
  const [kind, setKind] = useState<AdminWordKind>("word");
  const [selectedPartId, setSelectedPartId] = useState("");
  const subPanelRef = useRef<SubPartOfSpeechPanelHandle>(null);
  const list = usePartOfSpeechConfigList({
    q: q || undefined,
    kind,
    page,
    page_size: pageSize
  });
  const catalog = usePartOfSpeechCatalog();
  // 新建基本词性时排序值自动排在目录最后；目录没加载完前不开新建，免得算出错误的排序。
  const catalogReady = !catalog.isPending && !catalog.isError;
  const remove = useRemovePartOfSpeech();
  // 目录一次返回两侧，界面按当前分页收窄：细分词性面板、序号预填都只看这一侧。
  const parts = (catalog.data?.items ?? []).filter(
    (item) => item.kind === kind
  );
  const defaultSortOrder = nextSortOrder(parts);

  const switchKind = (next: AdminWordKind) => {
    setKind(next);
    setPage(1);
    setSelectedPartId("");
    // 短语没有词形变化，停在那个 Tab 上会看到一片和当前分页无关的内容。
    setActiveTab((current) =>
      next === "phrase" && (current === "forms" || current === "sharing")
        ? "basic"
        : current
    );
  };
  // 空串表示「全部」：面板并排展示所有词性的细分词性；新增时在弹窗里选所属词性。
  const selectedPart = parts.find((item) => item.id === selectedPartId);

  const showError = (error: unknown) =>
    message.error(<ContentError error={error} />);

  const removeItem = (item: PartOfSpeechConfig) => {
    modal.confirm({
      title: (
        <ContentText message="delete_part" params={{ name: item.name_zh }} />
      ),
      content: <ContentText message="irreversible" />,
      okText: <ContentText message="delete_spaced" />,
      okButtonProps: { danger: true },
      cancelText: <ContentText message="cancel_spaced" />,
      onOk: async () => {
        try {
          await remove.mutateAsync({
            id: item.id,
            base_revision: item.revision
          });
          message.success(<ContentText message="part_deleted" />);
        } catch (error) {
          showError(error);
          await list.refetch();
        }
      }
    });
  };

  const columns: TableColumnsType<PartOfSpeechConfig> = [
    { title: t("sort_order"), dataIndex: "sort_order", width: 64 },
    { title: t("name_zh"), dataIndex: "name_zh", width: 120 },
    { title: t("short_name_zh"), dataIndex: "short_name_zh", width: 110 },
    { title: t("name_en"), dataIndex: "name_en", width: 130 },
    { title: t("abbreviation"), dataIndex: "abbreviation", width: 90 },
    {
      title: t("full_name_en"),
      dataIndex: "full_name_en",
      width: 140,
      render: (value: string) => <FullNameEnCell value={value} />
    },
    {
      title: t("sub_parts"),
      dataIndex: "sub_part_count",
      width: 90,
      render: (count: number) => t("items", { count })
    },
    {
      title: t("form_types"),
      dataIndex: "allowed_form_types",
      width: 100,
      render: (types: PartOfSpeechConfig["allowed_form_types"]) =>
        types ? t("items", { count: types.length }) : "—"
    },
    {
      title: t("links"),
      dataIndex: "usage_count",
      width: 100,
      render: (count: number) =>
        count > 0 ? (
          <Tag color="blue">{t("entries", { count })}</Tag>
        ) : (
          t("no_links")
        )
    },
    {
      title: t("creator"),
      dataIndex: "created_by",
      width: 100,
      render: (actor: PartOfSpeechConfig["created_by"]) => actor.display_name
    },
    {
      title: t("created_at"),
      dataIndex: "created_at",
      width: 150,
      render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm")
    },
    {
      title: t("actions"),
      key: "actions",
      fixed: "right",
      width: 150,
      render: (_, item) => (
        <Space>
          <Button
            disabled={!canEdit}
            size="small"
            onClick={() => {
              setEditing(item);
              setFormOpen(true);
            }}
          >
            {t("edit_spaced")}
          </Button>
          <Tooltip
            title={
              item.usage_count > 0
                ? t("linked_words", { count: item.usage_count })
                : item.sub_part_count > 0
                  ? t("remaining_subs", { count: item.sub_part_count })
                  : (item.allowed_form_types?.length ?? 0) > 0
                    ? t("remaining_forms", {
                        count: item.allowed_form_types!.length
                      })
                    : undefined
            }
          >
            <Button
              size="small"
              danger
              disabled={
                !canDelete ||
                item.usage_count > 0 ||
                item.sub_part_count > 0 ||
                // 候选清单就是该词性名下的非原形词形，长度即数量。
                (item.allowed_form_types?.length ?? 0) > 0
              }
              onClick={() => removeItem(item)}
            >
              {t("delete_spaced")}
            </Button>
          </Tooltip>
        </Space>
      )
    }
  ];

  return (
    <Flex vertical gap={16}>
      <PageHeader
        title={t("parts_settings")}
        breadcrumb={
          <Breadcrumb
            aria-label={t("breadcrumb")}
            items={[{ title: t("lexicon") }]}
          />
        }
      />
      {/* Tab 自带的上内边距与下外边距会让它和上下块的间距比页面统一的 16px 大，这里归零。 */}

      <Tabs
        size="large"
        activeKey={kind}
        onChange={(key) => switchKind(key as AdminWordKind)}
        items={[
          { key: "word", label: t("word") },
          { key: "phrase", label: t("phrase") }
        ]}
      />

      <Segmented
        aria-label={t("settings_section")}
        value={activeTab}
        onChange={(key) =>
          setActiveTab(key as "basic" | "detailed" | "forms" | "sharing")
        }
        style={{ alignSelf: "flex-start" }}
        options={[
          { value: "basic", label: t("basic_parts") },
          { value: "detailed", label: t("sub_parts") },
          ...(kind === "phrase"
            ? []
            : [
                { value: "forms", label: t("form_types") },
                { value: "sharing", label: t("sharing_title") }
              ])
        ]}
      />

      {activeTab === "sharing" && kind === "word" ? (
        <FormSharingSettings />
      ) : activeTab === "forms" && kind === "word" ? (
        <FormTypeSettings />
      ) : activeTab === "basic" ? (
        <>
          <Card className="admin-filter-card" size="small">
            <Form
              className="admin-filter-form"
              colon={false}
              form={form}
              layout="inline"
              onFinish={({ q: nextQ }) => {
                setQ(nextQ?.trim() ?? "");
                setPage(1);
              }}
            >
              <Form.Item name="q" label={t("keyword")}>
                <Input
                  allowClear
                  placeholder={t("part_search_placeholder")}
                  style={{ width: 260 }}
                />
              </Form.Item>
              <Form.Item className="admin-filter-actions">
                <Space>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<SearchIcon />}
                  >
                    {t("search_spaced")}
                  </Button>
                  <Button
                    icon={<RotateCwIcon />}
                    onClick={() => {
                      form.resetFields();
                      setQ("");
                      setPage(1);
                    }}
                  >
                    {t("reset_spaced")}
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          <Card size="small">
            {list.isError && (
              <Alert
                type="error"
                showIcon
                title={t("parts_failed")}
                description={list.error.message}
                action={
                  <Button size="small" onClick={() => void list.refetch()}>
                    {t("retry_spaced")}
                  </Button>
                }
                style={{ marginBottom: 12 }}
              />
            )}
            <Table<PartOfSpeechConfig>
              toolbar={
                <Button
                  type="primary"
                  icon={<PlusIcon />}
                  disabled={!canEdit || !catalogReady}
                  onClick={() => {
                    setEditing(undefined);
                    setFormOpen(true);
                  }}
                >
                  {t("add_part")}
                </Button>
              }

              tableId="parts-of-speech"
              locale={{
                emptyText: (
                  <TableEmptyState
                    message={t("no_parts")}
                    filtered={!!q}
                    onResetFilters={() => {
                      form.resetFields();
                      setQ("");
                      setPage(1);
                    }}
                  />
                )
              }}
              rowKey="id"
              size="middle"
              columns={columns}
              dataSource={list.data?.items ?? []}
              loading={list.isPending}
              scroll={{ x: 1240 }}
              pagination={{
                current: page,
                pageSize,
                total: list.data?.pagination.total ?? 0,
                showSizeChanger: true,
                pageSizeOptions: [10, 20, 50],
                showTotal: (total) => t("total", { count: total }),
                onChange: (nextPage, nextSize) => {
                  setPage(nextSize !== pageSize ? 1 : nextPage);
                  setPageSize(nextSize);
                }
              }}
            />
          </Card>
        </>
      ) : (
        <>
          {catalog.isError && (
            <Alert
              type="error"
              showIcon
              title={t("catalog_failed")}
              description={catalog.error.message}
              action={
                <Button size="small" onClick={() => void catalog.refetch()}>
                  {t("retry_spaced")}
                </Button>
              }
            />
          )}

          <SubPartOfSpeechPanel
            toolbar={
              <Tooltip
                title={
                  !catalog.isError && parts.length === 0
                    ? t("no_parts")
                    : undefined
                }
              >
                <Button
                  type="primary"
                  icon={<PlusIcon />}
                  disabled={
                    !canEditSub || catalog.isError || parts.length === 0
                  }
                  onClick={() => subPanelRef.current?.openCreate()}
                >
                  {t("add_sub")}
                </Button>
              </Tooltip>
            }
            toolbarExtra={
              <Flex
                className="admin-table-toolbar-filter"
                align="center"
                gap={12}
                wrap
              >
                <Typography.Text type="secondary">
                  {t("parent_part")}
                </Typography.Text>
                <Select
                  aria-label={t("parent_part")}
                  value={selectedPart?.id ?? ""}
                  showSearch
                  optionFilterProp="label"
                  loading={catalog.isPending}
                  disabled={catalog.isError || !parts.length}
                  options={[
                    { value: "", label: t("all") },
                    ...parts.map((item) => ({
                      value: item.id,
                      label: item.name_zh
                    }))
                  ]}
                  onChange={setSelectedPartId}
                  style={{ width: 220 }}
                  placeholder={t("select_part")}
                />
              </Flex>
            }
            ref={subPanelRef}
            parents={selectedPart ? [selectedPart] : parts}
            createParent={selectedPart}
            filtered={!!selectedPart}
            onResetFilters={() => setSelectedPartId("")}
            loading={catalog.isPending}
            onSaved={(text) => message.success(text)}
            onError={showError}
          />
        </>
      )}

      <PartOfSpeechFormModal
        open={formOpen}
        value={editing}
        kind={editing?.kind ?? kind}
        defaultSortOrder={defaultSortOrder}
        onClose={() => setFormOpen(false)}
        onSaved={(saved) => {
          if (editing) {
            message.success(<ContentText message="part_updated" />);
            return;
          }
          message.success(<ContentText message="part_added" />);
          // 新建的词性名下还没有细分词性，直接把管理员带到细分词性 Tab 去配。
          setSelectedPartId(saved.id);
          setActiveTab("detailed");
        }}
        onError={showError}
      />
    </Flex>
  );
}

export function ContentError({ error }: { error: unknown }) {
  const { t } = useContentTranslation();
  return <>{errorMessage(error, t)}</>;
}
