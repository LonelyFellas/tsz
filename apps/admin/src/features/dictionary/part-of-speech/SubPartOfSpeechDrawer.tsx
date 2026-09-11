import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tooltip
} from "antd";
import type { TableColumnsType } from "antd";
import dayjs from "dayjs";
import type {
  CreateSubPartOfSpeechInput,
  PartOfSpeechConfig,
  SubPartOfSpeechConfig
} from "@tsz/types";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";
import {
  useCreateSubPartOfSpeech,
  useRemoveSubPartOfSpeech,
  useSubPartOfSpeechLists,
  useUpdateSubPartOfSpeech
} from "./api";
import { nextSortOrder } from "./catalog";
import {
  LabelWithHint,
  PartOfSpeechSharedFields
} from "./PartOfSpeechSharedFields";
import { useDerivedNameDefaults } from "./useDerivedNameDefaults";

/** 供父级页面在自己的工具栏里触发"新增细分词性"，弹窗与编辑态仍由面板自己管。 */
export interface SubPartOfSpeechPanelHandle {
  openCreate: () => void;
}

/** 面板需要的父级信息：id 定位、name_zh 展示、code 参与派生细分词性编码。 */
type PanelParent = Pick<PartOfSpeechConfig, "id" | "name_zh" | "code">;

interface Props {
  /** 要展示的父级：选中具体词性时一个；「全部」时传全部基本词性。 */
  parents: PanelParent[];
  /** 新建细分词性时固定的父级；「全部」视图下为空，由弹窗内下拉选择。 */
  createParent?: PanelParent;
  /** 父级目录仍在加载：表格显示加载态，而不是把空列表当成"暂无基本词性"。 */
  loading?: boolean;
  onSaved: (message: string) => void;
  onError: (error: unknown) => void;
  ref?: Ref<SubPartOfSpeechPanelHandle>;
}

/** 后端契约：大写字母开头，其后是大写字母、数字、连字符或下划线，最长 32。 */
const SUB_PART_CODE_PATTERN = /^[A-Z][A-Z0-9_-]{0,31}$/;

type SubPartFormValues = CreateSubPartOfSpeechInput & {
  /** 所属基本词性；固定父级或修改时由弹窗回填并锁定，「全部」视图下新建时由用户选择。 */
  part_of_speech_id: string;
};

const PLACEHOLDERS = {
  name_zh: "例如 可数名词",
  short_name_zh: "例如 可数名词",
  name_en: "例如 Countable noun",
  abbreviation: "例如 n.",
  full_name_en: "例如 countable noun"
};

