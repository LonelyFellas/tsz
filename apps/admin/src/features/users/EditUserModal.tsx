import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField
} from "@mui/material";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { AdminUserView } from "@tsz/types";
import { DISPLAY_NAME_MAX, hasDisplayNameForbiddenChars } from "@tsz/shared";
import { useFeedback } from "@/components/FeedbackProvider";
import { usePermission } from "@/lib/auth";
import { useUpdateUser } from "./api";
import { userActionError } from "./labels";

export function EditUserModal({
  user,
  onClose
}: {
  user: AdminUserView | null;
  onClose: () => void;
}) {
  const allowed = usePermission("users.edit");
  const notify = useFeedback();
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<{ display_name: string }>({
    defaultValues: { display_name: "" }
  });
  const [error, setError] = useState<string>();
  const updateUser = useUpdateUser();
  // 同一用户的后台刷新不覆盖正在编辑的输入。
  const userId = user?.id;
  const [initialUser, setInitialUser] = useState(user);
  if (initialUser?.id !== userId) setInitialUser(user);
  useEffect(() => {
    reset({ display_name: initialUser?.display_name ?? "" });
    setError(undefined);
  }, [initialUser, reset]);
  const submit = handleSubmit(async ({ display_name }) => {
    if (!user || !allowed || updateUser.isPending) return;
    setError(undefined);
    try {
      await updateUser.mutateAsync({
        id: user.id,
        display_name: display_name.trim()
      });
    } catch (err) {
      setError(userActionError(err, "保存失败"));
      return;
    }
    notify("已保存", "success");
    onClose();
  });
  const pending = isSubmitting || updateUser.isPending;
  return (
    <Dialog
      open={!!user}
      onClose={() => {
        if (!pending) onClose();
      }}
      fullWidth
      maxWidth="sm"
      aria-labelledby="edit-user-title"
    >
      <DialogTitle id="edit-user-title">编辑用户</DialogTitle>
      <DialogContent>
        <form id="edit-user-form" onSubmit={submit}>
          <TextField
            fullWidth
            autoFocus
            label="用户昵称"
            placeholder="请输入用户昵称"
            sx={{ mt: 1 }}
            disabled={pending}
            error={!!errors.display_name}
            helperText={errors.display_name?.message}
            {...register("display_name", {
              validate: (value) =>
                !value.trim()
                  ? "请输入用户昵称"
                  : value.length > DISPLAY_NAME_MAX
                    ? `最长 ${DISPLAY_NAME_MAX} 字符`
                    : hasDisplayNameForbiddenChars(value)
                      ? "昵称不能包含 < > 或控制字符"
                      : true
            })}
          />
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </form>
      </DialogContent>
      <DialogActions>
        <Button disabled={pending} onClick={onClose}>
          取消
        </Button>
        <Button
          form="edit-user-form"
          type="submit"
          variant="contained"
          disabled={!allowed}
          loading={pending}
        >
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
}
