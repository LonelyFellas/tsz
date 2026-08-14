import {
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
  RollbackOutlined,
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
  Tooltip,
  Typography
} from "antd";
import type { TableColumnsType } from "antd";
import dayjs from "dayjs";
import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { AdminWordKind, AdminWordListItem, CefrLevel } from "@tsz/types";
import { isIncompleteHttpError } from "@tsz/api-client/http";
import { env } from "@/lib/env";
import {
  useArchiveWord,
  useArchiveWordsBatch,
  useDeleteWord,
  usePublishWord,
  useRestoreWord,
  useRestoreWordsBatch,
  useWordList,
  useWordStats
} from "./api";
import { CreateWordModal } from "./CreateWordModal";
import { adminWordsDataSourceCapabilities } from "./dataSource";
import { DetailsList } from "./DetailsList";
import {
  CEFR_OPTIONS,
  cefrColor,
  KIND_LABEL,
  KIND_OPTIONS,
  STATUS_LABEL,
  STATUS_OPTIONS
} from "./labels";
import {
  availablePartOfSpeechOptions,
  createPartOfSpeechLookup,
  partOfSpeechLabel
} from "./part-of-speech/catalog";
import { usePartOfSpeechCatalog } from "./part-of-speech/api";
import { toListQuery, type WordFilterValues } from "./listQuery";
import { runLifecycleCommandOnce } from "./lifecycleCommand";
import { getWordRowActionLabel, getWordRowRoute } from "./wordRouting";
import { newWordNodeId } from "./word-model/primitives";

const { RangePicker } = DatePicker;

