import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography
} from "@mui/material";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useFeedback } from "@/components/FeedbackProvider";
import { api, usePermission } from "@/lib/auth";

export function RevokeTeacherButton({
  userId,
  onSuccess
}: {
  userId: string;
  onSuccess?: () => void;
}) {
  const allowed = usePermission("teacherapply.revoke");
  const client = useQueryClient();
  const notify = useFeedback();
  const [open, setOpen] = useState(false);
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors }
  } = useForm<{ reason: string }>({ defaultValues: { reason: "" } });
  const mutation = useMutation({
    mutationFn: ({ reason }: { reason: string }) =>
      api.teacherCertification.revoke(userId, reason.trim()),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin-users"] }),
        client.invalidateQueries({ queryKey: ["teacher-applications"] }),
        client.invalidateQueries({ queryKey: ["teacher-application"] })
      ]);
      setOpen(false);
      notify("教师资格已撤销，学生身份与原有数据保留", "success");
      onSuccess?.();
    }
  });
  if (!allowed) return null;
  return (
    <>
      <Button
        color="error"
        onClick={() => {
          reset();
          mutation.reset();
          setOpen(true);
        }}
      >
        撤销教师资格
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          if (!mutation.isPending) setOpen(false);
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="revoke-teacher-title"
      >
        <DialogTitle id="revoke-teacher-title">撤销教师资格</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            撤销后不能再使用教师功能，学生身份与原有数据保留，可重新申请认证。
          </Typography>
          <form
            id="revoke-teacher-form"
            onSubmit={handleSubmit((value) => {
              if (!mutation.isPending && allowed) mutation.mutate(value);
            })}
          >
            <TextField
              label="撤销原因"
              multiline
              rows={4}
              fullWidth
              disabled={mutation.isPending}
              error={!!errors.reason}
              helperText={errors.reason?.message}
              {...register("reason", {
                validate: (value) => !!value.trim() || "请填写撤销原因",
                maxLength: { value: 2000, message: "最长 2000 字符" }
              })}
            />
          </form>
          {mutation.error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {mutation.error.message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={mutation.isPending} onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            type="submit"
            form="revoke-teacher-form"
            color="error"
            variant="contained"
            loading={mutation.isPending}
          >
            确认撤销
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
