import { useAdminTranslation } from "@/i18n";
import { Button, Card, PageHeader, Tabs } from "@tsz/ui/admin/display";
import { ArrowUpRightIcon } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
    <div className="settings-stack">
      <Card
        role="region"
        aria-labelledby="settings-preferences-title"
        title={
          <h2 id="settings-preferences-title">{t("settings_preferences")}</h2>
        }
      >
        <InterfaceLanguage />
      </Card>
      <Card
        role="region"
        aria-labelledby="settings-security-title"
        title={<h2 id="settings-security-title">{t("settings_security")}</h2>}
      >
        <div className="settings-row">
          <div className="settings-row__label">{t("login_password")}</div>
          <Button onClick={() => navigate("/change-password")}>
            {t("account_change_password")}{" "}
            <ArrowUpRightIcon aria-hidden="true" />
          </Button>
        </div>
      </Card>
    </div>
  );
  return (
    <div className="profile-settings">
      <PageHeader title={t("account_settings")} />
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
              label: t("settings_preferences_tab"),
              children: preferences
            },
            {
              key: "accounts",
              label: t("settings_model_accounts"),
              children: (
                <Card aria-label={t("settings_model_accounts")} role="region">
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
                </Card>
              )
            },
            {
              key: "models",
              label: t("settings_question_model"),
              children: (
                <Card aria-label={t("settings_question_model")} role="region">
                  <OpenCodeModels adminId={profile.id} />
                </Card>
              )
            }
          ]}
        />
      ) : (
        preferences
      )}
    </div>
  );
}
