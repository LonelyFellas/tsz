import { useIsSuperAdmin, usePermission } from "@/lib/auth";
import { FormTypeSettings } from "./FormTypeSettings";
import {
  Alert,
  Autocomplete,
  Breadcrumbs,
  Button,
  Chip,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from "@mui/material";
import { useForm } from "react-hook-form";
import { AdminTable } from "@/components/AdminTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PermissionButton } from "@/components/PermissionButton";
import { useFeedback } from "@/components/FeedbackProvider";
import { detailColumns } from "./detailColumns";
import { HttpError } from "@tsz/api-client";
import type { AdminWordKind, PartOfSpeechConfig } from "@tsz/types";
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

// 后端 409 冲突会带上撞车的字段名。
const CONFLICT_FIELD_LABEL: Record<string, string> = {
  name_zh: "正式中文",
  name_en: "正式英文",
  abbreviation: "英文缩写",
  short_name_zh: "简洁显示",
  full_name_en: "英文全称"
};

function conflictMessage(kind: string, field: string | null | undefined) {
  if (field === "code") {
    return `英文全称与已有${kind}过于接近，请调整英文全称`;
  }
  const label = field ? CONFLICT_FIELD_LABEL[field] : undefined;
  return label ? `${label}与已有${kind}重复` : `${kind}名称已存在`;
}

export function errorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.code === "form_type_conflict")
      return conflictMessage("词形变化", error.problem?.field);
    if (error.code === "form_type_in_use")
      return "该词形类型仍与词条或历史发布内容有关联，可以修改，但不能删除";
    if (error.code === "form_type_required") return "原形为必需类型，不能删除";
    if (error.code === "form_type_not_found")
      return "词形类型不存在或已被删除，请刷新后重试";
    if (error.code === "invalid_form_type")
      return "词形配置字段不符合要求，请检查后重试";
    if (error.code === "part_of_speech_conflict")
      return conflictMessage("基本词性", error.problem?.field);
    if (error.code === "sub_part_of_speech_conflict")
      return error.problem?.field === "code"
        ? "内部标识冲突，请重新提交"
        : conflictMessage("细分词性", error.problem?.field);
    if (error.code === "part_of_speech_in_use")
      return "该基本词性仍与单词或短语有关联，可以修改，但不能删除";
    if (error.code === "part_of_speech_has_form_types")
      return "该基本词性下还有词形变化，请先删除词形变化";
    if (error.code === "part_of_speech_has_sub_parts")
      return "该基本词性下还有细分词性，请先删除细分词性";
    if (error.code === "sub_part_of_speech_in_use")
      return "该细分词性仍与词义有关联，不能删除或修改编码";
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

const ALL_PARTS = { id: "", name_zh: "全部" };

