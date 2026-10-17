import { restoreInitialSession } from "./lib/auth";

// 与脚本执行/水合并行恢复；旋转锁、请求去重和失败状态仍由共享内核处理。
void restoreInitialSession().catch(() => {
  // 连接错误已写入 store，SessionRestorer 保留提示和重试入口。
});
