import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { browserQueryDefaults } from "@tsz/shared";
import { App as AntApp, ConfigProvider, theme as antTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { Outlet } from "react-router-dom";
import { useAdminSessionRestore } from "@/features/auth/hooks/useAdminSessionRestore";

// 单例 QueryClient：全局唯一，避免每次渲染重建缓存。默认项（staleTime 等）取自
// @tsz/shared 的 browserQueryDefaults，与 web 共用同一份，避免两处漂移。
const queryClient = new QueryClient({ defaultOptions: browserQueryDefaults });

// antd 全局主题。色值与字体来自品牌规范（语雀《天生会背® 开发文档》第 1 章视觉系统），
// 不是就手挑的。locale=zh_CN 让分页、表格空态、日期选择器等内建文案走中文。
//
// 只覆盖种子变量(SeedToken)，由 antd 自己派生下游的 map/alias token。
// 试过顺手把 boxShadow 三档 alias token 也覆盖掉，已撤回：它只驱动 Modal、
// Dropdown、message 等一部分组件，Card / Drawer / Popover 走的是另外三个 token，
// 结果是浮层阴影一半新一半旧；而且 antd 的运行时样式注入在 <link> 之前，
// 业务 CSS 里 15 处手写 box-shadow 反而压过 token。要统一阴影得连那些一起改。
const antdTheme = {
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
    // 保持系统字体栈。规范要求西文用 Ubuntu，但实测撤回：fontsource 分发的 Ubuntu
    // 六个子集都不含 ə ʌ θ ŋ 这几个常用国际音标字形，全局启用会让一串音标里
    // 部分字符回退到系统字体、基线与 x-height 对不齐，而音标是词典后台的核心内容。
    // 另有两处未解的冲突：packages/voice-editor 已自托管同名 "Ubuntu" 的未裁剪 TTF
    // （666 KB），两套 @font-face 抢同一 family，谁生效取决于 CSS chunk 注入顺序。
    // 要用 Ubuntu 需先给音标场景单独指定字体栈，那是独立的一块改动。
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',

    // ── 形状 ────────────────────────────────────────────────
    // 与品牌标记的圆角语言一致：那个「天」字方块的圆角占边长 18.75%。
    borderRadius: 8
  }
};

// 根布局 element：QueryClientProvider + antd ConfigProvider + 会话恢复，包住所有路由。
// 挂载时用 admin refresh cookie 静默恢复会话，写入 profile / level / hydrated。
// AntApp 提供 message/modal/notification 的 context 版（v6 起不建议再用静态方法）。
export function RootProviders() {
  useAdminSessionRestore();
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={zhCN} theme={antdTheme}>
        <AntApp>
          <Outlet />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
