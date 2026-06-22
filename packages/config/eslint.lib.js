// 非 Next 的库包(ui / types / shared / api-client)共享 ESLint flat config。
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import base from "./eslint.base.js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  { ignores: ["dist/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
  ...base,
  // 关闭与 Prettier 冲突的格式化规则,放最后。
  prettier
];
