import type { Dialect } from "@tsz/types";

/** 用于“英式词形”“美式语法结构”等组合文案，避免重复“英语”。 */
export const DIALECT_SHORT_LABEL: Record<Dialect, string> = {
  uk: "英式",
  us: "美式",
  common: "英美通用"
};
