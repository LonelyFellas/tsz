import { z } from "zod";

// 只校验浏览器可见变量(NEXT_PUBLIC_*)。服务端私有变量另列一组。
const schema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z
    .string()
    .url()
    .default("http://localhost:8080/api")
});

// Next 会内联 NEXT_PUBLIC_* 到打包产物,必须逐个显式引用(不能用 process.env 动态键)。
export const env = schema.parse({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL
});
