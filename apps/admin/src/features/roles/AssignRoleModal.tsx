import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField
} from "@mui/material";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import type { AdminRole } from "@tsz/types";
import { useFeedback } from "@/components/FeedbackProvider";
import { useAdminList } from "@/features/admins/api";
import { useSetAdminRole } from "./api";
import { roleMutationError } from "./labels";
const CLEAR_ROLE = "__clear__";
interface FormValues {
  adminId: string;
  roleId: string;
}
export function AssignRoleModal({
  open,
  roles,
  onClose
}: {
  open: boolean;
  roles: AdminRole[];
  onClose: () => void;
}) {
  const notify = useFeedback();
  const {
    control,
    reset,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormValues>({ defaultValues: { adminId: "", roleId: "" } });
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);
  const adminList = useAdminList({ role: "admin", page_size: 100 });
  const setAdminRole = useSetAdminRole();
  const adminOptions = (adminList.data?.items ?? []).map((a) => ({
    value: a.id,
    label: `${a.display_name}（${a.phone}）`
  }));
  const roleOptions = [
    { value: CLEAR_ROLE, label: "收回角色（降为仅首页）" },
    ...roles.map((r) => ({
      value: r.id,
      label: r.is_system ? `${r.name}（系统）` : r.name
    }))
  ];
  const pending = isSubmitting || setAdminRole.isPending;
  return (
    <Dialog
      open={open}
      fullWidth
      maxWidth="sm"
      aria-labelledby="assign-role-title"
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <DialogTitle id="assign-role-title">指派角色</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          后台不记录管理员当前所属角色，此处为单向操作：选定后把该管理员设为所选角色，或收回为仅首页。被改管理员的菜单在其下次进入后台时生效。
        </Alert>
        <Stack
          component="form"
          id="assign-role-form"
          spacing={2}
          onSubmit={handleSubmit(async (values) => {
            if (setAdminRole.isPending) return;
            const roleId = values.roleId === CLEAR_ROLE ? null : values.roleId;
            try {
              await setAdminRole.mutateAsync({
                adminId: values.adminId,
                roleId
              });
              notify(roleId === null ? "已收回角色" : "已指派角色", "success");
              onClose();
            } catch (err) {
              notify(roleMutationError(err, "指派失败"), "error");
            }
          })}
        >
          <Controller
            name="adminId"
            control={control}
            rules={{ required: "请选择管理员" }}
            render={({ field, fieldState }) => (
              <Autocomplete
                options={adminOptions}
                value={
                  adminOptions.find((option) => option.value === field.value) ??
                  null
                }
                onChange={(_, next) => field.onChange(next?.value ?? "")}
                disabled={pending}
                loading={adminList.isPending}
                noOptionsText={
                  adminList.isPending ? "加载中..." : "暂无普通管理员"
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="管理员"
                    placeholder="选择一名普通管理员"
                    inputRef={field.ref}
                    onBlur={field.onBlur}
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                  />
                )}
              />
            )}
          />
          <Controller
            name="roleId"
            control={control}
            rules={{ required: "请选择角色或收回" }}
            render={({ field, fieldState }) => (
              <Autocomplete
                options={roleOptions}
                value={
                  roleOptions.find((option) => option.value === field.value) ??
                  null
                }
                onChange={(_, next) => field.onChange(next?.value ?? "")}
                disabled={pending}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="角色"
                    placeholder="设为某角色，或收回"
                    inputRef={field.ref}
                    onBlur={field.onBlur}
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                  />
                )}
              />
            )}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={pending} onClick={onClose}>
          取消
        </Button>
        <Button
          type="submit"
          form="assign-role-form"
          variant="contained"
          loading={pending}
        >
          指派
        </Button>
      </DialogActions>
    </Dialog>
  );
}
