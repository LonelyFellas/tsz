import { defineWebMessages } from "../../catalog";
export const webAuthSession = /* @__PURE__ */ defineWebMessages(
  "webAuthSession",
  {
    loading: ["加载中...", "載入中...", "Loading..."],
    redirecting_to_phone_binding: [
      "正在前往手机号绑定…",
      "正在前往手機號繫結…",
      "Redirecting to phone binding…"
    ]
  } as const,
  {},
  {}
);
