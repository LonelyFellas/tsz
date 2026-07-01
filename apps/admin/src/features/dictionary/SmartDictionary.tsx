import {
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined
} from "@ant-design/icons";
import {
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
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toOptions } from "./editorConstants";
import { MOCK_STATS, MOCK_WORDS } from "./mock";
import {
  CEFR_OPTIONS,
  POS_OPTIONS,
  type Cefr,
  type DictWord,
  type WordType
} from "./types";
import { WordFormModal, type WordFormValues } from "./WordFormModal";

const { RangePicker } = DatePicker;

interface Filters {
  keyword?: string;
  meaning?: string;
  type?: WordType;
  pos?: string;
  difficulty?: Cefr;
  range?: [Dayjs, Dayjs] | null;
}

// CEFR 难度着色：A 绿、B 蓝、C 金，便于一眼分级。
function cefrColor(level: Cefr): string {
  if (level.startsWith("A")) return "green";
  if (level.startsWith("B")) return "blue";
  return "gold";
}

const typeOpts = [
  { label: "单词", value: "单词" },
  { label: "短语", value: "短语" }
];
const posOpts = toOptions(POS_OPTIONS);
const cefrOpts = toOptions(CEFR_OPTIONS);

type ModalState =
  | { open: false }
  | {
      open: true;
      fixedType: WordType;
      record: DictWord | null;
      readOnly: boolean;
    };

