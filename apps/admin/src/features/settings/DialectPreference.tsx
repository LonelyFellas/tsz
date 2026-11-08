import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { App } from "@tsz/ui/admin/overlays";
import { Radio } from "@tsz/ui/admin/forms";
import type { AdminDialectPreference } from "@tsz/shared";
import { useDialectPreference } from "./useDialectPreference";
import { AdminText, useAdminTranslation } from "@/i18n";

function SaveError({ error }: { error: unknown }) {
  const { t } = useAdminTranslation();
  const message = error instanceof Error ? error.message : "";
  const detail =
    message === "当前会话已变化，请重试"
      ? t("settings_session_changed")
      : message === "当前会话已失效，请重新登录"
        ? t("settings_session_expired")
        : message;
  return (
    <>
      {detail
        ? t("settings_save_error", { detail })
        : t("settings_save_failed")}
    </>
  );
}

export function DialectPreference() {
  const { t } = useAdminTranslation();
  const { preference, savePreference } = useDialectPreference();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);

  const change = async (value: AdminDialectPreference) => {
    if (value === preference || saving) return;
    setSaving(true);
    try {
      await savePreference(value);
      message.success(<AdminText message="settings_saved" />);
    } catch (error) {
      message.error(<SaveError error={error} />);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-row settings-dialect">
      <div>
        <div className="settings-row__label">{t("settings_english")}</div>
        <p className="settings-row__hint">{t("settings_english_help")}</p>
      </div>
      <Radio.Group
        aria-label={t("settings_english")}
        value={preference}
        disabled={saving}
        onChange={(event) =>
          void change(event.target.value as AdminDialectPreference)
        }
      >
        <Radio.Button value="uk" aria-label={t("settings_british_label")}>
          <span className="settings-dialect__option">
            <span>{t("settings_british")}</span>
            <small>BrE</small>
          </span>
          <CheckIcon
            className="settings-dialect__check"
            size={16}
            aria-hidden="true"
          />
        </Radio.Button>
        <Radio.Button value="us" aria-label={t("settings_american_label")}>
          <span className="settings-dialect__option">
            <span>{t("settings_american")}</span>
            <small>AmE</small>
          </span>
          <CheckIcon
            className="settings-dialect__check"
            size={16}
            aria-hidden="true"
          />
        </Radio.Button>
      </Radio.Group>
    </div>
  );
}
