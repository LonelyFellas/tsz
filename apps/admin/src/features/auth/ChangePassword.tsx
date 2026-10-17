import { HttpError } from "@tsz/api-client";
import { PASSWORD_HINT, passwordLengthError } from "@tsz/shared";
import { passwordErrorMessage } from "@tsz/shared/auth";
import { Button, Paper, Stack, Typography } from "@mui/material";
import { useForm } from "react-hook-form";
import { useLocation } from "react-router-dom";
import { FullscreenCenter } from "@/layouts/FullscreenCenter";
import { PasswordField } from "@/components/PasswordField";
import { useFeedback } from "@/components/FeedbackProvider";
import { api, useAuthStore } from "@/lib/auth";
import { useAdminLogout } from "./useAdminLogout";

interface FormValues {
  current_password: string;
  new_password: string;
  confirm: string;
}
export function ChangePassword() {
  const notify = useFeedback();
  const profile = useAuthStore((s) => s.profile);
  const location = useLocation();
  const logout = useAdminLogout();
  const forced = !profile;
  const prefillCurrent =
    (location.state as { currentPassword?: string } | null)?.currentPassword ??
    "";
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    defaultValues: {
      current_password: prefillCurrent,
      new_password: "",
      confirm: ""
    }
  });
  const submit = handleSubmit(async ({ current_password, new_password }) => {
    try {
      await api.auth.changePassword(current_password, new_password);
      notify("密码修改成功，请重新登录", "success");
      window.location.replace("/login?reset=success");
    } catch (err) {
      if (
        err instanceof HttpError &&
        err.status === 401 &&
        err.code === "invalid_credentials"
      ) {
        setError("current_password", {
          message: forced ? "临时密码不正确" : "当前密码不正确"
        });
        return;
      }
      setError("new_password", {
        message:
          (err instanceof HttpError && passwordErrorMessage(err.code)) ||
          "修改失败，请稍后重试"
      });
    }
  });
  return (
    <FullscreenCenter>
      <Paper variant="outlined" sx={{ width: "100%", maxWidth: 384, p: 3 }}>
        <Typography variant="h5" sx={{ mb: 1 }}>
          {forced ? "请先修改初始密码" : "修改密码"}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {forced
            ? "你的密码由管理员重置，请用临时密码设置新密码后重新登录后台。"
            : "为账号设置一个新的登录密码。"}
        </Typography>
        <Stack component="form" spacing={2} onSubmit={submit}>
          <PasswordField
            label={forced ? "临时密码" : "当前密码"}
            placeholder={forced ? "管理员发给你的临时密码" : "当前登录密码"}
            autoComplete="current-password"
            disabled={isSubmitting}
            error={!!errors.current_password}
            helperText={errors.current_password?.message}
            {...register("current_password", {
              required: "请输入当前密码",
              deps: ["new_password"]
            })}
          />
          <PasswordField
            label="新密码"
            placeholder={PASSWORD_HINT}
            autoComplete="new-password"
            disabled={isSubmitting}
            error={!!errors.new_password}
            helperText={errors.new_password?.message}
            {...register("new_password", {
              required: "请输入新密码",
              validate: (value) =>
                passwordLengthError(value) ||
                (value === getValues("current_password")
                  ? "新密码不能与当前密码相同"
                  : true),
              deps: ["confirm"]
            })}
          />
          <PasswordField
            label="确认新密码"
            placeholder="再次输入新密码"
            autoComplete="new-password"
            disabled={isSubmitting}
            error={!!errors.confirm}
            helperText={errors.confirm?.message}
            {...register("confirm", {
              required: "请再次输入新密码",
              validate: (value) =>
                value === getValues("new_password") || "两次输入的密码不一致"
            })}
          />
          <Button
            variant="contained"
            fullWidth
            loading={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "提交中..." : "确认修改"}
          </Button>
          {forced && (
            <Button
              fullWidth
              disabled={isSubmitting}
              onClick={() => void logout()}
            >
              退出登录
            </Button>
          )}
        </Stack>
      </Paper>
    </FullscreenCenter>
  );
}
