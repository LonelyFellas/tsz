import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import type { RefObject } from "react";
import {
  EMPTY_LIAISON_LAYOUT,
  buildLiaisonArcs,
  createGlyphMeasurer,
  isSameLiaisonLayout,
  type LiaisonLayout,
  type LiaisonLinkElements
} from "./liaisonGeometry";

/**
 * 在容器排版稳定后量出连读弧，并在容器尺寸变化（换行位置随之变化）时重量。
 *
 * `collect` 由调用方给出每条连读两端的字母元素；它变了就重量，所以调用方要把
 * 会挪动字母位置的状态（文本、渲染模式）都算进它的依赖里。`measure` 本身保持
 * 稳定：ResizeObserver 与字体监听只在挂载时建一次，不随每次击键拆建。
 */
export function useLiaisonArcs(
  containerRef: RefObject<HTMLElement | null>,
  collect: () => Array<LiaisonLinkElements | undefined>
): LiaisonLayout {
  const [layout, setLayout] = useState<LiaisonLayout>(EMPTY_LIAISON_LAYOUT);
  const collectRef = useRef(collect);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const next = buildLiaisonArcs(
      container,
      collectRef.current(),
      createGlyphMeasurer(container)
    );
    // 量出来一样就沿用旧对象：零连读的句子每次击键不该多渲染一遍标注带。
    setLayout((previous) =>
      isSameLiaisonLayout(previous, next) ? previous : next
    );
  }, [containerRef]);

  // collect 变了（文本、画笔、连读列表变化）就重量；先同步 ref 再量，量的是最新的。
  useLayoutEffect(() => {
    collectRef.current = collect;
    measure();
  }, [collect, measure]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, measure]);

  // 网页字体晚于首帧到位（font-display: swap）时字形宽高都会变，容器宽度却未必变，
  // ResizeObserver 不会触发，得在字体加载完成时再量一次。
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts?.addEventListener) return;
    fonts.addEventListener("loadingdone", measure);
    return () => fonts.removeEventListener("loadingdone", measure);
  }, [measure]);

  return layout;
}
