# 首页词义示意图

`ocean.webp`、`wave.webp`、`shore.webp` 由内置 ImageGen 于 2026-10-28 生成，分别对应海洋俯瞰、近景海浪与平静沙岸。三个示例词使用独立图片，切词时同步切换。图片属于词义示意，不作为真实用户内容或产品功能截图。

ocean 原始图为 1672 × 941 PNG，交付为 1400 × 788 WebP（quality 88）；wave / shore 原始图为 1536 × 1024 PNG，交付为 1400 × 933 WebP（quality 86）。所有词面、音标、释义、例句和操作由真实 HTML 渲染。

## 页面加载版本

上述 WebP 保留为压缩源文件。首页实际使用 `src/features/home/assets/` 中预先生成的 640 / 960 / 1280 / 1400px AVIF（quality 60）和 WebP（quality 75，与原 Next 默认输出一致），按容器宽度与设备像素比选择；保留源图最大尺寸和裁剪方式。AVIF 优先，WebP 兼容回退，不在请求时转码。

资源通过 `hero-images.ts` 静态导入，构建时由 Next 添加内容哈希，复用 `/_next/static/` 的长期不可变缓存和部署资源保留机制。首图立即高优先级加载，其余图在首图解码完成（或失败）后加载；提前切词时立即请求所选图片。切换仍使用 240ms 淡入淡出，并尊重减少动态效果设置。加载时显示内嵌模糊预览，不额外请求占位图片。

在仓库根目录重新生成：

```sh
node scripts/optimize-home-images.mjs
pnpm exec prettier --write apps/web/src/features/home/components/hero-images.ts
```

脚本复用当前 Next 依赖中的 Sharp；生成资源已入库，普通构建无需重新压缩。

| 图片  | 源 WebP | AVIF 640px | AVIF 960px | AVIF 1280px | AVIF 1400px |
| ----- | ------- | ---------- | ---------- | ----------- | ----------- |
| ocean | 383 KiB | 45 KiB     | 92 KiB     | 143 KiB     | 196 KiB     |
| wave  | 296 KiB | 40 KiB     | 81 KiB     | 121 KiB     | 162 KiB     |
| shore | 245 KiB | 26 KiB     | 57 KiB     | 96 KiB      | 139 KiB     |

用户指定的视觉参考：[Apple 中国官网](https://www.apple.com.cn/)。采用其居中短标题、大幅产品主视觉和清晰分区的排版方法，不使用 Apple 的标志、产品图片或其他品牌素材。

## ocean 生成提示词

> A premium photographic website asset showing the meaning of the English word 'ocean'. Straight-down aerial photograph of a powerful turquoise ocean wave washing onto a pristine pale sand beach. Rich deep blue open water in the left two thirds, intricate white foam and translucent cyan wave texture sweeping diagonally from upper right toward lower left, a small clean warm sand area on the right edge. Natural daylight, exceptional detailed water texture, refined realistic color, high-end editorial photography. Wide landscape composition, no sky, no horizon, no people, no objects, no buildings, no text, no logos, no labels, no borders. Fill the whole frame with ocean and shore. The image must be photorealistic, not a 3D render or illustration. Designed to crop beautifully inside a large vocabulary preview on a minimalist white website.

## wave 生成提示词

> A premium photorealistic editorial photograph illustrating the English vocabulary word 'wave'. A single powerful turquoise ocean wave curling and breaking, viewed close from sea level. The translucent blue-green face and crisp white crest of the wave dominate the center of the frame, with a little calm deep blue water in the foreground and a thin clear pale sky at the very top. Clearly a breaking wave, NOT an aerial beach image. Natural daylight, highly detailed water and sea spray, realistic colors, exceptional photographic quality for a minimalist vocabulary-learning website. Landscape composition, strong centered subject that stays identifiable in both landscape and near-square crops. No people, surfers, boats, animals, buildings, text, labels, logos, borders, UI or illustrations.

## shore 生成提示词

> A premium photorealistic editorial photograph illustrating the English vocabulary word 'shore'. A peaceful long sandy seashore viewed from a standing person's eye level, with pale warm sand filling most of the lower foreground, the shoreline leading gently into the distance, calm turquoise sea along the left and a clear light blue sky above the horizon. A very thin line of white foam at the water's edge; emphasize the LAND MEETING THE WATER, not a large breaking wave. Refined natural daylight, clean composition, believable subtle sand texture, high-end editorial photography for a minimalist vocabulary-learning website. Landscape composition with the shoreline visible through the center, suitable for both landscape and near-square crops. No people, footprints, chairs, umbrellas, buildings, boats, animals, text, labels, logos, borders, UI or illustrations.
