import { Button, Grid, Tabs, Typography } from "antd";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DialectPreference } from "@/features/settings/DialectPreference";
import { OpenCodeConnection } from "@/features/ai-ledger/OpenCodeConnection";
import { ChatGPTConnection } from "@/features/ai-ledger/ChatGPTConnection";
import { OpenCodeModels } from "@/features/ai-ledger/OpenCodeModels";
import { useAuthStore } from "@/lib/auth";
import "./profile-settings.css";

export function ProfileSettingsPage() {
  const profile = useAuthStore((state) => state.profile);
  const screens = Grid.useBreakpoint();
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
          <h2 id="settings-preferences-title">使用偏好</h2>
        </header>
        <DialectPreference />
      </section>
      <section
        className="settings-section"
        aria-labelledby="settings-security-title"
      >
        <header className="settings-section__heading">
          <h2 id="settings-security-title">账号安全</h2>
        </header>
        <div className="settings-row">
          <div className="settings-row__label">登录密码</div>
          <Button onClick={() => navigate("/change-password")}>修改密码</Button>
        </div>
      </section>
    </>
  );
  return (
    <div className="profile-settings">
      <header className="profile-settings__header">
        <Typography.Title level={2}>个人设置</Typography.Title>
      </header>
      {isSuper && profile ? (
        <Tabs
          key={profile.id}
          className="profile-settings__tabs"
          tabPlacement={screens.md ? "start" : "top"}
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
            { key: "preferences", label: "偏好设置", children: preferences },
            {
              key: "accounts",
              label: "模型账号",
              children: (
                <section
                  className="settings-section"
                  aria-labelledby="settings-accounts-title"
                >
                  <header className="settings-section__heading">
                    <h2 id="settings-accounts-title">模型账号</h2>
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
              label: "出题模型",
              children: (
                <section
                  className="settings-section"
                  aria-labelledby="settings-models-title"
                >
                  <header className="settings-section__heading">
                    <h2 id="settings-models-title">出题模型</h2>
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
