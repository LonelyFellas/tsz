import { Form, Modal } from "antd";
import type { CreatePartOfSpeechInput, PartOfSpeechConfig } from "@tsz/types";
import { useEffect } from "react";
import { useCreatePartOfSpeech, useUpdatePartOfSpeech } from "./api";
import { PartOfSpeechNameFields } from "./PartOfSpeechNameFields";
import { useDerivedNameDefaults } from "./useDerivedNameDefaults";

interface Props {
  open: boolean;
  value?: PartOfSpeechConfig;
  /** 新建时自动落在目录末尾的排序值（最大排序值 + 10）；排序对用户不可见。 */
  defaultSortOrder?: number;
  onClose: () => void;
  onSaved: (saved: PartOfSpeechConfig) => void;
  onError: (error: unknown) => void;
}

/**
 * 稳定编码是系统内部标识，用户不填也不看：新建时由英文全称派生
 * （小写、非字母数字折成下划线、以字母开头、最长 32），创建后不可修改。
 */
export function derivePartOfSpeechCode(fullNameEn: string): string {
  const slug = fullNameEn
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (/^[a-z]/.test(slug) ? slug : `p_${slug}`).slice(0, 32);
}

// 排序值与稳定编码都不暴露给用户：前者自动追加在末尾，后者由英文全称派生。
type PartFormValues = Omit<CreatePartOfSpeechInput, "sort_order" | "code">;

const PLACEHOLDERS = {
  name_zh: "例如 名词",
  short_name_zh: "例如 名词",
  name_en: "例如 NOUN",
  abbreviation: "例如 n.",
  full_name_en: "例如 noun"
};

export function PartOfSpeechFormModal({
  open,
  value,
  defaultSortOrder = 100,
  onClose,
  onSaved,
  onError
}: Props) {
  const [form] = Form.useForm<PartFormValues>();
  const create = useCreatePartOfSpeech();
  const update = useUpdatePartOfSpeech();
  const pending = create.isPending || update.isPending;
  const creating = !value;
  const markTouched = useDerivedNameDefaults(form, { open, creating });

  useEffect(() => {
    if (!open) return;
    if (value) {
      form.setFieldsValue({
        name_zh: value.name_zh,
        name_en: value.name_en,
        abbreviation: value.abbreviation,
        short_name_zh: value.short_name_zh,
        full_name_en: value.full_name_en
      });
    } else {
      form.resetFields();
    }
  }, [form, open, value]);

  const submit = async (values: PartFormValues) => {
    try {
      let saved: PartOfSpeechConfig;
      if (value) {
        saved = await update.mutateAsync({
          id: value.id,
          input: {
            base_revision: value.revision,
            ...values,
            sort_order: value.sort_order
          }
        });
      } else {
        saved = await create.mutateAsync({
          ...values,
          code: derivePartOfSpeechCode(values.full_name_en),
          sort_order: defaultSortOrder
        });
      }
      onSaved(saved);
      onClose();
    } catch (error) {
      onError(error);
    }
  };

  return (
    <Modal
      open={open}
      width={720}
      title={value ? "修改基本词性" : "新增基本词性"}
      okText={value ? "保 存" : "新 建"}
      cancelText="取 消"
      confirmLoading={pending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={submit}>
        <PartOfSpeechNameFields
          placeholders={PLACEHOLDERS}
          onTouch={markTouched}
        />
      </Form>
    </Modal>
  );
}
