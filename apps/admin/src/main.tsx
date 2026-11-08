import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { InterfacePreferencesProvider } from "@tsz/shared/i18n/react";
import { interfacePreferences } from "./lib/interface-preferences";
import { useAuthStore } from "./lib/auth";
import { router } from "./router";
import "./globals.css";
import { adminShellResources } from "./i18n";
import { AdminLocaleEffects } from "./i18n/effects";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("找不到 #root 挂载点");

function AdminApp() {
  const sessionKey = useAuthStore(() => interfacePreferences.sessionKey());
  return (
    <InterfacePreferencesProvider
      controller={interfacePreferences}
      sessionKey={sessionKey}
      resources={adminShellResources}
    >
      <AdminLocaleEffects />
      <RouterProvider router={router} />
    </InterfacePreferencesProvider>
  );
}

createRoot(rootEl).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>
);
