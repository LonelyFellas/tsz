import type { Config } from "tailwindcss";

// 语义色：值来自 CSS 变量（见 globals.css 的 :root）。
// admin 仅浅色（不做暗黑切换），但共享的 @tsz/ui 组件用了这些语义类,
// 故此处必须同样声明,否则按钮/卡片颜色会落空。值与 web 的浅色一致。
const semantic = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: semantic("background"),
        surface: semantic("surface"),
        muted: semantic("muted"),
        foreground: semantic("foreground"),
        "foreground-muted": semantic("foreground-muted"),
        "foreground-subtle": semantic("foreground-subtle"),
        border: semantic("border"),
        primary: semantic("primary"),
        "primary-foreground": semantic("primary-foreground"),
        "primary-muted": semantic("primary-muted"),
        success: semantic("success"),
        danger: semantic("danger")
      }
    }
  },
  plugins: []
};

export default config;
