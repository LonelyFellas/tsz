import { Button, Result } from "antd";
import { Link } from "react-router-dom";
import { FullscreenCenter } from "@/layouts/FullscreenCenter";

// 404 页：保留用户请求的错误 URL（不再静默重定向到首页），把坏链暴露出来而非掩盖。
export function NotFoundPage() {
  return (
    <FullscreenCenter>
      <Result
        status="404"
        title="页面不存在"
        subTitle="你访问的地址有误或该页面已被移除。"
        extra={
          <Link to="/">
            <Button type="primary">返回首页</Button>
          </Link>
        }
      />
    </FullscreenCenter>
  );
}
