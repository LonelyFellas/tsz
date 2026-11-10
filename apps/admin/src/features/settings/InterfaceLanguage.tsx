import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore
} from "react";
import { Select } from "@tsz/ui/admin/forms";
import { Button } from "@tsz/ui/admin/display";
import { Dropdown } from "@tsz/ui/admin/overlays";
import { CheckIcon, ChevronDownIcon, Globe2Icon } from "lucide-react";
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [focusOwner, setFocusOwner] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (focusOwner === null || snapshot.saving || snapshot.refreshing) return;
    if (
      snapshot.owner === focusOwner &&
      controller.sessionKey() === focusOwner &&
      (document.activeElement === document.body ||
        document.activeElement === triggerRef.current)
    )
      triggerRef.current?.focus({ preventScroll: true });
    setFocusOwner(null);
  }, [
    focusOwner,
    snapshot.owner,
    snapshot.saving,
    snapshot.refreshing,
    controller
  ]);
  if (snapshot.status === "idle" || snapshot.status === "unsupported")
    return null;
  const owner = controller.sessionKey();
  if (snapshot.owner !== owner) return null;
  const options = snapshot.capabilities?.supported_locales ?? [];
  const unavailable =
    snapshot.preference !== null && !options.includes(snapshot.preference);
  const selected = snapshot.preference ?? "browser";
  const choices = [
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
  ];
  const save = async (value: string) => {
    setFailure(null);
    const locale = value === "browser" ? null : (value as InterfaceLocale);
    try {
      if (controller.accountId()) await controller.save(locale);
      else await controller.saveGuest(locale);
    } catch {
      if (controller.sessionKey() !== owner) return;
      await controller.refresh();
      if (
        controller.sessionKey() === owner &&
        (controller.getSnapshot().status !== "ready" ||
          controller.getSnapshot().preference !== locale)
      )
        setFailure(owner);
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
      {!compact && (
        <label htmlFor={id} className="settings-row__label">
          {t("settings_language")}
        </label>
      )}
      {snapshot.status === "error" ? (
        <div role="status" className="admin-language__notice">
          {t("settings_language_error")}
          <Button onClick={() => void controller.refresh()}>
            {t("recovery_retry")}
          </Button>
        </div>
      ) : (
        <div className="admin-language__control">
          {compact ? (
            <Dropdown
              trigger="click"
              placement="top"
              disabled={snapshot.saving || snapshot.refreshing}
              classNames={{ root: "admin-language__menu" }}
              menu={{
                "aria-label": t("settings_language"),
                selectable: true,
                selectedKeys: [selected],
                onClick: async ({ key }) => {
                  await save(key);
                  setFocusOwner(owner);
                },
                items: choices.flatMap((choice, index) => [
                  ...(index === 1
                    ? [{ type: "divider" as const, key: "divider" }]
                    : []),
                  {
                    key: choice.value,
                    disabled: "disabled" in choice && choice.disabled,
                    label: (
                      <span className="admin-language__option">
                        <span>{choice.label}</span>
                        {choice.value === selected && (
                          <CheckIcon size={16} aria-hidden="true" />
                        )}
                      </span>
                    )
                  }
                ])
              }}
            >
              <Button
                ref={triggerRef}
                className="admin-language__trigger"
                type="text"
                icon={<Globe2Icon size={16} aria-hidden="true" />}
                aria-label={`${t("settings_language")}: ${names[snapshot.locale]}`}
                disabled={snapshot.saving || snapshot.refreshing}
              >
                {names[snapshot.locale]}
                <ChevronDownIcon
                  className="admin-language__chevron"
                  size={12}
                  aria-hidden="true"
                />
              </Button>
            </Dropdown>
          ) : (
            <Select
              id={id}
              aria-label={t("settings_language")}
              disabled={snapshot.saving || snapshot.refreshing}
              value={selected}
              onChange={(value) => void save(value)}
              options={choices}
            />
          )}
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
