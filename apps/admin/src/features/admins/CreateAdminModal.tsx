import { useAccessTranslation, AccessText } from "../permissions/i18n";
// 新建管理员弹窗（super_admin）：新账号手机号/昵称 + 当前超管手机确认码。
// 密码由后端生成、等级恒为 admin，前端不再收集；创建成功把一次性临时密码交父级展示。
// 校验对齐 openapi CreateAdminRequest：昵称禁 < > 及控制字符、手机 5–20 位。
import { App, Modal } from "@tsz/ui/admin/overlays";
import { Button } from "@tsz/ui/admin/display";
import { Form, Input } from "@tsz/ui/admin/forms";
import { useEffect, useRef, useState } from "react";
import type { CreateAdminInput } from "@tsz/types";
import { HttpError } from "@tsz/api-client";
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
  /** 创建成功：把后端生成的一次性临时密码交父级弹窗展示（复用重置密码弹窗）。 */
  onCreated: (result: { password: string; name: string }) => void;
}

// 昵称禁 < >（防注入）与控制/不可见字符——与后端 400 规则一致，前端预检省一次往返。
const DISPLAY_NAME_FORBIDDEN = /[<>\p{Cc}\p{Cf}]/u;

export function CreateAdminModal({
  open,
  onClose,
  onPendingChange,
  onCreated
}: Props) {
  const { t } = useAccessTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const createAdmin = useCreateAdmin();
  const requestCode = useRequestCreateAdminCode();
  // isPending 要到下一次渲染才更新；ref 同步拦截同一帧内的重复提交。
  const submitInFlight = useRef(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof FormValues, "phone_taken" | "invalid_code">>
  >({});

  useEffect(() => {
    if (open) {
      form.resetFields();
      setFieldErrors({});
    }
  }, [open, form]);

  const sendCode = async () => {
    try {
      await requestCode.mutateAsync();
      message.success(
        <AccessText message="a_verification_code_was_sent_to_the_current_super_administrator_s" />
      );
    } catch (err) {
      if (err instanceof HttpError && err.status === 429) {
        message.warning(
          <AccessText message="too_many_requests_try_again_later" />
        );
        return;
      }
      message.error(
        err instanceof Error && err.message ? (
          err.message
        ) : (
          <AccessText message="could_not_send_the_verification_code" />
        )
      );
    }
  };

  const submit = async () => {
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    onPendingChange(true);

    try {
      const values = await form.validateFields();
      setFieldErrors({});
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
        // Rust 后端 409 表示新管理员手机号已存在。
        if (err instanceof HttpError && err.status === 409) {
          setFieldErrors({ phone: "phone_taken" });
          return;
        }
        if (err instanceof HttpError && err.status === 400) {
          const detail = err.message.toLowerCase();
          if (detail.includes("验证码") || detail.includes("code")) {
            setFieldErrors({ code: "invalid_code" });
            return;
          }
        }
        message.error(
          err instanceof Error && err.message ? (
            err.message
          ) : (
            <AccessText message="creation_failed" />
          )
        );
      }
    } finally {
      submitInFlight.current = false;
      onPendingChange(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t("create_administrator")}
      okText={t("create")}
      cancelText={t("cancel")}
      confirmLoading={createAdmin.isPending}
      okButtonProps={{ disabled: createAdmin.isPending }}
      cancelButtonProps={{ disabled: createAdmin.isPending }}
      closable={!createAdmin.isPending}
      mask={{ closable: !createAdmin.isPending }}
      keyboard={!createAdmin.isPending}
      onOk={() => void submit().catch(() => undefined)}
      onCancel={() => {
        if (!createAdmin.isPending && !submitInFlight.current) onClose();
      }}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 12 }}
        onValuesChange={(changed) =>
          setFieldErrors((current) => ({
            ...current,
            ...Object.fromEntries(
              Object.keys(changed).map((key) => [key, undefined])
            )
          }))
        }
      >
        <Form.Item
          name="phone"
          validateStatus={fieldErrors.phone ? "error" : undefined}
          help={
            fieldErrors.phone ? (
              <AccessText message="this_phone_number_is_already_in_use" />
            ) : undefined
          }
          label={t("phone_number")}
          rules={[
            {
              required: true,
              message: <AccessText message="enter_a_phone_number" />
            },
            {
              min: 5,
              max: 20,
              message: (
                <AccessText message="phone_numbers_must_be_5_20_characters" />
              )
            }
          ]}
        >
          <Input placeholder={t("phone_number_for_sign_in")} allowClear />
        </Form.Item>
        <Form.Item
          name="display_name"
          label={t("display_name")}
          rules={[
            {
              required: true,
              transform: (v: string) => v?.trim(),
              message: <AccessText message="enter_a_display_name" />
            },
            {
              max: 50,
              message: <AccessText message="at_most_50_characters" />
            },
            {
              message: (
                <AccessText message="display_names_cannot_contain_or_control_characters" />
              ),
              validator: (_, v: string) =>
                v && DISPLAY_NAME_FORBIDDEN.test(v)
                  ? Promise.reject(new Error("invalid_display_name"))
                  : Promise.resolve()
            }
          ]}
        >
          <Input placeholder={t("administrator_display_name")} allowClear />
        </Form.Item>
        <Form.Item
          name="code"
          validateStatus={fieldErrors.code ? "error" : undefined}
          help={
            fieldErrors.code ? (
              <AccessText message="the_verification_code_is_invalid_or_has_expired" />
            ) : undefined
          }
          label={t("super_administrator_s_verification_code")}
          rules={[
            {
              required: true,
              message: <AccessText message="enter_the_verification_code" />
            },
            {
              pattern: /^\d{6}$/,
              message: (
                <AccessText message="enter_the_6_digit_verification_code" />
              )
            }
          ]}
        >
          <Input
            placeholder={t(
              "6_digit_code_sent_to_the_current_super_administrator_s_phone"
            )}
            maxLength={6}
            inputMode="numeric"
            allowClear
            addonAfter={
              <Button
                type="link"
                size="small"
                loading={requestCode.isPending}
                onClick={() => void sendCode()}
              >
                {t("get_code")}
              </Button>
            }
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
