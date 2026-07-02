import {
  DeleteOutlined,
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
  DatePicker,
  Flex,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography
} from "antd";
import type { TableColumnsType } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AdminWordKind, AdminWordListItem, CefrLevel } from "@tsz/types";
import { isIncompleteHttpError } from "@tsz/api-client/http";
import {
  useBatchDeleteWords,
  useDeleteWord,
  usePublishWord,
  useWordList,
  useWordStats
} from "./api";
import { CreateWordModal } from "./CreateWordModal";
import { DetailsList } from "./DetailsList";
import {
  CEFR_OPTIONS,
  cefrColor,
  KIND_LABEL,
  KIND_OPTIONS,
  POS_TAG_ABBR,
  POS_TAG_OPTIONS,
  STATUS_LABEL,
  STATUS_OPTIONS
} from "./labels";
import { toListQuery, type WordFilterValues } from "./listQuery";

const { RangePicker } = DatePicker;

export function SmartDictionary() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<WordFilterValues>();

  // 服务端分页 + 筛选:三者共同构成列表查询,任何变化都触发重取。
  const [filters, setFilters] = useState<WordFilterValues>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [createKind, setCreateKind] = useState<AdminWordKind | null>(null);

  const listQuery = useWordList(toListQuery(filters, page, pageSize));
  const stats = useWordStats();
  const publishWord = usePublishWord();
  const deleteWord = useDeleteWord();
  const batchDelete = useBatchDeleteWords();

  const rows = listQuery.data?.words ?? [];
  const total = listQuery.data?.page.total ?? 0;

  const applyFilters = (values: WordFilterValues) => {
    setFilters(values);
    setPage(1);
    setSelectedKeys([]);
  };

  const publish = (record: AdminWordListItem) => {
    publishWord.mutate(record.id, {
      onSuccess: () => message.success(`「${record.headword}」已发布`),
      onError: (err) => {
        // 422:发布完整性检查未过(V1–V10),details 逐条列出违规。
        if (isIncompleteHttpError(err)) {
          modal.warning({
            title: `「${record.headword}」内容不完整,无法发布`,
            content: <DetailsList details={err.details} />,
            okText: "去完善",
            onOk: () => navigate(`/words/${record.id}/edit`)
          });
          return;
        }
        message.error(err.message);
      }
    });
  };

  const removeOne = (record: AdminWordListItem) => {
    modal.confirm({
      title: `删除「${record.headword}」?`,
      content: "整棵词条树将一并删除,不可恢复。",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () =>
        deleteWord
          .mutateAsync(record.id)
          .then(() => {
            setSelectedKeys((prev) => prev.filter((k) => k !== record.id));
            message.success("已删除");
          })
          .catch((err: unknown) => {
            message.error(err instanceof Error ? err.message : "删除失败");
          })
    });
  };

  const removeSelected = () => {
    if (selectedKeys.length === 0) return;
    modal.confirm({
      title: `删除选中的 ${selectedKeys.length} 个词条?`,
      content: "整棵词条树将一并删除,不可恢复。",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () =>
        batchDelete
          .mutateAsync(selectedKeys.map(String))
          .then(({ deleted }) => {
            setSelectedKeys([]);
            message.success(`已删除 ${deleted} 个词条`);
          })
          .catch((err: unknown) => {
            message.error(err instanceof Error ? err.message : "删除失败");
          })
    });
  };

  const columns: TableColumnsType<AdminWordListItem> = [
    {
      title: "词汇",
      dataIndex: "headword",
      width: 140,
      fixed: "left",
      render: (w: string) => <span style={{ fontWeight: 600 }}>{w}</span>
    },
    {
      title: "类型",
      dataIndex: "kind",
      width: 80,
      render: (k: AdminWordKind) => (
        <Tag color={k === "phrase" ? "geekblue" : "default"}>
          {KIND_LABEL[k]}
        </Tag>
      )
    },
    { title: "释义", dataIndex: "gloss", width: 180, ellipsis: true },
    {
      title: "基本词性",
      dataIndex: "pos_list",
      width: 180,
      render: (list: AdminWordListItem["pos_list"]) => (
        <Space size={[4, 4]} wrap>
          {list.map((p) => (
            <Tag key={p} style={{ margin: 0 }}>
              {POS_TAG_ABBR[p]}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: "难度",
      dataIndex: "levels",
      width: 170,
      render: (levels: CefrLevel[]) => (
        <Space size={[4, 4]} wrap>
          {levels.map((lv) => (
            <Tag key={lv} color={cefrColor(lv)} style={{ margin: 0 }}>
              {lv}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      width: 150,
      render: (t: string) => dayjs(t).format("YYYY-MM-DD HH:mm")
    },
    { title: "创建人", dataIndex: "created_by_name", width: 100 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (s: AdminWordListItem["status"]) => (
        <Tag color={s === "published" ? "success" : "default"}>
          {STATUS_LABEL[s]}
        </Tag>
      )
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      width: 150,
      render: (t: string) => dayjs(t).format("YYYY-MM-DD HH:mm")
    },
    {
      title: "操作",
      key: "action",
      width: 160,
      fixed: "right",
      render: (_: unknown, record: AdminWordListItem) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            onClick={() => navigate(`/words/${record.id}/edit`)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            disabled={record.status === "published"}
            onClick={() => publish(record)}
          >
            发布
          </Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() => removeOne(record)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ];

  return (
    <Flex vertical gap={16}>
      <Breadcrumb items={[{ title: "词库管理" }, { title: "智能词库" }]} />

      <Card size="small" styles={{ body: { paddingBottom: 8 } }}>
        <Form
          form={form}
          layout="inline"
          onFinish={applyFilters}
          style={{
            rowGap: 12,
            columnGap: 8,
            display: "flex",
            flexWrap: "wrap"
          }}
        >
          <Form.Item name="keyword" label="关键字">
            <Input
              placeholder="请输入词汇/创建人"
              allowClear
              style={{ width: 180 }}
            />
          </Form.Item>
          <Form.Item name="gloss" label="释义">
            <Input placeholder="请输入释义" allowClear style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="kind" label="类型">
            <Select
              placeholder="请选择词汇类型"
              options={KIND_OPTIONS}
              allowClear
              style={{ width: 150 }}
            />
          </Form.Item>
          <Form.Item name="pos" label="基本词性">
            <Select
              placeholder="请选择基本词性"
              options={POS_TAG_OPTIONS}
              allowClear
              style={{ width: 140 }}
            />
          </Form.Item>
          <Form.Item name="level" label="难度">
            <Select
              placeholder="请选择难度"
              options={CEFR_OPTIONS}
              allowClear
              style={{ width: 120 }}
            />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              placeholder="请选择状态"
              options={STATUS_OPTIONS}
              allowClear
              style={{ width: 120 }}
            />
          </Form.Item>
          <Form.Item name="range" label="创建时间">
            <RangePicker />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                htmlType="submit"
              >
                搜索
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  form.resetFields();
                  applyFilters({});
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card size="small">
        <Flex
          justify="space-between"
          align="center"
          wrap
          gap={12}
          style={{ marginBottom: 12 }}
        >
          <Space wrap>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateKind("word")}
            >
              创建单词
            </Button>
            <Button
              icon={<PlusOutlined />}
              onClick={() => setCreateKind("phrase")}
            >
              创建短语
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={selectedKeys.length === 0}
              loading={batchDelete.isPending}
              onClick={removeSelected}
            >
              删除{selectedKeys.length > 0 ? `(${selectedKeys.length})` : ""}
            </Button>
          </Space>
          <Space size="large" wrap>
            <Typography.Text type="secondary">
              累计智能词汇:
              <Typography.Text strong>
                {stats.data?.total ?? "-"}
              </Typography.Text>
            </Typography.Text>
            <Typography.Text type="secondary">
              今日创编:
              <Typography.Text strong>
                {stats.data?.today ?? "-"}
              </Typography.Text>
            </Typography.Text>
            <Typography.Text type="secondary">
              本月创编:
              <Typography.Text strong>
                {stats.data?.month ?? "-"}
              </Typography.Text>
            </Typography.Text>
          </Space>
        </Flex>

        {listQuery.isError && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            title="词条列表加载失败"
            description={listQuery.error.message}
            action={
              <Button size="small" onClick={() => void listQuery.refetch()}>
                重试
              </Button>
            }
          />
        )}

        <Table<AdminWordListItem>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={rows}
          loading={listQuery.isPending}
          scroll={{ x: 1400 }}
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: setSelectedKeys
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            pageSizeOptions: [10, 20, 50, 100],
            onChange: (nextPage, nextSize) => {
              setPage(nextSize !== pageSize ? 1 : nextPage);
              setPageSize(nextSize);
            }
          }}
        />
      </Card>

      {createKind && (
        <CreateWordModal
          open
          kind={createKind}
          onClose={() => setCreateKind(null)}
        />
      )}
    </Flex>
  );
}
