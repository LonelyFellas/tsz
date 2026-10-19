// 品牌字标前的图形：两道相对的弧线托在一条底线上。
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      className={`h-[18px] w-7 shrink-0 ${className}`}
      aria-hidden
    >
      <path d="M10.5 4A5 5 0 1 0 11.3 10" />
      <path d="M17.5 4A5 5 0 1 1 16.7 10" />
      <path d="M3 15.5h22" />
    </svg>
  );
}
