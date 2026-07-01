import type { Config } from "tailwindcss";

// 语义色：值来自 CSS 变量（见 globals.css 的 :root / .dark）。
// 用 `rgb(var(--x) / <alpha-value>)` 让 bg-surface/80 这类透明度修饰仍可用。
const semantic = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`;

const config: Config = {
  // class 策略：由 <html class="dark"> 控制，配合前置内联脚本避免刷新闪烁。
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx}",
    // 扫描共享 UI 包,使其 className 不被 purge。
    "../../packages/ui/src/**/*.{ts,tsx}",
    // 但排除 shadcn 组件目录:web 不引用它们,且它们用的是 admin 专属的 hsl token
    // (bg-card/border-input/...),web 未定义这些色值——扫进来只会白扫,且一旦有人
    // 误在 web 引用会静默渲染成透明/黑色。web 迁 shadcn 时再放开这条排除。
    "!../../packages/ui/src/components/**"
  ],
  theme: {
    extend: {
      // 语义色板:组件一律用这些名字,主题切换时自动翻转。
      colors: {
        background: semantic("background"), // 页面底色
        surface: semantic("surface"), // 卡片/抬升面
        muted: semantic("muted"), // 次级填充(hover/标签底)
        foreground: semantic("foreground"), // 主文字
        "foreground-muted": semantic("foreground-muted"), // 次级文字
        "foreground-subtle": semantic("foreground-subtle"), // 三级/占位文字
        border: semantic("border"), // 描边/分隔线
        primary: semantic("primary"), // 品牌蓝
        "primary-foreground": semantic("primary-foreground"), // 品牌色上的文字
        "primary-muted": semantic("primary-muted"), // 品牌色浅底
        success: semantic("success"),
        danger: semantic("danger")
      },
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
