// 建 / 改角色弹窗（super_admin）：角色名 + 描述 + 权限勾选框（从 GET /admin/permissions 拉，
// 按目录=侧栏顺序渲染，对角色已有集合打勾）。权限集提交即「全量替换」：把当前勾中的完整数组
// 塞 permissions（编辑时也照发，等价于按现状替换）。校验对齐 §3/§4：名称 1–50、无 < >/控制字符。
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useFeedback } from "@/components/FeedbackProvider";
import type { AdminRole, CreateRoleRequest, PermissionKey } from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import {
  useCreateRole,
  useInvalidateRoles,
  usePermissionCatalog,
  useUpdateRole
} from "./api";
import {
  isPermissionLanded,
  isUnknownPermissionKeyError,
  ROLE_DESC_MAX,
  ROLE_NAME_MAX,
  roleMutationError,
  validateRoleName
} from "./labels";

interface FormValues {
  name: string;
  description?: string;
  permissions?: PermissionKey[];
}

interface Props {
  open: boolean;
  /** null = 新建；否则编辑该角色。系统角色不进此弹窗（列表入口已置灰）。 */
  role: AdminRole | null;
  onClose: () => void;
}

export function RoleFormModal({ open, role, onClose }: Props) {
  const notify = useFeedback();
  const {
    register,
    control,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    defaultValues: { name: "", description: "", permissions: [] }
  });
  const catalog = usePermissionCatalog();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const invalidate = useInvalidateRoles();

  const isEdit = role !== null;
  const items = catalog.data?.permissions ?? [];

  // 打开时把表单灌成「新建=空 / 编辑=该角色现状」。用 effect 而非 Modal.afterOpenChange：
  // 后者依赖开场动画的 transitionend，在 jsdom（无动画）里不触发，会导致编辑态回填落空。
  useEffect(() => {
    if (open) {
      reset({
        name: role?.name ?? "",
        description: role?.description ?? "",
        permissions: role?.permissions ?? []
      });
    }
  }, [open, role, reset]);

  const submit = handleSubmit(async (values) => {
    if (createRole.isPending || updateRole.isPending) return;
    const input: CreateRoleRequest = {
      name: values.name.trim(),
      description: values.description?.trim() ?? "",
      // 全量替换：直接把当前勾中的完整数组塞 permissions（空数组 = 仅首页）。
      permissions: values.permissions ?? []
    };
    try {
      if (role) await updateRole.mutateAsync({ id: role.id, input });
      else await createRole.mutateAsync(input);
      notify(isEdit ? "已保存" : "角色已创建", "success");
      onClose();
    } catch (err) {
      // 409 = 大小写不敏感重名：高亮名称输入框（§3/§4）。
      if (err instanceof HttpError && err.status === 409) {
        setError("name", { message: "角色名已存在" });
        return;
      }
      // 唯一可据 code 精确处理的 400：勾了目录外 key → 提示并重拉目录（§3）。
      if (isUnknownPermissionKeyError(err)) {
        notify("有权限项已失效，请刷新权限目录后重试", "error");
        void catalog.refetch();
        return;
      }
      // 其余 400（名称非法等）：一律展示后端 error 原文并停留重填，不匹配英文文案（§3）。
      if (err instanceof HttpError && err.status === 400) {
        notify(err.message || "参数不合法", "error");
        return;
      }
      // 403（系统角色/非超管）/ 404（并发删）/ 网络等：提示并关闭；404 时刷新列表。
      notify(roleMutationError(err, "保存失败"), "error");
      if (err instanceof HttpError && err.status === 404) invalidate();
      onClose();
    }
  });

  const pending = isSubmitting || createRole.isPending || updateRole.isPending;
  return (
    <Dialog
      open={open}
      fullWidth
      maxWidth="sm"
      aria-labelledby="role-form-title"
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <DialogTitle id="role-form-title">
        {isEdit ? `编辑角色：${role.name}` : "新建角色"}
      </DialogTitle>
      <DialogContent>
        <Stack
          component="form"
          id="role-form"
          spacing={2}
          sx={{ mt: 1 }}
          onSubmit={submit}
        >
          <TextField
            label="角色名"
            placeholder="如：词库管理员"
            disabled={pending}
            error={!!errors.name}
            helperText={errors.name?.message}
            slotProps={{ htmlInput: { maxLength: ROLE_NAME_MAX } }}
            {...register("name", {
              validate: (value) =>
                !value.trim() ? "请输入角色名" : validateRoleName(value) || true
            })}
          />
          <TextField
            label="描述（可选）"
            placeholder="这个角色能做什么"
            multiline
            minRows={2}
            maxRows={4}
            disabled={pending}
            error={!!errors.description}
            helperText={errors.description?.message}
            slotProps={{ htmlInput: { maxLength: ROLE_DESC_MAX } }}
            {...register("description", {
              maxLength: {
                value: ROLE_DESC_MAX,
                message: `最长 ${ROLE_DESC_MAX} 字符`
              }
            })}
          />
          <Typography>菜单权限</Typography>
          <Typography variant="caption" color="text.secondary">
            勾选该角色可访问的后台菜单；不勾任何项 =
            仅可见首页。「未上线」项可先勾选，对应菜单落地前仍为置灰。
          </Typography>
          {catalog.isPending ? (
            <CircularProgress size={24} />
          ) : catalog.isError ? (
            <Alert
              severity="error"
              action={
                <Button onClick={() => void catalog.refetch()}>重试</Button>
              }
            >
              权限目录加载失败<Typography>{catalog.error.message}</Typography>
            </Alert>
          ) : (
            <Controller
              name="permissions"
              control={control}
              render={({ field }) => (
                <Box
                  role="group"
                  aria-label="菜单权限"
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                    gap: 1
                  }}
                >
                  {items.map((item) => (
                    <FormControlLabel
                      key={item.key}
                      control={
                        <Checkbox
                          disabled={pending}
                          checked={field.value?.includes(item.key) ?? false}
                          onChange={(_, checked) =>
                            field.onChange(
                              checked
                                ? [...(field.value ?? []), item.key]
                                : (field.value ?? []).filter(
                                    (key) => key !== item.key
                                  )
                            )
                          }
                        />
                      }
                      label={
                        <>
                          {item.label}
                          {!isPermissionLanded(item.key) && (
                            <Chip
                              label="未上线"
                              color="warning"
                              size="small"
                              sx={{ ml: 0.75 }}
                            />
                          )}
                        </>
                      }
                    />
                  ))}
                </Box>
              )}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={pending} onClick={onClose}>
          取消
        </Button>
        <Button
          type="submit"
          form="role-form"
          variant="contained"
          loading={pending}
        >
          {isEdit ? "保存" : "创建"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