export function SmartDictionary() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<Filters>();

  const [rows, setRows] = useState<DictWord[]>(MOCK_WORDS);
  const [filters, setFilters] = useState<Filters>({});
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [modalState, setModalState] = useState<ModalState>({ open: false });

  // 客户端过滤（Mock 阶段）。真实实现应把 filters 作为查询参数交后端分页返回。
  const filtered = useMemo(() => {
    return rows.filter((w) => {
      const { keyword, meaning, type, pos, difficulty, range } = filters;
      if (keyword) {
        const k = keyword.trim().toLowerCase();
        if (
          !w.word.toLowerCase().includes(k) &&
          !w.creator.includes(keyword.trim())
        )
          return false;
      }
      if (meaning && !w.meaning.includes(meaning.trim())) return false;
      if (type && w.type !== type) return false;
      if (pos && !w.pos.includes(pos as never)) return false;
      if (difficulty && !w.difficulty.includes(difficulty)) return false;
      if (range && range[0] && range[1]) {
        const created = dayjs(w.createdAt);
        if (
          created.isBefore(range[0], "day") ||
          created.isAfter(range[1], "day")
        )
          return false;
      }
      return true;
    });
  }, [rows, filters]);

  const openCreate = (fixedType: WordType) =>
    setModalState({ open: true, fixedType, record: null, readOnly: false });
  const openEdit = (record: DictWord) =>
    setModalState({
      open: true,
      fixedType: record.type,
      record,
      readOnly: false
    });
  const openView = (record: DictWord) =>
    setModalState({
      open: true,
      fixedType: record.type,
      record,
      readOnly: true
    });
  const closeModal = () => setModalState({ open: false });

  const nowStamp = () => dayjs().format("YYYY-MM-DD HH:mm");

  const handleSubmit = (values: WordFormValues) => {
    if (modalState.open && modalState.record) {
      const id = modalState.record.id;
      setRows((prev) =>
        prev.map((w) =>
          w.id === id ? { ...w, ...values, updatedAt: nowStamp() } : w
        )
      );
      message.success("已保存修改");
    } else {
      setRows((prev) => {
        const nextId = prev.reduce((m, w) => Math.max(m, w.id), 0) + 1;
        const created: DictWord = {
          id: nextId,
          ...values,
          creator: "当前管理员",
          status: "草稿",
          createdAt: nowStamp(),
          updatedAt: nowStamp()
        };
        return [created, ...prev];
      });
      message.success(`已创建${values.type}`);
    }
    closeModal();
  };

  const publish = (record: DictWord) => {
    setRows((prev) =>
      prev.map((w) =>
        w.id === record.id
          ? { ...w, status: "已发布", updatedAt: nowStamp() }
          : w
      )
    );
    message.success(`「${record.word}」已发布`);
  };

  const removeOne = (record: DictWord) => {
    modal.confirm({
      title: `删除「${record.word}」？`,
      content: "删除后不可恢复。",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        setRows((prev) => prev.filter((w) => w.id !== record.id));
        setSelectedKeys((prev) => prev.filter((k) => k !== record.id));
        message.success("已删除");
      }
    });
  };

  const removeSelected = () => {
    if (selectedKeys.length === 0) return;
    modal.confirm({
      title: `删除选中的 ${selectedKeys.length} 个词条？`,
      content: "删除后不可恢复。",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        const set = new Set(selectedKeys);
        setRows((prev) => prev.filter((w) => !set.has(w.id)));
        setSelectedKeys([]);
        message.success("已删除所选词条");
      }
    });
  };

  const columns: TableColumnsType<DictWord> = [
    { title: "ID", dataIndex: "id", width: 64, fixed: "left" },
    {
      title: "词汇",
      dataIndex: "word",
      width: 130,
      render: (w: string) => <span style={{ fontWeight: 600 }}>{w}</span>
    },
    {
      title: "类型",
      dataIndex: "type",
      width: 80,
      render: (t: WordType) => (
        <Tag color={t === "短语" ? "geekblue" : "default"}>{t}</Tag>
      )
    },
    { title: "释义", dataIndex: "meaning", width: 180, ellipsis: true },
    {
      title: "基本词性",
      dataIndex: "pos",
      width: 180,
      render: (pos: DictWord["pos"]) => (
        <Space size={[4, 4]} wrap>
          {pos.map((p) => (
            <Tag key={p} style={{ margin: 0 }}>
              {p}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: "难度",
      dataIndex: "difficulty",
      width: 170,
      render: (levels: Cefr[]) => (
        <Space size={[4, 4]} wrap>
          {levels.map((lv) => (
            <Tag key={lv} color={cefrColor(lv)} style={{ margin: 0 }}>
              {lv}
            </Tag>
          ))}
        </Space>
      )
    },
    { title: "创建时间", dataIndex: "createdAt", width: 150 },
    { title: "创建人", dataIndex: "creator", width: 100 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (s: DictWord["status"]) => (
        <Tag color={s === "已发布" ? "success" : "default"}>{s}</Tag>
      )
    },
    { title: "更新时间", dataIndex: "updatedAt", width: 150 },
    {
      title: "操作",
      key: "action",
      width: 200,
      fixed: "right",
      render: (_: unknown, record: DictWord) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => openView(record)}>
            查看
          </Button>
          <Button
            type="link"
            size="small"
            disabled={record.status === "已发布"}
            onClick={() => publish(record)}
          >
            发布
          </Button>
          <Button type="link" size="small" onClick={() => openEdit(record)}>
            编辑
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
          onFinish={(v) => setFilters(v)}
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
          <Form.Item name="meaning" label="释义">
            <Input placeholder="请输入释义" allowClear style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="type" label="类型">
            <Select
              placeholder="请选择词汇类型"
              options={typeOpts}
              allowClear
              style={{ width: 150 }}
            />
          </Form.Item>
          <Form.Item name="pos" label="基本词性">
            <Select
              placeholder="请选择基本词性"
              options={posOpts}
              allowClear
              style={{ width: 140 }}
            />
          </Form.Item>
          <Form.Item name="difficulty" label="难度">
            <Select
              placeholder="请选择难度"
              options={cefrOpts}
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
                  setFilters({});
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
              onClick={() => navigate("/words/create")}
            >
              创建单词
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => openCreate("短语")}>
              创建短语
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={selectedKeys.length === 0}
              onClick={removeSelected}
            >
              删除{selectedKeys.length > 0 ? `(${selectedKeys.length})` : ""}
            </Button>
          </Space>
          <Space size="large" wrap>
            <Typography.Text type="secondary">
              累计智能词汇：
              <Typography.Text strong>{MOCK_STATS.total}</Typography.Text>
            </Typography.Text>
            <Typography.Text type="secondary">
              今日创编：
              <Typography.Text strong>{MOCK_STATS.today}</Typography.Text>
            </Typography.Text>
            <Typography.Text type="secondary">
              本月创编：
              <Typography.Text strong>{MOCK_STATS.month}</Typography.Text>
            </Typography.Text>
          </Space>
        </Flex>

        <Table<DictWord>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1400 }}
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: setSelectedKeys
          }}
          pagination={{
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            defaultPageSize: 10,
            pageSizeOptions: [10, 20, 50]
          }}
        />
      </Card>

      {modalState.open && (
        <WordFormModal
          open={modalState.open}
          fixedType={modalState.fixedType}
          initial={modalState.record}
          readOnly={modalState.readOnly}
          onCancel={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </Flex>
  );
}
