import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Form, Input, Modal } from "antd";
import { useState } from "react";
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
      void message.success("教师资格已撤销，学生身份与原有数据保留");
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
        撤销教师资格
      </Button>
      <Modal
        title="撤销教师资格"
        open={open}
        confirmLoading={mutation.isPending}
        okText="确认撤销"
        cancelText="取 消"
        onOk={() => form.submit()}
        onCancel={() => {
          if (!mutation.isPending) setOpen(false);
        }}
        destroyOnHidden
      >
        <p>
          撤销后不能再使用教师功能，学生身份与原有数据保留，可重新申请认证。
        </p>
        <Form
          form={form}
          layout="vertical"
          onFinish={(value) => mutation.mutate(value)}
          preserve={false}
        >
          <Form.Item
            name="reason"
            label="撤销原因"
            rules={[
              { required: true, whitespace: true, message: "请填写撤销原因" },
              { max: 2000 }
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
