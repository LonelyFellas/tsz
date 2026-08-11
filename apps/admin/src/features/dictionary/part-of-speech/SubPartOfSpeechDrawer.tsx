import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tag,
  Tooltip
} from "antd";
import type { TableColumnsType } from "antd";
import type {
  CreateSubPartOfSpeechInput,
  PartOfSpeechConfig,
  SubPartOfSpeechConfig
} from "@tsz/types";
import { useEffect, useState } from "react";
import {
  useCreateSubPartOfSpeech,
  useRemoveSubPartOfSpeech,
  useSubPartOfSpeechList,
  useUpdateSubPartOfSpeech
} from "./api";

interface Props {
  parent?: Pick<PartOfSpeechConfig, "id" | "name_zh">;
  onSaved: (message: string) => void;
  onError: (error: unknown) => void;
}

function SubPartFormModal({
  parent,
  value,
  open,
  onClose,
  onSaved,
  onError
}: {
  parent: Pick<PartOfSpeechConfig, "id" | "name_zh">;
  value?: SubPartOfSpeechConfig;
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (error: unknown) => void;
}) {
  const [form] = Form.useForm<CreateSubPartOfSpeechInput>();
  const create = useCreateSubPartOfSpeech();
  const update = useUpdateSubPartOfSpeech();

  useEffect(() => {
    if (!open) return;
    if (value) {
      form.setFieldsValue({
        code: value.code,
        name_zh: value.name_zh,
        name_en: value.name_en,
        sort_order: value.sort_order
      });
    } else {
      form.resetFields();
      form.setFieldValue("sort_order", 100);
    }
  }, [form, open, value]);

  const submit = async (values: CreateSubPartOfSpeechInput) => {
    try {
      if (value) {
        await update.mutateAsync({
          partId: parent.id,
          subId: value.id,
          input: {
            base_revision: value.revision,
            name_zh: values.name_zh,
            name_en: values.name_en,
            sort_order: values.sort_order
          }
        });
      } else {
        await create.mutateAsync({ partId: parent.id, input: values });
      }
      onSaved(value ? "细分词性已更新" : "细分词性已新增");
      onClose();
    } catch (error) {
      onError(error);
    }
  };

  return (
    <Modal
      open={open}
      title={value ? "修改细分词性" : `为“${parent.name_zh}”新增细分词性`}
      okText={value ? "保 存" : "新 建"}
      cancelText="取 消"
      confirmLoading={create.isPending || update.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item
          name="code"
          label="稳定编码"
          rules={[
            { required: true, message: "请输入稳定编码" },
            {
              pattern: /^[A-Z][A-Z0-9_-]{0,31}$/,
              message: "使用大写字母、数字、连字符或下划线"
            }
          ]}
        >
          <Input disabled={Boolean(value)} placeholder="例如 N-COLLECTIVE" />
        </Form.Item>
        <Form.Item
          name="name_zh"
          label="细分词性中文"
          rules={[
            { required: true, whitespace: true, message: "请输入中文名称" },
            { max: 64, message: "中文名称不能超过 64 个字符" }
          ]}
        >
          <Input placeholder="例如 集合名词" />
        </Form.Item>
        <Form.Item
          name="name_en"
          label="细分词性英文"
          rules={[
            { required: true, whitespace: true, message: "请输入英文名称" },
            { max: 64, message: "英文名称不能超过 64 个字符" }
          ]}
        >
          <Input placeholder="例如 Collective noun" />
        </Form.Item>
        <Form.Item
          name="sort_order"
          label="排序值"
          rules={[{ required: true, message: "请输入排序值" }]}
        >
          <InputNumber precision={0} style={{ width: "100%" }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function SubPartOfSpeechPanel({ parent, onSaved, onError }: Props) {
  const { modal } = App.useApp();
  const [editing, setEditing] = useState<SubPartOfSpeechConfig>();
  const [formOpen, setFormOpen] = useState(false);
  const list = useSubPartOfSpeechList(parent?.id ?? "", Boolean(parent));
  const remove = useRemoveSubPartOfSpeech();

  useEffect(() => {
    setEditing(undefined);
    setFormOpen(false);
  }, [parent?.id]);

  const removeItem = (item: SubPartOfSpeechConfig) => {
    if (!parent) return;
    modal.confirm({
      title: `删除细分词性“${item.name_zh}”？`,
      content: "删除后不可恢复，词条中已引用的细分词性不会允许删除。",
      okText: "删 除",
      okButtonProps: { danger: true },
      cancelText: "取 消",
      onOk: async () => {
        try {
          await remove.mutateAsync({
            partId: parent.id,
            subId: item.id,
            base_revision: item.revision
          });
          onSaved("细分词性已删除");
        } catch (error) {
          onError(error);
          await list.refetch();
        }
      }
    });
  };

  const columns: TableColumnsType<SubPartOfSpeechConfig> = [
    { title: "细分词性中文", dataIndex: "name_zh", width: 140 },
    { title: "细分词性英文", dataIndex: "name_en", width: 180 },
    {
      title: "稳定编码",
      dataIndex: "code",
      width: 130,
      render: (code: string) => <Tag>{code}</Tag>
    },
    { title: "排序", dataIndex: "sort_order", width: 80 },
    {
      title: "引用",
      dataIndex: "usage_count",
      width: 80,
      render: (count: number) => (count > 0 ? `${count} 个词义` : "未引用")
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 150,
      render: (_, item) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditing(item);
              setFormOpen(true);
            }}
          >
            修 改
          </Button>
          <Tooltip
            title={
              item.usage_count > 0
                ? `已有 ${item.usage_count} 个词义引用，只能修改`
                : undefined
            }
          >
            <Button
              type="link"
              danger
              size="small"
              disabled={item.usage_count > 0}
              icon={<DeleteOutlined />}
              onClick={() => removeItem(item)}
            >
              删 除
            </Button>
          </Tooltip>
        </Space>
      )
    }
  ];

  return (
    <>
      <Card
        size="small"
        title={parent ? `“${parent.name_zh}”的细分词性` : "细分词性"}
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!parent}
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            新增细分词性
          </Button>
        }
      >
        {!parent ? (
          <Empty description="请先选择所属基本词性" />
        ) : list.isError ? (
          <Alert
            type="error"
            showIcon
            title="细分词性加载失败"
            description={list.error.message}
            action={
              <Button size="small" onClick={() => void list.refetch()}>
                重 试
              </Button>
            }
            style={{ marginBottom: 12 }}
          />
        ) : (
          <Table<SubPartOfSpeechConfig>
            rowKey="id"
            size="middle"
            columns={columns}
            dataSource={list.data?.items ?? []}
            loading={list.isPending}
            locale={{ emptyText: <Empty description="暂无细分词性" /> }}
            pagination={false}
            scroll={{ x: 720 }}
          />
        )}
      </Card>
      {parent && (
        <SubPartFormModal
          parent={parent}
          value={editing}
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSaved={onSaved}
          onError={onError}
        />
      )}
    </>
  );
}
