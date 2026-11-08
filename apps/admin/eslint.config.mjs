// 平台后台已从 Next 迁到 Vite SPA。用共享的 React flat config：在库配置
// （typescript-eslint recommended + prettier）之上补 React Hooks 规则
// （rules-of-hooks + exhaustive-deps），恢复迁离 eslint-config-next 后丢失的 Hooks 检查。
import react from "@tsz/config/eslint.react.js";

export default [
  ...react,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "antd",
                "antd/*",
                "@ant-design/*",
                "@mui/*",
                "@emotion/*"
              ],
              message:
                "后台使用 @tsz/ui/admin/*；界面规范见 apps/admin/style.md。"
            }
          ]
        }
      ]
    }
  }
];
