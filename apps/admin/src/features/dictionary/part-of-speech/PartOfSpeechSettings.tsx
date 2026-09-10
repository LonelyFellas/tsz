import { FormTypeSettings } from "./FormTypeSettings";
import {
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
  ConfigProvider,
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

// 后端 409 冲突会带上撞车的字段名；编码用户看不到，撞了只能从英文全称入手。
const CONFLICT_FIELD_LABEL: Record<string, string> = {
  name_zh: "正式中文",
  name_en: "正式英文",
  abbreviation: "英文缩写",
  short_name_zh: "简洁显示",
  full_name_en: "英文全称"
};

function conflictMessage(kind: string, field: string | null | undefined) {
  if (field === "code") return `英文全称与已有${kind}过于接近，请调整英文全称`;
  const label = field ? CONFLICT_FIELD_LABEL[field] : undefined;
  return label ? `${label}与已有${kind}重复` : `${kind}名称已存在`;
}

export function errorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.code === "form_type_conflict")
      return conflictMessage("词形变化", error.problem?.field);
    if (error.code === "form_type_in_use")
      return "该词形类型已被词条或历史发布引用，只能修改";
    if (error.code === "form_type_required") return "原形为必需类型，不能删除";
    if (error.code === "form_type_not_found")
      return "词形类型不存在或已被删除，请刷新后重试";
    if (error.code === "invalid_form_type")
      return "词形配置字段不符合要求，请检查后重试";
    // 稳定编码不对用户暴露：编码撞车只可能来自英文全称派生结果相同，提示改英文全称。
    if (error.code === "part_of_speech_conflict")
      return conflictMessage("基本词性", error.problem?.field);
    if (error.code === "sub_part_of_speech_conflict")
      return conflictMessage("细分词性", error.problem?.field);
    if (error.code === "part_of_speech_in_use")
      return "该基本词性已被单词或短语引用，只能修改";
    if (error.code === "part_of_speech_has_sub_parts")
      return "该基本词性下还有细分词性，请先删除细分词性";
    if (error.code === "sub_part_of_speech_in_use")
      return "该细分词性已被词义引用，只能修改";
    if (error.code === "sub_part_of_speech_not_allowed")
      return "该基本词性不支持细分词性";
    if (error.code === "revision_conflict")
      return "配置已被其他管理员修改，请刷新后重试";
    if (error.code === "part_of_speech_not_found")
      return "基本词性不存在或已被删除，请刷新后重试";
    if (error.code === "sub_part_of_speech_not_found")
      return "细分词性不存在或已被删除，请刷新后重试";
    if (error.code === "invalid_part_of_speech")
      return "词性配置字段不符合要求，请检查后重试";
    if (error.code === "invalid_request_body")
      return "提交内容不完整或格式错误，请检查后重试";
    if (error.code === "invalid_query")
      return "请求版本或查询参数无效，请刷新后重试";
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
  const [activeTab, setActiveTab] = useState<"basic" | "detailed" | "forms">(
    "basic"
  );
  const [selectedPartId, setSelectedPartId] = useState("");
  const subPanelRef = useRef<SubPartOfSpeechPanelHandle>(null);
  const list = usePartOfSpeechConfigList({
    q: q || undefined,
    page,
    page_size: pageSize
  });
  const catalog = usePartOfSpeechCatalog();
  // 新建基本词性时排序值自动排在目录最后；目录没加载完前不开新建，免得算出错误的排序。
  const catalogReady = !catalog.isPending && !catalog.isError;
  const defaultSortOrder = nextSortOrder(catalog.data?.items ?? []);
  const remove = useRemovePartOfSpeech();
  const parts = catalog.data?.items ?? [];
  // 空串表示「全部」：面板并排展示所有词性的细分词性；新增时在弹窗里选所属词性。
  const selectedPart = parts.find((item) => item.id === selectedPartId);

  const showError = (error: unknown) => message.error(errorMessage(error));

  const removeItem = (item: PartOfSpeechConfig) => {
    modal.confirm({
      title: `删除基本词性“${item.name_zh}”？`,
      content: "该操作不可恢复。",
      okText: "删 除",
      okButtonProps: { danger: true },
      cancelText: "取 消",
      onOk: async () => {
        try {
          await remove.mutateAsync({
            id: item.id,
            base_revision: item.revision
          });
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
      width: 56,
      render: (_, __, index) => (page - 1) * pageSize + index + 1
    },
    { title: "正式中文", dataIndex: "name_zh", width: 120 },
    { title: "简洁显示", dataIndex: "short_name_zh", width: 110 },
    { title: "正式英文", dataIndex: "name_en", width: 130 },
    { title: "英文缩写", dataIndex: "abbreviation", width: 90 },
    { title: "英文全称", dataIndex: "full_name_en", width: 140 },
    {
      title: "细分词性",
      dataIndex: "sub_part_count",
      width: 90,
      render: (count: number) => `${count} 项`
    },
    {
      title: "引用",
      dataIndex: "usage_count",
      width: 100,
      render: (count: number) =>
        count > 0 ? <Tag color="blue">{count} 个词条</Tag> : "未引用"
    },
    {
      title: "创建人",
      dataIndex: "created_by",
      width: 100,
      render: (actor: PartOfSpeechConfig["created_by"]) => actor.display_name
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      width: 150,
      render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm")
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 150,
      render: (_, item) => (
        <Space>
          <Button
            size="small"
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
                : item.sub_part_count > 0
                  ? `还有 ${item.sub_part_count} 项细分词性，请先删除细分词性`
                  : undefined
            }
          >
            <Button
              size="small"
              danger
              disabled={item.usage_count > 0 || item.sub_part_count > 0}
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
          <Typography.Text type="secondary" style={{ display: "block" }}>
            统一维护智能词库使用的基本词性、细分词性与词形变化；业务页面默认显示中文名称。
          </Typography.Text>
        </div>
      </Flex>

      {/* Tab 自带的上内边距与下外边距会让它和上下块的间距比页面统一的 16px 大，这里归零。 */}
      <ConfigProvider
        theme={{
          components: {
            Tabs: { horizontalItemPadding: "0 0 12px", horizontalMargin: "0" }
          }
        }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={(key) =>
            setActiveTab(key as "basic" | "detailed" | "forms")
          }
          items={[
            { key: "basic", label: "基本词性" },
            { key: "detailed", label: "细分词性" },
            { key: "forms", label: "词形变化" }
          ]}
        />
      </ConfigProvider>

      {activeTab === "forms" ? (
        <FormTypeSettings />
      ) : activeTab === "basic" ? (
        <>
          <Card size="small">
            <Flex justify="space-between" align="center" wrap gap={12}>
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
              <Button
                type="primary"
                icon={<PlusOutlined />}
                disabled={!catalogReady}
                onClick={() => {
                  setEditing(undefined);
                  setFormOpen(true);
                }}
              >
                新增基本词性
              </Button>
            </Flex>
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
              scroll={{ x: 1240 }}
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
            <Flex justify="space-between" align="center" wrap gap={12}>
              <Flex align="center" gap={12} wrap>
                <Typography.Text strong>所属基本词性</Typography.Text>
                <Select
                  aria-label="所属基本词性"
                  value={selectedPart?.id ?? ""}
                  showSearch
                  optionFilterProp="label"
                  loading={catalog.isPending}
                  disabled={catalog.isError || !parts.length}
                  options={[
                    { value: "", label: "全部" },
                    ...parts.map((item) => ({
                      value: item.id,
                      label: item.name_zh
                    }))
                  ]}
                  onChange={setSelectedPartId}
                  style={{ width: 220 }}
                  placeholder="请选择基本词性"
                />
              </Flex>
              <Tooltip
                title={
                  !catalog.isError && parts.length === 0
                    ? "暂无基本词性"
                    : undefined
                }
              >
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  disabled={catalog.isError || parts.length === 0}
                  onClick={() => subPanelRef.current?.openCreate()}
                >
                  新增细分词性
                </Button>
              </Tooltip>
            </Flex>
          </Card>
          <SubPartOfSpeechPanel
            ref={subPanelRef}
            parents={selectedPart ? [selectedPart] : parts}
            createParent={selectedPart}
            loading={catalog.isPending}
            onSaved={(text) => message.success(text)}
            onError={showError}
          />
        </>
      )}

      <PartOfSpeechFormModal
        open={formOpen}
        value={editing}
        defaultSortOrder={defaultSortOrder}
        onClose={() => setFormOpen(false)}
        onSaved={(saved) => {
          if (editing) {
            message.success("基本词性已更新");
            return;
          }
          message.success("基本词性已新增");
          // 新建的词性名下还没有细分词性，直接把管理员带到细分词性 Tab 去配。
          setSelectedPartId(saved.id);
          setActiveTab("detailed");
        }}
        onError={showError}
      />
    </Flex>
  );
}
