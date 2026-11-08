import { useId, useState, useSyncExternalStore } from "react";
import { Select } from "@tsz/ui/admin/forms";
import { Button } from "@tsz/ui/admin/display";
import { LanguagesIcon } from "lucide-react";
import type { InterfaceLocale } from "@tsz/shared/i18n";
import type { InterfacePreferences } from "@tsz/shared/i18n/preferences";
import { interfacePreferences } from "@/lib/interface-preferences";
import { useAdminTranslation } from "@/i18n";
import "./interface-language.css";

const names: Record<InterfaceLocale, string> = {
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
  "en-GB": "English (UK)",
  "en-US": "English (US)"
};

export function InterfaceLanguage({
  compact = false,
  controller = interfacePreferences
}: {
  compact?: boolean;
  controller?: InterfacePreferences;
}) {
  const { t } = useAdminTranslation();
  const id = useId();
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot
  );
  const [failure, setFailure] = useState<string | null>(null);
  if (snapshot.status === "idle" || snapshot.status === "unsupported")
    return null;
  const owner = controller.sessionKey();
  if (snapshot.owner !== owner) return null;
  const options = snapshot.capabilities?.supported_locales ?? [];
  const unavailable =
    snapshot.preference !== null && !options.includes(snapshot.preference);
  const save = async (value: string) => {
    setFailure(null);
    try {
      const locale = value === "browser" ? null : (value as InterfaceLocale);
      if (controller.accountId()) await controller.save(locale);
      else await controller.saveGuest(locale);
    } catch {
      if (controller.sessionKey() === owner) setFailure(owner);
    }
  };
  return (
    <div
      className={
        compact
          ? "admin-language admin-language--compact"
          : "settings-row admin-language"
      }
    >
      <label
        htmlFor={id}
        className={compact ? "admin-language__label" : "settings-row__label"}
      >
        {compact && <LanguagesIcon size={16} aria-hidden="true" />}
        {t("settings_language")}
      </label>
      {snapshot.status === "error" ? (
        <div role="status" className="admin-language__notice">
          {t("settings_language_error")}
          <Button onClick={() => void controller.refresh()}>
            {t("recovery_retry")}
          </Button>
        </div>
      ) : (
        <div className="admin-language__control">
          <Select
            id={id}
            aria-label={t("settings_language")}
            disabled={snapshot.saving || snapshot.refreshing}
            value={snapshot.preference ?? "browser"}
            onChange={(value) => void save(value)}
            options={[
              { value: "browser", label: t("settings_browser") },
              ...options.map((value) => ({ value, label: names[value] })),
              ...(unavailable && snapshot.preference
                ? [
                    {
                      value: snapshot.preference,
                      label: `${names[snapshot.preference]} (${t("settings_language_unavailable")})`,
                      disabled: true
                    }
                  ]
                : [])
            ]}
          />
          {unavailable && (
            <p className="admin-language__notice" role="status">
              {t("settings_language_fallback", {
                language: names[snapshot.locale]
              })}
            </p>
          )}
          {failure === owner && (
            <p className="admin-language__notice" role="alert">
              {t("settings_save_failed")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
