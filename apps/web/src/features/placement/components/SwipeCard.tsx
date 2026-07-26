"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// 滑卡手势:左滑=认识,右滑=不认识(方向常量见 fly 的 dir)。
// 误滑三层防护之一、之二在此:距离阈值(不足弹回)+ 方向印章渐显;
// 之三(按钮备选)由 QuizScreen 经 SwipeCardHandle.fly 触发同样的动画。

/** 触发阈值 px(产品方案 §7.5);不足此距离松手弹回,不算作答。 */
const SWIPE_DIST = 90;
const FLY_MS = 300;

export interface SwipeCardHandle {
  /** 以对应方向的飞出动画作答(底部按钮 / 键盘 ←→ 共用入口)。 */
  fly(known: boolean): void;
}

interface SwipeCardProps {
  word: string;
  /** 提交中 / 弹窗打开时锁输入。 */
  disabled?: boolean;
  /** 首次测试第一题:卡片轻晃提示可滑动。 */
  showTeach?: boolean;
  onAnswer: (known: boolean) => void;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export const SwipeCard = forwardRef<SwipeCardHandle, SwipeCardProps>(
  function SwipeCard(
    { word, disabled = false, showTeach = false, onAnswer },
    handleRef
  ) {
    const cardRef = useRef<HTMLDivElement>(null);
    const knowRef = useRef<HTMLSpanElement>(null);
    const idkRef = useRef<HTMLSpanElement>(null);
    const dragRef = useRef<{ x: number; y: number; dx: number } | null>(null);
    const flyingRef = useRef(false);
    // 飞出动画的作答定时器:卸载时必须清掉,否则退出测试后孤儿回调
    // 仍会向已清空的作答队列推入过期作答。
    const flyTimerRef = useRef<number | null>(null);
    // 回调/禁用状态走 ref,避免手势闭包捕获过期值
    const disabledRef = useRef(disabled);
    disabledRef.current = disabled;
    const answerRef = useRef(onAnswer);
    answerRef.current = onAnswer;

    function setStamps(dx: number) {
      const p = Math.min(1, Math.abs(dx) / SWIPE_DIST);
      if (knowRef.current)
        knowRef.current.style.opacity = dx < 0 ? String(p) : "0";
      if (idkRef.current)
        idkRef.current.style.opacity = dx > 0 ? String(p) : "0";
    }

    function fly(known: boolean) {
      if (flyingRef.current || disabledRef.current) return;
      const el = cardRef.current;
      if (!el || prefersReducedMotion()) {
        answerRef.current(known);
        return;
      }
      flyingRef.current = true;
      const dir = known ? -1 : 1; // 认识飞左,不认识飞右
      (known ? knowRef : idkRef).current?.style.setProperty("opacity", "1");
      el.style.transition = `transform ${FLY_MS}ms ease-in, opacity ${FLY_MS}ms ease-in`;
      el.style.transform = `translate(${dir * 480}px, -30px) rotate(${dir * 22}deg)`;
      el.style.opacity = "0";
      flyTimerRef.current = window.setTimeout(
        () => answerRef.current(known),
        FLY_MS - 10
      );
    }

    useImperativeHandle(handleRef, () => ({ fly }));

    // 卸载清理:取消未触发的飞出作答定时器
    useEffect(
      () => () => {
        if (flyTimerRef.current !== null)
          window.clearTimeout(flyTimerRef.current);
      },
      []
    );

    // 新词进场:复位变换 + 入场动画
    useEffect(() => {
      const el = cardRef.current;
      if (!el) return;
      flyingRef.current = false;
      dragRef.current = null;
      el.style.transition = "none";
      el.style.transform = "";
      el.style.opacity = "1";
      setStamps(0);
      if (!prefersReducedMotion()) {
        el.animate?.(
          [
            { opacity: 0, transform: "translateY(18px) scale(0.95)" },
            { opacity: 1, transform: "none" }
          ],
          { duration: 240, easing: "cubic-bezier(.2,.9,.3,1.1)" }
        );
      }
    }, [word]);

    // 首题手势教学:轻晃一次
    useEffect(() => {
      if (!showTeach || prefersReducedMotion()) return;
      const anim = cardRef.current?.animate?.(
        [
          { transform: "none" },
          { transform: "translateX(-26px) rotate(-2deg)" },
          { transform: "translateX(22px) rotate(2deg)" },
          { transform: "none" }
        ],
        { duration: 1100, delay: 500, easing: "ease-in-out" }
      );
      return () => anim?.cancel();
    }, [showTeach]);

    function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
      if (flyingRef.current || disabledRef.current) return;
      dragRef.current = { x: e.clientX, y: e.clientY, dx: 0 };
      cardRef.current?.setPointerCapture(e.pointerId);
      if (cardRef.current) cardRef.current.style.transition = "none";
    }
    function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
      const d = dragRef.current;
      const el = cardRef.current;
      if (!d || !el) return;
      d.dx = e.clientX - d.x;
      const dy = (e.clientY - d.y) * 0.25;
      el.style.transform = `translate(${d.dx}px, ${dy}px) rotate(${d.dx * 0.07}deg)`;
      setStamps(d.dx);
    }
    function endDrag() {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      if (Math.abs(d.dx) >= SWIPE_DIST) {
        fly(d.dx < 0);
        return;
      }
      const el = cardRef.current;
      if (el) {
        el.style.transition = "transform 320ms cubic-bezier(.2,.9,.3,1.15)";
        el.style.transform = "";
      }
      setStamps(0);
    }

    return (
      <div
        ref={cardRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="absolute inset-0 z-10 flex touch-none cursor-grab select-none flex-col items-center justify-center gap-4 rounded-3xl bg-surface shadow-lg active:cursor-grabbing"
      >
        <span
          ref={knowRef}
          aria-hidden
          className="pointer-events-none absolute left-5 top-5 -rotate-12 rounded-lg border-2 border-primary bg-primary-muted px-3 py-1 text-lg font-bold text-primary opacity-0"
        >
          认识
        </span>
        <span
          ref={idkRef}
          aria-hidden
          className="pointer-events-none absolute right-5 top-5 rotate-12 rounded-lg border-2 border-foreground-subtle bg-muted px-3 py-1 text-lg font-bold text-foreground-muted opacity-0"
        >
          不认识
        </span>
        <span className="max-w-full break-words px-6 text-center font-serif text-4xl">
          {word}
        </span>
        <span className="text-xs text-foreground-subtle">
          你认识这个单词吗？
        </span>
      </div>
    );
  }
);
