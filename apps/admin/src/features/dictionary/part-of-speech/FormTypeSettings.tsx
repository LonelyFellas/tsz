import { PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Flex,
  Form,
  Modal,
  Select,
  Space,
  Table,
  Tooltip,
  Typography
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

type Values = Omit<CreatePartOfSpeechInput, "code" | "sort_order"> & {
  /** 原形没有归属，wire 上是 null；表单里按未选处理。 */
  part_of_speech_id?: string | null;
};

/**
 * 词形编码全局唯一，而不同基本词性下允许重名（形容词与副词各有「比较级」），
 * 所以派生编码要带上父词性前缀。父编码本身可长达 32 字，截到 8 字给英文全称留位置。
 */
function deriveFormTypeCode(parentCode: string, fullNameEn: string): string {
  const parent = derivePartOfSpeechCode(parentCode).slice(0, 8);
  return derivePartOfSpeechCode(`${parent} ${fullNameEn}`);
}

export function FormTypeSettings() {
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const catalog = usePartOfSpeechCatalog();
  const ready = !catalog.isError && !!catalog.data?.form_types;
  const [query, setQuery] = useState<{
    part_of_speech_id?: string;
    page: number;
    page_size: number;
  }>({ page: 1, page_size: 10 });
  const parts = catalog.data?.items ?? [];
  const partNameById = new Map(parts.map((item) => [item.id, item.name_zh]));
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
    mutationFn: ({ part_of_speech_id: partId, ...values }: Values) => {
      if (editing) {
        return partOfSpeechDataSource.updateFormType(editing.id, {
          ...values,
          // 原形对所有词性通用，后端不接受归属字段。
          ...(editing.code === "base"
            ? {}
            : { part_of_speech_id: partId ?? undefined }),
          sort_order: editing.sort_order,
          base_revision: editing.revision
        });
      }
      // 表单的 required 规则保证走到这里时归属已选。
      if (!partId) throw new Error("missing part_of_speech_id");
      const parent = parts.find((item) => item.id === partId);
      return partOfSpeechDataSource.createFormType({
        ...values,
        part_of_speech_id: partId,
        code: deriveFormTypeCode(parent?.code ?? "", values.full_name_en),
        // 后端列表按 sort_order 全局排序，这里也取全局最大值 + 10，
        // 否则新词形会插到别的词性中间。
        sort_order: nextSortOrder(catalog.data?.form_types ?? [])
      });
    },
    onSuccess: async () => {
      await refresh();
      setOpen(false);
      message.success(editing ? "词形变化已更新" : "词形变化已新增");
    },
    onError: (error) => message.error(errorMessage(error))
  });
  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue(editing);
      return;
    }
    form.resetFields();
    // 「全部」视图下留空由管理员选；已经筛到某个词性时直接带上，少点一次。
    if (query.part_of_speech_id) {
      form.setFieldValue("part_of_speech_id", query.part_of_speech_id);
    }
  }, [editing, form, open, query.part_of_speech_id]);
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
      title: "所属基本词性",
      dataIndex: "part_of_speech_id",
      width: 120,
      render: (partId?: string | null) =>
        partId ? (partNameById.get(partId) ?? partId) : "所有词性"
    },
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
          {/* 词形变化总量很小，一页就看完，不提供关键词搜索。 */}
          <Flex align="center" gap={12} wrap>
            <Typography.Text strong>所属基本词性</Typography.Text>
            <Select
              aria-label="所属基本词性"
              value={query.part_of_speech_id ?? ""}
              showSearch
              optionFilterProp="label"
              loading={catalog.isPending}
              disabled={catalog.isError || parts.length === 0}
              options={[
                { value: "", label: "全部" },
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
              placeholder="请选择基本词性"
            />
          </Flex>
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
          {editing?.code === "base" ? (
            <Alert
              type="info"
              showIcon
              title="原形对所有基本词性通用，不归属某一个词性。"
              style={{ marginBottom: 16 }}
            />
          ) : (
            <Form.Item
              name="part_of_speech_id"
              label="所属基本词性"
              rules={[{ required: true, message: "请选择所属基本词性" }]}
            >
              <Select
                aria-label="所属基本词性"
                showSearch
                optionFilterProp="label"
                options={parts.map((item) => ({
                  value: item.id,
                  label: item.name_zh
                }))}
                placeholder="请选择所属基本词性"
              />
            </Form.Item>
          )}
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
