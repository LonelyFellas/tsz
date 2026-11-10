import "./tokens.css";
import { createContext, useContext, type ReactNode } from "react";

const Disabled = createContext(false);
type AdminControlSize = "small" | "middle" | "large";
const ControlSize = createContext<AdminControlSize | undefined>(undefined);
export function useAdminDisabled() {
  return useContext(Disabled);
}
export function useAdminControlSize(size?: AdminControlSize) {
  const inherited = useContext(ControlSize);
  return size ?? inherited;
}

export function AdminControls({
  componentDisabled,
  componentSize,
  children
}: {
  componentDisabled?: boolean;
  componentSize?: AdminControlSize;
  children: ReactNode;
}) {
  const inherited = useAdminDisabled();
  const size = useAdminControlSize(componentSize);
  return (
    <Disabled.Provider value={componentDisabled ?? inherited}>
      <ControlSize.Provider value={size}>{children}</ControlSize.Provider>
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