function SubPartFormModal({
  parent,
  parentOptions,
  value,
  nextSortOrderFor,
  open,
  onClose,
  onSaved,
  onError
}: {
  /** 固定父级：选中具体词性后新建时是该词性；「全部」下新建时为空。修改时不用。 */
  parent?: PanelParent;
  parentOptions: PanelParent[];
  value?: SubPartOfSpeechConfig;
  /** 新建时按所选父级算出预填的序号（该父级下最大序号 + 10），管理员可以改。 */
  nextSortOrderFor: (parentId: string) => number;
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (error: unknown) => void;
}) {
  const [form] = Form.useForm<SubPartFormValues>();
  const create = useCreateSubPartOfSpeech();
  const update = useUpdateSubPartOfSpeech();
  const creating = !value;
  const markTouched = useDerivedNameDefaults(form, { open, creating });
  // 编码是词条引用的口径：已经被词义引用后后端不再放行修改。
  const codeLocked = value !== undefined && value.usage_count > 0;
  // 预填值放 ref 而不是 effect 依赖：列表随时可能重拉，跟着重跑那个 effect 会连带
  // resetFields 清空正在填的表单。
  const nextSortOrderForRef = useRef(nextSortOrderFor);
  nextSortOrderForRef.current = nextSortOrderFor;
  // 固定父级只有 id 参与回填，取出来当依赖，免得整个对象的身份变化把表单重置掉。
  const parentId = parent?.id;

  useEffect(() => {
    if (!open) return;
    if (value) {
      form.setFieldsValue({
        part_of_speech_id: value.part_of_speech_id,
        code: value.code,
        name_zh: value.name_zh,
        name_en: value.name_en,
        short_name_zh: value.short_name_zh,
        abbreviation: value.abbreviation,
        full_name_en: value.full_name_en,
        sort_order: value.sort_order
      });
    } else {
      form.resetFields();
      form.setFieldValue("part_of_speech_id", parentId);
      // 「全部」视图下没有固定父级，序号等用户选完再预填。
      if (parentId) {
        form.setFieldValue("sort_order", nextSortOrderForRef.current(parentId));
      }
    }
  }, [form, open, parentId, value]);

  const submit = async ({
    part_of_speech_id,
    ...fields
  }: SubPartFormValues) => {
    try {
      if (value) {
        await update.mutateAsync({
          partId: value.part_of_speech_id,
          subId: value.id,
          input: { base_revision: value.revision, ...fields }
        });
      } else {
        await create.mutateAsync({
          partId: part_of_speech_id,
          input: fields
        });
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
      width={720}
      title={
        value
          ? "修改细分词性"
          : parent
            ? `为“${parent.name_zh}”新增细分词性`
            : "新增细分词性"
      }
      okText={value ? "保 存" : "新 建"}
      cancelText="取 消"
      confirmLoading={create.isPending || update.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={submit}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="part_of_speech_id"
              label="所属基本词性"
              rules={[{ required: true, message: "请选择所属基本词性" }]}
            >
              <Select
                aria-label="所属基本词性"
                disabled={Boolean(value) || Boolean(parent)}
                options={parentOptions.map((item) => ({
                  value: item.id,
                  label: item.name_zh
                }))}
                placeholder="请选择所属基本词性"
                // 序号在所属父级下才有意义，换父级就按新父级重新预填；
                // 管理员已经手填过就别覆盖他。
                onChange={(id: string) => {
                  if (form.isFieldTouched("sort_order")) return;
                  form.setFieldValue(
                    "sort_order",
                    nextSortOrderForRef.current(id)
                  );
                }}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="code"
              // 「怎么填」收进标签旁的问号；「为什么改不了」是禁用原因，
              // 藏起来就只剩一个灰掉的输入框，仍留在下面。
              label={
                codeLocked ? (
                  "编码"
                ) : (
                  <LabelWithHint
                    label="编码"
                    hint="词条里引用这条细分词性用的代码文本，全局唯一"
                  />
                )
              }
              extra={
                codeLocked
                  ? `已有 ${value.usage_count} 个词义引用，编码不能再改`
                  : undefined
              }
              rules={[
                { required: true, message: "请输入编码" },
                {
                  pattern: SUB_PART_CODE_PATTERN,
                  message:
                    "编码为大写字母开头的大写字母、数字、- 或 _，最长 32 位"
                }
              ]}
            >
              <Input disabled={codeLocked} placeholder="例如 N-UNCOUNT" />
            </Form.Item>
          </Col>
        </Row>
        <PartOfSpeechSharedFields
          placeholders={PLACEHOLDERS}
          onTouch={markTouched}
        />
      </Form>
    </Modal>
  );
}

export function SubPartOfSpeechPanel({
  parents,
  createParent,
  loading = false,
  onSaved,
  onError,
  ref
}: Props) {
  const { modal } = App.useApp();
  const [editing, setEditing] = useState<SubPartOfSpeechConfig>();
  const [formOpen, setFormOpen] = useState(false);
  // 数据已整页在前端，分页只是展示层的，和基本词性表保持一致。
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useImperativeHandle(
    ref,
    () => ({
      openCreate: () => {
        // 没有任何父级（目录未加载或为空）时不开弹窗；「全部」视图下父级由弹窗里的下拉选择。
        if (parents.length === 0) return;
        setEditing(undefined);
        setFormOpen(true);
      }
    }),
    [parents]
  );
  const parentIds = parents.map((item) => item.id);
  const parentById = new Map(parents.map((item) => [item.id, item]));
  const list = useSubPartOfSpeechLists(parentIds);
  const remove = useRemoveSubPartOfSpeech();
  const parentKey = parentIds.join(",");
  // 删除或切换父级让行数变少时，antd 内部会自动回退页码但不回调 onChange，受控页码要跟上。
  const pageCount = Math.max(1, Math.ceil(list.items.length / pageSize));
  const currentPage = Math.min(page, pageCount);

  useEffect(() => {
    setEditing(undefined);
    setFormOpen(false);
    setPage(1);
  }, [parentKey]);

  const removeItem = (item: SubPartOfSpeechConfig) => {
    modal.confirm({
      title: `删除细分词性“${item.name_zh}”？`,
      content: "删除后不可恢复，词条中已引用的细分词性不会允许删除。",
      okText: "删 除",
      okButtonProps: { danger: true },
      cancelText: "取 消",
      onOk: async () => {
        try {
          await remove.mutateAsync({
            partId: item.part_of_speech_id,
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
    { title: "序号", dataIndex: "sort_order", width: 64 },
    { title: "编码", dataIndex: "code", width: 150 },
    { title: "正式中文", dataIndex: "name_zh", width: 120 },
    { title: "简洁显示", dataIndex: "short_name_zh", width: 110 },
    { title: "正式英文", dataIndex: "name_en", width: 150 },
    { title: "英文缩写", dataIndex: "abbreviation", width: 90 },
    { title: "英文全称", dataIndex: "full_name_en", width: 160 },
    {
      title: "所属基本词性",
      dataIndex: "part_of_speech_id",
      width: 110,
      render: (id: string) => parentById.get(id)?.name_zh
    },
    {
      title: "引用",
      dataIndex: "usage_count",
      width: 100,
      render: (count: number) => (count > 0 ? `${count} 个词义` : "未引用")
    },
    {
      title: "创建人",
      dataIndex: "created_by",
      width: 100,
      render: (actor: SubPartOfSpeechConfig["created_by"]) => actor.display_name
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
                ? `已有 ${item.usage_count} 个词义引用，只能修改`
                : undefined
            }
          >
            <Button
              size="small"
              danger
              disabled={item.usage_count > 0}
              onClick={() => removeItem(item)}
            >
              删 除
            </Button>
          </Tooltip>
        </Space>
      )
    }
  ];

  // 新建时排序值自动落在所选父级现有细分词性之后。
  const nextSortOrderFor = (parentId: string) =>
    nextSortOrder(
      list.items.filter((item) => item.part_of_speech_id === parentId)
    );

  return (
    <>
      <Card size="small">
        {!loading && parents.length === 0 ? (
          <Empty description="暂无基本词性" />
        ) : list.error ? (
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
            dataSource={list.items}
            loading={loading || list.isPending}
            locale={{ emptyText: <Empty description="暂无细分词性" /> }}
            pagination={{
              current: currentPage,
              pageSize,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50],
              showTotal: (total) => `共 ${total} 条`,
              onChange: (nextPage, nextSize) => {
                setPage(nextSize !== pageSize ? 1 : nextPage);
                setPageSize(nextSize);
              }
            }}
            scroll={{ x: 1450 }}
          />
        )}
      </Card>
      <SubPartFormModal
        parent={createParent}
        parentOptions={parents}
        value={editing}
        nextSortOrderFor={nextSortOrderFor}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={onSaved}
        onError={onError}
      />
    </>
  );
}
