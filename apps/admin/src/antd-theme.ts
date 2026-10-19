import { theme as antTheme } from "antd";

// antd 全局主题。色值与字体来自品牌规范（语雀《天生会背® 开发文档》第 1 章视觉系统），
// 不是就手挑的。locale=zh_CN 让分页、表格空态、日期选择器等内建文案走中文。
//
// 只覆盖种子变量(SeedToken)，由 antd 自己派生下游的 map/alias token。
// 试过顺手把 boxShadow 三档 alias token 也覆盖掉，已撤回：它只驱动 Modal、
// Dropdown、message 等一部分组件，Card / Drawer / Popover 走的是另外三个 token，
// 结果是浮层阴影一半新一半旧；而且 antd 的运行时样式注入在 <link> 之前，
// 业务 CSS 里 15 处手写 box-shadow 反而压过 token。要统一阴影得连那些一起改。
//
// 单独成文件是因为路由错误兜底页（errorElement）渲染在 RootProviders 之外，
// 拿不到 providers.tsx 里的 ConfigProvider；那页需要同一套品牌色，不能退回 antd 默认蓝。
export const antdTheme = {
  algorithm: antTheme.defaultAlgorithm,
  token: {
    // ── 颜色 ────────────────────────────────────────────────
    // 品牌主色调「克莱因蓝」，规范里注明用于重要标志和引导符。
    // 此前用的 #0071e3 是 Apple 蓝，并不在品牌色板内。
    colorPrimary: "#2053FF",
    // link 型按钮/链接不从 colorPrimary 派生（antd 走 colorInfo 那一系），
    // 只设 colorPrimary 会让表格里的行内动作退回默认蓝，与主按钮撞成两种蓝。
    colorInfo: "#2053FF",
    // 状态色（warning / error / success）一律保留 antd 默认，不套品牌色板：
    // 品牌色板里压根没有绿色；「电子粉红 #FC007A」当错误色会削弱「危险」的通用认知；
    // 而「铬黄 #FFCD20」实测过——规范写明它只作警示文字的**背景色**，可 antd 的
    // colorWarning 种子会同时驱动前景、边框、背景三条派生链，实测派生结果是
    // 前景 #ffcd20（白底对比度 1.50，读不出来）、边框 #fff39c（1.13）、背景 #fffeed（1.02），
    // Alert 的警告态会退化成一个看不见的框。铬黄要用就在具体组件里当背景色用，不当种子。

    // ── 字体 ────────────────────────────────────────────────
    fontFamily: "var(--tsz-font-text)",

    // ── 形状 ────────────────────────────────────────────────
    // 与品牌标记的圆角语言一致：那个「天」字方块的圆角占边长 18.75%。
    borderRadius: 8
  }
};
