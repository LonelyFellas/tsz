import { defineWebMessages } from "../catalog";
export const webTheme = /* @__PURE__ */ defineWebMessages(
  "webTheme",
  {
    light: ["浅色", "淺色", "Light"],
    dark: ["深色", "深色", "Dark"],
    system: ["跟随系统", "跟隨系統", "System"],
    appearance: ["外观", "外觀", "Appearance"],
    switch_to_light_mode: [
      "切换到浅色模式",
      "切換到淺色模式",
      "Switch to light mode"
    ],
    switch_to_dark_mode: [
      "切换到深色模式",
      "切換到深色模式",
      "Switch to dark mode"
    ],
    light_mode: ["浅色模式", "淺色模式", "Light mode"],
    dark_mode: ["深色模式", "深色模式", "Dark mode"]
  } as const,
  {},
  {}
);
