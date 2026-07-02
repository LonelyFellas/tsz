// 「创建单词 / 创建短语」弹窗:按对接文档 §2,创建只填 headword →
// POST /admin/words 得到草稿壳 → 跳编辑页补内容。其余字段都在编辑页里编。
import { App, Form, Input, Modal } from "antd";
import { useNavigate } from "react-router-dom";
import type { AdminWordKind } from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import { useCreateWord } from "./api";
import { KIND_LABEL } from "./labels";

interface Props {
  open: boolean;
  kind: AdminWordKind;
  onClose: () => void;
}

export function CreateWordModal({ open, kind, onClose }: Props) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<{ headword: string }>();
  const createWord = useCreateWord();
  const label = KIND_LABEL[kind];

  const submit = async () => {
    const { headword } = await form.validateFields();
    try {
      const { word } = await createWord.mutateAsync({
        headword: headword.trim(),
        kind
      });
      message.success(`已创建${label}「${word.headword}」`);
      onClose();
      navigate(`/words/${word.id}/edit`);
    } catch (err) {
      // 409 = 同 kind 下 headword 已存在(忽略大小写),就地标红引导改词。
      if (err instanceof HttpError && err.status === 409) {
        form.setFields([
          { name: "headword", errors: [`该${label}已存在(不区分大小写)`] }
        ]);
        return;
      }
      message.error(err instanceof Error ? err.message : "创建失败");
    }
  };

  return (
    <Modal
      open={open}
      title={`创建${label}`}
      okText="创建"
      cancelText="取消"
      confirmLoading={createWord.isPending}
      onOk={() => void submit().catch(() => undefined)}
      onCancel={onClose}
      afterOpenChange={(visible) => {
        if (visible) form.resetFields();
      }}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <Form.Item
          name="headword"
          label={label}
          rules={[
            {
              required: true,
              transform: (v: string) => v?.trim(),
              message: `请输入${label}`
            },
            { max: 200, message: "最长 200 字符" }
          ]}
        >
          <Input
            placeholder={`请输入${label},创建后进入编辑页完善内容`}
            allowClear
            autoFocus
            onPressEnter={() => void submit().catch(() => undefined)}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
