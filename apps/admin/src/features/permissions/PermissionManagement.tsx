import { ListFilterBar } from "@/components/ListFilterBar";
import Add from "@mui/icons-material/Add";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Autocomplete,
  Box,
  Breadcrumbs,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { HttpError } from "@tsz/api-client";
import type { PermissionTag, UnifiedPermissionCatalog } from "@tsz/types";
import { CopyableText } from "@/components/CopyableText";
import { AdminDrawer } from "@/components/AdminDrawer";
import { AdminTable, AdminPagination } from "@/components/AdminTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DateRangeField } from "@/components/DateRangeField";
import type { DateRangeValue } from "@/components/DateRangeField";
import { useFeedback } from "@/components/FeedbackProvider";
import { api } from "@/lib/auth";
import { PermissionChangeDialog } from "./PermissionChangeDialog";
import { MODULE_LABELS } from "./labels";
import { PermissionTagChip } from "./PermissionTagChip";

const KIND_LABELS: Record<string, string> = {
  page: "页面",
  action: "操作",
  scope: "范围"
};
const RISK_LABELS: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高"
};
const TAG_COLORS = [
  { value: "default", label: "默认" },
  { value: "blue", label: "蓝色" },
  { value: "cyan", label: "青色" },
  { value: "green", label: "绿色" },
  { value: "gold", label: "黄色" },
  { value: "orange", label: "橙色" },
  { value: "red", label: "红色" },
  { value: "purple", label: "紫色" }
];

