import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, RotateCwIcon } from "lucide-react";
import dayjs from "dayjs";
import { HttpError } from "@tsz/api-client";
import type {
  CreateLexiconTaxonomyInput,
  LexiconTaxonomy,
  LexiconTaxonomyKind
} from "@tsz/types";
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Flex,
  PageHeader,
  Space
} from "@tsz/ui/admin/display";
import { Form, Input, InputNumber } from "@tsz/ui/admin/forms";
import { App, Modal } from "@tsz/ui/admin/overlays";
import type { TableColumnsType } from "@tsz/ui/admin/table";
import { AdminTable } from "@/components/AdminTable";
import { TableEmptyState } from "@/components/TableEmptyState";
import { api, usePermission } from "@/lib/auth";
import { useContentTranslation } from "@/features/content/i18n";

export function LexiconTaxonomyManagement({
  kind
}: {
  kind: LexiconTaxonomyKind;
}) {
  const { t } = useContentTranslation();
  const label = t(
    kind === "registers" ? "taxonomy_registers" : "taxonomy_domains"
  );
  const canEdit = usePermission("lexicon_settings.edit_taxonomies");
  const canDelete = usePermission("lexicon_settings.delete");
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const [query, setQuery] = useState({ q: "", page: 1, page_size: 20 });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<LexiconTaxonomy>();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<CreateLexiconTaxonomyInput>();
  const taxonomyKey = ["lexicon-taxonomies", kind] as const;
  const list = useQuery({
    queryKey: [...taxonomyKey, query],
    queryFn: () => api.lexiconTaxonomies.list(kind, query)
  });
  const refresh = () => client.invalidateQueries({ queryKey: taxonomyKey });
  const errorMessage = (error: unknown, action: "save" | "delete") => {
    if (error instanceof HttpError) {
      if (error.code === "taxonomy_conflict") return t("taxonomy_conflict");
      if (error.code === "revision_conflict") return t("taxonomy_stale");
      if (error.status === 404) return t("taxonomy_missing");
    }
    return t(
      action === "save" ? "taxonomy_save_failed" : "taxonomy_delete_failed"
    );
  };
  const save = useMutation({
    mutationFn: (values: CreateLexiconTaxonomyInput) => {
      const input = {
        name_zh: values.name_zh.trim(),
        name_en: values.name_en.trim(),
        sort_order: values.sort_order
      };
      return editing
        ? api.lexiconTaxonomies.update(kind, editing.id, {
            ...input,
            base_revision: editing.revision
          })
        : api.lexiconTaxonomies.create(kind, {
            ...input,
            code: values.code.trim()
          });
    },
    onSuccess: () => {
      setOpen(false);
      message.success(t("taxonomy_saved"));
      void refresh();
    },
    onError: (error) => {
      message.error(errorMessage(error, "save"));
      if (
        error instanceof HttpError &&
        (error.status === 409 || error.status === 404)
      )
        void refresh();
    }
  });
  const showForm = (item?: LexiconTaxonomy) => {
    setEditing(item);
    form.resetFields();
    form.setFieldsValue(
      item ?? { code: "", name_zh: "", name_en: "", sort_order: 0 }
    );
    setOpen(true);
  };
  const remove = (item: LexiconTaxonomy) =>
    modal.confirm({
      title: t("taxonomy_delete", { name: item.name_zh }),
      content: t("taxonomy_delete_help"),
      okText: t("delete"),
      cancelText: t("cancel_spaced"),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.lexiconTaxonomies.remove(kind, item.id, item.revision);
          message.success(t("taxonomy_deleted"));
          // 删除当前页最后一项时返回前一页，保留其余筛选。
          if (query.page > 1 && list.data?.items.length === 1)
            setQuery({ ...query, page: query.page - 1 });
          await refresh();
        } catch (error) {
          message.error(errorMessage(error, "delete"));
          void refresh();
          throw error;
        }
      }
    });
  const columns: TableColumnsType<LexiconTaxonomy> = [
    { title: t("taxonomy_name_zh"), dataIndex: "name_zh", width: 180 },
    { title: t("taxonomy_name_en"), dataIndex: "name_en", width: 220 },
    { title: t("taxonomy_code"), dataIndex: "code", width: 180 },
    {
      title: t("sort_order"),
      dataIndex: "sort_order",
      width: 80,
      align: "right"
    },
    {
      title: t("taxonomy_updated_at"),
      width: 170,
      render: (_, item) => dayjs(item.updated_at).format("YYYY-MM-DD HH:mm")
    },
    {
      title: t("actions"),
      key: "actions",
      fixed: "right",
      width: 160,
      render: (_, item) => (
        <Space>
          <Button
            size="small"
            disabled={!canEdit}
            onClick={() => showForm(item)}
          >
            {t("edit_spaced")}
          </Button>
          <Button
            size="small"
            danger
            disabled={!canDelete}
            onClick={() => remove(item)}
          >
            {t("delete")}
          </Button>
        </Space>
      )
    }
  ];
  return (
    <Flex vertical gap={16}>
      <PageHeader
        title={label}
        breadcrumb={<Breadcrumb items={[{ title: t("lexicon") }]} />}
        actions={
          <Button
            type="primary"
            icon={<PlusIcon />}
            disabled={!canEdit}
            onClick={() => showForm()}
          >
            {t("taxonomy_add", { kind: label })}
          </Button>
        }
      />
      <Card size="small">
        <Flex gap={12} wrap>
          <Input.Search
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={t("taxonomy_search")}
            placeholder={t("taxonomy_search")}
            maxLength={100}
            allowClear
            onSearch={(q) => setQuery({ ...query, q: q.trim(), page: 1 })}
            style={{ width: 360, maxWidth: "100%" }}
          />
          <Button
            onClick={() => {
              setSearch("");
              setQuery({ ...query, q: "", page: 1 });
            }}
          >
            {t("reset")}
          </Button>
        </Flex>
      </Card>
      <Card size="small">
        {list.isError ? (
          <Alert
            showIcon
            type="error"
            title={t("taxonomy_failed")}
            action={
              <Button onClick={() => void list.refetch()}>{t("retry")}</Button>
            }
          />
        ) : (
          <AdminTable<LexiconTaxonomy>
            tableId={`lexicon-${kind}`}
            rowKey="id"
            columns={columns}
            dataSource={list.data?.items ?? []}
            loading={list.isPending}
            scroll={{ x: 1000 }}
            toolbarExtra={
              <Button
                icon={<RotateCwIcon />}
                onClick={() => void list.refetch()}
              >
                {t("taxonomy_refresh")}
              </Button>
            }
            locale={{
              emptyText: (
                <TableEmptyState
                  message={t("taxonomy_empty", { kind: label })}
                  filtered={!!query.q}
                  onResetFilters={() => {
                    setSearch("");
                    setQuery({ ...query, q: "", page: 1 });
                  }}
                />
              )
            }}
            pagination={{
              current: query.page,
              pageSize: query.page_size,
              total: list.data?.pagination.total ?? 0,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50],
              onChange: (page, page_size) =>
                setQuery({ ...query, page, page_size })
            }}
          />
        )}
      </Card>
      <Modal
        open={open}
        title={t(editing ? "taxonomy_edit" : "taxonomy_add", { kind: label })}
        okText={t("save_spaced")}
        cancelText={t("cancel_spaced")}
        confirmLoading={save.isPending}
        okButtonProps={{ disabled: !canEdit }}
        cancelButtonProps={{ disabled: save.isPending }}
        closable={!save.isPending}
        maskClosable={!save.isPending}
        keyboard={!save.isPending}
        onCancel={() => {
          if (!save.isPending) setOpen(false);
        }}
        onOk={() => form.submit()}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => {
            if (canEdit && !save.isPending) save.mutate(values);
          }}
        >
          <Form.Item
            name="name_zh"
            label={t("taxonomy_name_zh")}
            rules={[
              {
                required: true,
                whitespace: true,
                max: 64,
                message: t("name_zh_required")
              }
            ]}
          >
            <Input maxLength={64} autoFocus disabled={save.isPending} />
          </Form.Item>
          <Form.Item
            name="name_en"
            label={t("taxonomy_name_en")}
            rules={[
              {
                required: true,
                whitespace: true,
                max: 64,
                message: t("name_en_required")
              }
            ]}
          >
            <Input maxLength={64} disabled={save.isPending} />
          </Form.Item>
          <Form.Item
            name="code"
            label={t("taxonomy_code")}
            extra={t("taxonomy_code_help")}
            rules={[
              {
                required: true,
                pattern: /^[a-z][a-z0-9_]{0,31}$/,
                message: t("taxonomy_code_required")
              }
            ]}
          >
            <Input maxLength={32} disabled={!!editing || save.isPending} />
          </Form.Item>
          <Form.Item
            name="sort_order"
            label={t("sort_order")}
            rules={[
              {
                required: true,
                type: "integer",
                min: -2147483648,
                max: 2147483647
              }
            ]}
          >
            <InputNumber
              precision={0}
              min={-2147483648}
              max={2147483647}
              disabled={save.isPending}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Flex>
  );
}
