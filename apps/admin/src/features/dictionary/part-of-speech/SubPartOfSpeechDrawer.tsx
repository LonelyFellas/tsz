import { useContentTranslation, ContentText } from "@/features/content/i18n";
import {
  AdminTable as Table,
  AdminTableToolbar
} from "@/components/AdminTable";
import { TableEmptyState } from "@/components/TableEmptyState";
import { usePermission } from "@/lib/auth";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Space
} from "@tsz/ui/admin/display";
import { App, Modal, Tooltip } from "@tsz/ui/admin/overlays";
import { Form, Select } from "@tsz/ui/admin/forms";
import { FullNameEnCell } from "./FullNameEnCell";
import { type TableColumnsType } from "@tsz/ui/admin/table";
import dayjs from "dayjs";
import type {
  CreateSubPartOfSpeechInput,
  PartOfSpeechConfig,
  SubPartOfSpeechConfig
} from "@tsz/types";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import {
  useCreateSubPartOfSpeech,
  useRemoveSubPartOfSpeech,
  useSubPartOfSpeechLists,
  useUpdateSubPartOfSpeech
} from "./api";
import { nextSortOrder } from "./catalog";
import { newWordNodeId } from "../word-model/primitives";
import { PartOfSpeechSharedFields } from "./PartOfSpeechSharedFields";

/** 供父级页面在自己的工具栏里触发"新增细分词性"，弹窗与编辑态仍由面板自己管。 */
export interface SubPartOfSpeechPanelHandle {
  openCreate: () => void;
}

/** 面板使用的基本词性目录信息。 */
type PanelParent = Pick<PartOfSpeechConfig, "id" | "name_zh" | "code">;

interface Props {
  toolbar?: ReactNode;
  toolbarExtra?: ReactNode;
  /** 要展示的父级：选中具体词性时一个；「全部」时传全部基本词性。 */
  parents: PanelParent[];
  /** 新建细分词性时固定的父级；「全部」视图下为空，由弹窗内下拉选择。 */
  createParent?: PanelParent;
  /** 父级目录仍在加载：表格显示加载态，而不是把空列表当成"暂无基本词性"。 */
  loading?: boolean;
  filtered?: boolean;
  onResetFilters?: () => void;
  onSaved: (message: ReactNode) => void;
  onError: (error: unknown) => void;
  ref?: Ref<SubPartOfSpeechPanelHandle>;
}

type SubPartFormValues = Omit<CreateSubPartOfSpeechInput, "code"> & {
  /** 所属基本词性；固定父级或修改时由弹窗回填并锁定，「全部」视图下新建时由用户选择。 */
  part_of_speech_id: string;
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
  onSaved: (message: ReactNode) => void;
  onError: (error: unknown) => void;
}) {
  const { t } = useContentTranslation();
  const canEdit = usePermission("lexicon_settings.edit_sub");
  const PLACEHOLDERS = {
    name_zh: t("example_countable_zh"),
    short_name_zh: t("example_countable_zh"),
    name_en: t("example_countable_name"),
    abbreviation: t("example_n_abbr"),
    full_name_en: t("example_countable_full")
  };

  const [form] = Form.useForm<SubPartFormValues>();
  const create = useCreateSubPartOfSpeech();
  const update = useUpdateSubPartOfSpeech();
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
    if (!canEdit) return;
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
          input: {
            ...fields,
            code: `SUB_${newWordNodeId().replaceAll("-", "").slice(0, 28).toUpperCase()}`
          }
        });
      }
      onSaved(
        value ? (
          <ContentText message="sub_updated" />
        ) : (
          <ContentText message="sub_added" />
        )
      );
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
          ? t("edit_sub")
          : parent
            ? t("add_sub_to", { name: parent.name_zh })
            : t("add_sub")
      }
      okText={value ? t("save_spaced") : t("create_spaced")}
      cancelText={t("cancel_spaced")}
      okButtonProps={{ disabled: !canEdit }}
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
              label={t("parent_part")}
              rules={[
                {
                  required: true,
                  message: <ContentText message="select_parent" />
                }
              ]}
            >
              <Select
                aria-label={t("parent_part")}
                disabled={Boolean(value) || Boolean(parent)}
                options={parentOptions.map((item) => ({
                  value: item.id,
                  label: item.name_zh
                }))}
                placeholder={t("select_parent")}
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
        </Row>
        <PartOfSpeechSharedFields placeholders={PLACEHOLDERS} />
      </Form>
    </Modal>
  );
}