function SearchField({
  placeholder,
  onSearch
}: {
  placeholder: string;
  onSearch: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <ListFilterBar
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(value);
      }}
    >
      <TextField
        label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        sx={{ flex: "1 1 160px" }}
      />
      <Button type="submit" aria-label={`搜索${placeholder}`}>
        搜索
      </Button>
    </ListFilterBar>
  );
}
function GrantedAdmins({
  permissionKey,
  onClose
}: {
  permissionKey: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["permission-system", "granted", permissionKey, page],
    queryFn: () => api.permissionSystem.grantedAdmins(permissionKey, page)
  });
  return (
    <AdminDrawer width={640} title="管理员名单" onClose={onClose}>
      {query.isError && <Alert severity="error">{query.error.message}</Alert>}
      <AdminTable
        emptyMessage="暂无已授权管理员"
        rows={query.data?.items ?? []}
        rowId={(row) => row.admin_id}
        loading={query.isFetching}
        columns={[
          { id: "name", label: "管理员", render: (row) => row.display_name },
          {
            id: "id",
            label: "账号 ID",
            render: (row) => <CopyableText value={row.admin_id} />
          },
          {
            id: "version",
            label: "权限版本",
            render: (row) => row.permission_version
          }
        ]}
        pagination={{
          page,
          pageSize: 20,
          total: query.data?.total ?? 0,
          onChange: setPage
        }}
      />
    </AdminDrawer>
  );
}
function BatchTargets({
  catalog,
  keys,
  action,
  onClose
}: {
  catalog: UnifiedPermissionCatalog;
  keys: string[];
  action: "grant" | "revoke";
  onClose: () => void;
}) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const [filterResetKey, setFilterResetKey] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [adminNames, setAdminNames] = useState<Record<string, string>>({});
  const [previewing, setPreviewing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [page, search]);
  const query = useQuery({
    queryKey: ["permission-system", "targets", page, search],
    queryFn: () =>
      api.admins.list({
        role: "admin",
        display_name: search || undefined,
        page,
        page_size: 20
      })
  });
  return (
    <AdminDrawer
      width={760}
      title={
        action === "grant" ? "批量授权 · 选择管理员" : "撤销授权 · 选择管理员"
      }
      onClose={onClose}
      footer={
        <Stack spacing={1.5}>
          <AdminPagination
            page={page}
            pageSize={20}
            total={query.data?.pagination.total ?? 0}
            onChange={setPage}
          />
          <Stack
            direction="row"
            useFlexGap
            flexWrap="wrap"
            justifyContent="space-between"
            spacing={1}
          >
            <Typography>
              已选 {selected.length} 人（单次最多选择 100 人）
            </Typography>
            <Button
              variant="contained"
              disabled={!selected.length || selected.length > 100}
              onClick={() => setPreviewing(true)}
            >
              下一步：确认权限变更
            </Button>
          </Stack>
        </Stack>
      }
    >
      <Stack spacing={2} sx={{ height: "100%", minHeight: 0 }}>
        <Typography sx={{ maxHeight: "20%", overflowY: "auto", flexShrink: 0 }}>
          所选权限：
          {keys
            .map(
              (key) =>
                catalog.permissions.find((p) => p.key === key)?.label ?? key
            )
            .join("、")}
        </Typography>
        <SearchField
          key={filterResetKey}
          placeholder="搜索管理员名称"
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        {query.isError && <Alert severity="error">{query.error.message}</Alert>}
        <div
          ref={listRef}
          data-batch-admin-list
          style={{ overflow: "auto", flex: 1, minHeight: 0 }}
        >
          <AdminTable
            emptyMessage="暂无可选管理员"
            filtered={!!search.trim()}
            onResetFilters={() => {
              setSearch("");
              setPage(1);
              setFilterResetKey((key) => key + 1);
            }}
            rows={query.data?.items ?? []}
            rowId={(row) => row.id}
            loading={query.isFetching}
            selection={{
              ids: selected,
              disabled: (row) => row.role === "super_admin",
              onChange: (ids) => {
                setSelected(ids);
                setAdminNames((previous) => ({
                  ...previous,
                  ...Object.fromEntries(
                    (query.data?.items ?? []).map((admin) => [
                      admin.id,
                      admin.display_name
                    ])
                  )
                }));
              }
            }}
            columns={[
              {
                id: "name",
                label: "管理员",
                render: (row) => row.display_name
              },
              {
                id: "phone",
                label: "手机号",
                render: (row) =>
                  row.phone.length > 7
                    ? `${row.phone.slice(0, 3)}****${row.phone.slice(-4)}`
                    : "****"
              },
              {
                id: "status",
                label: "状态",
                render: (row) => (
                  <Chip
                    color={row.status === "active" ? "success" : "default"}
                    label={row.status === "active" ? "已启用" : "已禁用"}
                  />
                )
              }
            ]}
          />
        </div>
      </Stack>
      {previewing && (
        <PermissionChangeDialog
          catalogVersion={catalog.catalog_version}
          adminIds={selected}
          adminNames={adminNames}
          permissionLabels={Object.fromEntries(
            catalog.permissions.map((p) => [p.key, p.label])
          )}
          grant={action === "grant" ? keys : []}
          revoke={action === "revoke" ? keys : []}
          onClose={() => setPreviewing(false)}
          onCommitted={onClose}
        />
      )}
    </AdminDrawer>
  );
}
function PermissionAudits({ onClose }: { onClose: () => void }) {
  const [filterResetKey, setFilterResetKey] = useState(0);
  const [page, setPage] = useState(1),
    [adminId, setAdminId] = useState(""),
    [key, setKey] = useState("");
  const [dates, setDates] = useState<DateRangeValue>(null);
  const since = dates?.[0]?.startOf("day").toISOString(),
    until = dates?.[1]?.endOf("day").toISOString();
  const query = useQuery({
    queryKey: ["permission-system", "audits", page, adminId, key, since, until],
    queryFn: () =>
      api.permissionSystem.audits({
        page,
        page_size: 20,
        admin_id: adminId || undefined,
        permission_key: key || undefined,
        since,
        until
      })
  });
  return (
    <AdminDrawer width={960} title="权限与标签变更记录" onClose={onClose}>
      <ListFilterBar key={filterResetKey}>
        <SearchField
          placeholder="管理员 ID"
          onSearch={(value) => {
            setAdminId(value);
            setPage(1);
          }}
        />
        <SearchField
          placeholder="权限标识"
          onSearch={(value) => {
            setKey(value);
            setPage(1);
          }}
        />
        <DateRangeField
          size="small"
          className="list-filter-dates"
          value={dates}
          onChange={(value) => {
            setDates(value);
            setPage(1);
          }}
        />
      </ListFilterBar>
      {query.isError && <Alert severity="error">{query.error.message}</Alert>}
      <AdminTable
        emptyMessage="暂无变更记录"
        filtered={!!(adminId || key || dates)}
        onResetFilters={() => {
          setAdminId("");
          setKey("");
          setDates(null);
          setPage(1);
          setFilterResetKey((key) => key + 1);
        }}
        rows={query.data?.items ?? []}
        rowId={(row) => row.id}
        loading={query.isFetching}
        columns={[
          { id: "time", label: "时间", render: (row) => row.occurred_at },
          { id: "actor", label: "操作者", render: (row) => row.actor_admin_id },
          { id: "action", label: "操作", render: (row) => row.action },
          { id: "resource", label: "对象", render: (row) => row.resource_id },
          { id: "request", label: "请求", render: (row) => row.request_id },
          {
            id: "metadata",
            label: "调整内容",
            render: (row) => JSON.stringify(row.metadata)
          }
        ]}
        pagination={{
          page,
          pageSize: 20,
          total: query.data?.total ?? 0,
          onChange: setPage
        }}
      />
    </AdminDrawer>
  );
}

