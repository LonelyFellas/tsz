import { Button } from "@mui/material";
import { PageStatus } from "@/components/PageStatus";
import { Link } from "react-router-dom";
import { FullscreenCenter } from "@/layouts/FullscreenCenter";

// 404 页：保留用户请求的错误 URL（不再静默重定向到首页），把坏链暴露出来而非掩盖。
export function NotFoundPage() {
  return (
    <FullscreenCenter>
      <PageStatus
        title="页面不存在"
        description="你访问的地址有误或该页面已被移除。"
        action={
          <Link to="/">
            <Button variant="contained">返回首页</Button>
          </Link>
        }
      />
    </FullscreenCenter>
  );
}