export function SubPartOfSpeechPanel({
  parents,
  createParent,
  loading = false,
  filtered = false,
  onResetFilters,
  onSaved,
  onError,
  toolbar,
  toolbarExtra,
  ref
}: Props) {
  const { t } = useContentTranslation();
  const canEdit = usePermission("lexicon_settings.edit_sub");
  const canDelete = usePermission("lexicon_settings.delete");
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
        if (parents.length === 0 || !canEdit) return;
        setEditing(undefined);
        setFormOpen(true);
      }
    }),
    [parents, canEdit]
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
      title: (
        <ContentText message="delete_sub" params={{ name: item.name_zh }} />
      ),
      content: <ContentText message="delete_sub_help" />,
      okText: <ContentText message="delete_spaced" />,
      okButtonProps: { danger: true },
      cancelText: <ContentText message="cancel_spaced" />,
      onOk: async () => {
        try {
          await remove.mutateAsync({
            partId: item.part_of_speech_id,
            subId: item.id,
            base_revision: item.revision
          });
          onSaved(<ContentText message="sub_deleted" />);
        } catch (error) {
          onError(error);
          await list.refetch();
        }
      }
    });
  };

  const columns: TableColumnsType<SubPartOfSpeechConfig> = [
    { title: t("sort_order"), dataIndex: "sort_order", width: 64 },
    { title: t("name_zh"), dataIndex: "name_zh", width: 120 },
    { title: t("short_name_zh"), dataIndex: "short_name_zh", width: 110 },
    { title: t("name_en"), dataIndex: "name_en", width: 150 },
    { title: t("abbreviation"), dataIndex: "abbreviation", width: 90 },
    {
      title: t("full_name_en"),
      dataIndex: "full_name_en",
      width: 160,
      render: (value: string) => <FullNameEnCell value={value} />
    },
    {
      title: t("parent_part"),
      dataIndex: "part_of_speech_id",
      width: 110,
      render: (id: string) => parentById.get(id)?.name_zh
    },
    {
      title: t("links"),
      dataIndex: "usage_count",
      width: 100,
      render: (count: number) =>
        count > 0 ? t("senses", { count }) : t("no_links")
    },
    {
      title: t("creator"),
      dataIndex: "created_by",
      width: 100,
      render: (actor: SubPartOfSpeechConfig["created_by"]) => actor.display_name
    },
    {
      title: t("created_at"),
      dataIndex: "created_at",
      width: 150,
      render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm")
    },
    {
      title: t("actions"),
      key: "actions",
      fixed: "right",
      width: 150,
      render: (_, item) => (
        <Space>
          <Button
            disabled={!canEdit}
            size="small"
            onClick={() => {
              setEditing(item);
              setFormOpen(true);
            }}
          >
            {t("edit_spaced")}
          </Button>
          <Tooltip
            title={
              item.usage_count > 0
                ? t("linked_senses", { count: item.usage_count })
                : undefined
            }
          >
            <Button
              size="small"
              danger
              disabled={!canDelete || item.usage_count > 0}
              onClick={() => removeItem(item)}
            >
              {t("delete_spaced")}
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
        {((!loading && parents.length === 0) || list.error) && (
          <AdminTableToolbar extra={toolbarExtra}>{toolbar}</AdminTableToolbar>
        )}
        {!loading && parents.length === 0 ? (
          <Empty description={t("no_parts")} />
        ) : list.error ? (
          <Alert
            type="error"
            showIcon
            title={t("subs_failed")}
            description={list.error.message}
            action={
              <Button size="small" onClick={() => void list.refetch()}>
                {t("retry_spaced")}
              </Button>
            }
            style={{ marginBottom: 12 }}
          />
        ) : (
          <Table<SubPartOfSpeechConfig>
            tableId="sub-parts-of-speech"
            toolbar={toolbar}
            toolbarExtra={toolbarExtra}
            locale={{
              emptyText: (
                <TableEmptyState
                  message={t("no_subs")}
                  filtered={filtered}
                  onResetFilters={onResetFilters}
                />
              )
            }}
            rowKey="id"
            size="middle"
            columns={columns}
            dataSource={list.items}
            loading={loading || list.isPending}

            pagination={{
              current: currentPage,
              pageSize,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50],
              showTotal: (total) => t("total", { count: total }),
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
