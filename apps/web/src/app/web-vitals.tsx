"use client";

import { useReportWebVitals } from "next/web-vitals";

// Core Web Vitals 采集（LCP / INP / CLS / FCP / TTFB）。
// 现状：仅开发环境打印，让性能优化有数据可依而非凭感觉。
// 接监控后：把 console 换成 navigator.sendBeacon 上报到后端/分析服务即可（见下）。
export function WebVitals() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[web-vitals] ${metric.name}`,
        Math.round(metric.value),
        metric.rating
      );
      return;
    }
    // 接监控时启用（sendBeacon 不阻塞主线程、页面卸载也能送达）：
    // navigator.sendBeacon?.(
    //   "/api/v1/metrics/web-vitals",
    //   JSON.stringify({ name: metric.name, value: metric.value, rating: metric.rating })
    // );
  });

  return null;
}
