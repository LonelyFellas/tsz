// 共享 ESLint flat config 基础。各包/应用 import 后再追加自己的规则。
/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ]
    }
  }
];
