/// <reference types="next/image-types/global" />
// 由 scripts/optimize-home-images.mjs 生成；静态导入由 Next 添加内容哈希。
const ocean640avif = new URL("../assets/ocean-640.avif", import.meta.url)
  .pathname;
const ocean960avif = new URL("../assets/ocean-960.avif", import.meta.url)
  .pathname;
const ocean1280avif = new URL("../assets/ocean-1280.avif", import.meta.url)
  .pathname;
const ocean1400avif = new URL("../assets/ocean-1400.avif", import.meta.url)
  .pathname;
import ocean640webp from "../assets/ocean-640.webp";
import ocean960webp from "../assets/ocean-960.webp";
import ocean1280webp from "../assets/ocean-1280.webp";
import ocean1400webp from "../assets/ocean-1400.webp";
const wave640avif = new URL("../assets/wave-640.avif", import.meta.url)
  .pathname;
const wave960avif = new URL("../assets/wave-960.avif", import.meta.url)
  .pathname;
const wave1280avif = new URL("../assets/wave-1280.avif", import.meta.url)
  .pathname;
const wave1400avif = new URL("../assets/wave-1400.avif", import.meta.url)
  .pathname;
import wave640webp from "../assets/wave-640.webp";
import wave960webp from "../assets/wave-960.webp";
import wave1280webp from "../assets/wave-1280.webp";
import wave1400webp from "../assets/wave-1400.webp";
const shore640avif = new URL("../assets/shore-640.avif", import.meta.url)
  .pathname;
const shore960avif = new URL("../assets/shore-960.avif", import.meta.url)
  .pathname;
const shore1280avif = new URL("../assets/shore-1280.avif", import.meta.url)
  .pathname;
const shore1400avif = new URL("../assets/shore-1400.avif", import.meta.url)
  .pathname;
import shore640webp from "../assets/shore-640.webp";
import shore960webp from "../assets/shore-960.webp";
import shore1280webp from "../assets/shore-1280.webp";
import shore1400webp from "../assets/shore-1400.webp";

export const HOME_IMAGES = {
  ocean: {
    avif: `${ocean640avif} 640w, ${ocean960avif} 960w, ${ocean1280avif} 1280w, ${ocean1400avif} 1400w`,
    webp: `${ocean640webp.src} 640w, ${ocean960webp.src} 960w, ${ocean1280webp.src} 1280w, ${ocean1400webp.src} 1400w`,
    fallback: ocean1400webp
  },
  wave: {
    avif: `${wave640avif} 640w, ${wave960avif} 960w, ${wave1280avif} 1280w, ${wave1400avif} 1400w`,
    webp: `${wave640webp.src} 640w, ${wave960webp.src} 960w, ${wave1280webp.src} 1280w, ${wave1400webp.src} 1400w`,
    fallback: wave1400webp
  },
  shore: {
    avif: `${shore640avif} 640w, ${shore960avif} 960w, ${shore1280avif} 1280w, ${shore1400avif} 1400w`,
    webp: `${shore640webp.src} 640w, ${shore960webp.src} 960w, ${shore1280webp.src} 1280w, ${shore1400webp.src} 1400w`,
    fallback: shore1400webp
  }
} as const;
