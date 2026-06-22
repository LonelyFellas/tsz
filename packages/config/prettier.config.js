// 共享 Prettier 配置,被根目录与各包引用。
/** @type {import("prettier").Config} */
export default {
  printWidth: 80,
  tabWidth: 2,
  semi: true,
  singleQuote: false,
  trailingComma: "none",
  arrowParens: "always"
};