export function PermissionManagement() {
  const notify = useFeedback();
  const client = useQueryClient();
  const catalog = useQuery({
    queryKey: ["permission-system", "catalog"],
    queryFn: api.permissionSystem.catalog
  });
  const [search, setSearch] = useState("");
  const [module, setModule] = useState<string>();
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [batchAction, setBatchAction] = useState<"grant" | "revoke">();
  const [grantedKey, setGrantedKey] = useState<string>();
  const [managingTags, setManagingTags] = useState(false);
  const [tagTargetKey, setTagTargetKey] = useState<string>();
  const [tagSearch, setTagSearch] = useState("");
  const [pendingTagChange, setPendingTagChange] = useState<{
    tag: PermissionTag;
    keys: string[];
    checked: boolean;
  }>();
  const [editingTag, setEditingTag] = useState<PermissionTag | "new">();
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState("default");
  const [customColor, setCustomColor] = useState("#2053FF");
  const [deletingTag, setDeletingTag] = useState<PermissionTag>();
  const [busy, setBusy] = useState(false);
  const [audits, setAudits] = useState(false);
  const reload = () =>
    client.invalidateQueries({ queryKey: ["permission-system"] });
  const mutateTags = async (
    operation: () => Promise<unknown>,
    success: string
  ) => {
    setBusy(true);
    try {
      await operation();
      await reload();
      notify(success, "success");
      return true;
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        await reload();
        setPendingTagChange(undefined);
        const current = client.getQueryData<UnifiedPermissionCatalog>([
          "permission-system",
          "catalog"
        ]);
        const duplicateName = current?.tags.some(
          (tag) =>
            tag.name === tagName.trim() &&
            (editingTag === "new" || tag.id !== editingTag?.id)
        );
        const versionUnchanged =
          editingTag === "new" ||
          (editingTag &&
            current?.tags.find((tag) => tag.id === editingTag.id)?.version ===
              editingTag.version);
        if (editingTag && duplicateName && versionUnchanged) {
          notify("标签名称已存在，请使用其他名称", "warning");
        } else {
          setEditingTag(undefined);
          notify("标签已被更新，请重新查看后再保存", "warning");
        }
      } else if (error instanceof HttpError && error.status === 404) {
        await reload();
        setPendingTagChange(undefined);
        setEditingTag(undefined);
        notify("标签已被删除，请重新选择", "warning");
      } else {
        notify(error instanceof Error ? error.message : "操作失败", "error");
      }
      return false;
    } finally {
      setBusy(false);
    }
  };
  const permissionLabels = Object.fromEntries(
    (catalog.data?.permissions ?? []).map((p) => [p.key, p.label])
  );
  const tags = catalog.data?.tags ?? [];
  const tagTargets = tagTargetKey ? [tagTargetKey] : selected;
  const changeTagMembers = (
    tag: PermissionTag,
    keys: string[],
    checked: boolean
  ) => {
    if (!catalog.data || !keys.length) return Promise.resolve(false);
    const add = checked
      ? keys.filter((key) => !tag.permissions.includes(key))
      : [];
    const remove = checked
      ? []
      : keys.filter((key) => tag.permissions.includes(key));
    if (!add.length && !remove.length) return Promise.resolve(false);
    return mutateTags(
      () =>
        api.permissionSystem.changeTags({
          catalog_version: catalog.data!.catalog_version,
          targets: [
            { tag_id: tag.id, expected_version: tag.version, add, remove }
          ]
        }),
      checked ? "权限已加入标签" : "权限已从标签移除"
    );
  };
  const queueTagChange = (
    tag: PermissionTag,
    keys: string[],
    checked: boolean
  ) => {
    const changed = keys.some(
      (key) => tag.permissions.includes(key) !== checked
    );
    if (changed) setPendingTagChange({ tag, keys, checked });
  };
  const affectedTagKeys =
    pendingTagChange?.keys.filter(
      (key) =>
        pendingTagChange.tag.permissions.includes(key) !==
        pendingTagChange.checked
    ) ?? [];
  const rows = (catalog.data?.permissions ?? []).filter(
    (permission) =>
      (!module || module === permission.module_key) &&
      (!search ||
        `${permission.key} ${permission.label} ${permission.description}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (!tagFilter.length ||
        tags.some(
          (tag) =>
            tagFilter.includes(tag.id) &&
            tag.permissions.includes(permission.key)
        ))
  );
  const openTagManager = (permissionKey?: string) => {
    setTagTargetKey(permissionKey);
    setTagSearch("");
    setManagingTags(true);
  };
  const validTagColor =
    TAG_COLORS.some((color) => color.value === tagColor) ||
    /^#[0-9a-f]{6}$/i.test(tagColor);
  const saveTag = () => {
    if (!editingTag || busy || !tagName.trim() || !validTagColor) return;
    void mutateTags(
      () =>
        editingTag === "new"
          ? api.permissionSystem.createTag(tagName.trim(), tagColor)
          : api.permissionSystem.updateTag(
              editingTag.id,
              tagName.trim(),
              tagColor,
              editingTag.version
            ),
      "标签已保存"
    ).then((ok) => {
      if (ok) setEditingTag(undefined);
    });
  };
  return (
    <Stack spacing={2}>
      <Breadcrumbs>
        <Typography>用户管理</Typography>
        <Typography>权限管理</Typography>
      </Breadcrumbs>
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <ListFilterBar>
          <TextField
            label="关键词"
            placeholder="权限名称 / 说明"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <TextField
            select
            label="所属板块"
            slotProps={{
              select: {
                displayEmpty: true,
                renderValue: (value) =>
                  value
                    ? (MODULE_LABELS[String(value)] ?? String(value))
                    : "全部"
              },
              inputLabel: { shrink: true }
            }}
            value={module ?? ""}
            onChange={(event) => setModule(event.target.value || undefined)}
          >
            <MenuItem value="">全部</MenuItem>
            {[
              ...new Set(
                catalog.data?.permissions.map((p) => p.module_key) ?? []
              )
            ].map((value) => (
              <MenuItem key={value} value={value}>
                {MODULE_LABELS[value] ?? value}
              </MenuItem>
            ))}
          </TextField>
          <Autocomplete
            fullWidth
            size="small"
            multiple
            limitTags={1}
            sx={{
              "& .MuiAutocomplete-inputRoot": { flexWrap: "nowrap" },
              "& .MuiAutocomplete-tag": { minWidth: 0 },
              "& .MuiAutocomplete-inputRoot .MuiAutocomplete-input": {
                minWidth: 30
              }
            }}
            options={tags}
            value={tags.filter((tag) => tagFilter.includes(tag.id))}
            getOptionLabel={(tag) => tag.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, values) => setTagFilter(values.map((tag) => tag.id))}
            renderInput={(params) => (
              <TextField {...params} label="权限标签" placeholder="全部" />
            )}
          />
          <Button
            onClick={() => {
              setSearch("");
              setModule(undefined);
              setTagFilter([]);
            }}
          >
            重置
          </Button>
        </ListFilterBar>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          useFlexGap
          flexWrap="wrap"
          spacing={1}
          sx={{ mb: 1.5 }}
        >
          <Stack
            direction="row"
            useFlexGap
            flexWrap="wrap"
            spacing={1}
            alignItems="center"
          >
            <Typography color="text.secondary">
              已选 {selected.length} 项
            </Typography>
            <Button
              variant="contained"
              disabled={!selected.length}
              onClick={() => setBatchAction("grant")}
            >
              批量授权
            </Button>
            <Button
              color="error"
              disabled={!selected.length}
              onClick={() => setBatchAction("revoke")}
            >
              撤销授权
            </Button>
            <Button onClick={() => openTagManager()}>标签管理</Button>
          </Stack>
          <Button onClick={() => setAudits(true)}>变更记录</Button>
        </Stack>
        {catalog.isError && (
          <Alert
            severity="error"
            action={
              <Button onClick={() => void catalog.refetch()}>重试</Button>
            }
          >
            权限列表加载失败<Typography>{catalog.error.message}</Typography>
          </Alert>
        )}
        <AdminTable
          emptyMessage="暂无权限"
          filtered={!!(search.trim() || module || tagFilter.length)}
          onResetFilters={() => {
            setSearch("");
            setModule(undefined);
            setTagFilter([]);
          }}
          rows={rows}
          rowId={(row) => row.key}
          loading={catalog.isFetching}
          minWidth={1480}
          selection={{ ids: selected, onChange: setSelected }}
          columns={[
            {
              id: "label",
              label: "权限名称",
              width: 220,
              sticky: "left",
              render: (p) => p.label
            },
            {
              id: "description",
              label: "详细说明",
              width: 340,
              render: (p) => p.description
            },
            {
              id: "module",
              label: "所属板块",
              width: 140,
              render: (p) => (
                <>
                  <div>{MODULE_LABELS[p.module_key] ?? p.module_key}</div>
                  <Typography variant="caption" color="text.secondary">
                    {KIND_LABELS[p.kind] ?? p.kind}
                  </Typography>
                </>
              )
            },
            {
              id: "requires",
              label: "前置权限",
              width: 240,
              render: (p) => (
                <span title={p.requires.join("、")}>
                  {p.requires
                    .map((key) => permissionLabels[key] ?? key)
                    .join("、") || "无"}
                </span>
              )
            },
            {
              id: "risk",
              label: "风险",
              width: 80,
              render: (p) => (
                <Chip
                  label={RISK_LABELS[p.risk_level] ?? p.risk_level}
                  color={
                    p.risk_level === "high"
                      ? "error"
                      : p.risk_level === "medium"
                        ? "warning"
                        : "success"
                  }
                />
              )
            },
            {
              id: "tags",
              label: "标签",
              width: 260,
              render: (p) => {
                const rowTags = tags.filter((tag) =>
                  tag.permissions.includes(p.key)
                );
                const ordered = [
                  ...rowTags.filter((tag) => tagFilter.includes(tag.id)),
                  ...rowTags.filter((tag) => !tagFilter.includes(tag.id))
                ];
                const visible = ordered.slice(0, 2),
                  remaining = ordered.slice(2);
                return (
                  <Stack
                    direction="row"
                    spacing={0.5}
                    alignItems="center"
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    {visible.map((tag) => (
                      <Box
                        key={tag.id}
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          minWidth: 0,
                          maxWidth: visible.length === 2 ? 94 : 180
                        }}
                      >
                        <PermissionTagChip tag={tag} />
                        <IconButton
                          size="small"
                          aria-label={`从${tag.name}移除${p.label}`}
                          title={`仅从“${p.label}”移除“${tag.name}”标签`}
                          disabled={busy}
                          onClick={() => queueTagChange(tag, [p.key], false)}
                        >
                          ×
                        </IconButton>
                      </Box>
                    ))}
                    {remaining.length ? (
                      <Button
                        aria-label={`查看${p.label}其余${remaining.length}个标签`}
                        title={remaining.map((tag) => tag.name).join("、")}
                        disabled={busy}
                        onClick={() => openTagManager(p.key)}
                      >
                        +{remaining.length}
                      </Button>
                    ) : (
                      <IconButton
                        size="small"
                        aria-label={`设置${p.label}标签`}
                        title={`设置${p.label}标签`}
                        disabled={busy}
                        onClick={() => openTagManager(p.key)}
                      >
                        <Add fontSize="inherit" />
                      </IconButton>
                    )}
                  </Stack>
                );
              }
            },
            {
              id: "admins",
              label: "已授权管理员",
              width: 160,
              render: (p) => (
                <Button onClick={() => setGrantedKey(p.key)}>查看管理员</Button>
              )
            }
          ]}
        />
      </Paper>
      {managingTags && (
        <AdminDrawer
          width={640}
          title="标签管理"
          onClose={() => {
            if (!busy) {
              setManagingTags(false);
              setTagTargetKey(undefined);
            }
          }}
        >
          <Stack spacing={2}>
            <Typography color="text.secondary">
              标签仅用于权限分类，不影响管理员授权。
            </Typography>
            {!!tagTargets.length && (
              <Stack direction="row" justifyContent="space-between">
                <Typography fontWeight={600}>
                  {tagTargetKey
                    ? `设置标签 · ${permissionLabels[tagTargetKey] ?? tagTargetKey}`
                    : `已选 ${selected.length} 项权限`}
                </Typography>
                <Typography color="text.secondary">勾选后确认</Typography>
              </Stack>
            )}
            <Stack direction="row" justifyContent="space-between">
              <Typography fontWeight={600}>标签列表</Typography>
              <Button
                variant="contained"
                disabled={busy}
                onClick={() => {
                  setEditingTag("new");
                  setTagName("");
                  setTagColor("default");
                  setCustomColor("#2053FF");
                }}
              >
                新建标签
              </Button>
            </Stack>
            <TextField
              label="搜索标签"
              placeholder="搜索标签"
              value={tagSearch}
              onChange={(event) => setTagSearch(event.target.value)}
            />
            <AdminTable
              emptyMessage="暂无标签"
              filtered={!!tagSearch.trim()}
              onResetFilters={() => setTagSearch("")}
              rows={tags.filter((tag) =>
                tag.name.toLowerCase().includes(tagSearch.trim().toLowerCase())
              )}
              rowId={(tag) => tag.id}
              columns={[
                {
                  id: "name",
                  label: "标签名称",
                  render: (tag) => {
                    const matched = tagTargets.filter((key) =>
                      tag.permissions.includes(key)
                    ).length;
                    return tagTargets.length ? (
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={matched === tagTargets.length}
                            indeterminate={
                              matched > 0 && matched < tagTargets.length
                            }
                            slotProps={{
                              input: {
                                "aria-checked":
                                  matched > 0 && matched < tagTargets.length
                                    ? "mixed"
                                    : matched === tagTargets.length
                              }
                            }}
                            disabled={busy}
                            onChange={(event) =>
                              queueTagChange(
                                tag,
                                tagTargets,
                                event.target.checked
                              )
                            }
                          />
                        }
                        label={
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                          >
                            <PermissionTagChip tag={tag} />
                            {tagTargets.length > 1 && (
                              <Typography variant="caption">
                                {matched}/{tagTargets.length}
                              </Typography>
                            )}
                          </Stack>
                        }
                      />
                    ) : (
                      <PermissionTagChip tag={tag} />
                    );
                  }
                },
                {
                  id: "actions",
                  label: "操作",
                  width: 160,
                  render: (tag) => (
                    <Stack direction="row" spacing={0.5}>
                      <Button
                        disabled={busy}
                        onClick={() => {
                          setEditingTag(tag);
                          setTagName(tag.name);
                          setTagColor(tag.color ?? "default");
                          setCustomColor(
                            tag.color?.startsWith("#") ? tag.color : "#2053FF"
                          );
                        }}
                      >
                        编辑
                      </Button>
                      <Button
                        color="error"
                        disabled={busy}
                        onClick={() => setDeletingTag(tag)}
                      >
                        删除
                      </Button>
                    </Stack>
                  )
                }
              ]}
            />
            {!tags.length && (
              <Typography color="text.secondary">
                暂无标签，可点击“新建标签”添加。
              </Typography>
            )}
          </Stack>
        </AdminDrawer>
      )}
      <ConfirmDialog
        open={!!pendingTagChange}
        title={pendingTagChange?.checked ? "确认添加至标签" : "确认从标签移除"}
        confirmText={pendingTagChange?.checked ? "确认添加" : "确认移除"}
        danger={!pendingTagChange?.checked}
        pending={busy}
        onClose={() => setPendingTagChange(undefined)}
        onConfirm={() => {
          if (!pendingTagChange || busy) return;
          void changeTagMembers(
            pendingTagChange.tag,
            pendingTagChange.keys,
            pendingTagChange.checked
          ).then((ok) => {
            if (ok) setPendingTagChange(undefined);
          });
        }}
      >
        {pendingTagChange && (
          <Typography>
            将
            {affectedTagKeys.length === 1
              ? `“${permissionLabels[affectedTagKeys[0]!] ?? affectedTagKeys[0]}”`
              : `${affectedTagKeys.length} 项权限`}
            {pendingTagChange.checked ? "添加至" : "从"}“
            {pendingTagChange.tag.name}”标签
            {pendingTagChange.checked ? "" : "移除"}？
          </Typography>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!deletingTag}
        title="删除标签？管理员已分配的权限不受影响。"
        confirmText="删除"
        danger
        pending={busy}
        onClose={() => setDeletingTag(undefined)}
        onConfirm={() => {
          if (!deletingTag || busy) return;
          void mutateTags(
            () =>
              api.permissionSystem.deleteTag(
                deletingTag.id,
                deletingTag.version
              ),
            "标签已删除，管理员权限未改变"
          ).then((ok) => {
            if (ok) setDeletingTag(undefined);
          });
        }}
      >
        确认删除“{deletingTag?.name}”标签？
      </ConfirmDialog>
      <Dialog
        open={!!editingTag}
        onClose={() => {
          if (!busy) setEditingTag(undefined);
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="edit-tag-title"
      >
        <DialogTitle id="edit-tag-title">
          {editingTag === "new" ? "新建标签" : "编辑标签"}
        </DialogTitle>
        <DialogContent>
          <Stack
            component="form"
            id="edit-tag-form"
            spacing={2}
            sx={{ mt: 1 }}
            onSubmit={(event) => {
              event.preventDefault();
              saveTag();
            }}
          >
            <TextField
              label="标签名称"
              placeholder="标签名称"
              value={tagName}
              disabled={busy}
              onChange={(event) => setTagName(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 50 } }}
            />
            <Typography>标签颜色</Typography>
            <RadioGroup
              aria-label="标签颜色"
              value={
                TAG_COLORS.some((color) => color.value === tagColor)
                  ? tagColor
                  : "custom"
              }
              onChange={(event) =>
                setTagColor(
                  event.target.value === "custom"
                    ? customColor
                    : event.target.value
                )
              }
            >
              <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
                {TAG_COLORS.map((color) => (
                  <FormControlLabel
                    key={color.value}
                    value={color.value}
                    disabled={busy}
                    control={<Radio />}
                    label={
                      <PermissionTagChip
                        tag={{ name: color.label, color: color.value }}
                      />
                    }
                  />
                ))}
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <FormControlLabel
                  value="custom"
                  control={<Radio />}
                  disabled={busy}
                  label="自定义"
                />
                <TextField
                  label="自定义颜色"
                  value={customColor}
                  disabled={busy}
                  error={!/^#[0-9a-f]{6}$/i.test(customColor)}
                  helperText={
                    !/^#[0-9a-f]{6}$/i.test(customColor)
                      ? "请输入 #RRGGBB 颜色"
                      : undefined
                  }
                  onChange={(event) => {
                    setCustomColor(event.target.value);
                    setTagColor(event.target.value);
                  }}
                />
                <input
                  type="color"
                  aria-label="颜色色盘"
                  value={
                    /^#[0-9a-f]{6}$/i.test(customColor)
                      ? customColor
                      : "#2053FF"
                  }
                  disabled={busy}
                  onChange={(event) => {
                    setCustomColor(event.target.value.toUpperCase());
                    setTagColor(event.target.value.toUpperCase());
                  }}
                />
              </Stack>
            </RadioGroup>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setEditingTag(undefined)}>
            取消
          </Button>
          <Button
            type="submit"
            form="edit-tag-form"
            variant="contained"
            loading={busy}
            disabled={!tagName.trim() || !validTagColor}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>
      {batchAction && catalog.data && (
        <BatchTargets
          catalog={catalog.data}
          keys={selected}
          action={batchAction}
          onClose={() => setBatchAction(undefined)}
        />
      )}
      {grantedKey && (
        <GrantedAdmins
          permissionKey={grantedKey}
          onClose={() => setGrantedKey(undefined)}
        />
      )}
      {audits && <PermissionAudits onClose={() => setAudits(false)} />}
    </Stack>
  );
}
