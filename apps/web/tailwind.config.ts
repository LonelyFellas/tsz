import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
    // 扫描共享 UI 包,使其 className 不被 purge。
    "../../packages/ui/src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      // 系统字体栈：零网络开销（不加载 CJK 网络字体，避免几 MB 体积）。
      // 先用各平台系统 Latin 字体，再回退到系统中文字体，渲染即时、无字体闪烁。
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Hiragino Sans GB"',
          '"Noto Sans CJK SC"',
          "sans-serif"
        ]
      }
    }
  },
  plugins: []
};

export default config;
