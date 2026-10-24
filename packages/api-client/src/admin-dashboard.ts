import type { AdminDashboardOverview } from "@tsz/types";
import { validateRuntimeSchema } from "./runtime-schema";

/** 看板聚合响应是跨域汇总；空对象或字段缺失必须落到错误态，不能渲染成假零值。 */
export function decodeAdminDashboardOverview(
  value: unknown
): AdminDashboardOverview {
  const result = validateRuntimeSchema("AdminDashboardOverview", value);
  if (!result.valid) {
    throw new Error(
      `看板响应不符合接口契约：${result.path} (${result.reason})`
    );
  }
  return value as AdminDashboardOverview;
}
