"use client";

import { useId, useState, useSyncExternalStore } from "react";
import type { InterfaceLocale } from "@tsz/shared/i18n";
import type { InterfacePreferences } from "@tsz/shared/i18n/preferences";
import { Button } from "@tsz/ui/components";
import { interfacePreferences } from "@/lib/interface-preferences";
import { useWebText } from "./client";
import { webPreferences } from "./messages/preferences";

const names: Record<InterfaceLocale, string> = {
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
  "en-GB": "English (UK)",
  "en-US": "English (US)"
};

export function InterfaceLanguage({
  controller = interfacePreferences
}: {
  controller?: InterfacePreferences;
}) {
  const uiText = useWebText(webPreferences);
  const id = useId();
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot
  );
  const owner = controller.sessionKey();
  const [failure, setFailure] = useState<string | null>(null);
  if (
    snapshot.owner !== owner ||
    snapshot.status === "idle" ||
    snapshot.status === "unsupported"
  )
    return null;
  const options = snapshot.capabilities?.supported_locales ?? [];
  const unavailable =
    snapshot.preference !== null && !options.includes(snapshot.preference);
  async function save(value: string, select: HTMLSelectElement) {
    const preserveFocus = document.activeElement === select;
    const locale = value === "browser" ? null : (value as InterfaceLocale);
    setFailure(null);
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
    } finally {
      if (preserveFocus)
        requestAnimationFrame(() => {
          if (
            controller.sessionKey() === owner &&
            select.isConnected &&
            !select.disabled &&
            document.activeElement === document.body
          )
            select.focus({ preventScroll: true });
        });
    }
  }
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="ml-4 block text-sm font-medium">
        {uiText("webPreferences:language")}
      </label>
      {snapshot.status === "error" ? (
        <div role="status" className="text-sm">
          {uiText("webPreferences:read_failed")}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void controller.refresh()}
          >
            {uiText("webPreferences:retry")}
          </Button>
        </div>
      ) : (
        <>
          <select
            id={id}
            className="min-h-12 w-full rounded-2xl border border-border bg-surface px-4 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
            value={snapshot.preference ?? "browser"}
            disabled={snapshot.saving || snapshot.refreshing}
            onChange={(event) =>
              void save(event.target.value, event.currentTarget)
            }
          >
            <option value="browser">{uiText("webPreferences:browser")}</option>
            {options.map((locale) => (
              <option key={locale} value={locale}>
                {names[locale]}
              </option>
            ))}
            {unavailable && snapshot.preference && (
              <option value={snapshot.preference} disabled>
                {names[snapshot.preference]} (
                {uiText("webPreferences:unavailable")})
              </option>
            )}
          </select>
          {unavailable && (
            <p
              role="status"
              className="mx-4 text-xs leading-5 text-foreground-muted"
            >
              {uiText("webPreferences:fallback", {
                language: names[snapshot.locale]
              })}
            </p>
          )}
          {failure === owner && (
            <p role="alert" className="mx-4 text-xs leading-5 text-danger">
              {uiText("webPreferences:save_failed")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
