import { useContentTranslation } from "@/features/content/i18n";
import { usePermission } from "@/lib/auth";
import { Form } from "@tsz/ui/admin/forms";
import { Modal } from "@tsz/ui/admin/overlays";
import type {
  AdminWordKind,
  CreatePartOfSpeechInput,
  PartOfSpeechConfig
} from "@tsz/types";
import { useEffect, useRef } from "react";
import { useCreatePartOfSpeech, useUpdatePartOfSpeech } from "./api";
import { PartOfSpeechSharedFields } from "./PartOfSpeechSharedFields";

interface Props {
  open: boolean;
  value?: PartOfSpeechConfig;
  /** 新建时落在哪一侧；编辑时 kind 不可改，按现有值展示。 */
  kind: AdminWordKind;
  /** 新建时预填的序号：目录里的最大序号 + 10，管理员可以改。 */
  defaultSortOrder?: number;
  onClose: () => void;
  onSaved: (saved: PartOfSpeechConfig) => void;
  onError: (error: unknown) => void;
}

/** `phrase_` 是短语词性保留的编码前缀，后端 CHECK 与 kind 双向绑定。 */
const PHRASE_CODE_PREFIX = "phrase_";

/**
 * 把英文全称折成合法编码：小写、非字母数字折成下划线、以字母开头、最长 32。
 * 词形变化的编码派生也复用它，那边不涉及 kind。
 */
export function slugifyCode(fullNameEn: string): string {
  const slug = fullNameEn
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (/^[a-z]/.test(slug) ? slug : `p_${slug}`).slice(0, 32);
}

/**
 * 稳定编码是系统内部标识，用户不填也不看：新建时由英文全称派生，创建后不可修改。
 * 短语词性必须带 `phrase_` 前缀，单词词性反过来不许占用它，两侧都由这里保证。
 */
export function derivePartOfSpeechCode(
  fullNameEn: string,
  kind: AdminWordKind
): string {
  const base = slugifyCode(fullNameEn);
  if (kind === "phrase") {
    return `${PHRASE_CODE_PREFIX}${base}`.slice(0, 32);
  }
  // 英文全称正好以 phrase 开头时，派生结果会落进短语的命名空间，后端会 400。
  return base.startsWith(PHRASE_CODE_PREFIX) ? `w_${base}`.slice(0, 32) : base;
}

// 稳定编码不暴露给用户，由英文全称派生；kind 由所在分页决定；序号是表单字段。
type PartFormValues = Omit<CreatePartOfSpeechInput, "code" | "kind">;

export function PartOfSpeechFormModal({
  open,
  value,
  kind,
  defaultSortOrder = 100,
  onClose,
  onSaved,
  onError
}: Props) {
  const { t } = useContentTranslation();
  const canEdit = usePermission("lexicon_settings.edit_basic");
  const [form] = Form.useForm<PartFormValues>();
  const create = useCreatePartOfSpeech();
  const update = useUpdatePartOfSpeech();
  const pending = create.isPending || update.isPending;
  // 预填值放 ref 而不是 effect 依赖：目录随时可能重拉，跟着重跑那个 effect 会连带
  // resetFields 清空正在填的表单。
  const defaultSortOrderRef = useRef(defaultSortOrder);
  defaultSortOrderRef.current = defaultSortOrder;

  useEffect(() => {
    if (!open) return;
    if (value) {
      form.setFieldsValue({
        name_zh: value.name_zh,
        name_en: value.name_en,
        abbreviation: value.abbreviation,
        short_name_zh: value.short_name_zh,
        full_name_en: value.full_name_en,
        sort_order: value.sort_order
      });
    } else {
      form.resetFields();
      form.setFieldValue("sort_order", defaultSortOrderRef.current);
    }
  }, [form, open, value]);

  const submit = async (values: PartFormValues) => {
    if (!canEdit) return;
    try {
      let saved: PartOfSpeechConfig;
      if (value) {
        saved = await update.mutateAsync({
          id: value.id,
          input: { base_revision: value.revision, ...values }
        });
      } else {
        saved = await create.mutateAsync({
          ...values,
          kind,
          code: derivePartOfSpeechCode(values.full_name_en, kind)
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
      title={t(
        value
          ? kind === "phrase"
            ? "edit_phrase_part"
            : "edit_word_part"
          : kind === "phrase"
            ? "add_phrase_part"
            : "add_word_part"
      )}
      okText={value ? t("save_spaced") : t("create_spaced")}
      cancelText={t("cancel_spaced")}
      okButtonProps={{ disabled: !canEdit }}
      confirmLoading={pending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={submit}>
        <PartOfSpeechSharedFields
          placeholders={{
            name_zh: t("example_noun_zh"),
            short_name_zh: t("example_noun_zh"),
            name_en: t("example_noun_name"),
            abbreviation: t("example_n_abbr"),
            full_name_en: t("example_noun_full")
          }}
        />
      </Form>
    </Modal>
  );
}
