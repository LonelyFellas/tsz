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
  colorPrimaryBg: "#edf2ff",
  colorTextSecondary: "#667085",
  colorSplit: "#e4e7ec",
  colorBorderSecondary: "#e4e7ec",
  colorBgContainer: "#fff",
  colorBgLayout: "#f6f7f9",
  colorFillAlter: "#f8f9fb",
  borderRadius: 8,
  borderRadiusLG: 12
};
