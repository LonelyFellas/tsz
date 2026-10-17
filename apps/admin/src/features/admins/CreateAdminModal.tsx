import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { CreateAdminInput } from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import { useFeedback } from "@/components/FeedbackProvider";
import { useCreateAdmin, useRequestCreateAdminCode } from "./api";

interface FormValues {
  phone: string;
  display_name: string;
  code: string;
}
interface Props {
  open: boolean;
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
  onCreated: (result: { password: string; name: string }) => void;
}
const DISPLAY_NAME_FORBIDDEN = /[<>\p{Cc}\p{Cf}]/u;
export function CreateAdminModal({
  open,
  onClose,
  onPendingChange,
  onCreated
}: Props) {
  const notify = useFeedback();
  const {
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    defaultValues: { phone: "", display_name: "", code: "" }
  });
  const [error, setErrorMessage] = useState<string>();
  const createAdmin = useCreateAdmin();
  const requestCode = useRequestCreateAdminCode();
  const submitInFlight = useRef(false);
  useEffect(() => {
    if (open) {
      reset();
      setErrorMessage(undefined);
    }
  }, [open, reset]);
  const sendCode = async () => {
    if (requestCode.isPending) return;
    try {
      await requestCode.mutateAsync();
      notify("验证码已发送至当前超级管理员手机号", "success");
    } catch (err) {
      notify(
        err instanceof HttpError && err.status === 429
          ? "请求过于频繁，请稍后再试"
          : err instanceof Error && err.message
            ? err.message
            : "验证码发送失败",
        "error"
      );
    }
  };
  const submit = handleSubmit(async (values) => {
    setErrorMessage(undefined);
    const input: CreateAdminInput = {
      phone: values.phone.trim(),
      display_name: values.display_name.trim(),
      code: values.code.trim()
    };
    try {
      const res = await createAdmin.mutateAsync(input);
      onCreated({
        password: res.temporary_password,
        name: res.admin.display_name
      });
      onClose();
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) {
        setError("phone", { message: "该手机号已被占用" });
        return;
      }
      if (
        err instanceof HttpError &&
        err.status === 400 &&
        (err.message.toLowerCase().includes("code") ||
          err.message.includes("验证码"))
      ) {
        setError("code", { message: "验证码无效或已过期" });
        return;
      }
      setErrorMessage(
        err instanceof Error && err.message ? err.message : "创建失败"
      );
    }
  });
  const pending = isSubmitting || createAdmin.isPending;
  return (
    <Dialog
      open={open}
      fullWidth
      maxWidth="sm"
      aria-labelledby="create-admin-title"
      onClose={() => {
        if (!pending && !submitInFlight.current) onClose();
      }}
    >
      <DialogTitle id="create-admin-title">新建管理员</DialogTitle>
      <DialogContent>
        <Stack
          component="form"
          id="create-admin-form"
          spacing={2}
          sx={{ mt: 1 }}
          onSubmit={(event) => {
            event.preventDefault();
            if (submitInFlight.current) return;
            submitInFlight.current = true;
            onPendingChange(true);
            void submit().finally(() => {
              submitInFlight.current = false;
              onPendingChange(false);
            });
          }}
        >
          <TextField
            label="手机号"
            placeholder="登录用手机号"
            disabled={pending}
            error={!!errors.phone}
            helperText={errors.phone?.message}
            {...register("phone", {
              required: "请输入手机号",
              minLength: { value: 5, message: "手机号 5–20 位" },
              maxLength: { value: 20, message: "手机号 5–20 位" }
            })}
          />
          <TextField
            label="昵称"
            placeholder="管理员昵称"
            disabled={pending}
            error={!!errors.display_name}
            helperText={errors.display_name?.message}
            {...register("display_name", {
              validate: (value) =>
                !value.trim()
                  ? "请输入昵称"
                  : value.length > 50
                    ? "最长 50 字符"
                    : DISPLAY_NAME_FORBIDDEN.test(value)
                      ? "昵称不能包含 < > 或控制字符"
                      : true
            })}
          />
          <TextField
            label="超管手机验证码"
            placeholder="当前超管手机号收到的 6 位验证码"
            disabled={pending}
            error={!!errors.code}
            helperText={errors.code?.message}
            slotProps={{ htmlInput: { maxLength: 6, inputMode: "numeric" } }}
            {...register("code", {
              required: "请输入验证码",
              pattern: { value: /^\d{6}$/, message: "请输入 6 位数字验证码" }
            })}
          />
          <Button
            loading={requestCode.isPending}
            disabled={pending}
            onClick={() => void sendCode()}
          >
            获取验证码
          </Button>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={pending} onClick={onClose}>
          取消
        </Button>
        <Button
          type="submit"
          form="create-admin-form"
          variant="contained"
          loading={pending}
        >
          创建
        </Button>
      </DialogActions>
    </Dialog>
  );
}
