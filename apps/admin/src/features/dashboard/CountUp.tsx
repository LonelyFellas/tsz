import { useEffect, useRef, useState } from "react";

const DURATION = 700;

function prefersReducedMotion() {
  return (
    typeof window === "undefined" ||
    !window.matchMedia ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * 概览数字滚动：首次从 0、刷新时从旧值缓动到新值。
 * 动画只作用于可见文本，屏幕阅读器始终读到最终值；减少动态效果时直接显示结果。
 */
export function CountUp({
  value,
  format,
  final
}: {
  value: number;
  format: (value: number) => string;
  /** 最终显示文本；默认 format(value)，用于不能经由 Number 精确表示的金额。 */
  final?: string;
}) {
  const target = final ?? format(value);
  const animatable = Number.isSafeInteger(value) && !prefersReducedMotion();
  const [shown, setShown] = useState(animatable ? 0 : value);
  const current = useRef(shown);

  useEffect(() => {
    if (!animatable) {
      current.current = value;
      setShown(value);
      return;
    }
    const from = current.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION);
      const eased = 1 - (1 - progress) ** 3;
      const next =
        progress === 1 ? value : Math.round(from + (value - from) * eased);
      current.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animatable, value]);

  return (
    <>
      <span aria-hidden="true">
        {shown === value || !animatable ? target : format(shown)}
      </span>
      <span className="sr-only">{target}</span>
    </>
  );
}
