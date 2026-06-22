// 绑定到本应用环境的 HttpClient + Endpoints。
import { createEndpoints, createHttpClient } from "@tsz/api-client";
import { env } from "./env";

const baseUrl = env.NEXT_PUBLIC_API_BASE_URL;

// 客户端实例:token 从浏览器存储读取。
const http = createHttpClient({
  baseUrl,
  getToken: () =>
    typeof document === "undefined"
      ? undefined
      : document.cookie
          .split("; ")
          .find((c) => c.startsWith("tsz_token="))
          ?.split("=")[1]
});

export const api = createEndpoints(http);
