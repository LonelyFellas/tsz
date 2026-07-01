// 非 Next 的 React 应用/包共享 flat config：在 lib 基础上补 React Hooks 规则，
// 恢复从 eslint-config-next 迁走后丢失的 Hooks 依赖/调用检查。
// 只启用两条经典规则（rules-of-hooks + exhaustive-deps），不引入 eslint-plugin-react-hooks
// v7 面向 React Compiler 的其余规则（use-memo / immutability / purity 等），避免大面积误报。
import reactHooks from "eslint-plugin-react-hooks";
import lib from "./eslint.lib.js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...lib,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn"
    }
  }
];
