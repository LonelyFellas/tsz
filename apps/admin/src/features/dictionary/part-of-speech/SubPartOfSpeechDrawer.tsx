import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Form,
  Modal,
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
import { useEffect, useImperativeHandle, useState } from "react";
import type { Ref } from "react";
import {
  useCreateSubPartOfSpeech,
  useRemoveSubPartOfSpeech,
  useSubPartOfSpeechLists,
  useUpdateSubPartOfSpeech
} from "./api";
import { nextSortOrder } from "./catalog";
import { PartOfSpeechNameFields } from "./PartOfSpeechNameFields";
import { useDerivedNameDefaults } from "./useDerivedNameDefaults";

/** 供父级页面在自己的工具栏里触发"新增细分词性"，弹窗与编辑态仍由面板自己管。 */
export interface SubPartOfSpeechPanelHandle {
  openCreate: () => void;
}

/** 面板需要的父级信息：id 定位、name_zh 展示、code 参与派生细分词性编码。 */
type PanelParent = Pick<PartOfSpeechConfig, "id" | "name_zh" | "code">;

interface Props {
  /** 要展示的父级（调用方只传可扩展的基础词性）：选中具体词性时一个；「全部」时传全部。 */
  parents: PanelParent[];
  /** 新建细分词性时固定的父级；「全部」视图下为空，由弹窗内下拉选择。 */
  createParent?: PanelParent;
  /** 父级目录仍在加载：表格显示加载态，而不是把空列表当成"暂无可扩展的基本词性"。 */
  loading?: boolean;
  onSaved: (message: string) => void;
  onError: (error: unknown) => void;
  ref?: Ref<SubPartOfSpeechPanelHandle>;
}

/**
 * 稳定编码是系统内部标识，用户不填也不看：新建时由「所属基本词性编码 + 英文全称」派生
 * （大写、非字母数字折成连字符、最长 32），创建后不可修改。带上父级前缀是因为编码全局唯一，
 * 而英文全称只在同一父级下唯一——不同父级允许同名细分词性。
 */
export function deriveSubPartOfSpeechCode(
  fullNameEn: string,
  parentCode: string
): string {
  const slug = `${parentCode} ${fullNameEn}`
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 32);
}

// 排序值与稳定编码都不暴露给用户：前者自动追加在末尾，后者由英文全称派生。
type SubPartFormValues = Omit<
  CreateSubPartOfSpeechInput,
  "sort_order" | "code"
> & {
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
  /** 新建时按所选父级算出自动追加在末尾的排序值；排序对用户不可见。 */
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
  const parentById = new Map(parentOptions.map((item) => [item.id, item]));

  useEffect(() => {
    if (!open) return;
    if (value) {
      form.setFieldsValue({
        part_of_speech_id: value.part_of_speech_id,
        name_zh: value.name_zh,
        name_en: value.name_en,
        short_name_zh: value.short_name_zh,
        abbreviation: value.abbreviation,
        full_name_en: value.full_name_en
      });
    } else {
      form.resetFields();
      form.setFieldValue("part_of_speech_id", parent?.id);
    }
  }, [form, open, parent?.id, value]);

  const submit = async ({
    part_of_speech_id,
    ...fields
  }: SubPartFormValues) => {
    try {
      if (value) {
        await update.mutateAsync({
          partId: value.part_of_speech_id,
          subId: value.id,
          input: {
            base_revision: value.revision,
            ...fields,
            sort_order: value.sort_order
          }
        });
      } else {
        const parentCode =
          parentById.get(part_of_speech_id)?.code ?? part_of_speech_id;
        await create.mutateAsync({
          partId: part_of_speech_id,
          input: {
            ...fields,
            code: deriveSubPartOfSpeechCode(fields.full_name_en, parentCode),
            sort_order: nextSortOrderFor(part_of_speech_id)
          }
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
          />
        </Form.Item>
        <PartOfSpeechNameFields
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
  // 删除或切换父级让行数变少时，antd 内部会自动回退页码但不回调 onChange，序号要按实际页算。
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
    {
      title: "序号",
      width: 56,
      render: (_, __, index) => (currentPage - 1) * pageSize + index + 1
    },
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
          <Empty description="暂无可扩展的基本词性" />
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
            scroll={{ x: 1300 }}
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
