import { env } from "./env";

// 站点级 SEO 常量的单一来源:title/description/OG/结构化数据等都从这里取,
// 避免文案散落多处不一致。面向 C 端,文案需含核心关键词且与落地页一致。
export const site = {
  name: "天生会背",
  // 用于 <title> 模板与 OG 的完整品牌定位语。
  fullName: "天生会背 — 智能英语单词学习平台",
  // 130 字内,含核心关键词,与首页 Hero 文案保持一致。
  description:
    "天生会背是面向师生的智能英语单词学习平台,依据艾宾浩斯遗忘曲线科学安排复习,帮助学生高效记忆、教师轻松布置与统计。",
  keywords: [
    "英语单词",
    "背单词",
    "单词记忆",
    "遗忘曲线",
    "词汇学习",
    "英语学习平台",
    "师生",
    "天生会背"
  ],
  locale: "zh_CN",
  // 规范站点地址,末尾不带斜杠。
  url: env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, ""),
  // 品牌主色(Apple 风蓝),用于 manifest theme 与动态生成的图标/OG。
  themeColor: "#0071e3"
} as const;
