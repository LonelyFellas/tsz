"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@tsz/ui/components";
import styles from "./SearchHistory.module.css";

export function SearchHistory({
  terms,
  onSearch,
  onRemove
}: {
  terms: string[];
  onSearch: (term: string) => void;
  onRemove: (term: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const updateEdges = () => {
      const left = element.scrollLeft > 1;
      const right =
        element.scrollWidth - element.clientWidth - element.scrollLeft > 1;
      setEdges((current) =>
        current.left === left && current.right === right
          ? current
          : { left, right }
      );
    };
    updateEdges();
    element.addEventListener("scroll", updateEdges, { passive: true });
    const observer = new ResizeObserver(updateEdges);
    observer.observe(element);
    observer.observe(element.firstElementChild!);
    return () => {
      element.removeEventListener("scroll", updateEdges);
      observer.disconnect();
    };
  }, [terms]);

  function handleScroll(direction: number) {
    if (direction < 0 ? !edges.left : !edges.right) return;
    const element = scrollRef.current;
    if (!element) return;
    element.scrollBy({
      left: direction * element.clientWidth * 0.75,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth"
    });
  }

  return (
    <div className={`relative mt-4 ${styles.root}`}>
      <div
        ref={scrollRef}
        aria-label="搜索历史"
        className={`max-w-full scroll-px-12 overflow-x-auto pb-2 ${styles.scroller}`}
        style={{
          maskImage:
            edges.left || edges.right
              ? `linear-gradient(to right, ${edges.left ? "transparent" : "black"}, black 24px, black calc(100% - 24px), ${edges.right ? "transparent" : "black"})`
              : undefined
        }}
      >
        <div className="flex w-max gap-2">
          {terms.map((term) => (
            <div
              key={term}
              className="inline-flex shrink-0 items-center rounded-full border border-border bg-surface"
            >
              <button
                type="button"
                title={term}
                className="min-h-11 max-w-48 truncate rounded-l-full py-2 pl-4 pr-1 text-sm hover:text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                onClick={() => onSearch(term)}
              >
                {term}
              </button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`删除历史 ${term}`}
                className="focus-visible:-outline-offset-2"
                onClick={() => onRemove(term)}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      </div>
      {(edges.left || edges.right) && (
        <>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="向左滚动搜索历史"
            aria-disabled={!edges.left}
            tabIndex={edges.left ? 0 : -1}
            onClick={() => handleScroll(-1)}
            className={`${styles.arrow} left-0 bg-transparent hover:bg-transparent hover:text-primary focus-visible:-outline-offset-2`}
          >
            <span className="pointer-events-none flex size-8 items-center justify-center rounded-full border border-border bg-surface">
              <ChevronLeft className="size-4" strokeWidth={1.8} aria-hidden />
            </span>
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="向右滚动搜索历史"
            aria-disabled={!edges.right}
            tabIndex={edges.right ? 0 : -1}
            onClick={() => handleScroll(1)}
            className={`${styles.arrow} right-0 bg-transparent hover:bg-transparent hover:text-primary focus-visible:-outline-offset-2`}
          >
            <span className="pointer-events-none flex size-8 items-center justify-center rounded-full border border-border bg-surface">
              <ChevronRight className="size-4" strokeWidth={1.8} aria-hidden />
            </span>
          </Button>
        </>
      )}
    </div>
  );
}
