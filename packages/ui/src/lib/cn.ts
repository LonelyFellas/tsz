import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn 约定的类名合并：clsx 处理条件/数组，tailwind-merge 消解 Tailwind 冲突类
// （如同时出现 px-2 与 px-4 时保留后者）。所有 shadcn 组件的 className 都过它。
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
