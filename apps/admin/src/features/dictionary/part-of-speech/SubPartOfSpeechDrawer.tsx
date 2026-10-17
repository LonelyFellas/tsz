import { usePermission } from "@/lib/auth";
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { AdminTable } from "@/components/AdminTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PermissionButton } from "@/components/PermissionButton";
import { detailColumns } from "./detailColumns";
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
import { newWordNodeId } from "../word-model/primitives";
import {
  PartOfSpeechSharedFields,
  partFieldValues
} from "./PartOfSpeechSharedFields";

/** 供父级页面在自己的工具栏里触发"新增细分词性"，弹窗与编辑态仍由面板自己管。 */
export interface SubPartOfSpeechPanelHandle {
  openCreate: () => void;
}

/** 面板使用的基本词性目录信息。 */
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

type SubPartFormValues = Omit<CreateSubPartOfSpeechInput, "code"> & {
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
  const canEdit = usePermission("lexicon_settings.edit_sub");
  const form = useForm<SubPartFormValues>();
  const { reset, handleSubmit, setValue } = form;
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
    reset(
      value
        ? {
            ...partFieldValues(value),
            part_of_speech_id: value.part_of_speech_id
          }
        : {
            name_zh: "",
            short_name_zh: "",
            name_en: "",
            abbreviation: "",
            full_name_en: "",
            part_of_speech_id: parentId ?? "",
            sort_order: parentId
              ? nextSortOrderForRef.current(parentId)
              : undefined
          }
    );
  }, [open, parentId, value, reset]);
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
      onSaved(value ? "细分词性已更新" : "细分词性已新增");
      onClose();
    } catch (error) {
      onError(error);
    }
  };

  const pending = create.isPending || update.isPending;
  return (
    <Dialog
      open={open}
      fullWidth
      maxWidth="md"
      aria-labelledby="sub-part-title"
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <DialogTitle id="sub-part-title">
        {value
          ? "修改细分词性"
          : parent
            ? `为“${parent.name_zh}”新增细分词性`
            : "新增细分词性"}
      </DialogTitle>
      <DialogContent>
        <FormProvider {...form}>
          <Stack
            component="form"
            id="sub-part-form"
            spacing={2}
            sx={{ mt: 1 }}
            onSubmit={handleSubmit((values) => {
              if (!pending) void submit(values);
            })}
          >
            <Controller
              name="part_of_speech_id"
              control={form.control}
              rules={{ required: "请选择所属基本词性" }}
              render={({ field, fieldState }) => (
                <Autocomplete
                  options={parentOptions}
                  value={
                    parentOptions.find((option) => option.id === field.value) ??
                    null
                  }
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  getOptionLabel={(option) => option.name_zh}
                  disabled={!!value || !!parent || pending}
                  onChange={(_, option) => {
                    field.onChange(option?.id ?? "");
                    const state = form.getFieldState("sort_order");
                    if (option && !state.isDirty && !state.isTouched)
                      setValue(
                        "sort_order",
                        nextSortOrderForRef.current(option.id)
                      );
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="所属基本词性"
                      placeholder="请选择所属基本词性"
                      inputRef={field.ref}
                      onBlur={field.onBlur}
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message}
                    />
                  )}
                />
              )}
            />
            <PartOfSpeechSharedFields
              placeholders={PLACEHOLDERS}
              disabled={pending}
            />
          </Stack>
        </FormProvider>
      </DialogContent>
      <DialogActions>
        <Button disabled={pending} onClick={onClose}>
          取消
        </Button>
        <Button
          type="submit"
          form="sub-part-form"
          variant="contained"
          disabled={!canEdit}
          loading={pending}
        >
          {value ? "保存" : "新建"}
        </Button>
      </DialogActions>
    </Dialog>
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
  const canEdit = usePermission("lexicon_settings.edit_sub");
  const canDelete = usePermission("lexicon_settings.delete");
  const [deleting, setDeleting] = useState<SubPartOfSpeechConfig>();
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

  const removeItem = async () => {
    if (!deleting || remove.isPending || !canDelete) return;
    try {
      await remove.mutateAsync({
        partId: deleting.part_of_speech_id,
        subId: deleting.id,
        base_revision: deleting.revision
      });
      onSaved("细分词性已删除");
    } catch (error) {
      onError(error);
      await list.refetch();
    } finally {
      setDeleting(undefined);
    }
  };
  const nextSortOrderFor = (parentId: string) =>
    nextSortOrder(
      list.items.filter((item) => item.part_of_speech_id === parentId)
    );
  return (
    <>
      <Paper variant="outlined" sx={{ p: 2 }}>
        {!loading && !parents.length ? (
          <Typography color="text.secondary">暂无基本词性</Typography>
        ) : list.error ? (
          <Alert
            severity="error"
            action={<Button onClick={() => void list.refetch()}>重试</Button>}
          >
            细分词性加载失败<Typography>{list.error.message}</Typography>
          </Alert>
        ) : (
          <>
            <AdminTable<SubPartOfSpeechConfig>
              rows={list.items.slice(
                (currentPage - 1) * pageSize,
                currentPage * pageSize
              )}
              rowId={(item) => item.id}
              loading={loading || list.isPending}
              minWidth={1450}
              pagination={{
                page: currentPage,
                pageSize,
                total: list.items.length,
                pageSizes: [10, 20, 50],
                onChange: (next, size) => {
                  setPage(next);
                  setPageSize(size);
                }
              }}
              columns={[
                ...detailColumns,
                {
                  id: "parent",
                  label: "所属基本词性",
                  width: 110,
                  render: (item) =>
                    parentById.get(item.part_of_speech_id)?.name_zh
                },
                {
                  id: "usage",
                  label: "关联",
                  width: 100,
                  render: (item) =>
                    item.usage_count > 0
                      ? `${item.usage_count} 个词义`
                      : "无关联"
                },
                {
                  id: "creator",
                  label: "创建人",
                  width: 100,
                  render: (item) => item.created_by.display_name
                },
                {
                  id: "created",
                  label: "创建时间",
                  width: 150,
                  render: (item) =>
                    dayjs(item.created_at).format("YYYY-MM-DD HH:mm")
                },
                {
                  id: "actions",
                  label: "操作",
                  width: 150,
                  sticky: "right",
                  render: (item) => (
                    <Stack direction="row" spacing={1}>
                      <Button
                        disabled={!canEdit}
                        onClick={() => {
                          setEditing(item);
                          setFormOpen(true);
                        }}
                      >
                        修改
                      </Button>
                      <PermissionButton
                        color="error"
                        disabled={!canDelete || item.usage_count > 0}
                        reason={
                          item.usage_count > 0
                            ? `已关联 ${item.usage_count} 个词义，可以修改，但不能删除`
                            : undefined
                        }
                        onClick={() => setDeleting(item)}
                      >
                        删除
                      </PermissionButton>
                    </Stack>
                  )
                }
              ]}
            />
            {!list.isPending && !list.items.length && (
              <Typography color="text.secondary">暂无细分词性</Typography>
            )}
          </>
        )}
      </Paper>
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
      <ConfirmDialog
        open={!!deleting}
        title={`删除细分词性“${deleting?.name_zh ?? ""}”？`}
        confirmText="删除"
        danger
        pending={remove.isPending}
        onClose={() => setDeleting(undefined)}
        onConfirm={() => void removeItem()}
      >
        删除后不可恢复。如果仍有词义关联此细分词性，将无法删除。
      </ConfirmDialog>
    </>
  );
}
