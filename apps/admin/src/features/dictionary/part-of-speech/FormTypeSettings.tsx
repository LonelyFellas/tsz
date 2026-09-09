import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Flex,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tooltip
} from "antd";
import type { TableColumnsType } from "antd";
import type { CreatePartOfSpeechInput, FormTypeConfig } from "@tsz/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { partOfSpeechDataSource } from "../dataSource";
import { partOfSpeechKeys, usePartOfSpeechCatalog } from "./api";
import { nextSortOrder } from "./catalog";
import { PartOfSpeechNameFields } from "./PartOfSpeechNameFields";
import { derivePartOfSpeechCode } from "./PartOfSpeechFormModal";
import { useDerivedNameDefaults } from "./useDerivedNameDefaults";
import { errorMessage } from "./PartOfSpeechSettings";

type Values = Omit<CreatePartOfSpeechInput, "code" | "sort_order">;

export function FormTypeSettings() {
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const catalog = usePartOfSpeechCatalog();
  const ready = !catalog.isError && !!catalog.data?.form_types;
  const [query, setQuery] = useState({ q: "", page: 1, page_size: 10 });
  const [search] = Form.useForm<{ q?: string }>();
  const [form] = Form.useForm<Values>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FormTypeConfig>();
  const markTouched = useDerivedNameDefaults(form, {
    open,
    creating: !editing
  });
  const list = useQuery({
    queryKey: [...partOfSpeechKeys.all, "form-types", query],
    queryFn: () => partOfSpeechDataSource.listFormTypes(query),
    enabled: ready
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: partOfSpeechKeys.all });
  const save = useMutation({
    mutationFn: (values: Values) =>
      editing
        ? partOfSpeechDataSource.updateFormType(editing.id, {
            ...values,
            sort_order: editing.sort_order,
            base_revision: editing.revision
          })
        : partOfSpeechDataSource.createFormType({
            ...values,
            code: derivePartOfSpeechCode(values.full_name_en),
            sort_order: nextSortOrder(catalog.data?.form_types ?? [])
          }),
    onSuccess: async () => {
      await refresh();
      setOpen(false);
      message.success(editing ? "词形变化已更新" : "词形变化已新增");
    },
    onError: (error) => message.error(errorMessage(error))
  });
  useEffect(() => {
    if (!open) return;
    if (editing) form.setFieldsValue(editing);
    else form.resetFields();
  }, [editing, form, open]);
  const remove = (item: FormTypeConfig) =>
    modal.confirm({
      title: `删除词形变化“${item.name_zh}”？`,
      content: "该操作不可恢复。删除后，词条录入和词典建议不再提供此类型。",
      okText: "删 除",
      cancelText: "取 消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await partOfSpeechDataSource.removeFormType(item.id, {
            base_revision: item.revision
          });
          await refresh();
          message.success("词形变化已删除");
        } catch (error) {
          message.error(errorMessage(error));
          await refresh();
        }
      }
    });
  const columns: TableColumnsType<FormTypeConfig> = [
    {
      title: "序号",
      width: 64,
      render: (_, __, index) => (query.page - 1) * query.page_size + index + 1
    },
    { title: "正式中文", dataIndex: "name_zh", width: 130 },
    { title: "简洁显示", dataIndex: "short_name_zh", width: 120 },
    { title: "正式英文", dataIndex: "name_en", width: 160 },
    { title: "英文缩写", dataIndex: "abbreviation", width: 100 },
    { title: "英文全称", dataIndex: "full_name_en", width: 170 },
    {
      title: "引用",
      dataIndex: "usage_count",
      width: 100,
      render: (count: number) => (count ? `${count} 个词条` : "未引用")
    },
    {
      title: "创建人",
      render: (_, item) => item.created_by.display_name,
      width: 100
    },
    {
      title: "创建时间",
      render: (_, item) => dayjs(item.created_at).format("YYYY-MM-DD HH:mm"),
      width: 150
    },
    {
      title: "操作",
      fixed: "right",
      width: 150,
      render: (_, item) => (
        <Space>
          <Button
            size="small"
            onClick={() => {
              setEditing(item);
              setOpen(true);
            }}
          >
            修 改
          </Button>
          <Tooltip
            title={
              item.code === "base"
                ? "原形为必需类型，不能删除"
                : item.usage_count
                  ? "已被词条引用，只能修改"
                  : undefined
            }
          >
            <Button
              size="small"
              danger
              disabled={item.code === "base" || item.usage_count > 0}
              onClick={() => remove(item)}
            >
              删 除
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
            catalog.isError
              ? "词形目录加载失败"
              : "服务尚未提供词形配置，请更新后重试"
          }
          action={<Button onClick={() => void catalog.refetch()}>重 试</Button>}
        />
      )}
      <Card size="small">
        <Flex justify="space-between" align="center" wrap gap={12}>
          <Form
            form={search}
            layout="inline"
            onFinish={({ q }) =>
              setQuery({ ...query, q: q?.trim() ?? "", page: 1 })
            }
          >
            <Form.Item name="q" label="关键词">
              <Input
                allowClear
                placeholder="中文 / 英文 / 编码 / 缩写"
                style={{ width: 260 }}
              />
            </Form.Item>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SearchOutlined />}
              >
                搜 索
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  search.resetFields();
                  setQuery({ ...query, q: "", page: 1 });
                }}
              >
                重 置
              </Button>
            </Space>
          </Form>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!ready}
            onClick={() => {
              setEditing(undefined);
              setOpen(true);
            }}
          >
            新增词形变化
          </Button>
        </Flex>
      </Card>
      <Card size="small">
        {list.isError && (
          <Alert
            showIcon
            type="error"
            title="词形配置加载失败"
            action={<Button onClick={() => void list.refetch()}>重 试</Button>}
            style={{ marginBottom: 12 }}
          />
        )}
        <Table<FormTypeConfig>
          rowKey="id"
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
            showTotal: (total) => `共 ${total} 条`,
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
        title={editing ? "修改词形变化" : "新增词形变化"}
        width={720}
        okText={editing ? "保 存" : "新 建"}
        cancelText="取 消"
        confirmLoading={save.isPending}
        onOk={() => form.submit()}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => save.mutate(values)}
        >
          <PartOfSpeechNameFields
            placeholders={{
              name_zh: "例如 过去式",
              short_name_zh: "例如 过去式",
              name_en: "例如 Past tense",
              abbreviation: "例如 past",
              full_name_en: "例如 past tense"
            }}
            onTouch={markTouched}
          />
        </Form>
      </Modal>
    </Flex>
  );
}
