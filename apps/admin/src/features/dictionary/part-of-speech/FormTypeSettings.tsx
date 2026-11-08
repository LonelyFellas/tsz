import { useContentTranslation, ContentText } from "@/features/content/i18n";
import { AdminTable as Table } from "@/components/AdminTable";
import { TableEmptyState } from "@/components/TableEmptyState";
import { usePermission } from "@/lib/auth";
import { PlusIcon } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  Flex,
  Space,
  Typography
} from "@tsz/ui/admin/display";
import { App, Modal, Tooltip } from "@tsz/ui/admin/overlays";
import { Form, Select, Switch } from "@tsz/ui/admin/forms";
import { FullNameEnCell } from "./FullNameEnCell";
import { type TableColumnsType } from "@tsz/ui/admin/table";
import type { CreatePartOfSpeechInput, FormTypeConfig } from "@tsz/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useEffect, useRef, useState } from "react";
import { partOfSpeechDataSource } from "../dataSource";
import { partOfSpeechKeys, usePartOfSpeechCatalog } from "./api";
import { nextSortOrder } from "./catalog";
import { PartOfSpeechSharedFields } from "./PartOfSpeechSharedFields";
import { slugifyCode } from "./PartOfSpeechFormModal";
import { ContentError } from "./PartOfSpeechSettings";

type Values = Omit<CreatePartOfSpeechInput, "code"> & {
  /** 原形没有归属，wire 上是 null；表单里按未选处理。 */
  part_of_speech_id?: string | null;
  is_default?: boolean;
};

/**
 * 词形编码全局唯一，而不同基本词性下允许重名（形容词与副词各有「比较级」），
 * 所以派生编码要带上父词性前缀。父编码本身可长达 32 字，截到 8 字给英文全称留位置。
 */
function deriveFormTypeCode(parentCode: string, fullNameEn: string): string {
  const parent = slugifyCode(parentCode).slice(0, 8);
  return slugifyCode(`${parent} ${fullNameEn}`);
}