export function SmartDictionary() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [form] = Form.useForm<WordFilterValues>();

  const initialFilters = useMemo<WordFilterValues>(() => {
    const keyword = searchParams.get("keyword")?.trim();
    const status = searchParams.get("status");
    return {
      ...(keyword ? { keyword } : {}),
      ...(status === "draft" || status === "published" || status === "archived"
        ? { status }
        : {})
    };
  }, [searchParams]);

  // 服务端分页 + 筛选:三者共同构成列表查询,任何变化都触发重取。
  const [filters, setFilters] = useState<WordFilterValues>(initialFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [createKind, setCreateKind] = useState<AdminWordKind | null>(null);
  const lifecycleCommandPending = useRef(false);

  const listQuery = useWordList(toListQuery(filters, page, pageSize));
  const stats = useWordStats();
  const publishWord = usePublishWord();
  const deleteWord = useDeleteWord();
  const archiveWord = useArchiveWord();
  const restoreWord = useRestoreWord();
  const archiveBatch = useArchiveWordsBatch();
  const restoreBatch = useRestoreWordsBatch();
  const partOfSpeechCatalog = usePartOfSpeechCatalog();
  const partOfSpeechLookup = useMemo(
    () => createPartOfSpeechLookup(partOfSpeechCatalog.data),
    [partOfSpeechCatalog.data]
  );
  const partOfSpeechOptions = useMemo(
    () => availablePartOfSpeechOptions(partOfSpeechLookup),
    [partOfSpeechLookup]
  );
  const kindOptions = adminWordsDataSourceCapabilities.phraseCreation
    ? KIND_OPTIONS
    : KIND_OPTIONS.filter((option) => option.value === "word");

  const rows = listQuery.data?.words ?? [];
  const total = listQuery.data?.page.total ?? 0;
  const selectedRows = rows.filter((row) => selectedKeys.includes(row.id));
  const restoringSelection =
    selectedRows.length > 0 &&
    selectedRows.every((row) => row.status === "archived");
  const lifecyclePending =
    archiveWord.isPending ||
    restoreWord.isPending ||
    archiveBatch.isPending ||
    restoreBatch.isPending;

  const applyFilters = (values: WordFilterValues) => {
    setFilters(values);
    setPage(1);
    setSelectedKeys([]);
    const nextSearchParams = new URLSearchParams();
    const keyword = values.keyword?.trim();
    if (keyword) nextSearchParams.set("keyword", keyword);
    if (values.status) nextSearchParams.set("status", values.status);
    setSearchParams(nextSearchParams, { replace: true });
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

  const removeLegacy = (record: AdminWordListItem) => {
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

  const lifecycleInput = (record: AdminWordListItem) => {
    if (
      record.schema_version !== 2 ||
      record.revision === undefined ||
      record.lifecycle_revision === undefined
    ) {
      return undefined;
    }
    return {
      base_revision: record.revision,
      base_lifecycle_revision: record.lifecycle_revision
    };
  };

  const transitionOne = (
    record: AdminWordListItem,
    target: "archive" | "restore"
  ) => {
    const input = lifecycleInput(record);
    if (!input) {
      message.error("词条缺少并发版本信息，请刷新列表后重试");
      return;
    }
    const restoring = target === "restore";
    modal.confirm({
      title: `${restoring ? "恢复" : "归档"}「${record.headword}」？`,
      content: restoring
        ? "恢复后词条重新进入正常列表；现有发布记录保持不变。"
        : "归档不会删除当前或历史发布记录；存在有效入站引用时服务端会安全拒绝。",
      okText: restoring ? "恢 复" : "归 档",
      okButtonProps: { danger: !restoring },
      cancelText: "取消",
      onOk: () =>
        runLifecycleCommandOnce(lifecycleCommandPending, async () => {
          try {
            const mutation = restoring ? restoreWord : archiveWord;
            await mutation.mutateAsync({
              wordId: record.id,
              idempotencyKey: newWordNodeId(),
              input
            });
            setSelectedKeys((previous) =>
              previous.filter((key) => key !== record.id)
            );
            message.success(restoring ? "词条已恢复" : "词条已归档");
          } catch (error) {
            message.error(
              error instanceof Error
                ? error.message
                : restoring
                  ? "恢复失败"
                  : "归档失败"
            );
          }
        })
    });
  };

  const transitionSelected = () => {
    if (selectedKeys.length === 0) return;
    if (
      selectedRows.length !== selectedKeys.length ||
      selectedRows.some((row) => lifecycleInput(row) === undefined)
    ) {
      message.error("所选词条缺少并发版本信息，请刷新列表后重试");
      return;
    }
    const hasArchived = selectedRows.some((row) => row.status === "archived");
    const hasActive = selectedRows.some((row) => row.status !== "archived");
    if (hasArchived && hasActive) {
      message.warning("归档与未归档词条不能在同一批次处理");
      return;
    }
    const restoring = restoringSelection;
    const entries = selectedRows.map((record) => ({
      id: record.id,
      ...lifecycleInput(record)!
    }));
    modal.confirm({
      title: `${restoring ? "恢复" : "归档"}选中的 ${selectedKeys.length} 个词条？`,
      content: restoring
        ? "该批次将原子恢复：任意一条冲突时全部保持原状。"
        : "该批次将原子归档且保留全部发布历史：任意一条冲突时全部保持原状。",
      okText: restoring ? "恢 复" : "归 档",
      okButtonProps: { danger: !restoring },
      cancelText: "取消",
      onOk: () =>
        runLifecycleCommandOnce(lifecycleCommandPending, async () => {
          try {
            const mutation = restoring ? restoreBatch : archiveBatch;
            const response = await mutation.mutateAsync({
              idempotencyKey: newWordNodeId(),
              input: { entries }
            });
            setSelectedKeys([]);
            message.success(
              `已${restoring ? "恢复" : "归档"} ${response.affected} 个词条`
            );
          } catch (error) {
            message.error(
              error instanceof Error
                ? error.message
                : restoring
                  ? "批量恢复失败"
                  : "批量归档失败"
            );
          }
        })
    });
  };

  const columns: TableColumnsType<AdminWordListItem> = [
    {
      title: "词汇",
      dataIndex: "headword",
      width: 120,
      fixed: "left",
      ellipsis: { showTitle: false },
      render: (w: string) => (
        <Tooltip title={w}>
          <span tabIndex={0} style={{ display: "block", fontWeight: 600 }}>
            {w}
          </span>
        </Tooltip>
      )
    },
    {
      title: "类型",
      dataIndex: "kind",
      width: 80,
      responsive: ["sm"],
      render: (k: AdminWordKind) => (
        <Tag color={k === "phrase" ? "geekblue" : "default"}>
          {KIND_LABEL[k]}
        </Tag>
      )
    },
    {
      title: "释义",
      dataIndex: "gloss",
      width: 180,
      ellipsis: true,
      responsive: ["sm"]
    },
    {
      title: "基本词性",
      dataIndex: "pos_list",
      width: 180,
      responsive: ["sm"],
      render: (list: AdminWordListItem["pos_list"]) => (
        <Space size={[4, 4]} wrap>
          {list.map((p) => (
            <Tag key={p} style={{ margin: 0 }}>
              {partOfSpeechLabel(partOfSpeechLookup, p)}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: "难度",
      dataIndex: "levels",
      width: 170,
      responsive: ["sm"],
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
      responsive: ["sm"],
      render: (t: string) => dayjs(t).format("YYYY-MM-DD HH:mm")
    },
    {
      title: "创建人",
      dataIndex: "created_by_name",
      width: 140,
      ellipsis: { showTitle: false },
      responsive: ["sm"],
      render: (name?: string) => {
        const label = name?.trim() || "-";
        return (
          <Tooltip title={name?.trim() || undefined}>
            <span tabIndex={name?.trim() ? 0 : undefined}>{label}</span>
          </Tooltip>
        );
      }
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      responsive: ["sm"],
      render: (s: AdminWordListItem["status"], record) => (
        <Space size={4} wrap>
          <Tag
            color={
              s === "published"
                ? "success"
                : s === "archived"
                  ? "warning"
                  : "default"
            }
          >
            {STATUS_LABEL[s]}
          </Tag>
          {record.has_unpublished_changes && (
            <Tag color="processing">有未发布修改</Tag>
          )}
        </Space>
      )
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      width: 150,
      responsive: ["sm"],
      render: (t: string) => dayjs(t).format("YYYY-MM-DD HH:mm")
    },
    {
      title: "操作",
      key: "action",
      width: 160,
      fixed: "right",
      render: (_: unknown, record: AdminWordListItem) => {
        const isV2 = record.schema_version === 2;
        return (
          <Space size={0}>
            {(isV2 || adminWordsDataSourceCapabilities.legacyEntryCreation) && (
              <Button
                type="link"
                size="small"
                onClick={() => navigate(getWordRowRoute(record))}
              >
                {getWordRowActionLabel(record)}
              </Button>
            )}
            {!isV2 && adminWordsDataSourceCapabilities.legacyEntryCreation && (
              <Button
                type="link"
                size="small"
                disabled={record.status === "published"}
                onClick={() => publish(record)}
              >
                发布
              </Button>
            )}
            {isV2 && adminWordsDataSourceCapabilities.archive && (
              <Button
                type="link"
                size="small"
                danger={record.status !== "archived"}
                disabled={lifecycleInput(record) === undefined}
                loading={
                  lifecyclePending &&
                  (archiveWord.variables?.wordId === record.id ||
                    restoreWord.variables?.wordId === record.id)
                }
                onClick={() =>
                  transitionOne(
                    record,
                    record.status === "archived" ? "restore" : "archive"
                  )
                }
              >
                {record.status === "archived" ? "恢 复" : "归 档"}
              </Button>
            )}
            {!isV2 && adminWordsDataSourceCapabilities.legacyEntryCreation && (
              <Button
                type="link"
                size="small"
                danger
                loading={deleteWord.isPending}
                onClick={() => removeLegacy(record)}
              >
                删除
              </Button>
            )}
          </Space>
        );
      }
    }
  ];

  return (
    <Flex vertical gap={16}>
      <Breadcrumb items={[{ title: "词库管理" }, { title: "智能词库" }]} />

      <Card size="small" styles={{ body: { paddingBottom: 8 } }}>
        <Form
          form={form}
          initialValues={initialFilters}
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
              options={kindOptions}
              allowClear
              style={{ width: 150 }}
            />
          </Form.Item>
          <Form.Item name="pos" label="基本词性">
            <Select
              placeholder="请选择基本词性"
              options={partOfSpeechOptions}
              loading={partOfSpeechCatalog.isPending}
              disabled={partOfSpeechCatalog.isError}
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
                  form.setFieldsValue({
                    keyword: undefined,
                    status: undefined
                  });
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
              onClick={() => {
                if (
                  env.WORD_CREATION_WIZARD ||
                  !adminWordsDataSourceCapabilities.legacyEntryCreation
                ) {
                  navigate("/words/new?kind=word");
                  return;
                }
                setCreateKind("word");
              }}
            >
              创建单词
            </Button>
            {adminWordsDataSourceCapabilities.phraseCreation && (
              <Button
                icon={<PlusOutlined />}
                onClick={() => navigate("/words/new?kind=phrase")}
              >
                创建短语
              </Button>
            )}
            {adminWordsDataSourceCapabilities.batchArchive && (
              <Button
                danger={!restoringSelection}
                icon={
                  restoringSelection ? <RollbackOutlined /> : <InboxOutlined />
                }
                disabled={selectedKeys.length === 0}
                loading={archiveBatch.isPending || restoreBatch.isPending}
                onClick={transitionSelected}
              >
                {restoringSelection ? "恢 复" : "归 档"}
                {selectedKeys.length > 0 ? `(${selectedKeys.length})` : ""}
              </Button>
            )}
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

        {partOfSpeechCatalog.isError && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            title="词性目录暂时不可用"
            description="现有词条将回退显示稳定编码，基本词性筛选暂不可用。"
            action={
              <Button
                size="small"
                onClick={() => void partOfSpeechCatalog.refetch()}
              >
                重 试
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
          scroll={{ x: "max-content" }}
          rowSelection={
            adminWordsDataSourceCapabilities.batchArchive
              ? {
                  selectedRowKeys: selectedKeys,
                  onChange: setSelectedKeys,
                  getCheckboxProps: (record) => ({
                    disabled:
                      record.schema_version !== 2 ||
                      lifecycleInput(record) === undefined
                  })
                }
              : undefined
          }
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            pageSizeOptions: [10, 20, 50, 100],
            onChange: (nextPage, nextSize) => {
              setSelectedKeys([]);
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
