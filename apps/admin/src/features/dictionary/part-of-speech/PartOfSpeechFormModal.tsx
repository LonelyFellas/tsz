import { usePermission } from "@/lib/auth";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle
} from "@mui/material";
import { FormProvider, useForm } from "react-hook-form";
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
  kind,
  defaultSortOrder = 100,
  onClose,
  onSaved,
  onError
}: Props) {
  const canEdit = usePermission("lexicon_settings.edit_basic");
  const form = useForm<PartFormValues>();
  const { reset, handleSubmit } = form;
  const create = useCreatePartOfSpeech(),
    update = useUpdatePartOfSpeech();
  const pending = create.isPending || update.isPending;
  const defaultSortOrderRef = useRef(defaultSortOrder);
  defaultSortOrderRef.current = defaultSortOrder;
  useEffect(() => {
    if (!open) return;
    reset(
      value
        ? {
            name_zh: value.name_zh,
            name_en: value.name_en,
            abbreviation: value.abbreviation,
            short_name_zh: value.short_name_zh,
            full_name_en: value.full_name_en,
            sort_order: value.sort_order
          }
        : {
            name_zh: "",
            name_en: "",
            abbreviation: "",
            short_name_zh: "",
            full_name_en: "",
            sort_order: defaultSortOrderRef.current
          }
    );
  }, [open, value, reset]);
  const submit = async (values: PartFormValues) => {
    if (!canEdit || pending) return;
    try {
      const saved = value
        ? await update.mutateAsync({
            id: value.id,
            input: { base_revision: value.revision, ...values }
          })
        : await create.mutateAsync({
            ...values,
            kind,
            code: derivePartOfSpeechCode(values.full_name_en, kind)
          });
      onSaved(saved);
      onClose();
    } catch (error) {
      onError(error);
    }
  };
  return (
    <Dialog
      open={open}
      fullWidth
      maxWidth="md"
      aria-labelledby="part-form-title"
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <DialogTitle id="part-form-title">{`${value ? "修改" : "新增"}${kind === "phrase" ? "短语" : "单词"}基本词性`}</DialogTitle>
      <DialogContent>
        <FormProvider {...form}>
          <form
            id="part-form"
            onSubmit={handleSubmit(submit)}
            style={{ marginTop: 8 }}
          >
            <PartOfSpeechSharedFields
              placeholders={PLACEHOLDERS}
              disabled={pending}
            />
          </form>
        </FormProvider>
      </DialogContent>
      <DialogActions>
        <Button disabled={pending} onClick={onClose}>
          取消
        </Button>
        <Button
          type="submit"
          form="part-form"
          variant="contained"
          disabled={!canEdit}
          loading={pending}
        >
          {value ? "保存" : "新建"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
