import { ListFilterBar } from "@/components/ListFilterBar";
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
  TextField
} from "@mui/material";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { AdminTable } from "@/components/AdminTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PermissionButton } from "@/components/PermissionButton";
import { useFeedback } from "@/components/FeedbackProvider";
import { detailColumns } from "./detailColumns";
import type { CreatePartOfSpeechInput, FormTypeConfig } from "@tsz/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useEffect, useRef, useState } from "react";
import { partOfSpeechDataSource } from "../dataSource";
import { partOfSpeechKeys, usePartOfSpeechCatalog } from "./api";
import { nextSortOrder } from "./catalog";
import {
  PartOfSpeechSharedFields,
  partFieldValues
} from "./PartOfSpeechSharedFields";
import { slugifyCode } from "./PartOfSpeechFormModal";
import { errorMessage } from "./PartOfSpeechSettings";

type Values = Omit<CreatePartOfSpeechInput, "code"> & {
  /** 原形没有归属，wire 上是 null；表单里按未选处理。 */
  part_of_speech_id?: string | null;
};

/**
 * 词形编码全局唯一，而不同基本词性下允许重名（形容词与副词各有「比较级」），
 * 所以派生编码要带上父词性前缀。父编码本身可长达 32 字，截到 8 字给英文全称留位置。
 */
function deriveFormTypeCode(parentCode: string, fullNameEn: string): string {
  const parent = slugifyCode(parentCode).slice(0, 8);
  return slugifyCode(`${parent} ${fullNameEn}`);
}

const ALL_PARTS = { id: "", name_zh: "全部" };