export function PartOfSpeechSettings() {
  const canEdit = usePermission("lexicon_settings.edit_basic");
  const canEditSub = usePermission("lexicon_settings.edit_sub");
  const canDelete = useIsSuperAdmin();
  const notify = useFeedback();
  const [deleting, setDeleting] = useState<PartOfSpeechConfig>();
  const { register, reset, handleSubmit } = useForm<{ q: string }>({
    defaultValues: { q: "" }
  });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PartOfSpeechConfig>();
  const [activeTab, setActiveTab] = useState<"basic" | "detailed" | "forms">(
    "basic"
  );
  // 单词与短语共用这一套配置界面，只是各看各的一侧；短语没有词形变化。
  const [kind, setKind] = useState<AdminWordKind>("word");
  const [selectedPartId, setSelectedPartId] = useState("");
  const subPanelRef = useRef<SubPartOfSpeechPanelHandle>(null);
  const list = usePartOfSpeechConfigList({
    q: q || undefined,
    kind,
    page,
    page_size: pageSize
  });
  const catalog = usePartOfSpeechCatalog();
  // 新建基本词性时排序值自动排在目录最后；目录没加载完前不开新建，免得算出错误的排序。
  const catalogReady = !catalog.isPending && !catalog.isError;
  const remove = useRemovePartOfSpeech();
  // 目录一次返回两侧，界面按当前分页收窄：细分词性面板、序号预填都只看这一侧。
  const parts = (catalog.data?.items ?? []).filter(
    (item) => item.kind === kind
  );
  const defaultSortOrder = nextSortOrder(parts);

  const switchKind = (next: AdminWordKind) => {
    setKind(next);
    setPage(1);
    setSelectedPartId("");
    // 短语没有词形变化，停在那个 Tab 上会看到一片和当前分页无关的内容。
    setActiveTab((current) =>
      next === "phrase" && current === "forms" ? "basic" : current
    );
  };
  // 空串表示「全部」：面板并排展示所有词性的细分词性；新增时在弹窗里选所属词性。
  const selectedPart = parts.find((item) => item.id === selectedPartId);

  const showError = (error: unknown) => notify(errorMessage(error), "error");

  const removeItem = async () => {
    if (!deleting || remove.isPending || !canDelete) return;
    try {
      await remove.mutateAsync({
        id: deleting.id,
        base_revision: deleting.revision
      });
      notify("基本词性已删除", "success");
    } catch (error) {
      showError(error);
      await list.refetch();
    } finally {
      setDeleting(undefined);
    }
  };
  const parentOptions = [ALL_PARTS, ...parts];
  return (
    <Stack spacing={2}>
      <Breadcrumbs>
        <Typography>系统设置</Typography>
        <Typography>词性配置</Typography>
      </Breadcrumbs>
      <Tabs
        value={kind}
        onChange={(_, value: AdminWordKind) => switchKind(value)}
        aria-label="词性类别"
      >
        <Tab value="word" label="单词" />
        <Tab value="phrase" label="短语" />
      </Tabs>
      <ToggleButtonGroup
        exclusive
        value={activeTab}
        onChange={(_, value: typeof activeTab | null) => {
          if (value) setActiveTab(value);
        }}
        aria-label="配置分区"
        sx={{ alignSelf: "flex-start" }}
        size="small"
      >
        <ToggleButton value="basic">基本词性</ToggleButton>
        <ToggleButton value="detailed">细分词性</ToggleButton>
        {kind !== "phrase" && (
          <ToggleButton value="forms">词形变化</ToggleButton>
        )}
      </ToggleButtonGroup>
      {activeTab === "forms" && kind === "word" ? (
        <FormTypeSettings />
      ) : activeTab === "basic" ? (
        <>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              useFlexGap
              flexWrap="wrap"
              spacing={1}
            >
              <Stack
                component="form"
                direction="row"
                useFlexGap
                flexWrap="wrap"
                spacing={1}
                onSubmit={handleSubmit(({ q: nextQ }) => {
                  setQ(nextQ.trim());
                  setPage(1);
                })}
              >
                <TextField
                  label="关键词"
                  placeholder="中文 / 英文 / 编码 / 缩写"
                  sx={{ width: 260 }}
                  {...register("q")}
                />
                <Button type="submit" variant="contained">
                  搜索
                </Button>
                <Button
                  onClick={() => {
                    reset();
                    setQ("");
                    setPage(1);
                  }}
                >
                  重置
                </Button>
              </Stack>
              <Button
                variant="contained"
                disabled={!canEdit || !catalogReady}
                onClick={() => {
                  setEditing(undefined);
                  setFormOpen(true);
                }}
              >
                新增基本词性
              </Button>
            </Stack>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            {list.isError && (
              <Alert
                severity="error"
                action={
                  <Button onClick={() => void list.refetch()}>重试</Button>
                }
              >
                词性配置加载失败<Typography>{list.error.message}</Typography>
              </Alert>
            )}
            <AdminTable<PartOfSpeechConfig>
              rows={list.data?.items ?? []}
              rowId={(item) => item.id}
              loading={list.isFetching}
              minWidth={1240}
              pagination={{
                page,
                pageSize,
                total: list.data?.pagination.total ?? 0,
                pageSizes: [10, 20, 50],
                onChange: (next, size) => {
                  setPage(next);
                  setPageSize(size);
                }
              }}
              columns={[
                ...detailColumns,
                {
                  id: "sub",
                  label: "细分词性",
                  width: 90,
                  render: (item) => `${item.sub_part_count} 项`
                },
                {
                  id: "forms",
                  label: "词形变化",
                  width: 100,
                  render: (item) =>
                    item.allowed_form_types
                      ? `${item.allowed_form_types.length} 项`
                      : "—"
                },
                {
                  id: "usage",
                  label: "关联",
                  width: 100,
                  render: (item) =>
                    item.usage_count > 0 ? (
                      <Chip
                        color="primary"
                        label={`${item.usage_count} 个词条`}
                      />
                    ) : (
                      "无关联"
                    )
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
                          setFormOpen(true);
                        }}
                      >
                        修改
                      </Button>
                      <PermissionButton
                        color="error"
                        disabled={
                          !canDelete ||
                          item.usage_count > 0 ||
                          item.sub_part_count > 0 ||
                          (item.allowed_form_types?.length ?? 0) > 0
                        }
                        reason={
                          item.usage_count > 0
                            ? `已关联 ${item.usage_count} 个单词或短语，可以修改，但不能删除`
                            : item.sub_part_count > 0
                              ? `还有 ${item.sub_part_count} 项细分词性，请先删除细分词性`
                              : (item.allowed_form_types?.length ?? 0) > 0
                                ? `还有 ${item.allowed_form_types!.length} 项词形变化，请先删除词形变化`
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
          </Paper>
        </>
      ) : (
        <>
          {catalog.isError && (
            <Alert
              severity="error"
              action={
                <Button onClick={() => void catalog.refetch()}>重试</Button>
              }
            >
              基本词性目录加载失败
              <Typography>{catalog.error.message}</Typography>
            </Alert>
          )}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              useFlexGap
              flexWrap="wrap"
              spacing={1}
            >
              <Autocomplete
                options={parentOptions}
                value={
                  parentOptions.find(
                    (part) => part.id === (selectedPart?.id ?? "")
                  ) ?? null
                }
                getOptionLabel={(part) => part.name_zh}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                loading={catalog.isPending}
                disabled={catalog.isError || !parts.length}
                onChange={(_, part) => setSelectedPartId(part?.id ?? "")}
                sx={{ width: 220 }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="所属基本词性"
                    placeholder="请选择基本词性"
                  />
                )}
              />
              <PermissionButton
                variant="contained"
                disabled={!canEditSub || catalog.isError || !parts.length}
                reason={
                  !catalog.isError && !parts.length ? "暂无基本词性" : undefined
                }
                onClick={() => subPanelRef.current?.openCreate()}
              >
                新增细分词性
              </PermissionButton>
            </Stack>
          </Paper>
          <SubPartOfSpeechPanel
            ref={subPanelRef}
            parents={selectedPart ? [selectedPart] : parts}
            createParent={selectedPart}
            loading={catalog.isPending}
            onSaved={(text) => notify(text, "success")}
            onError={showError}
          />
        </>
      )}
      <PartOfSpeechFormModal
        open={formOpen}
        value={editing}
        kind={editing?.kind ?? kind}
        defaultSortOrder={defaultSortOrder}
        onClose={() => setFormOpen(false)}
        onSaved={(saved) => {
          if (editing) {
            notify("基本词性已更新", "success");
            return;
          }
          notify("基本词性已新增", "success");
          setSelectedPartId(saved.id);
          setActiveTab("detailed");
        }}
        onError={showError}
      />
      <ConfirmDialog
        open={!!deleting}
        title={`删除基本词性“${deleting?.name_zh ?? ""}”？`}
        confirmText="删除"
        danger
        pending={remove.isPending}
        onClose={() => setDeleting(undefined)}
        onConfirm={() => void removeItem()}
      >
        该操作不可恢复。
      </ConfirmDialog>
    </Stack>
  );
}
