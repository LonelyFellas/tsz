import Add from "@mui/icons-material/Add";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { AdminDrawer } from "@/components/AdminDrawer";
import { useState } from "react";
import type { AdminPermissions, UnifiedPermissionCatalog } from "@tsz/types";
import { api } from "@/lib/auth";
import { PermissionChangeDialog } from "./PermissionChangeDialog";
import { MODULE_LABELS } from "./labels";
import { PermissionTagChip } from "./PermissionTagChip";

function PermissionSelection({
  snapshot,
  catalog,
  displayName,
  onClose
}: {
  snapshot: AdminPermissions;
  catalog: UnifiedPermissionCatalog;
  displayName: string;
  onClose: () => void;
}) {
  const labels = Object.fromEntries(
    catalog.permissions.map((p) => [p.key, p.label])
  );
  const modules = [...new Set(catalog.permissions.map((p) => p.module_key))];
  const [selected, setSelected] = useState<string[]>(snapshot.permissions);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTagIds, setPickerTagIds] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [activeModule, setActiveModule] = useState(
    modules.find((module) =>
      catalog.permissions.some(
        (permission) =>
          permission.module_key === module &&
          snapshot.permissions.includes(permission.key)
      )
    ) ??
      modules[0] ??
      ""
  );
  const [previewing, setPreviewing] = useState(false);
  const activePermissions = catalog.permissions.filter(
    (permission) => permission.module_key === activeModule
  );
  const availableTags = catalog.tags.filter(
    (tag) => tag.permissions.length > 0
  );
  const selectedTags = availableTags.filter((tag) =>
    selectedTagIds.includes(tag.id)
  );
  const applyTagSelection = (nextTagIds: string[]) => {
    const removedKeys = new Set(
      selectedTags
        .filter((tag) => !nextTagIds.includes(tag.id))
        .flatMap((tag) => tag.permissions)
    );
    const retainedKeys = availableTags
      .filter((tag) => nextTagIds.includes(tag.id))
      .flatMap((tag) => tag.permissions);
    setSelected((current) => [
      ...new Set([
        ...current.filter((key) => !removedKeys.has(key)),
        ...retainedKeys
      ])
    ]);
    setSelectedTagIds(nextTagIds);
  };
  const grant = selected.filter((key) => !snapshot.permissions.includes(key));
  const revoke = snapshot.permissions.filter((key) => !selected.includes(key));
  const confirmTags = () => {
    const firstAdded = availableTags.find(
      (tag) => pickerTagIds.includes(tag.id) && !selectedTagIds.includes(tag.id)
    );
    if (firstAdded) {
      const focusKey =
        firstAdded.permissions.find((key) => !selected.includes(key)) ??
        firstAdded.permissions[0];
      setActiveModule(
        catalog.permissions.find((permission) => permission.key === focusKey)
          ?.module_key ?? activeModule
      );
    }
    applyTagSelection(pickerTagIds);
    setPickerOpen(false);
  };
  return (
    <Stack spacing={2} sx={{ height: "100%", minHeight: 0 }}>
      <Stack direction="row" justifyContent="space-between">
        <div>
          <Typography variant="caption" color="text.secondary">
            授权对象
          </Typography>
          <Typography fontWeight={600}>{displayName}</Typography>
        </div>
        <div>
          <Typography variant="caption" color="text.secondary">
            已选权限
          </Typography>
          <Typography>
            {selected.length} / {catalog.permissions.length}
          </Typography>
        </div>
      </Stack>
      <Box
        sx={{
          p: 1.5,
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: "action.hover"
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography fontWeight={600}>权限标签</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="caption">
              已选 {selectedTags.length} 项
            </Typography>
            <Button
              aria-label="标签池"
              startIcon={<Add />}
              disabled={!availableTags.length}
              onClick={() => {
                setPickerTagIds(selectedTagIds);
                setTagSearch("");
                setPickerOpen(true);
              }}
            >
              标签池
            </Button>
          </Stack>
        </Stack>
        <Stack
          direction="row"
          useFlexGap
          flexWrap="wrap"
          spacing={0.75}
          role="group"
          aria-label="已选权限标签"
          sx={{ maxHeight: 96, overflowY: "auto" }}
        >
          {!selectedTags.length ? (
            <Typography variant="caption" color="text.secondary">
              {!availableTags.length ? "暂无可用标签" : "未选择标签"}
            </Typography>
          ) : (
            selectedTags.map((tag) => (
              <PermissionTagChip
                key={tag.id}
                tag={tag}
                onClick={() =>
                  setActiveModule(
                    catalog.permissions.find(
                      (permission) => permission.key === tag.permissions[0]
                    )?.module_key ?? activeModule
                  )
                }
                onDelete={() =>
                  applyTagSelection(
                    selectedTagIds.filter((id) => id !== tag.id)
                  )
                }
              />
            ))
          )}
        </Stack>
      </Box>
      <Typography fontWeight={600}>权限项</Typography>
      <Stack
        direction="row"
        sx={{
          flex: 1,
          minHeight: 220,
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          overflow: "hidden"
        }}
      >
        <Stack
          spacing={0.5}
          role="group"
          aria-label="权限模块"
          sx={{
            width: 184,
            flexShrink: 0,
            p: 1,
            overflowY: "auto",
            bgcolor: "action.hover"
          }}
        >
          {modules.map((module) => {
            const permissions = catalog.permissions.filter(
              (permission) => permission.module_key === module
            );
            const count = permissions.filter((permission) =>
              selected.includes(permission.key)
            ).length;
            return (
              <Button
                key={module}
                fullWidth
                variant={activeModule === module ? "contained" : "text"}
                aria-pressed={activeModule === module}
                onClick={() => setActiveModule(module)}
                sx={{
                  textAlign: "left",
                  minHeight: 40,
                  justifyContent: "space-between"
                }}
              >
                <span>{MODULE_LABELS[module] ?? module}</span>
                <span>
                  {count}/{permissions.length}
                </span>
              </Button>
            );
          })}
        </Stack>
        <Box
          role="region"
          aria-label="权限明细"
          sx={{ flex: 1, minWidth: 0, px: 2, py: 2, overflowY: "auto" }}
        >
          <Stack direction="row" justifyContent="space-between">
            <Typography fontWeight={600}>
              {MODULE_LABELS[activeModule] ?? activeModule}
            </Typography>
            <Typography color="text.secondary">
              已选{" "}
              {
                activePermissions.filter((permission) =>
                  selected.includes(permission.key)
                ).length
              }{" "}
              / {activePermissions.length} 项
            </Typography>
          </Stack>
          <Divider sx={{ my: 1.5 }} />
          {activePermissions.map((permission) => (
            <FormControlLabel
              key={permission.key}
              sx={{
                width: "100%",
                alignItems: "flex-start",
                py: 1,
                m: 0,
                borderBottom: 1,
                borderColor: "divider"
              }}
              control={
                <Checkbox
                  checked={selected.includes(permission.key)}
                  onChange={(event) => {
                    setSelected((current) =>
                      event.target.checked
                        ? [...new Set([...current, permission.key])]
                        : current.filter((key) => key !== permission.key)
                    );
                    if (!event.target.checked)
                      setSelectedTagIds((current) =>
                        current.filter(
                          (id) =>
                            !availableTags
                              .find((tag) => tag.id === id)
                              ?.permissions.includes(permission.key)
                        )
                      );
                  }}
                />
              }
              label={
                <Stack spacing={0.5}>
                  <Typography>{permission.label}</Typography>
                  {permission.description !== permission.label && (
                    <Typography color="text.secondary">
                      {permission.description}
                    </Typography>
                  )}
                  {permission.requires.length > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      前置权限：
                      {permission.requires
                        .map((key) => labels[key] ?? key)
                        .join("、")}
                    </Typography>
                  )}
                </Stack>
              }
            />
          ))}
        </Box>
      </Stack>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        useFlexGap
        flexWrap="wrap"
        spacing={1.5}
        sx={{ borderTop: 1, borderColor: "divider", pt: 2 }}
      >
        <div>
          <Typography fontWeight={600}>待提交变更</Typography>
          <Typography variant="caption" color="text.secondary">
            {grant.length || revoke.length
              ? `开通 ${grant.length} 项 · 取消 ${revoke.length} 项`
              : "无变更"}
          </Typography>
        </div>
        <Button
          variant="contained"
          disabled={!grant.length && !revoke.length}
          onClick={() => setPreviewing(true)}
        >
          预览变更
        </Button>
      </Stack>
      <Dialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="tag-picker-title"
      >
        <DialogTitle id="tag-picker-title">标签池</DialogTitle>
        <DialogContent>
          <TextField
            label="搜索标签"
            placeholder="搜索标签"
            fullWidth
            value={tagSearch}
            onChange={(event) => setTagSearch(event.target.value)}
            sx={{ my: 1 }}
          />
          <Stack
            role="group"
            aria-label="可用标签"
            sx={{ maxHeight: 360, overflowY: "auto" }}
          >
            {availableTags
              .filter((tag) => tag.name.includes(tagSearch.trim()))
              .map((tag) => (
                <FormControlLabel
                  key={tag.id}
                  control={
                    <Checkbox
                      slotProps={{
                        input: {
                          "aria-label": `${tag.name}，${tag.permissions.length} 项权限`
                        }
                      }}
                      checked={pickerTagIds.includes(tag.id)}
                      onChange={(event) =>
                        setPickerTagIds((current) =>
                          event.target.checked
                            ? [...current, tag.id]
                            : current.filter((id) => id !== tag.id)
                        )
                      }
                    />
                  }
                  label={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <PermissionTagChip tag={tag} />
                      <Typography variant="caption">
                        {tag.permissions.length} 项权限
                      </Typography>
                    </Stack>
                  }
                />
              ))}
            {!availableTags.some((tag) =>
              tag.name.includes(tagSearch.trim())
            ) && <Typography color="text.secondary">无匹配标签</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPickerOpen(false)}>取消</Button>
          <Button
            variant="contained"
            disabled={
              pickerTagIds.length === selectedTagIds.length &&
              pickerTagIds.every((id) => selectedTagIds.includes(id))
            }
            onClick={confirmTags}
          >
            确认选择
          </Button>
        </DialogActions>
      </Dialog>
      {previewing && (
        <PermissionChangeDialog
          catalogVersion={catalog.catalog_version}
          adminIds={[snapshot.admin_id]}
          adminNames={{ [snapshot.admin_id]: displayName }}
          permissionLabels={labels}
          expectedVersions={{
            [snapshot.admin_id]: snapshot.permission_version
          }}
          grant={grant}
          revoke={revoke}
          onClose={() => setPreviewing(false)}
          onCommitted={onClose}
        />
      )}
    </Stack>
  );
}

export function AdminPermissionEditor({
  adminId,
  displayName,
  onClose
}: {
  adminId: string;
  displayName: string;
  onClose: () => void;
}) {
  const catalog = useQuery({
    queryKey: ["permission-system", "catalog"],
    queryFn: api.permissionSystem.catalog
  });
  const snapshot = useQuery({
    queryKey: ["permission-system", "admin", adminId],
    queryFn: () => api.permissionSystem.forAdmin(adminId)
  });
  return (
    <AdminDrawer width={720} title="权限配置" onClose={onClose}>
      {catalog.isPending || snapshot.isPending ? (
        <CircularProgress size={24} />
      ) : catalog.isError || snapshot.isError ? (
        <Alert
          severity="error"
          action={
            <Button
              onClick={() => {
                void catalog.refetch();
                void snapshot.refetch();
              }}
            >
              重试
            </Button>
          }
        >
          无法读取权限
        </Alert>
      ) : (
        <PermissionSelection
          key={`${snapshot.data.permission_version}:${catalog.data.catalog_version}`}
          snapshot={snapshot.data}
          catalog={catalog.data}
          displayName={displayName}
          onClose={onClose}
        />
      )}
    </AdminDrawer>
  );
}
