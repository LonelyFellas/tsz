import { useAdminTranslation } from "@/i18n";
import { Button, PageHeader, Tabs } from "@tsz/ui/admin/display";
import {
  SlidersHorizontalIcon,
  KeyRoundIcon,
  CpuIcon,
  LanguagesIcon,
  ShieldCheckIcon,
  CableIcon,
  ArrowUpRightIcon
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DialectPreference } from "@/features/settings/DialectPreference";
import { OpenCodeConnection } from "@/features/ai-ledger/OpenCodeConnection";
import { ChatGPTConnection } from "@/features/ai-ledger/ChatGPTConnection";
import { OpenCodeModels } from "@/features/ai-ledger/OpenCodeModels";
import { useAuthStore } from "@/lib/auth";
import "./profile-settings.css";
import { InterfaceLanguage } from "@/features/settings/InterfaceLanguage";

export function ProfileSettingsPage() {
  const { t } = useAdminTranslation();
  const profile = useAuthStore((state) => state.profile);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const isSuper = profile?.role === "super_admin";
  const requested = params.get("section");
  const section =
    isSuper && (requested === "accounts" || requested === "models")
      ? requested
      : "preferences";
  const preferences = (
    <>
      <section
        className="settings-section"
        aria-labelledby="settings-preferences-title"
      >
        <header className="settings-section__heading">
          <span className="settings-section__icon">
            <LanguagesIcon aria-hidden="true" />
          </span>
          <h2 id="settings-preferences-title">{t("settings_preferences")}</h2>
        </header>
        <InterfaceLanguage />
        <DialectPreference />
      </section>
      <section
        className="settings-section"
        aria-labelledby="settings-security-title"
      >
        <header className="settings-section__heading">
          <span className="settings-section__icon">
            <ShieldCheckIcon aria-hidden="true" />
          </span>
          <h2 id="settings-security-title">{t("settings_security")}</h2>
        </header>
        <div className="settings-row">
          <div className="settings-row__label">{t("login_password")}</div>
          <Button onClick={() => navigate("/change-password")}>
            {t("account_change_password")}{" "}
            <ArrowUpRightIcon aria-hidden="true" />
          </Button>
        </div>
      </section>
    </>
  );
  return (
    <div className="profile-settings">
      <PageHeader
        className="profile-settings__header"
        title={t("account_settings")}
      />
      {isSuper && profile ? (
        <Tabs
          key={profile.id}
          className="profile-settings__tabs"
          tabPlacement="top"
          activeKey={section}
          destroyOnHidden={false}
          onChange={(key) =>
            setParams(
              (previous) => {
                const next = new URLSearchParams(previous);
                if (key === "preferences") next.delete("section");
                else next.set("section", key);
                return next;
              },
              { replace: true }
            )
          }
          items={[
            {
              key: "preferences",
              label: (
                <span className="profile-settings__tab-label">
                  <SlidersHorizontalIcon aria-hidden="true" />

                  {t("settings_preferences_tab")}
                </span>
              ),
              children: preferences
            },
            {
              key: "accounts",
              label: (
                <span className="profile-settings__tab-label">
                  <KeyRoundIcon aria-hidden="true" />

                  {t("settings_model_accounts")}
                </span>
              ),
              children: (
                <section
                  className="settings-section"
                  aria-labelledby="settings-accounts-title"
                >
                  <header className="settings-section__heading">
                    <span className="settings-section__icon">
                      <CableIcon aria-hidden="true" />
                    </span>
                    <h2 id="settings-accounts-title">
                      {t("settings_model_accounts")}
                    </h2>
                  </header>
                  <div className="settings-provider-list">
                    <ChatGPTConnection
                      key={`chatgpt:${profile.id}`}
                      adminId={profile.id}
                    />
                    <OpenCodeConnection
                      key={`opencode:${profile.id}`}
                      adminId={profile.id}
                    />
                  </div>
                </section>
              )
            },
            {
              key: "models",
              label: (
                <span className="profile-settings__tab-label">
                  <CpuIcon aria-hidden="true" />

                  {t("settings_question_model")}
                </span>
              ),
              children: (
                <section
                  className="settings-section"
                  aria-labelledby="settings-models-title"
                >
                  <header className="settings-section__heading">
                    <span className="settings-section__icon">
                      <CpuIcon aria-hidden="true" />
                    </span>
                    <h2 id="settings-models-title">
                      {t("settings_question_model")}
                    </h2>
                  </header>
                  <OpenCodeModels adminId={profile.id} />
                </section>
              )
            }
          ]}
        />
      ) : (
        <div className="profile-settings__content">{preferences}</div>
      )}
    </div>
  );
}
