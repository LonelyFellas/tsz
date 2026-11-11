import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import type { ReactNode } from "react";

dayjs.locale("zh-cn");
/** Central configuration for the new Ant Design admin surface. */
export function AntProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{ token: { colorPrimary: "#2053FF" } }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
