import { useUserTranslation, UserText } from "../users/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button } from "@tsz/ui/admin/display";
import { App, Modal } from "@tsz/ui/admin/overlays";
import { Form, Input } from "@tsz/ui/admin/forms";
import { useState } from "react";
import { api, usePermission } from "@/lib/auth";

export function RevokeTeacherButton({
  userId,
  onSuccess
}: {
  userId: string;
  onSuccess?: () => void;
}) {
  const { t } = useUserTranslation();
  const allowed = usePermission("teacherapply.revoke");
  const client = useQueryClient();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<{ reason: string }>();
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
      void message.success(<UserText message="revoke_success" />);
      onSuccess?.();
    }
  });
  if (!allowed) return null;
  return (
    <>
      <Button
        danger
        onClick={() => {
          form.resetFields();
          mutation.reset();
          setOpen(true);
        }}
      >
        {t("revoke_title")}
      </Button>
      <Modal
        title={t("revoke_title")}
        open={open}
        confirmLoading={mutation.isPending}
        okText={t("revoke_confirm")}
        cancelText={t("revoke_cancel")}
        onOk={() => form.submit()}
        onCancel={() => {
          if (!mutation.isPending) setOpen(false);
        }}
        destroyOnHidden
      >
        <p>{t("revoke_help")}</p>
        <Form
          form={form}
          layout="vertical"
          onFinish={(value) => mutation.mutate(value)}
          preserve={false}
        >
          <Form.Item
            name="reason"
            label={t("revoke_reason")}
            rules={[
              {
                required: true,
                whitespace: true,
                message: <UserText message="revoke_required" />
              },
              {
                max: 2000,
                message: (
                  <UserText message="reason_max" params={{ max: 2000 }} />
                )
              }
            ]}
          >
            <Input.TextArea
              rows={4}
              maxLength={2000}
              showCount
              disabled={mutation.isPending}
            />
          </Form.Item>
        </Form>
        {mutation.error && (
          <Alert type="error" showIcon title={mutation.error.message} />
        )}
      </Modal>
    </>
  );
}
