import { Button } from "@tsz/ui/components";
import { Link } from "react-router-dom";

// 404 页：保留用户请求的错误 URL（不再静默重定向到首页），把坏链暴露出来而非掩盖。
export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted px-4 text-center">
      <p className="text-5xl font-bold text-primary">404</p>
      <h1 className="text-xl font-semibold text-foreground">页面不存在</h1>
      <p className="text-sm text-muted-foreground">
        你访问的地址有误或该页面已被移除。
      </p>
      <Button asChild className="rounded-full">
        <Link to="/">返回首页</Link>
      </Button>
    </div>
  );
}
