import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  Breadcrumb,
  Button,
  Card,
  Flex,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Tabs,
  Tooltip,
  Typography
} from "antd";
import type { TableColumnsType } from "antd";
import { HttpError } from "@tsz/api-client";
import type { PartOfSpeechConfig } from "@tsz/types";
import dayjs from "dayjs";
import { useState } from "react";
import {
  usePartOfSpeechCatalog,
  usePartOfSpeechConfigList,
  useRemovePartOfSpeech
} from "./api";
import { PartOfSpeechFormModal } from "./PartOfSpeechFormModal";
import { SubPartOfSpeechPanel } from "./SubPartOfSpeechDrawer";

function errorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.code === "part_of_speech_conflict") return "词性编码或名称已存在";
    if (error.code === "part_of_speech_in_use")
      return "该基本词性已被单词或短语引用，只能修改";
    if (error.code === "sub_part_of_speech_in_use")
      return "该细分词性已被词义引用，只能修改";
    if (error.code === "revision_conflict")
      return "配置已被其他管理员修改，请刷新后重试";
  }
  return error instanceof Error ? error.message : "操作失败";
}

export function PartOfSpeechSettings() {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<{ q?: string }>();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PartOfSpeechConfig>();
  const [activeTab, setActiveTab] = useState<"basic" | "detailed">("basic");
  const [selectedPartId, setSelectedPartId] = useState("");
  const list = usePartOfSpeechConfigList({
    q: q || undefined,
    page,
    page_size: pageSize
  });
  const catalog = usePartOfSpeechCatalog();
  const remove = useRemovePartOfSpeech();
  const selectedPart =
    catalog.data?.items.find((item) => item.id === selectedPartId) ??
    catalog.data?.items[0];

  const showError = (error: unknown) => message.error(errorMessage(error));

  const removeItem = (item: PartOfSpeechConfig) => {
    modal.confirm({
      title: `删除基本词性“${item.name_zh}”？`,
      content: "删除后将同时移除其未被引用的细分词性，该操作不可恢复。",
      okText: "删 除",
      okButtonProps: { danger: true },
      cancelText: "取 消",
      onOk: async () => {
        try {
          await remove.mutateAsync(item.id);
          message.success("基本词性已删除");
        } catch (error) {
          showError(error);
          await list.refetch();
        }
      }
    });
  };

  const columns: TableColumnsType<PartOfSpeechConfig> = [
    {
      title: "序号",
      width: 72,
      render: (_, __, index) => (page - 1) * pageSize + index + 1
    },
    { title: "基本词性中文", dataIndex: "name_zh", width: 150 },
    { title: "基本词性英文", dataIndex: "name_en", width: 180 },
    {
      title: "稳定编码",
      dataIndex: "code",
      width: 130,
      render: (code: string) => <Tag>{code}</Tag>
    },
    { title: "英文缩写", dataIndex: "abbreviation", width: 110 },
    {
      title: "细分词性",
      dataIndex: "sub_part_count",
      width: 100,
      render: (count: number) => `${count} 项`
    },
    {
      title: "引用",
      dataIndex: "usage_count",
      width: 110,
      render: (count: number) =>
        count > 0 ? <Tag color="blue">{count} 个词条</Tag> : "未引用"
    },
    {
      title: "创建人",
      dataIndex: "created_by",
      width: 130,
      render: (actor: PartOfSpeechConfig["created_by"]) => actor.display_name
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      width: 160,
      render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm")
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 180,
      render: (_, item) => (
        <Space>
          <Button
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
                ? `已有 ${item.usage_count} 个单词或短语引用，只能修改`
                : undefined
            }
          >
            <Button
              size="small"
              danger
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
    <Flex vertical gap={16}>
      <Breadcrumb items={[{ title: "系统设置" }, { title: "词性配置" }]} />
      <Flex justify="space-between" align="center" wrap gap={12}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            词性配置
          </Typography.Title>
          <Typography.Text type="secondary">
            统一维护智能词库使用的基本词性与细分词性；业务页面默认显示中文名称。
          </Typography.Text>
        </div>
        {activeTab === "basic" && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            新增基本词性
          </Button>
        )}
      </Flex>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as "basic" | "detailed")}
        items={[
          { key: "basic", label: "基本词性" },
          { key: "detailed", label: "细分词性" }
        ]}
      />

      {activeTab === "basic" ? (
        <>
          <Card size="small">
            <Form
              form={form}
              layout="inline"
              onFinish={({ q: nextQ }) => {
                setQ(nextQ?.trim() ?? "");
                setPage(1);
              }}
              style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
            >
              <Form.Item name="q" label="关键词">
                <Input
                  allowClear
                  placeholder="中文 / 英文 / 编码 / 缩写"
                  style={{ width: 260 }}
                />
              </Form.Item>
              <Form.Item>
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
                      form.resetFields();
                      setQ("");
                      setPage(1);
                    }}
                  >
                    重 置
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
                title="词性配置加载失败"
                description={list.error.message}
                action={
                  <Button size="small" onClick={() => void list.refetch()}>
                    重 试
                  </Button>
                }
                style={{ marginBottom: 12 }}
              />
            )}
            <Table<PartOfSpeechConfig>
              rowKey="id"
              size="middle"
              columns={columns}
              dataSource={list.data?.items ?? []}
              loading={list.isPending}
              scroll={{ x: 1450 }}
              pagination={{
                current: page,
                pageSize,
                total: list.data?.pagination.total ?? 0,
                showSizeChanger: true,
                pageSizeOptions: [10, 20, 50],
                showTotal: (total) => `共 ${total} 条`,
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
              title="基本词性目录加载失败"
              description={catalog.error.message}
              action={
                <Button size="small" onClick={() => void catalog.refetch()}>
                  重 试
                </Button>
              }
            />
          )}
          <Card size="small">
            <Flex align="center" gap={12} wrap>
              <Typography.Text strong>所属基本词性</Typography.Text>
              <Select
                aria-label="所属基本词性"
                value={selectedPart?.id}
                loading={catalog.isPending}
                disabled={catalog.isError || !selectedPart}
                options={(catalog.data?.items ?? []).map((item) => ({
                  value: item.id,
                  label: item.name_zh
                }))}
                onChange={setSelectedPartId}
                style={{ width: 220 }}
                placeholder="请选择基本词性"
              />
            </Flex>
          </Card>
          <SubPartOfSpeechPanel
            parent={selectedPart}
            onSaved={(text) => message.success(text)}
            onError={showError}
          />
        </>
      )}

      <PartOfSpeechFormModal
        open={formOpen}
        value={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() =>
          message.success(editing ? "基本词性已更新" : "基本词性已新增")
        }
        onError={showError}
      />
    </Flex>
  );
}