export function FormTypeSettings() {
  const { t } = useContentTranslation();
  const canEdit = usePermission("lexicon_settings.edit_forms");
  const canDelete = usePermission("lexicon_settings.delete");
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const catalog = usePartOfSpeechCatalog();
  const ready = !catalog.isError && !!catalog.data?.form_types;
  const supportsDefaultTemplate =
    catalog.data?.form_types?.every(
      (item) => typeof item.is_default === "boolean"
    ) === true;
  const [query, setQuery] = useState<{
    part_of_speech_id?: string;
    page: number;
    page_size: number;
  }>({ page: 1, page_size: 10 });
  // 短语没有词形变化，后端也只接受挂在单词词性下：候选只列单词侧。
  const parts = (catalog.data?.items ?? []).filter(
    (item) => item.kind === "word"
  );
  // 后端列表按 sort_order 全局排序，新建预填也取全局最大值 + 10，
  // 否则新词形默认会插到别的词性中间；管理员可以改。放进 ref 而不是 effect 依赖：
  // 目录随时可能重拉，跟着重跑那个 effect 会连带 resetFields 清空正在填的表单。
  const nextSortOrderRef = useRef(0);
  nextSortOrderRef.current = nextSortOrder(catalog.data?.form_types ?? []);
  const partNameById = new Map(parts.map((item) => [item.id, item.name_zh]));
  const [form] = Form.useForm<Values>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FormTypeConfig>();
  const list = useQuery({
    queryKey: [...partOfSpeechKeys.all, "form-types", query],
    queryFn: () => partOfSpeechDataSource.listFormTypes(query),
    enabled: ready
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: partOfSpeechKeys.all });
  const save = useMutation({
    mutationFn: ({
      part_of_speech_id: partId,
      is_default,
      ...fields
    }: Values) => {
      const values = {
        ...fields,
        ...(supportsDefaultTemplate ? { is_default } : {})
      };
      if (editing) {
        return partOfSpeechDataSource.updateFormType(editing.id, {
          ...values,
          // 原形对所有词性通用，后端不接受归属字段。
          ...(editing.code === "base"
            ? {}
            : { part_of_speech_id: partId ?? undefined }),
          base_revision: editing.revision
        });
      }
      // 表单的 required 规则保证走到这里时归属已选。
      if (!partId) throw new Error("missing part_of_speech_id");
      const parent = parts.find((item) => item.id === partId);
      return partOfSpeechDataSource.createFormType({
        ...values,
        part_of_speech_id: partId,
        code: deriveFormTypeCode(parent?.code ?? "", values.full_name_en)
      });
    },
    onSuccess: async () => {
      await refresh();
      setOpen(false);
      message.success(
        editing ? (
          <ContentText message="form_updated" />
        ) : (
          <ContentText message="form_added" />
        )
      );
    },
    onError: (error) => message.error(<ContentError error={error} />)
  });
  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue({
        ...editing,
        is_default: editing.is_default ?? true
      });
      return;
    }
    form.resetFields();
    form.setFieldValue("is_default", true);
    form.setFieldValue("sort_order", nextSortOrderRef.current);
    // 「全部」视图下留空由管理员选；已经筛到某个词性时直接带上，少点一次。
    if (query.part_of_speech_id) {
      form.setFieldValue("part_of_speech_id", query.part_of_speech_id);
    }
  }, [editing, form, open, query.part_of_speech_id]);
  const remove = (item: FormTypeConfig) =>
    modal.confirm({
      title: (
        <ContentText message="delete_form" params={{ name: item.name_zh }} />
      ),
      content: <ContentText message="delete_form_help" />,
      okText: <ContentText message="delete_spaced" />,
      cancelText: <ContentText message="cancel_spaced" />,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await partOfSpeechDataSource.removeFormType(item.id, {
            base_revision: item.revision
          });
          await refresh();
          message.success(<ContentText message="form_deleted" />);
        } catch (error) {
          message.error(<ContentError error={error} />);
          await refresh();
        }
      }
    });
  const columns: TableColumnsType<FormTypeConfig> = [
    { title: t("sort_order"), dataIndex: "sort_order", width: 64 },
    { title: t("name_zh"), dataIndex: "name_zh", width: 130 },
    { title: t("short_name_zh"), dataIndex: "short_name_zh", width: 120 },
    { title: t("name_en"), dataIndex: "name_en", width: 160 },
    { title: t("abbreviation"), dataIndex: "abbreviation", width: 100 },
    {
      title: t("full_name_en"),
      dataIndex: "full_name_en",
      width: 170,
      render: (value: string) => <FullNameEnCell value={value} />
    },
    {
      title: t("parent_part"),
      dataIndex: "part_of_speech_id",
      width: 120,
      render: (partId?: string | null) =>
        partId ? (partNameById.get(partId) ?? partId) : t("all_parts")
    },
    {
      title: t("links"),
      dataIndex: "usage_count",
      width: 100,
      render: (count: number) =>
        count ? `${t("entries", { count })}` : t("no_links")
    },
    {
      key: "创建人",
      title: t("creator"),
      render: (_, item) => item.created_by.display_name,
      width: 100
    },
    {
      key: "创建时间",
      title: t("created_at"),
      render: (_, item) => dayjs(item.created_at).format("YYYY-MM-DD HH:mm"),
      width: 150
    },
    {
      key: "操作",
      title: t("actions"),
      fixed: "right",
      width: 150,
      render: (_, item) => (
        <Space>
          <Button
            disabled={!canEdit}
            size="small"
            onClick={() => {
              setEditing(item);
              setOpen(true);
            }}
          >
            {t("edit_spaced")}
          </Button>
          <Tooltip
            title={
              item.code === "base"
                ? t("base_required")
                : item.usage_count
                  ? t("linked_entries")
                  : undefined
            }
          >
            <Button
              size="small"
              danger
              disabled={
                !canDelete || item.code === "base" || item.usage_count > 0
              }
              onClick={() => remove(item)}
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
      {!ready && !catalog.isPending && (
        <Alert
          showIcon
          type={catalog.isError ? "error" : "info"}
          title={
            catalog.isError ? t("form_catalog_failed") : t("forms_unsupported")
          }
          action={
            <Button onClick={() => void catalog.refetch()}>
              {t("retry_spaced")}
            </Button>
          }
        />
      )}

      <Card size="small">
        {list.isError && (
          <Alert
            showIcon
            type="error"
            title={t("forms_failed")}
            action={
              <Button onClick={() => void list.refetch()}>
                {t("retry_spaced")}
              </Button>
            }
            style={{ marginBottom: 12 }}
          />
        )}
        <Table<FormTypeConfig>
          toolbar={
            <Button
              type="primary"
              icon={<PlusIcon />}
              disabled={!canEdit || !ready}
              onClick={() => {
                setEditing(undefined);
                setOpen(true);
              }}
            >
              {t("add_form")}
            </Button>
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
                value={query.part_of_speech_id ?? ""}
                showSearch
                optionFilterProp="label"
                loading={catalog.isPending}
                disabled={catalog.isError || parts.length === 0}
                options={[
                  { value: "", label: t("all") },
                  ...parts.map((item) => ({
                    value: item.id,
                    label: item.name_zh
                  }))
                ]}
                onChange={(value) =>
                  setQuery({
                    ...query,
                    part_of_speech_id: value || undefined,
                    page: 1
                  })
                }
                style={{ width: 200 }}
                placeholder={t("select_part")}
              />
            </Flex>
          }

          tableId="form-types"
          locale={{
            emptyText: (
              <TableEmptyState
                message={t("no_forms")}
                filtered={!!query.part_of_speech_id}
                onResetFilters={() =>
                  setQuery({ ...query, page: 1, part_of_speech_id: undefined })
                }
              />
            )
          }}
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={list.data?.items ?? []}
          loading={catalog.isPending || (ready && list.isPending)}
          scroll={{ x: 1300 }}
          pagination={{
            current: query.page,
            pageSize: query.page_size,
            total: list.data?.pagination.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            showTotal: (total) => t("total", { count: total }),
            onChange: (page, page_size) =>
              setQuery({
                ...query,
                page: page_size !== query.page_size ? 1 : page,
                page_size
              })
          }}
        />
      </Card>
      <Modal
        open={open}
        title={editing ? t("edit_form") : t("add_form")}
        width={720}
        okText={editing ? t("save_spaced") : t("create_spaced")}
        cancelText={t("cancel_spaced")}
        okButtonProps={{ disabled: !canEdit }}
        confirmLoading={save.isPending}
        onOk={() => form.submit()}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => {
            if (canEdit) save.mutate(values);
          }}
        >
          <Flex justify="flex-end" style={{ marginBottom: 16 }}>
            <Tooltip
              title={
                editing?.code === "base"
                  ? t("base_default")
                  : !supportsDefaultTemplate
                    ? t("default_unsupported")
                    : t("default_help")
              }
            >
              <Form.Item
                name="is_default"
                label={t("default_template")}
                valuePropName="checked"
                layout="horizontal"
                style={{ marginBottom: 0 }}
              >
                <Switch
                  aria-label={t("default_template")}
                  disabled={
                    !canEdit ||
                    !supportsDefaultTemplate ||
                    editing?.code === "base" ||
                    save.isPending
                  }
                />
              </Form.Item>
            </Tooltip>
          </Flex>
          {editing?.code === "base" ? (
            <Alert
              type="info"
              showIcon
              title={t("base_all_parts")}
              style={{ marginBottom: 16 }}
            />
          ) : (
            <Form.Item
              name="part_of_speech_id"
              label={t("parent_part")}
              rules={[
                {
                  required: true,
                  message: <ContentText message="select_parent" />
                }
              ]}
            >
              <Select
                aria-label={t("parent_part")}
                showSearch
                optionFilterProp="label"
                options={parts.map((item) => ({
                  value: item.id,
                  label: item.name_zh
                }))}
                placeholder={t("select_parent")}
              />
            </Form.Item>
          )}
          <PartOfSpeechSharedFields
            placeholders={{
              name_zh: t("example_past_zh"),
              short_name_zh: t("example_past_zh"),
              name_en: t("example_past_name"),
              abbreviation: t("example_past_abbr"),
              full_name_en: t("example_past_full")
            }}
          />
        </Form>
      </Modal>
    </Flex>
  );
}
