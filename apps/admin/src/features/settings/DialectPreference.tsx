import { useState } from "react";
import { App, Radio } from "antd";
import type { AdminDialectPreference } from "@tsz/shared";
import { useDialectPreference } from "./useDialectPreference";

const OPTION_LABEL: Record<AdminDialectPreference, string> = {
  uk: "英式（BrE）",
  us: "美式（AmE）"
};

export function DialectPreference() {
  const { preference, savePreference } = useDialectPreference();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);

  const change = async (value: AdminDialectPreference) => {
    if (value === preference || saving) return;
    setSaving(true);
    try {
      await savePreference(value);
      message.success("已保存");
    } catch (error) {
      message.error(
        error instanceof Error
          ? `保存失败：${error.message}`
          : "保存失败，请重试"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-row settings-dialect">
      <div>
        <div className="settings-row__label">英语偏好</div>
        <p className="settings-row__hint">用于录入、查看和试听。</p>
      </div>
      <Radio.Group
        aria-label="英语偏好"
        value={preference}
        disabled={saving}
        onChange={(event) =>
          void change(event.target.value as AdminDialectPreference)
        }
      >
        <Radio.Button value="uk" aria-label={OPTION_LABEL.uk}>
          <span className="settings-dialect__option">
            <span>英式英语</span>
            <small>BrE</small>
          </span>
        </Radio.Button>
        <Radio.Button value="us" aria-label={OPTION_LABEL.us}>
          <span className="settings-dialect__option">
            <span>美式英语</span>
            <small>AmE</small>
          </span>
        </Radio.Button>
      </Radio.Group>
    </div>
  );
}
