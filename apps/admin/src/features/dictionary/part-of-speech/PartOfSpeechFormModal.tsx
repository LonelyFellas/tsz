import { Form, Input, InputNumber, Modal } from "antd";
import type { CreatePartOfSpeechInput, PartOfSpeechConfig } from "@tsz/types";
import { useEffect } from "react";
import { useCreatePartOfSpeech, useUpdatePartOfSpeech } from "./api";

interface Props {
  open: boolean;
  value?: PartOfSpeechConfig;
  onClose: () => void;
  onSaved: () => void;
  onError: (error: unknown) => void;
}

export function PartOfSpeechFormModal({
  open,
  value,
  onClose,
  onSaved,
  onError
}: Props) {
  const [form] = Form.useForm<CreatePartOfSpeechInput>();
  const create = useCreatePartOfSpeech();
  const update = useUpdatePartOfSpeech();
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    if (value) {
      form.setFieldsValue({
        code: value.code,
        name_zh: value.name_zh,
        name_en: value.name_en,
        abbreviation: value.abbreviation,
        sort_order: value.sort_order
      });
    } else {
      form.resetFields();
      form.setFieldValue("sort_order", 100);
    }
  }, [form, open, value]);

  const submit = async (values: CreatePartOfSpeechInput) => {
    try {
      if (value) {
        await update.mutateAsync({
          id: value.id,
          input: {
            base_revision: value.revision,
            name_zh: values.name_zh,
            name_en: values.name_en,
            abbreviation: values.abbreviation,
            sort_order: values.sort_order
          }
        });
      } else {
        await create.mutateAsync(values);
      }
      onSaved();
      onClose();
    } catch (error) {
      onError(error);
    }
  };

  return (
    <Modal
      open={open}
      title={value ? "修改基本词性" : "新增基本词性"}
      okText={value ? "保 存" : "新 建"}
      cancelText="取 消"
      confirmLoading={pending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item
          name="code"
          label="稳定编码"
          extra={value ? "编码已被词条引用，创建后不可修改。" : undefined}
          rules={[
            { required: true, message: "请输入稳定编码" },
            {
              pattern: /^[a-z][a-z0-9_]{0,31}$/,
              message: "使用小写字母、数字或下划线，且以字母开头"
            }
          ]}
        >
          <Input disabled={Boolean(value)} placeholder="例如 particle" />
        </Form.Item>
        <Form.Item
          name="name_zh"
          label="基本词性中文"
          rules={[
            { required: true, whitespace: true, message: "请输入中文名称" },
            { max: 64, message: "中文名称不能超过 64 个字符" }
          ]}
        >
          <Input placeholder="例如 小品词" />
        </Form.Item>
        <Form.Item
          name="name_en"
          label="基本词性英文"
          rules={[
            { required: true, whitespace: true, message: "请输入英文名称" },
            { max: 64, message: "英文名称不能超过 64 个字符" }
          ]}
        >
          <Input placeholder="例如 PARTICLE" />
        </Form.Item>
        <Form.Item
          name="abbreviation"
          label="英文缩写"
          rules={[
            { required: true, whitespace: true, message: "请输入英文缩写" },
            { max: 16, message: "英文缩写不能超过 16 个字符" }
          ]}
        >
          <Input placeholder="例如 part." />
        </Form.Item>
        <Form.Item
          name="sort_order"
          label="排序值"
          rules={[{ required: true, message: "请输入排序值" }]}
        >
          <InputNumber precision={0} style={{ width: "100%" }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