export function FormTypeSettings() {
  const canEdit = usePermission("lexicon_settings.edit_forms");
  const canDelete = usePermission("lexicon_settings.delete");
  const notify = useFeedback();
  const [removing, setRemoving] = useState<FormTypeConfig>();
  const [deleting, setDeleting] = useState(false);
  const client = useQueryClient();
  const catalog = usePartOfSpeechCatalog();
  const ready = !catalog.isError && !!catalog.data?.form_types;
  const [query, setQuery] = useState<{
    part_of_speech_id?: string;
    page: number;
    page_size: number;
  }>({ page: 1, page_size: 10 });
  // 短语没有词形变化，后端也只接受挂在单词词性下：候选只列单词侧。
  const parts = (catalog.data?.items ?? []).filter(
    (item) => item.kind === "word"
  );
  // 后端列表按 sort_order 全局排序，新建预填也取全局最大值 + 10，
  // 否则新词形默认会插到别的词性中间；管理员可以改。放进 ref 而不是 effect 依赖：
  // 目录随时可能重拉，跟着重跑那个 effect 会连带 resetFields 清空正在填的表单。
  const nextSortOrderRef = useRef(0);
  nextSortOrderRef.current = nextSortOrder(catalog.data?.form_types ?? []);
  const partNameById = new Map(parts.map((item) => [item.id, item.name_zh]));
  const form = useForm<Values>({ shouldUnregister: true });
  const { reset, handleSubmit } = form;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FormTypeConfig>();
  const list = useQuery({
    queryKey: [...partOfSpeechKeys.all, "form-types", query],
    queryFn: () => partOfSpeechDataSource.listFormTypes(query),
    enabled: ready
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: partOfSpeechKeys.all });
  const save = useMutation({
    mutationFn: ({ part_of_speech_id: partId, ...values }: Values) => {
      if (editing) {
        return partOfSpeechDataSource.updateFormType(editing.id, {
          ...values,
          // 原形对所有词性通用，后端不接受归属字段。
          ...(editing.code === "base"
            ? {}
            : { part_of_speech_id: partId ?? undefined }),
          base_revision: editing.revision
        });
      }
      // 表单的 required 规则保证走到这里时归属已选。
      if (!partId) throw new Error("missing part_of_speech_id");
      const parent = parts.find((item) => item.id === partId);
      return partOfSpeechDataSource.createFormType({
        ...values,
        part_of_speech_id: partId,
        code: deriveFormTypeCode(parent?.code ?? "", values.full_name_en)
      });
    },
    onSuccess: async () => {
      await refresh();
      setOpen(false);
      notify(editing ? "词形变化已更新" : "词形变化已新增", "success");
    },
    onError: (error) => notify(errorMessage(error), "error")
  });
  useEffect(() => {
    if (!open) return;
    reset(
      editing
        ? {
            ...partFieldValues(editing),
            part_of_speech_id: editing.part_of_speech_id
          }
        : {
            name_zh: "",
            short_name_zh: "",
            name_en: "",
            abbreviation: "",
            full_name_en: "",
            sort_order: nextSortOrderRef.current,
            part_of_speech_id: query.part_of_speech_id
          }
    );
  }, [editing, open, query.part_of_speech_id, reset]);
  const remove = async () => {
    if (!removing || deleting || !canDelete) return;
    setDeleting(true);
    try {
      await partOfSpeechDataSource.removeFormType(removing.id, {
        base_revision: removing.revision
      });
      await refresh();
      notify("词形变化已删除", "success");
    } catch (error) {
      notify(errorMessage(error), "error");
      await refresh();
    } finally {
      setDeleting(false);
      setRemoving(undefined);
    }
  };
  const parentOptions = [ALL_PARTS, ...parts];
  return (
    <Stack spacing={2}>
      {!ready && !catalog.isPending && (
        <Alert
          severity={catalog.isError ? "error" : "info"}
          action={<Button onClick={() => void catalog.refetch()}>重试</Button>}
        >
          {catalog.isError
            ? "词形目录加载失败"
            : "服务尚未提供词形配置，请更新后重试"}
        </Alert>
      )}
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <ListFilterBar justifyContent="space-between">
          <Autocomplete
            size="small"
            options={parentOptions}
            value={
              parentOptions.find(
                (part) => part.id === (query.part_of_speech_id ?? "")
              ) ?? null
            }
            isOptionEqualToValue={(a, b) => a.id === b.id}
            getOptionLabel={(part) => part.name_zh}
            loading={catalog.isPending}
            disabled={catalog.isError || !parts.length}
            onChange={(_, part) =>
              setQuery({
                ...query,
                part_of_speech_id: part?.id || undefined,
                page: 1
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="所属基本词性"
                placeholder="请选择基本词性"
              />
            )}
          />
          <Button
            variant="contained"
            disabled={!canEdit || !ready}
            onClick={() => {
              setEditing(undefined);
              setOpen(true);
            }}
          >
            新增词形变化
          </Button>
        </ListFilterBar>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        {list.isError && (
          <Alert
            severity="error"
            action={<Button onClick={() => void list.refetch()}>重试</Button>}
          >
            词形配置加载失败
          </Alert>
        )}
        <AdminTable<FormTypeConfig>
          emptyMessage="暂无词形变化"
          filtered={!!query.part_of_speech_id}
          onResetFilters={() =>
            setQuery({ ...query, page: 1, part_of_speech_id: undefined })
          }
          rows={list.data?.items ?? []}
          rowId={(item) => item.id}
          loading={catalog.isPending || (ready && list.isFetching)}
          minWidth={1300}
          pagination={{
            page: query.page,
            pageSize: query.page_size,
            total: list.data?.pagination.total ?? 0,
            pageSizes: [10, 20, 50],
            onChange: (page, page_size) =>
              setQuery({ ...query, page, page_size })
          }}
          columns={[
            ...detailColumns,
            {
              id: "parent",
              label: "所属基本词性",
              width: 120,
              render: (item) =>
                item.part_of_speech_id
                  ? (partNameById.get(item.part_of_speech_id) ??
                    item.part_of_speech_id)
                  : "所有词性"
            },
            {
              id: "usage",
              label: "关联",
              width: 100,
              render: (item) =>
                item.usage_count ? `${item.usage_count} 个词条` : "无关联"
            },
            {
              id: "creator",
              label: "创建人",
              width: 100,
              render: (item) => item.created_by.display_name
            },
            {
              id: "time",
              label: "创建时间",
              width: 150,
              render: (item) =>
                dayjs(item.created_at).format("YYYY-MM-DD HH:mm")
            },
            {
              id: "action",
              label: "操作",
              width: 150,
              sticky: "right",
              render: (item) => (
                <Stack direction="row" spacing={1}>
                  <Button
                    disabled={!canEdit}
                    onClick={() => {
                      setEditing(item);
                      setOpen(true);
                    }}
                  >
                    修改
                  </Button>
                  <PermissionButton
                    color="error"
                    disabled={
                      !canDelete || item.code === "base" || item.usage_count > 0
                    }
                    reason={
                      item.code === "base"
                        ? "原形为必需类型，不能删除"
                        : item.usage_count
                          ? "仍与词条有关联，可以修改，但不能删除"
                          : undefined
                    }
                    onClick={() => setRemoving(item)}
                  >
                    删除
                  </PermissionButton>
                </Stack>
              )
            }
          ]}
        />
      </Paper>
      <Dialog
        open={open}
        fullWidth
        maxWidth="md"
        aria-labelledby="form-type-title"
        onClose={() => {
          if (!save.isPending) setOpen(false);
        }}
      >
        <DialogTitle id="form-type-title">
          {editing ? "修改词形变化" : "新增词形变化"}
        </DialogTitle>
        <DialogContent>
          <FormProvider {...form}>
            <Stack
              component="form"
              noValidate
              id="form-type-form"
              spacing={2}
              sx={{ mt: 1 }}
              onSubmit={handleSubmit((values) => {
                if (canEdit && !save.isPending) save.mutate(values);
              })}
            >
              {editing?.code === "base" ? (
                <Alert severity="info">
                  原形对所有基本词性通用，不归属某一个词性。
                </Alert>
              ) : (
                <Controller
                  name="part_of_speech_id"
                  control={form.control}
                  rules={{ required: "请选择所属基本词性" }}
                  render={({ field, fieldState }) => (
                    <Autocomplete
                      options={parts}
                      value={
                        parts.find((part) => part.id === field.value) ?? null
                      }
                      getOptionLabel={(part) => part.name_zh}
                      isOptionEqualToValue={(a, b) => a.id === b.id}
                      onChange={(_, part) => field.onChange(part?.id)}
                      disabled={save.isPending}
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
              )}
              <PartOfSpeechSharedFields
                disabled={save.isPending}
                placeholders={{
                  name_zh: "例如 过去式",
                  short_name_zh: "例如 过去式",
                  name_en: "例如 Past tense",
                  abbreviation: "例如 past",
                  full_name_en: "例如 past tense"
                }}
              />
            </Stack>
          </FormProvider>
        </DialogContent>
        <DialogActions>
          <Button disabled={save.isPending} onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            type="submit"
            form="form-type-form"
            variant="contained"
            disabled={!canEdit}
            loading={save.isPending}
          >
            {editing ? "保存" : "新建"}
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        title={`删除词形变化“${removing?.name_zh ?? ""}”？`}
        confirmText="删除"
        danger
        pending={deleting}
        onClose={() => setRemoving(undefined)}
        onConfirm={() => void remove()}
      >
        该操作不可恢复。删除后，词条录入和词典建议不再提供此类型。
      </ConfirmDialog>
    </Stack>
  );
}
