import { Form } from "antd";
import type { FormInstance } from "antd";
import { useEffect, useState } from "react";

/** 新建词性时会自动派生的两个展示字段。 */
export type DerivedNameField = "short_name_zh" | "full_name_en";

const UNTOUCHED: Record<DerivedNameField, boolean> = {
  short_name_zh: false,
  full_name_en: false
};

/**
 * 基本词性与细分词性弹窗共用的派生默认值：新建时简洁显示跟随正式中文、英文全称取正式英文小写；
 * 用户一旦手动改过某个字段就不再覆盖它。返回的 markTouched 交给对应输入框的 onChange。
 */
export function useDerivedNameDefaults(
  form: FormInstance,
  { open, creating }: { open: boolean; creating: boolean }
) {
  const [touched, setTouched] = useState(UNTOUCHED);
  const nameZh = Form.useWatch<string | undefined>("name_zh", form);
  const nameEn = Form.useWatch<string | undefined>("name_en", form);

  useEffect(() => {
    if (open) setTouched(UNTOUCHED);
  }, [open]);

  useEffect(() => {
    if (!open || !creating || touched.short_name_zh) return;
    form.setFieldValue("short_name_zh", nameZh ?? "");
  }, [creating, form, nameZh, open, touched.short_name_zh]);

  useEffect(() => {
    if (!open || !creating || touched.full_name_en) return;
    form.setFieldValue("full_name_en", (nameEn ?? "").toLowerCase());
  }, [creating, form, nameEn, open, touched.full_name_en]);

  return (field: DerivedNameField) =>
    setTouched((current) =>
      current[field] ? current : { ...current, [field]: true }
    );
}
