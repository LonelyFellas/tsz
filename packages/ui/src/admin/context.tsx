import "./tokens.css";
import { createContext, useContext, type ReactNode } from "react";

const Disabled = createContext(false);
export function useAdminDisabled() {
  return useContext(Disabled);
}

export function AdminControls({
  componentDisabled,
  children
}: {
  componentDisabled?: boolean;
  children: ReactNode;
}) {
  const inherited = useAdminDisabled();
  return (
    <Disabled.Provider value={componentDisabled ?? inherited}>
      {children}
    </Disabled.Provider>
  );
}

export const adminTokens = {
  colorPrimaryBg: "var(--ui-color-primary-bg)",
  colorTextSecondary: "var(--ui-color-text-secondary)",
  colorSplit: "var(--ui-color-split)",
  colorBorderSecondary: "var(--ui-color-border-secondary)",
  colorBgContainer: "var(--ui-color-bg-container)",
  colorBgLayout: "var(--ui-color-bg-layout)",
  colorFillAlter: "var(--ui-color-fill-alter)",
  borderRadius: "var(--ui-border-radius)",
  borderRadiusLG: "var(--ui-border-radius-lg)"
};
